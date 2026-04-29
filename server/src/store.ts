import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ParticipationState, PlanTag } from "./types/shared.js";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface PlanRecord {
  id: string;
  creatorId: string;
  title: string;
  location: { name: string; address: string };
  date: string;
  time: string;
  isFlexibleTime: boolean;
  tags: PlanTag[];
  description?: string;
  createdAt: string;
}

export interface ParticipationRecord {
  id: string;
  planId: string;
  userId: string;
  state: ParticipationState;
  updatedAt: string;
}

export interface CommentRecord {
  id: string;
  planId: string;
  userId: string;
  body: string;
  createdAt: string;
}

export interface LogRecord {
  id: string;
  event: string;
  payload: unknown;
  createdAt: string;
}

interface Snapshot {
  users: UserRecord[];
  plans: PlanRecord[];
  participations: ParticipationRecord[];
  comments: CommentRecord[];
  logs: LogRecord[];
}

const DATA_PATH = resolve(process.cwd(), "data.json");

function emptySnapshot(): Snapshot {
  return { users: [], plans: [], participations: [], comments: [], logs: [] };
}

function load(): Snapshot {
  if (!existsSync(DATA_PATH)) return emptySnapshot();
  try {
    const raw = readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    return {
      users: parsed.users ?? [],
      plans: parsed.plans ?? [],
      participations: parsed.participations ?? [],
      comments: parsed.comments ?? [],
      logs: parsed.logs ?? [],
    };
  } catch {
    return emptySnapshot();
  }
}

let snapshot: Snapshot = load();

function persist(): void {
  mkdirSync(dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, JSON.stringify(snapshot, null, 2));
}

export const store = {
  reset(next: Snapshot): void {
    snapshot = next;
    persist();
  },

  isEmpty(): boolean {
    return snapshot.users.length === 0 && snapshot.plans.length === 0;
  },

  // Users
  listUsers(): UserRecord[] {
    return [...snapshot.users];
  },
  findUserById(id: string): UserRecord | undefined {
    return snapshot.users.find((u) => u.id === id);
  },
  findUserByEmail(email: string): UserRecord | undefined {
    const lower = email.toLowerCase();
    return snapshot.users.find((u) => u.email.toLowerCase() === lower);
  },
  upsertUserByEmail(email: string): UserRecord {
    const existing = this.findUserByEmail(email);
    if (existing) return existing;
    const lower = email.toLowerCase();
    const user: UserRecord = {
      id: randomUUID(),
      email: lower,
      displayName: deriveDisplayName(lower),
      createdAt: new Date().toISOString(),
    };
    snapshot.users.push(user);
    persist();
    return user;
  },

  // Plans
  listPlans(): PlanRecord[] {
    return [...snapshot.plans].sort((a, b) => a.date.localeCompare(b.date));
  },
  findPlanById(id: string): PlanRecord | undefined {
    return snapshot.plans.find((p) => p.id === id);
  },
  createPlan(input: Omit<PlanRecord, "id" | "createdAt">): PlanRecord {
    const plan: PlanRecord = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    snapshot.plans.push(plan);
    persist();
    return plan;
  },

  // Participations
  listParticipationsForPlan(planId: string): ParticipationRecord[] {
    return snapshot.participations.filter((p) => p.planId === planId);
  },
  findParticipation(planId: string, userId: string): ParticipationRecord | undefined {
    return snapshot.participations.find((p) => p.planId === planId && p.userId === userId);
  },
  upsertParticipation(planId: string, userId: string, state: ParticipationState): ParticipationRecord {
    const existing = this.findParticipation(planId, userId);
    if (existing) {
      existing.state = state;
      existing.updatedAt = new Date().toISOString();
      persist();
      return existing;
    }
    const record: ParticipationRecord = {
      id: randomUUID(),
      planId,
      userId,
      state,
      updatedAt: new Date().toISOString(),
    };
    snapshot.participations.push(record);
    persist();
    return record;
  },
  deleteParticipation(planId: string, userId: string): void {
    snapshot.participations = snapshot.participations.filter(
      (p) => !(p.planId === planId && p.userId === userId)
    );
    persist();
  },

  // Comments
  listCommentsForPlan(planId: string): CommentRecord[] {
    return snapshot.comments
      .filter((c) => c.planId === planId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  createComment(planId: string, userId: string, body: string): CommentRecord {
    const comment: CommentRecord = {
      id: randomUUID(),
      planId,
      userId,
      body,
      createdAt: new Date().toISOString(),
    };
    snapshot.comments.push(comment);
    persist();
    return comment;
  },

  // Logs
  log(event: string, payload: unknown): void {
    snapshot.logs.push({
      id: randomUUID(),
      event,
      payload,
      createdAt: new Date().toISOString(),
    });
    persist();
  },
};

function deriveDisplayName(email: string): string {
  const handle = email.split("@")[0] ?? "friend";
  return handle
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Friend";
}
