import jwt from "jsonwebtoken";

const DEV_SESSION_SECRET = "dev-session-secret";
const fromEnv = process.env.SESSION_SECRET?.trim();

if (process.env.NODE_ENV === "production" && (!fromEnv || fromEnv === DEV_SESSION_SECRET)) {
  throw new Error("SESSION_SECRET must be set to a unique value in production");
}

const SESSION_SECRET = fromEnv || DEV_SESSION_SECRET;

export type SessionPayload = { sub: string; sv?: number };

/** Phone sign-in is enough friction that an active member should not be logged out monthly. */
const SESSION_TTL_SEC = 180 * 24 * 60 * 60;
/** Issue a new token once the current one is inside this window, including already expired. */
const REFRESH_WITHIN_SEC = 30 * 24 * 60 * 60;
/**
 * Tokens signed with the old 30-day lifetime are already expired for early
 * members. Keep accepting them for a while so opening the app renews the
 * session instead of failing the next message with Unauthorized.
 */
const EXPIRED_GRACE_SEC = 60 * 24 * 60 * 60;

export function signSessionToken(userId: string, sessionVersion = 0): string {
  return jwt.sign({ sub: userId, sv: sessionVersion }, SESSION_SECRET, { expiresIn: SESSION_TTL_SEC });
}

export function verifySessionToken(token: string): SessionPayload {
  const payload = jwt.verify(token, SESSION_SECRET) as SessionPayload;
  if (typeof payload?.sub !== "string" || !payload.sub) {
    throw new Error("Invalid session");
  }
  return payload;
}

type DecodedSession = SessionPayload & { exp?: number };

/**
 * Signature-checked session, still accepted for EXPIRED_GRACE_SEC after `exp`.
 * `refresh` is true when the client should store a newly signed token.
 */
export function readUsableSession(token: string): SessionPayload & { refresh: boolean } {
  const payload = jwt.verify(token, SESSION_SECRET, { ignoreExpiration: true }) as DecodedSession;
  if (typeof payload?.sub !== "string" || !payload.sub) {
    throw new Error("Invalid session");
  }
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  const now = Math.floor(Date.now() / 1000);
  if (!exp || now - exp > EXPIRED_GRACE_SEC) {
    throw new Error("Session expired");
  }
  return { sub: payload.sub, sv: payload.sv, refresh: exp - now < REFRESH_WITHIN_SEC };
}

/** Missing `sv` on older tokens matches a user who has never logged out. */
export function sessionVersionMatches(
  userVersion: number | undefined,
  tokenVersion: number | undefined,
): boolean {
  return (userVersion ?? 0) === (tokenVersion ?? 0);
}
