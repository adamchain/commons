import { useState } from "react";
import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "./Avatar";
import { JoinConfirmPopup, joinConfirmKind, type JoinConfirmKind } from "./JoinConfirmPopup";
import { IdeaCoverFallback, planPhotoUrl } from "./CoverThumb";
import { BottomSheet } from "./ui/BottomSheet";
import { useAuth } from "../context/AuthContext";
import type { PlanDTO } from "../types/shared";
import { formatPlanDate, formatPlanTime, formatPlanWhenWhereLine, sentenceCaseTitle } from "../lib/format";
import { saveFeedScroll, type NavFromState } from "../lib/navState";
import { isIdeaPlan, isPlanAtCapacity, planCapacityValue, planHasEnded } from "../lib/planTime";
import { useCardImages, pickCoverImage } from "../lib/cardImages";

/**
 * Compact event card. Looking-for posts get a red left edge; confirmed
 * plans are plain white. Shows the uploaded flyer; confirmed plans also
 * fall back to a stable stock cover from the admin library.
 */
export function PlanCard({
  plan,
  onPlanRefresh,
  navFrom = { from: "feed" },
}: {
  plan: PlanDTO;
  onPlanRefresh?: () => void;
  navFrom?: NavFromState;
}) {
  const title = sentenceCaseTitle(plan.title);
  const isLooking = isIdeaPlan(plan);
  const coverPool = useCardImages();
  const coverImage =
    planPhotoUrl(plan) ??
    (isIdeaPlan(plan) ? null : pickCoverImage(coverPool, plan.id));
  const isCancelled = Boolean(plan.cancelledAt);
  const hasEnded = !isCancelled && planHasEnded(plan);
  const { user } = useAuth();
  const isHosting = !!user && plan.creator.id === user.id;
  const cardNavigate = useNavigate();

  // Ideas: one "Flexible" when nothing concrete is set. Confirmed plans keep
  // date · time · place, with "flexible" only for the unset slots.
  const metaLine = isLooking ? ideaMetaLine(plan) : confirmedMetaLine(plan);

  const goingCount = plan.participants.going.length;
  const interestedCount = plan.participants.interested.length;
  const capacity = planCapacityValue(plan.capacity);
  const isFull = isPlanAtCapacity(capacity, goingCount);
  const capacityFill =
    capacity !== null && !hasEnded && !isCancelled
      ? `${Math.max(0, capacity - Math.min(goingCount, capacity))}/${capacity} spots`
      : null;

  // Going first, then Interested — up to 3 faces so the footer stays compact.
  const facepile = [...plan.participants.going, ...plan.participants.interested].slice(0, 3);

  const showWentLabel = hasEnded && goingCount >= 1;
  const showGoingLabel = !hasEnded && goingCount >= 1;
  const showInterestedLabel = !hasEnded && interestedCount > 0;

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
      } ${hasEnded ? "plan-card--happened" : ""} ${isCancelled ? "plan-card--cancelled" : ""} ${plan.visibility === "network" ? "plan-card--network" : ""}`}
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
        ) : isLooking ? (
          <div className="plan-card-flyer">
            <IdeaCoverFallback iconSize={42} />
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
            {capacityFill && (
              <button
                type="button"
                className="plan-card-capacity"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openPlan("#guests");
                }}
              >
                {capacityFill}
              </button>
            )}
          </header>
          <h3 className="plan-card-title">{title}</h3>
          <div className="plan-card-meta-row">
            <p className="plan-card-meta-line plan-card-meta-line--single">
              <span>{metaLine}</span>
            </p>
          </div>
          {plan.description && (
            <p className="plan-card-description">{plan.description}</p>
          )}

          {(facepile.length > 0 ||
            showWentLabel ||
            showGoingLabel ||
            showInterestedLabel ||
            (!isHosting && !hasEnded && !isCancelled)) && (
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
                {(showWentLabel || showGoingLabel || showInterestedLabel) && (
                  <GoingCount
                    goingCount={goingCount}
                    interestedCount={interestedCount}
                    showWentLabel={showWentLabel}
                    showGoingLabel={showGoingLabel}
                    showInterestedLabel={showInterestedLabel}
                    onOpenGuests={() => openPlan("#guests")}
                  />
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
          )}
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
    </div>
  );
}

function GoingCount({
  goingCount,
  interestedCount,
  showWentLabel,
  showGoingLabel,
  showInterestedLabel,
  onOpenGuests,
}: {
  goingCount: number;
  interestedCount: number;
  showWentLabel: boolean;
  showGoingLabel: boolean;
  showInterestedLabel: boolean;
  onOpenGuests: () => void;
}) {
  const openGuests = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenGuests();
  };
  return (
    <div className="plan-card-going-count">
      {showWentLabel && (
        <button type="button" className="plan-card-going-count--link" onClick={openGuests}>
          {goingCount} went
        </button>
      )}
      {showGoingLabel && (
        <button type="button" className="plan-card-going-count--link" onClick={openGuests}>
          {goingCount} <span className="plan-card-going-label">Going</span>
        </button>
      )}
      {showGoingLabel && showInterestedLabel && (
        <span className="plan-card-going-sep" aria-hidden="true">|</span>
      )}
      {showInterestedLabel && (
        <button
          type="button"
          className="plan-card-going-count--link plan-card-going-count--link-interested"
          onClick={openGuests}
        >
          {interestedCount} <span className="plan-card-interested-label">Interested</span>
        </button>
      )}
    </div>
  );
}

function ideaMetaLine(plan: PlanDTO): string {
  const parts: string[] = [];
  const dateUnset =
    !plan.isThisWeek && (plan.isFlexibleDate || plan.date.startsWith("2099-12-31"));
  const timeUnset = plan.isFlexibleTime || !plan.time?.trim() || plan.time === "Flexible";
  const locationName = plan.location?.name?.trim() ?? "";
  const locUnset = plan.isFlexibleLocation || !locationName;
  if (plan.isThisWeek) {
    parts.push("This week");
  } else if (!dateUnset) {
    parts.push(formatPlanDate(plan.date, { isFlexibleDate: plan.isFlexibleDate, isThisWeek: plan.isThisWeek }));
  }
  if (!timeUnset) parts.push(formatPlanTime(plan.time, false));
  if (!locUnset) parts.push(locationName);
  if (parts.length > 0) return parts.join(" · ");
  return plan.isFlexibleDate || plan.date.startsWith("2099-12-31") ? "Anytime" : "Flexible";
}

function confirmedMetaLine(plan: PlanDTO): string {
  return formatPlanWhenWhereLine(plan);
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
  isFull: boolean;
  onPlanRefresh?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [confirm, setConfirm] = useState<JoinConfirmKind | null>(null);

  const goingActive = state === "going";
  const interestedActive = state === "interested";
  // Full capacity: this CTA is Interested (waitlist), not I'm In — unless
  // this person already has a Going seat.
  const waitlist = isFull && !goingActive;
  const interestedCta = interestedActive || isLooking || waitlist;

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
      setConfirm(joinConfirmKind(next, { isIdea: isLooking }));
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
    if (busy) return;
    if (goingActive) {
      setShowSheet(true);
      return;
    }
    if (interestedActive) {
      // Soft state — open sheet to drop, or upgrade to I'm In if a spot opened.
      setShowSheet(true);
      return;
    }
    await setState(interestedCta ? "interested" : "going");
  }

  const label = goingActive ? "I'm In" : interestedCta ? "Interested" : "I'm In";

  return (
    <>
      <button
        type="button"
        className={`plan-card-quick-join ${goingActive ? "is-active" : ""} ${
          interestedCta ? "is-interested" : ""
        }`}
        onClick={(e) => void onTap(e)}
        disabled={busy}
      >
        {busy ? "…" : label}
      </button>
      {confirm && <JoinConfirmPopup kind={confirm} onClose={() => setConfirm(null)} />}
      {showSheet && (
          <BottomSheet
            onClose={() => setShowSheet(false)}
            labelledBy="plan-card-rsvp-title"
          >
              <div id="plan-card-rsvp-title" className="sheet-title">{goingActive ? "I'm in." : "Interested"}</div>
              {goingActive && (
                <button type="button" className="sheet-link" onClick={() => void setState("interested")}>
                  Switch to Interested
                </button>
              )}
              {interestedActive && !isLooking && !isFull && (
                <button type="button" className="sheet-link" onClick={() => void setState("going")}>
                  Switch to I&apos;m In
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
          </BottomSheet>
        )}
    </>
  );
}
