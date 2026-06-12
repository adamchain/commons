// Adds a set of PAST events that adam2 and Nishika did together. For each
// event one of them is the host and the other is a confirmed attendee
// (state "going" + attended=true). Because every event's date is in the
// past and both parties went, this satisfies hasSharedCompletedPlan() —
// unlocking each other's full profile + social links and populating their
// "past" history lists symmetrically (3 hosted each).
//
// Non-destructive + idempotent: skips a plan if its host already has one
// with the same title. Targets the two real verified accounts by phone.
//
// Usage:
//   MONGODB_URI=... npx tsx src/scripts/seedPastTogether.ts

import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo, isMongoConnected } from "../lib/db.js";
import { hydrateSnapshotFromMongo } from "../hydrate.js";
import { mongoMirror } from "../mongoMirror.js";
import { store } from "../store.js";
import type { InterestTag } from "../types/shared.js";
import { findUserByPhone } from "../userRepo.js";

const ADAM2_PHONE = "+14845712062";
const NISHIKA_PHONE = "+16103484589";

interface PastEvent {
  host: "adam2" | "nishika";
  title: string;
  neighborhoodName: string;
  location: { name: string; address: string; lat?: number; lng?: number };
  daysAgo: number;
  time: string; // HH:MM (local-ish, stored UTC)
  durationHours: number;
  tags: InterestTag[];
  description: string;
  hostEmoji: string;
  messages: Array<{ from: "adam2" | "nishika"; body: string; minutesBeforeStart: number }>;
}

const PAST_EVENTS: PastEvent[] = [
  {
    host: "adam2", title: "Coffee + catch up at Ultimo", neighborhoodName: "Graduate Hospital",
    location: { name: "Ultimo Coffee", address: "2149 Catharine St, Philadelphia, PA" },
    daysAgo: 7, time: "10:00", durationHours: 1.5,
    tags: ["coffee_cowork", "food_drinks"], description: "Long overdue coffee. Ended up staying two hours.", hostEmoji: "☕",
    messages: [
      { from: "nishika", body: "Running 5 min late, grabbing a seat?", minutesBeforeStart: 5 },
      { from: "adam2", body: "Got us the corner table by the window 👍", minutesBeforeStart: 3 },
    ],
  },
  {
    host: "nishika", title: "Evening walk · Rittenhouse Square", neighborhoodName: "Center City",
    location: { name: "Rittenhouse Square", address: "1800 Walnut St, Philadelphia, PA", lat: 39.949, lng: -75.171 },
    daysAgo: 12, time: "18:30", durationHours: 1,
    tags: ["wellness", "fitness_outdoors"], description: "Easy loop around the square before dinner.", hostEmoji: "🌳",
    messages: [
      { from: "adam2", body: "Meet by the fountain?", minutesBeforeStart: 20 },
    ],
  },
  {
    host: "adam2", title: "Dinner in the city", neighborhoodName: "Center City",
    location: { name: "Vernick Food & Drink", address: "2031 Walnut St, Philadelphia, PA" },
    daysAgo: 21, time: "19:30", durationHours: 2,
    tags: ["food_drinks"], description: "Tried the new tasting spots — worth it.", hostEmoji: "🍽️",
    messages: [],
  },
  {
    host: "nishika", title: "Art Museum afternoon", neighborhoodName: "Fairmount",
    location: { name: "Philadelphia Museum of Art", address: "2600 Benjamin Franklin Pkwy, Philadelphia, PA" },
    daysAgo: 30, time: "14:00", durationHours: 2.5,
    tags: ["arts_culture"], description: "New exhibit was incredible. Ran the steps after, obviously.", hostEmoji: "🖼️",
    messages: [
      { from: "nishika", body: "I'll grab tickets online so we skip the line", minutesBeforeStart: 60 },
    ],
  },
  {
    host: "adam2", title: "Sunday run along the Schuylkill", neighborhoodName: "Fairmount",
    location: { name: "Schuylkill Banks Trailhead", address: "2500 Walnut St, Philadelphia, PA", lat: 39.9513, lng: -75.182 },
    daysAgo: 40, time: "08:00", durationHours: 1.5,
    tags: ["running", "fitness_outdoors"], description: "Easy 5 miles, coffee after.", hostEmoji: "🏃",
    messages: [],
  },
  {
    host: "nishika", title: "First Friday gallery night", neighborhoodName: "Old City",
    location: { name: "Old City Arts District", address: "N 3rd St & Market St, Philadelphia, PA" },
    daysAgo: 54, time: "18:00", durationHours: 3,
    tags: ["arts_culture", "local_events", "food_drinks"], description: "Hit four galleries then drinks at the corner spot.", hostEmoji: "🎨",
    messages: [
      { from: "adam2", body: "Starting at the flagpole?", minutesBeforeStart: 30 },
      { from: "nishika", body: "Yep — see you there!", minutesBeforeStart: 25 },
    ],
  },
];

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function startIso(date: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const start = new Date(date + "T00:00:00.000Z");
  start.setUTCHours(h, m, 0, 0);
  return start;
}

async function main(): Promise<void> {
  await connectMongo();
  if (!isMongoConnected()) {
    console.error("MONGODB_URI not set / not connected — refusing to seed.");
    process.exit(1);
  }
  console.log("[pastTogether] connected, hydrating snapshot…");
  await hydrateSnapshotFromMongo();

  const adam2 = await findUserByPhone(ADAM2_PHONE);
  const nishika = await findUserByPhone(NISHIKA_PHONE);
  if (!adam2 || !nishika) {
    console.error(
      `[pastTogether] could not find both users. adam2=${adam2?.id ?? "MISSING"} nishika=${nishika?.id ?? "MISSING"}`
    );
    process.exit(1);
  }
  const idFor = (who: "adam2" | "nishika") => (who === "adam2" ? adam2.id : nishika.id);
  console.log(`[pastTogether] adam2=${adam2.id}  nishika=${nishika.id}`);

  const hoodIdByName = new Map<string, string>();
  for (const h of store.listNeighborhoods()) hoodIdByName.set(h.name, h.id);

  let created = 0;
  let skipped = 0;
  for (const ev of PAST_EVENTS) {
    const hostId = idFor(ev.host);
    const guestId = ev.host === "adam2" ? nishika.id : adam2.id;
    const guestWho = ev.host === "adam2" ? "nishika" : "adam2";
    const neighborhoodId = hoodIdByName.get(ev.neighborhoodName);
    if (!neighborhoodId) {
      console.warn(`[pastTogether] no neighborhood "${ev.neighborhoodName}" — skipping "${ev.title}"`);
      continue;
    }

    if (store.listPlansByCreator(hostId).some((p) => p.title === ev.title)) {
      skipped++;
      continue;
    }

    const date = pastDate(ev.daysAgo);
    const start = startIso(date, ev.time);
    const end = new Date(start.getTime() + ev.durationHours * 60 * 60 * 1000);

    const plan = store.createPlan({
      creatorId: hostId,
      title: ev.title,
      neighborhoodId,
      location: ev.location,
      date,
      time: ev.time,
      isFlexibleTime: false,
      isFlexibleLocation: false,
      endTime: end.toISOString(),
      tags: ev.tags,
      description: ev.description,
      hostEmoji: ev.hostEmoji,
      planKind: "standard",
      visibility: "everyone",
      visibilityCommunityTag: null,
      isRecurring: false,
      lockedAt: start.toISOString(), // past plans are locked
    });
    created++;

    // The guest RSVP'd going and is confirmed as attended. The host is the
    // creator — implicitly present (hasSharedCompletedPlan counts the creator).
    store.upsertParticipation(plan.id, guestId, "going");
    store.markAttended(plan.id, guestId, true);

    // Group chat history between the two for this event.
    if (ev.messages.length > 0) {
      const conv = store.ensureGroupConversation(plan.id, [hostId, guestId]);
      for (const m of ev.messages) {
        const senderId = idFor(m.from);
        const msg = store.createMessage(conv.id, senderId, m.body);
        const ts = new Date(start.getTime() - m.minutesBeforeStart * 60 * 1000).toISOString();
        (msg as { createdAt: string }).createdAt = ts;
      }
    }

    console.log(`[pastTogether] + "${ev.title}" (${date}) host=${ev.host} attended=${guestWho}`);
  }

  console.log(`[pastTogether] events: ${created} created, ${skipped} already existed`);
  console.log("[pastTogether] flushing pending mirror writes…");
  await mongoMirror.flushPending();

  await mongoose.disconnect();
  console.log("[pastTogether] done.");
}

main().catch((err) => {
  console.error("[pastTogether] failed", err);
  process.exit(1);
});
