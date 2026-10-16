// A full plan stops new Join taps. People who are only Interested stay until
// 48 hours before the start, then they come off the plan and the chat.
// If a spot opens after that, they hear about it.

import { emit } from "./notify.js";
import { planHasEnded, planStartTimestamp } from "./planTime.js";
import { store, type PlanRecord } from "../store.js";

const INTERESTED_FALLOFF_MS = 48 * 60 * 60 * 1000;

function capacityValue(capacity: unknown): number | null {
  const n = typeof capacity === "number" ? capacity : Number(capacity);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function goingCount(planId: string): number {
  return store.listParticipationsForPlan(planId).filter((p) => p.state === "going").length;
}

/**
 * True once the plan is inside 48 hours of a real start time.
 * Flexible dates, "this week", and untimed plans have no moment to count from.
 */
export function interestedFalloffDue(plan: PlanRecord, now = Date.now()): boolean {
  if (plan.cancelledAt || planHasEnded(plan)) return false;
  if (plan.isFlexibleDate || plan.isThisWeek) return false;
  if (plan.isFlexibleTime || !plan.time?.trim()) return false;
  const start = planStartTimestamp(plan);
  if (!Number.isFinite(start)) return false;
  return now >= start - INTERESTED_FALLOFF_MS;
}

/** Host closed it, or going has reached the cap. Ended and cancelled plans stay as they are. */
export function planIsClosed(plan: PlanRecord): boolean {
  if (plan.cancelledAt || planHasEnded(plan)) return false;
  if (plan.markedFull === true) return true;
  const cap = capacityValue(plan.capacity);
  if (cap === null) return false;
  return goingCount(plan.id) >= cap;
}

function hostClosed(plan: PlanRecord): boolean {
  return plan.markedFull === true && plan.fullSource !== "capacity";
}

/** Drop someone from the "tell me if a spot opens" list once they join again. */
export function forgetSpotWaitlist(planId: string, userId: string): void {
  const plan = store.findPlanById(planId);
  const ids = plan?.spotWaitlistUserIds;
  if (!ids?.includes(userId)) return;
  store.updatePlan(planId, { spotWaitlistUserIds: ids.filter((id) => id !== userId) });
}

async function evictInterested(plan: PlanRecord): Promise<void> {
  const keep = new Set([plan.creatorId, ...(plan.coHostIds ?? [])]);
  const rows = store
    .listParticipationsForPlan(plan.id)
    .filter((p) => p.state === "interested" && !keep.has(p.userId));
  if (rows.length === 0) return;

  const waitlist = new Set(plan.spotWaitlistUserIds ?? []);
  const conv = store.findGroupConversationByPlan(plan.id);
  const start = planStartTimestamp(plan);
  for (const row of rows) {
    store.deleteParticipation(plan.id, row.userId);
    if (conv) store.removeConversationParticipant(conv.id, row.userId);
    waitlist.add(row.userId);
    await emit({
      userId: row.userId,
      kind: "planFullInterested",
      body: `You're off "${plan.title}". Only people who are going stay on it now.`,
      planId: plan.id,
      dedupKey: `planInterestedFalloff:${plan.id}:${row.userId}:${start}`,
    });
  }
  if (conv) store.createSystemMessage(conv.id, "Anyone who wasn't going has been taken off.");
  store.updatePlan(plan.id, { spotWaitlistUserIds: [...waitlist] });
}

/** Take Interested people off once the plan is inside 48 hours of starting. */
export async function releaseInterestedBeforeStart(planId?: string): Promise<void> {
  const plans = planId
    ? [store.findPlanById(planId)].filter((plan): plan is PlanRecord => !!plan)
    : store.listPlans();
  for (const plan of plans) {
    if (!interestedFalloffDue(plan)) continue;
    await evictInterested(plan);
  }
}

async function notifyWaitlist(plan: PlanRecord, stamp: string): Promise<void> {
  for (const userId of plan.spotWaitlistUserIds ?? []) {
    if (userId === plan.creatorId) continue;
    await emit({
      userId,
      kind: "planSpotReopen",
      body: `A spot opened up on "${plan.title}".`,
      planId: plan.id,
      dedupKey: `planSpotOpened:${plan.id}:${userId}:${stamp}`,
    });
  }
}

/** Tell people who were removed that they can try again. No-op if nobody is waiting. */
export async function notifySpotOpened(planId: string): Promise<void> {
  const plan = store.findPlanById(planId);
  if (!plan || !(plan.spotWaitlistUserIds ?? []).length) return;
  const stamp = new Date().toISOString();
  store.updatePlan(planId, { spotOpenedAt: stamp });
  const fresh = store.findPlanById(planId);
  if (fresh) await notifyWaitlist(fresh, stamp);
}

/**
 * Keep the full flag, the guest list, and the waitlist in step.
 * Safe to call on every read: it writes only when the plan actually changes.
 */
export async function syncPlanFullness(planId: string): Promise<PlanRecord | null> {
  await releaseInterestedBeforeStart(planId);
  const plan = store.findPlanById(planId);
  if (!plan || plan.cancelledAt || planHasEnded(plan)) return plan ?? null;

  const cap = capacityValue(plan.capacity);
  const atCapacity = cap !== null && goingCount(plan.id) >= cap;
  const closedByHost = hostClosed(plan);

  if (closedByHost || atCapacity) {
    if (!closedByHost && (plan.markedFull !== true || plan.fullSource !== "capacity")) {
      store.updatePlan(plan.id, { markedFull: true, fullSource: "capacity" });
    }
    return store.findPlanById(plan.id) ?? null;
  }

  if (plan.markedFull && plan.fullSource === "capacity") {
    const stamp = new Date().toISOString();
    store.updatePlan(plan.id, { markedFull: false, fullSource: null, spotOpenedAt: stamp });
    const fresh = store.findPlanById(plan.id);
    if (fresh) await notifyWaitlist(fresh, stamp);
    return store.findPlanById(plan.id) ?? null;
  }

  return plan;
}
