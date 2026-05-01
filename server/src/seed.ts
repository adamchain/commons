import { store } from "./store.js";
import type { InterestTag } from "./types/shared.js";

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
}

const PHOENIX_NEIGHBORHOODS: SeedNeighborhood[] = [
  { key: "arcadia", name: "Arcadia", metro: "Phoenix", adjacentKeys: ["biltmore", "camelback-east"] },
  { key: "biltmore", name: "Biltmore", metro: "Phoenix", adjacentKeys: ["arcadia", "camelback-east"] },
  { key: "camelback-east", name: "Camelback East", metro: "Phoenix", adjacentKeys: ["arcadia", "biltmore", "downtown-phx"] },
  { key: "downtown-phx", name: "Downtown Phoenix", metro: "Phoenix", adjacentKeys: ["camelback-east", "roosevelt-row", "garfield"] },
  { key: "roosevelt-row", name: "Roosevelt Row", metro: "Phoenix", adjacentKeys: ["downtown-phx", "garfield"] },
  { key: "garfield", name: "Garfield", metro: "Phoenix", adjacentKeys: ["roosevelt-row", "downtown-phx"] },
  { key: "tempe", name: "Tempe", metro: "Phoenix", adjacentKeys: ["mill-ave", "old-town-scottsdale"] },
  { key: "mill-ave", name: "Mill Ave", metro: "Phoenix", adjacentKeys: ["tempe"] },
  { key: "old-town-scottsdale", name: "Old Town Scottsdale", metro: "Phoenix", adjacentKeys: ["tempe"] },
];

const SEED_USERS: SeedUser[] = [
  { phoneNumber: "+15555550100", firstName: "You",   neighborhoodKey: "arcadia",        interests: ["coffee", "yoga", "running"], avatarSeed: "you-seed" },
  { phoneNumber: "+15555550101", firstName: "Jamie", neighborhoodKey: "arcadia",        interests: ["yoga", "coffee", "brunch"],  avatarSeed: "jamie-seed" },
  { phoneNumber: "+15555550102", firstName: "Sam",   neighborhoodKey: "biltmore",       interests: ["lifting", "running", "drinks"], avatarSeed: "sam-seed" },
  { phoneNumber: "+15555550103", firstName: "Alex",  neighborhoodKey: "downtown-phx",   interests: ["music", "drinks", "art"],    avatarSeed: "alex-seed" },
  { phoneNumber: "+15555550104", firstName: "Riley", neighborhoodKey: "roosevelt-row",  interests: ["art", "coffee", "books"],    avatarSeed: "riley-seed" },
  { phoneNumber: "+15555550105", firstName: "Pat",   neighborhoodKey: "tempe",          interests: ["biking", "hiking", "running"], avatarSeed: "pat-seed" },
  { phoneNumber: "+15555550106", firstName: "Sky",   neighborhoodKey: "old-town-scottsdale", interests: ["brunch", "drinks", "music"], avatarSeed: "sky-seed" },
  { phoneNumber: "+15555550107", firstName: "Dee",   neighborhoodKey: "garfield",       interests: ["games", "books", "coffee"],  avatarSeed: "dee-seed" },
];

const SEED_PLANS: SeedPlan[] = [
  {
    creatorPhone: "+15555550101",
    title: "Yoga in Encanto Park",
    neighborhoodKey: "downtown-phx",
    location: { name: "Encanto Park", address: "2605 N 15th Ave, Phoenix, AZ", lat: 33.4751, lng: -112.0922 },
    daysFromNow: 3,
    time: "09:00",
    isFlexibleTime: true,
    endHoursAfterStart: 1,
    tags: ["yoga", "coffee"],
    description: "Bring a mat. Coffee after at Songbird if anyone's down.",
    hostEmoji: "🧘",
    going: ["+15555550101", "+15555550100", "+15555550104", "+15555550107"],
    interested: ["+15555550102", "+15555550106"],
    messages: [
      { senderPhone: "+15555550104", body: "What's the parking situation?", minutesAgo: 220 },
      { senderPhone: "+15555550101", body: "Lot off 15th is free on weekends.", minutesAgo: 90 },
    ],
  },
  {
    creatorPhone: "+15555550102",
    title: "Sunrise run — Camelback Mountain",
    neighborhoodKey: "biltmore",
    location: { name: "Echo Canyon Trailhead", address: "5700 N Echo Canyon Pkwy, Phoenix, AZ", lat: 33.5191, lng: -112.0072 },
    daysFromNow: 1,
    time: "05:30",
    isFlexibleTime: false,
    endHoursAfterStart: 2,
    tags: ["running", "hiking"],
    description: "Echo Canyon to summit. Easy regroup at the saddle for slower runners.",
    hostEmoji: "🏃",
    going: ["+15555550102", "+15555550105"],
    interested: ["+15555550100", "+15555550101"],
    messages: [],
  },
  {
    creatorPhone: "+15555550103",
    title: "Live music at Crescent Ballroom",
    neighborhoodKey: "downtown-phx",
    location: { name: "Crescent Ballroom", address: "308 N 2nd Ave, Phoenix, AZ", lat: 33.4533, lng: -112.0780 },
    daysFromNow: 2,
    time: "20:00",
    isFlexibleTime: false,
    tags: ["music", "drinks"],
    description: "Local indie showcase. $10 cover, cash bar.",
    hostEmoji: "🎶",
    going: ["+15555550103", "+15555550106", "+15555550104"],
    interested: ["+15555550107", "+15555550100"],
    messages: [
      { senderPhone: "+15555550106", body: "Doors at 7? Or 8?", minutesAgo: 30 },
      { senderPhone: "+15555550103", body: "Doors 7, music starts 8.", minutesAgo: 25 },
    ],
  },
  {
    creatorPhone: "+15555550104",
    title: "First Friday gallery walk",
    neighborhoodKey: "roosevelt-row",
    location: { name: "Roosevelt Row", address: "Roosevelt St & 2nd St, Phoenix, AZ" },
    daysFromNow: 5,
    time: "Flexible",
    isFlexibleTime: true,
    tags: ["art", "music"],
    description: "Loose plan — meet at MonOrchid then drift down the row.",
    hostEmoji: "🎨",
    going: ["+15555550104"],
    interested: ["+15555550100", "+15555550107", "+15555550103"],
    messages: [],
  },
  {
    creatorPhone: "+15555550105",
    title: "Bike loop around Tempe Town Lake",
    neighborhoodKey: "tempe",
    location: { name: "Tempe Beach Park", address: "80 W Rio Salado Pkwy, Tempe, AZ", lat: 33.4308, lng: -111.9434 },
    daysFromNow: 4,
    time: "07:00",
    isFlexibleTime: false,
    endHoursAfterStart: 2,
    tags: ["biking"],
    description: "Casual pace, ~15 miles total with a coffee stop halfway.",
    hostEmoji: "🚴",
    going: ["+15555550105", "+15555550102"],
    interested: ["+15555550100"],
    messages: [],
  },
  {
    creatorPhone: "+15555550106",
    title: "Brunch at The Henry",
    neighborhoodKey: "old-town-scottsdale",
    location: { name: "The Henry", address: "4455 E Camelback Rd, Phoenix, AZ", lat: 33.5095, lng: -111.9831 },
    daysFromNow: 6,
    time: "11:00",
    isFlexibleTime: false,
    tags: ["brunch", "coffee"],
    description: "Got a 6-top reserved. Two open spots.",
    hostEmoji: "🥞",
    going: ["+15555550106", "+15555550103", "+15555550101", "+15555550104"],
    interested: ["+15555550100"],
    messages: [
      { senderPhone: "+15555550103", body: "Lactose-free option?", minutesAgo: 600 },
    ],
  },
  {
    creatorPhone: "+15555550107",
    title: "Board game night",
    neighborhoodKey: "garfield",
    location: { name: "Snakes & Lattes", address: "302 E Pierce St, Phoenix, AZ" },
    daysFromNow: 2,
    time: "19:00",
    isFlexibleTime: false,
    tags: ["games", "drinks"],
    description: "Bringing Catan + Codenames. Open to whatever else people want to play.",
    hostEmoji: "🎲",
    going: ["+15555550107", "+15555550100"],
    interested: ["+15555550104"],
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
  // time like "09:00" — combine with date
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

export function seedIfEmpty(): void {
  if (!store.isEmpty()) return;

  // Neighborhoods first — we need the ids to assign users + plans.
  const neighborhoodIdByKey = new Map<string, string>();
  // Two-pass: create records with empty adjacent, then fill adjacent ids.
  const recordsByKey = new Map<string, ReturnType<typeof seedNeighborhood>>();
  for (const n of PHOENIX_NEIGHBORHOODS) {
    const record = seedNeighborhood(n);
    neighborhoodIdByKey.set(n.key, record.id);
    recordsByKey.set(n.key, record);
  }
  for (const n of PHOENIX_NEIGHBORHOODS) {
    const record = recordsByKey.get(n.key);
    if (!record) continue;
    record.adjacent = n.adjacentKeys
      .map((k) => neighborhoodIdByKey.get(k))
      .filter((id): id is string => Boolean(id));
  }
  // Persist neighborhoods now that adjacency is filled.
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
  });

  // Users
  const userIdByPhone = new Map<string, string>();
  for (const seed of SEED_USERS) {
    const neighborhoodId = neighborhoodIdByKey.get(seed.neighborhoodKey) ?? null;
    const user = store.createUser(seed.phoneNumber);
    store.updateUser(user.id, {
      firstName: seed.firstName,
      neighborhoodId,
      interests: seed.interests,
      avatarSeed: seed.avatarSeed,
      avatarStyle: "avataaars",
      onboardingComplete: true,
    });
    userIdByPhone.set(seed.phoneNumber, user.id);
  }

  // Plans + participations + chat
  for (const seed of SEED_PLANS) {
    const creatorId = userIdByPhone.get(seed.creatorPhone);
    const neighborhoodId = neighborhoodIdByKey.get(seed.neighborhoodKey);
    if (!creatorId || !neighborhoodId) continue;

    const date = dateForOffset(seed.daysFromNow);
    const plan = store.createPlan({
      creatorId,
      title: seed.title,
      neighborhoodId,
      location: seed.location,
      date,
      time: seed.time,
      isFlexibleTime: seed.isFlexibleTime,
      endTime: isoEndForPlan(date, seed.time, seed.endHoursAfterStart),
      tags: seed.tags,
      description: seed.description,
      hostEmoji: seed.hostEmoji,
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
  };
}

function cryptoUuid(): string {
  // Lazy require to avoid top-level import cycle in tests.
  return globalThis.crypto.randomUUID();
}
