import mongoose from "mongoose";
import type { RelationshipRecord } from "../store.js";

const RelationshipSchema = new mongoose.Schema<RelationshipRecord>(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    targetId: { type: String, required: true },
    kind: { type: String, required: true, enum: ["network", "community"] },
    source: {
      type: String,
      required: true,
      enum: ["post_plan_modal", "profile_friend_add", "seed", "other"],
    },
    createdAt: { type: String, required: true },
  },
  { collection: "relationships" },
);

RelationshipSchema.index({ id: 1 }, { unique: true });
RelationshipSchema.index({ userId: 1, kind: 1 });
RelationshipSchema.index({ targetId: 1, kind: 1 });
RelationshipSchema.index(
  { userId: 1, targetId: 1, kind: 1 },
  { unique: true },
);

export const RelationshipModel =
  mongoose.models.Relationship ??
  mongoose.model<RelationshipRecord>("Relationship", RelationshipSchema);
