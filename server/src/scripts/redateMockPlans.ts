// Re-dates aged-out demo/mock plans into the upcoming window so they show in
// the feed again. The feed (recommend.ts) drops any plan dated before today,
// and the seed bakes fixed dates relative to when it ran — so weeks later every
// seed plan has aged out. This shifts the whole block of past seed plans forward
// by a single constant offset, preserving their relative spacing, and moves
// endTime by the same number of days.
//
// ONLY touches plans whose creator is a demo/mock seed account (+1555555… or
// accountSource "seed"). Real accounts — including the intentional past history
// from seedPastTogether — are left untouched.
//
// Dry-run by default. Pass --apply to write.
//
// Usage:
//   npx tsx src/scripts/redateMockPlans.ts            # preview
//   npx tsx src/scripts/redateMockPlans.ts --apply    # write to Mongo

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import { PlanModel } from "../models/index.js";
import { UserModel } from "../models/User.js";

const APPLY = process.argv.includes("--apply");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "YYYY-MM-DD" -> midnight Date in local tz (date strings are tz-agnostic days). */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y!, (m! - 1), d!, 0, 0, 0, 0);
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, days: number): string {
  return isoDay(new Date(parseDay(iso).getTime() + days * MS_PER_DAY));
}

/** Shift a full ISO timestamp (endTime) forward by N days, keeping clock time. */
function shiftIsoTimestamp(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * MS_PER_DAY).toISOString();
}

async function main(): Promise<void> {
  await connectMongo();
  if (!isMongoConnected()) {
    console.error("MONGODB_URI not set / not connected — refusing to run.");
    process.exit(1);
  }

  const users = await UserModel.find({}, { id: 1, phoneNumber: 1, accountSource: 1 }).lean();
  const userById = new Map(users.map((u) => [u.id, u]));
  const isSeed = (uid: string): boolean => {
    const u = userById.get(uid);
    if (!u) return false;
    return u.accountSource === "seed" || (u.phoneNumber ?? "").startsWith("+1555555");
  };

  const today = todayMidnight();
  const todayStr = isoDay(today);

  const allPlans = await PlanModel.find({}).lean();
  const stale = allPlans.filter((p) => isSeed(p.creatorId) && (p.date ?? "") < todayStr);

  if (stale.length === 0) {
    console.log("No aged-out seed plans found — nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // Earliest stale date anchors the block. Shift so the earliest lands tomorrow,
  // keeping every plan's spacing relative to the rest.
  const minDateStr = stale.reduce((min, p) => (p.date < min ? p.date : min), stale[0]!.date);
  const tomorrow = isoDay(new Date(today.getTime() + 1 * MS_PER_DAY));
  const deltaDays = Math.round((parseDay(tomorrow).getTime() - parseDay(minDateStr).getTime()) / MS_PER_DAY);

  const maxDateStr = stale.reduce((max, p) => (p.date > max ? p.date : max), stale[0]!.date);
  console.log(`\n=== Re-date demo/mock plans ${APPLY ? "(APPLY)" : "(dry-run)"} ===`);
  console.log(`today:            ${todayStr}`);
  console.log(`stale seed plans: ${stale.length}`);
  console.log(`current span:     ${minDateStr} … ${maxDateStr}`);
  console.log(`shift:            +${deltaDays} days  →  earliest lands ${tomorrow}`);
  console.log(`new span:         ${addDays(minDateStr, deltaDays)} … ${addDays(maxDateStr, deltaDays)}`);
  console.log("");

  let updated = 0;
  for (const p of stale.sort((a, b) => a.date.localeCompare(b.date))) {
    const newDate = addDays(p.date, deltaDays);
    const newEnd = p.endTime ? shiftIsoTimestamp(p.endTime, deltaDays) : undefined;
    if (updated < 12) console.log(`  ${p.date} → ${newDate}   ${p.title}`);
    if (APPLY) {
      const set: Record<string, string> = { date: newDate };
      if (newEnd) set.endTime = newEnd;
      await PlanModel.updateOne({ id: p.id }, { $set: set });
    }
    updated++;
  }
  if (stale.length > 12) console.log(`  …and ${stale.length - 12} more`);

  console.log(`\n${APPLY ? `Updated ${updated} plans in Mongo.` : `Dry-run only — ${updated} plans WOULD be updated. Re-run with --apply.`}`);
  if (APPLY) {
    console.log("NOTE: the Railway server caches Mongo in memory at boot. Restart/redeploy it so the feed re-hydrates the new dates.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("redate failed", err);
  process.exit(1);
});
