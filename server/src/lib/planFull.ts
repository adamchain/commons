// A full plan stops new Join taps. People who are only Interested come off
// the plan and the chat as soon as it's full, with a note to watch for a spot.
// If one opens later, they hear about it.

import { emit } from "./notify.js";
import { planHasEnded } from "./planTime.js";
import { store, type PlanRecord } from "../store.js";

const FULL_INTERESTED_BODY = (title: string) =>
  `No spots opened up for "${title}". You're off it — keep an eye out in case one does.`;

function capacityValue(capacity: unknown): number | null {
  const n = typeof capacity === "number" ? capacity : Number(capacity);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function goingCount(planId: string): number {
  return store.listParticipationsForPlan(planId).filter((p) => p.state === "going").length;
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
  for (const row of rows) {
    store.deleteParticipation(plan.id, row.userId);
    if (conv) store.removeConversationParticipant(conv.id, row.userId);
    waitlist.add(row.userId);
  }
  if (conv) store.createSystemMessage(conv.id, "Anyone who wasn't going has been taken off.");
  store.updatePlan(plan.id, { spotWaitlistUserIds: [...waitlist] });
  const stamp = new Date().toISOString();
  for (const row of rows) {
    await emit({
      userId: row.userId,
      kind: "planFullInterested",
      body: FULL_INTERESTED_BODY(plan.title),
      planId: plan.id,
      dedupKey: `planFullEvict:${plan.id}:${row.userId}:${stamp}`,
    });
  }
}

/** Take Interested people off any plan that is already full. */
export async function evictInterestedFromClosedPlans(): Promise<void> {
  for (const plan of store.listPlans()) {
    if (!planIsClosed(plan)) continue;
    await evictInterested(plan);
  }
}

function spotAudience(plan: PlanRecord): string[] {
  const skip = new Set([plan.creatorId, ...(plan.coHostIds ?? [])]);
  const ids = new Set(plan.spotWaitlistUserIds ?? []);
  for (const row of store.listParticipationsForPlan(plan.id)) {
    if (row.state === "interested") ids.add(row.userId);
  }
  return [...ids].filter((id) => !skip.has(id));
}

async function notifyWaitlist(plan: PlanRecord, stamp: string): Promise<void> {
  for (const userId of spotAudience(plan)) {
    await emit({
      userId,
      kind: "planSpotReopen",
      body: `A spot opened up on "${plan.title}".`,
      planId: plan.id,
      dedupKey: `planSpotOpened:${plan.id}:${userId}:${stamp}`,
    });
  }
}

/** Tell people who were interested that they can try again. No-op if nobody is waiting. */
export async function notifySpotOpened(planId: string): Promise<void> {
  const plan = store.findPlanById(planId);
  if (!plan || spotAudience(plan).length === 0) return;
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
  const plan = store.findPlanById(planId);
  if (!plan || plan.cancelledAt || planHasEnded(plan)) return plan ?? null;

  const cap = capacityValue(plan.capacity);
  const atCapacity = cap !== null && goingCount(plan.id) >= cap;
  const closedByHost = hostClosed(plan);

  if (closedByHost || atCapacity) {
    if (!closedByHost && (plan.markedFull !== true || plan.fullSource !== "capacity")) {
      store.updatePlan(plan.id, { markedFull: true, fullSource: "capacity" });
    }
    const closed = store.findPlanById(plan.id);
    if (closed) await evictInterested(closed);
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
