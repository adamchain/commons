import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Users,
  MessageCircle,
  Bell,
  UserRound,
  CalendarDays,
  Settings,
  Plus,
  LogOut,
} from "lucide-react";
import wordmark from "../assets/wordmark.png";
import { api } from "../api/http";
import { clearAuthToken } from "../api/authToken";
import { useAuth } from "../context/AuthContext";
import { needsOnboarding } from "../lib/onboarding";
import { formatPlanWhenWhereLine, sentenceCaseTitle } from "../lib/format";
import { planBelongsInPast } from "../lib/planTime";
import { Avatar } from "./Avatar";
import { openCreateLauncher } from "./CreateLauncher";
import type { ConversationSummaryDTO, MeDTO, PlanDTO } from "../types/shared";

/**
 * Instagram-style persistent desktop shell for the WEB app: a fixed left
 * sidebar (wordmark, profile, primary nav, create, logout) on every page, plus
 * a right rail of upcoming plans on the feed. Native iOS keeps its mobile
 * TopBar + BottomNav untouched — App.tsx only mounts this when `!isNative()`.
 *
 * It renders nothing on the marketing/auth/admin and full-screen immersive
 * routes (chat, DM, create/edit) so their own full-width chrome isn't offset.
 * The actual column offsets live in index.css under `.commons-web` (desktop
 * breakpoint only), so narrow browsers still fall back to the mobile layout.
 */

/** Should the web shell (sidebar) appear for this route + auth state? */
export function webShellVisible(pathname: string, user: MeDTO | null): boolean {
  if (!user || needsOnboarding(user)) return false;
  if (pathname === "/new") return false;
  if (/^\/(welcome|legal|onboarding|login|admin)/.test(pathname)) return false;
  if (pathname === "/plans/new" || pathname === "/communities/new" || pathname === "/helpchat") return false;
  if (/^\/plans\/[^/]+\/(chat|edit)$/.test(pathname)) return false;
  if (/^\/communities\/[^/]+\/chat$/.test(pathname)) return false;
  if (/^\/dm\/[^/]+$/.test(pathname)) return false;
  return true;
}

/** The right rail (upcoming plans) only rides along on the feed. */
export const webShellHasRail = (pathname: string): boolean => pathname === "/";

const NAV_ITEMS: { to: string; label: string; icon: typeof Home; end?: boolean }[] = [
  { to: "/", label: "Feed", icon: Home, end: true },
  { to: "/communities", label: "Communities", icon: Users },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/my-plans", label: "My plans", icon: CalendarDays },
  { to: "/network", label: "Network", icon: UserRound },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function WebAppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const visible = webShellVisible(pathname, user);
  const showRail = visible && webShellHasRail(pathname);

  const [unread, setUnread] = useState(0);
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);

  // Unread DM/chat count for the Messages badge (same source as BottomNav).
  useEffect(() => {
    if (!visible || !user) return;
    let cancelled = false;
    const load = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void api<ConversationSummaryDTO[]>("/api/conversations")
        .then((rows) => {
          if (!cancelled) setUnread(rows.reduce((n, r) => n + r.unreadCount, 0));
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [visible, user]);

  // Upcoming plans for the right rail.
  useEffect(() => {
    if (!showRail) return;
    let cancelled = false;
    void api<PlanDTO[]>("/api/plans")
      .then((rows) => {
        if (!cancelled) setPlans(rows);
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showRail]);

  if (!visible || !user) return null;

  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore — clear locally regardless */
    }
    await clearAuthToken();
    setUser(null);
    navigate("/welcome", { replace: true });
  };

  const upcoming = (plans ?? [])
    .filter(
      (p) =>
        !p.cancelledAt &&
        !planBelongsInPast(p) &&
        (p.creator.id === user.id || p.myState === "going"),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 5);

  return (
    <>
      <aside className="web-sidebar" aria-label="Primary">
        <div className="web-sidebar-inner">
          <NavLink to="/" className="web-brand" aria-label="Commons home">
            <img src={wordmark} alt="Commons" />
          </NavLink>

          <NavLink to={`/profile/${user.id}`} className="web-profile">
            <Avatar
              seed={user.avatarSeed}
              style={user.avatarStyle}
              photoDataUrl={user.avatarPhotoDataUrl}
              params={user.avatarParams}
              name={user.firstName}
              size="md"
            />
            <span className="web-profile-text">
              <strong>{user.firstName || "You"}</strong>
              <small>View profile</small>
            </span>
          </NavLink>

          <nav className="web-nav">
            {NAV_ITEMS.map(({ to, label, icon: Ico, end }) => (
              <NavLink key={to} to={to} end={end} className="web-nav-item">
                <span className="web-nav-icon">
                  <Ico size={23} strokeWidth={1.9} />
                  {to === "/messages" && unread > 0 && (
                    <span className="web-nav-badge">{unread > 9 ? "9+" : unread}</span>
                  )}
                </span>
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <button type="button" className="web-create" onClick={openCreateLauncher}>
            <Plus size={20} strokeWidth={2.4} /> Create a plan
          </button>

          <button className="web-logout" onClick={logout} type="button">
            <LogOut size={20} strokeWidth={1.9} /> Log out
          </button>
        </div>
      </aside>

      {showRail && (
        <aside className="web-rail" aria-label="Upcoming plans">
          <div className="web-rail-card">
            <div className="web-rail-head">
              <strong>Upcoming plans</strong>
              <NavLink to="/my-plans">See all</NavLink>
            </div>

            {plans === null ? (
              <div className="web-rail-empty">Loading…</div>
            ) : upcoming.length === 0 ? (
              <div className="web-rail-empty">
                Nothing on the calendar yet.{" "}
                <NavLink to="/plans/new">Make a plan →</NavLink>
              </div>
            ) : (
              upcoming.map((plan) => (
                <NavLink key={plan.id} to={`/plans/${plan.id}`} className="web-rail-row">
                  <span className="web-rail-row-name">{sentenceCaseTitle(plan.title)}</span>
                  <span className="web-rail-row-meta">{formatPlanWhenWhereLine(plan)}</span>
                </NavLink>
              ))
            )}
          </div>

          <p className="web-rail-copy">© 2026 Commons</p>
        </aside>
      )}
    </>
  );
}
