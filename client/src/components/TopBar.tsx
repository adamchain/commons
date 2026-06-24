import { Link, useLocation } from "react-router-dom";
import wordmark from "../assets/wordmark.png";

/**
 * Global top bar — COMMONS wordmark on the left, notifications bell on the
 * right. Hidden on full-screen flows.
 */
export function TopBar() {
  const { pathname } = useLocation();

  const hide =
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/admin") ||
    pathname === "/plans/new" ||
    pathname.startsWith("/notifications") ||
    /^\/plans\/[^/]+(\/chat)?$/.test(pathname);

  if (hide) return null;

  return (
    <header className="top-bar" aria-label="Top navigation">
      <Link to="/" className="top-bar-brand" aria-label="Commons home">
        <img src={wordmark} alt="COMMONS" className="top-bar-brand-img" />
      </Link>
      <div className="top-bar-actions">
        <Link to="/notifications" className="top-bar-icon-btn" aria-label="Notifications">
          <BellIcon />
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
