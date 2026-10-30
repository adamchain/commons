import { useEffect, useRef, type ReactNode } from "react";
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
 */
export function RouteStage({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const prevPath = useRef(pathname);
  const kind = stageKind(prevPath.current, pathname, navType);

  useEffect(() => {
    prevPath.current = pathname;
  }, [pathname]);

  return (
    <div key={pathname} className={`route-stage route-stage--${kind}`}>
      {children}
    </div>
  );
}
