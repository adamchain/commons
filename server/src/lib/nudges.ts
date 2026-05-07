import { sendTransactionalSms } from "./sms.js";
import { planEndTimestamp, planHasEnded, planStartTimestamp } from "./planTime.js";
import { store, type PlanRecord } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";

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

export function startNudgeSchedulers(): void {
  const tick = () => {
    void runPlanReminders().catch((e) => console.error(e));
    void runWeekendNudgeIfWeekendEve().catch((e) => console.error(e));
    void runPostPlanReviewPrompts().catch((e) => console.error(e));
  };
  setInterval(tick, 5 * 60 * 1000);
  void tick();
}
