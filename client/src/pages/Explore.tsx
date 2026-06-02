import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { formatPlaceAddress } from "../lib/format";
import { getCurrentCoords } from "../lib/geolocate";
import type { NeighborhoodDTO } from "../types/shared";

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
  photoRef?: string;
  rating?: number;
  ratings?: number;
  openNow?: boolean;
}

interface Coords {
  lat: number;
  lng: number;
}

// Google place types behind each browse chip. "" = everything nearby.
const CATEGORIES: Array<{ type: string; label: string }> = [
  { type: "", label: "All" },
  { type: "cafe", label: "Coffee" },
  { type: "restaurant", label: "Food" },
  { type: "bar", label: "Drinks" },
  { type: "gym", label: "Fitness" },
  { type: "park", label: "Parks" },
  { type: "tourist_attraction", label: "Culture" },
];

export function ExplorePage() {
  const { user } = useAuth();

  // Where "near me" is anchored: real GPS if granted, else the user's
  // neighborhood center. Null while we're still figuring it out.
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(true);

  const [category, setCategory] = useState("");
  const [nearby, setNearby] = useState<PlaceResult[] | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searching = query.trim().length >= 2;

  // Resolve a location once: try the browser, fall back to the neighborhood
  // center from onboarding so the page still works without GPS permission.
  useEffect(() => {
    let cancelled = false;
    const useNeighborhood = async () => {
      try {
        const hoods = await api<NeighborhoodDTO[]>("/api/neighborhoods");
        const ids = user?.neighborhoodIds ?? (user?.neighborhoodId ? [user.neighborhoodId] : []);
        const mine = hoods.find((h) => ids.includes(h.id) && h.lat != null && h.lng != null);
        const any = mine ?? hoods.find((h) => h.lat != null && h.lng != null);
        if (!cancelled && any?.lat != null && any?.lng != null) {
          setCoords({ lat: any.lat, lng: any.lng });
        }
      } catch {
        /* leave coords null — UI handles the no-location case */
      } finally {
        if (!cancelled) setLocating(false);
      }
    };

    void (async () => {
      const c = await getCurrentCoords({ timeoutMs: 8000 });
      if (cancelled) return;
      if (c) {
        setCoords(c);
        setLocating(false);
      } else {
        await useNeighborhood();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Default "near you" list — refreshes when the location or category changes.
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    const params = new URLSearchParams({ lat: String(coords.lat), lng: String(coords.lng) });
    if (category) params.set("type", category);
    setNearbyLoading(true);
    void api<{ results: PlaceResult[] }>(`/api/places/nearby?${params.toString()}`)
      .then((r) => {
        if (!cancelled) setNearby(r.results);
      })
      .catch(() => {
        if (!cancelled) setNearby([]);
      })
      .finally(() => {
        if (!cancelled) setNearbyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coords, category]);

  // Free-text venue search (existing Places text-search endpoint).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSearchLoading(true);
      void api<{ results: PlaceResult[] }>(`/api/places/search?q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.results))
        .catch(() => setResults([]))
        .finally(() => setSearchLoading(false));
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <main className="app-shell app-shell--wide app-shell--with-nav app-shell--with-topbar">
      <h1 className="brand" style={{ marginBottom: 4 }}>Explore</h1>
      <p className="form-help" style={{ marginTop: 0, marginBottom: 14 }}>
        Spots and communities near you — see what's around, then make a plan there.
      </p>

      <div className="explore-search">
        <SearchIcon />
        <input
          type="search"
          placeholder="Search a café, bar, gym, or park"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="explore-search-clear" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </div>

      {searching ? (
        <section className="explore-places">
          <h2 className="section-title">Search results</h2>
          {searchLoading && results.length === 0 && <p className="form-help">Looking…</p>}
          {!searchLoading && results.length === 0 && (
            <p className="form-help">No spots found — try another search.</p>
          )}
          <PlaceGrid places={results} />
        </section>
      ) : (
        <section className="explore-places">
          <div className="explore-cats" role="tablist" aria-label="Browse nearby by category">
            {CATEGORIES.map((c) => (
              <button
                key={c.type || "all"}
                type="button"
                role="tab"
                aria-selected={category === c.type}
                className={`explore-cat-chip ${category === c.type ? "is-active" : ""}`}
                onClick={() => setCategory(c.type)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <h2 className="section-title">Near you</h2>

          {locating || (nearby === null && coords) ? (
            <p className="form-help">Finding what's around you…</p>
          ) : !coords ? (
            <p className="form-help">
              Turn on location to see places near you — or search for a spot above.
            </p>
          ) : nearbyLoading && (nearby?.length ?? 0) === 0 ? (
            <p className="form-help">Finding what's around you…</p>
          ) : (nearby?.length ?? 0) === 0 ? (
            <p className="form-help">Nothing nearby in this category — try another.</p>
          ) : (
            <PlaceGrid places={nearby ?? []} />
          )}
        </section>
      )}

      <CommunitiesPreview />
    </main>
  );
}

function PlaceGrid({ places }: { places: PlaceResult[] }) {
  return (
    <div className="explore-places-grid">
      {places.map((p) => {
        const search = new URLSearchParams();
        search.set("name", p.name);
        if (p.address) search.set("address", p.address);
        return (
          <Link
            key={p.placeId}
            to={`/plans/new?${search.toString()}`}
            className="explore-place-tile"
          >
            <div className="explore-place-photo">
              {p.photoRef ? (
                <img
                  src={`/api/places/photo?ref=${encodeURIComponent(p.photoRef)}&w=400`}
                  alt=""
                />
              ) : (
                <div className="explore-place-photo-fallback">📍</div>
              )}
            </div>
            <div className="explore-place-body">
              <div className="explore-place-name">{p.name}</div>
              <div className="explore-place-address">{formatPlaceAddress(p.address)}</div>
              <div className="explore-place-meta">
                {p.rating ? (
                  <span className="explore-place-rating">
                    ★ {p.rating.toFixed(1)}
                    {p.ratings ? ` · ${p.ratings}` : ""}
                  </span>
                ) : null}
                {p.openNow ? <span className="explore-place-open">Open now</span> : null}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
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
