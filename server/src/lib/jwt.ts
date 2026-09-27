import jwt from "jsonwebtoken";

const DEV_SESSION_SECRET = "dev-session-secret";
const fromEnv = process.env.SESSION_SECRET?.trim();

if (process.env.NODE_ENV === "production" && (!fromEnv || fromEnv === DEV_SESSION_SECRET)) {
  throw new Error("SESSION_SECRET must be set to a unique value in production");
}

const SESSION_SECRET = fromEnv || DEV_SESSION_SECRET;

export type SessionPayload = { sub: string; sv?: number };

export function signSessionToken(userId: string, sessionVersion = 0): string {
  return jwt.sign({ sub: userId, sv: sessionVersion }, SESSION_SECRET, { expiresIn: "30d" });
}

export function verifySessionToken(token: string): SessionPayload {
  const payload = jwt.verify(token, SESSION_SECRET) as SessionPayload;
  if (typeof payload?.sub !== "string" || !payload.sub) {
    throw new Error("Invalid session");
  }
  return payload;
}

/** Missing `sv` on older tokens matches a user who has never logged out. */
export function sessionVersionMatches(
  userVersion: number | undefined,
  tokenVersion: number | undefined,
): boolean {
  return (userVersion ?? 0) === (tokenVersion ?? 0);
}
