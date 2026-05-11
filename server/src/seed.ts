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

interface SeedPlan {
  creatorPhone: string;
  title: string;
  neighborhoodKey: string;
  location: { name: string; address: string; lat?: number; lng?: number };
  daysFromNow: number;
  time: string;
  isFlexibleTime: boolean;
  endHoursAfterStart?: number;
  tags: InterestTag[];
  description?: string;
  hostEmoji: string;
  going: string[];
  interested: string[];
  messages: Array<{ senderPhone: string; body: string; minutesAgo: number }>;
}

interface SeedNeighborhood {
  key: string;
  name: string;
  metro: string;
  adjacentKeys: string[];
  lat: number;
  lng: number;
}

/** COMMONS-seeded Philly neighborhoods — adjacent graph is approximate for proximity ranking. */
const PHILLY_NEIGHBORHOODS: SeedNeighborhood[] = [
  { key: "center_city", name: "Center City", metro: "Philadelphia", adjacentKeys: ["rittenhouse", "old_city", "graduate_hospital"], lat: 39.9526, lng: -75.1652 },
  { key: "rittenhouse", name: "Rittenhouse", metro: "Philadelphia", adjacentKeys: ["center_city", "fairmount", "graduate_hospital"], lat: 39.949, lng: -75.171 },
  { key: "old_city", name: "Old City", metro: "Philadelphia", adjacentKeys: ["center_city", "northern_liberties"], lat: 39.9522, lng: -75.1438 },
  { key: "northern_liberties", name: "Northern Liberties", metro: "Philadelphia", adjacentKeys: ["old_city", "fishtown"], lat: 39.9625, lng: -75.139 },
  { key: "fishtown", name: "Fishtown", metro: "Philadelphia", adjacentKeys: ["northern_liberties"], lat: 39.9707, lng: -75.1297 },
  { key: "south_philly", name: "South Philly", metro: "Philadelphia", adjacentKeys: ["center_city"], lat: 39.9279, lng: -75.159 },
  { key: "west_philly", name: "West Philly", metro: "Philadelphia", adjacentKeys: ["center_city", "fairmount"], lat: 39.9526, lng: -75.2125 },
  { key: "manayunk", name: "Manayunk", metro: "Philadelphia", adjacentKeys: ["fairmount"], lat: 40.0253, lng: -75.2214 },
  { key: "fairmount", name: "Fairmount", metro: "Philadelphia", adjacentKeys: ["rittenhouse", "center_city", "manayunk"], lat: 39.9673, lng: -75.179 },
  { key: "graduate_hospital", name: "Graduate Hospital", metro: "Philadelphia", adjacentKeys: ["rittenhouse", "center_city"], lat: 39.942, lng: -75.175 },
];

const SEED_USERS: SeedUser[] = [
  { phoneNumber: "+15555550100", firstName: "You", neighborhoodKey: "rittenhouse", interests: ["coffee_cowork", "wellness", "running"], avatarSeed: "you-seed" },
  { phoneNumber: "+15555550101", firstName: "Jamie", neighborhoodKey: "rittenhouse", interests: ["wellness", "coffee_cowork", "food_drinks"], avatarSeed: "jamie-seed" },
  { phoneNumber: "+15555550102", firstName: "Sam", neighborhoodKey: "fairmount", interests: ["fitness_outdoors", "running", "music_nightlife"], avatarSeed: "sam-seed" },
  { phoneNumber: "+15555550103", firstName: "Alex", neighborhoodKey: "old_city", interests: ["music_nightlife", "food_drinks", "arts_culture"], avatarSeed: "alex-seed" },
  { phoneNumber: "+15555550104", firstName: "Riley", neighborhoodKey: "northern_liberties", interests: ["arts_culture", "coffee_cowork", "local_events"], avatarSeed: "riley-seed" },
  { phoneNumber: "+15555550105", firstName: "Pat", neighborhoodKey: "south_philly", interests: ["fitness_outdoors", "dog_owners", "running"], avatarSeed: "pat-seed" },
  { phoneNumber: "+15555550106", firstName: "Sky", neighborhoodKey: "fishtown", interests: ["music_nightlife", "thrifting", "local_events"], avatarSeed: "sky-seed" },
  { phoneNumber: "+15555550107", firstName: "Dee", neighborhoodKey: "graduate_hospital", interests: ["food_drinks", "wellness", "arts_culture"], avatarSeed: "dee-seed" },
  { phoneNumber: "+15555550108", firstName: "Noor", neighborhoodKey: "center_city", interests: ["coffee_cowork", "arts_culture", "food_drinks"], avatarSeed: "noor-seed" },
  { phoneNumber: "+15555550109", firstName: "Mar", neighborhoodKey: "west_philly", interests: ["thrifting", "music_nightlife", "arts_culture"], avatarSeed: "mar-seed" },
  { phoneNumber: "+15555550110", firstName: "Theo", neighborhoodKey: "manayunk", interests: ["fitness_outdoors", "running", "dog_owners"], avatarSeed: "theo-seed" },
  { phoneNumber: "+15555550111", firstName: "Ren", neighborhoodKey: "fairmount", interests: ["arts_culture", "local_events", "wellness"], avatarSeed: "ren-seed" },
];

const SEED_PLANS: SeedPlan[] = [
  {
    creatorPhone: "+15555550101",
    title: "Yoga in Rittenhouse Square",
    neighborhoodKey: "rittenhouse",
    location: { name: "Rittenhouse Square", address: "1800 Walnut St, Philadelphia, PA", lat: 39.949, lng: -75.171 },
    daysFromNow: 3,
    time: "09:00",
    isFlexibleTime: true,
    endHoursAfterStart: 1,
    tags: ["wellness", "coffee_cowork"],
    description: "Bring a mat. Coffee after if folks want.",
    hostEmoji: "🧘",
    going: ["+15555550101", "+15555550100", "+15555550104"],
    interested: ["+15555550102", "+15555550103"],
    messages: [
      { senderPhone: "+15555550104", body: "Which corner are we meeting?", minutesAgo: 220 },
      { senderPhone: "+15555550101", body: "Southwest side — near the fountain.", minutesAgo: 90 },
    ],
  },
  {
    creatorPhone: "+15555550102",
    title: "Sunrise run — Schuylkill Banks",
    neighborhoodKey: "fairmount",
    location: { name: "Schuylkill Banks Trailhead", address: "2500 Walnut St, Philadelphia, PA", lat: 39.9513, lng: -75.182 },
    daysFromNow: 1,
    time: "06:30",
    isFlexibleTime: false,
    endHoursAfterStart: 2,
    tags: ["running", "fitness_outdoors"],
    description: "Easy pace — regroup at the bridge.",
    hostEmoji: "🏃",
    going: ["+15555550102", "+15555550105"],
    interested: ["+15555550100", "+15555550101"],
    messages: [],
  },
  {
    creatorPhone: "+15555550103",
    title: "Live music at Johnny Brenda's",
    neighborhoodKey: "fishtown",
    location: { name: "Johnny Brenda's", address: "1201 N Frankford Ave, Philadelphia, PA", lat: 39.9714, lng: -75.1339 },
    daysFromNow: 2,
    time: "20:00",
    isFlexibleTime: false,
    tags: ["music_nightlife", "food_drinks"],
    description: "Local bands — small cover at the door.",
    hostEmoji: "🎶",
    going: ["+15555550103", "+15555550104"],
    interested: ["+15555550105", "+15555550100"],
    messages: [],
  },
  {
    creatorPhone: "+15555550104",
    title: "First Friday crawl — galleries",
    neighborhoodKey: "old_city",
    location: { name: "Old City Arts District", address: "N 3rd St & Market St, Philadelphia, PA" },
    daysFromNow: 5,
    time: "Flexible",
    isFlexibleTime: true,
    tags: ["arts_culture", "local_events"],
    description: "Loose route — meet at the flagpole then drift.",
    hostEmoji: "🎨",
    going: ["+15555550104"],
    interested: ["+15555550100", "+15555550103"],
    messages: [],
  },
  {
    creatorPhone: "+15555550106",
    title: "Karaoke at Drinker's",
    neighborhoodKey: "fishtown",
    location: { name: "Drinker's Pub", address: "1903 Chestnut St, Philadelphia, PA", lat: 39.953, lng: -75.172 },
    daysFromNow: 4,
    time: "21:00",
    isFlexibleTime: false,
    endHoursAfterStart: 3,
    tags: ["music_nightlife", "food_drinks"],
    description: "No judgment zone — sign up at the bar.",
    hostEmoji: "🎤",
    going: ["+15555550106", "+15555550103", "+15555550107"],
    interested: ["+15555550100", "+15555550101", "+15555550109"],
    messages: [
      { senderPhone: "+15555550107", body: "Putting Mr. Brightside on my list 😤", minutesAgo: 540 },
    ],
  },
  {
    creatorPhone: "+15555550107",
    title: "Morning walk + coffee",
    neighborhoodKey: "graduate_hospital",
    location: { name: "Rittenhouse Square", address: "1800 Walnut St, Philadelphia, PA", lat: 39.949, lng: -75.171 },
    daysFromNow: 6,
    time: "09:00",
    isFlexibleTime: true,
    endHoursAfterStart: 1,
    tags: ["wellness", "coffee_cowork"],
    description: "Easy loop around the square, grabbing coffee after ☕️",
    hostEmoji: "☕",
    going: ["+15555550107"],
    interested: ["+15555550100", "+15555550101", "+15555550111"],
    messages: [],
  },
  {
    creatorPhone: "+15555550108",
    title: "Looking for — beginner yoga partner?",
    neighborhoodKey: "center_city",
    location: { name: "", address: "" },
    daysFromNow: 2,
    time: "Flexible",
    isFlexibleTime: true,
    tags: ["wellness", "fitness_outdoors"],
    description: "Anyone go to a beginner studio and wouldn't mind I tagged along? Would love to grab coffee after too 🧘",
    hostEmoji: "🧘",
    going: ["+15555550108"],
    interested: ["+15555550101", "+15555550111"],
    messages: [],
  },
  {
    creatorPhone: "+15555550109",
    title: "Thrifting on Baltimore Ave",
    neighborhoodKey: "west_philly",
    location: { name: "Baltimore Ave Thrift Row", address: "4400 Baltimore Ave, Philadelphia, PA", lat: 39.9494, lng: -75.2098 },
    daysFromNow: 5,
    time: "13:00",
    isFlexibleTime: false,
    endHoursAfterStart: 3,
    tags: ["thrifting", "arts_culture"],
    description: "Three shops, two hours, one mediocre iced coffee.",
    hostEmoji: "🧥",
    going: ["+15555550109", "+15555550104"],
    interested: ["+15555550100", "+15555550106"],
    messages: [],
  },
  {
    creatorPhone: "+15555550110",
    title: "Dogs at Manayunk towpath",
    neighborhoodKey: "manayunk",
    location: { name: "Manayunk Tow Path", address: "Manayunk, Philadelphia, PA", lat: 40.0253, lng: -75.2214 },
    daysFromNow: 1,
    time: "16:30",
    isFlexibleTime: false,
    endHoursAfterStart: 2,
    tags: ["dog_owners", "fitness_outdoors"],
    description: "Bring your dog or just join — easy walk + chat.",
    hostEmoji: "🐕",
    going: ["+15555550110", "+15555550105"],
    interested: ["+15555550100", "+15555550102"],
    messages: [],
  },
  {
    creatorPhone: "+15555550111",
    title: "Open mic — Tattooed Mom",
    neighborhoodKey: "south_philly",
    location: { name: "Tattooed Mom", address: "530 South St, Philadelphia, PA", lat: 39.9412, lng: -75.1525 },
    daysFromNow: 7,
    time: "20:30",
    isFlexibleTime: false,
    tags: ["arts_culture", "local_events", "music_nightlife"],
    description: "Reading something I wrote. Moral support welcome.",
    hostEmoji: "📚",
    going: ["+15555550111", "+15555550104"],
    interested: ["+15555550103", "+15555550109"],
    messages: [],
  },
  {
    creatorPhone: "+15555550102",
    title: "Sunday long run — 8 miles",
    neighborhoodKey: "fairmount",
    location: { name: "Lloyd Hall", address: "1 Boathouse Row, Philadelphia, PA", lat: 39.9665, lng: -75.18 },
    daysFromNow: 6,
    time: "07:00",
    isFlexibleTime: false,
    endHoursAfterStart: 2,
    tags: ["running", "fitness_outdoors"],
    description: "Easy pace, regroup at the loop turnaround.",
    hostEmoji: "🏃",
    going: ["+15555550102", "+15555550105", "+15555550110"],
    interested: ["+15555550100"],
    messages: [],
  },
];

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

/** Fake +1 numbers and demo plans — off in production unless SEED_DEMO_ACCOUNTS=1. Real auth accounts only use Twilio Verify. */
function includeSeedDemoData(): boolean {
  const explicit = process.env.SEED_DEMO_ACCOUNTS?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true" || explicit === "yes") return true;
  if (explicit === "0" || explicit === "false" || explicit === "no") return false;
  return process.env.NODE_ENV !== "production";
}

export async function seedIfEmpty(): Promise<void> {
  // Seed neighborhoods only when the store is empty (preserves existing data on restart).
  const neighborhoodIdByKey = new Map<string, string>();
  if (store.listNeighborhoods().length === 0) {
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
    store.reset({
      users: [],
      neighborhoods: Array.from(recordsByKey.values()),
      plans: [],
      participations: [],
      conversations: [],
      messages: [],
      feedback: [],
      declines: [],
      smsCodes: [],
      logs: [],
      planSuggestions: [],
    });
  } else {
    // Map existing neighborhoods back to keys by name so demo seeding works on restart.
    const nameToKey = new Map(PHILLY_NEIGHBORHOODS.map((n) => [n.name, n.key]));
    for (const record of store.listNeighborhoods()) {
      const key = nameToKey.get(record.name);
      if (key) neighborhoodIdByKey.set(key, record.id);
    }
  }

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

  for (const seed of SEED_PLANS) {
    const creatorId = userIdByPhone.get(seed.creatorPhone);
    const neighborhoodId = neighborhoodIdByKey.get(seed.neighborhoodKey);
    if (!creatorId || !neighborhoodId) continue;

    // Skip if this exact demo plan already exists (idempotent on restart).
    const alreadySeeded = store
      .listPlansByCreator(creatorId)
      .some((p) => p.title === seed.title);
    if (alreadySeeded) continue;

    const date = dateForOffset(seed.daysFromNow);
    const plan = store.createPlan({
      creatorId,
      title: seed.title,
      neighborhoodId,
      location: seed.location,
      date,
      time: seed.time,
      isFlexibleTime: seed.isFlexibleTime,
      isFlexibleLocation: false,
      endTime: isoEndForPlan(date, seed.time, seed.endHoursAfterStart),
      tags: seed.tags,
      description: seed.description,
      hostEmoji: seed.hostEmoji,
      planKind: "standard",
      visibility: "everyone",
      visibilityCommunityTag: null,
      isRecurring: false,
      lockedAt: null,
    });

    const goingIds: string[] = [];
    for (const phone of seed.going) {
      const userId = userIdByPhone.get(phone);
      if (userId) {
        store.upsertParticipation(plan.id, userId, "going");
        goingIds.push(userId);
      }
    }
    for (const phone of seed.interested) {
      const userId = userIdByPhone.get(phone);
      if (userId) store.upsertParticipation(plan.id, userId, "interested");
    }

    if (seed.messages.length > 0 || goingIds.length > 0) {
      const conv = store.ensureGroupConversation(plan.id, [creatorId, ...goingIds]);
      for (const m of seed.messages) {
        const senderId = userIdByPhone.get(m.senderPhone);
        if (!senderId) continue;
        const created = store.createMessage(conv.id, senderId, m.body);
        (created as { createdAt: string }).createdAt = isoMinutesAgo(m.minutesAgo);
      }
    }
  }
}

function seedNeighborhood(seed: SeedNeighborhood) {
  return {
    id: cryptoUuid(),
    name: seed.name,
    metro: seed.metro,
    adjacent: [] as string[],
    lat: seed.lat,
    lng: seed.lng,
  };
}

function cryptoUuid(): string {
  return globalThis.crypto.randomUUID();
}
