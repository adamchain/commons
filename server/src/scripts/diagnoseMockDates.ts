// READ-ONLY diagnostic. Connects to MONGODB_URI and reports the date
// distribution of plans, split by whether the creator is a demo/mock seed
// account (+1555555…) vs a real account. No writes.
//
// Usage:  npx tsx src/scripts/diagnoseMockDates.ts

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import { PlanModel } from "../models/index.js";
import { UserModel } from "../models/User.js";

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  await connectMongo();
  if (!isMongoConnected()) {
    console.error("MONGODB_URI not set / not connected.");
    process.exit(1);
  }

  const users = await UserModel.find({}, { id: 1, phoneNumber: 1, accountSource: 1, firstName: 1 }).lean();
  const userById = new Map(users.map((u) => [u.id, u]));
  const isSeed = (uid: string) => {
    const u = userById.get(uid);
    if (!u) return false;
    return u.accountSource === "seed" || (u.phoneNumber ?? "").startsWith("+1555555");
  };

  const plans = await PlanModel.find({}, { id: 1, title: 1, date: 1, creatorId: 1, cancelledAt: 1 }).lean();
  const today = todayIso();

  let seedPast = 0, seedFuture = 0, realPast = 0, realFuture = 0;
  const seedPastSamples: string[] = [];
  for (const p of plans) {
    const seed = isSeed(p.creatorId);
    const past = (p.date ?? "") < today;
    if (seed && past) { seedPast++; if (seedPastSamples.length < 8) seedPastSamples.push(`${p.date}  ${p.title}`); }
    else if (seed && !past) seedFuture++;
    else if (!seed && past) realPast++;
    else realFuture++;
  }

  console.log(`\n=== Mongo plan diagnostic (today = ${today}) ===`);
  console.log(`total users:           ${users.length}`);
  console.log(`total plans:           ${plans.length}`);
  console.log(`seed/demo plans PAST:  ${seedPast}   <-- aged out of the feed`);
  console.log(`seed/demo plans FUTURE:${seedFuture}`);
  console.log(`real-acct plans PAST:  ${realPast}   (e.g. seedPastTogether — leave alone)`);
  console.log(`real-acct plans FUTURE:${realFuture}`);
  console.log(`\nsample of aged-out seed plans:`);
  for (const s of seedPastSamples) console.log("  " + s);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("diagnose failed", err);
  process.exit(1);
});
