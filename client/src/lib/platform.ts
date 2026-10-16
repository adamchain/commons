import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

const PUBLIC_SITE = "https://www.oncommons.co";

/** Origin for links people send (plans, invites, profiles). Never the API host. */
function isShareableOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "oncommons.co" || host === "www.oncommons.co" || host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function getPublicWebOrigin(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_WEB_ORIGIN;
  if (typeof fromEnv === "string" && fromEnv.length > 0 && isShareableOrigin(fromEnv)) {
    return fromEnv.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return window.location.origin;
  }
  return PUBLIC_SITE;
}
