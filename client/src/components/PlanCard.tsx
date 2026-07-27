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

/**
 * Compact event card. Looking-for (2+ flexible fields) gets a red left edge;
 * confirmed plans are plain white. No stock cover images — photo only if uploaded.
 */
export function PlanCard({
  plan,
  onPlanRefresh,
  highlight = false,
  highlightFading = false,
}: {
  plan: PlanDTO;
  onPlanRefresh?: () => void;
  highlight?: boolean;
  highlightFading?: boolean;
}) {
  const title = sentenceCaseTitle(plan.title);
  const flexCount = (plan.isFlexibleTime ? 1 : 0) + (plan.isFlexibleLocation ? 1 : 0);
  // Only 2+ flexible fields = Looking For card. One flexible field = confirmed.
  const isLooking = plan.planKind === "looking_for" && flexCount > 1 && !plan.lockedAt;
  const coverImage = plan.flyerDataUrl ?? null;
  const hoods = useNeighborhoods();
  const hoodName = hoods[plan.neighborhoodId]?.name ?? null;
  const isCancelled = Boolean(plan.cancelledAt);
  const hasEnded = !isCancelled && planHasEnded(plan);
  const { user, setUser } = useAuth();
  const isHosting = !!user && plan.creator.id === user.id;
  const isSaved = !!user?.savedPlanIds?.includes(plan.id);
  const [savePending, setSavePending] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const cardNavigate = useNavigate();

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

  const footerCount = almostPlan
    ? `${totalRsvps} interested · almost a plan`
    : hasEnded && goingCount >= 1
      ? `${goingCount} went`
      : isFull && !hasEnded && !isCancelled
        ? `${goingCount} going · full`
        : showSpotsRemaining
          ? `${goingCount} going · ${spotsRemaining} spot${spotsRemaining === 1 ? "" : "s"} left`
          : goingCount >= 1 || interestedCount >= 1
            ? `${goingCount} going${interestedCount > 0 ? ` · ${interestedCount} interested` : ""}`
            : null;

  // Host-only banner, few minutes after posting, never on past/cancelled.
  const showBanner = highlight && isHosting && !hasEnded && !isCancelled;

  return (
    <div
      data-plan-id={plan.id}
      className={`plan-card-outer ${
        isLooking ? "plan-card--looking" : "plan-card--confirmed"
      } ${showBanner ? "plan-card--just-posted" : ""} ${hasEnded ? "plan-card--happened" : ""} ${isCancelled ? "plan-card--cancelled" : ""} ${plan.visibility === "network" ? "plan-card--network" : ""}`}
    >
      {user && (
        <button
          type="button"
          className={`plan-card-save-btn ${isSaved ? "is-saved" : ""} ${!coverImage ? "plan-card-save-btn--body" : ""}`}
          onClick={(e) => void toggleSave(e)}
          disabled={savePending}
          aria-pressed={isSaved}
          aria-label={isSaved ? "Saved — tap to unsave" : "Save to Your plans"}
          title={isSaved ? "Saved" : "Save"}
        >
          {isSaved ? "★" : "☆"}
        </button>
      )}
      <Link to={`/plans/${plan.id}`} className="plan-card plan-card-link plan-card--compact">
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
                isFull={isFull}
                onPlanRefresh={onPlanRefresh}
              />
            )}
          </footer>
        </div>
      </Link>

      {hasEnded && isHosting && (
        <Link
          to="/plans/new"
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
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  // Feed: one outlined Join pill. Interested lives only on plan detail.
  const target: "going" | "interested" = isLooking ? "interested" : "going";
  const active = state === "going" || state === "interested";

  async function commit(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || (isFull && !active && !isLooking)) return;
    if (active) {
      navigate(`/plans/${planId}`);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/plans/${planId}/participation`, {
        method: "PUT",
        body: JSON.stringify({ state: target }),
      });
      onPlanRefresh?.();
    } catch {
      /* surface nothing on the card */
    } finally {
      setBusy(false);
    }
  }

  if (isFull && !active && !isLooking) {
    return (
      <span className="plan-card-quick-join is-full" aria-disabled="true">
        Full
      </span>
    );
  }

  const label = active ? "You're in ✓" : "Join";

  return (
    <button
      type="button"
      className={`plan-card-quick-join ${active ? "is-active" : ""}`}
      onClick={(e) => void commit(e)}
      disabled={busy}
    >
      {busy ? "…" : label}
    </button>
  );
}
