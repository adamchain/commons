import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_LABELS,
  type MeDTO,
  type NotificationPrefs,
} from "../types/shared";

export function SettingsPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    sessionStorage.removeItem("commons_pending_admin_choice");
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    navigate("/onboarding", { replace: true });
  };

  if (!user) return <LoadingScreen tagline="Loading settings" />;

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to={`/profile/${user.id}`} className="detail-back">
          ← Back
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 20 }}>
        Settings
      </h1>

      <AppearanceSection />
      <NotificationSettings me={user} onUpdated={setUser} />
      {user.canAccessAdmin && (
        <section className="profile-block">
          <Link
            to="/admin"
            className="btn-secondary btn-block"
            style={{ textAlign: "center", display: "block" }}
          >
            Admin dashboard
          </Link>
        </section>
      )}
      <AccountSection onSignOut={() => void signOut()} />
    </main>
  );
}

function AppearanceSection() {
  const { theme } = useTheme();
  return (
    <section className="profile-block profile-settings">
      <h3 className="who-block-heading">Appearance</h3>
      <div className="profile-settings-row">
        <div>
          <div className="profile-settings-label">Theme</div>
          <div className="profile-settings-sub">{theme === "dark" ? "Dark" : "Light"} mode</div>
        </div>
        <ThemeToggle />
      </div>
    </section>
  );
}

function NotificationSettings({
  me,
  onUpdated,
}: {
  me: MeDTO;
  onUpdated: (next: MeDTO) => void;
}) {
  const current: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, ...(me.notificationPrefs ?? {}) };
  const [busy, setBusy] = useState<keyof NotificationPrefs | null>(null);

  async function toggle(key: keyof NotificationPrefs) {
    if (busy) return;
    setBusy(key);
    const next: NotificationPrefs = { ...current, [key]: !current[key] };
    try {
      const updated = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ notificationPrefs: next }),
      });
      onUpdated(updated);
    } catch {
      /* keep previous state; user can retry */
    } finally {
      setBusy(null);
    }
  }

  const keys = Object.keys(NOTIFICATION_LABELS) as Array<keyof NotificationPrefs>;

  return (
    <section className="profile-block profile-settings">
      <h3 className="who-block-heading">Notifications</h3>
      <div className="notif-prefs-list">
        {keys.map((key) => (
          <label key={key} className="notif-pref-row">
            <span className="notif-pref-label">{NOTIFICATION_LABELS[key]}</span>
            <input
              type="checkbox"
              className="notif-pref-toggle"
              checked={current[key]}
              disabled={busy === key}
              onChange={() => void toggle(key)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function AccountSection({ onSignOut }: { onSignOut: () => void }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toLowerCase() === "delete";

  async function doDelete() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api("/api/auth/me", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      setUser(null);
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete account");
      setDeleting(false);
    }
  }

  return (
    <section className="profile-block profile-settings">
      <h3 className="who-block-heading">Account</h3>
      <div className="profile-settings-row">
        <div>
          <div className="profile-settings-label">Sign out</div>
          <div className="profile-settings-sub">Sign out of COMMONS</div>
        </div>
        <button type="button" className="btn-link" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <div className="profile-settings-row">
        <div>
          <div className="profile-settings-label">Delete account</div>
          <div className="profile-settings-sub">Permanently removes your profile, plans, and history.</div>
        </div>
        <button
          type="button"
          className="btn-link"
          style={{ color: "var(--danger)" }}
          onClick={() => {
            setConfirmText("");
            setDeleteError(null);
            setShowDelete(true);
          }}
        >
          Delete
        </button>
      </div>
      {showDelete && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={() => !deleting && setShowDelete(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h4 id="delete-account-title" style={{ marginTop: 0 }}>Delete your account?</h4>
            <p style={{ marginTop: 0 }}>
              This is permanent. Your plans will be cancelled, your network connections
              will be removed, and you'll be signed out. Type <strong>delete</strong> to confirm.
            </p>
            <input
              type="text"
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete"
              disabled={deleting}
              style={{ width: "100%", marginBottom: 12 }}
            />
            {deleteError && <p className="error-text">{deleteError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn-link" onClick={() => setShowDelete(false)} disabled={deleting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void doDelete()}
                disabled={!canDelete || deleting}
                style={{ background: "var(--danger)" }}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
