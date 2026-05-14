import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
  const [selectedHoodId, setSelectedHoodId] = useState<string | null>(null);
  const { user, setUser } = useAuth();
  const [networkPrompt, setNetworkPrompt] = useState<NetworkPromptDTO | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  // When the user lands here right after posting a plan, float that plan to
  // the top of the list as confirmation. One-shot — cleared on next render.
  const [justPostedId, setJustPostedId] = useState<string | null>(
    (location.state as { justPostedId?: string } | null)?.justPostedId ?? null,
  );

  const refreshPlans = () => void api<PlanDTO[]>("/api/plans").then(setPlans).catch(() => setPlans([]));

  useEffect(() => {
    refreshPlans();
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (justPostedId && location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [justPostedId, location.pathname, location.state, navigate]);

  // After plans load, scroll the just-posted card into view; clear the banner
  // after a few seconds so the feed returns to normal once acknowledged.
  useEffect(() => {
    if (!justPostedId || plans === null) return;
    const el = document.querySelector(`[data-plan-id="${justPostedId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setJustPostedId(null), 4500);
    return () => clearTimeout(t);
  }, [justPostedId, plans]);

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

  // Two main filter groups per spec: Neighborhoods and Interests. Both are
  // additive narrowers — default leaves everything visible (everyone sees all
  // plans), but selecting a chip restricts the list.
  const filteredPlans = useMemo(() => {
    let list = plans ?? [];
    if (selectedTag) list = list.filter((p) => p.tags.includes(selectedTag));
    if (selectedHoodId) list = list.filter((p) => p.neighborhoodId === selectedHoodId);
    if (selectedDayIso) list = list.filter((p) => p.date.slice(0, 10) === selectedDayIso);
    if (justPostedId) {
      const pinned = list.find((p) => p.id === justPostedId);
      if (pinned) list = [pinned, ...list.filter((p) => p.id !== justPostedId)];
    }
    return list;
  }, [plans, selectedTag, selectedHoodId, selectedDayIso, justPostedId]);

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

      <RegularsNudge plans={plans ?? []} userId={user?.id ?? ""} />

      <NeighborhoodChips
        neighborhoods={neighborhoods}
        userHoodIds={user?.neighborhoodIds ?? (user?.neighborhoodId ? [user.neighborhoodId] : [])}
        selected={selectedHoodId}
        onSelect={setSelectedHoodId}
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
          highlightId={justPostedId}
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
  highlightId,
}: {
  buckets: Buckets;
  hoodById: Map<string, string>;
  viewerCoords?: { lat: number; lng: number };
  onPlanRefresh: () => void;
  highlightId?: string | null;
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
        <Section title="Happening today" plans={buckets.happeningNow} hoodById={hoodById} viewerCoords={viewerCoords} onPlanRefresh={onPlanRefresh} highlightId={highlightId} />
      )}
      {buckets.thisWeek.length > 0 && (
        <Section title="This week" plans={buckets.thisWeek} hoodById={hoodById} viewerCoords={viewerCoords} onPlanRefresh={onPlanRefresh} highlightId={highlightId} />
      )}
      {buckets.later.length > 0 && (
        <Section title="Later" plans={buckets.later} hoodById={hoodById} viewerCoords={viewerCoords} onPlanRefresh={onPlanRefresh} highlightId={highlightId} />
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
  highlightId,
}: {
  title: string;
  plans: PlanDTO[];
  hoodById: Map<string, string>;
  viewerCoords?: { lat: number; lng: number };
  onPlanRefresh: () => void;
  highlightId?: string | null;
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
            highlight={highlightId === plan.id}
          />
        ))}
      </div>
    </>
  );
}

/**
 * "Order from here again" — Uber Eats-style nudge. Scans past plans the user
 * has joined or hosted, picks the most-recent recurring venue, and offers a
 * one-tap "Make a plan here again?" card that prefills CreatePlan.
 */
function RegularsNudge({ plans, userId }: { plans: PlanDTO[]; userId: string }) {
  const pick = useMemo(() => {
    if (!userId) return null;
    const now = Date.now();
    const mine = plans.filter((p) => {
      const ended = new Date(p.date).getTime() < now - 24 * 60 * 60 * 1000;
      const meWent = p.myState === "going" || p.creator.id === userId;
      return ended && meWent && p.location?.name && p.location.name !== "Flexible location";
    });
    if (mine.length === 0) return null;
    // Most-recent venue wins — simple, no scoring needed for the nudge.
    mine.sort((a, b) => b.date.localeCompare(a.date));
    return mine[0] ?? null;
  }, [plans, userId]);

  if (!pick) return null;

  const search = new URLSearchParams();
  search.set("name", pick.location.name);
  if (pick.location.address) search.set("address", pick.location.address);
  if (pick.tags[0]) search.set("tag", pick.tags[0]);

  return (
    <Link to={`/plans/new?${search.toString()}`} className="regulars-nudge">
      <span className="regulars-nudge-emoji" aria-hidden="true">{pick.hostEmoji || "📍"}</span>
      <div className="regulars-nudge-body">
        <div className="regulars-nudge-title">Plan something at {pick.location.name} again?</div>
        <div className="regulars-nudge-sub">You went last time — tap to set it up.</div>
      </div>
      <span className="regulars-nudge-arrow" aria-hidden="true">→</span>
    </Link>
  );
}

// Neighborhood filter — user's own neighborhoods come first, rest follow
// alphabetically. Selecting one restricts the feed to plans in that area.
function NeighborhoodChips({
  neighborhoods,
  userHoodIds,
  selected,
  onSelect,
}: {
  neighborhoods: NeighborhoodDTO[];
  userHoodIds: string[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (neighborhoods.length === 0) return null;
  const mineSet = new Set(userHoodIds);
  const mine = neighborhoods.filter((n) => mineSet.has(n.id));
  const others = neighborhoods
    .filter((n) => !mineSet.has(n.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const ordered = [...mine, ...others];
  return (
    <div className="community-chips community-chips--neighborhoods" role="tablist" aria-label="Neighborhood filter">
      <span className="community-chips-label">Neighborhoods</span>
      <button
        type="button"
        className={`community-chip ${selected === null ? "is-active" : ""}`}
        onClick={() => onSelect(null)}
        role="tab"
        aria-selected={selected === null}
      >
        All areas
      </button>
      {ordered.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`community-chip ${selected === n.id ? "is-active" : ""}`}
          onClick={() => onSelect(selected === n.id ? null : n.id)}
          role="tab"
          aria-selected={selected === n.id}
        >
          {n.name}
        </button>
      ))}
    </div>
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
    <div className="community-chips community-chips--interests" role="tablist" aria-label="Interest filter">
      <span className="community-chips-label">Interests</span>
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
