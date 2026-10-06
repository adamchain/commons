import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import type { MeDTO } from "../types/shared";

/** Settings → Privacy. Private account by default, then who can see plans and communities. */
export function PrivacyPage() {
  const { user, setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [confirmPublic, setConfirmPublic] = useState(false);

  if (!user) return <LoadingScreen tagline="Loading privacy settings" />;

  async function save(
    patch: Partial<Pick<MeDTO, "discoverableBySearch" | "profilePublic" | "showPlansPublicly" | "showCommunitiesPublicly">>,
  ): Promise<MeDTO | null> {
    if (busy || !user) return null;
    setBusy(true);
    try {
      const updated = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setUser(updated);
      return updated;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }

  function onPublicToggle() {
    if (!user || busy) return;
    if (user.profilePublic) {
      void save({ profilePublic: false, showPlansPublicly: false, showCommunitiesPublicly: false });
      return;
    }
    setConfirmPublic(true);
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/settings" className="back-circle" aria-label="Back">
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 6 }}>Privacy</h1>
      <p className="brand-tagline" style={{ marginBottom: 12, textTransform: "none", letterSpacing: 0 }}>
        Who can find and see you on COMMONS.
      </p>

      <section className="settings-group">
        <div className="settings-group-label">Account</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-body" style={{ paddingLeft: 0 }}>
              <div className="settings-row-title">Public account</div>
              <div className="settings-row-sub" style={{ whiteSpace: "normal" }}>
                Off by default. People outside your network can&apos;t see your plans or communities.
              </div>
            </div>
            <label className="pref-toggle">
              <input
                type="checkbox"
                checked={user.profilePublic}
                disabled={busy}
                onChange={onPublicToggle}
                aria-label="Public account"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-label">Plans and communities</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-body" style={{ paddingLeft: 0 }}>
              <div className="settings-row-title">Plans</div>
              <div className="settings-row-sub" style={{ whiteSpace: "normal" }}>
                Others can see your plans without being in your network.
              </div>
            </div>
            <label className="pref-toggle">
              <input
                type="checkbox"
                checked={user.profilePublic && user.showPlansPublicly}
                disabled={busy || !user.profilePublic}
                onChange={() => void save({ showPlansPublicly: !user.showPlansPublicly })}
                aria-label="Others can see your plans"
              />
            </label>
          </div>
          <div className="settings-row">
            <div className="settings-row-body" style={{ paddingLeft: 0 }}>
              <div className="settings-row-title">Communities</div>
              <div className="settings-row-sub" style={{ whiteSpace: "normal" }}>
                Others can see your communities without being in your network.
              </div>
            </div>
            <label className="pref-toggle">
              <input
                type="checkbox"
                checked={user.profilePublic && user.showCommunitiesPublicly}
                disabled={busy || !user.profilePublic}
                onChange={() => void save({ showCommunitiesPublicly: !user.showCommunitiesPublicly })}
                aria-label="Others can see your communities"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-label">Discovery</div>
        <div className="settings-card">
          <div className="settings-row">
            <div className="settings-row-body" style={{ paddingLeft: 0 }}>
              <div className="settings-row-title">Discoverable by name search</div>
              <div className="settings-row-sub" style={{ whiteSpace: "normal" }}>
                Show up when someone searches your name.
              </div>
            </div>
            <label className="pref-toggle">
              <input
                type="checkbox"
                checked={user.discoverableBySearch}
                disabled={busy}
                onChange={() => void save({ discoverableBySearch: !user.discoverableBySearch })}
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

      {confirmPublic && (
        <BottomSheet onClose={() => !busy && setConfirmPublic(false)} labelledBy="public-account-title">
          <h2 id="public-account-title" className="sheet-title">Make your account public?</h2>
          <p className="sheet-copy">
            Making your account public allows others to see your plans and communities without being in your network
          </p>
          <div className="sheet-actions">
            <Button
              variant="primary"
              block
              disabled={busy}
              onClick={() => {
                void save({
                  profilePublic: true,
                  showPlansPublicly: true,
                  showCommunitiesPublicly: true,
                }).then((updated) => {
                  if (updated) setConfirmPublic(false);
                });
              }}
            >
              Make public
            </Button>
            <Button variant="secondary" block disabled={busy} onClick={() => setConfirmPublic(false)}>
              Cancel
            </Button>
          </div>
        </BottomSheet>
      )}
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
