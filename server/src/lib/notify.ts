// Server-side notification emitter. All in-app notification creation flows
// through `emit` so the pref gate, dedup, and persistence stay in one place.
//
// A notification is gated by two things:
//   1. The user's NotificationPrefs toggle for that kind.
//   2. A dedupKey — same key blocks re-emit so a 10-min scheduler doesn't
//      re-send the same "your plan is tomorrow" every tick.
//
// After a fresh in-app row lands, we also fan out an APNs push (best-effort,
// never blocks/fails the in-app write) so the notification reaches the lock
// screen, not just the in-app feed.

import { sendPushToUser } from "./apns.js";
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
  // Hosting handoff — same urgency as plan changes / cancellation.
  planUpForGrabs: "planCancellation",
  // Network social pings ride on the post-plan network nudge toggle.
  networkRequest: "postPlanNetworkNudge",
  networkAccepted: "postPlanNetworkNudge",
  // Community pings ride on the "someone joined your plan" toggle — all four are
  // person-to-group activity. (A dedicated community toggle is a V2 refinement.)
  communityJoinRequest: "someoneJoinedYourPlan",
  communityRequestApproved: "someoneJoinedYourPlan",
  communityRequestDeclined: "someoneJoinedYourPlan",
  communityPlanPosted: "someoneJoinedYourPlan",
  planDayOf: "planTomorrow",
  interestedNudge: "planTomorrow",
  didThisHappen: "postPlanNetworkNudge",
  planSpotReopen: "someoneJoinedYourPlan",
  // F.9 — one-time welcome ping on signup; rides the same toggle as other
  // person/system-to-user pings since there's no dedicated onboarding pref.
  welcome: "someoneJoinedYourPlan",
};

export async function emit(input: {
  userId: string;
  kind: NotificationKind;
  body: string;
  dedupKey: string;
  planId?: string;
  conversationId?: string;
  profileUserId?: string;
  communityId?: string;
}): Promise<NotificationRecord | null> {
  const user = await findUserById(input.userId);
  if (!user) return null;
  const prefs: NotificationPrefs = {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(user.notificationPrefs ?? {}),
  };
  if (prefs[PREF_KEY[input.kind]] === false) return null;
  // Muted chats stay quiet — the conversation itself still works, it just
  // doesn't ping. Only applies to notifications tied to a specific thread.
  if (input.conversationId && (user.mutedConversationIds ?? []).includes(input.conversationId)) {
    return null;
  }
  const row = store.insertNotificationIfNew({
    userId: input.userId,
    kind: input.kind,
    body: input.body,
    dedupKey: input.dedupKey,
    planId: input.planId,
    conversationId: input.conversationId,
    profileUserId: input.profileUserId,
    communityId: input.communityId,
  });
  if (row) {
    const data: Record<string, string> = {};
    if (input.planId) data.planId = input.planId;
    if (input.conversationId) data.conversationId = input.conversationId;
    if (input.communityId) data.communityId = input.communityId;
    // Fire-and-forget — a push failure should never fail the in-app write.
    void sendPushToUser(input.userId, { title: "Commons", body: input.body, data }).catch((err) => {
      console.error("[notify] push send failed", err instanceof Error ? err.message : err);
    });
  }
  return row;
}
