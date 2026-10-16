const PUBLIC_SITE = "https://www.oncommons.co";

/**
 * Origin used in links people send each other (plan shares, SMS, social cards).
 * Production always uses the public site so a link never points at the API host.
 * Local dev keeps APP_URL when it is localhost.
 */
function isPublicSite(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "oncommons.co" || host === "www.oncommons.co" || host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function publicWebOrigin(): string {
  const explicit = process.env.PUBLIC_WEB_ORIGIN?.trim();
  if (explicit && /^https?:\/\//.test(explicit) && isPublicSite(explicit)) return explicit.replace(/\/$/, "");
  const app = process.env.APP_URL?.trim() ?? "";
  if (/localhost|127\.0\.0\.1/.test(app)) return app.replace(/\/$/, "");
  // Never hand out the API host. A Railway URL is what iMessage was previewing.
  return PUBLIC_SITE;
}
