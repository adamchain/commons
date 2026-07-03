import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CSSProperties, ReactNode } from "react";
import { api } from "../api/http";
import { setAuthToken, clearAuthToken } from "../api/authToken";
import { Avatar } from "../components/Avatar";
import { AvatarCropModal } from "../components/AvatarCropModal";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { getCurrentCoords } from "../lib/geolocate";
import { LoadingScreen } from "../components/LoadingScreen";
import { LegalContent } from "../components/LegalContent";
import { LEGAL_DOCS } from "../content/legal";
import wordmark from "../assets/wordmark.png";
import {
  ALL_INTERESTS,
  INTEREST_EMOJI,
  INTEREST_LABELS,
  AGE_RANGE_LABELS,
  ALL_AGE_RANGES,
  type AgeRange,
  type AvatarStyle,
  type InterestTag,
  type MeDTO,
  type NeighborhoodDTO,
} from "../types/shared";

// Public legal docs — update these to the live URLs before launch.
const TERMS_URL = "https://jointhecommons.com/terms";
const PRIVACY_URL = "https://jointhecommons.com/privacy";

// TEMP launch gate: after verifying their phone, every (non-admin) member must
// enter this exclusive code to finalize account setup. Stored client-side once
// passed so it isn't re-prompted on refresh. Remove this gate (the EXCLUSIVE_CODE
// constant, the "gate" Step, its render block, and the gate branch in
// pickInitial) when the invite-only launch period ends.
const EXCLUSIVE_CODE = "commonsphl";
const GATE_STORAGE_KEY = "commons_gate_ok";

function isGatePassed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(GATE_STORAGE_KEY) === "1";
}

type Step =
  | "phone"
  | "code"
  | "gate"
  | "admin_choice"
  | "location"
  | "interests"
  | "profile"
  | "age"
  | "legal"
  | "guidelines";

export function OnboardingPage() {
  const { user, refreshUser, setUser } = useAuth();
  const navigate = useNavigate();
  // TEMP launch gate: whether this device has already cleared the access-code
  // step. Read once so a refresh mid-onboarding doesn't re-prompt or bypass it.
  const [gatePassed, setGatePassed] = useState<boolean>(isGatePassed);
  const [step, setStep] = useState<Step>(() => pickInitial(user, gatePassed));
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
  // Access code for the launch gate. Accepts the shared exclusive code OR a
  // personal invite code from an existing member. Prefilled from ?invite= on a
  // share link so invite-link users just tap Continue.
  const [accessCode, setAccessCode] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("invite") ?? "";
  });

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
    setStep(pickInitial(user, gatePassed));
  }, [user, step, gatePassed]);

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
      const result = await api<MeDTO & { token?: string }>("/api/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({ phoneNumber, code }),
      });
      const { token, ...me } = result;
      if (token) await setAuthToken(token);
      setUser(me);
      if (me.canAccessAdmin) {
        sessionStorage.setItem("commons_pending_admin_choice", "1");
        setStep("admin_choice");
      } else {
        // Non-admins hit the launch gate next (unless already cleared on this
        // device) — pickInitial routes them to "gate" when !gatePassed.
        setStep(pickInitial(me, gatePassed));
      }
    } catch (e) {
      setError(formatError(e));
    } finally {
      verifyInFlight.current = false;
      setBusy(false);
    }
  }

  // TEMP launch gate: accept the shared exclusive code, or redeem a personal
  // invite code from an existing member. Either one clears the gate for this
  // device and lets account setup continue.
  async function submitGate() {
    const entered = accessCode.trim();
    if (!entered) return;
    setError(null);
    if (entered.toLowerCase() === EXCLUSIVE_CODE) {
      passGate();
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/redeem-code", {
        method: "POST",
        body: JSON.stringify({ code: entered }),
      });
      passGate();
    } catch {
      setError("That code isn't valid. Enter your access code, or an invite code from a member.");
    } finally {
      setBusy(false);
    }
  }

  function passGate() {
    if (typeof window !== "undefined") localStorage.setItem(GATE_STORAGE_KEY, "1");
    setGatePassed(true);
    setError(null);
    setStep(pickInitial(user, true));
  }

  async function patchMe(patch: Partial<MeDTO> & { ageConfirmed?: boolean }) {
    const me = await api<MeDTO>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setUser(me);
    return me;
  }

  if (step === "phone") {
    return (
      <OnboardingShell landing title="" subtitle="A place for plans meant to be shared.">
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
          {busy ? "Sending…" : "Get started"}
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
      <OnboardingShell title="Check your texts." subtitle={`Sent to ${phoneNumber}`}>
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
  if (step === "gate") {
    return (
      <OnboardingShell
        title="One last step."
        subtitle="Commons is invite-only for now. Enter your access code, or an invite code from a member, to finish setting up your account."
        showExit
      >
        <input
          className="onboarding-input"
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={32}
          placeholder="Access code"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitGate();
          }}
          autoFocus
        />
        {error && <div className="onboarding-error">{error}</div>}
        <button
          className="btn-primary btn-block"
          disabled={busy || !accessCode.trim()}
          onClick={() => void submitGate()}
        >
          {busy ? "Checking…" : "Continue"}
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
            setStep(pickInitial(user, gatePassed));
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
    return <LoadingScreen simple tagline="A place for plans meant to be shared." />;
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
        onSkip={() => setStep("interests")}
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
        onSkip={() => setStep("profile")}
        onBack={() => setStep("location")}
      />
    );
  }
  if (step === "profile") {
    return (
      <ProfileStep
        me={user}
        onSave={async (firstName, lastName, avatarSeed, avatarStyle, avatarPhotoDataUrl, avatarParams) => {
          await patchMe({
            firstName,
            lastName,
            avatarSeed,
            avatarStyle,
            avatarPhotoDataUrl: avatarPhotoDataUrl ?? undefined,
            avatarParams: avatarParams ?? undefined,
          });
          setStep("age");
        }}
        onBack={() => setStep("interests")}
      />
    );
  }
  if (step === "age") {
    return (
      <AgeStep
        me={user}
        onSave={async (ageRange) => {
          await patchMe({ ageRange, ageConfirmed: true });
          setStep("legal");
        }}
        onBack={() => setStep("profile")}
      />
    );
  }
  if (step === "legal") {
    return (
      <LegalConsentStep
        onBack={() => setStep("age")}
        onAgree={async () => {
          // termsAccepted/privacyAccepted are server-side action flags (they
          // stamp *AcceptedAt), not MeDTO fields — call the endpoint directly.
          const me = await api<MeDTO>("/api/auth/me", {
            method: "PATCH",
            body: JSON.stringify({ termsAccepted: true, privacyAccepted: true }),
          });
          setUser(me);
          setStep("guidelines");
        }}
      />
    );
  }
  if (step === "guidelines") {
    return (
      <GuidelinesStep
        onBack={() => setStep("legal")}
        onAgree={async () => {
          await api<MeDTO>("/api/auth/me", {
            method: "PATCH",
            body: JSON.stringify({ guidelinesAcknowledged: true, onboardingComplete: true }),
          });
          await refreshUser();
          navigate("/", { replace: true });
        }}
      />
    );
  }
  return null;
}

function pickInitial(user: MeDTO | null, gatePassed: boolean): Step {
  if (!user) return "phone";
  if (user.onboardingComplete) return "phone";
  // TEMP launch gate: members must clear the access-code step before any of the
  // profile-setup steps. Admins are exempt so the operator can't lock themselves
  // out. Drop this check when the invite-only launch period ends.
  if (!gatePassed && !user.canAccessAdmin) return "gate";
  const hoods =
    user.neighborhoodIds?.length ? user.neighborhoodIds : user.neighborhoodId ? [user.neighborhoodId] : [];
  if (hoods.length === 0) return "location";
  if (user.interests.length < 1) return "interests";
  if (!user.firstName.trim()) return "profile";
  if (!user.ageConfirmedAt) return "age";
  if (!user.termsAcceptedAt || !user.privacyAcceptedAt) return "legal";
  if (!user.guidelinesAcknowledgedAt) return "guidelines";
  return "guidelines";
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
  onBack,
  showExit = false,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
  /** Login/phone-entry styling — floating icons + big wordmark, like LoadingScreen. */
  landing?: boolean;
  /** When provided, renders a back arrow to return to the previous step. */
  onBack?: () => void;
  /** Renders an "Exit" link that signs out and returns to the front door. Use on
   *  post-verification setup steps so a user can bail out of onboarding. */
  showExit?: boolean;
}) {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  // Onboarding can't be left "half done" — the route guard bounces incomplete
  // users straight back here — so the honest exit is a sign-out that returns to
  // the marketing landing (web) or the start of onboarding (native).
  async function handleExit() {
    const ok = window.confirm("Exit setup? You'll be signed out and can finish anytime.");
    if (!ok) return;
    sessionStorage.removeItem("commons_pending_admin_choice");
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* best-effort — sign out locally regardless */
    }
    await clearAuthToken();
    setUser(null);
    navigate(isNative() ? "/onboarding" : "/welcome", { replace: true });
  }

  return (
    <div className={`onboarding-shell ${landing ? "onboarding-shell--landing" : ""}`}>
      {onBack && (
        <button type="button" className="onboarding-back" onClick={onBack} aria-label="Back">
          ← Back
        </button>
      )}
      {showExit && (
        <button
          type="button"
          className="onboarding-exit"
          onClick={() => void handleExit()}
          aria-label="Exit setup"
        >
          Exit
        </button>
      )}
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
      <div
        className={`onboarding-card ${landing ? "onboarding-card--landing" : ""} ${
          !landing && (onBack || showExit) ? "onboarding-card--has-nav" : ""
        }`}
      >
        {landing ? (
          <h1 className="loader-wordmark">COMMONS</h1>
        ) : (
          <img src={wordmark} alt="COMMONS" className="onboarding-brand-img" />
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
  onSkip,
}: {
  coords: { lat: number; lng: number } | null;
  onCoords: (c: { lat: number; lng: number } | null) => void;
  onSave: (neighborhoodIds: string[]) => Promise<void>;
  onSkip: () => void;
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

  async function shareLocation() {
    setPermissionState("asking");
    const coords = await getCurrentCoords({ timeoutMs: 8000 });
    if (coords) {
      onCoords(coords);
      setPermissionState("granted");
    } else {
      setPermissionState("denied");
    }
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
      <OnboardingShell title="Share your location" subtitle="So we can show you what's happening nearby." showExit>
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
      title="Where do you spend time?"
      subtitle={coords ? "Pick your neighborhoods — we’ll show you what’s happening nearby." : "Pick every area that fits — we’ll personalize your feed."}
      showExit
    >
      <input
        className="onboarding-input"
        placeholder="Search neighborhoods…"
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
                <span className="neighborhood-name">
                  {on && <span className="neighborhood-check" aria-hidden="true">✓</span>}
                  {n.name}
                </span>
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
        {selected.size > 0 ? `Continue · ${selected.size} picked` : "Continue"}
      </button>
      <button className="btn-link" type="button" disabled={busy} onClick={onSkip}>
        Skip for now
      </button>
    </OnboardingShell>
  );
}

/**
 * Scroll-to-bottom consent gate for the Terms of Service and Privacy Policy.
 * Each document must be scrolled to its end before the "I agree" checkbox
 * unlocks — required for new users during onboarding. Reading state is tracked
 * per document and persists across tab switches.
 */
function LegalConsentStep({
  onAgree,
  onBack,
}: {
  onAgree: () => Promise<void>;
  onBack?: () => void;
}) {
  const [active, setActive] = useState<"terms" | "privacy">("terms");
  const [read, setRead] = useState<{ terms: boolean; privacy: boolean }>({
    terms: false,
    privacy: false,
  });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const doc = LEGAL_DOCS[active];
  const bothRead = read.terms && read.privacy;

  // Mark the active doc read once its panel is scrolled to (or already sits at)
  // the bottom. A generous tolerance keeps short viewports / momentum scroll
  // from getting stuck one pixel shy of the end.
  function markIfAtBottom() {
    const el = panelRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 28;
    if (atBottom) setRead((r) => (r[active] ? r : { ...r, [active]: true }));
  }

  // On tab switch, reset scroll to the top and re-measure after layout settles —
  // a document short enough to fit without scrolling counts as read immediately.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.scrollTop = 0;
    const id = window.setTimeout(markIfAtBottom, 60);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <OnboardingShell
      title="The legal bit."
      subtitle="Please read our Terms and Privacy Policy. Scroll to the bottom of each to continue."
      onBack={onBack}
      showExit
    >
      <div className="legal-consent-tabs">
        {(["terms", "privacy"] as const).map((slug) => (
          <button
            key={slug}
            type="button"
            className={`legal-consent-tab ${active === slug ? "is-active" : ""}`}
            onClick={() => setActive(slug)}
          >
            {read[slug] && (
              <span className="legal-consent-tab-check" aria-hidden="true">
                ✓
              </span>
            )}
            {LEGAL_DOCS[slug].title}
          </button>
        ))}
      </div>

      <div className="legal-consent-panel" ref={panelRef} onScroll={markIfAtBottom}>
        <LegalContent doc={doc} />
        {!read[active] && <div className="legal-consent-scrollhint">Scroll to continue ↓</div>}
      </div>

      <p className={`legal-consent-status ${bothRead ? "is-done" : ""}`}>
        {bothRead
          ? "Thanks for reading both documents."
          : read.terms
            ? "Now read the Privacy Policy."
            : read.privacy
              ? "Now read the Terms of Service."
              : "Scroll to the bottom of each document to continue."}
      </p>

      <p className="onboarding-women-note">
        COMMONS is built for women. By joining, you&rsquo;re confirming that you identify as a woman.
      </p>

      <label className="guidelines-agree">
        <input
          type="checkbox"
          checked={agreed}
          disabled={!bothRead}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>I have read and agree to the Terms of Service and Privacy Policy.</span>
      </label>

      <button
        type="button"
        className="btn-primary btn-block"
        disabled={busy || !bothRead || !agreed}
        onClick={async () => {
          setBusy(true);
          try {
            await onAgree();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "One sec…" : "Agree & continue"}
      </button>
    </OnboardingShell>
  );
}

function GuidelinesStep({ onAgree, onBack }: { onAgree: () => Promise<void>; onBack?: () => void }) {
  const [busy, setBusy] = useState(false);
  // Explicit agreement gate — the user must tick the box before continuing.
  const [agreed, setAgreed] = useState(false);
  return (
    <OnboardingShell
      title="Before you hit the feed."
      subtitle="A quick read. We mean it."
      onBack={onBack}
      showExit
    >
      <ul className="guidelines-list">
        <li>
          <span className="guidelines-icon" aria-hidden="true">🤝</span>
          <div>
            <strong>Show up kindly.</strong>
            <p>Respect the people you meet and the city you’re in. No harassment, hate, or bigotry.</p>
          </div>
        </li>
        <li>
          <span className="guidelines-icon" aria-hidden="true">📅</span>
          <div>
            <strong>Show up when you say you will.</strong>
            <p>If something comes up, drop out early — don’t ghost. Someone else might want your spot.</p>
          </div>
        </li>
        <li>
          <span className="guidelines-icon" aria-hidden="true">📍</span>
          <div>
            <strong>Keep it real.</strong>
            <p>Be yourself. Plans, photos, and profiles should reflect the actual you.</p>
          </div>
        </li>
        <li>
          <span className="guidelines-icon" aria-hidden="true">🛟</span>
          <div>
            <strong>Look out for each other.</strong>
            <p>Meet in public for first plans. Report anything that feels off. Be 18+ and keep it legal.</p>
          </div>
        </li>
        <li>
          <span className="guidelines-icon" aria-hidden="true">🏙️</span>
          <div>
            <strong>Love the city.</strong>
            <p>Support local spots, tip well, and leave places better than you found them.</p>
          </div>
        </li>
      </ul>

      <label className="guidelines-agree">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          I agree to the Commons community guidelines, and the{" "}
          <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms &amp; Conditions</a>{" "}
          and <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>.
        </span>
      </label>

      <button
        type="button"
        className="btn-primary btn-block"
        disabled={busy || !agreed}
        onClick={async () => {
          setBusy(true);
          try {
            await onAgree();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "One sec…" : "Agree & continue"}
      </button>

      <p className="onboarding-guidelines-links">
        <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms &amp; Conditions</a>
        <span aria-hidden="true"> · </span>
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>
      </p>
    </OnboardingShell>
  );
}

function InterestsStep({ me, onSave, onSkip, onBack }: { me: MeDTO; onSave: (interests: InterestTag[]) => Promise<void>; onSkip: () => void; onBack?: () => void }) {
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
    <OnboardingShell title="What are you into?" subtitle="Pick what you’re into. Your feed does the rest." onBack={onBack} showExit>
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
              <span className="interest-emoji" aria-hidden="true">{INTEREST_EMOJI[t]}</span>
              <span className="interest-label">{INTEREST_LABELS[t]}</span>
            </button>
          );
        })}
      </div>
      <button
        className="btn-primary btn-block"
        disabled={busy || picked.length < 1}
        onClick={async () => { setBusy(true); await onSave(picked); }}
      >
        Next · {picked.length} picked
      </button>
      <button className="btn-link" type="button" disabled={busy} onClick={onSkip}>
        Skip for now
      </button>
    </OnboardingShell>
  );
}

function ProfileStep({
  me,
  onSave,
  onBack,
}: {
  me: MeDTO;
  onSave: (
    firstName: string,
    lastName: string,
    seed: string,
    style: AvatarStyle,
    photoDataUrl: string | null,
    avatarParams: string | null,
  ) => Promise<void>;
  onBack?: () => void;
}) {
  const [firstName, setFirstName] = useState(me.firstName);
  const [lastName, setLastName] = useState(me.lastName ?? "");
  const [photo, setPhoto] = useState<string | null>(me.avatarPhotoDataUrl ?? null);
  const [avatarParams, setAvatarParams] = useState<string | null>(me.avatarParams ?? null);
  const [busy, setBusy] = useState(false);

  // COMMONS is built for women, so the illustrated placeholder (shown before a
  // photo is added and before a name is typed) should present as a woman:
  // long hairstyles only, no facial hair.
  const FEMININE_AVATAR_PARAMS =
    "facialHairProbability=0&top=bob,bun,curly,curvy,longButNotTooLong,miaWallace,straight01,straight02,straightAndStrand,bigHair";
  // Raw, uncropped image waiting on the crop+confirm step. Nothing is committed
  // to `photo` until the user confirms the crop.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // A real photo is the only way to set a picture now; clear any legacy preset
  // avatar the moment one is chosen.
  function pickPhoto(dataUrl: string) {
    setPhoto(dataUrl);
    setAvatarParams(null);
  }

  // Tapping the circle opens the photo library. On native we get a data URL
  // straight back; on web we trigger the hidden file input. Either way the raw
  // image goes through the crop modal before it's locked in.
  async function openPhotoPicker() {
    if (isNative()) {
      try {
        const dataUrl = await pickPhotoNative({ maxPx: 1024, quality: 0.92 });
        if (dataUrl) setCropSrc(dataUrl);
      } catch {
        /* user canceled */
      }
    } else {
      fileInputRef.current?.click();
    }
  }

  const canContinue = Boolean(firstName.trim() && lastName.trim() && photo);

  return (
    <OnboardingShell title="Put a face to your name." subtitle="Add a photo and your name to continue." onBack={onBack} showExit>
      <div className="profile-avatar-preview">
        <button
          type="button"
          className="profile-avatar-edit"
          onClick={() => void openPhotoPicker()}
          aria-label={photo ? "Change photo" : "Add a photo"}
        >
          <Avatar
            seed={me.avatarSeed}
            style={me.avatarStyle}
            photoDataUrl={photo ?? undefined}
            params={avatarParams ?? (firstName.trim() ? undefined : FEMININE_AVATAR_PARAMS)}
            name={firstName.trim() || undefined}
            size="xl"
          />
          <span className="profile-avatar-camera" aria-hidden="true">
            <CameraIcon />
          </span>
        </button>
        <span className="profile-avatar-hint">{photo ? "Tap to change photo" : "Tap to add a photo"}</span>
        {/* Hidden web file input — opened via the circle button above. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            void fileToResizedDataUrl(f, 1024, 0.92).then(setCropSrc).catch(() => undefined);
            e.target.value = "";
          }}
        />
      </div>

      <input
        className="onboarding-input"
        placeholder="First name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
      />
      <input
        className="onboarding-input"
        placeholder="Last name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
      />

      <button
        type="button"
        className="btn-primary btn-block"
        disabled={busy || !canContinue}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave(firstName.trim(), lastName.trim(), me.avatarSeed, me.avatarStyle, photo, avatarParams);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : "Finish"}
      </button>
      {!canContinue && (
        <p className="onboarding-fineprint">
          {!firstName.trim()
            ? "Add your first name to continue."
            : !lastName.trim()
              ? "Add your last name to continue."
              : "Add a photo to continue."}
        </p>
      )}

      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={(dataUrl) => {
            pickPhoto(dataUrl);
            setCropSrc(null);
          }}
        />
      )}
    </OnboardingShell>
  );
}

function AgeStep({
  me,
  onSave,
  onBack,
}: {
  me: MeDTO;
  onSave: (ageRange: AgeRange) => Promise<void>;
  onBack?: () => void;
}) {
  const [confirmed, setConfirmed] = useState(Boolean(me.ageConfirmedAt));
  const [ageRange, setAgeRange] = useState<AgeRange | null>(me.ageRange ?? null);
  const [busy, setBusy] = useState(false);

  return (
    <OnboardingShell
      title="Quick age check."
      subtitle="COMMONS is for adults. Pick your age range so we can personalize your feed."
      onBack={onBack}
      showExit
    >
      <label className="guidelines-agree">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>I confirm I am 18 years or older.</span>
      </label>

      <div className="filter-sheet-chips" style={{ marginTop: 16 }}>
        {ALL_AGE_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={`community-chip ${ageRange === r ? "is-active" : ""}`}
            onClick={() => setAgeRange(r)}
          >
            {AGE_RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn-primary btn-block"
        style={{ marginTop: 18 }}
        disabled={busy || !confirmed || !ageRange}
        onClick={async () => {
          if (!ageRange) return;
          setBusy(true);
          try {
            await onSave(ageRange);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : "Continue"}
      </button>
    </OnboardingShell>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
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
