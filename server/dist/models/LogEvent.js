import { Schema, model } from "mongoose";
const logEventSchema = new Schema({
    event: {
        type: String,
        enum: ["plan_created", "participation_changed", "plan_viewed", "comment_posted"],
        required: true,
        index: true,
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
});
export const LogEvent = model("LogEvent", logEventSchema);
