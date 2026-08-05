import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../api/http";
import { LoadingScreen } from "../components/LoadingScreen";
import { ScreenTitle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { interestVisual } from "../lib/interestIcons";
import {
  FORUM_INTERESTS,
  INTEREST_LABELS,
  type ForumSummaryDTO,
  type InterestTag,
} from "../types/shared";

/**
 * Forum membership editor — joined forums with Leave, plus chips to join more.
 */
export function SettingsForumsPage() {
  const { user } = useAuth();
  const [forums, setForums] = useState<ForumSummaryDTO[]>([]);
  const [ready, setReady] = useState(false);
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setReady(false);
    void api<{ forums: ForumSummaryDTO[] }>("/api/forums")
      .then((r) => setForums(r.forums))
      .catch(() => setForums([]))
      .finally(() => setReady(true));
  };

  useEffect(() => {
    load();
  }, []);

  if (!user) return <LoadingScreen tagline="Loading forums" />;

  const joined = new Set(forums.map((f) => f.interestTag));
  const available = FORUM_INTERESTS.filter((t) => !joined.has(t));

  async function leave(tag: InterestTag) {
    setBusyTag(tag);
    setErr(null);
    try {
      await api(`/api/forums/${tag}/leave`, { method: "POST" });
      setForums((prev) => prev.filter((f) => f.interestTag !== tag));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't leave forum.");
    } finally {
      setBusyTag(null);
    }
  }

  async function join(tag: InterestTag) {
    setBusyTag(tag);
    setErr(null);
    try {
      await api(`/api/forums/${tag}/join`, { method: "POST" });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't join forum.");
    } finally {
      setBusyTag(null);
    }
  }

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar">
      <header className="app-header app-header--minimal">
        <Link to="/settings" className="detail-back">
          <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" /> Settings
        </Link>
      </header>
      <ScreenTitle
        title="Forums"
        subtitle="Citywide conversations by interest — join or leave anytime."
      />

      {!ready ? (
        <div className="feed-skeleton" aria-hidden="true">
          <div className="feed-skeleton-card" />
        </div>
      ) : forums.length === 0 ? (
        <p className="form-help">You haven&apos;t joined any forums yet. Pick one below.</p>
      ) : (
        <div className="settings-card settings-forums-card" style={{ marginBottom: 20 }}>
          {forums.map((f) => {
            const { Icon, iconColor, tint } = interestVisual(f.interestTag);
            return (
              <div key={f.interestTag} className="settings-forum-row">
                <Link
                  to={`/forums/${f.interestTag}`}
                  state={{ from: "settings-forums" }}
                  className="settings-forum-link"
                >
                  <span
                    className="settings-forum-icon"
                    style={{ background: tint, color: iconColor }}
                    aria-hidden="true"
                  >
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="settings-forum-label">{f.label}</span>
                </Link>
                <button
                  type="button"
                  className="forum-leave-btn"
                  disabled={busyTag === f.interestTag}
                  onClick={() => void leave(f.interestTag)}
                >
                  {busyTag === f.interestTag ? "Leaving…" : "Leave"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {available.length > 0 && (
        <>
          <p className="form-eyebrow">Join more forums</p>
          <div className="settings-interests-grid">
            {available.map((t) => {
              const { Icon, iconColor, tint } = interestVisual(t);
              return (
                <button
                  key={t}
                  type="button"
                  className="settings-interest-pill settings-forum-join-pill"
                  disabled={busyTag === t}
                  onClick={() => void join(t)}
                >
                  <span
                    className="settings-forum-icon settings-forum-icon--sm"
                    style={{ background: tint, color: iconColor }}
                    aria-hidden="true"
                  >
                    <Icon size={14} strokeWidth={1.8} />
                  </span>
                  {INTEREST_LABELS[t]}
                </button>
              );
            })}
          </div>
        </>
      )}

      {err && <p className="error-text" style={{ marginTop: 12 }}>{err}</p>}
    </main>
  );
}
