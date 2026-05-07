import { planEndTimestamp, planHasEnded } from "./planTime.js";
import { store, type UserRecord } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import type { NetworkPromptDTO, PublicUser } from "../types/shared.js";

function userToPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName || "Friend",
    neighborhoodId: user.neighborhoodId,
    avatarSeed: user.avatarSeed,
    avatarStyle: user.avatarStyle,
    avatarPhotoDataUrl: user.avatarPhotoDataUrl,
  };
}

export function userWasGoing(planId: string, userId: string): boolean {
  const plan = store.findPlanById(planId);
  if (!plan) return false;
  if (plan.creatorId === userId) return true;
  const p = store.findParticipation(planId, userId);
  return p?.state === "going";
}

export function otherGoingIds(planId: string): string[] {
  const plan = store.findPlanById(planId);
  if (!plan) return [];
  const ids = new Set<string>();
  ids.add(plan.creatorId);
  for (const row of store.listParticipationsForPlan(planId)) {
    if (row.state === "going") ids.add(row.userId);
  }
  return [...ids];
}

/** Next post-event network prompt for viewer (shared real-world experience → network). */
export async function nextNetworkPrompt(viewerId: string): Promise<NetworkPromptDTO | null> {
  const viewer = await findUserById(viewerId);
  if (!viewer) return null;
  const dismissed = new Set(viewer.dismissedNetworkPromptPlanIds ?? []);
  const myNet = new Set(viewer.networkIds ?? []);

  const candidates = store
    .listPlans()
    .filter((p) => planHasEnded(p) && userWasGoing(p.id, viewerId))
    .sort((a, b) => planEndTimestamp(b) - planEndTimestamp(a));

  for (const plan of candidates) {
    if (dismissed.has(plan.id)) continue;
    const others = otherGoingIds(plan.id).filter((id) => id !== viewerId && !myNet.has(id));
    if (others.length === 0) continue;
    const users = await findUsersByIds(others);
    const othersPub: PublicUser[] = others.map((id) => {
      const u = users.get(id);
      return u ? userToPublic(u) : { id, firstName: "Friend", neighborhoodId: null, avatarSeed: "missing", avatarStyle: "avataaars" };
    });
    return {
      planId: plan.id,
      planTitle: plan.title,
      others: othersPub,
    };
  }
  return null;
}
