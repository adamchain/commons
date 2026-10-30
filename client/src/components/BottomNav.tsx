import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, UserRound, Users, Plus, MessageCircle } from "lucide-react";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { openCreateLauncher } from "./CreateLauncher";
import { needsOnboarding } from "../lib/onboarding";
import type { ConversationSummaryDTO } from "../types/shared";

/**
 * Bottom nav — Home · Communities · Plus (create) · Messages · Network.
 * Height 58px, bg card, borderTop border. Active = red; inactive = faint.
 * Plus: 44×44 circle, red, icon 20 white.
 */
function warmNav(to: string) {
  if (to === "/") void import("../pages/Feed");
  else if (to === "/communities") void import("../pages/Communities");
  else if (to === "/messages") void import("../pages/Messages");
  else if (to === "/network") void import("../pages/Network");
  else if (to === "/plans/new") void import("../pages/CreatePlan");
}

export function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // When the on-screen keyboard opens (e.g. focusing the Network/search inputs),
  // iOS shrinks the web viewport, which drags this `position: fixed; bottom: 0`
  // bar up to sit on top of the keyboard. Detect the shrink and slide it away.
  useEffect(() => {
    const vv = window.visualViewport;
    let baseline = window.innerHeight;
    const check = () => {
      const winH = window.innerHeight;
      if (winH > baseline) baseline = winH; // tallest height = no keyboard
      const vvH = vv?.height ?? winH;
      // The keyboard shrinks either the layout viewport (webview resize) or just
      // the visual viewport. Catch whichever one moved.
      const shrink = Math.max(baseline - winH, winH - vvH);
      setKeyboardOpen(shrink > 120);
    };
    check();
    window.addEventListener("resize", check);
    vv?.addEventListener("resize", check);
    vv?.addEventListener("scroll", check);
    return () => {
      window.removeEventListener("resize", check);
      vv?.removeEventListener("resize", check);
      vv?.removeEventListener("scroll", check);
    };
  }, []);

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
    const t = setInterval(load, 15000);
    window.addEventListener("focus", load);
    window.addEventListener("commons:notifications-changed", load);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("focus", load);
      window.removeEventListener("commons:notifications-changed", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, pathname]);

  const hide =
    pathname === "/new" ||
    pathname.startsWith("/welcome") ||
    pathname.startsWith("/legal") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/login") ||
    pathname === "/plans/new" ||
    pathname === "/communities/new" ||
    pathname.match(/^\/plans\/[^/]+\/edit$/) ||
    pathname.match(/^\/plans\/[^/]+\/chat$/) ||
    pathname.match(/^\/communities\/[^/]+\/chat$/) ||
    pathname.match(/^\/dm\/[^/]+$/) ||
    pathname === "/helpchat" ||
    (!user && Boolean(pathname.match(/^\/plans\/[^/]+$/))) ||
    needsOnboarding(user);
  if (hide) return null;

  return (
    <nav
      className={`bottom-nav bottom-nav--five${keyboardOpen ? " is-keyboard" : ""}`}
      aria-label="Primary"
    >
      <NavLink
        to="/"
        end
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label="Home"
        onPointerDown={() => warmNav("/")}
        onClick={(e) => {
          if (pathname === "/") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("commons:home-refresh"));
          }
        }}
      >
        <span className="bottom-nav-icon-wrap">
          <Home size={23} strokeWidth={1.7} />
        </span>
        <span className="bottom-nav-label">Home</span>
      </NavLink>

      <NavLink
        to="/communities"
        end
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label="Communities"
        onPointerDown={() => warmNav("/communities")}
      >
        <span className="bottom-nav-icon-wrap">
          <Users size={23} strokeWidth={1.7} />
        </span>
        <span className="bottom-nav-label">Communities</span>
      </NavLink>

      <button
        type="button"
        className="bottom-nav-cta"
        aria-label="Make a plan"
        onPointerDown={() => warmNav("/plans/new")}
        onClick={openCreateLauncher}
      >
        <Plus size={33} strokeWidth={1.8} color="white" />
      </button>

      <NavLink
        to="/messages"
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : "Messages"}
        onPointerDown={() => warmNav("/messages")}
      >
        <span className="bottom-nav-icon-wrap">
          <MessageCircle size={23} strokeWidth={1.7} />
          {unreadMessages > 0 && (
            <span className="bottom-nav-badge">{unreadMessages > 9 ? "9+" : unreadMessages}</span>
          )}
        </span>
        <span className="bottom-nav-label">Messages</span>
      </NavLink>

      <NavLink
        to="/network"
        className={({ isActive }) => `bottom-nav-item ${isActive ? "is-active" : ""}`}
        aria-label="Network"
        onPointerDown={() => warmNav("/network")}
      >
        <span className="bottom-nav-icon-wrap">
          <UserRound size={23} strokeWidth={1.7} />
        </span>
        <span className="bottom-nav-label">Network</span>
      </NavLink>
    </nav>
  );
}
