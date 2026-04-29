import { Router } from "express";
import { signSessionToken, verifyMagicLinkToken } from "../lib/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";

export const authRouter = Router();

function setSessionCookie(res: import("express").Response, userId: string): void {
  res.cookie("session", signSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

authRouter.post("/request-link", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  const user = store.upsertUserByEmail(email);
  setSessionCookie(res, user.id);
  res.json({ id: user.id, email: user.email, displayName: user.displayName });
});

authRouter.get("/verify", (req, res) => {
  const token = String(req.query.token ?? "");
  const redirect = String(req.query.redirect ?? process.env.APP_URL ?? "http://localhost:5173");

  if (!token) {
    res.status(400).send("Missing token");
    return;
  }

  try {
    const { email } = verifyMagicLinkToken(token);
    const user = store.upsertUserByEmail(email);
    setSessionCookie(res, user.id);
    res.redirect(redirect);
  } catch {
    res.status(401).send("Invalid or expired token");
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = store.findUserById(String(req.userId));
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ id: user.id, email: user.email, displayName: user.displayName });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("session");
  res.status(200).json({ ok: true });
});
