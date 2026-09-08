import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../context/AuthContext";
import type { MeDTO } from "../types/shared";

/** Settings → Privacy. Discoverability toggle + entry to the blocked list. */
export function PrivacyPage() {
  const { user, setUser } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user) return <LoadingScreen tagline="Loading privacy settings" />;

  async function toggleDiscoverable() {
    if (busy || !user) return;
    setBusy(true);
    try {
      const updated = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ discoverableBySearch: !user.discoverableBySearch }),
      });
      setUser(updated);
    } catch {
      /* keep previous state on failure */
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/settings" className="detail-back">← Settings</Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 6 }}>Privacy</h1>
      <p className="brand-tagline" style={{ marginBottom: 12, textTransform: "none", letterSpacing: 0 }}>
        Who can find and see you on COMMONS.
      </p>

      <section className="settings-group">
        <div className="settings-group-label">Discovery</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-body" style={{ paddingLeft: 0 }}>
              <div className="settings-row-title">Discoverable by name search</div>
              <div className="settings-row-sub" style={{ whiteSpace: "normal" }}>
                Let other members find your profile by searching your name
              </div>
            </div>
            <label className="pref-toggle">
              <input
                type="checkbox"
                checked={user.discoverableBySearch}
                disabled={busy}
                onChange={() => void toggleDiscoverable()}
                aria-label="Discoverable by name search"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-label">Blocking</div>
        <div className="settings-card">
          <Link to="/settings/blocked" className="settings-row">
            <div className="settings-row-body" style={{ paddingLeft: 0 }}>
              <div className="settings-row-title">Blocked accounts</div>
              <div className="settings-row-sub">Hidden from your feed instantly; we&apos;re notified to review</div>
            </div>
            <div className="settings-row-right">
              <span className="settings-row-chevron">
                <ChevronIcon />
              </span>
            </div>
          </Link>
        </div>
      </section>
    </main>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
