import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api/http";
import { getCurrentCoords } from "../lib/geolocate";
import { LoadingScreen } from "../components/LoadingScreen";
import { LegalContent } from "../components/LegalContent";
import { ScreenTitle } from "../components/ui";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Button } from "../components/ui/Button";
import { LEGAL_DOCS } from "../content/legal";
import { useAuth } from "../context/AuthContext";
import {
  INTEREST_LABELS,
  type InviteCodeDTO,
  type MeDTO,
} from "../types/shared";

/**
 * Grouped settings — ACCOUNT / ACTIVITY / APP cards each with icon rows.
 * Notifications + interests + privacy each link out to dedicated screens; the
 * Appearance row hosts the Light / Dark / Auto segment inline.
 */
export function SettingsPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [inviteCount, setInviteCount] = useState<number | null>(null);
  const [legalSheet, setLegalSheet] = useState<"terms" | "privacy" | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);

  useEffect(() => {
    void api<{ codes: InviteCodeDTO[] }>("/api/auth/invite-codes")
      .then((r) => setInviteCount(r.codes.filter((c) => c.redeemedAt === null).length))
      .catch(() => setInviteCount(0));
  }, []);

  const signOut = async () => {
    sessionStorage.removeItem("commons_pending_admin_choice");
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    navigate("/onboarding", { replace: true });
  };

  if (!user) return <LoadingScreen tagline="Loading settings" />;

  const interestsSub =
    user.interests.length === 0
      ? "What are you into?"
      : user.interests.map((t) => INTEREST_LABELS[t]).join(" · ");

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to={`/profile/${user.id}`} className="back-circle" aria-label="Back">
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
      </header>
      <ScreenTitle title="Settings" />

      <SettingsGroup label="Account">
        <SettingsRow
          to={`/profile/${user.id}`}
          icon={<UserIcon />}
          title="Edit profile"
          sub="Name, photo, bio"
        />
        <SettingsRow
          icon={<PinIcon />}
          title="Location"
          sub={user.location ? "Sharing · plans within 15 miles come first" : "Off · share to see what's nearby"}
          onClick={() => setLocationOpen(true)}
        />
        <SettingsRow
          to="/settings/forums"
          icon={<MessageIcon />}
          title="Forums"
          sub="Join or leave interest forums"
        />
        <SettingsRow
          to="/settings/interests"
          icon={<HeartIcon />}
          title="Interests"
          sub={interestsSub}
        />
        <SettingsRow
          to="/invite"
          icon={<MailIcon />}
          title="Invite codes"
          sub={
            inviteCount === null
              ? "Loading…"
              : `${inviteCount} left to share`
          }
          badge={inviteCount ?? undefined}
        />
      </SettingsGroup>

      <SettingsGroup label="Activity">
        <SettingsRow
          to="/settings/notifications"
          icon={<BellIcon />}
          title="Notifications"
          sub="Manage what reaches you"
        />
        <SettingsRow
          to="/settings/privacy"
          icon={<LockIcon />}
          title="Privacy"
          sub="Search, blocking, reports"
        />
      </SettingsGroup>

      <SettingsGroup label="App">
        <SettingsRow
          to="/helpchat"
          icon={<HelpIcon />}
          title="Help &amp; Support"
          sub="Ask questions about how Commons works"
        />
        <SettingsRow
          icon={<GlobeIcon />}
          title="Language"
          sub="English (US)"
          comingSoon
        />
        <SettingsRow
          icon={<InfoIcon />}
          title="About COMMONS"
          sub="Version 1.0"
        />
      </SettingsGroup>

      <SettingsGroup label="Legal">
        <SettingsRow
          icon={<InfoIcon />}
          title="Terms of Service"
          sub="The rules of the community"
          onClick={() => setLegalSheet("terms")}
        />
        <SettingsRow
          icon={<LockIcon />}
          title="Privacy Policy"
          sub="How we handle your data"
          onClick={() => setLegalSheet("privacy")}
        />
      </SettingsGroup>

      {user.canAccessAdmin && (
        <SettingsGroup label="Admin">
          <SettingsRow
            to="/admin"
            icon={<ShieldIcon />}
            title="Admin dashboard"
            sub="Metrics, users, moderation"
          />
        </SettingsGroup>
      )}

      <button type="button" className="settings-signout" onClick={() => void signOut()}>
        <SignOutIcon />
        Sign out of COMMONS
      </button>

      <DeleteAccountRow onSignedOut={() => navigate("/onboarding", { replace: true })} />

      {legalSheet && <LegalSheet slug={legalSheet} onClose={() => setLegalSheet(null)} />}
      {locationOpen && (
        <LocationSheet
          sharing={Boolean(user.location)}
          onClose={() => setLocationOpen(false)}
          onUpdated={(me) => {
            setUser(me);
            setLocationOpen(false);
          }}
        />
      )}
    </main>
  );
}

/**
 * 1.24 — Terms of Service / Privacy Policy open as an in-place sheet rather
 * than a full navigation away from Settings. `/legal/:slug` still exists as a
 * standalone route for deep links and the marketing site.
 */
function LegalSheet({ slug, onClose }: { slug: "terms" | "privacy"; onClose: () => void }) {
  const doc = LEGAL_DOCS[slug];
  return (
    <BottomSheet onClose={onClose} labelledBy="legal-sheet-title">
        <div className="filter-sheet-header">
          <h3 id="legal-sheet-title" className="filter-sheet-title">{doc.title}</h3>
          <button type="button" className="btn-link" onClick={onClose}>
            Close
          </button>
        </div>
        <LegalContent doc={doc} hideTitle />
    </BottomSheet>
  );
}

function LocationSheet({
  sharing,
  onClose,
  onUpdated,
}: {
  sharing: boolean;
  onClose: () => void;
  onUpdated: (me: MeDTO) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const coords = await getCurrentCoords({ timeoutMs: 8000 });
      if (!coords) {
        setError("Location access was denied. Allow it in your browser or phone settings, then try again.");
        return;
      }
      const me = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ location: coords }),
      });
      onUpdated(me);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your location");
    } finally {
      setBusy(false);
    }
  }

  async function stopSharing() {
    setBusy(true);
    setError(null);
    try {
      const me = await api<MeDTO>("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ location: null }),
      });
      onUpdated(me);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn location off");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet onClose={onClose} labelledBy="location-sheet-title">
      <div className="filter-sheet-header">
        <h3 id="location-sheet-title" className="filter-sheet-title">Location</h3>
        <button type="button" className="btn-link" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="sheet-copy">
        Share your location and plans within 15 miles show up first on your feed.
      </p>
      {error && <p className="error-text">{error}</p>}
      <div className="sheet-actions">
        <Button variant="primary" block disabled={busy} onClick={() => void share()}>
          {busy ? "Working…" : sharing ? "Update location" : "Share my location"}
        </Button>
        {sharing && (
          <Button variant="secondary" block disabled={busy} onClick={() => void stopSharing()}>
            Stop sharing
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}

function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <div className="settings-group-label">{label}</div>
      <div className="settings-card">{children}</div>
    </section>
  );
}

function SettingsRow({
  to,
  onClick,
  icon,
  iconAccent = false,
  title,
  sub,
  badge,
  right,
  comingSoon = false,
}: {
  to?: string;
  onClick?: () => void;
  icon: ReactNode;
  iconAccent?: boolean;
  title: string;
  sub: string;
  badge?: number;
  right?: ReactNode;
  comingSoon?: boolean;
}) {
  const inner = (
    <>
      <span className={`settings-row-icon ${iconAccent ? "settings-row-icon--accent" : ""}`}>
        {icon}
      </span>
      <div className="settings-row-body">
        <div className="settings-row-title">{title}</div>
        <div className="settings-row-sub">{sub}</div>
      </div>
      <div className="settings-row-right">
        {badge !== undefined && badge > 0 && (
          <span className="settings-row-badge">{badge}</span>
        )}
        {right ?? (
          <span className="settings-row-chevron">
            <ChevronIcon />
          </span>
        )}
      </div>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="settings-row">
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="settings-row"
      onClick={comingSoon ? () => alert("Coming soon.") : onClick}
    >
      {inner}
    </button>
  );
}

function DeleteAccountRow({ onSignedOut }: { onSignedOut: () => void }) {
  const { setUser } = useAuth();
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
      onSignedOut();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete account");
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-link"
        style={{ color: "var(--danger)", marginTop: 16, display: "block" }}
        onClick={() => {
          setConfirmText("");
          setDeleteError(null);
          setShowDelete(true);
        }}
      >
        Delete account
      </button>
      {showDelete && (
        <BottomSheet
          onClose={() => !deleting && setShowDelete(false)}
          closeDisabled={deleting}
          labelledBy="delete-account-title"
        >
            <h2 id="delete-account-title" className="sheet-title">
              Delete your account?
            </h2>
            <p className="sheet-copy">
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
            />
            {deleteError && <p className="error-text">{deleteError}</p>}
            <div className="sheet-actions">
              <Button
                variant="primary"
                block
                onClick={() => void doDelete()}
                disabled={!canDelete || deleting}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </Button>
              <Button
                variant="secondary"
                block
                onClick={() => setShowDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
        </BottomSheet>
      )}
    </>
  );
}

/* ---------- icons (line-based, inherit currentColor) ---------- */

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 5-6 8-6s7 2 8 6" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 21s-7-4.5-9.5-9C.8 8.5 2 5 5.5 5c2 0 3.5 1 4.5 2.5 1-1.5 2.5-2.5 4.5-2.5C18 5 19.2 8.5 21.5 12 19 16.5 12 21 12 21Z" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" />
    </svg>
  );
}
function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17 5 12l5-5M5 12h11" />
    </svg>
  );
}
function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
