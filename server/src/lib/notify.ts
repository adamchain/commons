// Server-side notification emitter. All in-app notification creation flows
// through `emit` so the pref gate, dedup, and persistence stay in one place.
//
// A notification is gated by two things:
//   1. The user's NotificationPrefs toggle for that kind.
//   2. A dedupKey — same key blocks re-emit so a 10-min scheduler doesn't
//      re-send the same "your plan is tomorrow" every tick.
//
// No push delivery here — this is the in-app event log surfaced via
// /api/notifications. When/if we add web push, the same `emit` is the hook.

import { store, type NotificationRecord } from "../store.js";
import { findUserById } from "../userRepo.js";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "../types/shared.js";

type NotificationKind = NotificationRecord["kind"];

const PREF_KEY: Record<NotificationKind, keyof NotificationPrefs> = {
  someoneJoinedYourPlan: "someoneJoinedYourPlan",
  planTomorrow: "planTomorrow",
  planInTwoHours: "planInTwoHours",
  newGroupChatMessage: "newGroupChatMessage",
  postPlanNetworkNudge: "postPlanNetworkNudge",
  planCancellation: "planCancellation",
  weeklyFridayDigest: "weeklyFridayDigest",
  lookingForRecovery: "lookingForRecovery",
  // Time-change events ride on the existing "plan changes" toggle — both are
  // host actions that move the plan out from under participants.
  planTimeProposed: "planCancellation",
  planTimeChanged: "planCancellation",
  // Invites ride on the "someone joined" toggle — both are person-to-plan pings.
  planInvite: "someoneJoinedYourPlan",
};

export async function emit(input: {
  userId: string;
  kind: NotificationKind;
  body: string;
  dedupKey: string;
  planId?: string;
  conversationId?: string;
}): Promise<NotificationRecord | null> {
  const user = await findUserById(input.userId);
  if (!user) return null;
  const prefs: NotificationPrefs = {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(user.notificationPrefs ?? {}),
  };
  if (prefs[PREF_KEY[input.kind]] === false) return null;
  return store.insertNotificationIfNew({
    userId: input.userId,
    kind: input.kind,
    body: input.body,
    dedupKey: input.dedupKey,
    planId: input.planId,
    conversationId: input.conversationId,
  });
}
