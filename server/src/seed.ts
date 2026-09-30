import { store } from "./store.js";
import type { InterestTag } from "./types/shared.js";
import { createUser, findUserByPhone, updateUser } from "./userRepo.js";

interface SeedUser {
  phoneNumber: string;
  firstName: string;
  neighborhoodKey: string;
  interests: InterestTag[];
  avatarSeed: string;
}

interface SeedNeighborhood {
  /** Stable UUID — pinned so re-running the seed doesn't orphan existing user.neighborhoodIds. */
  id: string;
  key: string;
  name: string;
  metro: string;
  adjacentKeys: string[];
  lat: number;
  lng: number;
}

/**
 * COMMONS-seeded Philly neighborhoods. IDs are hard-pinned. Adjacent graph is
 * approximate for proximity ranking.
 *
 * Do NOT regenerate these UUIDs — they are referenced by existing users'
 * `neighborhoodIds` arrays in prod Mongo. If you must add or rename one, give
 * it a freshly-generated UUID; never change one in-place.
 */
const PHILLY_NEIGHBORHOODS: SeedNeighborhood[] = [
  { id: "da9fed31-c42f-4f09-852b-d08eca81ea4a", key: "center_city", name: "Center City", metro: "Philadelphia", adjacentKeys: ["rittenhouse", "old_city", "graduate_hospital", "chinatown", "society_hill"], lat: 39.9526, lng: -75.1652 },
  { id: "6b6941f6-a1d3-4d23-85ba-3d61d6e9a869", key: "rittenhouse", name: "Rittenhouse", metro: "Philadelphia", adjacentKeys: ["center_city", "fairmount", "graduate_hospital"], lat: 39.949, lng: -75.171 },
  { id: "d6e534cd-92ca-43ce-b959-68ea0be77f24", key: "old_city", name: "Old City", metro: "Philadelphia", adjacentKeys: ["center_city", "northern_liberties", "society_hill", "chinatown"], lat: 39.9522, lng: -75.1438 },
  { id: "f79f919c-ce4b-43a6-9541-904559023f9f", key: "northern_liberties", name: "Northern Liberties", metro: "Philadelphia", adjacentKeys: ["old_city", "fishtown"], lat: 39.9625, lng: -75.139 },
  { id: "4b108a5e-929e-4cf6-ba60-9faef931cb56", key: "fishtown", name: "Fishtown", metro: "Philadelphia", adjacentKeys: ["northern_liberties", "kensington", "port_richmond"], lat: 39.9707, lng: -75.1297 },
  { id: "6c96284f-52b7-4ff3-8345-966350592071", key: "south_philly", name: "South Philly", metro: "Philadelphia", adjacentKeys: ["center_city", "queen_village", "bella_vista", "passyunk_square", "point_breeze"], lat: 39.9279, lng: -75.159 },
  { id: "dde7755e-0981-41fd-9d92-27d9a4313797", key: "west_philly", name: "West Philly", metro: "Philadelphia", adjacentKeys: ["center_city", "fairmount", "university_city", "brewerytown"], lat: 39.9526, lng: -75.2125 },
  { id: "00c322de-3499-4f91-98a5-2cb567f1d5e1", key: "manayunk", name: "Manayunk", metro: "Philadelphia", adjacentKeys: ["fairmount", "roxborough", "east_falls"], lat: 40.0253, lng: -75.2214 },
  { id: "816c1ec3-a349-47d4-88b2-2dfb9d131967", key: "fairmount", name: "Fairmount", metro: "Philadelphia", adjacentKeys: ["rittenhouse", "center_city", "manayunk", "brewerytown", "east_falls"], lat: 39.9673, lng: -75.179 },
  { id: "070c4c34-0616-400e-9614-0bcab62b3f94", key: "graduate_hospital", name: "Graduate Hospital", metro: "Philadelphia", adjacentKeys: ["rittenhouse", "center_city", "point_breeze", "university_city"], lat: 39.942, lng: -75.175 },
  { id: "5dc1ed63-0c7f-437b-9e41-fb16229527b0", key: "kensington", name: "Kensington", metro: "Philadelphia", adjacentKeys: ["fishtown", "port_richmond"], lat: 39.9812, lng: -75.128 },
  { id: "b57bf51e-8ceb-4f25-ba69-69c69bbabe3c", key: "port_richmond", name: "Port Richmond", metro: "Philadelphia", adjacentKeys: ["kensington", "fishtown"], lat: 39.9853, lng: -75.1074 },
  { id: "2eac857d-850b-4f91-b99f-2f6515aca348", key: "queen_village", name: "Queen Village", metro: "Philadelphia", adjacentKeys: ["old_city", "south_philly", "society_hill", "bella_vista"], lat: 39.937, lng: -75.1477 },
  { id: "95a03008-1f69-4f7f-83b5-937263ac8146", key: "bella_vista", name: "Bella Vista", metro: "Philadelphia", adjacentKeys: ["south_philly", "queen_village", "passyunk_square"], lat: 39.9377, lng: -75.1585 },
  { id: "00e4e298-08e2-4fe7-83a1-e4a5f2f73705", key: "passyunk_square", name: "Passyunk Square", metro: "Philadelphia", adjacentKeys: ["south_philly", "bella_vista", "point_breeze"], lat: 39.928, lng: -75.165 },
  { id: "c95e5226-0669-4c1c-b3c2-b9720ada1334", key: "point_breeze", name: "Point Breeze", metro: "Philadelphia", adjacentKeys: ["south_philly", "passyunk_square", "graduate_hospital"], lat: 39.928, lng: -75.178 },
  { id: "aa04a06d-3238-472c-af57-97a39d9dfe39", key: "university_city", name: "University City", metro: "Philadelphia", adjacentKeys: ["west_philly", "graduate_hospital"], lat: 39.9522, lng: -75.1932 },
  { id: "e9cf5374-7c20-4664-bee6-ee2a3682a17e", key: "east_falls", name: "East Falls", metro: "Philadelphia", adjacentKeys: ["manayunk", "fairmount", "roxborough"], lat: 40.009, lng: -75.188 },
  { id: "c7369aef-a05c-45e7-b69d-15c5cee0a88e", key: "roxborough", name: "Roxborough", metro: "Philadelphia", adjacentKeys: ["manayunk", "east_falls"], lat: 40.037, lng: -75.221 },
  { id: "15983155-1a1f-4d68-b7ac-83fd73bd17f1", key: "brewerytown", name: "Brewerytown", metro: "Philadelphia", adjacentKeys: ["fairmount", "west_philly"], lat: 39.9755, lng: -75.183 },
  { id: "84ada221-ffd9-4f9d-8738-16e81ec29afe", key: "chinatown", name: "Chinatown", metro: "Philadelphia", adjacentKeys: ["center_city", "old_city"], lat: 39.955, lng: -75.155 },
  { id: "adcc4fa2-2a63-4dd7-86af-e3becf3c95e6", key: "society_hill", name: "Society Hill", metro: "Philadelphia", adjacentKeys: ["old_city", "queen_village", "center_city"], lat: 39.9445, lng: -75.146 },
];

const SEED_USERS: SeedUser[] = [
  { phoneNumber: "+15555550100", firstName: "You", neighborhoodKey: "rittenhouse", interests: ["coffee", "workouts", "workouts"], avatarSeed: "you-seed" },
  { phoneNumber: "+15555550101", firstName: "Jamie", neighborhoodKey: "rittenhouse", interests: ["workouts", "coffee", "food"], avatarSeed: "jamie-seed" },
  { phoneNumber: "+15555550102", firstName: "Sam", neighborhoodKey: "fairmount", interests: ["workouts", "workouts", "music"], avatarSeed: "sam-seed" },
  { phoneNumber: "+15555550103", firstName: "Alex", neighborhoodKey: "old_city", interests: ["music", "food", "creative"], avatarSeed: "alex-seed" },
  { phoneNumber: "+15555550104", firstName: "Riley", neighborhoodKey: "northern_liberties", interests: ["creative", "coffee", "events"], avatarSeed: "riley-seed" },
  { phoneNumber: "+15555550105", firstName: "Pat", neighborhoodKey: "south_philly", interests: ["workouts", "moms", "workouts"], avatarSeed: "pat-seed" },
  { phoneNumber: "+15555550106", firstName: "Sky", neighborhoodKey: "fishtown", interests: ["music", "creative", "events"], avatarSeed: "sky-seed" },
  { phoneNumber: "+15555550107", firstName: "Dee", neighborhoodKey: "graduate_hospital", interests: ["food", "workouts", "creative"], avatarSeed: "dee-seed" },
  { phoneNumber: "+15555550108", firstName: "Noor", neighborhoodKey: "center_city", interests: ["coffee", "creative", "food"], avatarSeed: "noor-seed" },
  { phoneNumber: "+15555550109", firstName: "Mar", neighborhoodKey: "west_philly", interests: ["creative", "music", "creative"], avatarSeed: "mar-seed" },
  { phoneNumber: "+15555550110", firstName: "Theo", neighborhoodKey: "manayunk", interests: ["workouts", "workouts", "moms"], avatarSeed: "theo-seed" },
  { phoneNumber: "+15555550111", firstName: "Ren", neighborhoodKey: "fairmount", interests: ["creative", "events", "workouts"], avatarSeed: "ren-seed" },
  ...generateExtraUsers(),
];

// Procedurally expand the seed dataset to ~50 users + ~50 plans so the feed
// feels alive on day one. Names + interest combos rotate against the
// neighborhood graph; phone numbers stay in the 555-01xx range. Idempotent —
// re-seeding with the same numbers updates the existing rows.
function generateExtraUsers(): SeedUser[] {
  const names = [
    "Avery", "Blair", "Casey", "Drew", "Emerson", "Frankie", "Gray", "Harper",
    "Indigo", "Jules", "Kai", "Logan", "Morgan", "Nico", "Owen", "Parker",
    "Quinn", "Reese", "Sage", "Taylor", "Umi", "Val", "Wren", "Xio",
    "Yael", "Zane", "Ari", "Bren", "Cody", "Dana", "Eli", "Fia",
    "Gio", "Hana", "Ivo", "Joss", "Kira", "Luca",
  ];
  const hoods: string[] = [
    "center_city", "rittenhouse", "old_city", "northern_liberties",
    "fishtown", "south_philly", "west_philly", "manayunk", "fairmount",
    "graduate_hospital",
  ];
  const interestPalette: InterestTag[][] = [
    ["coffee", "workouts", "workouts"],
    ["food", "music", "events"],
    ["creative", "creative", "coffee"],
    ["workouts", "moms", "workouts"],
    ["workouts", "creative", "food"],
    ["music", "events", "creative"],
    ["coffee", "creative", "events"],
    ["workouts", "workouts", "workouts"],
    ["food", "coffee", "workouts"],
    ["moms", "workouts", "creative"],
  ];
  const users: SeedUser[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    const num = 200 + i; // phone tail starts at 200 so it doesn't collide with the curated 100-111 block.
    const phoneNumber = `+1555555${String(num).padStart(4, "0")}`;
    users.push({
      phoneNumber,
      firstName: name,
      neighborhoodKey: hoods[i % hoods.length]!,
      interests: interestPalette[i % interestPalette.length]!,
      avatarSeed: `${name.toLowerCase()}-seed-${i}`,
    });
  }
  return users;
}


/** Fake +1 numbers and demo plans — off in production unless SEED_DEMO_ACCOUNTS=1. Real auth accounts only use Twilio Verify. */
function includeSeedDemoData(): boolean {
  const explicit = process.env.SEED_DEMO_ACCOUNTS?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "yes") return true;
  if (explicit === "0" || explicit === "false" || explicit === "no") return false;
  return process.env.NODE_ENV !== "production";
}

/** Upsert the full pinned Philly list (adds missing hoods; refreshes adjacency). */
function ensurePhillyNeighborhoods(): Map<string, string> {
  const neighborhoodIdByKey = new Map<string, string>();
  const recordsByKey = new Map<string, ReturnType<typeof seedNeighborhood>>();
  for (const n of PHILLY_NEIGHBORHOODS) {
    const record = seedNeighborhood(n);
    neighborhoodIdByKey.set(n.key, record.id);
    recordsByKey.set(n.key, record);
  }
  for (const n of PHILLY_NEIGHBORHOODS) {
    const record = recordsByKey.get(n.key);
    if (!record) continue;
    record.adjacent = n.adjacentKeys
      .map((k) => neighborhoodIdByKey.get(k))
      .filter((id): id is string => Boolean(id));
  }

  const before = store.listNeighborhoods().length;
  if (before === 0) {
    // Fresh DB — replaceAll is fine (nothing to preserve).
    store.seedNeighborhoods(Array.from(recordsByKey.values()));
  } else {
    // Prod may have been seeded with a partial list; upsert missing / refresh edges
    // without wiping Mongo `_id`s (legacy user rows may still reference them).
    for (const record of recordsByKey.values()) {
      store.ensureNeighborhood(record);
    }
  }
  const after = store.listNeighborhoods().length;
  if (after !== before) {
    console.log(`[seed] neighborhoods ${before} → ${after}`);
  }
  return neighborhoodIdByKey;
}

/**
 * Remap legacy Mongo ObjectId neighborhood refs to pinned UUIDs, and clear
 * ids that don't resolve to any hood. Runs on every boot so orphaned profile
 * fields can't keep blocking post/feed for real accounts.
 */
function repairUserNeighborhoodIds(): void {
  let repaired = 0;
  for (const user of store.listUsers()) {
    const raw = user.neighborhoodIds?.length
      ? user.neighborhoodIds
      : user.neighborhoodId
        ? [user.neighborhoodId]
        : [];
    const resolved = [
      ...new Set(
        raw
          .map((id) => store.resolveNeighborhoodId(id))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const primary = resolved[0] ?? null;
    const samePrimary = (user.neighborhoodId ?? null) === primary;
    const sameList =
      (user.neighborhoodIds?.length ?? 0) === resolved.length &&
      resolved.every((id, i) => user.neighborhoodIds?.[i] === id);
    if (samePrimary && sameList) continue;
    store.updateUser(user.id, {
      neighborhoodId: primary,
      neighborhoodIds: resolved,
    });
    repaired += 1;
    console.log(
      `[seed] repaired neighborhood refs for ${user.phoneNumber}` +
        (primary ? ` → ${primary}` : " → (cleared)"),
    );
  }
  if (repaired > 0) {
    console.log(`[seed] repaired neighborhood refs on ${repaired} user(s)`);
  }
}

export async function seedIfEmpty(): Promise<void> {
  const neighborhoodIdByKey = ensurePhillyNeighborhoods();
  repairUserNeighborhoodIds();

  if (!includeSeedDemoData()) {
    console.log("[seed] skipped demo users/plans (production). Only Verify sign-ups create accounts. Set SEED_DEMO_ACCOUNTS=1 to seed.");
    return;
  }

  const userIdByPhone = new Map<string, string>();
  for (const seed of SEED_USERS) {
    const neighborhoodId = neighborhoodIdByKey.get(seed.neighborhoodKey) ?? null;
    let user = await findUserByPhone(seed.phoneNumber);
    if (!user) user = await createUser(seed.phoneNumber, { accountSource: "seed" });
    await updateUser(user.id, {
      accountSource: "seed",
      firstName: seed.firstName,
      neighborhoodId,
      neighborhoodIds: neighborhoodId ? [neighborhoodId] : [],
      interests: seed.interests,
      avatarSeed: seed.avatarSeed,
      avatarStyle: "avataaars",
      onboardingComplete: true,
    });
    userIdByPhone.set(seed.phoneNumber, user.id);
  }

}

function seedNeighborhood(seed: SeedNeighborhood) {
  // Pinned id from SeedNeighborhood — never randomize. See note on
  // PHILLY_NEIGHBORHOODS for why.
  return {
    id: seed.id,
    name: seed.name,
    metro: seed.metro,
    adjacent: [] as string[],
    lat: seed.lat,
    lng: seed.lng,
  };
}
