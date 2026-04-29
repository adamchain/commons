import { store } from "./store.js";
import type { PlanTag } from "./types/shared.js";

interface SeedUser {
  email: string;
  displayName: string;
}

interface SeedPlan {
  creatorEmail: string;
  title: string;
  location: { name: string; address: string };
  daysFromNow: number;
  time: string;
  isFlexibleTime: boolean;
  tags: PlanTag[];
  description?: string;
  going: string[];
  interested: string[];
  comments: Array<{ authorEmail: string; body: string; minutesAgo: number }>;
}

const SEED_USERS: SeedUser[] = [
  { email: "you@commons.test", displayName: "You" },
  { email: "emma@commons.test", displayName: "Emma Rodriguez" },
  { email: "sarah@commons.test", displayName: "Sarah Chen" },
  { email: "maya@commons.test", displayName: "Maya Patel" },
  { email: "jordan@commons.test", displayName: "Jordan Lee" },
  { email: "chris@commons.test", displayName: "Chris Walker" },
  { email: "riley@commons.test", displayName: "Riley Thompson" },
  { email: "devon@commons.test", displayName: "Devon Brooks" },
];

const SEED_PLANS: SeedPlan[] = [
  {
    creatorEmail: "emma@commons.test",
    title: "Karaoke at Drinker's",
    location: { name: "Drinker's Pub", address: "1903 Chestnut St, Philadelphia, PA" },
    daysFromNow: 2,
    time: "21:00",
    isFlexibleTime: false,
    tags: ["social", "events"],
    description: "Friday night karaoke — no judgment zone!",
    going: ["emma@commons.test", "sarah@commons.test", "maya@commons.test", "jordan@commons.test"],
    interested: ["riley@commons.test", "devon@commons.test"],
    comments: [
      { authorEmail: "sarah@commons.test", body: "I'll be there around 9:30 — saving a booth.", minutesAgo: 220 },
      { authorEmail: "jordan@commons.test", body: "Putting Bohemian Rhapsody in the queue early 🎤", minutesAgo: 90 },
    ],
  },
  {
    creatorEmail: "chris@commons.test",
    title: "Sunday morning run — Schuylkill loop",
    location: { name: "Lloyd Hall", address: "1 Boathouse Row, Philadelphia, PA" },
    daysFromNow: 4,
    time: "08:00",
    isFlexibleTime: false,
    tags: ["workout", "outdoors"],
    description: "Easy 5-miler. We'll regroup at the water fountain by mile 2.",
    going: ["chris@commons.test", "devon@commons.test"],
    interested: ["you@commons.test", "maya@commons.test", "riley@commons.test"],
    comments: [
      { authorEmail: "devon@commons.test", body: "I'll bring extra water bottles.", minutesAgo: 600 },
    ],
  },
  {
    creatorEmail: "maya@commons.test",
    title: "Coffee + co-working at Ultimo",
    location: { name: "Ultimo Coffee", address: "1900 S 15th St, Philadelphia, PA" },
    daysFromNow: 1,
    time: "Flexible",
    isFlexibleTime: true,
    tags: ["coffee", "social"],
    description: "Posting up with my laptop from late morning. Drop in whenever.",
    going: ["maya@commons.test"],
    interested: ["you@commons.test", "sarah@commons.test", "emma@commons.test"],
    comments: [],
  },
  {
    creatorEmail: "riley@commons.test",
    title: "Vietnamese cooking class",
    location: { name: "The Sidecar Bar & Grille", address: "2201 Christian St, Philadelphia, PA" },
    daysFromNow: 7,
    time: "17:00",
    isFlexibleTime: false,
    tags: ["events", "social"],
    description: "Hands-on bún chả workshop. ~$25 ingredients fee at the door.",
    going: ["riley@commons.test", "emma@commons.test"],
    interested: ["jordan@commons.test", "devon@commons.test", "you@commons.test"],
    comments: [
      { authorEmail: "emma@commons.test", body: "Can we carpool from Fishtown?", minutesAgo: 30 },
    ],
  },
  {
    creatorEmail: "jordan@commons.test",
    title: "Trivia at National Mechanics",
    location: { name: "National Mechanics", address: "22 S 3rd St, Philadelphia, PA" },
    daysFromNow: 3,
    time: "19:30",
    isFlexibleTime: false,
    tags: ["social", "events"],
    description: "Need 2 more for our team. Categories lean heavily on 90s pop culture.",
    going: ["jordan@commons.test", "chris@commons.test", "riley@commons.test"],
    interested: ["sarah@commons.test"],
    comments: [],
  },
  {
    creatorEmail: "sarah@commons.test",
    title: "Sunset hike — Wissahickon",
    location: { name: "Valley Green Inn trailhead", address: "Forbidden Dr, Philadelphia, PA" },
    daysFromNow: 5,
    time: "18:00",
    isFlexibleTime: false,
    tags: ["outdoors", "workout"],
    description: "Moderate 3-mile loop, back at the cars before dark.",
    going: ["sarah@commons.test", "maya@commons.test"],
    interested: ["chris@commons.test", "you@commons.test"],
    comments: [],
  },
];

function dateForOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function isoMinutesAgo(minutes: number): string {
  const d = new Date(Date.now() - minutes * 60 * 1000);
  return d.toISOString();
}

export function seedIfEmpty(): void {
  if (!store.isEmpty()) return;

  const userByEmail = new Map<string, string>();
  for (const seed of SEED_USERS) {
    const user = store.upsertUserByEmail(seed.email);
    if (user.displayName !== seed.displayName) {
      // Force the seeded display name on first creation only.
      (user as { displayName: string }).displayName = seed.displayName;
    }
    userByEmail.set(seed.email, user.id);
  }

  for (const seed of SEED_PLANS) {
    const creatorId = userByEmail.get(seed.creatorEmail);
    if (!creatorId) continue;
    const plan = store.createPlan({
      creatorId,
      title: seed.title,
      location: seed.location,
      date: dateForOffset(seed.daysFromNow),
      time: seed.time,
      isFlexibleTime: seed.isFlexibleTime,
      tags: seed.tags,
      description: seed.description,
    });
    for (const email of seed.going) {
      const userId = userByEmail.get(email);
      if (userId) store.upsertParticipation(plan.id, userId, "going");
    }
    for (const email of seed.interested) {
      const userId = userByEmail.get(email);
      if (userId) store.upsertParticipation(plan.id, userId, "interested");
    }
    for (const c of seed.comments) {
      const userId = userByEmail.get(c.authorEmail);
      if (!userId) continue;
      const created = store.createComment(plan.id, userId, c.body);
      (created as { createdAt: string }).createdAt = isoMinutesAgo(c.minutesAgo);
    }
  }
}
