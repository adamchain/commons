import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CSSProperties, ReactNode } from "react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import {
  ALL_INTERESTS,
  AVATAR_PRESETS,
  INTEREST_LABELS,
  type AvatarStyle,
  type InterestTag,
  type MeDTO,
  type NeighborhoodDTO,
} from "../types/shared";

type Step = "phone" | "code" | "admin_choice" | "location" | "interests" | "profile";

export function OnboardingPage() {
  const { user, refreshUser, setUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(() => pickInitial(user));
  const [phoneNumber, setPhoneNumber] = useState("");
  const [smsConfigured, setSmsConfigured] = useState<boolean | null>(null);
  /** Set after requesting a code; drives code length rules (Verify vs local dev). */
  const [authMode, setAuthMode] = useState<"verify" | "dev" | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const lastAutoSubmittedCode = useRef<string | null>(null);
  const verifyInFlight = useRef(false);

  // If logged-in user lands here with onboarding done, send them home.
  useEffect(() => {
    if (user?.onboardingComplete) navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    if (step !== "phone" && step !== "code") return;
    if (user.canAccessAdmin && sessionStorage.getItem("commons_pending_admin_choice") === "1") {
      setStep("admin_choice");
      return;
    }
    setStep(pickInitial(user));
  }, [user, step]);

  useEffect(() => {
    const formatted = formatPhoneInput(phoneNumber);
    if (formatted !== phoneNumber) {
      setPhoneNumber(formatted);
    }
  }, [phoneNumber]);

  useEffect(() => {
    if (step !== "code" || busy) return;
    if (code.length !== 6) {
      lastAutoSubmittedCode.current = null;
      return;
    }
    if (lastAutoSubmittedCode.current === code) return;
    lastAutoSubmittedCode.current = code;
    void verifyCode();
  }, [step, code, busy]);

  async function requestCode() {
    setError(null);
    setBusy(true);
    try {
      const result = await api<{
        phoneNumber: string;
        smsConfigured: boolean;
        authMode?: "verify" | "dev";
      }>("/api/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      });
      setPhoneNumber(result.phoneNumber);
      setSmsConfigured(result.smsConfigured);
      setAuthMode(result.authMode ?? (result.smsConfigured ? "verify" : "dev"));
      setStep("code");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (verifyInFlight.current) return;
    verifyInFlight.current = true;
    setError(null);
    setBusy(true);
    try {
      const me = await api<MeDTO>("/api/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({ phoneNumber, code }),
      });
      setUser(me);
      if (me.canAccessAdmin) {
        sessionStorage.setItem("commons_pending_admin_choice", "1");
        setStep("admin_choice");
      } else {
        setStep(pickInitial(me));
      }
    } catch (e) {
      setError(formatError(e));
    } finally {
      verifyInFlight.current = false;
      setBusy(false);
    }
  }

  async function patchMe(patch: Partial<MeDTO>) {
    const me = await api<MeDTO>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setUser(me);
    return me;
  }

  if (step === "phone") {
    return (
      <OnboardingShell landing title="" subtitle="Plans, made together.">
        <input
          className="onboarding-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 555-0100"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(formatPhoneInput(e.target.value))}
        />
        {error && <div className="onboarding-error">{error}</div>}
        <button className="btn-primary btn-block" disabled={busy || !phoneNumber} onClick={requestCode}>
          {busy ? "Sending…" : "Send code"}
        </button>
        <p className="onboarding-fineprint">
          {smsConfigured === false
            ? "Local dev: the server prints the code in its terminal — check the API console."
            : smsConfigured === true
              ? "You'll get a text with your verification code (Twilio Verify). Message rates may apply."
              : "We'll text you a code to verify your number."}
        </p>
      </OnboardingShell>
    );
  }
  if (step === "code") {
    return (
      <OnboardingShell landing title="Enter the code" subtitle={`Sent to ${phoneNumber}`}>
        <input
          className="onboarding-input onboarding-input-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={authMode === "dev" ? 6 : 10}
          placeholder={authMode === "dev" ? "123456" : "Code"}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        {error && <div className="onboarding-error">{error}</div>}
        {smsConfigured === false && (
          <p className="onboarding-fineprint">Use the code from the server terminal (local dev).</p>
        )}
        <button
          className="btn-primary btn-block"
          disabled={
            busy ||
            (authMode === "dev" ? code.length !== 6 : code.length < 4 || code.length > 10)
          }
          onClick={verifyCode}
        >
          {busy ? "Verifying…" : "Verify"}
        </button>
        <button className="btn-link" onClick={() => setStep("phone")} type="button">
          Wrong number?
        </button>
      </OnboardingShell>
    );
  }
  if (step === "admin_choice" && user?.canAccessAdmin) {
    return (
      <OnboardingShell title="Admin access" subtitle="You signed in with a number that can open the Commons admin dashboard.">
        <p className="onboarding-fineprint" style={{ textAlign: "center", marginBottom: "1rem" }}>
          Use <strong>Commons as a member</strong> for plans and chat, or <strong>Admin</strong> for metrics and user tools.
        </p>
        <button
          className="btn-primary btn-block"
          type="button"
          onClick={() => {
            sessionStorage.removeItem("commons_pending_admin_choice");
            setStep(pickInitial(user));
          }}
        >
          Continue as member
        </button>
        <button
          className="btn-secondary btn-block"
          type="button"
          style={{ marginTop: "0.75rem" }}
          onClick={() => {
            sessionStorage.removeItem("commons_pending_admin_choice");
            navigate("/admin", { replace: true });
          }}
        >
          Open admin dashboard
        </button>
      </OnboardingShell>
    );
  }
  if (!user) {
    return <OnboardingShell title="Loading…" subtitle="" />;
  }
  if (step === "location") {
    return (
      <LocationStep
        onCoords={setCoords}
        coords={coords}
        onSave={async (neighborhoodIds) => {
          const primary = neighborhoodIds[0] ?? null;
          await patchMe({
            neighborhoodIds,
            neighborhoodId: primary,
          });
          setStep("interests");
        }}
      />
    );
  }
  if (step === "interests") {
    return (
      <InterestsStep
        me={user}
        onSave={async (interests) => {
          await patchMe({ interests });
          setStep("profile");
        }}
      />
    );
  }
  if (step === "profile") {
    return (
      <ProfileStep
        me={user}
        onSave={async (firstName, avatarSeed, avatarStyle, avatarPhotoDataUrl, avatarParams) => {
          await patchMe({
            firstName,
            avatarSeed,
            avatarStyle,
            avatarPhotoDataUrl: avatarPhotoDataUrl ?? undefined,
            avatarParams: avatarParams ?? undefined,
            onboardingComplete: true,
          });
          await refreshUser();
          navigate("/", { replace: true });
        }}
      />
    );
  }
  return null;
}

function pickInitial(user: MeDTO | null): Step {
  if (!user) return "phone";
  if (user.onboardingComplete) return "phone";
  const hoods =
    user.neighborhoodIds?.length ? user.neighborhoodIds : user.neighborhoodId ? [user.neighborhoodId] : [];
  if (hoods.length === 0) return "location";
  if (user.interests.length < 2) return "interests";
  return "profile";
}

function formatError(e: unknown): string {
  if (e instanceof Error) {
    try {
      const parsed = JSON.parse(e.message);
      if (typeof parsed?.error === "string") return parsed.error;
    } catch { /* fall through */ }
    return e.message;
  }
  return "Something went wrong";
}

/** Formats US numbers as users type, while still allowing +country input. */
function formatPhoneInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const inner = trimmed.slice(1).replace(/\D/g, "").slice(0, 15);
    // Pretty NANP: +1 (484) 571-2062
    if (inner.length === 11 && inner.startsWith("1")) {
      const n = inner.slice(1);
      if (n.length === 10) {
        return `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
      }
    }
    return `+${inner}`;
  }
  let digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Floating activity icons — same vocabulary as LoadingScreen to make sign-in feel continuous. */
const ONBOARDING_ICONS: Array<{
  key: string;
  top: string;
  left: string;
  size: number;
  delay: string;
  duration: string;
  rotate: string;
  svg: ReactNode;
}> = [
  {
    key: "coffee", top: "10%", left: "7%", size: 52, delay: "0s", duration: "5.5s", rotate: "-8deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
        <path d="M6 2v3" /><path d="M10 2v3" /><path d="M14 2v3" />
      </svg>
    ),
  },
  {
    key: "mountain", top: "18%", left: "82%", size: 64, delay: "0.6s", duration: "6.4s", rotate: "12deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
      </svg>
    ),
  },
  {
    key: "music", top: "72%", left: "12%", size: 50, delay: "0.3s", duration: "5.2s", rotate: "-14deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    key: "pizza", top: "78%", left: "78%", size: 56, delay: "1.8s", duration: "6.8s", rotate: "16deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m2 16 20 6-6-20A20 20 0 0 0 2 16" /><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4" />
      </svg>
    ),
  },
  {
    key: "pin", top: "44%", left: "90%", size: 38, delay: "1.4s", duration: "5.8s", rotate: "-6deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    key: "wine", top: "42%", left: "4%", size: 40, delay: "0.4s", duration: "5.4s", rotate: "10deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 22h8" /><path d="M12 11v11" /><path d="M19 3H5l1.4 7.5a6 6 0 0 0 11.2 0Z" />
      </svg>
    ),
  },
];

function OnboardingShell({
  title,
  subtitle,
  children,
  landing = false,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
  /** Login/phone-entry styling — floating icons + big wordmark, like LoadingScreen. */
  landing?: boolean;
}) {
  return (
    <div className={`onboarding-shell ${landing ? "onboarding-shell--landing" : ""}`}>
      {landing && (
        <div className="loader-icons" aria-hidden="true">
          {ONBOARDING_ICONS.map((icon) => {
            const style: CSSProperties & { ["--rot"]?: string } = {
              top: icon.top,
              left: icon.left,
              width: icon.size,
              height: icon.size,
              animationDelay: icon.delay,
              animationDuration: icon.duration,
              ["--rot"]: icon.rotate,
            };
            return (
              <span key={icon.key} className="loader-icon" style={style}>
                {icon.svg}
              </span>
            );
          })}
        </div>
      )}
      <div className={`onboarding-card ${landing ? "onboarding-card--landing" : ""}`}>
        {landing ? (
          <h1 className="loader-wordmark">COMMONS</h1>
        ) : (
          <div className="onboarding-brand">COMMONS</div>
        )}
        {title && <h2 className="onboarding-title">{title}</h2>}
        {subtitle && <p className="onboarding-subtitle">{subtitle}</p>}
        <div className="onboarding-body">{children}</div>
      </div>
    </div>
  );
}

function LocationStep({
  coords,
  onCoords,
  onSave,
}: {
  coords: { lat: number; lng: number } | null;
  onCoords: (c: { lat: number; lng: number } | null) => void;
  onSave: (neighborhoodIds: string[]) => Promise<void>;
}) {
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [permissionState, setPermissionState] = useState<"idle" | "asking" | "granted" | "denied">(
    coords ? "granted" : "idle"
  );

  useEffect(() => {
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, []);

  function shareLocation() {
    if (!("geolocation" in navigator)) {
      setPermissionState("denied");
      return;
    }
    setPermissionState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setPermissionState("granted");
      },
      () => {
        setPermissionState("denied");
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  // Sort by distance to user if we have coords; otherwise alphabetical.
  const sorted = useMemo(() => {
    const list = [...neighborhoods];
    if (coords) {
      list.sort((a, b) => distance(coords, a) - distance(coords, b));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((n) => n.name.toLowerCase().includes(q) || n.metro.toLowerCase().includes(q));
  }, [neighborhoods, coords, filter]);

  if (permissionState === "idle") {
    return (
      <OnboardingShell title="Share your location" subtitle="So we can show you what's happening nearby.">
        <button className="btn-primary btn-block" onClick={shareLocation}>
          Allow location access
        </button>
        <button className="btn-link" type="button" onClick={() => setPermissionState("denied")}>
          Skip — I'll pick manually
        </button>
      </OnboardingShell>
    );
  }
  if (permissionState === "asking") {
    return <OnboardingShell title="Getting your location…" subtitle="" />;
  }

  return (
    <OnboardingShell
      title={coords ? "Where do you spend time?" : "Where do you hang out?"}
      subtitle={coords ? "Sorted by closest to you. Tap all that apply." : "Pick every area that fits — we’ll personalize your feed."}
    >
      <input
        className="onboarding-input"
        placeholder="Search…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="neighborhood-list">
        {sorted.map((n) => {
          const on = selected.has(n.id);
          return (
            <li key={n.id}>
              <button
                type="button"
                className={`neighborhood-row ${on ? "is-selected" : ""}`}
                disabled={busy}
                onClick={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(n.id)) next.delete(n.id);
                    else next.add(n.id);
                    return next;
                  });
                }}
              >
                <span className="neighborhood-name">{n.name}</span>
                <span className="neighborhood-metro">
                  {coords && n.lat !== undefined && n.lng !== undefined
                    ? `${formatMiles(distance(coords, n))} away`
                    : n.metro}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        className="btn-primary btn-block"
        disabled={busy || selected.size === 0}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave([...selected]);
          } finally {
            setBusy(false);
          }
        }}
      >
        Continue
      </button>
    </OnboardingShell>
  );
}

function InterestsStep({ me, onSave }: { me: MeDTO; onSave: (interests: InterestTag[]) => Promise<void> }) {
  const [picked, setPicked] = useState<InterestTag[]>(me.interests);
  const [busy, setBusy] = useState(false);

  function toggle(t: InterestTag) {
    if (picked.includes(t)) {
      setPicked(picked.filter((x) => x !== t));
    } else {
      setPicked([...picked, t]);
    }
  }

  return (
    <OnboardingShell title="What are you into?" subtitle="Pick as many as you like — we’ll tune your feed from day one.">
      <div className="interest-grid">
        {ALL_INTERESTS.map((t) => {
          const isPicked = picked.includes(t);
          return (
            <button
              key={t}
              type="button"
              className={`interest-tile ${isPicked ? "is-picked" : ""}`}
              onClick={() => toggle(t)}
            >
              <span className="interest-label">{INTEREST_LABELS[t]}</span>
            </button>
          );
        })}
      </div>
      <button
        className="btn-primary btn-block"
        disabled={busy || picked.length < 2}
        onClick={async () => { setBusy(true); await onSave(picked); }}
      >
        Next · {picked.length} picked
      </button>
    </OnboardingShell>
  );
}

function ProfileStep({
  me,
  onSave,
}: {
  me: MeDTO;
  onSave: (
    firstName: string,
    seed: string,
    style: AvatarStyle,
    photoDataUrl: string | null,
    avatarParams: string | null,
  ) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(me.firstName);
  const [photo, setPhoto] = useState<string | null>(me.avatarPhotoDataUrl ?? null);
  const [avatarParams, setAvatarParams] = useState<string | null>(me.avatarParams ?? null);
  const [busy, setBusy] = useState(false);

  // Photo and preset are mutually exclusive — picking one clears the other.
  function pickPhoto(dataUrl: string) {
    setPhoto(dataUrl);
    setAvatarParams(null);
  }
  function pickPreset(params: string) {
    setAvatarParams((cur) => (cur === params ? null : params));
    if (avatarParams !== params) setPhoto(null);
  }

  return (
    <OnboardingShell title="Your profile" subtitle="A photo, a character, or your initials.">
      <div className="profile-avatar-preview">
        <Avatar
          seed={me.avatarSeed}
          style={me.avatarStyle}
          photoDataUrl={photo ?? undefined}
          params={avatarParams ?? undefined}
          name={firstName.trim() || undefined}
          size="xl"
        />
      </div>

      <input
        className="onboarding-input"
        placeholder="First name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
      />

      <details className="profile-photo-picker">
        <summary>Upload a photo</summary>
        <input
          type="file"
          accept="image/*"
          className="onboarding-input"
          style={{ marginTop: 8 }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            void fileToResizedDataUrl(f).then(pickPhoto).catch(() => undefined);
            e.target.value = "";
          }}
        />
      </details>

      <div className="profile-preset-block">
        <p className="profile-emoji-label">Or pick a character</p>
        <div className="profile-preset-grid">
          {AVATAR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`profile-preset-pick ${avatarParams === p.params ? "is-selected" : ""}`}
              onClick={() => pickPreset(p.params)}
              aria-pressed={avatarParams === p.params}
              aria-label={p.label}
              title={p.label}
            >
              <Avatar seed={me.avatarSeed} style="avataaars" params={p.params} size="md" />
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn-primary btn-block"
        disabled={busy || !firstName.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave(firstName.trim(), me.avatarSeed, me.avatarStyle, photo, avatarParams);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : "Finish"}
      </button>
      {!firstName.trim() && <p className="onboarding-fineprint">Add your first name to continue.</p>}
    </OnboardingShell>
  );
}

function distance(a: { lat: number; lng: number }, b: { lat?: number; lng?: number }): number {
  if (b.lat === undefined || b.lng === undefined) return Infinity;
  // Equirectangular approximation in miles — fine for sorting at city scale.
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x = (toRad(b.lng) - toRad(a.lng)) * Math.cos(toRad((a.lat + b.lat) / 2));
  const y = toRad(b.lat) - toRad(a.lat);
  const miles = Math.sqrt(x * x + y * y) * 3958.8;
  return miles;
}

function formatMiles(miles: number): string {
  if (!isFinite(miles)) return "";
  if (miles < 0.1) return "<0.1 mi";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}
