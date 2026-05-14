import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { PlanCard } from "../components/PlanCard";
import { useAuth } from "../context/AuthContext";
import type { NeighborhoodDTO, PlanDTO } from "../types/shared";

type Mode = "nearby" | "similar" | "both";

/**
 * Explore — discover plans outside the default feed: by proximity, by interest
 * overlap, or both. Communities preview lives bottom-left as a coming-soon
 * surface.
 */
export function ExplorePage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const [mode, setMode] = useState<Mode>("both");

  useEffect(() => {
    void api<PlanDTO[]>("/api/plans").then(setPlans).catch(() => setPlans([]));
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, []);

  const hoodById = useMemo(() => new Map(neighborhoods.map((n) => [n.id, n])), [neighborhoods]);
  const myHoodIds = useMemo(
    () => user?.neighborhoodIds ?? (user?.neighborhoodId ? [user.neighborhoodId] : []),
    [user],
  );
  const myInterests = useMemo(() => new Set(user?.interests ?? []), [user]);
  const primaryHood = myHoodIds[0] ? hoodById.get(myHoodIds[0]) : undefined;
  const viewerCoords =
    primaryHood && typeof primaryHood.lat === "number" && typeof primaryHood.lng === "number"
      ? { lat: primaryHood.lat, lng: primaryHood.lng }
      : undefined;

  // Nearby = same hood or adjacent (we approximate adjacency by "any of my
  // hoods or close in distance"). Similar = at least one tag overlap.
  const filtered = useMemo(() => {
    if (!plans) return [];
    return plans.filter((p) => {
      const isNearby = myHoodIds.includes(p.neighborhoodId);
      const isSimilar = p.tags.some((t) => myInterests.has(t));
      if (mode === "nearby") return isNearby;
      if (mode === "similar") return isSimilar;
      return isNearby || isSimilar;
    });
  }, [plans, mode, myHoodIds, myInterests]);

  if (plans === null) return <LoadingScreen tagline="Exploring" />;

  return (
    <main className="app-shell app-shell--wide app-shell--with-nav">
      <header className="app-header app-header--minimal">
        <h1 className="brand">Explore</h1>
      </header>

      <div className="segmented segmented-explore" role="tablist" aria-label="Explore mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "nearby"}
          className={mode === "nearby" ? "is-active" : ""}
          onClick={() => setMode("nearby")}
        >
          Nearby
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "similar"}
          className={mode === "similar" ? "is-active" : ""}
          onClick={() => setMode("similar")}
        >
          Similar interests
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "both"}
          className={mode === "both" ? "is-active" : ""}
          onClick={() => setMode("both")}
        >
          Both
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state empty-state-feed">
          <p style={{ margin: 0 }}>Nothing here yet — try another filter or post the first one.</p>
          <Link to="/plans/new" className="btn-primary" style={{ marginTop: 16, display: "inline-block" }}>
            Post a plan
          </Link>
        </div>
      ) : (
        <div className="plan-grid">
          {filtered.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              neighborhoodName={hoodById.get(plan.neighborhoodId)?.name}
              viewerCoords={viewerCoords}
            />
          ))}
        </div>
      )}

      <CommunitiesPreview />
    </main>
  );
}

function CommunitiesPreview() {
  return (
    <aside className="explore-communities-card" aria-label="Communities — coming soon">
      <div className="explore-communities-header">
        <span className="explore-communities-tag">Communities · Soon</span>
        <h2>Find your people</h2>
      </div>
      <p className="explore-communities-body">
        Run clubs, book clubs, recurring crews. Join a community and get their
        plans in your feed automatically.
      </p>
      <ul className="explore-coming-soon-preview" aria-label="Sample communities">
        <li>
          <span className="explore-preview-emoji" aria-hidden="true">🏃</span>
          <div>
            <strong>Saturday Long Run</strong>
            <span>Fishtown · 18 members</span>
          </div>
        </li>
        <li>
          <span className="explore-preview-emoji" aria-hidden="true">📖</span>
          <div>
            <strong>Rittenhouse Book Club</strong>
            <span>Monthly · 9 members</span>
          </div>
        </li>
        <li>
          <span className="explore-preview-emoji" aria-hidden="true">🎲</span>
          <div>
            <strong>Trivia Tuesdays</strong>
            <span>South Philly · 14 members</span>
          </div>
        </li>
      </ul>
    </aside>
  );
}
