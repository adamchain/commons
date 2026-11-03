import type { Response } from "express";
import { signSessionToken } from "./jwt.js";

/** Native clients ignore cookies. They read this header and store the new JWT. */
export const SESSION_TOKEN_HEADER = "X-Session-Token";

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180;

export function setSessionCookie(res: Response, userId: string, sessionVersion = 0): string {
  const token = signSessionToken(userId, sessionVersion);
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_MS,
  });
  return token;
}

/** Replace a soon-to-expire or just-expired session on this response. */
export function refreshSession(res: Response, userId: string, sessionVersion = 0): void {
  const token = setSessionCookie(res, userId, sessionVersion);
  res.setHeader(SESSION_TOKEN_HEADER, token);
}
