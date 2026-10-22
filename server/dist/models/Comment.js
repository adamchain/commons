import { Schema, model } from "mongoose";
const commentSchema = new Schema({
    plan: { type: Schema.Types.ObjectId, ref: "Plan", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    body: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
});
export const Comment = model("Comment", commentSchema);
