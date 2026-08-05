import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Search, Plus, MessageCircle, User } from "lucide-react";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import type { ConversationSummaryDTO } from "../types/shared";

/**
 * Bottom nav — Home · Search · Plus (create) · MessageCircle · User.
 * Height 58px, bg card, borderTop border. Active = red; inactive = faint.
 * Plus: 44×44 circle, red, icon 20 white.
 */
export function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadMessages(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void api<ConversationSummaryDTO[]>("/api/conversations")
        .then((rows) => {
          if (!cancelled) setUnreadMessages(rows.reduce((n, r) => n + r.unreadCount, 0));
        })
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 60000);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, pathname]);

  const hide =
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/legal") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/login") ||
    pathname === "/plans/new" ||
    pathname.match(/^\/plans\/[^/]+\/chat$/) ||
    pathname.match(/^\/communities\/[^/]+\/chat$/) ||
    (!user && Boolean(pathname.match(/^\/plans\/[^/]+$/)));
  if (hide) return null;

  const profileTo = user ? `/profile/${user.id}` : "/onboarding";

  return (
    <nav className="bottom-nav bottom-nav--five" aria-label="Primary">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label="Home"
        onClick={(e) => {
          if (pathname === "/") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("commons:home-refresh"));
          }
        }}
      >
        <span className="bottom-nav-icon-wrap">
          <Home size={22} strokeWidth={1.6} />
        </span>
        <span className="bottom-nav-label">Home</span>
      </NavLink>

      <NavLink
        to="/explore"
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label="Search"
      >
        <span className="bottom-nav-icon-wrap">
          <Search size={22} strokeWidth={1.6} />
        </span>
        <span className="bottom-nav-label">Search</span>
      </NavLink>

      <NavLink to="/plans/new" className="bottom-nav-cta" aria-label="Make a plan">
        <Plus size={20} strokeWidth={2.2} color="white" />
      </NavLink>

      <NavLink
        to="/messages"
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : "Messages"}
      >
        <span className="bottom-nav-icon-wrap">
          <MessageCircle size={22} strokeWidth={1.6} />
          {unreadMessages > 0 && (
            <span className="bottom-nav-badge">{unreadMessages > 9 ? "9+" : unreadMessages}</span>
          )}
        </span>
        <span className="bottom-nav-label">Messages</span>
      </NavLink>

      <NavLink
        to={profileTo}
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label="Your profile"
      >
        <span className="bottom-nav-icon-wrap">
          <User size={22} strokeWidth={1.6} />
        </span>
        <span className="bottom-nav-label">Profile</span>
      </NavLink>
    </nav>
  );
}
