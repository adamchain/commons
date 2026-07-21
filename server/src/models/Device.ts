import mongoose from "mongoose";
import type { DeviceRecord } from "../store.js";

const DeviceSchema = new mongoose.Schema<DeviceRecord>(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ["ios", "android", "web"], required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: "devices" },
);

DeviceSchema.index({ id: 1 }, { unique: true });
DeviceSchema.index({ token: 1 }, { unique: true });
DeviceSchema.index({ userId: 1 });

export const DeviceModel =
  mongoose.models.Device ?? mongoose.model<DeviceRecord>("Device", DeviceSchema);
