// Wipe every plan, participation, conversation, and message from Mongo, then
// seed 5 fresh mock plans using the existing mock users (03xx phone range).
//
// Usage:
//   MONGODB_URI=... npx tsx src/scripts/resetPlans.ts

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import { hydrateSnapshotFromMongo } from "../hydrate.js";
import { mongoMirror } from "../mongoMirror.js";
import { store } from "../store.js";
import type { InterestTag } from "../types/shared.js";
import { findUserByPhone } from "../userRepo.js";
import {
  ConversationModel,
  MessageModel,
  ParticipationModel,
  PlanModel,
} from "../models/index.js";

function phoneForIndex(i: number): string {
  return `+1555555${String(300 + i).padStart(4, "0")}`;
}

function dateForOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoEndForPlan(date: string, time: string, hoursAfterStart: number): string {
  const [h, m] = time.split(":").map(Number);
  const start = new Date(date + "T00:00:00.000Z");
  start.setUTCHours(h!, m!, 0, 0);
  return new Date(start.getTime() + hoursAfterStart * 3600 * 1000).toISOString();
}

interface MockPlan {
  creatorIndex: number;
  title: string;
  neighborhoodName: string;
  location: { name: string; address: string; lat?: number; lng?: number };
  daysFromNow: number;
  time: string;
  isFlexibleTime: boolean;
  endHoursAfterStart?: number;
  tags: InterestTag[];
  description: string;
  hostEmoji: string;
  goingIndexes: number[];
  interestedIndexes: number[];
  planKind?: "standard" | "looking_for";
}

const PLANS: MockPlan[] = [
  {
    creatorIndex: 0,
    title: "Morning run — Schuylkill Banks",
    neighborhoodName: "Rittenhouse",
    location: { name: "Schuylkill Banks Trailhead", address: "2500 Walnut St, Philadelphia, PA", lat: 39.9513, lng: -75.182 },
    daysFromNow: 2, time: "07:30", isFlexibleTime: false, endHoursAfterStart: 1,
    tags: ["workouts", "workouts"],
    description: "Easy 4 miles along the river. All paces welcome, coffee after.",
    hostEmoji: "🏃",
    goingIndexes: [0, 5, 10],
    interestedIndexes: [15, 18],
  },
  {
    creatorIndex: 1,
    title: "Live music at Johnny Brenda's",
    neighborhoodName: "Fishtown",
    location: { name: "Johnny Brenda's", address: "1201 N Frankford Ave, Philadelphia, PA", lat: 39.9714, lng: -75.1339 },
    daysFromNow: 4, time: "20:00", isFlexibleTime: false, endHoursAfterStart: 3,
    tags: ["music", "food"],
    description: "Local openers then the headliner. Grabbing a table upstairs — the more the merrier.",
    hostEmoji: "🎶",
    goingIndexes: [1, 7, 11],
    interestedIndexes: [4, 17],
  },
  {
    creatorIndex: 2,
    title: "Gallery hop + coffee, Old City",
    neighborhoodName: "Old City",
    location: { name: "Old City Arts District", address: "N 3rd St, Philadelphia, PA" },
    daysFromNow: 6, time: "13:00", isFlexibleTime: false, endHoursAfterStart: 3,
    tags: ["creative", "coffee"],
    description: "Three galleries, one good coffee stop in between. Slow afternoon, no agenda.",
    hostEmoji: "🎨",
    goingIndexes: [2, 14, 16],
    interestedIndexes: [6, 10],
  },
  {
    creatorIndex: 8,
    title: "Sunday brunch at Sabrina's",
    neighborhoodName: "Graduate Hospital",
    location: { name: "Sabrina's Café", address: "1804 Callowhill St, Philadelphia, PA" },
    daysFromNow: 8, time: "11:00", isFlexibleTime: false, endHoursAfterStart: 2,
    tags: ["food", "coffee"],
    description: "Putting our name in early — always a wait but worth it. Come hungry.",
    hostEmoji: "🥞",
    goingIndexes: [8, 12, 4],
    interestedIndexes: [18, 3],
  },
  {
    creatorIndex: 15,
    title: "Looking for a running partner",
    neighborhoodName: "Fairmount",
    location: { name: "", address: "" },
    daysFromNow: 3, time: "", isFlexibleTime: true,
    tags: ["workouts", "workouts"],
    description: "Building toward a 10k, 9–10 min/mi. Mornings work best — say hi if you're around.",
    hostEmoji: "🏃",
    goingIndexes: [15],
    interestedIndexes: [0, 5],
    planKind: "looking_for",
  },
];

async function main(): Promise<void> {
  await connectMongo();
  if (!isMongoConnected()) {
    console.error("MONGODB_URI not set / not connected — refusing to run.");
    process.exit(1);
  }

  console.log("[resetPlans] connected, hydrating snapshot…");
  await hydrateSnapshotFromMongo();

  // --- Wipe existing plans and related data from Mongo -------------------
  const [delPlans, delParts, delConvos, delMsgs] = await Promise.all([
    PlanModel.deleteMany({}),
    ParticipationModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
  ]);
  console.log(
    `[resetPlans] deleted: ${delPlans.deletedCount} plans, ` +
    `${delParts.deletedCount} participations, ` +
    `${delConvos.deletedCount} conversations, ` +
    `${delMsgs.deletedCount} messages`
  );

  // Re-hydrate so the in-memory snapshot reflects the now-empty Mongo state
  await hydrateSnapshotFromMongo();

  const hoodIdByName = new Map<string, string>();
  for (const h of store.listNeighborhoods()) hoodIdByName.set(h.name, h.id);
  if (hoodIdByName.size === 0) {
    console.error("[resetPlans] no neighborhoods in store — run base seed first.");
    process.exit(1);
  }

  // --- Seed 5 fresh plans ------------------------------------------------
  let created = 0;
  for (const mp of PLANS) {
    const creator = await findUserByPhone(phoneForIndex(mp.creatorIndex));
    if (!creator) {
      console.warn(`[resetPlans] mock user index ${mp.creatorIndex} not found — run seedMock first.`);
      continue;
    }
    const neighborhoodId = hoodIdByName.get(mp.neighborhoodName);
    if (!neighborhoodId) {
      console.warn(`[resetPlans] neighborhood "${mp.neighborhoodName}" not found — skipping.`);
      continue;
    }

    const date = dateForOffset(mp.daysFromNow);
    const planKind = mp.planKind ?? "standard";
    const plan = store.createPlan({
      creatorId: creator.id,
      title: mp.title,
      neighborhoodId,
      location: mp.location.name
        ? mp.location
        : { name: "Flexible location", address: "Flexible location" },
      date,
      time: mp.time,
      isFlexibleTime: mp.isFlexibleTime,
      isFlexibleLocation: planKind === "looking_for" && !mp.location.name,
      endTime:
        mp.endHoursAfterStart && !mp.isFlexibleTime
          ? isoEndForPlan(date, mp.time, mp.endHoursAfterStart)
          : undefined,
      tags: mp.tags,
      description: mp.description,
      hostEmoji: mp.hostEmoji,
      planKind,
      visibility: "everyone",
      visibilityCommunityTag: null,
      isRecurring: false,
      lockedAt: null,
    });
    created++;

    const goingIds: string[] = [];
    for (const idx of mp.goingIndexes) {
      const u = await findUserByPhone(phoneForIndex(idx));
      if (u) { store.upsertParticipation(plan.id, u.id, "going"); goingIds.push(u.id); }
    }
    for (const idx of mp.interestedIndexes) {
      const u = await findUserByPhone(phoneForIndex(idx));
      if (u) store.upsertParticipation(plan.id, u.id, "interested");
    }

    if (goingIds.length > 0) {
      store.ensureGroupConversation(plan.id, [creator.id, ...goingIds]);
    }

    console.log(`[resetPlans]  + "${mp.title}"`);
  }

  console.log(`[resetPlans] flushing ${created} new plans to Mongo…`);
  await mongoMirror.flushPending();

  const [plans, parts, convos] = await Promise.all([
    PlanModel.countDocuments({}),
    ParticipationModel.countDocuments({}),
    ConversationModel.countDocuments({}),
  ]);
  console.log("\nMongo totals after reset:");
  console.log(`  plans:           ${plans}`);
  console.log(`  participations:  ${parts}`);
  console.log(`  conversations:   ${convos}`);

  await mongoose.disconnect();
  console.log("[resetPlans] done.");
}

main().catch((err) => {
  console.error("[resetPlans] failed", err);
  process.exit(1);
});
