import { Router } from "express";
import { signSessionToken } from "../lib/jwt.js";
import { checkPhoneVerification, isTwilioVerifyConfigured, startPhoneVerification } from "../lib/verify.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import type { UserRecord } from "../store.js";
import { createUser, findUserByPhone, findUserById, updateUser, type UserPatch } from "../userRepo.js";
import type { MeDTO } from "../types/shared.js";
import { planHasEnded } from "../lib/planTime.js";
import { nextNetworkPrompt, otherGoingIds, userWasGoing } from "../lib/networkPrompt.js";

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
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // NANP (US/CA): 10 digits, or 11 with leading country code 1.
  // Reject impossible NANP numbers early so Twilio doesn't return generic 400s.
  const isNanp10 = (n: string): boolean => /^[2-9]\d{2}[2-9]\d{6}$/.test(n);
  if (/^1\d{10}$/.test(digits)) {
    const national = digits.slice(1);
    if (!isNanp10(national)) return null;
    return `+${digits}`;
  }
  if (/^\d{10}$/.test(digits)) {
    if (!isNanp10(digits)) return null;
    return `+1${digits}`;
  }
  const compact = raw.replace(/\s/g, "").trim();
  if (compact.startsWith("+")) {
    const rest = compact.slice(1).replace(/\D/g, "");
    if (/^\d{6,14}$/.test(rest)) {
      if (rest.startsWith("1") && rest.length === 11 && !isNanp10(rest.slice(1))) return null;
      return `+${rest}`;
    }
  }
  return null;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function meFromUser(user: UserRecord): MeDTO {
  const neighborhoodIds =
    user.neighborhoodIds && user.neighborhoodIds.length > 0
      ? user.neighborhoodIds
      : user.neighborhoodId
        ? [user.neighborhoodId]
        : [];
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    firstName: user.firstName,
    neighborhoodId: user.neighborhoodId ?? neighborhoodIds[0] ?? null,
    neighborhoodIds,
    interests: user.interests,
    avatarSeed: user.avatarSeed,
    avatarStyle: user.avatarStyle,
    avatarPhotoDataUrl: user.avatarPhotoDataUrl,
    onboardingComplete: user.onboardingComplete,
    createdAt: user.createdAt,
    networkUserIds: user.networkIds?.length ? user.networkIds : [],
  };
}

async function userToMe(userId: string): Promise<MeDTO | null> {
  const user = await findUserById(userId);
  if (!user) return null;
  return meFromUser(user);
}

authRouter.post("/request-code", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phoneNumber ?? ""));
  if (!phone) {
    res.status(400).json({ error: "A valid phone number is required" });
    return;
  }

  if (isTwilioVerifyConfigured()) {
    try {
      await startPhoneVerification(phone);
    } catch (err) {
      console.error("[auth] Twilio Verify send failed", err);
      res.status(502).json({ error: "Could not send verification text. Try again in a moment." });
      return;
    }
    res.json({ ok: true, phoneNumber: phone, smsConfigured: true, authMode: "verify" as const });
    return;
  }

  // Local dev without Verify Service: generate code, persist, log to console.
  const code = generateCode();
  console.log(`[sms dev] ${phone}: code = ${code}`);
  store.saveSmsCode(phone, code, CODE_TTL_MS);
  res.json({ ok: true, phoneNumber: phone, smsConfigured: false, authMode: "dev" as const });
});

authRouter.post("/verify-code", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phoneNumber ?? ""));
  const code = String(req.body?.code ?? "").trim();
  if (!phone || !code) {
    res.status(400).json({ error: "Phone and code are required" });
    return;
  }

  if (isTwilioVerifyConfigured()) {
    let approved = false;
    try {
      approved = await checkPhoneVerification(phone, code);
    } catch (err) {
      console.error("[auth] Twilio Verify check failed", err);
      res.status(502).json({ error: "Verification failed. Try again." });
      return;
    }
    if (!approved) {
      res.status(401).json({ error: "Invalid or expired code" });
      return;
    }
  } else if (!store.consumeSmsCode(phone, code)) {
    res.status(401).json({ error: "Invalid or expired code" });
    return;
  }

  const existing = await findUserByPhone(phone);
  const user = existing ?? (await createUser(phone));
  setSessionCookie(res, user.id);
  res.json(meFromUser(user));
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const me = await userToMe(String(req.userId));
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(me);
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const patch: UserPatch = {};
  if (typeof req.body?.firstName === "string") patch.firstName = req.body.firstName.trim();
  if (typeof req.body?.neighborhoodId === "string") patch.neighborhoodId = req.body.neighborhoodId;
  if (Array.isArray(req.body?.neighborhoodIds)) {
    patch.neighborhoodIds = (req.body.neighborhoodIds as unknown[]).map(String).filter(Boolean);
    if (patch.neighborhoodIds.length > 0 && !patch.neighborhoodId) {
      patch.neighborhoodId = patch.neighborhoodIds[0]!;
    }
  }
  if (Array.isArray(req.body?.interests)) patch.interests = req.body.interests.slice(0, 3);
  if (typeof req.body?.avatarSeed === "string") patch.avatarSeed = req.body.avatarSeed;
  if (typeof req.body?.avatarStyle === "string") patch.avatarStyle = req.body.avatarStyle;
  if (typeof req.body?.avatarPhotoDataUrl === "string") patch.avatarPhotoDataUrl = req.body.avatarPhotoDataUrl;
  if (req.body?.avatarPhotoDataUrl === null) patch.avatarPhotoDataUrl = undefined;
  if (typeof req.body?.onboardingComplete === "boolean") patch.onboardingComplete = req.body.onboardingComplete;
  await updateUser(userId, patch);
  const me = await userToMe(userId);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(me);
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("session");
  res.status(200).json({ ok: true });
});

authRouter.get("/network-prompt", requireAuth, async (req, res) => {
  const prompt = await nextNetworkPrompt(String(req.userId));
  res.json({ prompt });
});

authRouter.post("/network-add", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.body?.planId ?? "");
  const userIds = Array.isArray(req.body?.userIds) ? (req.body.userIds as unknown[]).map(String) : [];
  if (!planId || userIds.length === 0) {
    res.status(400).json({ error: "planId and userIds required" });
    return;
  }
  const plan = store.findPlanById(planId);
  if (!plan || !planHasEnded(plan)) {
    res.status(400).json({ error: "This plan isn’t ready for network adds yet" });
    return;
  }
  if (!userWasGoing(planId, userId)) {
    res.status(403).json({ error: "You weren’t on this plan" });
    return;
  }
  const allowed = new Set(otherGoingIds(planId));
  const viewer = await findUserById(userId);
  if (!viewer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const next = new Set(viewer.networkIds ?? []);
  for (const id of userIds) {
    if (id === userId) continue;
    if (!allowed.has(id)) continue;
    next.add(id);
  }
  await updateUser(userId, { networkIds: [...next] });
  const me = await userToMe(userId);
  res.json({ ok: true, me });
});

authRouter.post("/network-dismiss", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.body?.planId ?? "");
  if (!planId) {
    res.status(400).json({ error: "planId required" });
    return;
  }
  const viewer = await findUserById(userId);
  if (!viewer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const dismiss = [...new Set([...(viewer.dismissedNetworkPromptPlanIds ?? []), planId])];
  await updateUser(userId, { dismissedNetworkPromptPlanIds: dismiss });
  res.json({ ok: true });
});
