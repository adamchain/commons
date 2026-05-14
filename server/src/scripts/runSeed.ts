// One-shot seed runner. Connects to MONGODB_URI, hydrates the snapshot from
// Mongo, runs seedIfEmpty (which is idempotent), reports collection counts,
// then exits. Use this to (re)bootstrap a fresh Mongo cluster without
// starting the HTTP server.
//
// Usage:
//   MONGODB_URI=... SEED_DEMO_ACCOUNTS=1 npx tsx src/scripts/runSeed.ts

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import { hydrateSnapshotFromMongo } from "../hydrate.js";
import { mongoMirror } from "../mongoMirror.js";
import { seedIfEmpty } from "../seed.js";
import {
  ConversationModel,
  MessageModel,
  NeighborhoodModel,
  ParticipationModel,
  PlanModel,
} from "../models/index.js";
import { UserModel } from "../models/User.js";

async function main(): Promise<void> {
  await connectMongo();
  if (!isMongoConnected()) {
    console.error("MONGODB_URI not set / not connected — refusing to seed.");
    process.exit(1);
  }
  console.log("[runSeed] connected, hydrating…");
  await hydrateSnapshotFromMongo();
  console.log("[runSeed] running seedIfEmpty…");
  await seedIfEmpty();

  // Drain background mirror writes — the seed loop kicks them off
  // fire-and-forget; we have to wait before counting or disconnecting.
  console.log("[runSeed] flushing pending mirror writes…");
  await mongoMirror.flushPending();

  const [users, hoods, plans, parts, convos, msgs] = await Promise.all([
    UserModel.countDocuments({}),
    NeighborhoodModel.countDocuments({}),
    PlanModel.countDocuments({}),
    ParticipationModel.countDocuments({}),
    ConversationModel.countDocuments({}),
    MessageModel.countDocuments({}),
  ]);

  console.log("\nMongo counts after seed:");
  console.log(`  users:           ${users}`);
  console.log(`  neighborhoods:   ${hoods}`);
  console.log(`  plans:           ${plans}`);
  console.log(`  participations:  ${parts}`);
  console.log(`  conversations:   ${convos}`);
  console.log(`  messages:        ${msgs}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[runSeed] failed", err);
  process.exit(1);
});
