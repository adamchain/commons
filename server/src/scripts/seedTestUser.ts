// Creates a single dev/QA test user (+1 999-999-9999) as a plain, fully
// onboarded NON-member / NON-admin account — for testing what a regular
// non-member can and can't do inside a community. Pairs with the dev-only
// login bypass in routes/auth.ts (phone +19999999999, code 9999).
//
// Idempotent: re-running just refreshes the same user. Does NOT add them to
// any community.
//
// Usage:
//   MONGODB_URI=... npx tsx src/scripts/seedTestUser.ts

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import { hydrateSnapshotFromMongo } from "../hydrate.js";
import { mongoMirror } from "../mongoMirror.js";
import { store } from "../store.js";
import { createUser, findUserByPhone, updateUser } from "../userRepo.js";

const PHONE = "+19999999999";

async function main(): Promise<void> {
  await connectMongo();
  if (!isMongoConnected()) {
    console.error("MONGODB_URI not set / not connected — refusing to seed.");
    process.exit(1);
  }
  console.log("[seedTestUser] connected, hydrating snapshot…");
  await hydrateSnapshotFromMongo();

  // Give them a real neighborhood if any exist, so discovery works.
  const hoods = store.listNeighborhoods();
  const neighborhoodId = hoods[0]?.id ?? null;

  let user = await findUserByPhone(PHONE);
  const isNew = !user;
  if (!user) user = await createUser(PHONE, { accountSource: "seed" });

  await updateUser(user.id, {
    accountSource: "seed",
    firstName: "Testy",
    lastName: "McTester",
    neighborhoodId,
    neighborhoodIds: neighborhoodId ? [neighborhoodId] : [],
    interests: ["coffee", "events", "food"],
    avatarSeed: "testy-nonmember",
    avatarStyle: "avataaars",
    onboardingComplete: true,
  });

  const memberships = store.listCommunityMembershipsForUser(user.id);
  console.log(
    `[seedTestUser] ${isNew ? "created" : "updated"} ${PHONE} (${user.id}); ` +
      `community memberships: ${memberships.length} (should be 0 for a clean non-member test)`,
  );

  await mongoMirror.flushPending();
  await mongoose.disconnect();
  console.log("[seedTestUser] done. Log in with phone 999-999-9999, code 9999 (dev only).");
}

main().catch((err) => {
  console.error("[seedTestUser] failed", err);
  process.exit(1);
});
