// Pull every collection out of Mongo into the in-memory snapshot so the sync
// `store` reads see prod data after a cold start. Called once after Mongo
// connects in index.ts. If Mongo isn't connected, this is a no-op and the
// snapshot keeps whatever it loaded from data.json (local dev).

import { isMongoConnected } from "./lib/db.js";
import {
  ConversationModel,
  DeclineModel,
  FeedbackModel,
  LogModel,
  MessageModel,
  NeighborhoodModel,
  ParticipationModel,
  PlanModel,
  PlanSuggestionModel,
} from "./models/index.js";
import { UserModel } from "./models/User.js";
import { store } from "./store.js";

export async function hydrateSnapshotFromMongo(): Promise<void> {
  if (!isMongoConnected()) {
    console.log("[hydrate] Mongo not connected — skipping (snapshot stays as-is from data.json).");
    return;
  }
  try {
    const [
      users,
      neighborhoods,
      plans,
      participations,
      conversations,
      messages,
      planSuggestions,
      feedback,
      declines,
      logs,
    ] = await Promise.all([
      UserModel.find({}).lean(),
      NeighborhoodModel.find({}).lean(),
      PlanModel.find({}).lean(),
      ParticipationModel.find({}).lean(),
      ConversationModel.find({}).lean(),
      MessageModel.find({}).lean(),
      PlanSuggestionModel.find({}).lean(),
      FeedbackModel.find({}).lean(),
      DeclineModel.find({}).lean(),
      LogModel.find({}).sort({ createdAt: -1 }).limit(500).lean(),
    ]);

    // `reset` replaces the snapshot wholesale. We bypass mirror here — Mongo
    // already has the data; mirroring again would be a no-op writeback storm.
    store.resetLocalOnly({
      users,
      neighborhoods,
      plans,
      participations,
      conversations,
      messages,
      planSuggestions,
      feedback,
      declines,
      smsCodes: [],
      logs,
    });

    console.log(
      `[hydrate] loaded from Mongo: ${users.length} users, ${neighborhoods.length} hoods, ${plans.length} plans, ${participations.length} rsvps, ${conversations.length} convos, ${messages.length} msgs`,
    );
  } catch (err) {
    console.error("[hydrate] failed to load from Mongo — running with stale snapshot", err);
  }
}
