import { Router } from "express";
import { isAdminPhone } from "../lib/adminPhones.js";
import { signSessionToken } from "../lib/jwt.js";
import { normalizePhone } from "../lib/phone.js";
import { checkPhoneVerification, isTwilioVerifyConfigured, startPhoneVerification } from "../lib/verify.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { INVITE_CODES_PER_USER, normalizeInviteCode, store } from "../store.js";
import type { UserRecord } from "../store.js";
import { createUser, findUserByPhone, findUserById, updateUser, type UserPatch } from "../userRepo.js";
import {
  DEFAULT_NOTIFICATION_PREFS,
  type InviteCodeDTO,
  type MeDTO,
  type NotificationPrefs,
} from "../types/shared.js";
import { planHasEnded } from "../lib/planTime.js";
import { nextNetworkPrompt, otherGoingIds, userWasGoing } from "../lib/networkPrompt.js";
import { emit } from "../lib/notify.js";

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
    guidelinesAcknowledgedAt: user.guidelinesAcknowledgedAt ?? null,
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...(user.notificationPrefs ?? {}) },
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
  if (req.body?.guidelinesAcknowledged === true) {
    patch.guidelinesAcknowledgedAt = new Date().toISOString();
  }
  if (req.body?.socialLinks && typeof req.body.socialLinks === "object") {
    const ig = String(req.body.socialLinks.instagram ?? "").replace(/^@/, "").trim();
    patch.socialLinks = ig ? { instagram: ig } : undefined;
  }
  if (req.body?.notificationPrefs && typeof req.body.notificationPrefs === "object") {
    const incoming = req.body.notificationPrefs as Record<string, unknown>;
    const next: Partial<NotificationPrefs> = {};
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFS) as Array<keyof NotificationPrefs>) {
      if (typeof incoming[key] === "boolean") next[key] = incoming[key] as boolean;
    }
    const existing = (await findUserById(userId))?.notificationPrefs ?? {};
    patch.notificationPrefs = { ...existing, ...next };
  }
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

authRouter.get("/invite-codes", requireAuth, (req, res) => {
  const userId = String(req.userId);
  // Backfill on first read so users that pre-date the launch mechanic still
  // get their three codes the first time they open the share screen.
  let codes = store.listInviteCodesForOwner(userId);
  if (codes.length < INVITE_CODES_PER_USER) {
    store.createInviteCodesForUser(userId, INVITE_CODES_PER_USER - codes.length);
    codes = store.listInviteCodesForOwner(userId);
  }
  const dtos: InviteCodeDTO[] = codes
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => ({
      code: c.code,
      redeemedAt: c.redeemedAt,
      redeemedByFirstName:
        c.redeemedByUserId !== null
          ? store.findUserById(c.redeemedByUserId)?.firstName ?? null
          : null,
    }));
  res.json({ codes: dtos });
});

authRouter.post("/redeem-code", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const raw = String(req.body?.code ?? "");
  if (!raw.trim()) {
    res.status(400).json({ error: "Code required" });
    return;
  }
  const code = normalizeInviteCode(raw);
  const row = store.findInviteCodeByCode(code);
  if (!row) {
    res.status(404).json({ error: "Code not found" });
    return;
  }
  if (row.ownerUserId === userId) {
    res.status(400).json({ error: "Can't redeem your own code" });
    return;
  }
  if (row.redeemedByUserId && row.redeemedByUserId !== userId) {
    res.status(409).json({ error: "Code already redeemed" });
    return;
  }
  store.redeemInviteCode(code, userId);
  res.json({ ok: true });
});

authRouter.get("/network-prompt", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const prompt = await nextNetworkPrompt(userId);
  // Persist the nudge as a notification too, so the user has a record of it
  // even after the modal closes. Dedup'd per (user, plan) so dismissing the
  // modal doesn't keep producing new entries.
  if (prompt) {
    const otherNames = prompt.others
      .map((o) => o.firstName)
      .slice(0, 3)
      .join(", ");
    await emit({
      userId,
      kind: "postPlanNetworkNudge",
      body: `You went to "${prompt.planTitle}" with ${prompt.others.length} ${prompt.others.length === 1 ? "person" : "people"}${otherNames ? ` (${otherNames})` : ""} — add them to your network?`,
      planId: prompt.planId,
      dedupKey: `postPlanNetworkNudge:${prompt.planId}:${userId}`,
    });
  }
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
  const newlyAdded: string[] = [];
  for (const id of userIds) {
    if (id === userId) continue;
    if (!allowed.has(id)) continue;
    if (!next.has(id)) newlyAdded.push(id);
    next.add(id);
  }
  await updateUser(userId, { networkIds: [...next] });
  // Mirror to the relationships table — foundation for V2 Communities.
  for (const id of newlyAdded) {
    store.upsertRelationship({
      userId,
      targetId: id,
      kind: "network",
      source: "post_plan_modal",
    });
  }
  const me = await userToMe(userId);
  res.json({ ok: true, me });
});

/**
 * One-tap "Add to network" from a profile page — no shared plan required.
 * One-sided add: target shows up in viewer's network. Mutual happens when the
 * target also taps it from your profile. (Prototype — no pending state yet.)
 */
authRouter.post("/friend-add", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const targetId = String(req.body?.userId ?? "");
  if (!targetId || targetId === userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const viewer = await findUserById(userId);
  const target = await findUserById(targetId);
  if (!viewer || !target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const myNet = new Set(viewer.networkIds ?? []);
  const isNew = !myNet.has(targetId);
  myNet.add(targetId);
  await updateUser(userId, { networkIds: [...myNet] });
  if (isNew) {
    store.upsertRelationship({
      userId,
      targetId,
      kind: "network",
      source: "profile_friend_add",
    });
  }
  const me = await userToMe(userId);
  res.json({ ok: true, me });
});

authRouter.post("/friend-remove", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const targetId = String(req.body?.userId ?? "");
  if (!targetId || targetId === userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const viewer = await findUserById(userId);
  if (!viewer) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const myNet = new Set(viewer.networkIds ?? []);
  const existed = myNet.delete(targetId);
  await updateUser(userId, { networkIds: [...myNet] });
  if (existed) {
    store.deleteRelationship(userId, targetId, "network");
  }
  const me = await userToMe(userId);
  res.json({ ok: true, me });
});

/** Resolve the viewer's network into PublicUser records for the invite picker. */
authRouter.get("/network", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const viewer = await findUserById(userId);
  if (!viewer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const ids = viewer.networkIds ?? [];
  const users = ids
    .map((id) => store.findUserById(id))
    .filter((u): u is UserRecord => !!u)
    .map((u) => ({
      id: u.id,
      firstName: u.firstName,
      neighborhoodId: u.neighborhoodId ?? null,
      avatarSeed: u.avatarSeed,
      avatarStyle: u.avatarStyle,
      avatarPhotoDataUrl: u.avatarPhotoDataUrl,
      avatarParams: u.avatarParams,
    }));
  res.json({ users });
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
