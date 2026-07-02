import mongoose from "mongoose";
import type { UserRecord } from "../store.js";

const UserSchema = new mongoose.Schema<UserRecord>(
  {
    id: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    accountSource: {
      type: String,
      enum: ["verify", "seed"],
      default: "verify",
    },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    bio: { type: String, default: "" },
    ageRange: { type: String, default: null },
    ageConfirmedAt: { type: String, default: null },
    neighborhoodId: { type: String, default: null },
    neighborhoodIds: { type: [String], default: [] },
    interests: [{ type: String }],
    avatarSeed: { type: String, required: true },
    avatarStyle: {
      type: String,
      enum: ["avataaars", "big-smile", "fun-emoji"],
      required: true,
    },
    avatarPhotoDataUrl: { type: String },
    avatarParams: { type: String },
    onboardingComplete: { type: Boolean, required: true },
    createdAt: { type: String, required: true },
    networkIds: { type: [String], default: undefined },
    incomingNetworkRequests: { type: [String], default: undefined },
    savedPlanIds: { type: [String], default: undefined },
    dismissedNetworkPromptPlanIds: { type: [String], default: undefined },
    socialLinks: { type: { instagram: { type: String }, tiktok: { type: String } }, default: undefined },
    guidelinesAcknowledgedAt: { type: String, default: null },
    termsAcceptedAt: { type: String, default: null },
    privacyAcceptedAt: { type: String, default: null },
    notificationPrefs: {
      type: {
        someoneJoinedYourPlan: { type: Boolean },
        planTomorrow: { type: Boolean },
        planInTwoHours: { type: Boolean },
        newGroupChatMessage: { type: Boolean },
        postPlanNetworkNudge: { type: Boolean },
        planCancellation: { type: Boolean },
        weeklyFridayDigest: { type: Boolean },
        lookingForRecovery: { type: Boolean },
      },
      default: undefined,
    },
  },
  { collection: "users" },
);

UserSchema.index({ id: 1 }, { unique: true });
UserSchema.index({ phoneNumber: 1 }, { unique: true });

export const UserModel =
  mongoose.models.User ?? mongoose.model<UserRecord>("User", UserSchema);
