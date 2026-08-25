import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Calendar, Star } from "lucide-react";
import { api } from "../api/http";
import { PlanCoverThumb } from "../components/CoverThumb";
import { LoadingScreen } from "../components/LoadingScreen";
import { EmptyCard, Label, ScreenTitle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate, formatPlanTime, sentenceCaseTitle } from "../lib/format";
import { planHasEnded } from "../lib/planTime";
import type { PlanDTO } from "../types/shared";

/**
 * Plans — Upcoming (hosting/going), Interested, and Past.
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

  if (!plans || !user) return <LoadingScreen tagline="Plans" />;

  const isUpcoming = (p: PlanDTO) => !p.cancelledAt && !planHasEnded(p);
  const upcoming = plans
    .filter(
      (p) =>
        isUpcoming(p) &&
        (p.creator.id === user.id || p.myState === "going"),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const interested = plans
    .filter((p) => p.creator.id !== user.id && p.myState === "interested" && isUpcoming(p))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const past = plans
    .filter((p) => (p.creator.id === user.id || p.myState === "going") && (planHasEnded(p) || p.cancelledAt))
    .sort((a, b) => b.date.localeCompare(a.date));

  const empty = upcoming.length === 0 && interested.length === 0 && past.length === 0;
  const activeCount = upcoming.length + interested.length;
  const isThin = !empty && activeCount > 0 && activeCount < 3;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar my-plans-page">
      <ScreenTitle title="Plans" />

      {empty && (
        <EmptyCard
          icon={<Calendar size={22} strokeWidth={1.6} color="#3A6A8A" />}
          tint="#C8DCF0"
          title="No upcoming plans yet."
          body="When you host or join a plan, it'll show up here."
          cta={{ to: "/", label: "See what's happening" }}
        />
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

      <PlanSection
        label={
          <>
            <Calendar size={10} strokeWidth={2} color="var(--muted)" aria-hidden="true" />
            Upcoming
          </>
        }
        plans={upcoming}
      />
      <PlanSection
        label={
          <>
            <Star size={10} strokeWidth={2} color="var(--muted)" aria-hidden="true" />
            Interested
          </>
        }
        plans={interested}
      />

      {past.length > 0 && (
        <section className="my-plans-section">
          <Label>Past</Label>
          <div className="my-plans-rows">
            {past.map((plan) => (
              <div key={plan.id} className="my-plans-past-item">
                <PlanRow plan={plan} />
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

function PlanSection({ label, plans }: { label: ReactNode; plans: PlanDTO[] }) {
  if (plans.length === 0) return null;
  return (
    <section className="my-plans-section">
      <Label>{label}</Label>
      <div className="my-plans-rows">
        {plans.map((plan) => (
          <PlanRow key={plan.id} plan={plan} />
        ))}
      </div>
    </section>
  );
}

function PlanRow({ plan }: { plan: PlanDTO }) {
  const locationPart = plan.isFlexibleLocation
    ? "Flexible location"
    : plan.location.name || null;
  const meta = [
    formatPlanDate(plan.date),
    formatPlanTime(plan.time, plan.isFlexibleTime),
    locationPart,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link to={`/plans/${plan.id}`} state={{ from: "my-plans" }} className="my-plans-row">
      <PlanCoverThumb planId={plan.id} flyerDataUrl={plan.flyerDataUrl} />
      <span className="my-plans-row-text">
        <span className="my-plans-row-name">{sentenceCaseTitle(plan.title)}</span>
        <span className="my-plans-row-meta">{meta}</span>
      </span>
    </Link>
  );
}
