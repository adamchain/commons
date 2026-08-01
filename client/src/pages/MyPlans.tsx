import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { PlanCard } from "../components/PlanCard";
import { useAuth } from "../context/AuthContext";
import { planHasEnded } from "../lib/planTime";
import type { PlanDTO } from "../types/shared";

/**
 * My Plans — the user's plans on their own page (previously a cramped section
 * on the profile). Groups into Hosting, Going, Interested, and Past
 * (with "Do it again").
 */
export function MyPlansPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);

  async function load() {
    const feed = await api<PlanDTO[]>("/api/plans").catch(() => [] as PlanDTO[]);
    setPlans(feed);
  }

  useEffect(() => {
    void load();
  }, [user?.id]);

  if (!plans || !user) return <LoadingScreen tagline="Your plans" />;

  const upcoming = (p: PlanDTO) => !p.cancelledAt && !planHasEnded(p);
  const hosting = plans.filter((p) => p.creator.id === user.id && upcoming(p));
  const going = plans.filter((p) => p.creator.id !== user.id && p.myState === "going" && upcoming(p));
  const interested = plans.filter(
    (p) => p.creator.id !== user.id && p.myState === "interested" && upcoming(p),
  );
  const past = plans
    .filter((p) => (p.creator.id === user.id || p.myState === "going") && (planHasEnded(p) || p.cancelledAt))
    .sort((a, b) => b.date.localeCompare(a.date));

  const empty =
    hosting.length === 0 &&
    going.length === 0 &&
    interested.length === 0 &&
    past.length === 0;
  // 2.13 — a couple lonely RSVPs still feel thin; nudge toward Explore/Communities
  // rather than leaving the page looking done.
  const activeCount = hosting.length + going.length + interested.length;
  const isThin = !empty && activeCount > 0 && activeCount < 3;

  return (
    <main className="app-shell app-shell--wide app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to={`/profile/${user.id}`} className="detail-back">← Profile</Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 4 }}>My plans</h1>
      <p className="brand-tagline" style={{ marginBottom: 20 }}>
        Everything you're hosting, in on, interested in, or did before.
      </p>

      {empty && (
        <div className="feed-empty" role="status">
          <div className="feed-empty-glyph" aria-hidden="true">📌</div>
          <h2 className="feed-empty-headline">No plans yet</h2>
          <p className="feed-empty-body">Join something from the feed — see what's happening this week.</p>
          <div className="feed-empty-actions">
            <Link to="/" className="btn-primary">See what's happening →</Link>
            <Link to="/communities" className="btn-secondary">Explore communities</Link>
          </div>
        </div>
      )}

      {isThin && (
        <div className="my-plans-explore-cta">
          <p>
            Want more on your plate? <Link to="/communities">Explore communities</Link>
            {" · "}
            <Link to="/">Browse the feed</Link>
          </p>
        </div>
      )}

      <Section title="Hosting" plans={hosting} onRefresh={load} />
      <Section title="Going" plans={going} onRefresh={load} />
      <Section title="Interested" plans={interested} onRefresh={load} />

      {past.length > 0 && (
        <section className="my-plans-section">
          <h2 className="my-plans-section-title">Past</h2>
          <div className="plan-grid">
            {past.map((plan) => (
              <div key={plan.id} className="my-plans-past-item">
                <PlanCard plan={plan} onPlanRefresh={load} />
                <Link
                  to={`/plans/new?fromPlanId=${plan.id}&title=${encodeURIComponent(plan.title)}`}
                  state={{ hostAgainFrom: plan.id }}
                  className="btn-secondary btn-block my-plans-do-again"
                >
                  Do it again
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Section({
  title,
  plans,
  onRefresh,
}: {
  title: string;
  plans: PlanDTO[];
  onRefresh: () => void;
}) {
  if (plans.length === 0) return null;
  return (
    <section className="my-plans-section">
      <h2 className="my-plans-section-title">
        {title} <span className="my-plans-section-count">{plans.length}</span>
      </h2>
      <div className="plan-grid">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onPlanRefresh={onRefresh} navFrom={{ from: "my-plans" }} />
        ))}
      </div>
    </section>
  );
}
