import { NavLink, useLocation } from "react-router-dom";

/**
 * Global bottom nav — Home (left), Make a Plan (center primary), Explore (right).
 * Profile lives in the top bar now. Icons only, no labels per spec.
 */
export function BottomNav() {
  const { pathname } = useLocation();

  const hide =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/login") ||
    pathname === "/plans/new" ||
    pathname.match(/^\/plans\/[^/]+\/chat$/);
  if (hide) return null;

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <NavLink
        to="/"
        end
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label="Home"
      >
        <HomeIcon />
      </NavLink>

      <NavLink to="/plans/new" className="bottom-nav-cta" aria-label="Make a plan">
        <PlusIcon />
      </NavLink>

      <NavLink
        to="/explore"
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label="Explore"
      >
        <CompassIcon />
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
