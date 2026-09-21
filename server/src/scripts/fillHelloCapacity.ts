// One-shot QA helper: add two fake Going users to Nishika's "Hello" plan
// (today 9:17pm) and cap it so the card is at capacity.
//
// Usage (from server/):
//   npx tsx src/scripts/fillHelloCapacity.ts

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import { hydrateSnapshotFromMongo } from "../hydrate.js";
import { mongoMirror } from "../mongoMirror.js";
import { store } from "../store.js";
import { createUser, findUserByPhone, updateUser } from "../userRepo.js";

const PLAN_TITLE = "Hello";
const HOST_FIRST = "nishika";
const PLAN_DATE = "2026-09-19";
const PLAN_TIME = "21:17";

const FAKES = [
  { phone: "+15555550881", firstName: "Maya", lastName: "Chen", avatarSeed: "capacity-maya" },
  { phone: "+15555550882", firstName: "Priya", lastName: "Shah", avatarSeed: "capacity-priya" },
] as const;

function normalizeTime(t: string | undefined): string {
  return (t ?? "").trim().slice(0, 5);
}

async function main(): Promise<void> {
  await connectMongo();
  if (!isMongoConnected()) {
    console.error("MONGODB_URI not set / not connected — refusing to write.");
    process.exit(1);
  }
  console.log("[fillHello] connected, hydrating…");
  await hydrateSnapshotFromMongo();

  const matches = store.listPlans().filter((p) => {
    if (p.title.trim().toLowerCase() !== PLAN_TITLE.toLowerCase()) return false;
    if (!p.date.startsWith(PLAN_DATE)) return false;
    if (normalizeTime(p.time) !== PLAN_TIME) return false;
    const host = store.findUserById(p.creatorId);
    return (host?.firstName ?? "").trim().toLowerCase() === HOST_FIRST;
  });

  if (matches.length === 0) {
    const nearby = store
      .listPlans()
      .filter((p) => p.title.toLowerCase().includes("hello"))
      .slice(0, 20)
      .map((p) => {
        const host = store.findUserById(p.creatorId);
        return `${p.id} | "${p.title}" | ${host?.firstName} | ${p.date} ${p.time} | cap=${p.capacity ?? "none"}`;
      });
    console.error("[fillHello] no matching plan. Nearby Hello titles:\n" + nearby.join("\n"));
    process.exit(1);
  }

  const plan = matches[0]!;
  const host = store.findUserById(plan.creatorId);
  console.log(
    `[fillHello] plan ${plan.id} host=${host?.firstName} ${host?.lastName ?? ""} date=${plan.date} time=${plan.time} cap=${plan.capacity ?? "none"}`,
  );

  const hoodId = host?.neighborhoodId ?? plan.neighborhoodId ?? store.listNeighborhoods()[0]?.id ?? null;

  for (const fake of FAKES) {
    let user = await findUserByPhone(fake.phone);
    if (!user) {
      user = await createUser(fake.phone, { accountSource: "seed" });
      console.log(`[fillHello] created ${fake.firstName} ${fake.phone} (${user.id})`);
    } else {
      console.log(`[fillHello] reusing ${fake.firstName} ${fake.phone} (${user.id})`);
    }
    await updateUser(user.id, {
      accountSource: "seed",
      firstName: fake.firstName,
      lastName: fake.lastName,
      neighborhoodId: hoodId,
      neighborhoodIds: hoodId ? [hoodId] : [],
      interests: ["coffee", "food", "events"],
      avatarSeed: fake.avatarSeed,
      avatarStyle: "avataaars",
      onboardingComplete: true,
    });
    store.upsertParticipation(plan.id, user.id, "going");
    store.ensureGroupConversation(plan.id, [plan.creatorId, user.id], { rejoinIds: [user.id] });
  }

  const going = store.listParticipationsForPlan(plan.id).filter((p) => p.state === "going");
  const goingCount = going.length;
  if (!plan.capacity || goingCount > plan.capacity) {
    store.updatePlan(plan.id, { capacity: goingCount });
  }
  const updated = store.findPlanById(plan.id);
  console.log(
    `[fillHello] going=${goingCount} capacity=${updated?.capacity ?? "none"} → ${goingCount}/${updated?.capacity}`,
  );

  await mongoMirror.flushPending();
  await mongoose.disconnect();
  console.log("[fillHello] done.");
}

main().catch((err) => {
  console.error("[fillHello] failed", err);
  process.exit(1);
});
