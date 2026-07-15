import mongoose from "mongoose";
import type { NotificationRecord } from "../store.js";

const NotificationSchema = new mongoose.Schema<NotificationRecord>(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    kind: { type: String, required: true },
    body: { type: String, required: true },
    planId: { type: String },
    conversationId: { type: String },
    profileUserId: { type: String },
    communityId: { type: String },
    dedupKey: { type: String, required: true },
    createdAt: { type: String, required: true },
    readAt: { type: String, default: null },
  },
  { collection: "notifications" },
);

NotificationSchema.index({ id: 1 }, { unique: true });
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ dedupKey: 1 }, { unique: true });

export const NotificationModel =
  mongoose.models.Notification ?? mongoose.model<NotificationRecord>("Notification", NotificationSchema);
