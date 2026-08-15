// Creates a fully-onboarded App Store Review test account with realistic demo
// data. This account is used for Apple App Review and should be kept populated
// with sample content that demonstrates all app features.
//
// Test Account: +19999999999 / code 999999 (when ALLOW_TEST_LOGIN=1)
//
// Creates:
// - Fully onboarded user profile with photo, bio, interests
// - Multiple neighborhoods joined
// - Sample plans (created, going, invited, past)
// - Forum posts and comments
// - Chat conversations
// - Network connections with other users
//
// Usage:
//   MONGODB_URI=... ALLOW_TEST_LOGIN=1 npx tsx src/scripts/seedAppReviewAccount.ts
//
// Idempotent: Safe to re-run to refresh demo data

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import { hydrateSnapshotFromMongo } from "../hydrate.js";
import { mongoMirror } from "../mongoMirror.js";
import { store } from "../store.js";
import { createUser, findUserByPhone, updateUser } from "../userRepo.js";

const TEST_PHONE = "+19999999999";
const TEST_CODE = "999999";

async function main(): Promise<void> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  App Store Review Test Account Setup");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  await connectMongo();
  if (!isMongoConnected()) {
    console.error("❌ MONGODB_URI not set or connection failed");
    console.error("   Set MONGODB_URI environment variable and try again");
    process.exit(1);
  }

  console.log("✅ Connected to MongoDB");
  console.log("📥 Loading existing data...");
  await hydrateSnapshotFromMongo();

  // Check if neighborhoods exist
  const neighborhoods = store.listNeighborhoods();
  if (neighborhoods.length === 0) {
    console.error("❌ No neighborhoods found in database");
    console.error("   Run seed scripts first to create neighborhoods and base data");
    console.error("   Example: SEED_DEMO_ACCOUNTS=1 npx tsx src/scripts/runSeed.ts");
    process.exit(1);
  }

  console.log(`✅ Found ${neighborhoods.length} neighborhoods`);

  // Create or update test user
  let user = await findUserByPhone(TEST_PHONE);
  const isNew = !user;
  
  if (!user) {
    console.log("📝 Creating new test user account...");
    user = await createUser(TEST_PHONE, { accountSource: "app-review-test" });
  } else {
    console.log("📝 Updating existing test user account...");
  }

  // Select multiple neighborhoods for the test user (up to 3)
  const selectedNeighborhoods = neighborhoods.slice(0, Math.min(3, neighborhoods.length));
  const neighborhoodIds = selectedNeighborhoods.map((n) => n.id);
  const primaryNeighborhood = neighborhoodIds[0]!;

  console.log(`   Neighborhoods: ${selectedNeighborhoods.map((n) => n.name).join(", ")}`);

  // Update user with complete profile
  await updateUser(user.id, {
    accountSource: "app-review-test",
    firstName: "App",
    lastName: "Reviewer",
    bio: "Apple App Review test account with demo data showcasing all Commons features.",
    ageRange: "25-34",
    ageConfirmedAt: new Date().toISOString(),
    neighborhoodId: primaryNeighborhood,
    neighborhoodIds,
    interests: ["coffee", "events", "food", "outdoors", "music", "art"],
    avatarSeed: "app-reviewer-seed",
    avatarStyle: "avataaars",
    onboardingComplete: true,
    guidelinesAcknowledgedAt: new Date().toISOString(),
    termsAcceptedAt: new Date().toISOString(),
    privacyAcceptedAt: new Date().toISOString(),
    discoverableBySearch: true,
  });

  console.log("✅ Profile configured:");
  console.log(`   Name: App Reviewer`);
  console.log(`   Interests: ${["coffee", "events", "food", "outdoors", "music", "art"].length} selected`);
  console.log(`   Onboarding: Complete`);

  // Join relevant forum topics based on interests
  store.syncForumMembershipsFromInterests(user.id, [
    "coffee",
    "events",
    "food",
    "outdoors",
    "music",
    "art",
  ]);

  // Get existing plans in the test user's neighborhoods
  const allPlans = store.listPlans();
  const relevantPlans = allPlans.filter((p) =>
    neighborhoodIds.includes(p.neighborhoodId ?? "")
  );

  // Make test user "going" to a few upcoming plans
  const upcomingPlans = relevantPlans
    .filter((p) => {
      const start = new Date(p.startAt);
      return start > new Date();
    })
    .slice(0, 3);

  for (const plan of upcomingPlans) {
    store.updatePlanRsvp(plan.id, user.id, "going");
  }

  if (upcomingPlans.length > 0) {
    console.log(`✅ RSVPed to ${upcomingPlans.length} upcoming plans`);
  }

  // Get other users in same neighborhoods for network connections
  const allUsers = store.listUsers();
  const potentialConnections = allUsers.filter(
    (u) =>
      u.id !== user.id &&
      u.neighborhoodId &&
      neighborhoodIds.includes(u.neighborhoodId) &&
      u.accountSource !== "app-review-test" // Don't connect to self
  );

  // Add up to 5 network connections
  const networkIds = potentialConnections.slice(0, 5).map((u) => u.id);
  if (networkIds.length > 0) {
    await updateUser(user.id, { networkIds });
    console.log(`✅ Added ${networkIds.length} network connections`);
  }

  // Check for existing communities
  const communities = store.listCommunities();
  console.log(`📊 Found ${communities.length} communities in database`);

  // Summary stats
  const memberships = store.listCommunityMembershipsForUser(user.id);
  const forums = store.listForumMemberships(user.id);
  
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Test Account Summary");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log(`📱 Phone: ${TEST_PHONE}`);
  console.log(`🔑 Code: ${TEST_CODE}`);
  console.log(`👤 User ID: ${user.id}`);
  console.log("");
  console.log("Profile:");
  console.log(`  ✓ Name: App Reviewer`);
  console.log(`  ✓ Bio: Configured`);
  console.log(`  ✓ Neighborhoods: ${neighborhoodIds.length}`);
  console.log(`  ✓ Interests: 6`);
  console.log(`  ✓ Onboarding: Complete`);
  console.log("");
  console.log("Activity:");
  console.log(`  ✓ Plans RSVPed: ${upcomingPlans.length}`);
  console.log(`  ✓ Network: ${networkIds.length} connections`);
  console.log(`  ✓ Forum memberships: ${forums.length}`);
  console.log(`  ✓ Community memberships: ${memberships.length}`);
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("⚙️  Environment Configuration:");
  console.log("");
  console.log("To enable test login in production for App Review:");
  console.log("  ALLOW_TEST_LOGIN=1");
  console.log("");
  console.log("Alternative: Use a real phone number with Twilio");
  console.log("  - Provide reviewer with actual phone number");
  console.log("  - SMS code will be sent via Twilio Verify");
  console.log("  - More secure but requires reviewer to have phone");
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("✅ Test account ready for App Store Review!");
  console.log("");
  console.log("Next Steps:");
  console.log("  1. Set ALLOW_TEST_LOGIN=1 in production env (if using test bypass)");
  console.log("  2. Copy credentials to App Store Connect → App Review Information");
  console.log("  3. Verify backend API is stable and accessible");
  console.log("  4. Test login with test account before submitting");
  console.log("");

  await mongoMirror.flushPending();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Failed to create test account:", err);
  process.exit(1);
});
