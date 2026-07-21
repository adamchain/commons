// APNs (Apple Push Notification service) sender using token-based auth (.p8
// key) over HTTP/2. No third-party push SDK — `jsonwebtoken` (already a
// dependency) signs the ES256 provider token, and Node's built-in `http2`
// module talks to Apple directly.
//
// Configuration is entirely env-driven (see server/.env.example). When it's
// incomplete, `sendPushToUser` no-ops rather than throwing — push is a
// best-effort enhancement on top of in-app notifications, not a hard
// dependency for the rest of the app to function.
//
// Never log the p8 key itself — only ever log the fact that config is
// missing/invalid.

import { readFileSync } from "node:fs";
import http2 from "node:http2";
import jwt from "jsonwebtoken";
import { store } from "../store.js";

const APNS_PRODUCTION = String(process.env.APNS_PRODUCTION ?? "").trim().toLowerCase() === "true";
const APNS_HOST = APNS_PRODUCTION ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID?.trim() || "com.oncommons.mvp";

let warnedNotConfigured = false;
function warnNotConfiguredOnce(): void {
  if (warnedNotConfigured) return;
  warnedNotConfigured = true;
  console.warn(
    "[apns] not configured — push delivery disabled. Set APNS_KEY_ID, APNS_TEAM_ID, and either " +
      "APNS_KEY_P8 or APNS_KEY_PATH to enable it.",
  );
}

/** Reads the .p8 private key contents from env, never logging the value. */
function loadPrivateKey(): string | null {
  const raw = process.env.APNS_KEY_P8?.trim();
  if (raw) {
    // Support the key being pasted with literal "\n" sequences (common when
    // stuffing a PEM into a single-line env var).
    return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  }
  const path = process.env.APNS_KEY_PATH?.trim();
  if (path) {
    try {
      return readFileSync(path, "utf8");
    } catch (err) {
      console.error("[apns] failed to read APNS_KEY_PATH:", err instanceof Error ? err.message : err);
      return null;
    }
  }
  return null;
}

function isConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID?.trim() && process.env.APNS_TEAM_ID?.trim() && loadPrivateKey());
}

// Apple asks providers not to mint a fresh token more than roughly once per
// 20 minutes; tokens remain valid up to 60 minutes. We cache well under that.
const TOKEN_TTL_MS = 50 * 60 * 1000;
let cachedToken: { token: string; mintedAt: number } | null = null;

function getProviderToken(): string | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const privateKey = loadPrivateKey();
  if (!keyId || !teamId || !privateKey) return null;

  if (cachedToken && Date.now() - cachedToken.mintedAt < TOKEN_TTL_MS) {
    return cachedToken.token;
  }
  try {
    const token = jwt.sign({ iss: teamId, iat: Math.floor(Date.now() / 1000) }, privateKey, {
      algorithm: "ES256",
      header: { alg: "ES256", kid: keyId },
    });
    cachedToken = { token, mintedAt: Date.now() };
    return token;
  } catch (err) {
    console.error("[apns] failed to sign provider token:", err instanceof Error ? err.message : err);
    return null;
  }
}

// A single long-lived HTTP/2 session per process, reconnected lazily if it
// drops. APNs keeps connections open for a long time and penalizes providers
// who reconnect per-request.
let session: http2.ClientHttp2Session | null = null;

function getSession(): http2.ClientHttp2Session {
  if (session && !session.destroyed && !session.closed) return session;
  const next = http2.connect(APNS_HOST);
  next.on("error", (err) => {
    console.error("[apns] session error:", err instanceof Error ? err.message : err);
  });
  next.on("close", () => {
    if (session === next) session = null;
  });
  session = next;
  return next;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Send a single push to a single device token. Returns true on APNs 200.
 * On a 410 (Unregistered) it removes the dead token from the store so future
 * sends don't waste a round trip. Never throws — failures resolve false.
 */
export async function sendApns(token: string, payload: PushPayload): Promise<boolean> {
  const providerToken = getProviderToken();
  if (!providerToken) {
    warnNotConfiguredOnce();
    return false;
  }

  let client: http2.ClientHttp2Session;
  try {
    client = getSession();
  } catch (err) {
    console.error("[apns] failed to open session:", err instanceof Error ? err.message : err);
    return false;
  }

  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
    },
    ...(payload.data ?? {}),
  });

  return new Promise<boolean>((resolve) => {
    let req: http2.ClientHttp2Stream;
    try {
      req = client.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${providerToken}`,
        "apns-topic": APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      });
    } catch (err) {
      console.error("[apns] failed to open request:", err instanceof Error ? err.message : err);
      resolve(false);
      return;
    }

    let status = 0;
    let responseBody = "";

    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      if (status === 200) {
        resolve(true);
        return;
      }
      if (status === 410) {
        // Apple has confirmed this token will never receive push again.
        store.unregisterDeviceByToken(token);
      } else {
        console.error(`[apns] push failed status=${status} body=${responseBody.slice(0, 300)}`);
      }
      resolve(false);
    });
    req.on("error", (err) => {
      console.error("[apns] request error:", err instanceof Error ? err.message : err);
      resolve(false);
    });
    req.end(body);
  });
}

/**
 * Look up a user's registered iOS devices and push to all of them. No-ops
 * (after a single logged warning) when APNs isn't configured, and no-ops
 * silently when the user has no iOS devices registered.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!isConfigured()) {
    warnNotConfiguredOnce();
    return;
  }
  const devices = store.listDevicesForUser(userId).filter((d) => d.platform === "ios");
  if (devices.length === 0) return;
  await Promise.all(devices.map((d) => sendApns(d.token, payload)));
}
