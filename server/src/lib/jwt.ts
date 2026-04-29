import jwt from "jsonwebtoken";

const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET ?? "dev-magic-link-secret";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-session-secret";

export function signMagicLinkToken(email: string): string {
  return jwt.sign({ email }, MAGIC_LINK_SECRET, { expiresIn: "15m" });
}

export function verifyMagicLinkToken(token: string): { email: string } {
  return jwt.verify(token, MAGIC_LINK_SECRET) as { email: string };
}

export function signSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, SESSION_SECRET, { expiresIn: "30d" });
}

export function verifySessionToken(token: string): { sub: string } {
  return jwt.verify(token, SESSION_SECRET) as { sub: string };
}
