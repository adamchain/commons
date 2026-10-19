import { useState } from "react";
import { api, parseApiError } from "../../api/http";
import { formatPhoneInput, isValidPhoneInput } from "../../lib/format";

type CodeResponse = {
  phoneNumber: string;
  smsConfigured: boolean;
  authMode?: "verify" | "dev";
  reused?: boolean;
};

function formatError(e: unknown): string {
  const msg = parseApiError(e);
  if (msg === "Failed to fetch" || msg === "Load failed" || msg === "Network request failed") {
    return "Couldn't reach Commons. Check your connection and try again.";
  }
  return msg || "Something went wrong";
}

/**
 * Phone sign-in that exists only on the admin dashboard. It never routes into
 * the member app or onboarding.
 */
export function AdminSignIn({
  notice,
  onSignedIn,
}: {
  notice?: string | null;
  onSignedIn: () => void;
}) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sentPhone, setSentPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"verify" | "dev" | null>(null);

  const shownError = error ?? (step === "phone" ? notice ?? null : null);

  async function requestCode() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const result = await api<CodeResponse>("/api/admin/auth/request-code", {
        method: "POST",
        body: JSON.stringify({
          phoneNumber: step === "code" && sentPhone ? sentPhone : phoneNumber,
        }),
      });
      setSentPhone(result.phoneNumber);
      setAuthMode(result.authMode ?? (result.smsConfigured ? "verify" : "dev"));
      setHint(result.reused ? "Use the code in the text we already sent." : null);
      setCode("");
      setStep("code");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: sentPhone || phoneNumber, code }),
      });
      onSignedIn();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(false);
    }
  }

  const phoneValid = isValidPhoneInput(phoneNumber);
  const codeReady = authMode === "dev" ? code.length === 6 : code.length >= 4 && code.length <= 10;

  return (
    <form
      className="fdash-gate"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "phone") void requestCode();
        else void verifyCode();
      }}
    >
      <p className="fdash-gate-kicker">COMMONS</p>
      <h1>Admin</h1>
      <p className="fdash-muted">
        {step === "phone"
          ? "Sign in with an admin phone number. This stays on the admin dashboard."
          : `Enter the code sent to ${formatPhoneInput(sentPhone) || sentPhone}.`}
      </p>
      {step === "phone" ? (
        <input
          className="fdash-search"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          placeholder="(555) 555-0100"
          value={phoneNumber}
          onChange={(e) => {
            setPhoneNumber(formatPhoneInput(e.target.value));
            setError(null);
          }}
        />
      ) : (
        <input
          className="fdash-search"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={authMode === "dev" ? 6 : 10}
          placeholder="Code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, ""));
            setError(null);
          }}
        />
      )}
      {shownError ? <p className="fdash-gate-error">{shownError}</p> : null}
      {hint && !shownError ? <p className="fdash-muted">{hint}</p> : null}
      {authMode === "dev" && import.meta.env.DEV && step === "code" ? (
        <p className="fdash-muted">Local dev: the code is printed in the API console.</p>
      ) : null}
      <button
        className="fdash-btn"
        type="submit"
        disabled={busy || (step === "phone" ? !phoneValid : !codeReady)}
      >
        {busy ? "Working…" : step === "phone" ? "Text me a code" : "Sign in"}
      </button>
      {step === "code" ? (
        <div className="fdash-gate-links">
          <button type="button" className="fdash-back" disabled={busy} onClick={() => void requestCode()}>
            Resend code
          </button>
          <button
            type="button"
            className="fdash-back"
            disabled={busy}
            onClick={() => {
              setStep("phone");
              setSentPhone("");
              setCode("");
              setHint(null);
              setError(null);
            }}
          >
            Use a different number
          </button>
        </div>
      ) : (
        <p className="fdash-muted">We’ll text a verification code. Message rates may apply.</p>
      )}
    </form>
  );
}
