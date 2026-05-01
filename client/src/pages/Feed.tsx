import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { FeedbackPrompt } from "../components/FeedbackPrompt";
import { LoadingScreen } from "../components/LoadingScreen";
import { PlanCard } from "../components/PlanCard";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { formatPlanDate, formatPlanTime } from "../lib/format";
import type { NeighborhoodDTO, PlanDTO } from "../types/shared";

type ViewMode = "list" | "map" | "calendar";

export function FeedPage() {
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [view, setView] = useState<ViewMode>("list");
  const { user } = useAuth();

  useEffect(() => {
    void api<PlanDTO[]>("/api/plans").then(setPlans).catch(() => setPlans([]));
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, []);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/onboarding";
  };

  const myNeighborhood = neighborhoods.find((n) => n.id === user?.neighborhoodId);

  const buckets = useMemo(() => bucketByWhen(plans ?? []), [plans]);

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
            + Make a plan
          </Link>
          <ThemeToggle />
          <button type="button" className="user-pill" onClick={() => void logout()} title="Sign out">
            {user && (
              <>
                <Avatar seed={user.avatarSeed} style={user.avatarStyle} size="sm" />
                <span>{user.firstName || "Sign out"}</span>
              </>
            )}
          </button>
        </div>
      </header>

      <FeedbackPrompt />

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

      {view === "list" && <ListView buckets={buckets} />}
      {view === "map" && <MapView plans={plans} />}
      {view === "calendar" && <CalendarView plans={plans} />}

      <Link to="/plans/new" className="fab-create">
        + Make a plan
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

function ListView({ buckets }: { buckets: Buckets }) {
  const total = buckets.happeningNow.length + buckets.thisWeek.length + buckets.later.length;
  if (total === 0) {
    return (
      <div className="empty-state">
        <p style={{ margin: 0 }}>No plans in your neighborhood yet. Be the first to post one.</p>
      </div>
    );
  }
  return (
    <>
      {buckets.happeningNow.length > 0 && (
        <Section title="Happening today" plans={buckets.happeningNow} />
      )}
      {buckets.thisWeek.length > 0 && (
        <Section title="This week" plans={buckets.thisWeek} />
      )}
      {buckets.later.length > 0 && (
        <Section title="Later" plans={buckets.later} />
      )}
    </>
  );
}

function Section({ title, plans }: { title: string; plans: PlanDTO[] }) {
  return (
    <>
      <h2 className="section-title">{title}</h2>
      <div className="plan-grid">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </>
  );
}

function MapView({ plans }: { plans: PlanDTO[] }) {
  // Real Google Maps integration is gated on an API key. For v1 we render a
  // schematic map using lat/lng deltas — pins are clickable and open the
  // bottom sheet behavior described in PRD §17.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const withCoords = plans.filter((p) => p.location.lat !== undefined && p.location.lng !== undefined);
  if (withCoords.length === 0) {
    return <div className="empty-state">No plans with map coordinates yet.</div>;
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
