// Centralized Mongoose models for everything beyond `User` (which has its own
// file). One module to keep schemas + indexes in one place and to avoid
// 9 nearly-identical boilerplate files.
//
// Each record uses our own `id` field (UUID string) — not Mongo's `_id` — so
// the existing in-memory `store` and the Mongo source-of-truth share keys.
// All `findOne({ id })` lookups are O(1) via the unique index.

import mongoose, { Schema, type Model } from "mongoose";
import { ALL_INTERESTS } from "../types/shared.js";
import type {
  CardImageRecord,
  CommunityMemberRecord,
  CommunityPostRecord,
  CommunityRecord,
  ConversationRecord,
  DeclineRecord,
  DropoutRecord,
  FeedbackRecord,
  ForumMembershipRecord,
  ForumPostLikeRecord,
  ForumPostRecord,
  ForumReplyRecord,
  InterestForumRecord,
  LogRecord,
  MessageRecord,
  NeighborhoodRecord,
  ParticipationRecord,
  PlanRecord,
  PlanSuggestionRecord,
  ReportRecord,
} from "../store.js";

function compile<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

// Neighborhoods — small static-ish list, but durable so they survive restarts.
const NeighborhoodSchema = new Schema<NeighborhoodRecord>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    metro: { type: String, required: true },
    adjacent: { type: [String], default: [] },
    lat: { type: Number },
    lng: { type: Number },
  },
  { collection: "neighborhoods" },
);
NeighborhoodSchema.index({ id: 1 }, { unique: true });
export const NeighborhoodModel = compile<NeighborhoodRecord>("Neighborhood", NeighborhoodSchema);

// Plans
const PlanSchema = new Schema<PlanRecord>(
  {
    id: { type: String, required: true },
    creatorId: { type: String, required: true },
    coHostIds: { type: [String], default: undefined },
    title: { type: String, required: true },
    neighborhoodId: { type: String, required: true },
    location: {
      name: { type: String, required: true },
      address: { type: String, required: true },
      lat: { type: Number },
      lng: { type: Number },
    },
    date: { type: String, required: true },
    time: { type: String, default: "" },
    isFlexibleTime: { type: Boolean, default: false },
    isFlexibleDate: { type: Boolean, default: false },
    isFlexibleLocation: { type: Boolean, default: false },
    endTime: { type: String },
    tags: { type: [String], default: [] },
    description: { type: String },
    hostEmoji: { type: String, default: "✨" },
    planKind: { type: String, enum: ["standard", "looking_for"], default: "standard" },
    visibility: { type: String, enum: ["everyone", "community", "network"], default: "everyone" },
    visibilityCommunityTag: { type: String, default: null },
    communityId: { type: String, default: null },
    communityVisibility: { type: String, enum: ["public", "community_only", null], default: null },
    capacity: { type: Number, default: null },
    joinType: { type: String, enum: ["open", "approve"], default: "open" },
    isRecurring: { type: Boolean, default: false },
    seriesId: { type: String, default: null },
    lockedAt: { type: String, default: null },
    cancelledAt: { type: String, default: null },
    upForGrabsAt: { type: String, default: null },
    flyerDataUrl: { type: String },
    flyerLinkUrl: { type: String },
    flyerLinkPreview: {
      title: { type: String },
      description: { type: String },
      image: { type: String },
      siteName: { type: String },
    },
    pendingTimeProposal: {
      date: { type: String },
      time: { type: String },
      isFlexibleTime: { type: Boolean },
      proposedAt: { type: String },
    },
    createdAt: { type: String, required: true },
  },
  { collection: "plans" },
);
PlanSchema.index({ id: 1 }, { unique: true });
PlanSchema.index({ creatorId: 1 });
PlanSchema.index({ neighborhoodId: 1 });
PlanSchema.index({ date: 1 });
PlanSchema.index({ seriesId: 1 });
export const PlanModel = compile<PlanRecord>("Plan", PlanSchema);

// Participations
const ParticipationSchema = new Schema<ParticipationRecord>(
  {
    id: { type: String, required: true },
    planId: { type: String, required: true },
    userId: { type: String, required: true },
    state: { type: String, enum: ["interested", "going"], required: true },
    createdAt: { type: String },
    updatedAt: { type: String, required: true },
    attended: { type: Boolean, default: null },
  },
  { collection: "participations" },
);
ParticipationSchema.index({ id: 1 }, { unique: true });
ParticipationSchema.index({ planId: 1, userId: 1 }, { unique: true });
ParticipationSchema.index({ userId: 1 });
export const ParticipationModel = compile<ParticipationRecord>("Participation", ParticipationSchema);

// Dropouts — explicit drop-out event log. Parallel to Declines.
const DropoutSchema = new Schema<DropoutRecord>(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    planId: { type: String, required: true },
    fromState: { type: String, enum: ["interested", "going"], required: true },
    createdAt: { type: String, required: true },
  },
  { collection: "dropouts" },
);
DropoutSchema.index({ id: 1 }, { unique: true });
DropoutSchema.index({ userId: 1, createdAt: 1 });
DropoutSchema.index({ planId: 1 });
export const DropoutModel = compile<DropoutRecord>("Dropout", DropoutSchema);

// Conversations
const ConversationSchema = new Schema<ConversationRecord>(
  {
    id: { type: String, required: true },
    // Empty string for community conversations (anchored by communityId), so
    // this stays a non-null string without failing `required` on "".
    planId: { type: String, default: "" },
    communityId: { type: String, default: null },
    type: { type: String, enum: ["group", "dm"], required: true },
    participantIds: { type: [String], default: [] },
    createdAt: { type: String, required: true },
    lastMessageAt: { type: String, required: true },
  },
  { collection: "conversations" },
);
ConversationSchema.index({ id: 1 }, { unique: true });
ConversationSchema.index({ planId: 1, type: 1 });
ConversationSchema.index({ communityId: 1, type: 1 });
export const ConversationModel = compile<ConversationRecord>("Conversation", ConversationSchema);

// Messages
const MessageSchema = new Schema<MessageRecord>(
  {
    id: { type: String, required: true },
    conversationId: { type: String, required: true },
    senderId: { type: String, required: true },
    body: { type: String, required: true },
    createdAt: { type: String, required: true },
    readBy: { type: [String], default: [] },
    kind: { type: String, enum: ["user", "system", "poll"], default: "user" },
    // emoji → userIds. Mixed since the key set is dynamic.
    reactions: { type: Schema.Types.Mixed, default: {} },
    // Present only on poll messages: { question, options, votes, closed }.
    poll: { type: Schema.Types.Mixed, default: undefined },
    imageUrl: { type: String, default: null },
  },
  { collection: "messages" },
);
MessageSchema.index({ id: 1 }, { unique: true });
MessageSchema.index({ conversationId: 1, createdAt: 1 });
export const MessageModel = compile<MessageRecord>("Message", MessageSchema);

// Plan suggestions (looking-for replies)
const PlanSuggestionSchema = new Schema<PlanSuggestionRecord>(
  {
    id: { type: String, required: true },
    planId: { type: String, required: true },
    userId: { type: String, required: true },
    body: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { collection: "planSuggestions" },
);
PlanSuggestionSchema.index({ id: 1 }, { unique: true });
PlanSuggestionSchema.index({ planId: 1 });
export const PlanSuggestionModel = compile<PlanSuggestionRecord>("PlanSuggestion", PlanSuggestionSchema);

// Feedback
const FeedbackSchema = new Schema<FeedbackRecord>(
  {
    id: { type: String, required: true },
    planId: { type: String, required: true },
    fromUserId: { type: String, required: true },
    toHostId: { type: String, required: true },
    thumb: { type: String, enum: ["up", "down"], required: true },
    note: { type: String },
    createdAt: { type: String, required: true },
  },
  { collection: "feedback" },
);
FeedbackSchema.index({ id: 1 }, { unique: true });
FeedbackSchema.index({ toHostId: 1 });
FeedbackSchema.index({ planId: 1 });
export const FeedbackModel = compile<FeedbackRecord>("Feedback", FeedbackSchema);

// Declines
const DeclineSchema = new Schema<DeclineRecord>(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    planId: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { collection: "declines" },
);
DeclineSchema.index({ id: 1 }, { unique: true });
DeclineSchema.index({ userId: 1, createdAt: 1 });
export const DeclineModel = compile<DeclineRecord>("Decline", DeclineSchema);

// Logs — admin event stream. Keep ~recent only via the route's slice; Mongo
// retains all unless we add a TTL index later.
const LogSchema = new Schema<LogRecord>(
  {
    id: { type: String, required: true },
    event: { type: String, required: true },
    payload: { type: Schema.Types.Mixed },
    createdAt: { type: String, required: true },
  },
  { collection: "logs" },
);
LogSchema.index({ id: 1 }, { unique: true });
LogSchema.index({ createdAt: -1 });
export const LogModel = compile<LogRecord>("Log", LogSchema);

const ReportSchema = new Schema<ReportRecord>(
  {
    id: { type: String, required: true },
    reporterId: { type: String, required: true },
    targetUserId: { type: String, required: true },
    planId: { type: String, default: null },
    reason: {
      type: String,
      enum: ["harassment", "spam", "inappropriate", "safety", "other"],
      required: true,
    },
    details: { type: String },
    status: { type: String, enum: ["open", "reviewed"], default: "open" },
    createdAt: { type: String, required: true },
    reviewedAt: { type: String, default: null },
  },
  { collection: "reports" },
);
ReportSchema.index({ id: 1 }, { unique: true });
ReportSchema.index({ status: 1, createdAt: -1 });
export const ReportModel = compile<ReportRecord>("Report", ReportSchema);

// Card images — admin-curated cover art for event cards. Tiny collection, but
// durable so the library survives restarts and isn't tied to a code deploy.
const CardImageSchema = new Schema<CardImageRecord>(
  {
    id: { type: String, required: true },
    url: { type: String, required: true },
    label: { type: String },
    sortOrder: { type: Number, required: true, default: 0 },
    createdAt: { type: String, required: true },
  },
  { collection: "cardImages" },
);
CardImageSchema.index({ id: 1 }, { unique: true });
export const CardImageModel = compile<CardImageRecord>("CardImage", CardImageSchema);

// Communities
const CommunitySchema = new Schema<CommunityRecord>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    coverImage: { type: String, default: null },
    category: {
      type: String,
      // Master InterestTag taxonomy — shared with interests + plan tags.
      enum: ALL_INTERESTS,
      required: true,
    },
    organizerId: { type: String, required: true },
    memberCount: { type: Number, default: 1 },
    creationStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
    isFounding: { type: Boolean, default: false },
    bulletinPermission: { type: String, enum: ["organizer_only", "members"], default: "members" },
    planPostingPermission: { type: String, enum: ["organizer_only", "members"], default: "members" },
    chatEnabled: { type: Boolean, default: true },
    bulletinEnabled: { type: Boolean, default: true },
    bulletinRequiresApproval: { type: Boolean, default: false },
    visibility: { type: String, enum: ["everyone", "members_only"], default: "everyone" },
    screeningQuestion: { type: String, default: null },
    rejectionNote: { type: String, default: null },
    submittedAt: { type: String, required: true },
    reviewedAt: { type: String, default: null },
    reviewedBy: { type: String, default: null },
    createdAt: { type: String, required: true },
  },
  { collection: "communities" },
);
CommunitySchema.index({ id: 1 }, { unique: true });
CommunitySchema.index({ creationStatus: 1 });
CommunitySchema.index({ organizerId: 1 });
export const CommunityModel = compile<CommunityRecord>("Community", CommunitySchema);

// Community members — unique on (communityId, userId).
const CommunityMemberSchema = new Schema<CommunityMemberRecord>(
  {
    id: { type: String, required: true },
    communityId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String, enum: ["organizer", "member"], default: "member" },
    status: { type: String, enum: ["pending", "active"], default: "active" },
    screeningAnswer: { type: String, default: null },
    joinedAt: { type: String, required: true },
  },
  { collection: "communityMembers" },
);
CommunityMemberSchema.index({ id: 1 }, { unique: true });
CommunityMemberSchema.index({ communityId: 1, userId: 1 }, { unique: true });
CommunityMemberSchema.index({ userId: 1 });
export const CommunityMemberModel = compile<CommunityMemberRecord>("CommunityMember", CommunityMemberSchema);

// Community bulletin posts
const CommunityPostSchema = new Schema<CommunityPostRecord>(
  {
    id: { type: String, required: true },
    communityId: { type: String, required: true },
    authorId: { type: String, required: true },
    content: { type: String, default: "" },
    image: { type: String, default: null },
    pinned: { type: Boolean, default: false },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    createdAt: { type: String, required: true },
    deletedAt: { type: String, default: null },
  },
  { collection: "communityPosts" },
);
CommunityPostSchema.index({ id: 1 }, { unique: true });
CommunityPostSchema.index({ communityId: 1, createdAt: -1 });
CommunityPostSchema.index({ communityId: 1, approvalStatus: 1 });
export const CommunityPostModel = compile<CommunityPostRecord>("CommunityPost", CommunityPostSchema);

// Interest Forums — one row per InterestTag (citywide topic boards).
const InterestForumSchema = new Schema<InterestForumRecord>(
  {
    id: { type: String, required: true },
    interestTag: { type: String, enum: ALL_INTERESTS, required: true },
    createdAt: { type: String, required: true },
  },
  { collection: "interestForums" },
);
InterestForumSchema.index({ id: 1 }, { unique: true });
InterestForumSchema.index({ interestTag: 1 }, { unique: true });
export const InterestForumModel = compile<InterestForumRecord>("InterestForum", InterestForumSchema);

// Forum memberships — no UUID `id`; unique on (userId, interestTag). Soft-leave via leftAt.
const ForumMembershipSchema = new Schema<ForumMembershipRecord>(
  {
    userId: { type: String, required: true },
    interestTag: { type: String, enum: ALL_INTERESTS, required: true },
    joinedAt: { type: String, required: true },
    leftAt: { type: String, default: null },
  },
  { collection: "forumMemberships" },
);
ForumMembershipSchema.index({ userId: 1, interestTag: 1 }, { unique: true });
ForumMembershipSchema.index({ interestTag: 1 });
export const ForumMembershipModel = compile<ForumMembershipRecord>(
  "ForumMembership",
  ForumMembershipSchema,
);

// Forum posts
const ForumPostSchema = new Schema<ForumPostRecord>(
  {
    id: { type: String, required: true },
    interestTag: { type: String, enum: ALL_INTERESTS, required: true },
    authorId: { type: String, required: true },
    content: { type: String, required: true },
    imageUrl: { type: String, default: null },
    isSponsored: { type: Boolean, default: false },
    sponsorName: { type: String, default: null },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      required: true,
    },
    createdAt: { type: String, required: true },
    replyCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
  },
  { collection: "forumPosts" },
);
ForumPostSchema.index({ id: 1 }, { unique: true });
ForumPostSchema.index({ interestTag: 1, createdAt: -1 });
ForumPostSchema.index({ approvalStatus: 1 });
export const ForumPostModel = compile<ForumPostRecord>("ForumPost", ForumPostSchema);

// Forum replies (flat thread under a post)
const ForumReplySchema = new Schema<ForumReplyRecord>(
  {
    id: { type: String, required: true },
    postId: { type: String, required: true },
    authorId: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { collection: "forumReplies" },
);
ForumReplySchema.index({ id: 1 }, { unique: true });
ForumReplySchema.index({ postId: 1, createdAt: 1 });
export const ForumReplyModel = compile<ForumReplyRecord>("ForumReply", ForumReplySchema);

// Forum post likes — no UUID `id`; unique on (postId, userId).
const ForumPostLikeSchema = new Schema<ForumPostLikeRecord>(
  {
    postId: { type: String, required: true },
    userId: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { collection: "forumPostLikes" },
);
ForumPostLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });
ForumPostLikeSchema.index({ userId: 1 });
export const ForumPostLikeModel = compile<ForumPostLikeRecord>("ForumPostLike", ForumPostLikeSchema);
