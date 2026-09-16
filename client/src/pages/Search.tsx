import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { CommunityCover } from "../components/CommunityCover";
import { PlanCard } from "../components/PlanCard";
import { Label, ScreenTitle } from "../components/ui";
import { communityCategoryLine, type CommunityCardDTO, type PersonSearchResultDTO, type SearchResultsDTO } from "../types/shared";

const DEBOUNCE_MS = 300;

/**
 * Global search — plans, people, and communities.
 * Respects `discoverableBySearch` and blocks both ways.
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
        .catch(() => setResults({ plans: [], people: [], communities: [] }))
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
      .catch(() => setResults({ plans: [], people: [], communities: [] }));
  };

  const hasQuery = query.trim().length > 0;
  const noResults =
    hasQuery && !loading && results !== null && results.plans.length === 0 && results.people.length === 0 && results.communities.length === 0;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/communities" className="detail-back">
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" /> Communities
        </Link>
      </header>
      <ScreenTitle title="Search" subtitle="Plans, people, communities." />

      <div className="network-search-wrap">
        <SearchIcon />
        <input
          ref={inputRef}
          type="search"
          className="network-search-input"
          placeholder="Search plans, people, or communities"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search"
        />
      </div>

      {!hasQuery && (
        <p className="form-help">Plans, people, a community — type something.</p>
      )}

      {noResults && (
        <p className="form-help">Nothing under that.</p>
      )}

      {results && results.communities.length > 0 && (
        <section className="profile-block" style={{ marginTop: hasQuery ? 4 : 0 }}>
          <Label>Communities</Label>
          <div className="search-communities-list">
            {results.communities.map((c) => (
              <CommunityRow key={c.id} community={c} />
            ))}
          </div>
        </section>
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
              <PlanCard key={plan.id} plan={plan} onPlanRefresh={reloadResults} navFrom={{ from: "search" }} />
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
    <Link to={`/profile/${user.id}`} state={{ from: "search" }} className="search-person-row">
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

function CommunityRow({ community }: { community: CommunityCardDTO }) {
  const joined = community.myMembershipStatus === "active";
  const memberCountLabel = `${community.memberCount} ${community.memberCount === 1 ? "member" : "members"}`;
  const categoryText = communityCategoryLine(community);

  return (
    <Link to={`/communities/${community.id}`} state={{ from: "search" }} className="search-community-row">
      <div className="search-community-thumb">
        <CommunityCover
          coverImage={community.coverImage}
          category={community.category}
          iconSize={28}
        />
        <span className="search-community-organizer-avatar">
          <Avatar
            seed={community.organizer.avatarSeed}
            style={community.organizer.avatarStyle}
            photoDataUrl={community.organizer.avatarPhotoDataUrl}
            params={community.organizer.avatarParams}
            name={community.organizer.firstName}
            size="xs"
          />
        </span>
      </div>
      <span className="search-community-info">
        <span className="search-community-organizer">
          <span className="search-community-organizer-name">{community.organizer.firstName}</span>
        </span>
        <span className="search-community-name">{community.name}</span>
        <span className="search-community-meta">
          {categoryText} · {memberCountLabel}
        </span>
      </span>
      {joined && (
        <span className="search-community-joined-pill">Joined</span>
      )}
    </Link>
  );
}
