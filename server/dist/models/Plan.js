import { Schema, model } from "mongoose";
const allowedTags = ["coffee", "workout", "social", "outdoors", "events"];
const planSchema = new Schema({
    creator: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    location: {
        name: { type: String, required: true, trim: true },
        address: { type: String, required: true, trim: true },
    },
    date: { type: Date, required: true, index: true },
    time: { type: String, required: true, trim: true },
    isFlexibleTime: { type: Boolean, default: false },
    tags: [{ type: String, enum: allowedTags, required: true }],
    description: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
});
export const Plan = model("Plan", planSchema);
