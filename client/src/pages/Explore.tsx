import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { ThemeToggle } from "../components/ThemeToggle";
import { LoadingScreen } from "../components/LoadingScreen";
import { VenueCard } from "../components/VenueCard";
import { CommunityCard } from "../components/CommunityCard";
import { fetchNearbyVenues, VENUE_CATEGORIES } from "../lib/nearbyVenues";
import { FALLBACK_COORDS, type Coords } from "../lib/geo";
import type { CommunityDTO, VenueDTO } from "../types/shared";

type Tab = "places" | "communities";
type LocationStatus = "locating" | "located" | "fallback";

const COMMUNITY_LABELS: Record<string, string> = {
  running: "Running",
  coffee: "Coffee",
  books: "Books",
  music: "Music",
  food: "Food",
  cycling: "Cycling",
  art: "Art",
  social: "Social",
};

export function ExplorePage() {
  const [tab, setTab] = useState<Tab>("places");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("locating");

  const [venues, setVenues] = useState<VenueDTO[] | null>(null);
  const [venuesError, setVenuesError] = useState(false);
  const [communities, setCommunities] = useState<CommunityDTO[] | null>(null);

  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  // Ask the browser for a location once on mount; fall back to a city center
  // so the page is still useful when permission is denied or unavailable.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setCoords(FALLBACK_COORDS);
      setLocationStatus("fallback");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus("located");
      },
      () => {
        setCoords(FALLBACK_COORDS);
        setLocationStatus("fallback");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  // Live venue lookup from OpenStreetMap whenever the location changes.
  const reloadKey = useRef(0);
  useEffect(() => {
    if (!coords) return;
    const controller = new AbortController();
    const myKey = ++reloadKey.current;
    setVenues(null);
    setVenuesError(false);
    fetchNearbyVenues(coords, 1500, controller.signal)
      .then((result) => {
        if (myKey === reloadKey.current) setVenues(result);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (myKey === reloadKey.current) {
          setVenues([]);
          setVenuesError(true);
        }
      });
    return () => controller.abort();
  }, [coords]);

  // Curated communities come from our API, sorted by distance server-side.
  useEffect(() => {
    if (!coords) return;
    const params = new URLSearchParams({ lat: String(coords.lat), lng: String(coords.lng) });
    void api<CommunityDTO[]>(`/api/explore/communities?${params.toString()}`)
      .then(setCommunities)
      .catch(() => setCommunities([]));
  }, [coords]);

  // Reset the category filter when switching tabs so a places-only category
  // doesn't silently hide every community (and vice versa).
  const selectTab = (next: Tab) => {
    setTab(next);
    setCategory("all");
  };

  const placeCategories = useMemo(
    () => VENUE_CATEGORIES.filter((c) => venues?.some((v) => v.category === c.key)),
    [venues]
  );

  const communityCategories = useMemo(() => {
    const present = new Set((communities ?? []).map((c) => c.category));
    return [...present];
  }, [communities]);

  const filteredVenues = useMemo(() => {
    if (!venues) return [];
    const q = query.trim().toLowerCase();
    return venues.filter((v) => {
      if (category !== "all" && v.category !== category) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.blurb.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q) ||
        v.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [venues, category, query]);

  const filteredCommunities = useMemo(() => {
    if (!communities) return [];
    const q = query.trim().toLowerCase();
    return communities.filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.neighborhood.toLowerCase().includes(q) ||
        c.blurb.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [communities, category, query]);

  if (!coords && locationStatus === "locating") {
    return <LoadingScreen tagline="Finding what's around you" />;
  }

  const locationNote =
    locationStatus === "located"
      ? "Showing what's near you right now"
      : "Location off — showing central Philadelphia. Enable location for spots near you.";

  return (
    <main className="app-shell app-shell--wide">
      <header className="app-header">
        <div>
          <h1 className="brand">EXPLORE</h1>
          <p className="brand-tagline">What's around you</p>
        </div>
        <div className="app-header-actions">
          <Link to="/" className="app-header-cta">
            Plans feed
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <p className="explore-location-note">📍 {locationNote}</p>

      <div className="explore-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "places"}
          className={`explore-tab ${tab === "places" ? "is-active" : ""}`}
          onClick={() => selectTab("places")}
        >
          Places nearby
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "communities"}
          className={`explore-tab ${tab === "communities" ? "is-active" : ""}`}
          onClick={() => selectTab("communities")}
        >
          Communities
        </button>
      </div>

      <input
        className="explore-search"
        placeholder={tab === "places" ? "Search cafés, parks, gyms…" : "Search communities…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="filter-chips">
        <button
          type="button"
          className={`filter-chip ${category === "all" ? "is-active" : ""}`}
          onClick={() => setCategory("all")}
        >
          All
        </button>
        {tab === "places"
          ? placeCategories.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`filter-chip ${category === c.key ? "is-active" : ""}`}
                onClick={() => setCategory(c.key)}
              >
                <span aria-hidden="true">{c.icon}</span> {c.label}
              </button>
            ))
          : communityCategories.map((c) => (
              <button
                key={c}
                type="button"
                className={`filter-chip ${category === c ? "is-active" : ""}`}
                onClick={() => setCategory(c)}
              >
                {COMMUNITY_LABELS[c] ?? c}
              </button>
            ))}
      </div>

      {tab === "places" ? (
        venues === null ? (
          <div className="empty-state">
            <p style={{ margin: 0 }}>Looking for places nearby…</p>
          </div>
        ) : venuesError ? (
          <div className="empty-state">
            <p style={{ margin: 0 }}>
              Couldn't reach OpenStreetMap just now. Check your connection and try again.
            </p>
          </div>
        ) : filteredVenues.length === 0 ? (
          <div className="empty-state">
            <p style={{ margin: 0 }}>No places match this filter. Try widening your search.</p>
          </div>
        ) : (
          <div className="plan-grid">
            {filteredVenues.map((venue) => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>
        )
      ) : communities === null ? (
        <div className="empty-state">
          <p style={{ margin: 0 }}>Loading communities…</p>
        </div>
      ) : filteredCommunities.length === 0 ? (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No communities match this filter.</p>
        </div>
      ) : (
        <div className="plan-grid">
          {filteredCommunities.map((community) => (
            <CommunityCard key={community.id} community={community} />
          ))}
        </div>
      )}
    </main>
  );
}
