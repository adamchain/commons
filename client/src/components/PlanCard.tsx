import { useState } from "react";
import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";
import type { MeDTO, PlanDTO } from "../types/shared";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { planHasEnded } from "../lib/planTime";
import { useNeighborhoods } from "../lib/useNeighborhoods";
import { useCardImages, pickCoverImage } from "../lib/cardImages";

/**
 * Compact event card — title, time, details. Card type (confirmed / looking_for)
 * drives shading; quick RSVP sits below the card link. Invite / Share / Get
 * there and the group chat live on the plan detail page, not the feed card.
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

  const whenLine = plan.isFlexibleTime
    ? `${formatPlanDate(plan.date)} · Flexible time`
    : `${formatPlanDate(plan.date)} · ${formatPlanTime(plan.time, plan.isFlexibleTime)}`;

  const goingCount = plan.participants.going.length;
  const interestedCount = plan.participants.interested.length;
  const totalRsvps = goingCount + interestedCount;
  const almostPlan = isLooking && !isPlanCreated && !hasEnded && totalRsvps >= 2;
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
        <div className="plan-card-body">
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
            ) : null}
          </header>
          <h3 className="plan-card-title">{title}</h3>
          <p className="plan-card-meta-line">
            <span className="plan-card-meta-icon" aria-hidden="true">
              <CalendarIcon />
            </span>
            <span>{whenLine}</span>
          </p>
          <p className="plan-card-meta-line plan-card-meta-line--location">
            <span className="plan-card-meta-icon" aria-hidden="true">
              <PinIcon />
            </span>
            <span>{locationLine}</span>
          </p>
          {plan.description && (
            <p className="plan-card-description">{plan.description}</p>
          )}

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
        </div>
      </Link>

      {hasEnded && isHosting && (
        <Link to="/plans/new" className="plan-card-host-again" onClick={(e) => e.stopPropagation()}>
          Host another like this →
        </Link>
      )}

    </div>
  );
}

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
  const navigate = useNavigate();
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
        onPlanRefresh?.();
      } else {
        await api(`/api/plans/${planId}/participation`, {
          method: "PUT",
          body: JSON.stringify({ state: target }),
        });
        onPlanRefresh?.();
        if (isLooking) {
          navigate(`/plans/${planId}/chat`);
        }
      }
    } catch {
      /* surface nothing on the card */
    } finally {
      setBusy(false);
    }
  }

  const label = active
    ? "You're in"
    : isLooking
      ? "Interested"
      : "I'm in";

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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
