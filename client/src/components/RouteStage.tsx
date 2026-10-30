import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const TAB_PATHS = new Set(["/", "/communities", "/messages", "/network"]);

type StageKind = "none" | "tab" | "push" | "back";

function stageKind(from: string, to: string, navType: string): StageKind {
  if (from === to) return "none";
  if (TAB_PATHS.has(from) && TAB_PATHS.has(to)) return "tab";
  if (navType === "REPLACE") return "tab";
  if (navType === "POP") return TAB_PATHS.has(to) ? "tab" : "back";
  return "push";
}

/**
 * Incoming-screen motion only. Stack screens slide in from the side; back
 * is the reverse. Tab switches stay still so they don't flash. Outgoing
 * screens unmount immediately so this never fights sticky/fixed chrome.
 *
 * The slide uses a transform animation with `fill-mode: both`, so after it
 * finishes the stage keeps `transform: translate3d(0,0,0)` plus
 * `will-change: transform`. Either one makes the stage a containing block for
 * `position: fixed` descendants — which silently traps full-screen fixed
 * shells (the Messages inbox) against a zero-height stage, collapsing them to
 * nothing. So once the animation ends we drop the motion class, restoring a
 * plain stage whose fixed children resolve against the viewport again.
 */
export function RouteStage({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const prevPath = useRef(pathname);
  const [settled, setSettled] = useState(false);
  const kind = stageKind(prevPath.current, pathname, navType);

  useEffect(() => {
    prevPath.current = pathname;
    setSettled(false);
  }, [pathname]);

  return (
    <div
      key={pathname}
      className={`route-stage route-stage--${settled ? "none" : kind}`}
      onAnimationEnd={() => setSettled(true)}
    >
      {children}
    </div>
  );
}
