// Standalone mock-data seeder. Adds 20 mock users + a batch of mock plans
// (events), participations, and group chats to whatever Mongo cluster
// MONGODB_URI points at. Safe to run against an existing DB — it does NOT
// wipe anything, uses a dedicated phone range (+1 555-555-03xx) so it never
// collides with the built-in demo seed (01xx / 02xx), and is idempotent:
// re-running updates the same users and skips plans that already exist.
//
// Usage:
//   MONGODB_URI=... npx tsx src/scripts/seedMock.ts
//
// (No SEED_DEMO_ACCOUNTS gate — running this script IS the opt-in.)

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import { hydrateSnapshotFromMongo } from "../hydrate.js";
import { mongoMirror } from "../mongoMirror.js";
import { store } from "../store.js";
import type { InterestTag } from "../types/shared.js";
import { createUser, findUserByPhone, updateUser } from "../userRepo.js";
import {
  ConversationModel,
  MessageModel,
  ParticipationModel,
  PlanModel,
} from "../models/index.js";
import { UserModel } from "../models/User.js";

// ---------------------------------------------------------------------------
// Mock users — 20 of them, phone tails 0300..0319 so they live in their own
// block away from the demo seed.
// ---------------------------------------------------------------------------

interface MockUser {
  firstName: string;
  neighborhoodName: string; // matched against store neighborhoods by display name
  interests: InterestTag[];
}

const MOCK_USERS: MockUser[] = [
  { firstName: "Maya", neighborhoodName: "Rittenhouse", interests: ["coffee", "workouts", "workouts"] },
  { firstName: "Devon", neighborhoodName: "Fishtown", interests: ["music", "food", "events"] },
  { firstName: "Priya", neighborhoodName: "Center City", interests: ["creative", "cowork", "workouts"] },
  { firstName: "Marcus", neighborhoodName: "South Philly", interests: ["workouts", "workouts", "moms"] },
  { firstName: "Sofia", neighborhoodName: "Old City", interests: ["creative", "events", "food"] },
  { firstName: "Liam", neighborhoodName: "Fairmount", interests: ["workouts", "workouts", "coffee"] },
  { firstName: "Aisha", neighborhoodName: "West Philly", interests: ["creative", "creative", "music"] },
  { firstName: "Ethan", neighborhoodName: "Northern Liberties", interests: ["music", "drinks", "events"] },
  { firstName: "Camila", neighborhoodName: "Graduate Hospital", interests: ["workouts", "coffee", "food"] },
  { firstName: "Noah", neighborhoodName: "Manayunk", interests: ["workouts", "moms", "workouts"] },
  { firstName: "Zoe", neighborhoodName: "Rittenhouse", interests: ["workouts", "creative", "coffee"] },
  { firstName: "Andre", neighborhoodName: "Fishtown", interests: ["music", "creative", "creative"] },
  { firstName: "Leila", neighborhoodName: "Center City", interests: ["food", "coffee", "events"] },
  { firstName: "Jonas", neighborhoodName: "South Philly", interests: ["workouts", "events", "workouts"] },
  { firstName: "Nina", neighborhoodName: "Old City", interests: ["creative", "workouts", "creative"] },
  { firstName: "Omar", neighborhoodName: "Fairmount", interests: ["workouts", "coffee", "workouts"] },
  { firstName: "Bella", neighborhoodName: "West Philly", interests: ["creative", "events", "food"] },
  { firstName: "Caleb", neighborhoodName: "Northern Liberties", interests: ["music", "drinks", "coffee"] },
  { firstName: "Yara", neighborhoodName: "Graduate Hospital", interests: ["workouts", "workouts", "moms"] },
  { firstName: "Felix", neighborhoodName: "Manayunk", interests: ["workouts", "workouts", "events"] },
];

function phoneForIndex(i: number): string {
  return `+1555555${String(300 + i).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Mock plans (events). Each references a creator + going/interested users by
// mock-user index (0..19) so we don't have to hardcode phone strings twice.
// ---------------------------------------------------------------------------

interface MockPlan {
  creator: number;
  title: string;
  neighborhoodName: string;
  location: { name: string; address: string; lat?: number; lng?: number };
  daysFromNow: number;
  time: string; // "HH:MM" or "Flexible"
  isFlexibleTime: boolean;
  endHoursAfterStart?: number;
  tags: InterestTag[];
  description: string;
  hostEmoji: string;
  going: number[];
  interested: number[];
  messages: Array<{ sender: number; body: string; minutesAgo: number }>;
  planKind?: "standard" | "looking_for";
}

const MOCK_PLANS: MockPlan[] = [
  {
    creator: 0, title: "Saturday morning run club", neighborhoodName: "Rittenhouse",
    location: { name: "Rittenhouse Square", address: "1800 Walnut St, Philadelphia, PA", lat: 39.949, lng: -75.171 },
    daysFromNow: 2, time: "08:00", isFlexibleTime: false, endHoursAfterStart: 1,
    tags: ["workouts", "workouts"], description: "Easy 3-4 miles, coffee after. All paces welcome.", hostEmoji: "🏃",
    going: [0, 5, 15], interested: [10, 18],
    messages: [
      { sender: 5, body: "What pace are we thinking?", minutesAgo: 180 },
      { sender: 0, body: "Conversational — 9-10 min/mi. No one gets dropped.", minutesAgo: 120 },
    ],
  },
  {
    creator: 1, title: "Live show at Johnny Brenda's", neighborhoodName: "Fishtown",
    location: { name: "Johnny Brenda's", address: "1201 N Frankford Ave, Philadelphia, PA", lat: 39.9714, lng: -75.1339 },
    daysFromNow: 4, time: "20:00", isFlexibleTime: false, endHoursAfterStart: 3,
    tags: ["music", "food"], description: "Local openers then the headliner. Grab dinner downstairs first.", hostEmoji: "🎶",
    going: [1, 7, 11, 17], interested: [4, 12],
    messages: [{ sender: 7, body: "Down for dinner beforehand!", minutesAgo: 300 }],
  },
  {
    creator: 2, title: "Gallery hop + coffee", neighborhoodName: "Center City",
    location: { name: "Center City galleries", address: "Walnut St, Philadelphia, PA" },
    daysFromNow: 6, time: "Flexible", isFlexibleTime: true,
    tags: ["creative", "coffee"], description: "Slow afternoon drifting between a few shows. Coffee stop midway.", hostEmoji: "🎨",
    going: [2, 14], interested: [4, 16, 10], messages: [],
  },
  {
    creator: 3, title: "Pickup soccer at FDR", neighborhoodName: "South Philly",
    location: { name: "FDR Park", address: "1500 Pattison Ave, Philadelphia, PA", lat: 39.9, lng: -75.18 },
    daysFromNow: 3, time: "17:30", isFlexibleTime: false, endHoursAfterStart: 2,
    tags: ["workouts", "events"], description: "Casual game, need a few more for even sides. Beginners welcome.", hostEmoji: "⚽",
    going: [3, 13, 9, 19], interested: [5], messages: [],
  },
  {
    creator: 4, title: "First Friday gallery crawl", neighborhoodName: "Old City",
    location: { name: "Old City Arts District", address: "N 3rd St & Market St, Philadelphia, PA" },
    daysFromNow: 8, time: "18:00", isFlexibleTime: false, endHoursAfterStart: 3,
    tags: ["creative", "events"], description: "Loose route, meet at the flagpole then wander. Drinks after.", hostEmoji: "🖼️",
    going: [4, 16, 14], interested: [2, 8],
    messages: [{ sender: 16, body: "Meeting spot still the flagpole?", minutesAgo: 60 }],
  },
  {
    creator: 5, title: "Long run — Schuylkill Banks", neighborhoodName: "Fairmount",
    location: { name: "Schuylkill Banks Trailhead", address: "2500 Walnut St, Philadelphia, PA", lat: 39.9513, lng: -75.182 },
    daysFromNow: 5, time: "07:00", isFlexibleTime: false, endHoursAfterStart: 2,
    tags: ["workouts", "workouts"], description: "8 miles out and back. Regroup at the bridge.", hostEmoji: "🏃",
    going: [5, 0, 15], interested: [10], messages: [],
  },
  {
    creator: 6, title: "Thrifting on Baltimore Ave", neighborhoodName: "West Philly",
    location: { name: "Baltimore Ave Thrift Row", address: "4400 Baltimore Ave, Philadelphia, PA", lat: 39.9494, lng: -75.2098 },
    daysFromNow: 7, time: "13:00", isFlexibleTime: false, endHoursAfterStart: 3,
    tags: ["creative", "creative"], description: "Three shops, slow afternoon, iced coffee somewhere in there.", hostEmoji: "🧥",
    going: [6, 11, 16], interested: [14], messages: [],
  },
  {
    creator: 7, title: "Beer garden meetup", neighborhoodName: "Northern Liberties",
    location: { name: "The Garden at NL", address: "990 Spring Garden St, Philadelphia, PA" },
    daysFromNow: 1, time: "17:00", isFlexibleTime: false, endHoursAfterStart: 3,
    tags: ["food", "music"], description: "Big shared tables — easy to merge with friends of friends.", hostEmoji: "🍻",
    going: [7, 1, 12, 17], interested: [4], messages: [],
  },
  {
    creator: 8, title: "Morning yoga + walk", neighborhoodName: "Graduate Hospital",
    location: { name: "Schuylkill River Park", address: "300 S 25th St, Philadelphia, PA", lat: 39.949, lng: -75.181 },
    daysFromNow: 4, time: "09:00", isFlexibleTime: true, endHoursAfterStart: 1,
    tags: ["workouts", "workouts"], description: "Gentle flow then a loop around the park. Bring a mat.", hostEmoji: "🧘",
    going: [8, 18, 10], interested: [0, 2], messages: [],
  },
  {
    creator: 9, title: "Dog walk on the towpath", neighborhoodName: "Manayunk",
    location: { name: "Manayunk Tow Path", address: "Manayunk, Philadelphia, PA", lat: 40.0253, lng: -75.2214 },
    daysFromNow: 2, time: "16:30", isFlexibleTime: false, endHoursAfterStart: 1,
    tags: ["moms", "workouts"], description: "Bring your pup or just come hang. Easy pace.", hostEmoji: "🐕",
    going: [9, 19, 3], interested: [18], messages: [],
  },
  {
    creator: 10, title: "Co-work morning at Ultimo", neighborhoodName: "Rittenhouse",
    location: { name: "Ultimo Coffee", address: "2149 Catharine St, Philadelphia, PA" },
    daysFromNow: 3, time: "09:30", isFlexibleTime: false, endHoursAfterStart: 2,
    tags: ["coffee"], description: "Heads-down for two hours, lunch after if anyone's around.", hostEmoji: "💻",
    going: [10, 0, 2], interested: [12, 8], messages: [],
  },
  {
    creator: 11, title: "Looking for — concert buddy Friday", neighborhoodName: "Fishtown",
    location: { name: "", address: "" },
    daysFromNow: 5, time: "Flexible", isFlexibleTime: true,
    tags: ["music"], description: "Have an extra ticket to the show at Union Transfer — say hi if you'd be down.", hostEmoji: "🎟️",
    going: [11], interested: [1, 17], messages: [], planKind: "looking_for",
  },
  {
    creator: 12, title: "Sunday brunch crew", neighborhoodName: "Center City",
    location: { name: "Sabrina's Café", address: "1804 Callowhill St, Philadelphia, PA" },
    daysFromNow: 6, time: "11:30", isFlexibleTime: false, endHoursAfterStart: 2,
    tags: ["food", "coffee"], description: "Always a wait — more fun together. Putting our name in early.", hostEmoji: "🥞",
    going: [12, 7, 17, 4], interested: [1], messages: [],
  },
  {
    creator: 13, title: "Bike along MLK Drive", neighborhoodName: "South Philly",
    location: { name: "Lloyd Hall trailhead", address: "1 Boathouse Row, Philadelphia, PA", lat: 39.9665, lng: -75.18 },
    daysFromNow: 4, time: "08:30", isFlexibleTime: false, endHoursAfterStart: 2,
    tags: ["workouts", "workouts"], description: "Road's closed to cars — easy 10 mile out and back.", hostEmoji: "🚲",
    going: [13, 3, 9], interested: [5, 19], messages: [],
  },
  {
    creator: 14, title: "Pottery drop-in", neighborhoodName: "Old City",
    location: { name: "The Clay Studio", address: "1425 N American St, Philadelphia, PA" },
    daysFromNow: 9, time: "18:30", isFlexibleTime: false, endHoursAfterStart: 2,
    tags: ["creative", "workouts"], description: "Beginner-friendly throw-in. No experience needed.", hostEmoji: "🏺",
    going: [14, 2, 16], interested: [6], messages: [],
  },
  {
    creator: 15, title: "Looking for — running partner", neighborhoodName: "Fairmount",
    location: { name: "", address: "" },
    daysFromNow: 3, time: "Flexible", isFlexibleTime: true,
    tags: ["workouts", "workouts"], description: "Building toward a 10k, 9-10 min/mi pace. Mornings work best.", hostEmoji: "🏃",
    going: [15], interested: [0, 5, 10], messages: [], planKind: "looking_for",
  },
  {
    creator: 16, title: "Comedy show at Helium", neighborhoodName: "Center City",
    location: { name: "Helium Comedy Club", address: "2031 Sansom St, Philadelphia, PA" },
    daysFromNow: 7, time: "20:00", isFlexibleTime: false, endHoursAfterStart: 2,
    tags: ["creative", "events", "music"], description: "Friday late show — grabbing a group table.", hostEmoji: "🎤",
    going: [16, 4, 6, 14], interested: [2], messages: [],
  },
  {
    creator: 17, title: "Rooftop drinks at Cira Green", neighborhoodName: "West Philly",
    location: { name: "Cira Green Rooftop", address: "129 S 30th St, Philadelphia, PA" },
    daysFromNow: 5, time: "18:30", isFlexibleTime: false, endHoursAfterStart: 3,
    tags: ["food", "music"], description: "Rooftop park with skyline views. BYO snacks welcome.", hostEmoji: "🍹",
    going: [17, 1, 7, 11], interested: [12], messages: [],
  },
  {
    creator: 18, title: "Sunset walk + Penn Treaty Park", neighborhoodName: "Graduate Hospital",
    location: { name: "Penn Treaty Park", address: "1199 N Delaware Ave, Philadelphia, PA" },
    daysFromNow: 2, time: "19:00", isFlexibleTime: false, endHoursAfterStart: 1,
    tags: ["workouts", "workouts"], description: "Best skyline view in the city. Easy 30 minute stroll.", hostEmoji: "🌅",
    going: [18, 8, 10], interested: [0], messages: [],
  },
  {
    creator: 19, title: "Trail run at Wissahickon", neighborhoodName: "Manayunk",
    location: { name: "Wissahickon Valley Park", address: "Forbidden Dr, Philadelphia, PA" },
    daysFromNow: 6, time: "09:00", isFlexibleTime: false, endHoursAfterStart: 2,
    tags: ["workouts", "workouts", "events"], description: "Forbidden Drive loop. Trail shoes nice but not required.", hostEmoji: "🌲",
    going: [19, 9, 5], interested: [15, 13],
    messages: [{ sender: 9, body: "Parking by the trailhead or street?", minutesAgo: 240 }],
  },
];

// ---------------------------------------------------------------------------
// Date / time helpers (mirrors seed.ts).
// ---------------------------------------------------------------------------

function dateForOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoEndForPlan(date: string, time: string, hoursAfterStart: number | undefined): string | undefined {
  if (!hoursAfterStart) return undefined;
  if (!/^\d{2}:\d{2}$/.test(time)) return undefined;
  const [h, m] = time.split(":").map(Number);
  const start = new Date(date + "T00:00:00.000Z");
  start.setUTCHours(h, m, 0, 0);
  const end = new Date(start.getTime() + hoursAfterStart * 60 * 60 * 1000);
  return end.toISOString();
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await connectMongo();
  if (!isMongoConnected()) {
    console.error("MONGODB_URI not set / not connected — refusing to seed.");
    process.exit(1);
  }
  console.log("[seedMock] connected, hydrating snapshot…");
  await hydrateSnapshotFromMongo();

  // Map neighborhood display name -> id from whatever's already in the store.
  const hoodIdByName = new Map<string, string>();
  for (const h of store.listNeighborhoods()) hoodIdByName.set(h.name, h.id);
  if (hoodIdByName.size === 0) {
    console.error(
      "[seedMock] no neighborhoods found in the store. Run the base seed first " +
        "(SEED_DEMO_ACCOUNTS=1 npx tsx src/scripts/runSeed.ts) so neighborhoods exist."
    );
    process.exit(1);
  }

  // --- Users -------------------------------------------------------------
  const userIdByIndex = new Map<number, string>();
  let createdUsers = 0;
  for (let i = 0; i < MOCK_USERS.length; i++) {
    const m = MOCK_USERS[i]!;
    const phone = phoneForIndex(i);
    const neighborhoodId = hoodIdByName.get(m.neighborhoodName) ?? null;
    if (!neighborhoodId) {
      console.warn(`[seedMock] no neighborhood "${m.neighborhoodName}" for ${m.firstName} — leaving unset.`);
    }
    let user = await findUserByPhone(phone);
    if (!user) {
      user = await createUser(phone, { accountSource: "seed" });
      createdUsers++;
    }
    await updateUser(user.id, {
      accountSource: "seed",
      firstName: m.firstName,
      neighborhoodId,
      neighborhoodIds: neighborhoodId ? [neighborhoodId] : [],
      interests: m.interests,
      avatarSeed: `${m.firstName.toLowerCase()}-mock-${i}`,
      avatarStyle: "avataaars",
      onboardingComplete: true,
    });
    userIdByIndex.set(i, user.id);
  }
  console.log(`[seedMock] users: ${MOCK_USERS.length} total (${createdUsers} new, ${MOCK_USERS.length - createdUsers} updated)`);

  // --- Plans -------------------------------------------------------------
  let createdPlans = 0;
  let skippedPlans = 0;
  for (const mp of MOCK_PLANS) {
    const creatorId = userIdByIndex.get(mp.creator);
    if (!creatorId) {
      console.warn(`[seedMock] missing creator index ${mp.creator} for "${mp.title}" — skipping.`);
      continue;
    }
    const neighborhoodId = hoodIdByName.get(mp.neighborhoodName);
    if (!neighborhoodId) {
      console.warn(`[seedMock] no neighborhood "${mp.neighborhoodName}" for "${mp.title}" — skipping.`);
      continue;
    }

    // Idempotent: skip if this creator already has a plan with this title.
    const already = store.listPlansByCreator(creatorId).some((p) => p.title === mp.title);
    if (already) {
      skippedPlans++;
      continue;
    }

    const date = dateForOffset(mp.daysFromNow);
    const planKind = mp.planKind ?? "standard";
    const isLookingFor = planKind === "looking_for";
    const plan = store.createPlan({
      creatorId,
      title: mp.title,
      neighborhoodId,
      location: mp.location.name ? mp.location : { name: "Flexible location", address: "Flexible location" },
      date,
      time: mp.isFlexibleTime ? "" : mp.time,
      isFlexibleTime: mp.isFlexibleTime,
      isFlexibleLocation: isLookingFor && !mp.location.name,
      endTime: isoEndForPlan(date, mp.time, mp.endHoursAfterStart),
      tags: mp.tags,
      description: mp.description,
      hostEmoji: mp.hostEmoji,
      planKind,
      visibility: "everyone",
      visibilityCommunityTag: null,
      isRecurring: false,
      lockedAt: null,
    });
    createdPlans++;

    const goingIds: string[] = [];
    for (const idx of mp.going) {
      const uid = userIdByIndex.get(idx);
      if (uid) {
        store.upsertParticipation(plan.id, uid, "going");
        goingIds.push(uid);
      }
    }
    for (const idx of mp.interested) {
      const uid = userIdByIndex.get(idx);
      if (uid) store.upsertParticipation(plan.id, uid, "interested");
    }

    if (mp.messages.length > 0 || goingIds.length > 0) {
      const conv = store.ensureGroupConversation(plan.id, [creatorId, ...goingIds]);
      for (const msg of mp.messages) {
        const senderId = userIdByIndex.get(msg.sender);
        if (!senderId) continue;
        const created = store.createMessage(conv.id, senderId, msg.body);
        (created as { createdAt: string }).createdAt = isoMinutesAgo(msg.minutesAgo);
      }
    }
  }
  console.log(`[seedMock] plans: ${createdPlans} created, ${skippedPlans} already existed`);

  console.log("[seedMock] flushing pending mirror writes…");
  await mongoMirror.flushPending();

  const [users, plans, parts, convos, msgs] = await Promise.all([
    UserModel.countDocuments({}),
    PlanModel.countDocuments({}),
    ParticipationModel.countDocuments({}),
    ConversationModel.countDocuments({}),
    MessageModel.countDocuments({}),
  ]);
  console.log("\nMongo totals after mock seed:");
  console.log(`  users:           ${users}`);
  console.log(`  plans:           ${plans}`);
  console.log(`  participations:  ${parts}`);
  console.log(`  conversations:   ${convos}`);
  console.log(`  messages:        ${msgs}`);

  await mongoose.disconnect();
  console.log("[seedMock] done.");
}

main().catch((err) => {
  console.error("[seedMock] failed", err);
  process.exit(1);
});
