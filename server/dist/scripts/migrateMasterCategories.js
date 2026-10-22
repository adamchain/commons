// One-shot migration: fold the old Interest / Community-category / Plan-tag
// vocabularies onto the single master category list (see types/shared.ts).
//
//   npx tsx src/scripts/migrateMasterCategories.ts
//
// Rewrites, in server/data.json (backed up first):
//   • users[].interests           legacy tags -> master ids (dedup)
//   • plans[].tags                legacy tags -> master ids (dedup)
//   • plans[].visibilityCommunityTag  legacy tag -> master id (or null)
//   • communities[].category      legacy community category -> master id
//
// Forums are intentionally left alone — their granular slugs (coffee, food, …)
// live on as forum ids and each already points at a master category via
// FORUM_CATALOG. If MONGODB_URI is set, the same remap is applied to Mongo.
//
// Idempotent: master ids map to themselves, so re-running is a no-op.
import "dotenv/config";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_INTERESTS } from "../types/shared.js";
// Legacy value -> master category. Covers three generations of tags: the
// current 16-tag InterestTag set, the old Community categories, and the earliest
// compound tags still sitting in data.json (fitness_outdoors, coffee_cowork, …).
const MAP = {
    // current-gen interest ids
    coffee: "food_drink",
    food: "food_drink",
    drinks: "food_drink",
    events: "social",
    night_out: "social",
    new_to_philly: "social",
    sober: "social",
    music: "entertainment",
    books: "book_club",
    walks: "outdoors",
    workouts: "fitness_wellness",
    wellness: "fitness_wellness",
    creative: "creative_arts",
    cowork: "career",
    // legacy community categories
    run_club: "fitness_wellness",
    fitness: "fitness_wellness",
    arts: "creative_arts",
    // earliest compound tags found in data.json
    fitness_outdoors: "fitness_wellness",
    coffee_cowork: "career",
    running: "fitness_wellness",
    music_nightlife: "social",
    food_drinks: "food_drink",
    local_events: "social",
    arts_culture: "creative_arts",
    dog_owners: "pets",
    thrifting: "creative_arts",
};
const MASTER = new Set(ALL_INTERESTS);
for (const id of ALL_INTERESTS)
    MAP[id] = id; // identity for already-master ids
/** Resolve one tag to a master id, or null if it can't be mapped or is unknown. */
function toMaster(value) {
    if (typeof value !== "string")
        return null;
    const mapped = MAP[value];
    if (mapped)
        return mapped;
    return MASTER.has(value) ? value : null;
}
/** Map an array of tags to deduped master ids, dropping anything unmappable. */
function remapTags(tags) {
    if (!Array.isArray(tags))
        return [];
    const out = [];
    for (const t of tags) {
        const m = toMaster(t);
        if (m && !out.includes(m))
            out.push(m);
    }
    return out;
}
function migrateSnapshot(data) {
    let users = 0;
    let plans = 0;
    let communities = 0;
    for (const u of data.users ?? []) {
        const before = JSON.stringify(u.interests ?? []);
        u.interests = remapTags(u.interests);
        if (JSON.stringify(u.interests) !== before)
            users += 1;
    }
    for (const p of data.plans ?? []) {
        const before = JSON.stringify(p.tags ?? []);
        p.tags = remapTags(p.tags);
        if (JSON.stringify(p.tags) !== before)
            plans += 1;
        if (p.visibilityCommunityTag != null) {
            p.visibilityCommunityTag = toMaster(p.visibilityCommunityTag);
        }
    }
    for (const c of data.communities ?? []) {
        const next = toMaster(c.category) ?? "other";
        if (next !== c.category)
            communities += 1;
        c.category = next;
    }
    return { users, plans, communities };
}
async function migrateMongo() {
    if (!process.env.MONGODB_URI?.trim()) {
        console.log("[migrate] MONGODB_URI not set — skipping Mongo (data.json is the store).");
        return;
    }
    const mongoose = (await import("mongoose")).default;
    const { connectMongo } = await import("../lib/db.js");
    const { UserModel } = await import("../models/User.js");
    const { PlanModel, CommunityModel } = await import("../models/index.js");
    await connectMongo();
    let users = 0;
    for (const u of await UserModel.find({}).lean()) {
        const next = remapTags(u.interests);
        await UserModel.updateOne({ id: u.id }, { $set: { interests: next } });
        users += 1;
    }
    let plans = 0;
    for (const p of await PlanModel.find({}).lean()) {
        const rec = p;
        await PlanModel.updateOne({ id: p.id }, {
            $set: {
                tags: remapTags(rec.tags),
                visibilityCommunityTag: rec.visibilityCommunityTag != null ? toMaster(rec.visibilityCommunityTag) : null,
            },
        });
        plans += 1;
    }
    let communities = 0;
    for (const c of await CommunityModel.find({}).lean()) {
        const next = toMaster(c.category) ?? "other";
        await CommunityModel.updateOne({ id: c.id }, { $set: { category: next } });
        communities += 1;
    }
    console.log(`[migrate] Mongo updated — ${users} users, ${plans} plans, ${communities} communities`);
    await mongoose.disconnect();
}
async function main() {
    const dataPath = resolve(process.cwd(), "data.json");
    const backupPath = `${dataPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(dataPath, backupPath);
    console.log(`[migrate] backed up data.json -> ${backupPath}`);
    const data = JSON.parse(readFileSync(dataPath, "utf8"));
    const counts = migrateSnapshot(data);
    writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log(`[migrate] data.json rewritten — ${counts.users} users, ${counts.plans} plans, ${counts.communities} communities changed`);
    await migrateMongo();
    console.log("[migrate] done.");
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
