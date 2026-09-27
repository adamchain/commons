import jwt from "jsonwebtoken";

const DEV_SESSION_SECRET = "dev-session-secret";
const fromEnv = process.env.SESSION_SECRET?.trim();

if (process.env.NODE_ENV === "production" && (!fromEnv || fromEnv === DEV_SESSION_SECRET)) {
  throw new Error("SESSION_SECRET must be set to a unique value in production");
}

const SESSION_SECRET = fromEnv || DEV_SESSION_SECRET;

export function signSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, SESSION_SECRET, { expiresIn: "30d" });
}

export function verifySessionToken(token: string): { sub: string } {
  return jwt.verify(token, SESSION_SECRET) as { sub: string };
}
