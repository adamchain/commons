import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { FeedbackPrompt } from "../components/FeedbackPrompt";
import { FilterSheet } from "../components/FilterSheet";
import { InviteSheet } from "../components/InviteSheet";
import { LoadingScreen } from "../components/LoadingScreen";
import { NetworkPromptModal } from "../components/NetworkPromptModal";
import { PlanCard } from "../components/PlanCard";
import { WeekStrip } from "../components/WeekStrip";
import { useAuth } from "../context/AuthContext";
import { planHasEnded } from "../lib/planTime";
import type { InterestTag, MeDTO, NeighborhoodDTO, NetworkPromptDTO, PlanDTO } from "../types/shared";

// Feed filters persist across navigation + reload — losing "hide cancelled"
// every time you left the feed was a papercut.
const FEED_FILTERS_KEY = "commons.feedFilters.v1";

type PersistedFilters = {
  selectedTag: InterestTag | null;
  selectedHoodId: string | null;
  hideHappened: boolean;
  hideCancelled: boolean;
};

const EMPTY_FILTERS: PersistedFilters = {
  selectedTag: null,
  selectedHoodId: null,
  hideHappened: false,
  hideCancelled: false,
};

function loadPersistedFilters(): PersistedFilters {
  try {
    const raw = localStorage.getItem(FEED_FILTERS_KEY);
    if (raw) return { ...EMPTY_FILTERS, ...(JSON.parse(raw) as Partial<PersistedFilters>) };
  } catch {
    /* corrupt / unavailable storage — fall back to defaults */
  }
  return EMPTY_FILTERS;
}

export function FeedPage() {
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<InterestTag | null>(() => loadPersistedFilters().selectedTag);
  const [selectedHoodId, setSelectedHoodId] = useState<string | null>(() => loadPersistedFilters().selectedHoodId);
  const [hideHappened, setHideHappened] = useState(() => loadPersistedFilters().hideHappened);
  const [hideCancelled, setHideCancelled] = useState(() => loadPersistedFilters().hideCancelled);
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<"all" | "mine">("all");
  const { user, setUser } = useAuth();
  const [networkPrompt, setNetworkPrompt] = useState<NetworkPromptDTO | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as { justPostedId?: string; openInviteForPlanId?: string } | null;
  const [justPostedId, setJustPostedId] = useState<string | null>(navState?.justPostedId ?? null);
  const [inviteForPlanId, setInviteForPlanId] = useState<string | null>(
    navState?.openInviteForPlanId ?? null,
  );

  const [refreshing, setRefreshing] = useState(false);
  const refreshPlans = () => void api<PlanDTO[]>("/api/plans").then(setPlans).catch(() => setPlans([]));

  useEffect(() => {
    refreshPlans();
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, []);

  // Pull-to-refresh: a downward drag while already scrolled to the top re-pulls
  // the feed. Lightweight (no library) — fires once per gesture past threshold.
  useEffect(() => {
    let startY = 0;
    let armed = false;
    const onStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && e.touches.length === 1) {
        startY = e.touches[0]!.clientY;
        armed = true;
      } else {
        armed = false;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const dy = e.touches[0]!.clientY - startY;
      if (dy > 80) {
        armed = false;
        setRefreshing(true);
        void api<PlanDTO[]>("/api/plans")
          .then(setPlans)
          .catch(() => undefined)
          .finally(() => setTimeout(() => setRefreshing(false), 400));
      }
    };
    const onEnd = () => { armed = false; };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  useEffect(() => {
    if (justPostedId && location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [justPostedId, location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!justPostedId || plans === null) return;
    const el = document.querySelector(`[data-plan-id="${justPostedId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setJustPostedId(null), 4500);
    return () => clearTimeout(t);
  }, [justPostedId, plans]);

  useEffect(() => {
    if (user?.notificationPrefs && user.notificationPrefs.postPlanNetworkNudge === false) {
      setNetworkPrompt(null);
      return;
    }
    void api<{ prompt: NetworkPromptDTO | null }>("/api/auth/network-prompt")
      .then((r) => setNetworkPrompt(r.prompt))
      .catch(() => setNetworkPrompt(null));
  }, [plans, user?.notificationPrefs?.postPlanNetworkNudge]);

  // Persist the sheet filters whenever they change (day selection stays
  // transient — it's tied to the week strip, not a saved preference).
  useEffect(() => {
    try {
      localStorage.setItem(
        FEED_FILTERS_KEY,
        JSON.stringify({ selectedTag, selectedHoodId, hideHappened, hideCancelled }),
      );
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [selectedTag, selectedHoodId, hideHappened, hideCancelled]);

  const filteredPlans = useMemo(() => {
    let list = plans ?? [];
    if (view === "mine") {
      // For "Looking for / my plans" view: plans the user is going or
      // interested in. Includes confirmed + looking-for naturally.
      list = list.filter((p) => p.myState === "going" || p.myState === "interested");
    }
    if (selectedTag) list = list.filter((p) => p.tags.includes(selectedTag));
    if (selectedHoodId) list = list.filter((p) => p.neighborhoodId === selectedHoodId);
    if (selectedDayIso) list = list.filter((p) => p.date.slice(0, 10) === selectedDayIso);
    // Happened = ended and not cancelled (mirrors PlanCard badge logic).
    if (hideHappened) list = list.filter((p) => p.cancelledAt || !planHasEnded(p));
    if (hideCancelled) list = list.filter((p) => !p.cancelledAt);
    if (justPostedId) {
      const pinned = list.find((p) => p.id === justPostedId);
      if (pinned) list = [pinned, ...list.filter((p) => p.id !== justPostedId)];
    }
    list = [...list].sort((a, b) => a.date.localeCompare(b.date));
    return list;
  }, [plans, view, selectedTag, selectedHoodId, selectedDayIso, hideHappened, hideCancelled, justPostedId]);

  const activeFilterCount =
    (selectedTag ? 1 : 0) +
    (selectedHoodId ? 1 : 0) +
    (hideHappened ? 1 : 0) +
    (hideCancelled ? 1 : 0);

  if (plans === null) {
    return <LoadingScreen tagline="Gathering plans" />;
  }

  return (
    <main className="app-shell app-shell--wide app-shell--with-nav app-shell--with-topbar">
      {refreshing && <div className="feed-refreshing" role="status">Refreshing…</div>}
      <FeedbackPrompt />

      <WeekStrip
        plans={plans}
        selectedDayIso={selectedDayIso}
        onSelectDay={setSelectedDayIso}
      />

      <div className="segmented segmented-feed-view" role="tablist" aria-label="Feed scope">
        <button
          type="button"
          role="tab"
          aria-selected={view === "all"}
          className={view === "all" ? "is-active" : ""}
          onClick={() => setView("all")}
        >
          All plans
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "mine"}
          className={view === "mine" ? "is-active" : ""}
          onClick={() => setView("mine")}
        >
          My plans
        </button>
      </div>

      <div className="page-filter-bar">
        <span className="page-filter-bar-label">
          {filteredPlans.length} plan{filteredPlans.length === 1 ? "" : "s"} this week
        </span>
        <button
          type="button"
          className={`page-filter-btn ${activeFilterCount > 0 ? "page-filter-btn--active" : ""}`}
          onClick={() => setFilterOpen(true)}
          aria-label="Filter plans"
        >
          <FilterIcon />
          Filters
          {activeFilterCount > 0 && <span className="page-filter-count">{activeFilterCount}</span>}
        </button>
      </div>

      {networkPrompt && (
        <NetworkPromptModal
          prompt={networkPrompt}
          onClose={() => setNetworkPrompt(null)}
          onUpdated={(me: MeDTO) => setUser(me)}
        />
      )}

      <div id="feed-plans">
        {filteredPlans.length === 0 ? (
          <FeedEmptyState
            view={view}
            hasAnyPlans={(plans?.length ?? 0) > 0}
            hasFilters={activeFilterCount > 0 || selectedDayIso !== null}
            onClearFilters={() => {
              setSelectedTag(null);
              setSelectedHoodId(null);
              setSelectedDayIso(null);
              setHideHappened(false);
              setHideCancelled(false);
            }}
          />
        ) : (
          <div className="plan-grid">
            {filteredPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onPlanRefresh={refreshPlans}
                highlight={justPostedId === plan.id}
                onHideKind={(kind) => {
                  if (kind === "happened") setHideHappened(true);
                  else setHideCancelled(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {inviteForPlanId && (
        <InviteSheet
          planId={inviteForPlanId}
          planTitle={plans.find((p) => p.id === inviteForPlanId)?.title ?? "your plan"}
          onClose={() => setInviteForPlanId(null)}
        />
      )}

      {filterOpen && (
        <FilterSheet
          neighborhoods={neighborhoods}
          userHoodIds={user?.neighborhoodIds ?? (user?.neighborhoodId ? [user.neighborhoodId] : [])}
          userInterests={user?.interests ?? []}
          selectedTag={selectedTag}
          selectedHoodId={selectedHoodId}
          hideHappened={hideHappened}
          hideCancelled={hideCancelled}
          onTagChange={setSelectedTag}
          onHoodChange={setSelectedHoodId}
          onHideHappenedChange={setHideHappened}
          onHideCancelledChange={setHideCancelled}
          onClose={() => setFilterOpen(false)}
          onClear={() => {
            setSelectedTag(null);
            setSelectedHoodId(null);
            setHideHappened(false);
            setHideCancelled(false);
          }}
        />
      )}
    </main>
  );
}

function FeedEmptyState({
  view,
  hasAnyPlans,
  hasFilters,
  onClearFilters,
}: {
  view: "all" | "mine";
  hasAnyPlans: boolean;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  // Pick copy based on what's actually causing the empty result.
  // The 3 buckets the user can hit: filters hide everything; "My plans" tab
  // empty; or truly nothing in the feed (slow week).
  let headline: string;
  let body: string;
  if (hasFilters) {
    headline = "Nothing matches those filters.";
    body = "Try clearing them — there's more going on across the city.";
  } else if (view === "mine") {
    headline = "You haven't joined anything yet.";
    body = "Tap All plans to see what's happening this week.";
  } else if (hasAnyPlans) {
    // Edge case: plans exist but none in the filtered view (rare without filters
    // — usually a stale state). Treat like the slow-week message.
    headline = "Nothing near you this week.";
    body = "Be the first to post.";
  } else {
    headline = "Nothing near you this week.";
    body = "Be the first to post — coffee run, gallery night, pickup soccer. Anything.";
  }

  return (
    <div className="feed-empty" role="status">
      <div className="feed-empty-glyph" aria-hidden="true">
        ☕
      </div>
      <h2 className="feed-empty-headline">{headline}</h2>
      <p className="feed-empty-body">{body}</p>
      <div className="feed-empty-actions">
        {hasFilters ? (
          <button type="button" className="btn-secondary" onClick={onClearFilters}>
            Clear filters
          </button>
        ) : null}
        <Link to="/plans/new" className="btn-primary">
          Post a plan
        </Link>
      </div>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M6 12h12" />
      <path d="M10 18h4" />
    </svg>
  );
}
