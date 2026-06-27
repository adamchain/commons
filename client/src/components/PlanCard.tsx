import { useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import type { MeDTO, PlanDTO } from "../types/shared";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { planHasEnded } from "../lib/planTime";
import { useNeighborhoods } from "../lib/useNeighborhoods";
import { useCardImages, pickCoverImage } from "../lib/cardImages";

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
  const coverPool = useCardImages();
  const coverImage = plan.flyerDataUrl ?? pickCoverImage(coverPool, plan.id);
  const hoods = useNeighborhoods();
  const hoodName = hoods[plan.neighborhoodId]?.name ?? null;
  const isPlanCreated = isLooking && Boolean(plan.lockedAt);
  const isCancelled = Boolean(plan.cancelledAt);
  const hasEnded = !isCancelled && planHasEnded(plan);
  const suggestions = plan.suggestions ?? [];
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const { user, setUser } = useAuth();
  const isHosting = !!user && plan.creator.id === user.id;
  const isSaved = !!user?.savedPlanIds?.includes(plan.id);
  const [savePending, setSavePending] = useState(false);

  async function toggleSave(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (savePending) return;
    setSavePending(true);
    try {
      const r = await api<{ me: MeDTO }>("/api/auth/save-plan", {
        method: "POST",
        body: JSON.stringify({ planId: plan.id }),
      });
      setUser(r.me);
    } catch {
      /* swallow */
    } finally {
      setSavePending(false);
    }
  }
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
  const locationLine = plan.isFlexibleLocation
    ? "Flexible location"
    : hoodName
      ? `${plan.location.name} · ${hoodName}`
      : plan.location.name;
  const metaLine = `${whenLine} · ${locationLine}`;

  const goingLabel = `${goingCount} going`;
  const interestedLabel = interestedCount > 0 ? ` · ${interestedCount} interested` : "";
  const footerCount = almostPlan
    ? `${totalRsvps} interested · almost a plan`
    : hasEnded && goingCount >= 1
      ? `${goingCount} went`
      : isFull && !hasEnded && !isCancelled
        ? `${goingCount} going · full`
        : showSpotsRemaining
          ? `${goingCount} going · ${spotsRemaining} spot${spotsRemaining === 1 ? "" : "s"} left`
          : goingCount >= 1 || interestedCount >= 1
            ? `${goingLabel}${interestedLabel}`
            : null;

  return (
    <div
      data-plan-id={plan.id}
      className={`plan-card-outer ${
        isLooking && !isPlanCreated
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
      {user && (
        <button
          type="button"
          className={`plan-card-save-btn ${isSaved ? "is-saved" : ""}`}
          onClick={(e) => void toggleSave(e)}
          disabled={savePending}
          aria-pressed={isSaved}
          aria-label={isSaved ? "Saved — tap to unsave" : "Save to My Plans"}
          title={isSaved ? "Saved" : "Save"}
        >
          {isSaved ? "★" : "☆"}
        </button>
      )}
      <Link to={`/plans/${plan.id}`} className="plan-card plan-card-link plan-card--compact">
        {!isLooking || isPlanCreated ? (
          <div className="plan-card-flyer">
            <img src={coverImage} alt="" loading="lazy" />
          </div>
        ) : null}
        <header className="plan-card-poster-row">
          <Avatar
            seed={plan.creator.avatarSeed}
            style={plan.creator.avatarStyle}
            photoDataUrl={plan.creator.avatarPhotoDataUrl}
            params={plan.creator.avatarParams}
            size="xs"
          />
          <span className="plan-card-posted-by">{plan.creator.firstName}</span>
          {isCancelled ? (
            <span className="plan-card-kind-pill is-cancelled">Cancelled</span>
          ) : hasEnded ? (
            <span className="plan-card-kind-pill is-happened">Happened</span>
          ) : isLooking && !isPlanCreated ? (
            <span className="plan-card-kind-pill is-looking">Looking For</span>
          ) : null}
        </header>
        <h3 className="plan-card-title">{title}</h3>
        <p className="plan-card-meta-line plan-card-meta-line--single">{metaLine}</p>
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
            {footerCount && (
              <span className="plan-card-going-count">{footerCount}</span>
            )}
          </div>
          {!isHosting && !hasEnded && !isCancelled && (
            <QuickJoin
              planId={plan.id}
              isLooking={isLooking}
              state={plan.myState ?? null}
              disabled={isFull && !isLooking}
              onPlanRefresh={onPlanRefresh}
            />
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

/**
 * On-card quick RSVP. Lets you commit straight from the feed without opening
 * the plan. "I'm in" for standard plans, "I'm interested" for looking_for /
 * tentative. Already-going cards don't render this (handled by the caller).
 */
function QuickJoin({
  planId,
  isLooking,
  state,
  disabled,
  onPlanRefresh,
}: {
  planId: string;
  isLooking: boolean;
  state: "going" | "interested" | null;
  disabled?: boolean;
  onPlanRefresh?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const target: "going" | "interested" = isLooking ? "interested" : "going";
  const active = state === target;

  async function commit(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (active) {
        await api(`/api/plans/${planId}/participation`, { method: "DELETE" });
      } else {
        await api(`/api/plans/${planId}/participation`, {
          method: "PUT",
          body: JSON.stringify({ state: target }),
        });
      }
      onPlanRefresh?.();
    } catch {
      /* surface nothing on the card — they can open the plan to retry */
    } finally {
      setBusy(false);
    }
  }

  const label = active
    ? target === "going"
      ? "✓ You're in"
      : "Interested"
    : isLooking
      ? "Interested"
      : "Join";

  return (
    <button
      type="button"
      className={`plan-card-quick-join ${active ? "is-active" : ""}`}
      onClick={(e) => void commit(e)}
      disabled={busy || disabled}
    >
      {busy ? "…" : label}
    </button>
  );
}
