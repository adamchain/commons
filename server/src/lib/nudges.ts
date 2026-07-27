import { sendTransactionalSms } from "./sms.js";
import { planEndTimestamp, planHasEnded, planStartTimestamp } from "./planTime.js";
import { store, type PlanRecord } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import { emit } from "./notify.js";

const REMINDER_SENT = new Set<string>();
const REVIEW_SENT = new Set<string>();
let lastWeekendNudgeDay: string | null = null;

function appOrigin(): string {
  return (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

/** Notify users who previously joined plans at the same venue label (normalized name). */
export async function onPlanCreatedVenueNudge(plan: PlanRecord): Promise<void> {
  const venueKey = plan.location.name.trim().toLowerCase();
  if (!venueKey || venueKey === "flexible location") return;

  const previousVisitors = new Map<string, { phone: string; firstName: string }>();

  for (const p of store.listPlans()) {
    if (p.id === plan.id) continue;
    if (p.location.name.trim().toLowerCase() !== venueKey) continue;
    const parts = store.listParticipationsForPlan(p.id);
    for (const row of parts) {
      if (row.state !== "going") continue;
      if (row.userId === plan.creatorId) continue;
      const u = await findUserById(row.userId);
      if (u && !previousVisitors.has(u.id)) {
        previousVisitors.set(u.id, { phone: u.phoneNumber, firstName: u.firstName || "there" });
      }
    }
  }

  const link = `${appOrigin()}/plans/${plan.id}`;
  for (const [, { phone, firstName }] of previousVisitors) {
    const body = `Hey ${firstName} — new plan at ${plan.location.name}: "${plan.title}". ${link}`;
    try {
      await sendTransactionalSms(phone, body);
    } catch (e) {
      console.error("[nudge] venue sms", e);
    }
    store.log("nudge_venue_sent", { planId: plan.id, to: phone });
  }
}

/** “Interested” users get a text when a flexible / looking-for plan is locked in. */
export async function notifyInterestedPlanLocked(plan: PlanRecord, hostFirstName: string): Promise<void> {
  const interested = store
    .listParticipationsForPlan(plan.id)
    .filter((p) => p.state === "interested");
  if (interested.length === 0) return;
  const users = await findUsersByIds(interested.map((p) => p.userId));
  const link = `${appOrigin()}/plans/${plan.id}`;
  for (const row of interested) {
    const u = users.get(row.userId);
    if (!u) continue;
    const body = `${hostFirstName} locked in "${plan.title}" — ${plan.location.name}. Details in Commons. ${link}`;
    try {
      await sendTransactionalSms(u.phoneNumber, body);
    } catch (e) {
      console.error("[nudge] lock sms", e);
    }
    store.log("nudge_lock_in_sms", { planId: plan.id, toUserId: u.id });
  }
}

/** Thursday / Friday: highlight a few upcoming plans in the user’s hoods (best-effort). */
export async function runWeekendNudgeIfWeekendEve(): Promise<void> {
  const dow = new Date().getDay();
  if (dow !== 4 && dow !== 5) return;
  const dayKey = new Date().toISOString().slice(0, 10);
  if (lastWeekendNudgeDay === dayKey) return;

  const seen = new Set<string>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000);

  const upcoming = store
    .listPlans()
    .filter((p) => {
      const ds = new Date(p.date);
      ds.setHours(0, 0, 0, 0);
      return ds.getTime() >= today.getTime() && ds.getTime() <= horizon.getTime() && !planHasEnded(p);
    })
    .slice(0, 4);

  if (upcoming.length === 0) {
    lastWeekendNudgeDay = dayKey;
    return;
  }

  const lines = upcoming.map((p) => `• ${p.title}`).join("\n");
  for (const u of store.listUsers()) {
    if (!u.phoneNumber || seen.has(u.id)) continue;
    const hoods = u.neighborhoodIds?.length ? u.neighborhoodIds : u.neighborhoodId ? [u.neighborhoodId] : [];
    if (hoods.length === 0) continue;
    const set = new Set(hoods);
    const near = upcoming.some((p) => set.has(p.neighborhoodId));
    if (!near) continue;
    seen.add(u.id);
    const body = `This weekend on Commons:\n${lines}\n${appOrigin()}/`;
    try {
      await sendTransactionalSms(u.phoneNumber, body);
    } catch (e) {
      console.error("[nudge] weekend sms", e);
    }
    store.log("nudge_weekend_sent", { userId: u.id });
    await emit({
      userId: u.id,
      kind: "weeklyFridayDigest",
      body: `Here's what's happening in Philly this week:\n${lines}`,
      dedupKey: `weeklyFridayDigest:${dayKey}:${u.id}`,
    });
    if (seen.size >= 80) break;
  }
  lastWeekendNudgeDay = dayKey;
}

/** ~2 hours before start — one SMS per user per plan. */
export async function runPlanReminders(): Promise<void> {
  const now = Date.now();
  const windowStart = now + 115 * 60 * 1000;
  const windowEnd = now + 125 * 60 * 1000;

  for (const plan of store.listPlans()) {
    if (plan.isFlexibleTime && !plan.time) continue;
    const start = planStartTimestamp(plan);
    if (start < windowStart || start > windowEnd) continue;
    if (planHasEnded(plan)) continue;

    const going = store
      .listParticipationsForPlan(plan.id)
      .filter((p) => p.state === "going")
      .map((p) => p.userId);
    const userIds = Array.from(new Set([...going, plan.creatorId]));
    const users = await findUsersByIds(userIds);

    for (const uid of userIds) {
      const key = `${plan.id}:${uid}`;
      if (REMINDER_SENT.has(key)) continue;
      const u = users.get(uid);
      if (!u) continue;
      const body = `Reminder: "${plan.title}" is coming up soon at ${plan.location.name}. ${appOrigin()}/plans/${plan.id}`;
      try {
        await sendTransactionalSms(u.phoneNumber, body);
        REMINDER_SENT.add(key);
        store.log("nudge_reminder_sent", { planId: plan.id, userId: uid });
      } catch (e) {
        console.error("[nudge] reminder sms", e);
      }
      await emit({
        userId: uid,
        kind: "planInTwoHours",
        body: `"${plan.title}" starts in ~2 hours at ${plan.location.name}`,
        planId: plan.id,
        dedupKey: `planInTwoHours:${plan.id}:${uid}`,
      });
    }
  }
}

/** ~24 hours before start — in-app notification only (SMS noise too high for tomorrow). */
const TOMORROW_NOTIFIED = new Set<string>();
export async function runPlanTomorrowReminders(): Promise<void> {
  const now = Date.now();
  const windowStart = now + 23.5 * 60 * 60 * 1000;
  const windowEnd = now + 24.5 * 60 * 60 * 1000;

  for (const plan of store.listPlans()) {
    if (plan.isFlexibleTime && !plan.time) continue;
    const start = planStartTimestamp(plan);
    if (start < windowStart || start > windowEnd) continue;
    if (planHasEnded(plan)) continue;

    const going = store
      .listParticipationsForPlan(plan.id)
      .filter((p) => p.state === "going")
      .map((p) => p.userId);
    const userIds = Array.from(new Set([...going, plan.creatorId]));

    for (const uid of userIds) {
      const key = `${plan.id}:${uid}`;
      if (TOMORROW_NOTIFIED.has(key)) continue;
      const created = await emit({
        userId: uid,
        kind: "planTomorrow",
        body: `"${plan.title}" is tomorrow at ${plan.location.name}`,
        planId: plan.id,
        dedupKey: `planTomorrow:${plan.id}:${uid}`,
      });
      if (created) TOMORROW_NOTIFIED.add(key);
    }
  }
}

/** After a plan ends — lightweight “how was it?” ping (SMS if configured). */
export async function runPostPlanReviewPrompts(): Promise<void> {
  const now = Date.now();
  for (const plan of store.listPlans()) {
    if (!planHasEnded(plan)) continue;
    const endAt = planEndTimestamp(plan);
    if (now < endAt || now - endAt > 2 * 60 * 60 * 1000) continue;

    const going = store
      .listParticipationsForPlan(plan.id)
      .filter((p) => p.state === "going")
      .map((p) => p.userId);
    for (const uid of going) {
      const key = `review:${plan.id}:${uid}`;
      if (REVIEW_SENT.has(key)) continue;
      const u = await findUserById(uid);
      if (!u) continue;
      const body = `How was "${plan.title}"? Open Commons to leave quick feedback. ${appOrigin()}/plans/${plan.id}`;
      try {
        await sendTransactionalSms(u.phoneNumber, body);
        REVIEW_SENT.add(key);
        store.log("nudge_post_review", { planId: plan.id, userId: uid });
      } catch (e) {
        console.error("[nudge] review sms", e);
      }
    }
  }
}

/**
 * Day-of reminder (6.1) — morning of the plan (6–10am local window) OR ~3 hours
 * before start if the plan is later that day. Everyone Going + host.
 */
const DAY_OF_SENT = new Set<string>();
export async function runDayOfReminders(): Promise<void> {
  const now = Date.now();
  for (const plan of store.listPlans()) {
    if (plan.cancelledAt) continue;
    if (plan.isFlexibleTime && !plan.time) continue;
    if (planHasEnded(plan)) continue;
    const start = planStartTimestamp(plan);
    const hoursUntil = (start - now) / (60 * 60 * 1000);
    // Fire in a ~20-min window around either 3h-before OR morning-of (8am local).
    const threeHourHit = hoursUntil >= 2.85 && hoursUntil <= 3.15;
    const startDate = new Date(start);
    const morning = new Date(startDate);
    morning.setHours(8, 0, 0, 0);
    const morningHit =
      startDate.toDateString() === new Date(now).toDateString() &&
      Math.abs(now - morning.getTime()) < 15 * 60 * 1000 &&
      hoursUntil > 3.2;
    if (!threeHourHit && !morningHit) continue;

    const going = store
      .listParticipationsForPlan(plan.id)
      .filter((p) => p.state === "going")
      .map((p) => p.userId);
    const userIds = Array.from(new Set([...going, plan.creatorId]));
    // +1 so the count reads as "everyone going" (participants + host) rather
    // than excluding the host from their own headcount.
    const goingCount = new Set([...going, plan.creatorId]).size;
    const timeLabel = plan.time?.trim() ? plan.time : "flexible time";
    const venue = plan.location?.name?.trim();
    const whenWhere = venue ? `${plan.title}, ${timeLabel} at ${venue}` : `${plan.title}, ${timeLabel}`;
    const body = `Today's the day — ${whenWhere}. ${goingCount} going!`;

    for (const uid of userIds) {
      const key = `dayof:${plan.id}:${uid}`;
      if (DAY_OF_SENT.has(key)) continue;
      const created = await emit({
        userId: uid,
        kind: "planDayOf",
        body,
        planId: plan.id,
        dedupKey: `planDayOf:${plan.id}:${uid}`,
      });
      if (created) {
        DAY_OF_SENT.add(key);
        const u = await findUserById(uid);
        if (u?.phoneNumber) {
          try {
            await sendTransactionalSms(u.phoneNumber, `${body} ${appOrigin()}/plans/${plan.id}`);
          } catch (e) {
            console.error("[nudge] day-of sms", e);
          }
        }
      }
    }
  }
}

/**
 * Interested nudge (6.2) — ~24h before, Interested people get a convert/remove prompt.
 */
const INTERESTED_NUDGE_SENT = new Set<string>();
export async function runInterestedNudges(): Promise<void> {
  const now = Date.now();
  const windowStart = now + 23.5 * 60 * 60 * 1000;
  const windowEnd = now + 24.5 * 60 * 60 * 1000;

  for (const plan of store.listPlans()) {
    if (plan.cancelledAt) continue;
    if (plan.isFlexibleTime && !plan.time) continue;
    if (planHasEnded(plan)) continue;
    const start = planStartTimestamp(plan);
    if (start < windowStart || start > windowEnd) continue;

    const interested = store
      .listParticipationsForPlan(plan.id)
      .filter((p) => p.state === "interested" && p.userId !== plan.creatorId);

    for (const row of interested) {
      const key = `${plan.id}:${row.userId}`;
      if (INTERESTED_NUDGE_SENT.has(key)) continue;
      const created = await emit({
        userId: row.userId,
        kind: "interestedNudge",
        body: `Still thinking about it? ${plan.title} is tomorrow.`,
        planId: plan.id,
        dedupKey: `interestedNudge:${plan.id}:${row.userId}`,
      });
      if (created) INTERESTED_NUDGE_SENT.add(key);
    }
  }
}

/**
 * "Did this happen?" (6.4) — ~2h after start, host gets Yes / No / Rescheduled.
 */
const DID_HAPPEN_SENT = new Set<string>();
export async function runDidThisHappenPrompts(): Promise<void> {
  const now = Date.now();
  for (const plan of store.listPlans()) {
    if (plan.cancelledAt) continue;
    if (plan.happenedOutcome) continue;
    if (plan.isFlexibleTime && !plan.time) continue;
    const start = planStartTimestamp(plan);
    const elapsed = now - start;
    if (elapsed < 1.9 * 60 * 60 * 1000 || elapsed > 3 * 60 * 60 * 1000) continue;

    const key = plan.id;
    if (DID_HAPPEN_SENT.has(key)) continue;
    const created = await emit({
      userId: plan.creatorId,
      kind: "didThisHappen",
      body: `Did "${plan.title}" happen?`,
      planId: plan.id,
      dedupKey: `didThisHappen:${plan.id}`,
    });
    if (created) DID_HAPPEN_SENT.add(key);
  }
}

/**
 * Looking-For recovery — two paths:
 *   • Group case (≥2 RSVPs, not locked 12h after the group formed): nudge
 *     everyone in the thread so someone steps up to lock it in.
 *   • Solo case (0 non-host RSVPs, 24h since the plan was posted): nudge the
 *     creator to share it or tweak the day before it goes stale.
 * Dedup is per (plan, user) and per path so each person sees each path at most
 * once per plan.
 */
const LOOKING_FOR_RECOVERY_NOTIFIED = new Set<string>();
const LOOKING_FOR_SOLO_NOTIFIED = new Set<string>();
export async function runLookingForRecoveryNudges(): Promise<void> {
  const now = Date.now();
  for (const plan of store.listPlans()) {
    if ((plan.planKind ?? "standard") !== "looking_for") continue;
    if (plan.lockedAt) continue;
    if (plan.cancelledAt) continue;
    if (planHasEnded(plan)) continue;
    const parts = store
      .listParticipationsForPlan(plan.id)
      .filter((p) => p.state === "going" || p.state === "interested");
    const nonHostRsvps = parts.filter((p) => p.userId !== plan.creatorId);

    // Solo path: still zero non-host RSVPs 24h after posting.
    if (nonHostRsvps.length === 0) {
      const createdAt = Date.parse(plan.createdAt);
      if (Number.isFinite(createdAt) && now - createdAt >= 24 * 60 * 60 * 1000) {
        const key = `${plan.id}:${plan.creatorId}`;
        if (!LOOKING_FOR_SOLO_NOTIFIED.has(key)) {
          const created = await emit({
            userId: plan.creatorId,
            kind: "lookingForRecovery",
            body: `"${plan.title}" has been quiet — want to invite someone or tweak the day?`,
            planId: plan.id,
            dedupKey: `lookingForRecoverySolo:${plan.id}:${plan.creatorId}`,
          });
          if (created) LOOKING_FOR_SOLO_NOTIFIED.add(key);
        }
      }
      continue;
    }

    // Group path: ≥2 RSVPs (host included), 12h since the group formed.
    if (parts.length < 2) continue;
    const sorted = parts
      .map((p) => Date.parse(p.updatedAt))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const groupFormedAt = sorted[1];
    if (groupFormedAt === undefined) continue;
    if (now - groupFormedAt < 12 * 60 * 60 * 1000) continue;
    const recipientIds = Array.from(new Set([plan.creatorId, ...parts.map((p) => p.userId)]));
    for (const uid of recipientIds) {
      const key = `${plan.id}:${uid}`;
      if (LOOKING_FOR_RECOVERY_NOTIFIED.has(key)) continue;
      const created = await emit({
        userId: uid,
        kind: "lookingForRecovery",
        body: `"${plan.title}" has a group but no plan yet — want to lock it in?`,
        planId: plan.id,
        dedupKey: `lookingForRecovery:${plan.id}:${uid}`,
      });
      if (created) LOOKING_FOR_RECOVERY_NOTIFIED.add(key);
    }
  }
}

export function startNudgeSchedulers(): void {
  const tick = () => {
    void runPlanReminders().catch((e) => console.error(e));
    void runPlanTomorrowReminders().catch((e) => console.error(e));
    void runDayOfReminders().catch((e) => console.error(e));
    void runInterestedNudges().catch((e) => console.error(e));
    void runDidThisHappenPrompts().catch((e) => console.error(e));
    void runWeekendNudgeIfWeekendEve().catch((e) => console.error(e));
    void runPostPlanReviewPrompts().catch((e) => console.error(e));
    void runLookingForRecoveryNudges().catch((e) => console.error(e));
  };
  setInterval(tick, 5 * 60 * 1000);
  void tick();
}
