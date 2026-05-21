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
import type { InterestTag, MeDTO, NeighborhoodDTO, NetworkPromptDTO, PlanDTO } from "../types/shared";

export function FeedPage() {
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<InterestTag | null>(null);
  const [selectedHoodId, setSelectedHoodId] = useState<string | null>(null);
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
    if (justPostedId) {
      const pinned = list.find((p) => p.id === justPostedId);
      if (pinned) list = [pinned, ...list.filter((p) => p.id !== justPostedId)];
    }
    list = [...list].sort((a, b) => a.date.localeCompare(b.date));
    return list;
  }, [plans, view, selectedTag, selectedHoodId, selectedDayIso, justPostedId]);

  const activeFilterCount =
    (selectedTag ? 1 : 0) + (selectedHoodId ? 1 : 0);

  if (plans === null) {
    return <LoadingScreen tagline="Gathering plans" />;
  }

  return (
    <main className="app-shell app-shell--wide app-shell--with-nav app-shell--with-topbar">
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
          {filteredPlans.length} plan{filteredPlans.length === 1 ? "" : "s"}
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
          <div className="empty-state empty-state-feed">
            <p style={{ margin: 0 }}>Nothing yet — be the first to post a plan.</p>
            <Link to="/plans/new" className="btn-primary" style={{ marginTop: 16, display: "inline-block" }}>
              Post something
            </Link>
          </div>
        ) : (
          <div className="plan-grid">
            {filteredPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onPlanRefresh={refreshPlans}
                highlight={justPostedId === plan.id}
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
          onTagChange={setSelectedTag}
          onHoodChange={setSelectedHoodId}
          onClose={() => setFilterOpen(false)}
          onClear={() => {
            setSelectedTag(null);
            setSelectedHoodId(null);
          }}
        />
      )}
    </main>
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
