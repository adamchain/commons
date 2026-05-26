// Write-through mirror to Mongo. Every store mutation calls into here so the
// in-memory snapshot stays fast for sync reads while Mongo stays durable.
//
// All functions are fire-and-forget — they swallow errors and log them. The
// reasoning: routes are sync and shouldn't fail because of a transient Mongo
// hiccup. The snapshot is still correct; on next restart, hydration pulls the
// authoritative state back from Mongo, so a missed write reconciles itself
// only if it persisted to data.json. In production where data.json is
// ephemeral, a swallowed write is a real data loss — so we log loudly.
//
// When Mongo isn't connected (local dev with no MONGODB_URI), every function
// is a no-op and the local `data.json` is the only persistence.

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
import { InviteCodeModel } from "./models/InviteCode.js";
import { NotificationModel } from "./models/Notification.js";
import { RelationshipModel } from "./models/Relationship.js";
import { UserModel } from "./models/User.js";
import type {
  ConversationRecord,
  DeclineRecord,
  FeedbackRecord,
  InviteCodeRecord,
  LogRecord,
  MessageRecord,
  NeighborhoodRecord,
  NotificationRecord,
  ParticipationRecord,
  PlanRecord,
  PlanSuggestionRecord,
  RelationshipRecord,
  UserRecord,
} from "./store.js";

function fail(tag: string, err: unknown): void {
  console.error(`[mongoMirror] ${tag} failed`, err);
}

// Track in-flight writes so callers (notably one-shot scripts) can wait for
// them to drain before disconnecting. In the running server we never call
// flush — writes proceed in the background and Mongo stays connected.
const pending = new Set<Promise<unknown>>();

function track<T>(p: Promise<T>): Promise<T> {
  pending.add(p);
  void p.finally(() => pending.delete(p));
  return p;
}

// Each upsert keys on our `id` field. We use $set so partial documents update
// cleanly, and `upsert: true` so write-through doubles as create-if-absent.
function upsert<T extends { id: string }>(
  model: { updateOne: (...args: unknown[]) => { exec: () => Promise<unknown> } },
  record: T,
  tag: string,
): void {
  if (!isMongoConnected()) return;
  const p = (
    model as unknown as {
      updateOne: (
        filter: object,
        update: object,
        opts: object,
      ) => { exec: () => Promise<unknown> };
    }
  )
    .updateOne({ id: record.id }, { $set: record }, { upsert: true })
    .exec()
    .catch((err) => fail(tag, err));
  track(p);
}

function removeById(
  model: { deleteOne: (...args: unknown[]) => { exec: () => Promise<unknown> } },
  id: string,
  tag: string,
): void {
  if (!isMongoConnected()) return;
  const p = (
    model as unknown as {
      deleteOne: (filter: object) => { exec: () => Promise<unknown> };
    }
  )
    .deleteOne({ id })
    .exec()
    .catch((err) => fail(tag, err));
  track(p);
}

export const mongoMirror = {
  // Users
  upsertUser(u: UserRecord): void {
    upsert(UserModel as never, u, `upsertUser ${u.id}`);
  },

  // Neighborhoods
  upsertNeighborhood(n: NeighborhoodRecord): void {
    upsert(NeighborhoodModel as never, n, `upsertNeighborhood ${n.id}`);
  },
  replaceAllNeighborhoods(list: NeighborhoodRecord[]): void {
    if (!isMongoConnected()) return;
    const p = (async () => {
      try {
        await NeighborhoodModel.deleteMany({}).exec();
        if (list.length > 0) await NeighborhoodModel.insertMany(list, { ordered: false });
      } catch (err) {
        fail("replaceAllNeighborhoods", err);
      }
    })();
    track(p);
  },

  // Plans
  upsertPlan(p: PlanRecord): void {
    upsert(PlanModel as never, p, `upsertPlan ${p.id}`);
  },
  deletePlan(id: string): void {
    removeById(PlanModel as never, id, `deletePlan ${id}`);
  },

  // Participations — keyed by id (UUID), unique on (planId, userId).
  upsertParticipation(row: ParticipationRecord): void {
    upsert(ParticipationModel as never, row, `upsertParticipation ${row.id}`);
  },
  deleteParticipation(planId: string, userId: string): void {
    if (!isMongoConnected()) return;
    const p = ParticipationModel.deleteOne({ planId, userId })
      .exec()
      .catch((err) => fail(`deleteParticipation ${planId}/${userId}`, err));
    track(p);
  },

  /**
   * Await all in-flight mirror writes. Used by one-shot scripts before they
   * disconnect. In the long-running server we don't call this — writes drain
   * naturally as the server keeps Mongo connected.
   */
  async flushPending(): Promise<void> {
    while (pending.size > 0) {
      await Promise.allSettled([...pending]);
    }
  },

  // Conversations + Messages
  upsertConversation(c: ConversationRecord): void {
    upsert(ConversationModel as never, c, `upsertConversation ${c.id}`);
  },
  upsertMessage(m: MessageRecord): void {
    upsert(MessageModel as never, m, `upsertMessage ${m.id}`);
  },

  // Plan suggestions
  upsertPlanSuggestion(s: PlanSuggestionRecord): void {
    upsert(PlanSuggestionModel as never, s, `upsertPlanSuggestion ${s.id}`);
  },

  // Feedback
  upsertFeedback(f: FeedbackRecord): void {
    upsert(FeedbackModel as never, f, `upsertFeedback ${f.id}`);
  },

  // Declines
  upsertDecline(d: DeclineRecord): void {
    upsert(DeclineModel as never, d, `upsertDecline ${d.id}`);
  },

  // Logs
  upsertLog(l: LogRecord): void {
    upsert(LogModel as never, l, `upsertLog ${l.id}`);
  },

  // Notifications
  upsertNotification(n: NotificationRecord): void {
    upsert(NotificationModel as never, n, `upsertNotification ${n.id}`);
  },

  // Relationships
  upsertRelationship(r: RelationshipRecord): void {
    upsert(RelationshipModel as never, r, `upsertRelationship ${r.id}`);
  },
  deleteRelationship(userId: string, targetId: string, kind: RelationshipRecord["kind"]): void {
    if (!isMongoConnected()) return;
    const p = RelationshipModel.deleteOne({ userId, targetId, kind })
      .exec()
      .catch((err) => fail(`deleteRelationship ${userId}/${targetId}/${kind}`, err));
    track(p);
  },

  // Invite codes
  upsertInviteCode(c: InviteCodeRecord): void {
    upsert(InviteCodeModel as never, c, `upsertInviteCode ${c.id}`);
  },
};
