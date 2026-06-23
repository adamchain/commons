import { Link, useLocation } from "react-router-dom";
import wordmark from "../assets/wordmark.png";

/**
 * Global top bar — just the COMMONS wordmark. Hidden on full-screen flows.
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
    </header>
  );
}
