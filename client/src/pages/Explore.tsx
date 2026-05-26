import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { PlanCard } from "../components/PlanCard";
import { useAuth } from "../context/AuthContext";
import { formatPlaceAddress } from "../lib/format";
import type { PlanDTO } from "../types/shared";

type Mode = "nearby" | "similar" | "both";

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  photoRef?: string;
  rating?: number;
  ratings?: number;
}

export function ExplorePage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  const [mode, setMode] = useState<Mode>("both");
  const [locationQuery, setLocationQuery] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void api<PlanDTO[]>("/api/plans").then(setPlans).catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = locationQuery.trim();
    if (q.length < 2) {
      setPlaces([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setPlacesLoading(true);
      void api<{ results: PlaceResult[] }>(`/api/places/search?q=${encodeURIComponent(q)}`)
        .then((r) => setPlaces(r.results))
        .catch(() => setPlaces([]))
        .finally(() => setPlacesLoading(false));
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [locationQuery]);

  const myHoodIds = useMemo(
    () => user?.neighborhoodIds ?? (user?.neighborhoodId ? [user.neighborhoodId] : []),
    [user],
  );
  const myInterests = useMemo(() => new Set(user?.interests ?? []), [user]);

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
    <main className="app-shell app-shell--wide app-shell--with-nav app-shell--with-topbar">
      <h1 className="brand" style={{ marginBottom: 14 }}>Explore</h1>

      <div className="explore-search">
        <SearchIcon />
        <input
          type="search"
          placeholder="Search a venue, neighborhood, or vibe…"
          value={locationQuery}
          onChange={(e) => setLocationQuery(e.target.value)}
        />
        {locationQuery && (
          <button type="button" className="explore-search-clear" onClick={() => setLocationQuery("")}>
            ×
          </button>
        )}
      </div>

      {locationQuery.trim().length >= 2 && (
        <section className="explore-places">
          <h2 className="section-title">Spots</h2>
          {placesLoading && places.length === 0 && (
            <p className="form-help">Looking…</p>
          )}
          {!placesLoading && places.length === 0 && (
            <p className="form-help">No spots found — try another search.</p>
          )}
          <div className="explore-places-grid">
            {places.map((p) => {
              const search = new URLSearchParams();
              search.set("name", p.name);
              if (p.address) search.set("address", p.address);
              return (
                <Link key={p.placeId} to={`/plans/new?${search.toString()}`} className="explore-place-tile">
                  <div className="explore-place-photo">
                    {p.photoRef ? (
                      <img src={`/api/places/photo?ref=${encodeURIComponent(p.photoRef)}&w=400`} alt="" />
                    ) : (
                      <div className="explore-place-photo-fallback">📍</div>
                    )}
                  </div>
                  <div className="explore-place-body">
                    <div className="explore-place-name">{p.name}</div>
                    <div className="explore-place-address">{formatPlaceAddress(p.address)}</div>
                    {p.rating && (
                      <div className="explore-place-rating">
                        ★ {p.rating.toFixed(1)}
                        {p.ratings ? ` · ${p.ratings}` : ""}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

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
            <PlanCard key={plan.id} plan={plan} />
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
