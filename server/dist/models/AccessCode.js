import mongoose from "mongoose";
const AccessCodeSchema = new mongoose.Schema({
    code: { type: String, required: true },
    createdAt: { type: String, required: true },
}, { collection: "accessCodes" });
AccessCodeSchema.index({ code: 1 }, { unique: true });
export const AccessCodeModel = mongoose.models.AccessCode ??
    mongoose.model("AccessCode", AccessCodeSchema);
