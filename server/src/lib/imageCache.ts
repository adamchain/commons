import { createHash } from "node:crypto";

// Content-addressed cache for images that used to travel as base64 data URLs
// inside JSON payloads (avatars, profile photos, plan flyers). We hash each
// data URL and serve the decoded bytes from `GET /api/img/<hash>` with a
// forever/immutable cache header. The URL changes whenever the bytes change,
// so clients (web + native WKWebView) can cache aggressively and the heavy
// base64 no longer bloats every profile/feed response.
//
// Native can't attach the Bearer token to an <img> request, so this route is
// public — but the hash is unguessable, and you only learn it from an
// auth-gated payload, so it's capability-based (the chosen access model).

type Entry = { mime: string; buf: Buffer };

const byHash = new Map<string, Entry>();

// Absolute origin for the URLs we hand out. Native WKWebView renders from
// capacitor://localhost, so a relative URL would break — we need the API host.
// Prefer an explicit env; otherwise capture it from the first inbound request.
let configuredOrigin = process.env.IMAGE_ORIGIN?.trim().replace(/\/$/, "") || "";
let capturedOrigin = "";

/** Called from a middleware so the URLs point at whatever host the client used. */
export function rememberImageOrigin(origin: string): void {
  if (origin) capturedOrigin = origin.replace(/\/$/, "");
}

function originBase(): string {
  return configuredOrigin || capturedOrigin;
}

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/;
// Matches the proxy URLs we emit, absolute or relative: .../api/img/<64 hex>
const PROXY_RE = /\/api\/img\/([a-f0-9]{64})(?:$|[?#])/;

function register(dataUrl: string): string | null {
  const m = DATA_URL_RE.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1]!;
  const buf = Buffer.from(m[2]!.replace(/\s+/g, ""), "base64");
  if (buf.length === 0) return null;
  const hash = createHash("sha256").update(dataUrl).digest("hex");
  if (!byHash.has(hash)) byHash.set(hash, { mime, buf });
  return hash;
}

/**
 * Convert a stored image value into what we send to clients. Base64 data URLs
 * become cacheable `/api/img/<hash>` URLs; anything else (GCS/library http URLs,
 * empty) is passed through untouched. Falls back to the original data URL if the
 * origin isn't known yet or the string can't be parsed, so nothing ever breaks.
 */
export function toImageUrl<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string" || !value) return value;
  if (!value.startsWith("data:image/")) return value;
  const base = originBase();
  if (!base) return value; // no absolute origin yet — keep inline rather than emit a native-breaking relative URL
  const hash = register(value);
  if (!hash) return value;
  return `${base}/api/img/${hash}` as T;
}

/**
 * Reverse of {@link toImageUrl}: if a client sends one of our proxy URLs back
 * on save (editors re-submit the value they were shown), rehydrate it to the
 * original base64 so we never overwrite stored image bytes with a URL. Unknown
 * strings (new uploads, external URLs) pass through unchanged.
 */
export function fromImageUrl<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string") return value;
  const m = PROXY_RE.exec(value);
  if (!m) return value;
  const entry = byHash.get(m[1]!);
  if (!entry) return value;
  return `data:${entry.mime};base64,${entry.buf.toString("base64")}` as T;
}

export function getImage(hash: string): Entry | undefined {
  return byHash.get(hash);
}

/**
 * Prime the cache from stored data URLs at boot so proxy URLs resolve (and
 * round-trips rehydrate) even before the owning record has been serialized
 * this process lifetime — e.g. right after a restart.
 */
export function primeImageCache(values: Iterable<string | null | undefined>): void {
  for (const v of values) {
    if (typeof v === "string" && v.startsWith("data:image/")) register(v);
  }
}
