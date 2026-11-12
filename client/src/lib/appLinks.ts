/**
 * Turns a Commons plan, profile, or community URL into an in-app route.
 * Shared links are absolute (`https://www.oncommons.co/plans/…`). Left as
 * normal anchors they leave the app and open the public signup page.
 */
export function appPathFromHref(href: string): string | null {
  let url: URL;
  try {
    if (href.startsWith("/")) url = new URL(href, "https://www.oncommons.co");
    else url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol === "commons:") {
    const host = url.host ? `/${url.host}` : "";
    return inAppRoute(`${host}${url.pathname}`, url.search);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname;
  const own = typeof window !== "undefined" && url.origin === window.location.origin;
  const commons =
    host === "oncommons.co" ||
    host === "www.oncommons.co" ||
    host.endsWith(".oncommons.co") ||
    host === "localhost" ||
    host === "127.0.0.1";
  if (!own && !commons) return null;

  const path = url.pathname.replace(/\/+$/, "") || "/";
  return inAppRoute(path, url.search);
}

function inAppRoute(path: string, search: string): string | null {
  const plan = path.match(/^\/plans\/([A-Za-z0-9_-]+)$/);
  if (plan && plan[1] !== "new") return `${path}${search}`;
  if (/^\/plans\/[A-Za-z0-9_-]+\/(?:edit|chat)$/.test(path)) return `${path}${search}`;
  if (/^\/profile\/[^/]+$/.test(path)) return `${path}${search}`;
  if (/^\/communities\/[^/]+$/.test(path)) return `${path}${search}`;
  if (/^\/dm\/[^/]+$/.test(path)) return `${path}${search}`;
  return null;
}
