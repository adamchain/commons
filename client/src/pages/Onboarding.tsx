import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { CSSProperties, ReactNode } from "react";
import { Check, Coffee, Flame, MapPin, Star, Wine, type LucideIcon } from "lucide-react";
import { api } from "../api/http";
import { formatPhoneInput, isValidPhoneInput } from "../lib/format";
import { APP_STORE_URL } from "../lib/appStore";
import { setAuthToken } from "../api/authToken";
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
import { interestVisual } from "../lib/interestIcons";
import {
  ALL_INTERESTS,
  INTEREST_LABELS,
  AGE_RANGE_LABELS,
  ALL_AGE_RANGES,
  type AgeRange,
  type AvatarStyle,
  type InterestTag,
  type MeDTO,
  type NeighborhoodDTO,
  type PlanDTO,
} from "../types/shared";

const AGE_ERA_ICONS: Record<AgeRange, LucideIcon> = {
  "18_24": Flame,
  "25_35": Coffee,
  "35_50": Wine,
  "50_plus": Star,
};

// Warm one-time interstitial shown right after onboarding completes (F.1).
// Keyed per account so a new signup always sees it, even on a shared device.
function welcomeSeenKey(userId: string): string {
  return `commons_welcome_seen_${userId}`;
}
function hasSeenWelcome(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(welcomeSeenKey(userId)) === "1";
}
function markWelcomeSeen(userId: string): void {
  if (typeof window !== "undefined") localStorage.setItem(welcomeSeenKey(userId), "1");
}

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
  | "welcome"
  | "download";

/**
 * Handoff from the public event page (PublicEventPage). When a logged-out
 * visitor enters their number on a shared plan link, we request the code there
 * and route into onboarding pre-advanced to the code step — with the gate
 * bypassed (event referral counts as the invite) and a redirect back to the
 * event once setup finishes.
 */
interface OnboardingNavState {
  eventRef?: boolean;
  redirect?: string;
  phoneNumber?: string;
  authMode?: "verify" | "dev";
  smsConfigured?: boolean;
  /** Invite code carried over from a shared plan link (`?invite=CODE`) or a
   *  deep link into `/plans/:id`, prefilled on the launch-gate step. */
  inviteCode?: string;
}

export function OnboardingPage() {
  const { user, refreshUser, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = (location.state ?? null) as OnboardingNavState | null;
  // Event-referred signups bypass the invite-only launch gate and, on finish,
  // route back to the event they came from instead of the home feed.
  const eventRef = Boolean(nav?.eventRef);
  const redirectTo = nav?.redirect && nav.redirect.startsWith("/") ? nav.redirect : "/";
  // TEMP launch gate: whether this device has already cleared the access-code
  // step. Read once so a refresh mid-onboarding doesn't re-prompt or bypass it.
  const [gatePassed, setGatePassed] = useState<boolean>(() => isGatePassed() || eventRef);
  const [phoneNumber, setPhoneNumber] = useState(nav?.phoneNumber ?? "");
  const [smsConfigured, setSmsConfigured] = useState<boolean | null>(nav?.smsConfigured ?? null);
  /** Set after requesting a code; drives code length rules (Verify vs local dev). */
  const [authMode, setAuthMode] = useState<"verify" | "dev" | null>(nav?.authMode ?? null);
  // Start on the code step when the public event page already sent the SMS.
  const [step, setStep] = useState<Step>(() =>
    nav?.phoneNumber ? "code" : pickInitial(user, isGatePassed() || eventRef),
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const lastAutoSubmittedCode = useRef<string | null>(null);
  const verifyInFlight = useRef(false);
  // Access code for the launch gate. Accepts the shared exclusive code OR a
  // personal invite code from an existing member. Prefilled from ?invite= on a
  // share link, or from location.state.inviteCode when handed off from the
  // public event page / a plan deep link, so invite-link users just tap
  // Continue.
  const [accessCode, setAccessCode] = useState<string>(() => {
    if (nav?.inviteCode) return nav.inviteCode;
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("invite") ?? "";
  });

  // If a logged-in, already-onboarded user lands here, move them on (to the
  // event they came from, or home). Skip on the "download" step — that's the
  // deliberate post-completion app nudge, which navigates on its own.
  useEffect(() => {
    if (user?.onboardingComplete && step !== "download" && step !== "welcome")
      navigate(redirectTo, { replace: true });
  }, [user, step, redirectTo, navigate]);

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
    const phoneValid = isValidPhoneInput(phoneNumber);
    const digitsOnly = phoneNumber.replace(/\D/g, "");
    const phoneTouched = digitsOnly.length >= 3;
    return (
      <OnboardingShell
        landing
        title=""
        subtitle="A place for plans meant to be shared."
        onBack={() => {
          if (!isNative()) navigate("/welcome");
          else if (window.history.length > 1) navigate(-1);
          else navigate("/welcome");
        }}
      >
        <input
          className="onboarding-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 555-0100"
          value={phoneNumber}
          onChange={(e) => {
            setPhoneNumber(formatPhoneInput(e.target.value));
            setError(null);
          }}
        />
        {phoneTouched && !phoneValid && (
          <div className="onboarding-error">
            {digitsOnly.length < 10
              ? "Enter a 10-digit US phone number."
              : "Enter a valid phone number."}
          </div>
        )}
        {error && <div className="onboarding-error">{error}</div>}
        <button
          className="btn-primary btn-block"
          disabled={busy || !phoneValid}
          onClick={requestCode}
        >
          {busy ? "Sending…" : "Get started"}
        </button>
        <p className="onboarding-fineprint">
          {authMode === "dev" && import.meta.env.DEV
            ? "Local dev: the server prints the code in its terminal — check the API console."
            : smsConfigured === true || authMode === "verify"
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
        {authMode === "dev" && import.meta.env.DEV && (
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
        // Location is the first step after the access-code gate, so "back" has
        // nowhere else sensible to land — re-showing the gate (already passed,
        // just re-confirms) beats no back button at all.
        onBack={() => setStep("gate")}
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
          // Terms, Privacy, and the community guidelines are all accepted on this
          // one screen now, so stamp every consent flag and finish onboarding in a
          // single request. termsAccepted/privacyAccepted/guidelinesAcknowledged are
          // server-side action flags (they stamp *AcceptedAt), not MeDTO fields.
          await api<MeDTO>("/api/auth/me", {
            method: "PATCH",
            body: JSON.stringify({
              termsAccepted: true,
              privacyAccepted: true,
              guidelinesAcknowledged: true,
              onboardingComplete: true,
            }),
          });
          // Set the step BEFORE refreshUser resolves so the completion guard
          // above sees "welcome" (or "download") and doesn't redirect out from
          // under it.
          const uid = user?.id;
          if (uid && !hasSeenWelcome(uid)) {
            setStep("welcome");
          } else if (!isNative()) {
            setStep("download");
          }
          await refreshUser();
          if (uid && hasSeenWelcome(uid) && isNative()) {
            navigate(redirectTo, { replace: true });
          }
        }}
      />
    );
  }
  if (step === "welcome") {
    return (
      <WelcomeStep
        user={user}
        redirectTo={redirectTo}
        onContinue={() => {
          markWelcomeSeen(user.id);
          navigate(redirectTo, { replace: true });
        }}
      />
    );
  }
  if (step === "download") {
    return <DownloadAppStep redirectTo={redirectTo} onContinue={() => navigate(redirectTo, { replace: true })} />;
  }
  return null;
}

/**
 * F.1 — one-time warm interstitial shown right after onboarding completes,
 * before the member ever lands on the feed. Headline, a "here's what's
 * happening" line naming their neighborhood, and — when available — a live
 * nearby-plans stat. On web, the App Store nudge lives on this same screen.
 */
function WelcomeStep({
  user,
  redirectTo,
  onContinue,
}: {
  user: MeDTO;
  redirectTo: string;
  onContinue: () => void;
}) {
  const [neighborhoodName, setNeighborhoodName] = useState<string | null>(null);
  const [stat, setStat] = useState<string | null>(null);
  const goingToEvent = redirectTo.startsWith("/plans/");

  useEffect(() => {
    const id = user.neighborhoodIds?.[0] ?? user.neighborhoodId ?? null;
    if (id) {
      void api<NeighborhoodDTO[]>("/api/neighborhoods")
        .then((list) => setNeighborhoodName(list.find((n) => n.id === id)?.name ?? null))
        .catch(() => undefined);
    }
    void api<PlanDTO[]>("/api/plans")
      .then((plans) => {
        if (plans.length > 0) setStat(`${plans.length} plan${plans.length === 1 ? "" : "s"} near you`);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OnboardingShell title="" subtitle="">
      <div className="welcome-hero">
        <h2 className="welcome-headline">You&apos;re in.</h2>
        <p className="welcome-body">
          Welcome to COMMONS — a city full of women who actually do things
          {neighborhoodName ? ` in ${neighborhoodName}` : ""}.
        </p>
        {stat && <span className="welcome-stat-chip">{stat}</span>}
      </div>
      {isNative() ? (
        <button type="button" className="btn-primary btn-block" onClick={onContinue} style={{ marginTop: 20 }}>
          Explore the app
        </button>
      ) : (
        <div className="download-app" style={{ marginTop: 20 }}>
          {APP_STORE_URL ? (
            <a className="btn-primary btn-block" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              Download for iPhone
            </a>
          ) : (
            <div className="download-app-soon">iPhone app coming soon — we'll text you the link.</div>
          )}
          <button className="btn-link btn-block" type="button" onClick={onContinue}>
            {goingToEvent ? "Continue to the event on web →" : "Continue on the web →"}
          </button>
        </div>
      )}
    </OnboardingShell>
  );
}

/**
 * Final web step: nudge the freshly-onboarded member to install the iOS app.
 * Commons runs natively on iOS, so web signups (including the shared-event
 * funnel) land here before continuing to the event or feed. Skippable — the web
 * app keeps working for anyone who'd rather stay in the browser.
 */
function DownloadAppStep({ redirectTo, onContinue }: { redirectTo: string; onContinue: () => void }) {
  const goingToEvent = redirectTo.startsWith("/plans/");
  return (
    <OnboardingShell
      title="Get the app."
      subtitle="Commons lives on your phone. Get the app for notifications when plans fill up, chat, and one-tap RSVPs."
    >
      <div className="download-app">
        {APP_STORE_URL ? (
          <a className="btn-primary btn-block" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
             Download for iPhone
          </a>
        ) : (
          <div className="download-app-soon">iPhone app coming soon — we'll text you the link.</div>
        )}
        <button className="btn-link btn-block" type="button" onClick={onContinue}>
          {goingToEvent ? "Continue to the event on web →" : "Continue on the web →"}
        </button>
      </div>
    </OnboardingShell>
  );
}

function hasOnboardingPhoto(user: MeDTO): boolean {
  return Boolean(user.avatarPhotoDataUrl?.trim());
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
  // Photo is required — don't let Path B (cleared local data / partial server
  // profile) jump past "Put a face to your name" just because firstName exists.
  if (!user.firstName.trim() || !hasOnboardingPhoto(user)) return "profile";
  if (!user.ageConfirmedAt) return "age";
  // Terms, Privacy, and community-guidelines consent are all captured on the one
  // combined "legal" step, so any missing consent flag routes back to it.
  if (!user.termsAcceptedAt || !user.privacyAcceptedAt || !user.guidelinesAcknowledgedAt)
    return "legal";
  return "legal";
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
  compact = false,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
  /** Login/phone-entry styling — floating icons + big wordmark, like LoadingScreen. */
  landing?: boolean;
  /** When provided, renders a back arrow to return to the previous step. */
  onBack?: () => void;
  /** Tighter top spacing for dense grids (e.g. interests). */
  compact?: boolean;
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
      <div
        className={`onboarding-card ${landing ? "onboarding-card--landing" : ""} ${
          onBack ? "onboarding-card--has-nav" : ""
        } ${compact ? "onboarding-card--compact" : ""}`}
      >
        {onBack && (
          <button type="button" className="onboarding-back" onClick={onBack} aria-label="Back">
            ← Back
          </button>
        )}
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
  onBack,
}: {
  coords: { lat: number; lng: number } | null;
  onCoords: (c: { lat: number; lng: number } | null) => void;
  onSave: (neighborhoodIds: string[]) => Promise<void>;
  onBack?: () => void;
}) {
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollLockRef = useRef(0);
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

  // Keep the page from jumping to the top while filtering the neighborhood list.
  useEffect(() => {
    if (scrollLockRef.current > 0) {
      window.scrollTo(0, scrollLockRef.current);
    }
  }, [filter, sorted]);

  if (permissionState === "idle") {
    return (
      <div className="onboarding-location-hero">
        <img
          src="/onboarding/philly-skyline.jpg"
          alt=""
          className="onboarding-location-hero-img"
        />
        <div className="onboarding-location-hero-gradient" aria-hidden="true" />
        {onBack && (
          <button type="button" className="onboarding-back onboarding-back--on-photo" onClick={onBack} aria-label="Back">
            ← Back
          </button>
        )}
        <p className="onboarding-location-city">
          <MapPin size={12} strokeWidth={2.4} aria-hidden="true" />
          Philadelphia
        </p>
        <div className="onboarding-location-sheet">
          <img src={wordmark} alt="COMMONS" className="onboarding-brand-img" />
          <h2 className="onboarding-title">Share your location</h2>
          <p className="onboarding-subtitle">So we can show you what&apos;s happening nearby.</p>
          <button className="btn-primary btn-block" onClick={shareLocation}>
            Allow location access
          </button>
          <button className="btn-link" type="button" onClick={() => setPermissionState("denied")}>
            Skip — I&apos;ll pick manually
          </button>
        </div>
      </div>
    );
  }
  if (permissionState === "asking") {
    return <OnboardingShell title="Getting your location…" subtitle="" onBack={onBack} />;
  }

  return (
    <OnboardingShell
      title="Where do you spend time?"
      subtitle={coords ? "Pick your neighborhoods — we’ll show you what’s happening nearby." : "Pick every area that fits — we’ll personalize your feed."}
      onBack={onBack}
    >
      <input
        className="onboarding-input"
        placeholder="Search neighborhoods…"
        value={filter}
        onChange={(e) => {
          scrollLockRef.current = window.scrollY;
          setFilter(e.target.value);
        }}
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
    </OnboardingShell>
  );
}

/**
 * Scroll-to-bottom consent gate for Terms and Privacy. Each document opens in a
 * modal; the agree chip stays disabled until both are read to the bottom.
 */
function LegalConsentStep({
  onAgree,
  onBack,
}: {
  onAgree: () => Promise<void>;
  onBack?: () => void;
}) {
  const [read, setRead] = useState<{ terms: boolean; privacy: boolean }>({
    terms: false,
    privacy: false,
  });
  const [openDoc, setOpenDoc] = useState<"terms" | "privacy" | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const bothRead = read.terms && read.privacy;

  return (
    <OnboardingShell
      title="Before you join."
      subtitle="Read our community guidelines, Terms, and Privacy Policy."
      onBack={onBack}
    >
      <h3 className="guidelines-heading">Community guidelines</h3>
      <ul className="guidelines-list">
        <li>
          <span className="guidelines-icon" aria-hidden="true">💛</span>
          <div>
            <strong>Built for women.</strong>
            <p>
              COMMONS is a women-forward community, built for finding your people and making real
              plans in the city.
            </p>
          </div>
        </li>
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

      <p className="legal-consent-intro">
        You must read both documents before you can agree.
      </p>
      <div className="legal-consent-openers">
        {(["terms", "privacy"] as const).map((slug) => (
          <button
            key={slug}
            type="button"
            className={`legal-consent-opener ${read[slug] ? "is-read" : ""}`}
            onClick={() => setOpenDoc(slug)}
          >
            {read[slug] && (
              <span className="legal-consent-tab-check" aria-hidden="true">
                ✓
              </span>
            )}
            {LEGAL_DOCS[slug].title}
            {!read[slug] && <span className="legal-consent-opener-hint">Read required</span>}
          </button>
        ))}
      </div>

      {!bothRead && (
        <p className="legal-consent-status">
          {read.terms
            ? "Now read the Privacy Policy."
            : read.privacy
              ? "Now read the Terms of Service."
              : "Open and scroll to the bottom of each document to continue."}
        </p>
      )}

      <button
        type="button"
        className={`legal-agree-chip ${agreed ? "is-active" : ""}`}
        disabled={!bothRead}
        aria-pressed={agreed}
        onClick={() => {
          if (bothRead) setAgreed((v) => !v);
        }}
      >
        {agreed && (
          <span className="legal-agree-chip-check" aria-hidden="true">
            ✓
          </span>
        )}
        <span>
          I have read and agree to the Commons Community Guidelines, Terms of Service, and Privacy
          Policy.
        </span>
      </button>

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

      {openDoc && (
        <LegalDocModal
          doc={LEGAL_DOCS[openDoc]}
          onClose={() => setOpenDoc(null)}
          onReadComplete={() => setRead((r) => ({ ...r, [openDoc]: true }))}
        />
      )}
    </OnboardingShell>
  );
}

function LegalDocModal({
  doc,
  onClose,
  onReadComplete,
}: {
  doc: (typeof LEGAL_DOCS)[keyof typeof LEGAL_DOCS];
  onClose: () => void;
  onReadComplete: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(false);

  function markIfAtBottom() {
    const el = panelRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 28;
    setAtBottom(bottom);
  }

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setAtBottom(false);
    const id = window.setTimeout(markIfAtBottom, 60);
    return () => window.clearTimeout(id);
  }, [doc.slug]);

  return (
    <div className="legal-modal-backdrop" onClick={onClose}>
      <div
        className="legal-modal"
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="legal-modal-header">
          <h3 className="legal-modal-title">{doc.title}</h3>
          <button type="button" className="legal-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="legal-modal-panel" ref={panelRef} onScroll={markIfAtBottom}>
          <LegalContent doc={doc} hideTitle />
          {!atBottom && <div className="legal-consent-scrollhint">Scroll to continue ↓</div>}
        </div>
        <button
          type="button"
          className="btn-primary btn-block"
          disabled={!atBottom}
          onClick={() => {
            onReadComplete();
            onClose();
          }}
        >
          {atBottom ? "I've read this" : "Scroll to the bottom"}
        </button>
      </div>
    </div>
  );
}

function InterestsStep({ me, onSave, onBack }: { me: MeDTO; onSave: (interests: InterestTag[]) => Promise<void>; onBack?: () => void }) {
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
    <OnboardingShell title="What are you into?" subtitle="Pick what you're into. Your feed does the rest." onBack={onBack} compact>
      <div className="interest-grid">
        {ALL_INTERESTS.map((t) => {
          const isPicked = picked.includes(t);
          const { Icon, iconColor, tint } = interestVisual(t);
          return (
            <button
              key={t}
              type="button"
              className={`interest-tile ${isPicked ? "is-picked" : ""}`}
              onClick={() => toggle(t)}
            >
              {isPicked && <span className="interest-tile-dot" aria-hidden="true" />}
              <span
                className="interest-tile-icon"
                style={{ background: tint, color: iconColor }}
                aria-hidden="true"
              >
                <Icon size={20} strokeWidth={1.8} />
              </span>
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
    <OnboardingShell title="Put a face to your name." subtitle="Add a photo and your name to continue." onBack={onBack}>
      <div className="profile-avatar-preview">
        <button
          type="button"
          className="profile-avatar-edit"
          onClick={() => void openPhotoPicker()}
          aria-label={photo ? "Change photo" : "Add a photo"}
        >
          {photo ? (
            <>
              <Avatar
                seed={me.avatarSeed}
                style={me.avatarStyle}
                photoDataUrl={photo}
                params={avatarParams ?? undefined}
                size="xl"
              />
              <span className="profile-avatar-camera" aria-hidden="true">
                <CameraIcon />
              </span>
            </>
          ) : (
            <span className="profile-avatar-empty" aria-hidden="true">
              <CameraIcon />
            </span>
          )}
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
          {!firstName.trim() || !lastName.trim()
            ? "Add your first and last name to continue."
            : "Add a photo to continue — a real picture, not a placeholder."}
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
      subtitle="COMMONS is for adults. Pick your era."
      onBack={onBack}
    >
      <div className="age-era-grid">
        {ALL_AGE_RANGES.map((r) => {
          const Icon = AGE_ERA_ICONS[r];
          const selected = ageRange === r;
          return (
            <button
              key={r}
              type="button"
              className={`age-era-tile ${selected ? "is-selected" : ""}`}
              onClick={() => setAgeRange(r)}
              aria-pressed={selected}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span className="age-era-label">{AGE_RANGE_LABELS[r]}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`age-confirm-row ${confirmed ? "is-active" : ""}`}
        onClick={() => setConfirmed((v) => !v)}
        aria-pressed={confirmed}
      >
        <span className={`age-confirm-box ${confirmed ? "is-checked" : ""}`} aria-hidden="true">
          {confirmed && <Check size={11} strokeWidth={2.8} color="#fff" />}
        </span>
        <span>I confirm I am 18 years or older.</span>
      </button>

      <button
        type="button"
        className="btn-primary btn-block"
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
