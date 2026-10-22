import { Schema, model } from "mongoose";
const participationSchema = new Schema({
    plan: { type: Schema.Types.ObjectId, ref: "Plan", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    state: { type: String, enum: ["interested", "going"], required: true },
    updatedAt: { type: Date, default: Date.now },
});
participationSchema.index({ plan: 1, user: 1 }, { unique: true });
export const Participation = model("Participation", participationSchema);
