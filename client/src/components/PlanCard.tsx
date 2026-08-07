import { useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "./Avatar";
import { JoinConfirmPopup, joinConfirmKind, type JoinConfirmKind } from "./JoinConfirmPopup";
import { useAuth } from "../context/AuthContext";
import type { PlanDTO } from "../types/shared";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { saveFeedScroll, type NavFromState } from "../lib/navState";
import { planHasEnded } from "../lib/planTime";
import { useNeighborhoods } from "../lib/useNeighborhoods";
import { useCardImages, pickCoverImage } from "../lib/cardImages";

/**
 * Compact event card. Looking-for (2+ flexible fields) gets a red left edge;
 * confirmed plans are plain white. Shows the uploaded flyer, or a stable stock
 * cover from the admin library so cards are never blank.
 */
export function PlanCard({
  plan,
  onPlanRefresh,
  highlight = false,
  highlightFading = false,
  navFrom = { from: "feed" },
}: {
  plan: PlanDTO;
  onPlanRefresh?: () => void;
  highlight?: boolean;
  highlightFading?: boolean;
  navFrom?: NavFromState;
}) {
  const title = sentenceCaseTitle(plan.title);
  const flexCount =
    (plan.isFlexibleTime ? 1 : 0) +
    (plan.isFlexibleLocation ? 1 : 0) +
    (plan.isFlexibleDate ? 1 : 0);
  // Only 2+ flexible fields = Looking For card. One flexible field = confirmed.
  const isLooking = plan.planKind === "looking_for" && flexCount > 1 && !plan.lockedAt;
  const coverPool = useCardImages();
  const coverImage =
    plan.flyerDataUrl ??
    (plan.planKind === "looking_for" ? null : pickCoverImage(coverPool, plan.id));
  const hoods = useNeighborhoods();
  const hoodName = hoods[plan.neighborhoodId]?.name ?? null;
  const isCancelled = Boolean(plan.cancelledAt);
  const hasEnded = !isCancelled && planHasEnded(plan);
  const { user } = useAuth();
  const isHosting = !!user && plan.creator.id === user.id;
  const [linkOpen, setLinkOpen] = useState(false);
  const cardNavigate = useNavigate();

  // Flexible parts say "flexible" — never invent a fixed date that contradicts Lock It In.
  const whenParts: string[] = [];
  if (plan.isFlexibleTime) {
    whenParts.push(formatPlanDate(plan.date));
    whenParts.push("flexible");
  } else {
    whenParts.push(formatPlanDate(plan.date));
    whenParts.push(formatPlanTime(plan.time, false));
  }
  const locationPart = plan.isFlexibleLocation
    ? "flexible"
    : hoodName
      ? `${plan.location.name}`
      : plan.location.name;
  const metaLine = [...whenParts, locationPart].filter(Boolean).join(" · ");

  const goingCount = plan.participants.going.length;
  const interestedCount = plan.participants.interested.length;
  const totalRsvps = goingCount + interestedCount;
  const almostPlan = isLooking && !hasEnded && totalRsvps >= 2;
  const spotsRemaining =
    plan.capacity !== null && !hasEnded && !isCancelled
      ? Math.max(0, plan.capacity - goingCount)
      : null;
  const showSpotsRemaining =
    spotsRemaining !== null && plan.capacity !== null && spotsRemaining > 0 && spotsRemaining <= 3;
  const isFull = plan.capacity !== null && goingCount >= plan.capacity;

  // Going first, then Interested — up to 3 faces so the footer stays compact.
  const facepile = [...plan.participants.going, ...plan.participants.interested].slice(0, 3);

  const footerSuffix = almostPlan
    ? "almost a plan"
    : hasEnded && goingCount >= 1
      ? null
      : isFull && !hasEnded && !isCancelled
        ? "full"
        : showSpotsRemaining
          ? `${spotsRemaining} spot${spotsRemaining === 1 ? "" : "s"} left`
          : null;

  const showWentLabel = hasEnded && goingCount >= 1;
  const showGoingLabel =
    !almostPlan && !hasEnded && (goingCount >= 1 || interestedCount >= 1 || Boolean(footerSuffix));
  const showInterestedLabel = almostPlan
    ? totalRsvps >= 1
    : !hasEnded && interestedCount > 0;
  const showCountLabels = showWentLabel || showGoingLabel || showInterestedLabel;

  // Host-only chip, few minutes after posting, never on past/cancelled.
  const showBanner = highlight && isHosting && !hasEnded && !isCancelled;

  const openPlan = (hash?: string) => {
    if (navFrom.from === "feed") saveFeedScroll();
    cardNavigate(`/plans/${plan.id}${hash ?? ""}`, { state: navFrom });
  };

  const openProfile = (userId: string) => {
    if (navFrom.from === "feed") saveFeedScroll();
    cardNavigate(`/profile/${userId}`, { state: navFrom });
  };

  return (
    <div
      data-plan-id={plan.id}
      className={`plan-card-outer ${
        isLooking ? "plan-card--looking" : "plan-card--confirmed"
      } ${showBanner ? "plan-card--just-posted" : ""} ${hasEnded ? "plan-card--happened" : ""} ${isCancelled ? "plan-card--cancelled" : ""} ${plan.visibility === "network" ? "plan-card--network" : ""}`}
    >
      <Link
        to={`/plans/${plan.id}`}
        state={navFrom}
        onClick={() => {
          if (navFrom.from === "feed") saveFeedScroll();
        }}
        className="plan-card plan-card-link plan-card--compact"
      >
        {coverImage ? (
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
            {plan.communityId && plan.communityName ? (
              <span
                className="plan-card-community-pill"
                role="link"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  cardNavigate(`/communities/${plan.communityId}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    cardNavigate(`/communities/${plan.communityId}`);
                  }
                }}
              >
                {plan.communityName}
              </span>
            ) : null}
          </header>
          <h3 className="plan-card-title">{title}</h3>
          <div className="plan-card-meta-row">
            <p className="plan-card-meta-line plan-card-meta-line--single">
              <span>{metaLine}</span>
            </p>
            {showBanner && (
              <span className={`plan-card-just-posted-chip ${highlightFading ? "is-fading" : ""}`}>
                Just posted
              </span>
            )}
          </div>
          {plan.description && (
            <p className="plan-card-description">{plan.description}</p>
          )}

          {plan.flyerLinkUrl && (
            <a
              href={plan.flyerLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link-preview link-preview--card"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
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
                  <div className="link-preview-title">View link</div>
                )}
                {plan.flyerLinkPreview?.description && (
                  <div className="link-preview-desc">{plan.flyerLinkPreview.description}</div>
                )}
              </div>
            </a>
          )}

          <footer className="plan-card-footer-row">
            <div className="plan-card-attendees">
              {facepile.length > 0 && (
                <div className="avatar-stack">
                  {facepile.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className="avatar-stack-link plan-card-avatar-link"
                      aria-label={`${person.firstName}'s profile`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openProfile(person.id);
                      }}
                    >
                      <Avatar
                        seed={person.avatarSeed}
                        style={person.avatarStyle}
                        photoDataUrl={person.avatarPhotoDataUrl}
                        params={person.avatarParams}
                        size="xs"
                      />
                    </button>
                  ))}
                </div>
              )}
              {showCountLabels && (
                <div className="plan-card-going-count">
                  {showWentLabel && (
                    <button
                      type="button"
                      className="plan-card-going-count--link"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openPlan("#guests");
                      }}
                    >
                      {goingCount} went
                    </button>
                  )}
                  {showGoingLabel && (
                    <button
                      type="button"
                      className="plan-card-going-count--link"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openPlan("#guests");
                      }}
                    >
                      {goingCount} Going
                    </button>
                  )}
                  {showGoingLabel && showInterestedLabel && (
                    <span className="plan-card-going-sep" aria-hidden="true">
                      {" · "}
                    </span>
                  )}
                  {showInterestedLabel && (
                    <button
                      type="button"
                      className="plan-card-going-count--link"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openPlan("#guests");
                      }}
                    >
                      {almostPlan ? totalRsvps : interestedCount} Interested
                    </button>
                  )}
                  {footerSuffix && (showGoingLabel || showInterestedLabel) && (
                    <span className="plan-card-going-sep">
                      {" · "}
                      {footerSuffix}
                    </span>
                  )}
                </div>
              )}
            </div>
            {!isHosting && !hasEnded && !isCancelled && (
              <QuickJoin
                planId={plan.id}
                isLooking={isLooking}
                state={plan.myState ?? null}
                isFull={isFull}
                onPlanRefresh={onPlanRefresh}
              />
            )}
          </footer>
        </div>
      </Link>

      {hasEnded && isHosting && (
        <Link
          to={`/plans/new?fromPlanId=${plan.id}`}
          state={{ hostAgainFrom: plan.id }}
          className="plan-card-host-again"
          onClick={(e) => e.stopPropagation()}
        >
          Host another like this →
        </Link>
      )}

      {linkOpen && plan.flyerLinkUrl && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setLinkOpen(false)}
        >
          <div className="modal-card link-preview-modal" onClick={(e) => e.stopPropagation()}>
            {plan.flyerLinkPreview?.image && (
              <img src={plan.flyerLinkPreview.image} alt="" className="link-preview-image" />
            )}
            <div className="link-preview-body">
              {plan.flyerLinkPreview?.siteName && (
                <div className="link-preview-site">{plan.flyerLinkPreview.siteName}</div>
              )}
              <div className="link-preview-title">
                {plan.flyerLinkPreview?.title ?? "Shared link"}
              </div>
              {plan.flyerLinkPreview?.description && (
                <div className="link-preview-desc">{plan.flyerLinkPreview.description}</div>
              )}
            </div>
            <a
              href={plan.flyerLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary btn-block"
              style={{ marginTop: 12 }}
            >
              Open link
            </a>
            <button type="button" className="btn-link" style={{ marginTop: 8 }} onClick={() => setLinkOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickJoin({
  planId,
  isLooking,
  state,
  isFull,
  onPlanRefresh,
}: {
  planId: string;
  isLooking: boolean;
  state: "going" | "interested" | null;
  isFull?: boolean;
  onPlanRefresh?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [confirm, setConfirm] = useState<JoinConfirmKind | null>(null);

  const goingActive = state === "going";
  const interestedActive = state === "interested";

  async function setState(next: "going" | "interested" | null) {
    if (busy) return;
    setBusy(true);
    setShowSheet(false);
    try {
      if (next) {
        await api(`/api/plans/${planId}/participation`, {
          method: "PUT",
          body: JSON.stringify({ state: next }),
        });
      } else {
        await api(`/api/plans/${planId}/participation`, { method: "DELETE" });
      }
      setConfirm(joinConfirmKind(next));
      onPlanRefresh?.();
    } catch {
      /* surface nothing on the card */
    } finally {
      setBusy(false);
    }
  }

  async function onTap(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || (isFull && !goingActive && !interestedActive && !isLooking)) return;
    if (goingActive) {
      setShowSheet(true);
      return;
    }
    if (interestedActive) {
      // Soft state — open sheet to drop or upgrade to I'm In.
      setShowSheet(true);
      return;
    }
    await setState(isLooking ? "interested" : "going");
  }

  if (isFull && !goingActive && !interestedActive && !isLooking) {
    return (
      <span className="plan-card-quick-join is-full" aria-disabled="true">
        Full
      </span>
    );
  }

  const label = goingActive
    ? "I'm In ✓"
    : interestedActive
      ? "Interested ✓"
      : isLooking
        ? "Interested"
        : "I'm In";

  return (
    <>
      <button
        type="button"
        className={`plan-card-quick-join ${goingActive || interestedActive ? "is-active" : ""}`}
        onClick={(e) => void onTap(e)}
        disabled={busy}
      >
        {busy ? "…" : label}
      </button>
      {confirm && <JoinConfirmPopup kind={confirm} onClose={() => setConfirm(null)} />}
      {showSheet &&
        createPortal(
          <div
            className="sheet-backdrop"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowSheet(false);
            }}
          >
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-title">{goingActive ? "I'm In" : "Interested"}</div>
              {goingActive && (
                <button type="button" className="sheet-link" onClick={() => void setState("interested")}>
                  Switch to Interested
                </button>
              )}
              {interestedActive && !isLooking && !isFull && (
                <button type="button" className="sheet-link" onClick={() => void setState("going")}>
                  Switch to I'm In
                </button>
              )}
              <button
                type="button"
                className="sheet-link sheet-link--danger"
                onClick={() => void setState(null)}
              >
                Drop out
              </button>
              <button type="button" className="btn-link sheet-cancel" onClick={() => setShowSheet(false)}>
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
