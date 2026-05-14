import { Router } from "express";
import { isAdminPhone } from "../lib/adminPhones.js";
import { signSessionToken } from "../lib/jwt.js";
import { normalizePhone } from "../lib/phone.js";
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

type TwilioLikeError = {
  code?: number;
  status?: number;
  message?: string;
};

function parseTwilioError(err: unknown): TwilioLikeError {
  if (typeof err !== "object" || err === null) return {};
  const maybe = err as TwilioLikeError;
  return {
    code: typeof maybe.code === "number" ? maybe.code : undefined,
    status: typeof maybe.status === "number" ? maybe.status : undefined,
    message: typeof maybe.message === "string" ? maybe.message : undefined,
  };
}

function setSessionCookie(res: import("express").Response, userId: string): void {
  res.cookie("session", signSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
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
    avatarParams: user.avatarParams,
    onboardingComplete: user.onboardingComplete,
    createdAt: user.createdAt,
    networkUserIds: user.networkIds?.length ? user.networkIds : [],
    // Self always sees own social links — visibility check applies only to
    // other-viewer profile reads (see /api/profile).
    socialLinks: user.socialLinks,
    canAccessAdmin: isAdminPhone(user.phoneNumber),
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
      const twilio = parseTwilioError(err);
      if (twilio.code === 21608) {
        res.status(403).json({
          error:
            "Twilio trial account can only send to verified phone numbers. Verify this number in Twilio or upgrade the account.",
        });
        return;
      }
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
      const twilio = parseTwilioError(err);
      if (twilio.code === 20404 || twilio.code === 60200) {
        res.status(400).json({ error: "That code or phone number is invalid. Request a new code and try again." });
        return;
      }
      if (twilio.code === 60202) {
        res.status(429).json({ error: "Too many attempts. Request a new code and try again." });
        return;
      }
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

  let user = await findUserByPhone(phone);
  if (!user) {
    try {
      user = await createUser(phone);
    } catch (err) {
      // If concurrent verifies race, unique phone index may win in another request.
      const isDuplicateKey =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === 11000;
      if (isDuplicateKey) {
        user = await findUserByPhone(phone);
      } else {
        console.error("[auth] create user failed", err);
        res.status(500).json({ error: "Could not finish sign in. Please try again." });
        return;
      }
    }
  }
  if (!user) {
    res.status(500).json({ error: "Could not finish sign in. Please try again." });
    return;
  }
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
  if (Array.isArray(req.body?.interests)) patch.interests = req.body.interests;
  if (typeof req.body?.avatarSeed === "string") patch.avatarSeed = req.body.avatarSeed;
  if (typeof req.body?.avatarStyle === "string") patch.avatarStyle = req.body.avatarStyle;
  if (typeof req.body?.avatarPhotoDataUrl === "string") patch.avatarPhotoDataUrl = req.body.avatarPhotoDataUrl;
  if (req.body?.avatarPhotoDataUrl === null) patch.avatarPhotoDataUrl = null;
  if (typeof req.body?.avatarParams === "string") patch.avatarParams = req.body.avatarParams;
  if (req.body?.avatarParams === null) patch.avatarParams = null;
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
