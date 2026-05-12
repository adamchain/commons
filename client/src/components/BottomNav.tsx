import { NavLink, useLocation } from "react-router-dom";
import { Avatar } from "./Avatar";
import { useAuth } from "../context/AuthContext";

/**
 * Global bottom nav — Explore (left), Make a Plan (center primary), Profile (right).
 * Hidden on onboarding and creation flows where it would compete with the form's primary CTA.
 */
export function BottomNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const hide =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/login") ||
    pathname === "/plans/new" ||
    pathname.match(/^\/plans\/[^/]+\/chat$/);
  if (hide) return null;

  const profileTo = user ? `/profile/${user.id}` : "/onboarding";

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink
        to="/explore"
        className={({ isActive }) => `bottom-nav-item bottom-nav-item--soon ${isActive ? "is-active" : ""}`}
      >
        <CompassIcon />
        <span>
          Explore<span className="bottom-nav-soon-dot" aria-hidden="true" />
        </span>
      </NavLink>

      <NavLink to="/plans/new" className="bottom-nav-cta" aria-label="Make a plan">
        <PlusIcon />
        <span>Make a Plan</span>
      </NavLink>

      <NavLink to={profileTo} className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}>
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
        <span>Profile</span>
      </NavLink>
    </nav>
  );
}

function CompassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-3 5-5 3 3-5 5-3z" />
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

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}
