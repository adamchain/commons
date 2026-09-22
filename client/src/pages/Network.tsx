import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { ScreenTitle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type { NetworkLinkStatus, PersonSearchResultDTO, PublicUser, SearchResultsDTO } from "../types/shared";

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
};

/**
 * People you know, plus a name search that can connect with anyone
 * discoverable in the city.
 */
export function NetworkPage() {
  const { user } = useAuth();
  const [network, setNetwork] = useState<NetworkMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; people: PersonSearchResultDTO[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, NetworkLinkStatus>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void api<{ users: NetworkMember[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]))
      .finally(() => setLoaded(true));
  }, []);

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

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar network-page">
      <header className="app-header app-header--minimal">
        <Link to={profileTo} className="back-circle" aria-label="Back">
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
      </header>
      <ScreenTitle title="My network" subtitle="People you know in Philadelphia." />

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

      {serverPeople && (
        <p className="network-results-label">Results for “{trimmed}”</p>
      )}

      {rows.length > 0 ? (
        <div className="network-card">
          {rows.map((row) => (
            <NetworkRow
              key={row.user.id}
              row={row}
              busy={busyId === row.user.id}
              onConnect={() => void connect(row.user.id)}
            />
          ))}
        </div>
      ) : (
        loaded &&
        !searching &&
        !waitingForResults && (
          <p className="network-empty">{trimmed ? "Nobody by that name." : "It's just you for now."}</p>
        )
      )}

      <p className="network-invite">
        Not finding someone? <Link to="/invite">Invite them →</Link>
      </p>
    </main>
  );
}

function NetworkRow({
  row,
  busy,
  onConnect,
}: {
  row: Row;
  busy: boolean;
  onConnect: () => void;
}) {
  const navigate = useNavigate();
  const { user, neighborhoodName, mutualCount, networkStatus } = row;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Friend";
  const meta = [
    neighborhoodName,
    mutualCount > 0 ? `${mutualCount} mutual` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="network-row">
      <Link to={`/profile/${user.id}`} state={{ from: "network" }} className="network-row-main">
        <Avatar
          seed={user.avatarSeed}
          style={user.avatarStyle}
          photoDataUrl={user.avatarPhotoDataUrl}
          params={user.avatarParams}
          name={user.firstName}
          size="md"
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
          {busy ? "…" : "Connect"}
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
