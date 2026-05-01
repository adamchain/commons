import { Router } from "express";
import { signSessionToken } from "../lib/jwt.js";
import { sendSmsCode } from "../lib/sms.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import type { MeDTO } from "../types/shared.js";

export const authRouter = Router();

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function setSessionCookie(res: import("express").Response, userId: string): void {
  res.cookie("session", signSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  // Default to +1 if it's a 10-digit US number with no country code.
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^\+\d{6,15}$/.test(digits)) return digits;
  return null;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function userToMe(userId: string): MeDTO | null {
  const user = store.findUserById(userId);
  if (!user) return null;
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    firstName: user.firstName,
    neighborhoodId: user.neighborhoodId,
    interests: user.interests,
    avatarSeed: user.avatarSeed,
    avatarStyle: user.avatarStyle,
    onboardingComplete: user.onboardingComplete,
    createdAt: user.createdAt,
  };
}

authRouter.post("/request-code", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phoneNumber ?? ""));
  if (!phone) {
    res.status(400).json({ error: "A valid phone number is required" });
    return;
  }
  const code = generateCode();
  store.saveSmsCode(phone, code, CODE_TTL_MS);
  await sendSmsCode(phone, code);
  res.json({ ok: true, phoneNumber: phone });
});

authRouter.post("/verify-code", (req, res) => {
  const phone = normalizePhone(String(req.body?.phoneNumber ?? ""));
  const code = String(req.body?.code ?? "").trim();
  if (!phone || !code) {
    res.status(400).json({ error: "Phone and code are required" });
    return;
  }
  if (!store.consumeSmsCode(phone, code)) {
    res.status(401).json({ error: "Invalid or expired code" });
    return;
  }
  const existing = store.findUserByPhone(phone);
  const user = existing ?? store.createUser(phone);
  setSessionCookie(res, user.id);
  res.json(userToMe(user.id));
});

authRouter.get("/me", requireAuth, (req, res) => {
  const me = userToMe(String(req.userId));
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(me);
});

authRouter.patch("/me", requireAuth, (req, res) => {
  const userId = String(req.userId);
  const patch: Parameters<typeof store.updateUser>[1] = {};
  if (typeof req.body?.firstName === "string") patch.firstName = req.body.firstName.trim();
  if (typeof req.body?.neighborhoodId === "string") patch.neighborhoodId = req.body.neighborhoodId;
  if (Array.isArray(req.body?.interests)) patch.interests = req.body.interests.slice(0, 3);
  if (typeof req.body?.avatarSeed === "string") patch.avatarSeed = req.body.avatarSeed;
  if (typeof req.body?.avatarStyle === "string") patch.avatarStyle = req.body.avatarStyle;
  if (typeof req.body?.onboardingComplete === "boolean") patch.onboardingComplete = req.body.onboardingComplete;
  store.updateUser(userId, patch);
  res.json(userToMe(userId));
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("session");
  res.status(200).json({ ok: true });
});
