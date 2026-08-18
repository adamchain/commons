// Standalone mock-community seeder. Creates one approved community with an
// organizer, a handful of active members, a persistent community group chat
// with a few messages, and a couple of pinned/plain bulletin posts.
//
// It provisions its OWN dedicated mock users on the +1 555-555-04xx phone
// range so it never collides with the base demo seed (01xx / 02xx) or the
// mock-plan seeder (03xx). Safe to run against an existing DB — it does NOT
// wipe anything and is idempotent: re-running updates the same users and
// skips the community / posts / chat if they already exist.
//
// Usage:
//   MONGODB_URI=... npx tsx src/scripts/seedMockCommunity.ts

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import { hydrateSnapshotFromMongo } from "../hydrate.js";
import { mongoMirror } from "../mongoMirror.js";
import { store } from "../store.js";
import type { CommunityCategory, InterestTag } from "../types/shared.js";
import { createUser, findUserByPhone, updateUser } from "../userRepo.js";
import {
  CommunityMemberModel,
  CommunityModel,
  CommunityPostModel,
} from "../models/index.js";
import { UserModel } from "../models/User.js";

// ---------------------------------------------------------------------------
// Mock members for this community. Index 0 is the organizer. Phone tails
// 0400..0407 keep them in their own block.
// ---------------------------------------------------------------------------

interface MockMember {
  firstName: string;
  neighborhoodName: string;
  interests: InterestTag[];
}

const MOCK_MEMBERS: MockMember[] = [
  { firstName: "Harper", neighborhoodName: "Rittenhouse", interests: ["workouts", "coffee", "workouts"] },
  { firstName: "Diego", neighborhoodName: "Fairmount", interests: ["workouts", "workouts", "coffee"] },
  { firstName: "Nadia", neighborhoodName: "Center City", interests: ["workouts", "coffee", "food"] },
  { firstName: "Theo", neighborhoodName: "Graduate Hospital", interests: ["workouts", "workouts", "events"] },
  { firstName: "Ruby", neighborhoodName: "South Philly", interests: ["workouts", "coffee", "workouts"] },
  { firstName: "Malik", neighborhoodName: "Fishtown", interests: ["workouts", "music", "workouts"] },
  { firstName: "Iris", neighborhoodName: "Old City", interests: ["workouts", "creative", "coffee"] },
  { firstName: "Owen", neighborhoodName: "Manayunk", interests: ["workouts", "workouts", "events"] },
];

function phoneForIndex(i: number): string {
  return `+1555555${String(400 + i).padStart(4, "0")}`;
}

const COMMUNITY = {
  name: "Rittenhouse Run Club",
  description:
    "Easy weekly miles around Center City, all paces welcome. We meet Saturday " +
    "mornings at the Square and grab coffee after. Newcomers always welcome.",
  category: "walks" as CommunityCategory,
};

// A couple of bulletin posts. `organizerOnly` posts are authored by index 0.
const MOCK_POSTS: Array<{ author: number; content: string; pin?: boolean }> = [
  {
    author: 0,
    pin: true,
    content:
      "Welcome to the crew! 🏃 We meet Saturdays at 8am by the lion statue in " +
      "Rittenhouse Square. Conversational pace, 3–4 miles, coffee at Ultimo after. " +
      "Drop a 👋 below so we know who to look for.",
  },
  {
    author: 2,
    content: "First time joining this weekend — is street parking easy around the Square early morning?",
  },
  {
    author: 4,
    content: "Anyone training for the Broad Street Run? Would love a few midweek partners for tempo work.",
  },
];

// A few seed messages for the community group chat (sender = member index).
const MOCK_CHAT: Array<{ sender: number; body: string; minutesAgo: number }> = [
  { sender: 0, body: "Group chat is live — see everyone Saturday!", minutesAgo: 600 },
  { sender: 1, body: "Can't wait, been looking for a running crew 🙌", minutesAgo: 420 },
  { sender: 5, body: "What's the plan if it rains?", minutesAgo: 300 },
  { sender: 0, body: "Light rain we still go. Downpour we move to Sunday same time.", minutesAgo: 240 },
];

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

async function main(): Promise<void> {
  await connectMongo();
  if (!isMongoConnected()) {
    console.error("MONGODB_URI not set / not connected — refusing to seed.");
    process.exit(1);
  }
  console.log("[seedMockCommunity] connected, hydrating snapshot…");
  await hydrateSnapshotFromMongo();

  const hoodIdByName = new Map<string, string>();
  for (const h of store.listNeighborhoods()) hoodIdByName.set(h.name, h.id);
  if (hoodIdByName.size === 0) {
    console.error(
      "[seedMockCommunity] no neighborhoods in the store. Run the base seed first " +
        "(SEED_DEMO_ACCOUNTS=1 npx tsx src/scripts/runSeed.ts).",
    );
    process.exit(1);
  }

  // --- Users -------------------------------------------------------------
  const userIdByIndex = new Map<number, string>();
  let createdUsers = 0;
  for (let i = 0; i < MOCK_MEMBERS.length; i++) {
    const m = MOCK_MEMBERS[i]!;
    const phone = phoneForIndex(i);
    const neighborhoodId = hoodIdByName.get(m.neighborhoodName) ?? null;
    if (!neighborhoodId) {
      console.warn(`[seedMockCommunity] no neighborhood "${m.neighborhoodName}" for ${m.firstName} — leaving unset.`);
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
      avatarSeed: `${m.firstName.toLowerCase()}-mockcomm-${i}`,
      avatarStyle: "avataaars",
      onboardingComplete: true,
    });
    userIdByIndex.set(i, user.id);
  }
  console.log(
    `[seedMockCommunity] members: ${MOCK_MEMBERS.length} total (${createdUsers} new, ${MOCK_MEMBERS.length - createdUsers} updated)`,
  );

  const organizerId = userIdByIndex.get(0)!;

  // --- Community (idempotent by name + organizer) ------------------------
  let community = store
    .listCommunitiesForOrganizer(organizerId)
    .find((c) => c.name === COMMUNITY.name);
  if (!community) {
    community = store.createCommunity({
      name: COMMUNITY.name,
      description: COMMUNITY.description,
      category: COMMUNITY.category,
      organizerId,
      creationStatus: "approved", // required to be visible in the app
      isFounding: true,
      reviewedBy: organizerId,
    });
    console.log(`[seedMockCommunity] created community "${community.name}" (${community.id})`);
  } else {
    console.log(`[seedMockCommunity] community "${community.name}" already exists (${community.id}) — reusing`);
  }
  const communityId = community.id;

  // --- Memberships (organizer already active; add the rest) --------------
  const memberIds: string[] = [organizerId];
  for (let i = 1; i < MOCK_MEMBERS.length; i++) {
    const uid = userIdByIndex.get(i)!;
    store.upsertCommunityMembership({
      communityId,
      userId: uid,
      role: "member",
      status: "active",
    });
    memberIds.push(uid);
  }
  const active = store.listActiveCommunityMembers(communityId).length;
  console.log(`[seedMockCommunity] active members: ${active}`);

  // --- Community group chat ----------------------------------------------
  const conv = store.ensureCommunityConversation(communityId, memberIds);
  const existingMsgCount = store.listMessagesForConversation(conv.id).length;
  if (existingMsgCount === 0) {
    for (const msg of MOCK_CHAT) {
      const senderId = userIdByIndex.get(msg.sender);
      if (!senderId) continue;
      const created = store.createMessage(conv.id, senderId, msg.body);
      (created as { createdAt: string }).createdAt = isoMinutesAgo(msg.minutesAgo);
    }
    console.log(`[seedMockCommunity] chat: ${MOCK_CHAT.length} messages seeded`);
  } else {
    console.log(`[seedMockCommunity] chat already has ${existingMsgCount} messages — skipping`);
  }

  // --- Bulletin posts (idempotent by content) ----------------------------
  const existingPosts = store.listCommunityPosts(communityId);
  let createdPosts = 0;
  for (const p of MOCK_POSTS) {
    const authorId = userIdByIndex.get(p.author);
    if (!authorId) continue;
    if (existingPosts.some((ep) => ep.content === p.content)) continue;
    const post = store.createCommunityPost({
      communityId,
      authorId,
      content: p.content,
      approvalStatus: "approved",
    });
    if (p.pin) store.setCommunityPostPinned(post.id, true);
    createdPosts++;
  }
  console.log(`[seedMockCommunity] bulletin: ${createdPosts} posts created`);

  console.log("[seedMockCommunity] flushing pending mirror writes…");
  await mongoMirror.flushPending();

  const [users, communities, members, posts] = await Promise.all([
    UserModel.countDocuments({}),
    CommunityModel.countDocuments({}),
    CommunityMemberModel.countDocuments({}),
    CommunityPostModel.countDocuments({}),
  ]);
  console.log("\nMongo totals after mock-community seed:");
  console.log(`  users:            ${users}`);
  console.log(`  communities:      ${communities}`);
  console.log(`  communityMembers: ${members}`);
  console.log(`  communityPosts:   ${posts}`);

  await mongoose.disconnect();
  console.log("[seedMockCommunity] done.");
}

main().catch((err) => {
  console.error("[seedMockCommunity] failed", err);
  process.exit(1);
});
