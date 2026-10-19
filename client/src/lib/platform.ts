import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

const PUBLIC_SITE = "https://www.oncommons.co";

/** A real public site, not the API host and not the app's localhost webview. */
function isPublicSite(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname;
    return host === "oncommons.co" || host === "www.oncommons.co";
  } catch {
    return false;
  }
}

/** Origin for links people send (plans, invites, profiles). Never the API host. */
export function getPublicWebOrigin(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_WEB_ORIGIN;
  if (typeof fromEnv === "string" && isPublicSite(fromEnv)) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  // Desktop dev can share localhost links. The installed app is also served
  // from localhost (capacitor://localhost) — those links have to use the
  // public site or nobody else can open them.
  if (!isNative() && typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return window.location.origin;
  }
  return PUBLIC_SITE;
}
