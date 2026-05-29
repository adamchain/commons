import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import type { PublicUser } from "../types/shared";

export function NetworkPage() {
  const { user } = useAuth();
  const [network, setNetwork] = useState<PublicUser[] | null>(null);

  useEffect(() => {
    void api<{ users: PublicUser[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]));
  }, []);

  if (network === null) return <LoadingScreen tagline="Loading network" />;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to={user ? `/profile/${user.id}` : "/"} className="detail-back">
          ← Back
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 4 }}>
        Your network
      </h1>
      <p className="brand-tagline" style={{ marginBottom: 20 }}>
        {network.length} {network.length === 1 ? "person" : "people"} you've added
      </p>

      {network.length === 0 ? (
        <p className="form-help">Go to plans, meet people, add them after.</p>
      ) : (
        <div className="profile-network-list">
          {network.map((u) => (
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
