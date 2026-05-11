import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import type { PlanDTO } from "../types/shared";
import { INTEREST_LABELS } from "../types/shared";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";

function initials(u: { firstName: string }): string {
  const p = u.firstName.trim().split(/\s+/);
  if (p.length >= 2) return (p[0]!.slice(0, 1) + p[1]!.slice(0, 1)).toUpperCase();
  const one = p[0] ?? "?";
  return one.slice(0, 2).toUpperCase();
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatMiles(miles: number): string {
  if (!isFinite(miles)) return "";
  if (miles < 0.1) return "<0.1 mi";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function PlanCard({
  plan,
  neighborhoodName,
  viewerCoords,
  onPlanRefresh,
}: {
  plan: PlanDTO;
  /** Area label for host line (e.g. Rittenhouse) */
  neighborhoodName?: string;
  /** Viewer's reference point for distance — typically their primary neighborhood centroid. */
  viewerCoords?: { lat: number; lng: number };
  onPlanRefresh?: () => void;
}) {
  const going = plan.participants.going;
  const goingCount = going.length;
  const three = going.slice(0, 3);
  const title = sentenceCaseTitle(plan.title);
  const flexTag =
    plan.isFlexibleTime || plan.isFlexibleLocation ? "Flexible on time + location" : null;
  const distanceLabel =
    viewerCoords && typeof plan.location?.lat === "number" && typeof plan.location?.lng === "number"
      ? formatMiles(haversineMiles(viewerCoords, { lat: plan.location.lat, lng: plan.location.lng }))
      : null;
  const isLooking = plan.planKind === "looking_for";
  const suggestions = plan.suggestions ?? [];
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    const t = reply.trim();
    if (!t || replyBusy) return;
    setReplyBusy(true);
    try {
      await api(`/api/plans/${plan.id}/suggestions`, {
        method: "POST",
        body: JSON.stringify({ body: t }),
      });
      setReply("");
      onPlanRefresh?.();
    } catch {
      /* keep text for retry */
    } finally {
      setReplyBusy(false);
    }
  }

  return (
    <div className={`plan-card-outer ${isLooking ? "plan-card--looking" : ""}`}>
      <Link to={`/plans/${plan.id}`} className="plan-card plan-card-link">
        {isLooking && <span className="plan-card-looking-pill">Looking for</span>}

        <h3 className="plan-card-title">{title}</h3>

        <p className="plan-card-posted-by">
          posted by {plan.creator.firstName}
          {plan.location?.name ? ` · ${plan.location.name}` : ""}
          {distanceLabel ? ` · ${distanceLabel}` : neighborhoodName ? ` · ${neighborhoodName}` : ""}
        </p>

        {plan.description ? (
          <p className="plan-card-description">&ldquo;{plan.description}&rdquo;</p>
        ) : null}

        <div className="plan-card-meta-row">
          <div className="plan-card-meta-main">
            {!plan.isFlexibleLocation && (
              <span className="plan-card-when">
                {formatPlanDate(plan.date)} · {formatPlanTime(plan.time, plan.isFlexibleTime)}
              </span>
            )}
            {plan.isFlexibleLocation && !flexTag && <span className="plan-card-when">Location TBD</span>}
            {flexTag && <span className="plan-card-flex-tag">{flexTag}</span>}
          </div>
          <div className="plan-card-avatars" aria-label={`${goingCount} going`}>
            {three.map((u) => (
              <span key={u.id} className="plan-card-initials" title={u.firstName}>
                {initials(u)}
              </span>
            ))}
            <span className="plan-card-going-count">{goingCount} going</span>
          </div>
        </div>

        <div className="plan-card-tags">
          {plan.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="tag-chip tag-chip-quiet">
              {INTEREST_LABELS[tag] ?? tag}
            </span>
          ))}
        </div>

        {(plan.myState === "going" || plan.myState === "interested") && (
          <div className="plan-card-my-state">
            {plan.myState === "going" && <span className="badge">You&apos;re in</span>}
            {plan.myState === "interested" && <span className="badge badge-muted">Interested</span>}
          </div>
        )}
      </Link>

      {isLooking && (
        <div className="plan-card-suggest" onClick={(e) => e.stopPropagation()}>
          {suggestions.length > 0 && (
            <ul className="plan-card-suggest-list">
              {suggestions.map((s) => (
                <li key={s.id} className="plan-card-suggest-line">
                  <span className="plan-card-suggest-name">{s.author.firstName}</span>
                  <span className="plan-card-suggest-body">{s.body}</span>
                </li>
              ))}
            </ul>
          )}
          <form className="plan-card-suggest-form" onSubmit={(e) => void sendReply(e)}>
            <input
              className="plan-card-suggest-input"
              placeholder="Reply or suggest something…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={600}
            />
            <button type="submit" className="plan-card-suggest-send" disabled={replyBusy || !reply.trim()}>
              {replyBusy ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
