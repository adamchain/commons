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

type ApnsEnv = "sandbox" | "production";

const APNS_HOSTS: Record<ApnsEnv, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID?.trim() || "com.oncommons.mvp";

/** Production first when the server is the live one. A BadDeviceToken retries the other gateway. */
function envOrder(preferred?: ApnsEnv): ApnsEnv[] {
  const productionFirst = String(process.env.APNS_PRODUCTION ?? "").trim().toLowerCase() === "true";
  const primary: ApnsEnv = preferred ?? (productionFirst ? "production" : "sandbox");
  const other: ApnsEnv = primary === "production" ? "sandbox" : "production";
  return [primary, other];
}

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

// One long-lived HTTP/2 session per Apple gateway. APNs keeps connections
// open and penalizes providers who reconnect per-request. The COMMONS key is
// valid for sandbox (Xcode) and production (TestFlight / App Store).
const sessions = new Map<ApnsEnv, http2.ClientHttp2Session>();

function getSession(env: ApnsEnv): http2.ClientHttp2Session {
  const current = sessions.get(env);
  if (current && !current.destroyed && !current.closed) return current;
  const next = http2.connect(APNS_HOSTS[env]);
  next.on("error", (err) => {
    console.error(`[apns] ${env} session error:`, err instanceof Error ? err.message : err);
  });
  next.on("close", () => {
    if (sessions.get(env) === next) sessions.delete(env);
  });
  sessions.set(env, next);
  return next;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface ApnsResult {
  ok: boolean;
  status: number;
  reason: string;
}

/**
 * Send a single push to one Apple gateway. Never throws.
 * 410 means Apple will never accept this token again.
 */
async function sendApnsTo(env: ApnsEnv, token: string, payload: PushPayload): Promise<ApnsResult> {
  const providerToken = getProviderToken();
  if (!providerToken) {
    warnNotConfiguredOnce();
    return { ok: false, status: 0, reason: "NotConfigured" };
  }

  let client: http2.ClientHttp2Session;
  try {
    client = getSession(env);
  } catch (err) {
    console.error("[apns] failed to open session:", err instanceof Error ? err.message : err);
    return { ok: false, status: 0, reason: "Session" };
  }

  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
    },
    ...(payload.data ?? {}),
  });

  return new Promise<ApnsResult>((resolve) => {
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
      resolve({ ok: false, status: 0, reason: "Request" });
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
        resolve({ ok: true, status, reason: "" });
        return;
      }
      let reason = "";
      try {
        reason = String(JSON.parse(responseBody).reason ?? "");
      } catch {
        reason = responseBody.slice(0, 120);
      }
      if (status !== 410 && reason !== "BadDeviceToken") {
        console.error(`[apns] ${env} push failed status=${status} reason=${reason}`);
      }
      resolve({ ok: false, status, reason });
    });
    req.on("error", (err) => {
      console.error("[apns] request error:", err instanceof Error ? err.message : err);
      resolve({ ok: false, status: 0, reason: "Request" });
    });
    req.end(body);
  });
}

/**
 * Send a push, trying the gateway that last worked for this token and falling
 * back to the other one when Apple says the token doesn't belong there.
 * A 410 removes the dead token. Never throws.
 */
export async function sendApns(token: string, payload: PushPayload, preferred?: ApnsEnv): Promise<boolean> {
  const order = envOrder(preferred);
  for (let i = 0; i < order.length; i++) {
    const env = order[i]!;
    const result = await sendApnsTo(env, token, payload);
    if (result.ok) {
      store.setDeviceApnsEnv(token, env);
      return true;
    }
    if (result.status === 410) {
      store.unregisterDeviceByToken(token);
      return false;
    }
    // Wrong gateway (Xcode token vs TestFlight token). Try the other one once.
    if (result.reason !== "BadDeviceToken") return false;
  }
  return false;
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
  await Promise.all(devices.map((d) => sendApns(d.token, payload, d.apnsEnv)));
}
