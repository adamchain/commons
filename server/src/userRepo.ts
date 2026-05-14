import mongoose from "mongoose";
import { store, type UserRecord } from "./store.js";

// A patch value of `null` for an optional field is treated as "clear it" —
// distinct from `undefined`, which means "leave it alone." Toggling between
// photo and preset avatars relies on this.
//
// We persist `null` in both the snapshot and Mongo (rather than $unset). All
// readers check `if (photoDataUrl)` so null and missing behave identically.
export type UserPatch = Partial<Omit<UserRecord, "id" | "createdAt" | "avatarPhotoDataUrl" | "avatarParams">> & {
  avatarPhotoDataUrl?: string | null;
  avatarParams?: string | null;
};

export type CreateUserOptions = { accountSource?: "verify" | "seed" };

// All user reads/writes go through the in-memory `store` snapshot. The store
// mirrors writes to Mongo via `mongoMirror`, and `hydrateSnapshotFromMongo`
// loads users back from Mongo on cold start. One source of truth for reads
// (snapshot), one for durable persistence (Mongo).

export async function findUserById(id: string): Promise<UserRecord | undefined> {
  return store.findUserById(id);
}

export async function findUserByPhone(phoneNumber: string): Promise<UserRecord | undefined> {
  return store.findUserByPhone(phoneNumber);
}

export async function listAllUsers(): Promise<UserRecord[]> {
  return store.listUsers().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findUsersByIds(ids: string[]): Promise<Map<string, UserRecord>> {
  const unique = [...new Set(ids)];
  const map = new Map<string, UserRecord>();
  for (const id of unique) {
    const u = store.findUserById(id);
    if (u) map.set(id, u);
  }
  return map;
}

export async function createUser(
  phoneNumber: string,
  opts?: CreateUserOptions,
): Promise<UserRecord> {
  return store.createUser(phoneNumber, opts);
}

export async function updateUser(id: string, patch: UserPatch): Promise<UserRecord | undefined> {
  // Strip undefined (don't touch). Pass null through — store + mongoMirror
  // both store it as null, which all readers treat as falsy.
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    cleaned[k] = v;
  }
  return store.updateUser(id, cleaned as Partial<Omit<UserRecord, "id" | "createdAt">>);
}

/** Used when shutting down tests or scripts (optional). */
export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
