import { Link } from "react-router-dom";
import type { PlanDTO } from "../types/shared";
import { formatPlanDate, formatPlanTime } from "../lib/format";
import { useAuth } from "../context/AuthContext";

export function PlanCard({ plan }: { plan: PlanDTO }) {
  const { user } = useAuth();
  const goingCount = plan.participants.going.length;
  const isHosting = user && plan.creator.id === user.id;
  const youAreGoing = plan.myState === "going";

  return (
    <Link to={`/plans/${plan.id}`} className="plan-card">
      <div className="plan-card-header">
        <h3 className="plan-card-title">{plan.title}</h3>
        {isHosting ? (
          <span className="badge">Hosting</span>
        ) : youAreGoing ? (
          <span className="badge">You're in</span>
        ) : plan.myState === "interested" ? (
          <span className="badge badge-muted">Interested</span>
        ) : null}
      </div>

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
