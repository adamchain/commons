import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { EmptyCard, ScreenTitle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import type { PublicUser } from "../types/shared";

export function NetworkPage() {
  const { user } = useAuth();
  const [network, setNetwork] = useState<PublicUser[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void api<{ users: PublicUser[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]));
  }, []);

  const filtered = useMemo(() => {
    if (!network) return [];
    const q = query.trim().toLowerCase();
    if (!q) return network;
    return network.filter((u) => {
      const full = [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase();
      return full.includes(q) || u.firstName.toLowerCase().includes(q);
    });
  }, [network, query]);

  if (network === null) return <LoadingScreen tagline="Loading network" />;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to={user ? `/profile/${user.id}` : "/"} className="detail-back">
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" /> Profile
        </Link>
      </header>
      <ScreenTitle
        title="Your network"
        subtitle={`${network.length} ${network.length === 1 ? "person" : "people"} you've added`}
      />

      {network.length > 0 && (
        <div className="network-search-wrap">
          <SearchIcon />
          <input
            type="search"
            className="network-search-input"
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search your network by name"
          />
        </div>
      )}

      {network.length === 0 ? (
        <EmptyCard
          icon={<Users size={22} strokeWidth={1.6} color="#3A6A3A" />}
          tint="#C8DDC8"
          title="No network yet."
          body="Meet people at plans and add them after — or invite a friend to skip straight to it."
          cta={{ to: "/invite", label: "Invite friends →" }}
        />
      ) : filtered.length === 0 ? (
        <p className="form-help">No one in your network matches &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <div className="profile-network-list">
          {filtered.map((u) => (
            <Link
              key={u.id}
              to={`/profile/${u.id}`}
              className="profile-network-row"
              aria-label={`Open ${u.firstName}'s profile`}
            >
              <Avatar
                seed={u.avatarSeed}
                style={u.avatarStyle}
                photoDataUrl={u.avatarPhotoDataUrl}
                params={u.avatarParams}
                name={u.firstName}
                size="md"
              />
              <span className="profile-network-name">{u.firstName}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
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
