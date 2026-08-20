import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import wordmark from "../assets/wordmark.png";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import type { NotificationDTO } from "../types/shared";

/**
 * AppHeader — wordmark left, Bell right (Profile lives in bottom nav).
 * Padding 16h / 14 top / 10 bottom; icons 18px stroke 1.6 muted; gap 14px.
 * Hairline rule below (margin 0 20px).
 */
export function TopBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [hasUnread, setHasUnread] = useState(false);

  // Other-user profiles own their chrome (back + •••). Hide even before `user`
  // hydrates — otherwise the wordmark/bell cover those controls for a beat
  // (and on some loads, for the whole visit).
  const otherProfile = /^\/profile\/([^/]+)$/.exec(pathname);
  const isOtherUserProfile = Boolean(otherProfile && otherProfile[1] !== user?.id);

  const hide =
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/legal") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/admin") ||
    pathname === "/plans/new" ||
    pathname === "/explore" ||
    pathname.startsWith("/notifications") ||
    /^\/plans\/[^/]+(\/chat)?$/.test(pathname) ||
    /^\/plans\/[^/]+\/edit$/.test(pathname) ||
    /^\/communities\/[^/]+\/chat$/.test(pathname) ||
    isOtherUserProfile;

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

  return (
    <header className="top-bar" aria-label="Top navigation">
      <Link
        to="/"
        className="top-bar-brand"
        aria-label="Commons home"
        onClick={(e) => {
          if (pathname === "/") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("commons:home-refresh"));
          }
        }}
      >
        <img src={wordmark} alt="COMMONS" className="top-bar-brand-img" />
      </Link>
      <div className="top-bar-actions">
        <Link
          to="/notifications"
          className="top-bar-icon-btn"
          aria-label={hasUnread ? "Notifications, unread" : "Notifications"}
        >
          <Bell size={18} strokeWidth={1.6} />
          {hasUnread && <span className="top-bar-bell-dot" aria-hidden="true" />}
        </Link>
      </div>
      <div className="top-bar-rule" aria-hidden="true" />
    </header>
  );
}
