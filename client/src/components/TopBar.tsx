import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Avatar } from "./Avatar";
import wordmark from "../assets/wordmark.png";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import type { ConversationSummaryDTO } from "../types/shared";

/**
 * Global top bar — COMMONS wordmark on the left, notifications + messages +
 * profile icons on the right (no labels). Hidden on full-screen flows.
 */
export function TopBar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Keep the messages badge fresh: refetch on navigation + poll lightly while
  // the app is foregrounded. Push notifications cover the backgrounded case.
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
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/admin") ||
    pathname === "/plans/new" ||
    pathname.startsWith("/notifications") ||
    /^\/plans\/[^/]+(\/chat)?$/.test(pathname);

  if (hide) return null;

  const profileTo = user ? `/profile/${user.id}` : "/onboarding";

  return (
    <header className="top-bar" aria-label="Top navigation">
      <Link to="/" className="top-bar-brand" aria-label="Commons home">
        <img src={wordmark} alt="COMMONS" className="top-bar-brand-img" />
      </Link>
      <div className="top-bar-actions">
        <Link to="/notifications" className="top-bar-icon-btn" aria-label="Notifications">
          <BellIcon />
        </Link>
        <Link
          to="/messages"
          className="top-bar-icon-btn"
          aria-label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : "Messages"}
        >
          <ChatIcon />
          {unreadMessages > 0 && (
            <span className="top-bar-badge">{unreadMessages > 9 ? "9+" : unreadMessages}</span>
          )}
        </Link>
        <Link to={profileTo} className="top-bar-icon-btn top-bar-icon-btn--avatar" aria-label="Your profile">
          {user ? (
            <Avatar
              seed={user.avatarSeed}
              style={user.avatarStyle}
              photoDataUrl={user.avatarPhotoDataUrl}
              params={user.avatarParams}
              name={user.firstName || undefined}
              size="sm"
            />
          ) : (
            <UserIcon />
          )}
        </Link>
      </div>
    </header>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
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
