const PUBLIC_SITE = "https://www.oncommons.co";

/**
 * Origin used in links people send each other (plan shares, SMS, social cards).
 * Production always uses the public site so a link never points at the API host
 * or at localhost. Local dev keeps APP_URL when it is localhost.
 */
function isPublicSite(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "oncommons.co" || host === "www.oncommons.co";
  } catch {
    return false;
  }
}

export function publicWebOrigin(): string {
  const explicit = process.env.PUBLIC_WEB_ORIGIN?.trim();
  if (explicit && isPublicSite(explicit)) return explicit.replace(/\/$/, "");
  const app = process.env.APP_URL?.trim() ?? "";
  const production = process.env.NODE_ENV === "production";
  if (!production && /localhost|127\.0\.0\.1/.test(app)) return app.replace(/\/$/, "");
  // Never hand out the API host. A Railway URL is what iMessage was previewing.
  return PUBLIC_SITE;
}
