import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { FeedbackPrompt } from "../components/FeedbackPrompt";
import { LoadingScreen } from "../components/LoadingScreen";
import { NetworkPromptModal } from "../components/NetworkPromptModal";
import { PlanCard } from "../components/PlanCard";
import { ThemeToggle } from "../components/ThemeToggle";
import { WeekGlance } from "../components/WeekGlance";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate, formatPlanTime } from "../lib/format";
import type { InterestTag, MeDTO, NeighborhoodDTO, NetworkPromptDTO, PlanDTO } from "../types/shared";
import { INTEREST_LABELS } from "../types/shared";

type ViewMode = "list" | "map" | "calendar";

export function FeedPage() {
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [view, setView] = useState<ViewMode>("list");
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
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
  const filteredPlans = useMemo(() => {
    let list = plans ?? [];
    if (selectedTag) list = list.filter((p) => p.tags.includes(selectedTag as never));
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
    <main className="app-shell app-shell--wide">
      <header className="app-header">
        <div>
          <h1 className="brand">COMMONS</h1>
          <p className="brand-tagline">
            {myNeighborhood ? `${myNeighborhood.name} · ${myNeighborhood.metro}` : "Plans, made together"}
          </p>
        </div>
        <div className="app-header-actions">
          <Link to="/plans/new" className="app-header-cta">
            + Post a plan
          </Link>
          <ThemeToggle />
          {user && (
            <Link to={`/profile/${user.id}`} className="user-pill" title="Your profile">
              <Avatar
                seed={user.avatarSeed}
                style={user.avatarStyle}
                photoDataUrl={user.avatarPhotoDataUrl}
                name={user.firstName || undefined}
                size="sm"
              />
              <span>{user.firstName || "Profile"}</span>
            </Link>
          )}
        </div>
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

      <div className="view-toggle">
        <button className={`view-toggle-btn ${view === "list" ? "is-active" : ""}`} onClick={() => setView("list")}>
          List
        </button>
        <button className={`view-toggle-btn ${view === "map" ? "is-active" : ""}`} onClick={() => setView("map")}>
          Map
        </button>
        <button className={`view-toggle-btn ${view === "calendar" ? "is-active" : ""}`} onClick={() => setView("calendar")}>
          Calendar
        </button>
      </div>

      {view === "list" && (
        <div id="feed-plans">
          <ListView
            buckets={buckets}
            hoodById={hoodById}
            viewerCoords={viewerCoords}
            onPlanRefresh={refreshPlans}
          />
        </div>
      )}
      {view === "map" && <MapView plans={filteredPlans} />}
      {view === "calendar" && <CalendarView plans={filteredPlans} />}

      <Link to="/plans/new" className="fab-create">
        + Post it
      </Link>
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

function MapView({ plans }: { plans: PlanDTO[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const withCoords = plans.filter((p) => p.location.lat !== undefined && p.location.lng !== undefined);

  // Render the map shell even when empty so the surface is consistent.
  if (withCoords.length === 0) {
    return (
      <div className="map-view">
        <div className="map-canvas map-canvas--empty" role="img" aria-label="Map of nearby plans (empty)">
          <div className="map-empty-hint">
            <p style={{ margin: 0 }}>Nothing on the map yet.</p>
            <Link to="/plans/new" className="btn-primary" style={{ marginTop: 12, display: "inline-block" }}>
              Drop the first pin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const lats = withCoords.map((p) => p.location.lat as number);
  const lngs = withCoords.map((p) => p.location.lng as number);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;

  const selected = withCoords.find((p) => p.id === selectedId);

  return (
    <div className="map-view">
      <div className="map-canvas" role="img" aria-label="Map of nearby plans">
        {withCoords.map((p) => {
          const left = ((p.location.lng as number) - minLng) / lngRange;
          const top = 1 - ((p.location.lat as number) - minLat) / latRange;
          return (
            <button
              key={p.id}
              type="button"
              className={`map-pin ${selectedId === p.id ? "is-selected" : ""}`}
              style={{ left: `${left * 92 + 4}%`, top: `${top * 88 + 4}%` }}
              onClick={() => setSelectedId(p.id)}
            >
              {p.hostEmoji}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="map-sheet">
          <PlanCard plan={selected} />
        </div>
      )}
    </div>
  );
}

function CommunityChips({
  userInterests,
  selected,
  onSelect,
}: {
  userInterests: InterestTag[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
}) {
  if (userInterests.length === 0) return null;
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
      {userInterests.map((tag) => (
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

function CalendarView({ plans }: { plans: PlanDTO[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 14; i++) {
    days.push(new Date(today.getTime() + i * 24 * 60 * 60 * 1000));
  }
  const byDate = new Map<string, PlanDTO[]>();
  for (const p of plans) {
    const key = new Date(p.date).toISOString().slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(p);
  }
  return (
    <div className="calendar-view">
      {days.map((d) => {
        const key = d.toISOString().slice(0, 10);
        const list = byDate.get(key) ?? [];
        return (
          <div key={key} className="calendar-day">
            <div className="calendar-day-label">{formatPlanDate(d.toISOString())}</div>
            {list.length === 0 ? (
              <div className="calendar-day-empty">—</div>
            ) : (
              list.map((p) => (
                <Link key={p.id} to={`/plans/${p.id}`} className="calendar-event">
                  <span>{p.hostEmoji}</span>
                  <span className="calendar-event-title">{p.title}</span>
                  <span className="calendar-event-time">{formatPlanTime(p.time, p.isFlexibleTime)}</span>
                </Link>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
