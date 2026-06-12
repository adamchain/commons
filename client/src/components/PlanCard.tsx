import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import type { PlanDTO } from "../types/shared";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { planHasEnded } from "../lib/planTime";
import { useNeighborhoods } from "../lib/useNeighborhoods";

/**
 * Compact event card — title, time, details. Card type (confirmed / looking_for /
 * plan_created) still drives shading and the reply form, but the dense metadata
 * row (avatars, posted-by, distance) is gone per the simplified spec.
 */
export function PlanCard({
  plan,
  onPlanRefresh,
  highlight = false,
  onHideKind,
}: {
  plan: PlanDTO;
  onPlanRefresh?: () => void;
  highlight?: boolean;
  onHideKind?: (kind: "happened" | "cancelled") => void;
}) {
  const title = sentenceCaseTitle(plan.title);
  const isLooking = plan.planKind === "looking_for";
  const hoods = useNeighborhoods();
  const hoodName = hoods[plan.neighborhoodId]?.name ?? null;
  const isPlanCreated = isLooking && Boolean(plan.lockedAt);
  const isCancelled = Boolean(plan.cancelledAt);
  const hasEnded = !isCancelled && planHasEnded(plan);
  const suggestions = plan.suggestions ?? [];
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const { user } = useAuth();
  const isHosting = !!user && plan.creator.id === user.id;
  const canChat =
    !!user &&
    (isHosting || plan.myState === "going" || plan.myState === "interested");

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

  // Consistent flex labeling — every card type says "Flexible time" or
  // "Flexible location" (never "TBD") so users learn one vocabulary.
  const whenLine = plan.isFlexibleTime
    ? `${formatPlanDate(plan.date)} · Flexible time`
    : `${formatPlanDate(plan.date)} · ${formatPlanTime(plan.time, plan.isFlexibleTime)}`;

  const goingCount = plan.participants.going.length;
  const interestedCount = plan.participants.interested.length;
  const totalRsvps = goingCount + interestedCount;
  // Same threshold the group prompt uses (≥2 RSVPs) on a still-open looking_for.
  const almostPlan = isLooking && !isPlanCreated && !hasEnded && totalRsvps >= 2;
  // Spots-left scarcity. Only on capped plans, while seats remain, before end
  // time. Reads "2 spots · 1 left" — count of total seats, dot, remaining.
  const spotsRemaining =
    plan.capacity !== null && !hasEnded && !isCancelled
      ? Math.max(0, plan.capacity - goingCount)
      : null;
  const showSpotsRemaining =
    spotsRemaining !== null && plan.capacity !== null && spotsRemaining > 0 && spotsRemaining <= 3;
  const isFull = plan.capacity !== null && goingCount >= plan.capacity;
  const socialProof = almostPlan
    ? `${totalRsvps} interested · almost a plan`
    : hasEnded && goingCount >= 1
      ? `${goingCount} went`
      : isFull && !hasEnded && !isCancelled
        ? `${goingCount} going · full`
        : showSpotsRemaining
          ? `${goingCount} going · ${spotsRemaining} left`
          : goingCount >= 1
            ? `${goingCount} going`
            : isLooking && interestedCount >= 1
              ? `${interestedCount} interested`
              : null;

  return (
    <div
      data-plan-id={plan.id}
      className={`plan-card-outer ${
        isPlanCreated
          ? "plan-card--plan-created"
          : isLooking
            ? "plan-card--looking"
            : "plan-card--confirmed"
      } ${highlight ? "plan-card--just-posted" : ""} ${hasEnded ? "plan-card--happened" : ""} ${isCancelled ? "plan-card--cancelled" : ""} ${plan.visibility === "network" ? "plan-card--network" : ""}`}
    >
      {highlight && (
        <div className="plan-card-just-posted-banner">
          Just posted · {plan.visibility === "network"
            ? "Only your network can see this"
            : plan.visibility === "community"
              ? "Visible to your community"
              : "Live on the feed"}
        </div>
      )}
      {(isCancelled || hasEnded) && onHideKind && (
        <button
          type="button"
          className="plan-card-hide-btn"
          onClick={() => onHideKind(isCancelled ? "cancelled" : "happened")}
          aria-label={isCancelled ? "Hide cancelled plans" : "Hide past plans"}
        >
          Hide {isCancelled ? "cancelled" : "past"}
        </button>
      )}
      <Link to={`/plans/${plan.id}`} className="plan-card plan-card-link plan-card--compact">
        {plan.flyerDataUrl && (
          <div className="plan-card-flyer">
            <img src={plan.flyerDataUrl} alt="" />
          </div>
        )}
        <header className="plan-card-poster-row">
          <Avatar
            seed={plan.creator.avatarSeed}
            style={plan.creator.avatarStyle}
            photoDataUrl={plan.creator.avatarPhotoDataUrl}
            params={plan.creator.avatarParams}
            size="sm"
          />
          <span className="plan-card-posted-by">
            Posted by <strong>{plan.creator.firstName}</strong>
          </span>
          {isCancelled ? (
            <span className="plan-card-kind-pill is-cancelled">Cancelled</span>
          ) : hasEnded ? (
            <span className="plan-card-kind-pill is-happened">Happened</span>
          ) : isPlanCreated ? (
            <span className="plan-card-kind-pill is-plan-created">Plan created</span>
          ) : isLooking ? (
            <span className="plan-card-kind-pill is-looking">Looking For</span>
          ) : null}
        </header>
        <h3 className="plan-card-title">{title}</h3>
        <p className="plan-card-meta-line">
          <span className="plan-card-meta-icon" aria-hidden="true">
            <ClockGlyph />
          </span>
          {whenLine}
        </p>
        <p className="plan-card-meta-line">
          <span className="plan-card-meta-icon" aria-hidden="true">
            <PinGlyph />
          </span>
          {plan.isFlexibleLocation ? "Flexible location" : plan.location.name}
          {hoodName && (
            <span className="plan-card-meta-sub"> · {hoodName}</span>
          )}
        </p>
        {plan.description && (
          <p className="plan-card-description">{plan.description}</p>
        )}

        {/* Link preview rendered as a non-anchor block inside the card link to
            avoid nesting <a> inside <a> (invalid HTML; in iOS WebView it can
            collapse the wrapper Link and bounce navigation to /). The actual
            external open happens via the sibling overlay anchor below. */}
        {plan.flyerLinkUrl && (
          <div className="link-preview link-preview--card" aria-hidden="true">
            {plan.flyerLinkPreview?.image && (
              <img src={plan.flyerLinkPreview.image} alt="" className="link-preview-image" />
            )}
            <div className="link-preview-body">
              {plan.flyerLinkPreview?.siteName && (
                <div className="link-preview-site">{plan.flyerLinkPreview.siteName}</div>
              )}
              {plan.flyerLinkPreview?.title ? (
                <div className="link-preview-title">{plan.flyerLinkPreview.title}</div>
              ) : (
                <div className="link-preview-title">{plan.flyerLinkUrl}</div>
              )}
              {plan.flyerLinkPreview?.description && (
                <div className="link-preview-desc">{plan.flyerLinkPreview.description}</div>
              )}
            </div>
          </div>
        )}

        <footer className="plan-card-footer-row">
          <div className="plan-card-attendees">
            {(plan.participants.going.length > 0 || plan.participants.interested.length > 0) && (
              <div className="avatar-stack">
                {[...plan.participants.going, ...plan.participants.interested]
                  .slice(0, 3)
                  .map((p) => (
                    <Avatar
                      key={p.id}
                      seed={p.avatarSeed}
                      style={p.avatarStyle}
                      photoDataUrl={p.avatarPhotoDataUrl}
                      params={p.avatarParams}
                      size="xs"
                    />
                  ))}
              </div>
            )}
            {socialProof && (
              <span className="plan-card-going-count">{socialProof}</span>
            )}
          </div>
          {plan.myState === "going" && (
            <span className="plan-card-state-pill plan-card-state-pill--in">
              <span aria-hidden="true">✓</span> You&apos;re in
            </span>
          )}
          {plan.myState === "interested" && (
            <span className="plan-card-state-pill plan-card-state-pill--interested">Interested</span>
          )}
        </footer>
      </Link>

      {canChat && (
        <Link
          to={`/plans/${plan.id}/chat`}
          className="plan-card-chat-link"
          onClick={(e) => e.stopPropagation()}
        >
          💬 Group chat
        </Link>
      )}

      {hasEnded && isHosting && (
        <Link to="/plans/new" className="plan-card-host-again" onClick={(e) => e.stopPropagation()}>
          Host another like this →
        </Link>
      )}

      {isLooking && !isPlanCreated && !hasEnded && !isCancelled && (
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

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
