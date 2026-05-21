import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import type { PlanDTO } from "../types/shared";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";

/**
 * Compact event card — title, time, details. Card type (confirmed / looking_for /
 * plan_created) still drives shading and the reply form, but the dense metadata
 * row (avatars, posted-by, distance) is gone per the simplified spec.
 */
export function PlanCard({
  plan,
  onPlanRefresh,
  highlight = false,
}: {
  plan: PlanDTO;
  onPlanRefresh?: () => void;
  highlight?: boolean;
}) {
  const title = sentenceCaseTitle(plan.title);
  const isLooking = plan.planKind === "looking_for";
  const isPlanCreated = isLooking && Boolean(plan.lockedAt);
  const suggestions = plan.suggestions ?? [];
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const { user } = useAuth();
  const canChat =
    !!user &&
    (plan.creator.id === user.id || plan.myState === "going" || plan.myState === "interested");

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

  const whenLine = plan.isFlexibleLocation && plan.isFlexibleTime
    ? "Flexible"
    : plan.isFlexibleLocation
      ? `${formatPlanDate(plan.date)} · Location TBD`
      : plan.isFlexibleTime
        ? `${formatPlanDate(plan.date)} · Time TBD`
        : `${formatPlanDate(plan.date)} · ${formatPlanTime(plan.time, plan.isFlexibleTime)}`;

  return (
    <div
      data-plan-id={plan.id}
      className={`plan-card-outer ${
        isPlanCreated
          ? "plan-card--plan-created"
          : isLooking
            ? "plan-card--looking"
            : "plan-card--confirmed"
      } ${highlight ? "plan-card--just-posted" : ""}`}
    >
      {highlight && <div className="plan-card-just-posted-banner">Just posted · Live on the feed</div>}
      <Link to={`/plans/${plan.id}`} className="plan-card plan-card-link plan-card--compact">
        {plan.flyerDataUrl && (
          <div className="plan-card-flyer">
            <img src={plan.flyerDataUrl} alt="" />
          </div>
        )}
        <h3 className="plan-card-title">{title}</h3>
        <p className="plan-card-when">{whenLine}</p>
        {plan.description && (
          <p className="plan-card-description">{plan.description}</p>
        )}

        {(plan.myState === "going" || plan.myState === "interested") && (
          <div className="plan-card-my-state">
            {plan.myState === "going" && <span className="badge">You&apos;re in</span>}
            {plan.myState === "interested" && <span className="badge badge-muted">Interested</span>}
          </div>
        )}
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

      {isLooking && !isPlanCreated && (
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
