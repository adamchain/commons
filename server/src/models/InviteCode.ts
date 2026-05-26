import mongoose from "mongoose";
import type { InviteCodeRecord } from "../store.js";

const InviteCodeSchema = new mongoose.Schema<InviteCodeRecord>(
  {
    id: { type: String, required: true },
    code: { type: String, required: true },
    ownerUserId: { type: String, required: true },
    redeemedByUserId: { type: String, default: null },
    redeemedAt: { type: String, default: null },
    createdAt: { type: String, required: true },
  },
  { collection: "inviteCodes" },
);

InviteCodeSchema.index({ id: 1 }, { unique: true });
InviteCodeSchema.index({ code: 1 }, { unique: true });
InviteCodeSchema.index({ ownerUserId: 1 });

export const InviteCodeModel =
  mongoose.models.InviteCode ??
  mongoose.model<InviteCodeRecord>("InviteCode", InviteCodeSchema);
