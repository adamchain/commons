// Pull every collection out of Mongo into the in-memory snapshot so the sync
// `store` reads see prod data after a cold start. Called once after Mongo
// connects in index.ts. If Mongo isn't connected, this is a no-op and the
// snapshot keeps whatever it loaded from data.json (local dev).

import { isMongoConnected } from "./lib/db.js";
import {
  CardImageModel,
  CommunityMemberModel,
  CommunityModel,
  CommunityPostModel,
  ConversationModel,
  DeclineModel,
  DropoutModel,
  FeedbackModel,
  ForumMembershipModel,
  ForumPostLikeModel,
  ForumPostModel,
  ForumReplyModel,
  InterestForumModel,
  LogModel,
  MessageModel,
  NeighborhoodModel,
  ParticipationModel,
  PlanModel,
  PlanSuggestionModel,
} from "./models/index.js";
import { DeviceModel } from "./models/Device.js";
import { InviteCodeModel } from "./models/InviteCode.js";
import { NotificationModel } from "./models/Notification.js";
import { RelationshipModel } from "./models/Relationship.js";
import { UserModel } from "./models/User.js";
import { store } from "./store.js";

export async function hydrateSnapshotFromMongo(): Promise<void> {
  if (!isMongoConnected()) {
    console.log("[hydrate] Mongo not connected — skipping (snapshot stays as-is from data.json).");
    return;
  }
  try {
    const [
      users,
      neighborhoods,
      plans,
      participations,
      conversations,
      messages,
      planSuggestions,
      feedback,
      declines,
      dropouts,
      logs,
      notifications,
      relationships,
      inviteCodes,
      cardImages,
      communities,
      communityMembers,
      communityPosts,
      devices,
      interestForums,
      forumMemberships,
      forumPosts,
      forumReplies,
      forumPostLikes,
    ] = await Promise.all([
      UserModel.find({}).lean(),
      NeighborhoodModel.find({}).lean(),
      PlanModel.find({}).lean(),
      ParticipationModel.find({}).lean(),
      ConversationModel.find({}).lean(),
      MessageModel.find({}).lean(),
      PlanSuggestionModel.find({}).lean(),
      FeedbackModel.find({}).lean(),
      DeclineModel.find({}).lean(),
      DropoutModel.find({}).lean(),
      LogModel.find({}).sort({ createdAt: -1 }).limit(500).lean(),
      NotificationModel.find({}).sort({ createdAt: -1 }).limit(2000).lean(),
      RelationshipModel.find({}).lean(),
      InviteCodeModel.find({}).lean(),
      CardImageModel.find({}).lean(),
      CommunityModel.find({}).lean(),
      CommunityMemberModel.find({}).lean(),
      CommunityPostModel.find({}).lean(),
      DeviceModel.find({}).lean(),
      InterestForumModel.find({}).lean(),
      ForumMembershipModel.find({}).lean(),
      ForumPostModel.find({}).lean(),
      ForumReplyModel.find({}).lean(),
      ForumPostLikeModel.find({}).lean(),
    ]);

    // `reset` replaces the snapshot wholesale. We bypass mirror here — Mongo
    // already has the data; mirroring again would be a no-op writeback storm.
    store.resetLocalOnly({
      users,
      neighborhoods,
      plans,
      participations,
      conversations,
      messages,
      planSuggestions,
      feedback,
      declines,
      dropouts,
      smsCodes: [],
      logs,
      notifications,
      relationships,
      inviteCodes,
      cardImages,
      communities,
      communityMembers,
      communityPosts,
      devices,
      interestForums,
      forumMemberships,
      forumPosts,
      forumReplies,
      forumPostLikes,
    });

    // Ensure one forum row per InterestTag even if Mongo was empty / partial.
    store.ensureForumsForInterests();

    // Unify legacy 8-option community categories with InterestTag *before*
    // any other community writes (promote/update upserts must pass the new enum).
    const categoryMigrated = store.migrateCommunityCategories();

    // Communities now go live on create. Promote any legacy `pending` rows so
    // stuck submissions aren't trapped behind an unprocessed review queue.
    const promoted = store.promotePendingCommunities();

    console.log(
      `[hydrate] loaded from Mongo: ${users.length} users, ${neighborhoods.length} hoods, ${plans.length} plans, ${participations.length} rsvps, ${conversations.length} convos, ${messages.length} msgs, ${interestForums.length} forums, ${forumPosts.length} forumPosts` +
        (categoryMigrated ? `, migrated ${categoryMigrated} community categories` : "") +
        (promoted ? `, promoted ${promoted} pending communities` : ""),
    );
  } catch (err) {
    console.error("[hydrate] failed to load from Mongo — running with stale snapshot", err);
  }
}
