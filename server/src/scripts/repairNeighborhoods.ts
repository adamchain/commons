// One-shot: upsert pinned Philly neighborhoods + remap legacy ObjectId
// neighborhood refs on users to canonical UUIDs. Safe to re-run.
//
//   npx tsx src/scripts/repairNeighborhoods.ts

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo } from "../lib/db.js";
import { hydrateSnapshotFromMongo } from "../hydrate.js";
import { mongoMirror } from "../mongoMirror.js";
import { seedIfEmpty } from "../seed.js";
import { store } from "../store.js";

async function main(): Promise<void> {
  await connectMongo();
  await hydrateSnapshotFromMongo();
  await seedIfEmpty();
  await mongoMirror.flushPending();

  const hoods = store.listNeighborhoods().length;
  const users = store.listUsers();
  let ok = 0;
  let missing = 0;
  for (const u of users) {
    const ids = u.neighborhoodIds?.length
      ? u.neighborhoodIds
      : u.neighborhoodId
        ? [u.neighborhoodId]
        : [];
    if (ids.length === 0) missing += 1;
    else ok += 1;
  }
  console.log(`[repairNeighborhoods] done — ${hoods} hoods, ${ok} users with hoods, ${missing} missing`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
