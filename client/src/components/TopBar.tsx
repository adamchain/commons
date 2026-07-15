import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import wordmark from "../assets/wordmark.png";
import { Avatar } from "./Avatar";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import type { NotificationDTO } from "../types/shared";

/**
 * Global top bar — COMMONS wordmark on the left, a notifications bell (with an
 * unread dot) and the user's avatar on the right. Hidden on full-screen flows.
 */
export function TopBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [hasUnread, setHasUnread] = useState(false);

  const hide =
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/legal") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/admin") ||
    pathname === "/plans/new" ||
    pathname.startsWith("/notifications") ||
    /^\/plans\/[^/]+(\/chat)?$/.test(pathname) ||
    /^\/communities\/[^/]+\/chat$/.test(pathname);

  // Keep the bell's unread dot fresh — same lightweight visibility-aware poll
  // the bottom nav uses for the Messages badge.
  useEffect(() => {
    if (!user || hide) {
      setHasUnread(false);
      return;
    }
    let cancelled = false;
    const load = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void api<{ notifications: NotificationDTO[] }>("/api/notifications")
        .then((r) => {
          if (!cancelled) setHasUnread(r.notifications.some((n) => n.readAt === null));
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
  }, [user?.id, pathname, hide]);

  if (hide) return null;

  const profileTo = user ? `/profile/${user.id}` : "/onboarding";

  return (
    <header className="top-bar" aria-label="Top navigation">
      <Link to="/" className="top-bar-brand" aria-label="Commons home">
        <img src={wordmark} alt="COMMONS" className="top-bar-brand-img" />
      </Link>
      <div className="top-bar-actions">
        <Link
          to="/notifications"
          className="top-bar-icon-btn"
          aria-label={hasUnread ? "Notifications, unread" : "Notifications"}
        >
          <BellIcon />
          {hasUnread && <span className="top-bar-bell-dot" aria-hidden="true" />}
        </Link>
        <Link
          to={profileTo}
          className="top-bar-icon-btn top-bar-icon-btn--avatar"
          aria-label="Your profile"
        >
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

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}
