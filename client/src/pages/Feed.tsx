import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { PlanCard } from "../components/PlanCard";
import { ThemeToggle } from "../components/ThemeToggle";
import { LoadingScreen } from "../components/LoadingScreen";
import type { PlanDTO } from "../types/shared";
import { useAuth } from "../context/AuthContext";

export function FeedPage() {
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    void api<PlanDTO[]>("/api/plans")
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  if (plans === null) {
    return <LoadingScreen tagline="Gathering plans" />;
  }

  const goingCount = plans.filter((p) => p.myState === "going").length;
  const interestedCount = plans.filter((p) => p.myState === "interested").length;

  return (
    <main className="app-shell app-shell--wide">
      <header className="app-header">
        <div>
          <h1 className="brand">COMMONS</h1>
          <p className="brand-tagline">Plans, made together</p>
        </div>
        <div className="app-header-actions">
          <Link to="/plans/new" className="app-header-cta">
            + Make a plan
          </Link>
          <ThemeToggle />
          <button
            type="button"
            className="user-pill"
            onClick={() => void logout()}
            title="Sign out"
          >
            <span className="avatar avatar-sm" aria-hidden="true">
              {user?.displayName.charAt(0).toUpperCase() ?? "?"}
            </span>
            {user?.displayName ?? "Sign out"}
          </button>
        </div>
      </header>

      <h2 className="section-title">Upcoming</h2>

      <div className="feed-stats">
        <span className="stat">
          <strong>{plans.length}</strong> plans on the board
        </span>
        {goingCount > 0 ? (
          <span className="stat stat--accent">
            <strong>{goingCount}</strong> you're in on
          </span>
        ) : null}
        {interestedCount > 0 ? (
          <span className="stat">
            <strong>{interestedCount}</strong> you're interested in
          </span>
        ) : null}
      </div>

      {plans.length === 0 ? (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No plans yet. Be the first to post one.</p>
        </div>
      ) : (
        <div className="plan-grid">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}

      <Link to="/plans/new" className="fab-create">
        + Make a plan
      </Link>
    </main>
  );
}
