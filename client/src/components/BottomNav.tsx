import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import type { ConversationSummaryDTO } from "../types/shared";

/**
 * Global bottom nav — Home · Explore · Make a Plan (center) · Messages · Profile.
 * Messages + Profile also still live in the top bar for now, so the two
 * placements can be compared before we commit to one.
 */
export function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Keep the Messages badge fresh — same lightweight poll the top bar uses.
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
    pathname.match(/^\/communities\/[^/]+\/chat$/);
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
          <HomeIcon />
        </span>
        <span className="bottom-nav-label">Home</span>
        <span className="bottom-nav-dot" aria-hidden="true" />
      </NavLink>

      <NavLink
        to="/explore"
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label="Explore"
      >
        <span className="bottom-nav-icon-wrap">
          <SearchIcon />
        </span>
        <span className="bottom-nav-label">Explore</span>
        <span className="bottom-nav-dot" aria-hidden="true" />
      </NavLink>

      <NavLink to="/plans/new" className="bottom-nav-cta" aria-label="Make a plan">
        <PlusIcon />
      </NavLink>

      <NavLink
        to="/messages"
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label={unreadMessages > 0 ? `Chats, ${unreadMessages} unread` : "Chats"}
      >
        <span className="bottom-nav-icon-wrap">
          <ChatIcon />
          {unreadMessages > 0 && (
            <span className="bottom-nav-badge">{unreadMessages > 9 ? "9+" : unreadMessages}</span>
          )}
        </span>
        <span className="bottom-nav-label">Chats</span>
        <span className="bottom-nav-dot" aria-hidden="true" />
      </NavLink>

        <NavLink
        to={profileTo}
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label="Your profile"
      >
        <span className="bottom-nav-icon-wrap">
          <UserIcon />
        </span>
        <span className="bottom-nav-label">Profile</span>
        <span className="bottom-nav-dot" aria-hidden="true" />
      </NavLink>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 9-7 9 7" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
