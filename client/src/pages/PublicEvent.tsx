import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, parseApiError } from "../api/http";
import { formatPhoneInput, formatPlanWhenLine, isValidPhoneInput, planHeadline } from "../lib/format";
import { type PublicPlanDTO } from "../types/shared";
import { LoadingScreen } from "../components/LoadingScreen";
import { IdeaCoverFallback } from "../components/CoverThumb";
import wordmark from "../assets/wordmark.png";

// Public, unauthenticated landing for a shared plan link. This is what someone
// who doesn't have the app sees when they tap a Commons event link. It shows the
// real event (matching the social share card they clicked) and converts them:
// number → onboarding → download the app.
export function PublicEventPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  void searchParams; // retained for future query params

  const [plan, setPlan] = useState<PublicPlanDTO | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPlan(null);
    setLoadError(false);
    setCoverFailed(false);
    api<PublicPlanDTO>(`/api/plans/${id}/public`, { credentials: "omit" })
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
      setError(parseApiError(e));
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

  // Logged-out visitors only ever see the day (and neighborhood, unless the
  // plan is private). The time, venue, host, and headcount are withheld by the
  // server — you join Commons to see them.
  const dayLine =
    plan.dayLabel ||
    formatPlanWhenLine(plan.date, "", true, {
      isFlexibleDate: plan.isFlexibleDate,
      isThisWeek: plan.isThisWeek,
      isFlexibleLocation: true,
    });
  const showCover = Boolean(plan.coverImage) && !coverFailed;

  return (
    <div className="public-event">
      <div className="public-event-card">
        <div className={`public-event-hero ${showCover ? "" : "public-event-hero--empty"}`}>
          {showCover ? (
            <img
              className="public-event-hero-img"
              src={plan.coverImage}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <IdeaCoverFallback seed={plan.id} />
          )}
          <span className="public-event-hero-badge" aria-hidden="true">
            {plan.hostEmoji || "✨"}
          </span>
        </div>

        <div className="public-event-body">
          <div className="public-event-brand">
            <img className="public-event-wordmark" src={wordmark} alt="Commons" />
            <span className="public-event-invited">You're invited</span>
          </div>

          <h1 className="public-event-title">{planHeadline(plan.title)}</h1>
          <div className="public-event-meta">{dayLine}</div>
          {plan.neighborhoodName ? (
            <div className="public-event-meta">📍 {plan.neighborhoodName}</div>
          ) : null}

          <div className="public-event-attendance">Join Commons to see details</div>

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
              <button className="btn-primary btn-block" disabled={busy || !isValidPhoneInput(phoneNumber)} onClick={join}>
                {busy ? "Sending…" : "Join & RSVP"}
              </button>
              <p className="onboarding-fineprint">
                We&apos;ll text a code.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
