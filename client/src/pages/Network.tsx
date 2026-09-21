import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { ScreenTitle } from "../components/ui";
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
  const [network, setNetwork] = useState<NetworkMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonSearchResultDTO[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, NetworkLinkStatus>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void api<{ users: NetworkMember[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]))
      .finally(() => setLoaded(true));
  }, []);

  const trimmed = query.trim();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!trimmed) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void api<SearchResultsDTO>(`/api/search?q=${encodeURIComponent(trimmed)}`)
        .then((r) => setResults(r.people))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmed]);

  const rows: Row[] = trimmed
    ? (results ?? []).map((p) => ({
        user: p.user,
        neighborhoodName: p.neighborhoodName,
        mutualCount: p.mutualCount,
        networkStatus: overrides[p.user.id] ?? p.networkStatus,
      }))
    : network.map((u) => ({
        user: u,
        neighborhoodName: u.neighborhoodName ?? null,
        mutualCount: u.mutualCount ?? 0,
        networkStatus: "connected" as const,
      }));

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

  return (
    <main className="page network-page">
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
        />
        {query && (
          <button type="button" className="network-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
            ×
          </button>
        )}
      </div>

      {trimmed && (
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
        !searching && (
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
      <Link to={`/profile/${user.id}`} state={{ from: "profile" }} className="network-row-main">
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
        <Link to={`/profile/${user.id}`} state={{ from: "profile" }} className="network-action network-action--primary">
          Message
        </Link>
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
