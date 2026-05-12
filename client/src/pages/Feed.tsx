import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { FeedbackPrompt } from "../components/FeedbackPrompt";
import { LoadingScreen } from "../components/LoadingScreen";
import { NetworkPromptModal } from "../components/NetworkPromptModal";
import { PlanCard } from "../components/PlanCard";
import { WeekGlance } from "../components/WeekGlance";
import { useAuth } from "../context/AuthContext";
import type { InterestTag, MeDTO, NeighborhoodDTO, NetworkPromptDTO, PlanDTO } from "../types/shared";
import { ALL_INTERESTS, INTEREST_LABELS } from "../types/shared";

export function FeedPage() {
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<InterestTag | null>(null);
  const { user, setUser } = useAuth();
  const [networkPrompt, setNetworkPrompt] = useState<NetworkPromptDTO | null>(null);

  const refreshPlans = () => void api<PlanDTO[]>("/api/plans").then(setPlans).catch(() => setPlans([]));

  useEffect(() => {
    refreshPlans();
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, []);

  useEffect(() => {
    void api<{ prompt: NetworkPromptDTO | null }>("/api/auth/network-prompt")
      .then((r) => setNetworkPrompt(r.prompt))
      .catch(() => setNetworkPrompt(null));
  }, [plans]);


  const hoodById = useMemo(() => new Map(neighborhoods.map((n) => [n.id, n.name])), [neighborhoods]);

  const primaryHoodId = user ? user.neighborhoodIds?.[0] ?? user.neighborhoodId : null;
  const myNeighborhood = primaryHoodId ? neighborhoods.find((n) => n.id === primaryHoodId) : undefined;
  const viewerCoords =
    myNeighborhood && typeof myNeighborhood.lat === "number" && typeof myNeighborhood.lng === "number"
      ? { lat: myNeighborhood.lat, lng: myNeighborhood.lng }
      : undefined;

  // Apply chip + day filters to the raw plan list before bucketing/rendering.
  // No interest cap — selecting a chip narrows; default "For you" leaves all plans
  // visible so the algorithm ranks but never hides.
  const filteredPlans = useMemo(() => {
    let list = plans ?? [];
    if (selectedTag) list = list.filter((p) => p.tags.includes(selectedTag));
    if (selectedDayIso) list = list.filter((p) => p.date.slice(0, 10) === selectedDayIso);
    return list;
  }, [plans, selectedTag, selectedDayIso]);

  const buckets = useMemo(() => bucketByWhen(filteredPlans), [filteredPlans]);

  const viewerGoingPlanIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of plans ?? []) {
      if (p.myState === "going") set.add(p.id);
    }
    return set;
  }, [plans]);

  if (plans === null) {
    return <LoadingScreen tagline="Gathering plans" />;
  }

  return (
    <main className="app-shell app-shell--wide app-shell--with-nav">
      <header className="app-header app-header--minimal">
        <h1 className="brand">COMMONS</h1>
      </header>

      <FeedbackPrompt />

      <WeekGlance
        plans={plans}
        viewerGoingPlanIds={viewerGoingPlanIds}
        selectedDayIso={selectedDayIso}
        onSelectDay={(iso) => {
          setSelectedDayIso(iso);
          if (iso) {
            // Scroll the feed area into view so the result is visible.
            requestAnimationFrame(() => {
              document.getElementById("feed-plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }
        }}
      />

      <CommunityChips
        userInterests={user?.interests ?? []}
        selected={selectedTag}
        onSelect={setSelectedTag}
      />

      {networkPrompt && (
        <NetworkPromptModal
          prompt={networkPrompt}
          onClose={() => setNetworkPrompt(null)}
          onUpdated={(me: MeDTO) => setUser(me)}
        />
      )}

      <div id="feed-plans">
        <ListView
          buckets={buckets}
          hoodById={hoodById}
          viewerCoords={viewerCoords}
          onPlanRefresh={refreshPlans}
        />
      </div>
    </main>
  );
}

interface Buckets {
  happeningNow: PlanDTO[];
  thisWeek: PlanDTO[];
  later: PlanDTO[];
}

function bucketByWhen(plans: PlanDTO[]): Buckets {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const sevenOut = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const happeningNow: PlanDTO[] = [];
  const thisWeek: PlanDTO[] = [];
  const later: PlanDTO[] = [];
  for (const p of plans) {
    const d = new Date(p.date);
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    if (dayStart.getTime() === today.getTime()) happeningNow.push(p);
    else if (dayStart.getTime() < sevenOut.getTime()) thisWeek.push(p);
    else later.push(p);
  }
  return { happeningNow, thisWeek, later };
}

function ListView({
  buckets,
  hoodById,
  viewerCoords,
  onPlanRefresh,
}: {
  buckets: Buckets;
  hoodById: Map<string, string>;
  viewerCoords?: { lat: number; lng: number };
  onPlanRefresh: () => void;
}) {
  const total = buckets.happeningNow.length + buckets.thisWeek.length + buckets.later.length;
  if (total === 0) {
    return (
      <div className="empty-state empty-state-feed">
        <p style={{ margin: 0 }}>Nothing yet — be the first to post a plan.</p>
        <Link to="/plans/new" className="btn-primary" style={{ marginTop: 16, display: "inline-block" }}>
          Post something
        </Link>
      </div>
    );
  }
  return (
    <>
      {buckets.happeningNow.length > 0 && (
        <Section title="Happening today" plans={buckets.happeningNow} hoodById={hoodById} viewerCoords={viewerCoords} onPlanRefresh={onPlanRefresh} />
      )}
      {buckets.thisWeek.length > 0 && (
        <Section title="This week" plans={buckets.thisWeek} hoodById={hoodById} viewerCoords={viewerCoords} onPlanRefresh={onPlanRefresh} />
      )}
      {buckets.later.length > 0 && (
        <Section title="Later" plans={buckets.later} hoodById={hoodById} viewerCoords={viewerCoords} onPlanRefresh={onPlanRefresh} />
      )}
    </>
  );
}

function Section({
  title,
  plans,
  hoodById,
  viewerCoords,
  onPlanRefresh,
}: {
  title: string;
  plans: PlanDTO[];
  hoodById: Map<string, string>;
  viewerCoords?: { lat: number; lng: number };
  onPlanRefresh: () => void;
}) {
  return (
    <>
      <h2 className="section-title">{title}</h2>
      <div className="plan-grid">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            neighborhoodName={hoodById.get(plan.neighborhoodId)}
            viewerCoords={viewerCoords}
            onPlanRefresh={onPlanRefresh}
          />
        ))}
      </div>
    </>
  );
}

// All interests render as filters on every feed — the user's own picks come
// first so their categories are obvious, but the remaining tags stay visible
// so the feed is browsable past the personal slice. No 3-interest cap.
function CommunityChips({
  userInterests,
  selected,
  onSelect,
}: {
  userInterests: InterestTag[];
  selected: InterestTag | null;
  onSelect: (tag: InterestTag | null) => void;
}) {
  const userSet = new Set(userInterests);
  const ordered: InterestTag[] = [
    ...userInterests,
    ...ALL_INTERESTS.filter((t) => !userSet.has(t)),
  ];
  return (
    <div className="community-chips" role="tablist" aria-label="Community filter">
      <button
        type="button"
        className={`community-chip ${selected === null ? "is-active" : ""}`}
        onClick={() => onSelect(null)}
        role="tab"
        aria-selected={selected === null}
      >
        For you
      </button>
      {ordered.map((tag) => (
        <button
          key={tag}
          type="button"
          className={`community-chip ${selected === tag ? "is-active" : ""}`}
          onClick={() => onSelect(selected === tag ? null : tag)}
          role="tab"
          aria-selected={selected === tag}
        >
          {INTEREST_LABELS[tag]}
        </button>
      ))}
    </div>
  );
}
