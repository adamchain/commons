import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { PlanCard } from "../components/PlanCard";
import { useAuth } from "../context/AuthContext";
import { planHasEnded } from "../lib/planTime";
import type { PlanDTO } from "../types/shared";

/**
 * My Plans — the user's plans on their own page (previously a cramped section
 * on the profile). Groups into Hosting, Going, Interested, Saved, and Past
 * (with "Do it again"). Saved plans the feed didn't return are fetched by id.
 */
export function MyPlansPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);

  const savedIds = useMemo(() => new Set(user?.savedPlanIds ?? []), [user?.savedPlanIds]);

  async function load() {
    const feed = await api<PlanDTO[]>("/api/plans").catch(() => [] as PlanDTO[]);
    // Backfill any saved plans the feed didn't include (out of scope / not RSVP'd).
    const have = new Set(feed.map((p) => p.id));
    const missing = [...savedIds].filter((id) => !have.has(id));
    const extra = await Promise.all(
      missing.map((id) => api<PlanDTO>(`/api/plans/${id}`).catch(() => null)),
    );
    setPlans([...feed, ...extra.filter((p): p is PlanDTO => !!p)]);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.savedPlanIds]);

  if (!plans || !user) return <LoadingScreen tagline="Your plans" />;

  const upcoming = (p: PlanDTO) => !p.cancelledAt && !planHasEnded(p);
  const hosting = plans.filter((p) => p.creator.id === user.id && upcoming(p));
  const going = plans.filter((p) => p.creator.id !== user.id && p.myState === "going" && upcoming(p));
  const interested = plans.filter((p) => p.myState === "interested" && upcoming(p));
  const saved = plans.filter(
    (p) => savedIds.has(p.id) && p.creator.id !== user.id && p.myState == null && upcoming(p),
  );
  const past = plans
    .filter((p) => (p.creator.id === user.id || p.myState === "going") && (planHasEnded(p) || p.cancelledAt))
    .sort((a, b) => b.date.localeCompare(a.date));

  const empty =
    hosting.length === 0 &&
    going.length === 0 &&
    interested.length === 0 &&
    saved.length === 0 &&
    past.length === 0;

  return (
    <main className="app-shell app-shell--wide app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to={`/profile/${user.id}`} className="detail-back">← Profile</Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 4 }}>My plans</h1>
      <p className="brand-tagline" style={{ marginBottom: 20 }}>
        Everything you're hosting, in on, saved, or did before.
      </p>

      {empty && (
        <div className="feed-empty" role="status">
          <div className="feed-empty-glyph" aria-hidden="true">📌</div>
          <h2 className="feed-empty-headline">Nothing here yet.</h2>
          <p className="feed-empty-body">Join a plan or tap the ★ on any card to save it for later.</p>
          <div className="feed-empty-actions">
            <Link to="/" className="btn-primary">Browse plans</Link>
          </div>
        </div>
      )}

      <Section title="Hosting" plans={hosting} onRefresh={load} />
      <Section title="Going" plans={going} onRefresh={load} />
      <Section title="Interested" plans={interested} onRefresh={load} />
      <Section title="Saved" plans={saved} onRefresh={load} />

      {past.length > 0 && (
        <section className="my-plans-section">
          <h2 className="my-plans-section-title">Past</h2>
          <div className="plan-grid">
            {past.map((plan) => (
              <div key={plan.id} className="my-plans-past-item">
                <PlanCard plan={plan} onPlanRefresh={load} />
                <Link
                  to={`/plans/new?fromPlanId=${plan.id}&title=${encodeURIComponent(plan.title)}`}
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
          <PlanCard key={plan.id} plan={plan} onPlanRefresh={onRefresh} />
        ))}
      </div>
    </section>
  );
}
