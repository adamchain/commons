import { App as CapacitorApp } from "@capacitor/app";
import { isNative } from "./platform";

/**
 * Turns a deep-link URL (universal link like `https://commons.app/plans/xyz?invite=ABC`,
 * or a custom scheme like `commons://plans/xyz?invite=ABC`) into an in-app
 * route react-router can navigate to. Returns null for URLs we can't parse.
 */
export function pathFromDeepLinkUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  // http(s) universal links carry the route in pathname/search directly.
  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path || "/";
  }
  // Custom schemes (e.g. commons://plans/xyz) put the first path segment in
  // `host` rather than `pathname` — stitch them back together.
  const host = parsed.host ? `/${parsed.host}` : "";
  const path = `${host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  return path || "/";
}

/**
 * Wires up Capacitor's `appUrlOpen` (tapping a link while the app is running
 * or backgrounded) plus `getLaunchUrl` (cold start from a link) so a shared
 * plan link opens the app straight to that plan/invite instead of the feed.
 * No-ops on web — deep links there are just normal page loads.
 */
export function listenForDeepLinks(navigate: (path: string, opts?: { replace?: boolean }) => void): () => void {
  if (!isNative()) return () => undefined;

  let removeListener: (() => void) | undefined;
  void CapacitorApp.addListener("appUrlOpen", (event) => {
    const path = pathFromDeepLinkUrl(event.url);
    if (path) navigate(path);
  }).then((handle) => {
    removeListener = () => handle.remove();
  });

  void CapacitorApp.getLaunchUrl()
    .then((launch) => {
      if (!launch?.url) return;
      const path = pathFromDeepLinkUrl(launch.url);
      if (path) navigate(path, { replace: true });
    })
    .catch(() => undefined);

  return () => removeListener?.();
}
