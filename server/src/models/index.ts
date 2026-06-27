// Centralized Mongoose models for everything beyond `User` (which has its own
// file). One module to keep schemas + indexes in one place and to avoid
// 9 nearly-identical boilerplate files.
//
// Each record uses our own `id` field (UUID string) — not Mongo's `_id` — so
// the existing in-memory `store` and the Mongo source-of-truth share keys.
// All `findOne({ id })` lookups are O(1) via the unique index.

import mongoose, { Schema, type Model } from "mongoose";
import type {
  CardImageRecord,
  ConversationRecord,
  DeclineRecord,
  DropoutRecord,
  FeedbackRecord,
  LogRecord,
  MessageRecord,
  NeighborhoodRecord,
  ParticipationRecord,
  PlanRecord,
  PlanSuggestionRecord,
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
    isFlexibleLocation: { type: Boolean, default: false },
    endTime: { type: String },
    tags: { type: [String], default: [] },
    description: { type: String },
    hostEmoji: { type: String, default: "✨" },
    planKind: { type: String, enum: ["standard", "looking_for"], default: "standard" },
    visibility: { type: String, enum: ["everyone", "community", "network"], default: "everyone" },
    visibilityCommunityTag: { type: String, default: null },
    communityId: { type: String, default: null },
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
    planId: { type: String, required: true },
    type: { type: String, enum: ["group", "dm"], required: true },
    participantIds: { type: [String], default: [] },
    createdAt: { type: String, required: true },
    lastMessageAt: { type: String, required: true },
  },
  { collection: "conversations" },
);
ConversationSchema.index({ id: 1 }, { unique: true });
ConversationSchema.index({ planId: 1, type: 1 });
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
