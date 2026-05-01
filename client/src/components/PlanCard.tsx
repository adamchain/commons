import { Link } from "react-router-dom";
import type { PlanDTO } from "../types/shared";
import { formatPlanDate, formatPlanTime } from "../lib/format";
import { Avatar } from "./Avatar";

export function PlanCard({ plan }: { plan: PlanDTO }) {
  const goingCount = plan.participants.going.length;

  return (
    <Link to={`/plans/${plan.id}`} className="plan-card">
      <div className="plan-card-host">
        <Avatar seed={plan.creator.avatarSeed} style={plan.creator.avatarStyle} size="sm" />
        <span className="plan-card-host-name">
          {plan.hostEmoji} {plan.creator.firstName}
        </span>
        {plan.myState === "going" && <span className="badge">You're in</span>}
        {plan.myState === "interested" && <span className="badge badge-muted">Interested</span>}
      </div>

      <h3 className="plan-card-title">{plan.title}</h3>

      <div className="plan-card-meta">
        <div>
          <strong>{plan.location.name}</strong>
        </div>
        <div>
          {formatPlanDate(plan.date)} · {formatPlanTime(plan.time, plan.isFlexibleTime)}
        </div>
      </div>

      {plan.description ? <p className="plan-card-description">{plan.description}</p> : null}

      <div className="plan-card-footer">
        <div className="tag-chip-row">
          {plan.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
        <span className="going-count">{goingCount} going</span>
      </div>
    </Link>
  );
}
