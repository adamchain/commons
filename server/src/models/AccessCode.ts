import mongoose from "mongoose";

/** Reusable signup access code. Not a one-time personal invite. */
export interface AccessCodeRecord {
  code: string;
  createdAt: string;
}

const AccessCodeSchema = new mongoose.Schema<AccessCodeRecord>(
  {
    code: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { collection: "accessCodes" },
);

AccessCodeSchema.index({ code: 1 }, { unique: true });

export const AccessCodeModel =
  mongoose.models.AccessCode ??
  mongoose.model<AccessCodeRecord>("AccessCode", AccessCodeSchema);
