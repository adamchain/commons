import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Calendar, Star } from "lucide-react";
import { api } from "../api/http";
import { PlanCoverThumb, planPhotoUrl } from "../components/CoverThumb";
import { InterestGlyph } from "../components/InterestGlyph";
import { LoadingScreen } from "../components/LoadingScreen";
import { EmptyCard, Label, ScreenTitle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { formatPlanWhenWhereLine, sentenceCaseTitle } from "../lib/format";
import { hrefForBack } from "../lib/navState";
import { isIdeaPlan, planHasEnded } from "../lib/planTime";
import type { NavFromState } from "../lib/navState";
import type { PlanDTO } from "../types/shared";

/**
 * Plans — Upcoming (hosting/going), Interested, and Past.
 */
export function MyPlansPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navFrom = (location.state as NavFromState | null) ?? null;
  const backHref = hrefForBack(navFrom);
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
      {navFrom?.from === "profile" && (
        <header className="app-header app-header--minimal">
          <Link to={backHref} className="back-circle" aria-label="Back">
            <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
        </header>
      )}
      <ScreenTitle title="Plans" />

      {empty && (
        <EmptyCard
          icon={<Calendar size={22} strokeWidth={1.6} color="#3A6A8A" />}
          tint="#C8DCF0"
          title="Quiet week."
          body="Go find something — or start one."
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
  const meta = formatPlanWhenWhereLine(plan);

  return (
    <Link to={`/plans/${plan.id}`} state={{ from: "my-plans" }} className="my-plans-row">
      <span className="cover-thumb-wrap">
        <PlanCoverThumb planId={plan.id} flyerDataUrl={planPhotoUrl(plan)} isIdea={isIdeaPlan(plan)} />
        {plan.tags[0] ? <InterestGlyph tag={plan.tags[0]} size={22} /> : null}
      </span>
      <span className="my-plans-row-text">
        <span className="my-plans-row-name">{sentenceCaseTitle(plan.title)}</span>
        <span className="my-plans-row-meta">{meta}</span>
      </span>
    </Link>
  );
}
