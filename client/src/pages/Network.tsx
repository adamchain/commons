import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { EmptyCard } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { ALL_INTERESTS, INTEREST_LABELS, type InterestTag, type NetworkLinkStatus, type PersonSearchResultDTO, type PublicUser, type SearchResultsDTO } from "../types/shared";

const DEBOUNCE_MS = 300;

type NetworkMember = PublicUser & {
  neighborhoodName?: string | null;
  mutualCount?: number;
};

type Row = {
  user: PublicUser;
  neighborhoodName: string | null;
  mutualCount: number;
  networkStatus: NetworkLinkStatus;
  reason?: string;
};

/**
 * People you know, plus a name search that can connect with anyone
 * discoverable in the city.
 */
export function NetworkPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const adding = searchParams.get("add") === "1";
  const fromProfile = (location.state as { from?: string } | null)?.from === "profile";
  const searchRef = useRef<HTMLInputElement>(null);
  const [network, setNetwork] = useState<NetworkMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; people: PersonSearchResultDTO[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, NetworkLinkStatus>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"discover" | "search">(adding ? "search" : "discover");
  const [interest, setInterest] = useState<InterestTag | null>(null);
  const [suggested, setSuggested] = useState<PersonSearchResultDTO[] | null>(null);

  useEffect(() => {
    void api<{ users: NetworkMember[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const qs = interest ? `?interest=${encodeURIComponent(interest)}` : "";
    setSuggested(null);
    void api<{ people: PersonSearchResultDTO[] }>(`/api/search/discover${qs}`, { signal: ac.signal })
      .then((r) => {
        if (!ac.signal.aborted) setSuggested(r.people);
      })
      .catch(() => {
        if (!ac.signal.aborted) setSuggested([]);
      });
    return () => ac.abort();
  }, [interest]);

  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) {
      setResults(null);
      setSearching(false);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      void api<SearchResultsDTO>(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: ac.signal })
        .then((r) => {
          if (!ac.signal.aborted) setResults({ q: trimmed, people: r.people });
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
          setResults({ q: trimmed, people: [] });
        })
        .finally(() => {
          if (!ac.signal.aborted) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [trimmed]);

  const serverPeople = results && results.q === trimmed ? results.people : null;
  const needle = trimmed.toLowerCase();
  const localMatches = trimmed
    ? network.filter((u) =>
        [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase().includes(needle),
      )
    : network;
  // Keep the current list up while a search is in flight so the rows don't
  // blank out and pop back on every keystroke.
  const rows: Row[] = serverPeople
    ? serverPeople.map((p) => ({
        user: p.user,
        neighborhoodName: p.neighborhoodName,
        mutualCount: p.mutualCount,
        networkStatus: overrides[p.user.id] ?? p.networkStatus,
      }))
    : localMatches.map((u) => ({
        user: u,
        neighborhoodName: u.neighborhoodName ?? null,
        mutualCount: u.mutualCount ?? 0,
        networkStatus: "connected" as const,
      }));
  const waitingForResults = Boolean(trimmed) && serverPeople === null;

  async function connect(userId: string) {
    setBusyId(userId);
    try {
      const r = await api<{ status?: string }>(`/api/auth/friend-add`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setOverrides((prev) => ({
        ...prev,
        [userId]: r.status === "connected" ? "connected" : "pending",
      }));
    } catch {
      /* leave the button as Connect */
    } finally {
      setBusyId(null);
    }
  }

  const profileTo = user ? `/profile/${user.id}` : "/";
  const chips = ALL_INTERESTS;

  useLayoutEffect(() => {
    if (fromProfile || adding) window.scrollTo(0, 0);
  }, [fromProfile, adding]);

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar network-page">
      {(adding || fromProfile) && (
        <header className="app-header app-header--minimal">
          <Link to={adding && fromProfile ? "/network" : profileTo} state={fromProfile ? { from: "profile" } : undefined} className="back-circle" aria-label="Back">
            <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
        </header>
      )}
      <header className="network-header-card">
        <div>
          <h1 className="network-page-title">Network</h1>
          <p className="network-page-sub">
            {tab === "discover"
              ? "Find people through shared interests and mutual connections."
              : `${network.length} ${network.length === 1 ? "person" : "people"} in your network.`}
          </p>
        </div>
        <div className="network-tabs" role="tablist" aria-label="Network">
          <button type="button" role="tab" aria-selected={tab === "discover"} className={`network-tab${tab === "discover" ? " is-active" : ""}`} onClick={() => setTab("discover")}>
            Discover
          </button>
          <button type="button" role="tab" aria-selected={tab === "search"} className={`network-tab${tab === "search" ? " is-active" : ""}`} onClick={() => setTab("search")}>
            Your Network
          </button>
        </div>
      </header>

      {tab === "discover" ? (
        <>
          <div className="network-search-wrap">
            <SearchIcon />
            <input
              className="network-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people"
              aria-label="Search people"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              className={`network-search-clear${query ? " is-on" : ""}`}
              onClick={() => setQuery("")}
              aria-label="Clear search"
              tabIndex={query ? 0 : -1}
            >
              ×
            </button>
          </div>
          <section className="network-surface">
          <div className="network-chips" role="group" aria-label="Interests">
            <button type="button" className={`network-chip${interest === null ? " is-active" : ""}`} onClick={() => setInterest(null)}>
              All
            </button>
            {chips.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`network-chip${interest === tag ? " is-active" : ""}`}
                onClick={() => setInterest(tag)}
              >
                {INTEREST_LABELS[tag]}
              </button>
            ))}
          </div>
          {trimmed ? (
            rows.length > 0 ? (
              <div className="network-card">
                {rows.map((row) => (
                  <NetworkRow
                    key={row.user.id}
                    row={row}
                    busy={busyId === row.user.id}
                    onConnect={() => void connect(row.user.id)}
                    actionLabel="Add"
                  />
                ))}
              </div>
            ) : !searching && !waitingForResults ? (
              <p className="network-empty">Nobody by that name.</p>
            ) : (
              <div className="feed-skeleton" aria-busy="true" aria-label="Searching">
                <div className="feed-skeleton-card" />
              </div>
            )
          ) : suggested === null ? (
            <div className="feed-skeleton" aria-busy="true" aria-label="Finding people">
              <div className="feed-skeleton-card" />
              <div className="feed-skeleton-card" />
            </div>
          ) : suggested.length === 0 ? (
            <EmptyCard
              icon={<Users size={22} strokeWidth={1.6} color="#3A6A3A" />}
              tint="#C8DDC8"
              title="No one here yet."
              body="Try another interest, or search by name."
            />
          ) : (
            <>
            <div className="network-section-head">
              <div>
                <h2>People you may know</h2>
                <p>Based on mutuals and shared interests.</p>
              </div>
              <span>{suggested.length}</span>
            </div>
            <div className="network-card network-card--grid">
              {suggested.map((person) => (
                <NetworkRow
                  key={person.user.id}
                  layout="card"
                  row={{
                    user: person.user,
                    neighborhoodName: person.neighborhoodName,
                    mutualCount: person.mutualCount,
                    networkStatus: overrides[person.user.id] ?? person.networkStatus,
                    reason: person.reason,
                  }}
                  busy={busyId === person.user.id}
                  onConnect={() => void connect(person.user.id)}
                  actionLabel="Add"
                />
              ))}
            </div>
            </>
          )}
          </section>
        </>
      ) : (
        <>
          <div className="network-search-wrap">
            <SearchIcon />
            <input
              ref={searchRef}
              className="network-search-input"
              autoFocus={adding}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your people"
              aria-label="Search your people"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              className={`network-search-clear${query ? " is-on" : ""}`}
              onClick={() => setQuery("")}
              aria-label="Clear search"
              tabIndex={query ? 0 : -1}
            >
              ×
            </button>
          </div>
          <section className="network-surface">
            {trimmed ? (
              rows.length > 0 ? (
                <>
                  <div className="network-section-head">
                    <div>
                      <h2>Results</h2>
                      <p>Matches in your network and the city.</p>
                    </div>
                    <span>{rows.length}</span>
                  </div>
                  <div className="network-card network-card--grid">
                    {rows.map((row) => (
                      <NetworkRow
                        key={row.user.id}
                        layout="card"
                        row={row}
                        busy={busyId === row.user.id}
                        onConnect={() => void connect(row.user.id)}
                        actionLabel="Add"
                      />
                    ))}
                  </div>
                </>
              ) : !searching && !waitingForResults ? (
                <p className="network-empty">Nobody by that name.</p>
              ) : (
                <div className="feed-skeleton" aria-busy="true" aria-label="Searching">
                  <div className="feed-skeleton-card" />
                </div>
              )
            ) : !loaded ? (
              <div className="feed-skeleton" aria-busy="true" aria-label="Loading your network">
                <div className="feed-skeleton-card" />
                <div className="feed-skeleton-card" />
              </div>
            ) : rows.length === 0 ? (
              <EmptyCard
                icon={<Users size={22} strokeWidth={1.6} color="#3A6A3A" />}
                tint="#C8DDC8"
                title="Your network starts here."
                body="Add people you meet through plans and communities."
              />
            ) : (
              <>
                <div className="network-section-head">
                  <div>
                    <h2>Your people</h2>
                    <p>Everyone you’ve added.</p>
                  </div>
                  <span>{network.length}</span>
                </div>
                <div className="network-card network-card--grid">
                  {rows.map((row) => (
                    <NetworkRow
                      key={row.user.id}
                      layout="card"
                      row={row}
                      busy={busyId === row.user.id}
                      onConnect={() => void connect(row.user.id)}
                    />
                  ))}
                </div>
              </>
            )}
            <p className="network-invite">
              Not finding someone? <Link to="/invite">Invite them →</Link>
            </p>
          </section>
        </>
      )}
    </main>
  );
}

function NetworkRow({
  row,
  busy,
  onConnect,
  actionLabel = "Add",
  layout = "row",
}: {
  row: Row;
  busy: boolean;
  onConnect: () => void;
  actionLabel?: string;
  layout?: "row" | "card";
}) {
  const navigate = useNavigate();
  const { user, neighborhoodName, mutualCount, networkStatus, reason } = row;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Friend";
  const meta =
    reason && !reason.startsWith("Also into")
      ? reason
      : neighborhoodName
        ? neighborhoodName
        : mutualCount > 0
          ? `${mutualCount} mutual`
          : "";

  return (
    <div className={`network-row${layout === "card" ? " is-card" : ""}`}>
      <Link to={`/profile/${user.id}`} state={{ from: "network" }} className="network-row-main">
        <Avatar
          seed={user.avatarSeed}
          style={user.avatarStyle}
          photoDataUrl={user.avatarPhotoDataUrl}
          params={user.avatarParams}
          name={user.firstName}
          size={layout === "card" ? "lg" : "md"}
        />
        <span className="network-row-copy">
          <span className="network-row-name">{name}</span>
          {meta && <span className="network-row-meta">{meta}</span>}
        </span>
      </Link>
      {networkStatus === "connected" ? (
        <button
          type="button"
          className="network-action network-action--primary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/dm/${user.id}`, { state: { from: "network" } });
          }}
        >
          Message
        </button>
      ) : networkStatus === "pending" ? (
        <button type="button" className="network-action network-action--pending" disabled>
          Pending
        </button>
      ) : (
        <button type="button" className="network-action network-action--primary" onClick={onConnect} disabled={busy}>
          {busy ? "…" : actionLabel}
        </button>
      )}
    </div>
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
