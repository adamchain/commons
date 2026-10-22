import mongoose from "mongoose";
import { INVITE_CODES_PER_USER, store } from "./store.js";
// All user reads/writes go through the in-memory `store` snapshot. The store
// mirrors writes to Mongo via `mongoMirror`, and `hydrateSnapshotFromMongo`
// loads users back from Mongo on cold start. One source of truth for reads
// (snapshot), one for durable persistence (Mongo).
export async function findUserById(id) {
    return store.findUserById(id);
}
export async function findUserByPhone(phoneNumber) {
    return store.findUserByPhone(phoneNumber);
}
export async function listAllUsers() {
    return store.listUsers().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function findUsersByIds(ids) {
    const unique = [...new Set(ids)];
    const map = new Map();
    for (const id of unique) {
        const u = store.findUserById(id);
        if (u)
            map.set(id, u);
    }
    return map;
}
export async function createUser(phoneNumber, opts) {
    const user = store.createUser(phoneNumber, opts);
    store.createInviteCodesForUser(user.id, INVITE_CODES_PER_USER);
    return user;
}
export async function updateUser(id, patch) {
    // Strip undefined (don't touch). Pass null through — store + mongoMirror
    // both store it as null, which all readers treat as falsy.
    const cleaned = {};
    for (const [k, v] of Object.entries(patch)) {
        if (v === undefined)
            continue;
        cleaned[k] = v;
    }
    return store.updateUser(id, cleaned);
}
export async function deleteUser(id) {
    return store.deleteUserCascade(id);
}
/** Used when shutting down tests or scripts (optional). */
export async function disconnectMongo() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
}
