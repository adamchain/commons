import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/http";
import { formatPhoneInput, formatPlanDate, formatPlanTime } from "../lib/format";
import { INTEREST_EMOJI, INTEREST_LABELS, type PublicPlanDTO } from "../types/shared";
import { LoadingScreen } from "../components/LoadingScreen";
import wordmark from "../assets/wordmark.png";

// Public, unauthenticated landing for a shared plan link. This is what someone
// who doesn't have the app sees when they tap a Commons event link. It shows the
// real event (matching the social share card they clicked) and converts them:
// number → onboarding (gate bypassed as an event referral) → download the app.
export function PublicEventPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<PublicPlanDTO | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPlan(null);
    setLoadError(false);
    api<PublicPlanDTO>(`/api/plans/${id}/public`)
      .then((p) => active && setPlan(p))
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [id]);

  async function join() {
    if (!phoneNumber || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ phoneNumber: string; smsConfigured: boolean; authMode?: "verify" | "dev" }>(
        "/api/auth/request-code",
        { method: "POST", body: JSON.stringify({ phoneNumber }) },
      );
      // Hand off to onboarding pre-advanced to the code step, gate bypassed, and
      // set to return to this event once setup completes.
      navigate("/onboarding", {
        state: {
          eventRef: true,
          redirect: `/plans/${id}`,
          phoneNumber: result.phoneNumber,
          authMode: result.authMode ?? (result.smsConfigured ? "verify" : "dev"),
          smsConfigured: result.smsConfigured,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Something went wrong");
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="public-event public-event--message">
        <img className="public-event-wordmark" src={wordmark} alt="Commons" />
        <p>This plan isn't available anymore.</p>
        <a className="btn-primary" href="/welcome">
          Explore Commons
        </a>
      </div>
    );
  }
  if (!plan) return <LoadingScreen simple tagline="Loading the plan…" />;

  const dateLine = [formatPlanDate(plan.date), formatPlanTime(plan.time, plan.isFlexibleTime)]
    .filter(Boolean)
    .join(" · ");
  const attendance =
    plan.goingCount > 0 || plan.interestedCount > 0
      ? `${plan.goingCount} going · ${plan.interestedCount} interested`
      : "Be the first to join";

  return (
    <div className="public-event">
      <div className="public-event-card">
        <div className="public-event-hero">
          {plan.coverImage && (
            <img className="public-event-hero-img" src={plan.coverImage} alt={plan.title} />
          )}
        </div>

        <div className="public-event-body">
          <div className="public-event-brand">
            <img className="public-event-wordmark" src={wordmark} alt="Commons" />
            <span className="public-event-invited">You're invited</span>
          </div>

          <h1 className="public-event-title">
            <span className="public-event-emoji">{plan.hostEmoji}</span> {plan.title}
          </h1>
          <div className="public-event-meta">{dateLine}</div>
          {plan.locationName && <div className="public-event-meta">📍 {plan.locationName}</div>}
          <div className="public-event-host">Hosted by {plan.hostFirstName}</div>

          <div className="public-event-attendance">{attendance}</div>

          {(() => {
            // Guard against legacy/unknown tags in older plan records.
            const known = plan.tags.filter((t) => INTEREST_LABELS[t]).slice(0, 4);
            if (known.length === 0) return null;
            return (
              <div className="public-event-tags">
                {known.map((t) => (
                  <span key={t} className="public-event-tag">
                    {INTEREST_EMOJI[t]} {INTEREST_LABELS[t]}
                  </span>
                ))}
              </div>
            );
          })()}

          {plan.cancelled ? (
            <div className="public-event-cancelled">This plan was cancelled by the host.</div>
          ) : (
            <div className="public-event-join">
              <label className="public-event-join-label">Enter your number to RSVP</label>
              <input
                className="onboarding-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(555) 555-0100"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(formatPhoneInput(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
              {error && <div className="onboarding-error">{error}</div>}
              <button className="btn-primary btn-block" disabled={busy || !phoneNumber} onClick={join}>
                {busy ? "Sending…" : "Join & RSVP"}
              </button>
              <p className="onboarding-fineprint">
                We'll text you a code to verify your number. New to Commons? You'll set up your profile next.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
