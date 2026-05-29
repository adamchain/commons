import { Link, useLocation } from "react-router-dom";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";

/**
 * Global top bar — COMMONS wordmark on the left, notifications + profile
 * icons on the right (no labels). Hidden on full-screen flows.
 */
export function TopBar() {
  const { user } = useAuth();
  const { pathname } = useLocation();

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
        COMMONS
      </Link>
      <div className="top-bar-actions">
        <Link to="/notifications" className="top-bar-icon-btn" aria-label="Notifications">
          <BellIcon />
        </Link>
        <Link to="/messages" className="top-bar-icon-btn" aria-label="Messages">
          <ChatIcon />
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
