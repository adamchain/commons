// One-off: delete all plans (+ participations, conversations, messages) whose
// creator has accountSource === "seed". Safe to run against prod — real user
// plans are untouched.
//
// Usage:
//   npx tsx src/scripts/deleteSeedPlans.ts

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import {
  ConversationModel,
  MessageModel,
  ParticipationModel,
  PlanModel,
} from "../models/index.js";
import { UserModel } from "../models/User.js";

async function main(): Promise<void> {
  await connectMongo();
  if (!isMongoConnected()) {
    console.error("MongoDB not connected — check MONGODB_URI.");
    process.exit(1);
  }

  const seedUsers = await UserModel.find({ accountSource: "seed" }, { _id: 0, id: 1 }).lean();
  const seedIds = seedUsers.map((u) => u.id as string);
  console.log(`[deleteSeedPlans] found ${seedIds.length} seed users`);

  if (seedIds.length === 0) {
    console.log("[deleteSeedPlans] nothing to do.");
    await mongoose.disconnect();
    return;
  }

  const seedPlans = await PlanModel.find({ creatorId: { $in: seedIds } }, { _id: 0, id: 1 }).lean();
  const planIds = seedPlans.map((p) => p.id as string);
  console.log(`[deleteSeedPlans] found ${planIds.length} seed plans`);

  if (planIds.length === 0) {
    console.log("[deleteSeedPlans] no seed plans found.");
    await mongoose.disconnect();
    return;
  }

  const convos = await ConversationModel.find({ planId: { $in: planIds } }, { _id: 0, id: 1 }).lean();
  const convoIds = convos.map((c) => c.id as string);

  const [delMsgs, delConvos, delParts, delPlans] = await Promise.all([
    MessageModel.deleteMany({ conversationId: { $in: convoIds } }),
    ConversationModel.deleteMany({ planId: { $in: planIds } }),
    ParticipationModel.deleteMany({ planId: { $in: planIds } }),
    PlanModel.deleteMany({ creatorId: { $in: seedIds } }),
  ]);

  console.log(
    `[deleteSeedPlans] deleted: ${delPlans.deletedCount} plans, ` +
    `${delParts.deletedCount} participations, ` +
    `${delConvos.deletedCount} conversations, ` +
    `${delMsgs.deletedCount} messages`
  );

  await mongoose.disconnect();
  console.log("[deleteSeedPlans] done.");
}

main().catch((err) => {
  console.error("[deleteSeedPlans] failed", err);
  process.exit(1);
});
