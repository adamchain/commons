import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Coffee, MessageCircle, SlidersHorizontal } from "lucide-react";
import { api } from "../api/http";
import { FilterSheet } from "../components/FilterSheet";
import { InviteSheet } from "../components/InviteSheet";
import { NetworkPromptModal } from "../components/NetworkPromptModal";
import { PlanCard } from "../components/PlanCard";
import { PostSuccessSheet } from "../components/PostSuccessSheet";
import { WeekStrip } from "../components/WeekStrip";
import { useAuth } from "../context/AuthContext";
import { planHasEnded } from "../lib/planTime";
import { consumeFeedScroll } from "../lib/navState";
import { useNeighborhoods } from "../lib/useNeighborhoods";
import { FORUM_INTERESTS, INTEREST_LABELS } from "../types/shared";
import type { AgeRange, InterestTag, MeDTO, NetworkPromptDTO, PlanDTO } from "../types/shared";

// F.2 — shown once on the first Home load, pointing new users at a forum
// matching one of their picked interests. Dismissible; never reappears once
// dismissed (or once it's been shown and clicked through).
const HOME_FORUM_SUGGESTION_KEY = "commons.homeForumSuggestion.v1.dismissed";

// Feed filters persist across navigation + reload — losing "hide cancelled"
// every time you left the feed was a papercut.
const FEED_FILTERS_KEY = "commons.feedFilters.v1";

type PersistedFilters = {
  selectedTag: InterestTag | null;
  selectedHoodId: string | null;
  selectedAgeRange: AgeRange | null;
  hideCancelled: boolean;
};

const PULL_THRESHOLD = 52;
const PULL_MAX = 96;
// Minimum time the refresh spinner stays up, so a fast API response doesn't
// flash the spinner in and out (which read as glitchy).
const PULL_MIN_SPIN_MS = 1250;

function rubberBandPull(dy: number): number {
  return Math.min(dy * 0.5, PULL_MAX);
}

const EMPTY_FILTERS: PersistedFilters = {
  selectedTag: null,
  selectedHoodId: null,
  selectedAgeRange: null,
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
  const [plans, setPlans] = useState<PlanDTO[]>([]);
  const [feedReady, setFeedReady] = useState(false);
  const neighborhoodMap = useNeighborhoods();
  const neighborhoods = useMemo(() => Object.values(neighborhoodMap), [neighborhoodMap]);
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<InterestTag | null>(() => loadPersistedFilters().selectedTag);
  const [selectedHoodId, setSelectedHoodId] = useState<string | null>(() => loadPersistedFilters().selectedHoodId);
  const [selectedAgeRange, setSelectedAgeRange] = useState<AgeRange | null>(() => loadPersistedFilters().selectedAgeRange);
  const [hideCancelled, setHideCancelled] = useState(() => loadPersistedFilters().hideCancelled);
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<"all" | "mine">("all");
  const { user, setUser } = useAuth();
  const [networkPrompt, setNetworkPrompt] = useState<NetworkPromptDTO | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as {
    justPostedId?: string;
    openInviteForPlanId?: string;
    showPostSuccess?: boolean;
  } | null;
  // justPostedId pins the freshly-created plan to the very top for the whole
  // feed session and scrolls it into view once.
  const [justPostedId] = useState<string | null>(navState?.justPostedId ?? null);
  const [inviteForPlanId, setInviteForPlanId] = useState<string | null>(
    navState?.openInviteForPlanId ?? null,
  );
  const [postSuccessId, setPostSuccessId] = useState<string | null>(
    navState?.showPostSuccess ? navState?.justPostedId ?? null : null,
  );
  const [forumSuggestionDismissed, setForumSuggestionDismissed] = useState(() => {
    try {
      return localStorage.getItem(HOME_FORUM_SUGGESTION_KEY) === "1";
    } catch {
      return false;
    }
  });
  const suggestedForumTag = useMemo<InterestTag | null>(() => {
    if (!user?.interests?.length) return null;
    return user.interests.find((t) => FORUM_INTERESTS.includes(t)) ?? null;
  }, [user?.interests]);
  const dismissForumSuggestion = useCallback(() => {
    setForumSuggestionDismissed(true);
    try {
      localStorage.setItem(HOME_FORUM_SUGGESTION_KEY, "1");
    } catch {
      /* storage unavailable — the card will just show again next load */
    }
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const pullRef = useRef({ startY: 0, armed: false, distance: 0 });
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const skipRestoreOnce = useRef(Boolean(navState?.justPostedId));

  const setPullVisual = useCallback((distance: number, spinning = false) => {
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    if (!content || !indicator) return;

    const progress = Math.min(distance / PULL_THRESHOLD, 1);
    content.style.transform = distance > 0 ? `translate3d(0, ${distance}px, 0)` : "";
    indicator.style.opacity = spinning ? "1" : String(Math.max(0.15, progress));
    indicator.style.transform = `translate3d(-50%, ${Math.max(0, distance - 24)}px, 0) scale(${0.55 + progress * 0.45})`;

    const spinner = indicator.querySelector<HTMLElement>(".feed-pull-spinner");
    if (!spinner) return;
    spinner.classList.toggle("is-spinning", spinning);
    if (!spinning) spinner.style.transform = `rotate(${progress * 300}deg)`;
    else spinner.style.transform = "";
  }, []);

  const resetPullVisual = useCallback(() => {
    const content = contentRef.current;
    const indicator = indicatorRef.current;
    const ease = "transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease";
    if (content) {
      content.style.transition = ease;
      content.style.transform = "";
    }
    if (indicator) {
      indicator.style.transition = ease;
      indicator.style.opacity = "0";
      indicator.style.transform = "translate3d(-50%, 0, 0) scale(0.55)";
    }
    window.setTimeout(() => {
      if (content) content.style.transition = "";
      if (indicator) indicator.style.transition = "";
    }, 210);
    pullRef.current.distance = 0;
    pullRef.current.armed = false;
  }, []);

  const fetchPlans = useCallback(async (opts?: { pull?: boolean }) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    const showPull = Boolean(opts?.pull);
    const startedAt = Date.now();
    if (showPull) {
      // Pull / Home refresh always returns to the regular (non day-filtered) feed.
      setSelectedDayIso(null);
      setRefreshing(true);
      setPullVisual(pullRef.current.distance || 36, true);
    }
    try {
      const rows = await api<PlanDTO[]>("/api/plans");
      setPlans(rows);
      setFeedReady(true);
    } catch {
      setPlans((prev) => (prev.length ? prev : []));
      setFeedReady(true);
    } finally {
      // Keep the spinner up for a minimum beat so a fast response doesn't flash
      // in and out — that flicker is what made the refresh feel glitchy.
      if (showPull) {
        const elapsed = Date.now() - startedAt;
        await new Promise((r) => setTimeout(r, Math.max(0, PULL_MIN_SPIN_MS - elapsed)));
      }
      refreshingRef.current = false;
      setRefreshing(false);
      if (showPull) resetPullVisual();
    }
  }, [resetPullVisual, setPullVisual]);

  const refreshPlans = useCallback(() => {
    void fetchPlans();
  }, [fetchPlans]);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  // Tapping Home while already on the feed snaps to top and re-pulls plans.
  useEffect(() => {
    const onHomeRefresh = () => {
      window.scrollTo(0, 0);
      void fetchPlans({ pull: true });
    };
    window.addEventListener("commons:home-refresh", onHomeRefresh);
    return () => window.removeEventListener("commons:home-refresh", onHomeRefresh);
  }, [fetchPlans]);

  // Pull-to-refresh tuned for iPhone: follow the finger with a rubber-band
  // transform, then release into a spinner — no layout-jumping status text.
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (window.scrollY <= 1 && e.touches.length === 1) {
        pullRef.current.startY = e.touches[0]!.clientY;
        pullRef.current.armed = true;
      } else {
        pullRef.current.armed = false;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!pullRef.current.armed || refreshingRef.current) return;
      const dy = e.touches[0]!.clientY - pullRef.current.startY;
      if (dy <= 0) {
        pullRef.current.distance = 0;
        setPullVisual(0);
        return;
      }
      if (window.scrollY > 1) {
        pullRef.current.armed = false;
        return;
      }
      e.preventDefault();
      const distance = rubberBandPull(dy);
      pullRef.current.distance = distance;
      setPullVisual(distance);
    };
    const onEnd = () => {
      if (!pullRef.current.armed && pullRef.current.distance <= 0) return;
      const { distance } = pullRef.current;
      pullRef.current.armed = false;
      if (distance >= PULL_THRESHOLD) {
        void fetchPlans({ pull: true });
      } else {
        resetPullVisual();
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [fetchPlans, resetPullVisual, setPullVisual]);

  useEffect(() => {
    if (justPostedId && location.state) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [justPostedId, location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!justPostedId || !feedReady) return;
    const el = document.querySelector(`[data-plan-id="${justPostedId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [justPostedId, feedReady]);

  // Restore scroll position when returning from a plan detail view.
  useEffect(() => {
    if (!feedReady) return;
    // Just-posted scroll owns the viewport once — don't fight it.
    if (skipRestoreOnce.current) {
      skipRestoreOnce.current = false;
      return;
    }
    const y = consumeFeedScroll();
    if (y != null && y > 0) {
      // Double rAF waits for layout after skeleton → cards swap.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo(0, y));
      });
    }
  }, [feedReady, justPostedId, location.key]);

  // Fetch once on mount / when the nudge pref (or user) changes — not when
  // plans reload, which was re-hitting network-prompt on every feed refresh.
  useEffect(() => {
    if (user?.notificationPrefs && user.notificationPrefs.postPlanNetworkNudge === false) {
      setNetworkPrompt(null);
      return;
    }
    const ac = new AbortController();
    void api<{ prompt: NetworkPromptDTO | null }>("/api/auth/network-prompt", { signal: ac.signal })
      .then((r) => {
        if (!ac.signal.aborted) setNetworkPrompt(r.prompt);
      })
      .catch(() => {
        if (!ac.signal.aborted) setNetworkPrompt(null);
      });
    return () => ac.abort();
  }, [user?.id, user?.notificationPrefs?.postPlanNetworkNudge]);

  // Persist the sheet filters whenever they change (day selection stays
  // transient — it's tied to the week strip, not a saved preference).
  useEffect(() => {
    try {
      localStorage.setItem(
        FEED_FILTERS_KEY,
        JSON.stringify({ selectedTag, selectedHoodId, selectedAgeRange, hideCancelled }),
      );
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [selectedTag, selectedHoodId, selectedAgeRange, hideCancelled]);

  // Looking-for card with 2+ flexible fields and not locked in yet — mirrors
  // PlanCard's own isLooking check so the feed groups exactly what the cards
  // visually flag as "idea" cards.
  const isIdeaPlan = useCallback((p: PlanDTO) => {
    const flexCount =
      (p.isFlexibleTime ? 1 : 0) +
      (p.isFlexibleLocation ? 1 : 0) +
      (p.isFlexibleDate ? 1 : 0);
    return p.planKind === "looking_for" && flexCount > 1 && !p.lockedAt;
  }, []);

  const activePlans = useMemo(() => {
    let list = plans ?? [];
    if (view === "mine") {
      // For "Looking for / my plans" view: plans the user is going or
      // interested in. Includes confirmed + looking-for naturally.
      list = list.filter((p) => p.myState === "going" || p.myState === "interested");
    }
    if (selectedTag) list = list.filter((p) => p.tags.includes(selectedTag));
    if (selectedHoodId) list = list.filter((p) => p.neighborhoodId === selectedHoodId);
    if (selectedAgeRange) list = list.filter((p) => p.creator.ageRange === selectedAgeRange);
    if (selectedDayIso) list = list.filter((p) => p.date.slice(0, 10) === selectedDayIso);
    if (hideCancelled) list = list.filter((p) => !p.cancelledAt);
    // Past plans never appear in the main feed.
    list = list.filter((p) => !p.cancelledAt && !planHasEnded(p));

    // Upcoming confirmed soonest-first, then ideas by recency.
    const upcoming: PlanDTO[] = [];
    const ideas: PlanDTO[] = [];
    for (const p of list) {
      if (isIdeaPlan(p)) ideas.push(p);
      else upcoming.push(p);
    }
    upcoming.sort((a, b) => `${a.date}T${a.time || "23:59"}`.localeCompare(`${b.date}T${b.time || "23:59"}`));
    ideas.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    const active = [...upcoming, ...ideas];
    // A just-posted plan is pinned to the very top regardless of its date, so
    // the user immediately sees what they created.
    if (justPostedId) {
      const idx = active.findIndex((p) => p.id === justPostedId);
      if (idx > 0) {
        const [pinned] = active.splice(idx, 1);
        if (pinned) active.unshift(pinned);
      }
    }
    return active;
  }, [plans, view, selectedTag, selectedHoodId, selectedAgeRange, selectedDayIso, hideCancelled, justPostedId, isIdeaPlan]);

  const filteredPlans = activePlans;

  const activeFilterCount =
    (selectedTag ? 1 : 0) +
    (selectedHoodId ? 1 : 0) +
    (selectedAgeRange ? 1 : 0) +
    (hideCancelled ? 1 : 0);

  if (!feedReady) {
    return (
      <main className="app-shell app-shell--wide app-shell--with-nav app-shell--with-topbar">
        <div className="feed-skeleton" aria-hidden="true">
          <div className="feed-skeleton-strip" />
          <div className="feed-skeleton-card" />
          <div className="feed-skeleton-card" />
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell app-shell--wide app-shell--with-nav app-shell--with-topbar">
      <div
        ref={indicatorRef}
        className="feed-pull-indicator"
        aria-hidden={!refreshing}
        role={refreshing ? "status" : undefined}
        aria-label={refreshing ? "Refreshing" : undefined}
      >
        <span className="feed-pull-spinner" />
      </div>

      <div ref={contentRef} className="feed-pull-content">
        <WeekStrip
          plans={plans}
          selectedDayIso={selectedDayIso}
          onSelectDay={setSelectedDayIso}
        />

        <div className="feed-divider" />

        {!forumSuggestionDismissed && suggestedForumTag && (
          <div className="feed-forum-suggestion" role="status">
            <span className="feed-forum-suggestion-glyph" aria-hidden="true">
              <MessageCircle size={18} strokeWidth={1.6} />
            </span>
            <Link
              to={`/forums/${suggestedForumTag}`}
              state={{ from: "feed" }}
              className="feed-forum-suggestion-text"
              onClick={dismissForumSuggestion}
            >
              New here? The {INTEREST_LABELS[suggestedForumTag]} forum is a good place to say hi →
            </Link>
            <button
              type="button"
              className="feed-forum-suggestion-dismiss"
              onClick={dismissForumSuggestion}
              aria-label="Dismiss suggestion"
            >
              ×
            </button>
          </div>
        )}

        <div className="feed-toolbar">
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
          <button
            type="button"
            className={`page-filter-btn ${activeFilterCount > 0 ? "page-filter-btn--active" : ""}`}
            onClick={() => setFilterOpen(true)}
            aria-label="Filter plans"
          >
            <SlidersHorizontal size={12} strokeWidth={1.8} />
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
                setSelectedAgeRange(null);
                setSelectedDayIso(null);
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
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {postSuccessId && (
        <PostSuccessSheet onDone={() => setPostSuccessId(null)} />
      )}

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
          selectedAgeRange={selectedAgeRange}
          hideCancelled={hideCancelled}
          onTagChange={setSelectedTag}
          onHoodChange={setSelectedHoodId}
          onAgeRangeChange={setSelectedAgeRange}
          onHideCancelledChange={setHideCancelled}
          onClose={() => setFilterOpen(false)}
          onClear={() => {
            setSelectedTag(null);
            setSelectedHoodId(null);
            setSelectedAgeRange(null);
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
    headline = "Nothing on your plate yet.";
    body = "Join something from the feed — see what's happening this week →";
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
        <Coffee size={26} strokeWidth={1.6} color="var(--muted)" />
      </div>
      <h2 className="feed-empty-headline">{headline}</h2>
      <p className="feed-empty-body">{body}</p>
      <div className="feed-empty-actions">
        {hasFilters ? (
          <button type="button" className="btn-secondary" onClick={onClearFilters}>
            Clear filters
          </button>
        ) : null}
        {view === "mine" && !hasFilters ? (
          <Link to="/" className="btn-primary">
            See what's happening
          </Link>
        ) : (
          <Link to="/plans/new" className="btn-primary">
            Post a plan
          </Link>
        )}
      </div>
    </div>
  );
}

