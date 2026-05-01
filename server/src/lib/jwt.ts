import jwt from "jsonwebtoken";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-session-secret";

export function signSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, SESSION_SECRET, { expiresIn: "30d" });
}

export function verifySessionToken(token: string): { sub: string } {
  return jwt.verify(token, SESSION_SECRET) as { sub: string };
}
