import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { LoadingScreen } from "../components/LoadingScreen";
import type { PublicUser } from "../types/shared";

/** Settings → Blocked. Lists everyone the signed-in user has blocked, with a one-tap unblock. */
export function BlockedListPage() {
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () =>
    void api<{ users: PublicUser[] }>("/api/users/blocked")
      .then((r) => setUsers(r.users))
      .catch(() => setUsers([]));

  useEffect(() => {
    load();
  }, []);

  async function unblock(id: string) {
    setBusyId(id);
    try {
      await api(`/api/users/${id}/block`, { method: "DELETE" });
      setUsers((prev) => (prev ?? []).filter((u) => u.id !== id));
    } catch {
      /* swallow — they can try again */
    } finally {
      setBusyId(null);
    }
  }

  if (users === null) return <LoadingScreen tagline="Loading blocked accounts" />;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/settings" className="detail-back">← Settings</Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 4 }}>Blocked</h1>
      <p className="brand-tagline" style={{ marginBottom: 16 }}>
        Blocked accounts can&apos;t see your plans or profile, and you won&apos;t see theirs.
      </p>

      {users.length === 0 ? (
        <p className="form-help">You haven&apos;t blocked anyone.</p>
      ) : (
        <div className="settings-card">
          {users.map((u) => (
            <div key={u.id} className="settings-row blocked-row">
              <Avatar
                seed={u.avatarSeed}
                style={u.avatarStyle}
                photoDataUrl={u.avatarPhotoDataUrl}
                params={u.avatarParams}
                name={u.firstName}
                size="sm"
              />
              <div className="settings-row-body">
                <div className="settings-row-title">{u.firstName}</div>
              </div>
              <button
                type="button"
                className="btn-link blocked-unblock-btn"
                onClick={() => void unblock(u.id)}
                disabled={busyId === u.id}
              >
                {busyId === u.id ? "…" : "Unblock"}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
