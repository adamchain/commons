import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { PlanCard } from "../components/PlanCard";
import { Label, ScreenTitle } from "../components/ui";
import type { PersonSearchResultDTO, SearchResultsDTO } from "../types/shared";

const DEBOUNCE_MS = 300;

/**
 * Global search — plans (title / venue / interest) and people (name),
 * respecting each person's `discoverableBySearch` toggle and blocks both
 * ways. Debounced search-as-you-type against GET /api/search?q=.
 */
export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultsDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      void api<SearchResultsDTO>(`/api/search?q=${encodeURIComponent(q)}`)
        .then(setResults)
        .catch(() => setResults({ plans: [], people: [] }))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const reloadResults = () => {
    const q = query.trim();
    if (!q) return;
    void api<SearchResultsDTO>(`/api/search?q=${encodeURIComponent(q)}`)
      .then(setResults)
      .catch(() => undefined);
  };

  const hasQuery = query.trim().length > 0;
  const noResults =
    hasQuery && !loading && results !== null && results.plans.length === 0 && results.people.length === 0;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/explore" className="detail-back">
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" /> Explore
        </Link>
      </header>
      <ScreenTitle title="Search" subtitle="Find plans and people on COMMONS" />

      <div className="network-search-wrap">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          className="network-search-input"
          placeholder="Search plans, venues, interests, or people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search"
        />
      </div>

      {!hasQuery && (
        <p className="form-help">Try a plan title, a venue, an interest like &ldquo;Coffee&rdquo;, or a name.</p>
      )}

      {noResults && (
        <p className="form-help">No matches for &ldquo;{query.trim()}&rdquo;.</p>
      )}

      {results && results.people.length > 0 && (
        <section className="profile-block" style={{ marginTop: hasQuery ? 4 : 0 }}>
          <Label>People</Label>
          <div className="search-people-list">
            {results.people.map((p) => (
              <PersonRow key={p.user.id} result={p} />
            ))}
          </div>
        </section>
      )}

      {results && results.plans.length > 0 && (
        <section className="profile-block">
          <Label>Plans</Label>
          <div className="plan-grid">
            {results.plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} onPlanRefresh={reloadResults} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function PersonRow({ result }: { result: PersonSearchResultDTO }) {
  const { user, neighborhoodName, sharedPlansCount } = result;
  const lastInitial = user.lastName ? `${user.lastName.trim().charAt(0).toUpperCase()}.` : "";
  const displayName = [user.firstName || "Friend", lastInitial].filter(Boolean).join(" ");
  const metaParts = [
    neighborhoodName,
    sharedPlansCount > 0 ? `${sharedPlansCount} shared plan${sharedPlansCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <Link to={`/profile/${user.id}`} className="search-person-row">
      <Avatar
        seed={user.avatarSeed}
        style={user.avatarStyle}
        photoDataUrl={user.avatarPhotoDataUrl}
        params={user.avatarParams}
        name={user.firstName}
        size="md"
      />
      <span className="search-person-info">
        <span className="search-person-name">{displayName}</span>
        {metaParts.length > 0 && <span className="search-person-meta">{metaParts.join(" · ")}</span>}
      </span>
      <ChevronRight />
    </Link>
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

function ChevronRight() {
  return (
    <svg className="search-person-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
