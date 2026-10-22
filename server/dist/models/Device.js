import mongoose from "mongoose";
const DeviceSchema = new mongoose.Schema({
    id: { type: String, required: true },
    userId: { type: String, required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ["ios", "android", "web"], required: true },
    apnsEnv: { type: String, enum: ["sandbox", "production"], required: false },
    updatedAt: { type: String, required: true },
}, { collection: "devices" });
DeviceSchema.index({ id: 1 }, { unique: true });
DeviceSchema.index({ token: 1 }, { unique: true });
DeviceSchema.index({ userId: 1 });
export const DeviceModel = mongoose.models.Device ?? mongoose.model("Device", DeviceSchema);
