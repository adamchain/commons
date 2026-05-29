import { store } from "./store.js";
import type { CommunityCategory, PlanTag } from "./types/shared.js";

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

interface SeedCommunity {
  name: string;
  category: CommunityCategory;
  neighborhood: string;
  blurb: string;
  cadence: string;
  memberCount: number;
  tags: string[];
  link?: string;
  lat: number;
  lng: number;
}

// Curated local communities. These don't exist in OpenStreetMap, so unlike
// venues (fetched live on the client) they live in the store. Coordinates are
// real Philadelphia neighborhoods so distance sorting behaves sensibly.
const SEED_COMMUNITIES: SeedCommunity[] = [
  {
    name: "Schuylkill Sunrise Runners",
    category: "running",
    neighborhood: "Fairmount",
    blurb: "No-drop social runs along Boathouse Row. All paces welcome, coffee after.",
    cadence: "Tue & Sat mornings",
    memberCount: 240,
    tags: ["beginner-friendly", "5k", "free"],
    lat: 39.9684,
    lng: -75.1814,
  },
  {
    name: "South Philly Cyclists",
    category: "cycling",
    neighborhood: "East Passyunk",
    blurb: "Weekend group rides and casual bike maintenance nights. Helmets, not egos.",
    cadence: "Weekly",
    memberCount: 410,
    tags: ["road", "casual", "maintenance"],
    lat: 39.9265,
    lng: -75.1659,
  },
  {
    name: "Rittenhouse Reads",
    category: "books",
    neighborhood: "Rittenhouse",
    blurb: "A friendly book club rotating between fiction and narrative non-fiction.",
    cadence: "Monthly",
    memberCount: 86,
    tags: ["fiction", "discussion", "wine"],
    lat: 39.9495,
    lng: -75.1718,
  },
  {
    name: "Fishtown Coffee Society",
    category: "coffee",
    neighborhood: "Fishtown",
    blurb: "Cafe crawls and home-brew tastings for people who take their pour-over seriously.",
    cadence: "Every other week",
    memberCount: 158,
    tags: ["pour-over", "cafe-crawl", "tastings"],
    lat: 39.9712,
    lng: -75.1342,
  },
  {
    name: "Old City Sketch Club",
    category: "art",
    neighborhood: "Old City",
    blurb: "Bring a sketchbook — we draw at galleries, parks, and the occasional dive bar.",
    cadence: "Weekly",
    memberCount: 132,
    tags: ["drawing", "all-levels", "social"],
    lat: 39.9505,
    lng: -75.1438,
  },
  {
    name: "West Philly Vinyl Heads",
    category: "music",
    neighborhood: "University City",
    blurb: "Record swaps and listening nights spanning jazz, soul, and everything dusty.",
    cadence: "Monthly",
    memberCount: 204,
    tags: ["vinyl", "listening-party", "swap"],
    lat: 39.9522,
    lng: -75.2024,
  },
  {
    name: "Italian Market Supper Club",
    category: "food",
    neighborhood: "Bella Vista",
    blurb: "Shop the market together, then cook a shared meal. Skill optional, appetite required.",
    cadence: "Monthly",
    memberCount: 97,
    tags: ["cooking", "potluck", "market"],
    lat: 39.9357,
    lng: -75.1587,
  },
  {
    name: "Northern Liberties Newcomers",
    category: "social",
    neighborhood: "Northern Liberties",
    blurb: "New to the city? Low-key hangs, trivia nights, and patio meetups to find your people.",
    cadence: "Weekly",
    memberCount: 312,
    tags: ["new-in-town", "meetup", "casual"],
    lat: 39.9637,
    lng: -75.1419,
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

// Communities seed independently of plans/users so the Explore page is
// populated even on data files created before this feature existed.
export function seedCommunitiesIfEmpty(): void {
  if (!store.communitiesEmpty()) return;
  for (const seed of SEED_COMMUNITIES) {
    store.addCommunity({
      name: seed.name,
      category: seed.category,
      neighborhood: seed.neighborhood,
      blurb: seed.blurb,
      cadence: seed.cadence,
      memberCount: seed.memberCount,
      tags: seed.tags,
      link: seed.link,
      lat: seed.lat,
      lng: seed.lng,
    });
  }
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
