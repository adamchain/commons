import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mongoMirror } from "./mongoMirror.js";
import { normalizeCommunityCategory, parseCommunityCategories } from "./types/shared.js";
export const HELP_TICKET_SECTIONS = ["general", "plans", "communities", "messages", "profile", "feed"];
export const HELP_TICKET_SECTION_LABELS = {
    general: "General",
    plans: "Plans",
    communities: "Communities",
    messages: "Messages",
    profile: "Profile",
    feed: "Feed",
};
/** How long a resolved help ticket stays on the member's help page. */
export const HELP_TICKET_RESOLVED_VISIBLE_MS = 24 * 60 * 60 * 1000;
export function isHelpTicketSection(value) {
    return HELP_TICKET_SECTIONS.includes(value);
}
export function helpTicketVisibleToUser(ticket, now = Date.now()) {
    if (ticket.status !== "resolved")
        return true;
    if (!ticket.resolvedAt)
        return false;
    const resolved = Date.parse(ticket.resolvedAt);
    if (Number.isNaN(resolved))
        return false;
    return now - resolved < HELP_TICKET_RESOLVED_VISIBLE_MS;
}
const DATA_PATH = resolve(process.cwd(), "data.json");
function emptySnapshot() {
    return {
        users: [],
        neighborhoods: [],
        plans: [],
        participations: [],
        conversations: [],
        messages: [],
        feedback: [],
        declines: [],
        dropouts: [],
        smsCodes: [],
        logs: [],
        reports: [],
        helpTickets: [],
        planSuggestions: [],
        notifications: [],
        relationships: [],
        inviteCodes: [],
        cardImages: [],
        communities: [],
        communityMembers: [],
        communityPosts: [],
        communityPostLikes: [],
        interestForums: [],
        forumMemberships: [],
        forumPosts: [],
        forumReplies: [],
        forumPostLikes: [],
        devices: [],
    };
}
// Crockford-style base32 alphabet — drops 0/O/I/L/U to keep codes legible when
// shared via text or read aloud at a launch event. 32^6 ≈ 1.07B values.
const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const INVITE_CODE_LENGTH = 6;
export const INVITE_CODES_PER_USER = 5;
// Launch forums only for the highest-density interests (2.6) — everything
// else stays a feed filter until it earns a dedicated forum. "Join more
// forums" in Settings still surfaces the full ALL_INTERESTS set; picking one
// outside this subset just filters the feed, it doesn't spin up a forum.
export const FORUM_INTERESTS = [
    "coffee",
    "food",
    "drinks",
    "events",
    "night_out",
    "music",
    "books",
    "walks",
    "workouts",
    "new_to_philly",
];
function generateInviteCode() {
    let s = "";
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
        s += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
    }
    return s;
}
/** Normalize user input — uppercase, strip whitespace + dashes. */
export function normalizeInviteCode(raw) {
    return raw.toUpperCase().replace(/[\s-]/g, "");
}
function load() {
    if (!existsSync(DATA_PATH))
        return emptySnapshot();
    try {
        const raw = readFileSync(DATA_PATH, "utf8");
        const parsed = JSON.parse(raw);
        return {
            ...emptySnapshot(),
            ...parsed,
            planSuggestions: parsed.planSuggestions ?? [],
            notifications: parsed.notifications ?? [],
            relationships: parsed.relationships ?? [],
            inviteCodes: parsed.inviteCodes ?? [],
            dropouts: parsed.dropouts ?? [],
            cardImages: parsed.cardImages ?? [],
            communities: parsed.communities ?? [],
            communityMembers: parsed.communityMembers ?? [],
            communityPosts: parsed.communityPosts ?? [],
            communityPostLikes: parsed.communityPostLikes ?? [],
            interestForums: parsed.interestForums ?? [],
            forumMemberships: parsed.forumMemberships ?? [],
            forumPosts: parsed.forumPosts ?? [],
            forumReplies: parsed.forumReplies ?? [],
            forumPostLikes: parsed.forumPostLikes ?? [],
            devices: parsed.devices ?? [],
            reports: parsed.reports ?? [],
            helpTickets: parsed.helpTickets ?? [],
        };
    }
    catch {
        return emptySnapshot();
    }
}
let snapshot = load();
// O(1) indexes — rebuilt on load and maintained on every write.
let userIndex = new Map();
let messagesByConvIndex = new Map();
let messageIndex = new Map();
function rebuildIndexes() {
    userIndex = new Map(snapshot.users.map((u) => [u.id, u]));
    messagesByConvIndex = new Map();
    messageIndex = new Map();
    for (const m of snapshot.messages) {
        messageIndex.set(m.id, m);
        const bucket = messagesByConvIndex.get(m.conversationId);
        if (bucket)
            bucket.push(m);
        else
            messagesByConvIndex.set(m.conversationId, [m]);
    }
    for (const bucket of messagesByConvIndex.values()) {
        bucket.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
}
rebuildIndexes();
function persist() {
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    writeFileSync(DATA_PATH, JSON.stringify(snapshot, null, 2));
}
export const store = {
    /**
     * Replace the snapshot WITHOUT persisting or mirroring. Used exclusively by
     * `hydrateSnapshotFromMongo` — Mongo already holds this state, so writing
     * data.json or re-mirroring would be wasted IO / writeback noise.
     */
    resetLocalOnly(next) {
        snapshot = next;
        rebuildIndexes();
    },
    /**
     * Idempotent neighborhood bootstrap. Called from the seed when the static
     * neighborhood list isn't yet present. Replaces only the neighborhoods
     * collection — never touches users/plans/etc., so seeding on a partially
     * populated Mongo doesn't wipe real data.
     */
    seedNeighborhoods(list) {
        snapshot.neighborhoods = list;
        persist();
        mongoMirror.replaceAllNeighborhoods(list);
    },
    isEmpty() {
        return snapshot.users.length === 0 && snapshot.plans.length === 0;
    },
    // Users
    listUsers() {
        return [...snapshot.users];
    },
    findUserById(id) {
        return userIndex.get(id);
    },
    findUserByPhone(phoneNumber) {
        return snapshot.users.find((u) => u.phoneNumber === phoneNumber);
    },
    createUser(phoneNumber, opts) {
        const user = {
            id: randomUUID(),
            phoneNumber,
            accountSource: opts?.accountSource ?? "verify",
            firstName: "",
            neighborhoodId: null,
            neighborhoodIds: [],
            interests: [],
            avatarSeed: randomUUID(),
            avatarStyle: "avataaars",
            avatarPhotoDataUrl: undefined,
            onboardingComplete: false,
            createdAt: new Date().toISOString(),
            networkIds: [],
            dismissedNetworkPromptPlanIds: [],
        };
        snapshot.users.push(user);
        userIndex.set(user.id, user);
        persist();
        mongoMirror.upsertUser(user);
        return user;
    },
    updateUser(id, patch) {
        const user = snapshot.users.find((u) => u.id === id);
        if (!user)
            return undefined;
        Object.assign(user, patch);
        persist();
        mongoMirror.upsertUser(user);
        return user;
    },
    /**
     * Hard-delete a user and clean up everything that references them. Hosted
     * plans are cancelled (not deleted) so other participants' history doesn't
     * vanish. Messages and feedback authored by the user are intentionally
     * preserved — the chat UI tolerates missing senders.
     */
    deleteUserCascade(userId) {
        const user = snapshot.users.find((u) => u.id === userId);
        if (!user)
            return false;
        const nowIso = new Date().toISOString();
        // Cancel active plans the user was hosting.
        for (const plan of snapshot.plans) {
            if (plan.creatorId === userId && !plan.cancelledAt) {
                plan.cancelledAt = nowIso;
                mongoMirror.upsertPlan(plan);
            }
        }
        // Drop the user from any conversation participantIds.
        for (const conv of snapshot.conversations) {
            if (conv.participantIds.includes(userId)) {
                conv.participantIds = conv.participantIds.filter((id) => id !== userId);
                mongoMirror.upsertConversation(conv);
            }
        }
        // Drop the user from other users' networkIds.
        for (const u of snapshot.users) {
            if (u.id === userId)
                continue;
            if (u.networkIds?.includes(userId)) {
                u.networkIds = u.networkIds.filter((id) => id !== userId);
                mongoMirror.upsertUser(u);
            }
        }
        // Remove participations, notifications, invite codes, relationships, dropouts.
        snapshot.participations = snapshot.participations.filter((p) => p.userId !== userId);
        snapshot.notifications = snapshot.notifications.filter((n) => n.userId !== userId);
        snapshot.inviteCodes = snapshot.inviteCodes.filter((c) => c.ownerUserId !== userId);
        snapshot.relationships = snapshot.relationships.filter((r) => r.userId !== userId && r.targetId !== userId);
        snapshot.dropouts = snapshot.dropouts.filter((d) => d.userId !== userId);
        snapshot.devices = snapshot.devices.filter((d) => d.userId !== userId);
        mongoMirror.deleteParticipationsByUser(userId);
        mongoMirror.deleteNotificationsByUser(userId);
        mongoMirror.deleteInviteCodesByOwner(userId);
        mongoMirror.deleteRelationshipsTouching(userId);
        mongoMirror.deleteDropoutsByUser(userId);
        mongoMirror.deleteDevicesByUser(userId);
        // Drop the user's community memberships and recount those communities.
        // Communities they organized are left in place (transfer/delete are
        // organizer actions on the community itself); bulletin posts are
        // preserved — the UI tolerates a missing author.
        const affectedCommunityIds = new Set(snapshot.communityMembers.filter((m) => m.userId === userId).map((m) => m.communityId));
        snapshot.communityMembers = snapshot.communityMembers.filter((m) => m.userId !== userId);
        mongoMirror.deleteCommunityMembersByUser(userId);
        for (const cid of affectedCommunityIds)
            this.recountCommunityMembers(cid);
        // Finally the user record itself.
        snapshot.users = snapshot.users.filter((u) => u.id !== userId);
        userIndex.delete(userId);
        mongoMirror.deleteUser(userId);
        persist();
        return true;
    },
    // ---- Blocking ----
    /**
     * Block `targetId` on behalf of `userId`. Best-effort cleanup: drops any
     * existing network connection both ways, and removes the blocked user from
     * any group chat `userId` hosts (their own plans' conversations) so the
     * block takes effect in chats immediately without touching chats hosted by
     * someone else.
     */
    blockUser(userId, targetId) {
        const user = snapshot.users.find((u) => u.id === userId);
        if (!user)
            return undefined;
        const set = new Set(user.blockedUserIds ?? []);
        set.add(targetId);
        user.blockedUserIds = [...set];
        // Drop any existing mutual network connection.
        if (user.networkIds?.includes(targetId)) {
            user.networkIds = user.networkIds.filter((id) => id !== targetId);
        }
        const target = snapshot.users.find((u) => u.id === targetId);
        if (target?.networkIds?.includes(userId)) {
            target.networkIds = target.networkIds.filter((id) => id !== userId);
            mongoMirror.upsertUser(target);
        }
        this.deleteRelationship(userId, targetId, "network");
        this.deleteRelationship(targetId, userId, "network");
        // Drop pending network requests both ways so neither can accept later.
        if (user.incomingNetworkRequests?.includes(targetId)) {
            user.incomingNetworkRequests = user.incomingNetworkRequests.filter((id) => id !== targetId);
        }
        if (target?.incomingNetworkRequests?.includes(userId)) {
            target.incomingNetworkRequests = target.incomingNetworkRequests.filter((id) => id !== userId);
            mongoMirror.upsertUser(target);
        }
        // Remove each other from chats the other person hosts so neither can keep
        // a private thread going under a plan the other created.
        for (const plan of snapshot.plans) {
            if (plan.creatorId !== userId && plan.creatorId !== targetId)
                continue;
            const conv = snapshot.conversations.find((c) => c.planId === plan.id && c.type === "group");
            const dropId = plan.creatorId === userId ? targetId : userId;
            if (conv && conv.participantIds.includes(dropId)) {
                conv.participantIds = conv.participantIds.filter((id) => id !== dropId);
                mongoMirror.upsertConversation(conv);
            }
        }
        for (const conv of snapshot.conversations) {
            if (conv.type !== "dm")
                continue;
            if (!conv.participantIds.includes(userId) || !conv.participantIds.includes(targetId))
                continue;
            conv.participantIds = conv.participantIds.filter((id) => id !== userId && id !== targetId);
            mongoMirror.upsertConversation(conv);
        }
        persist();
        mongoMirror.upsertUser(user);
        return user;
    },
    unblockUser(userId, targetId) {
        const user = snapshot.users.find((u) => u.id === userId);
        if (!user)
            return undefined;
        if (!user.blockedUserIds?.includes(targetId))
            return user;
        user.blockedUserIds = user.blockedUserIds.filter((id) => id !== targetId);
        persist();
        mongoMirror.upsertUser(user);
        return user;
    },
    listBlockedUserIds(userId) {
        return snapshot.users.find((u) => u.id === userId)?.blockedUserIds ?? [];
    },
    isUserEjected(userId) {
        return Boolean(snapshot.users.find((u) => u.id === userId)?.ejectedAt);
    },
    /** Cancel the member's plans, take down their posts, and lock the account. */
    ejectUser(userId) {
        const user = snapshot.users.find((u) => u.id === userId);
        if (!user)
            return undefined;
        const now = new Date().toISOString();
        user.ejectedAt = now;
        for (const plan of snapshot.plans) {
            if (plan.creatorId === userId && !plan.cancelledAt) {
                plan.cancelledAt = now;
                mongoMirror.upsertPlan(plan);
            }
        }
        for (const post of snapshot.forumPosts) {
            if (post.authorId === userId && post.approvalStatus !== "rejected") {
                post.approvalStatus = "rejected";
                mongoMirror.upsertForumPost(post);
            }
        }
        for (const post of snapshot.communityPosts) {
            if (post.authorId === userId && !post.deletedAt) {
                post.approvalStatus = "rejected";
                post.deletedAt = now;
                mongoMirror.upsertCommunityPost(post);
            }
        }
        persist();
        mongoMirror.upsertUser(user);
        return user;
    },
    viewerReportedPlan(viewerId, planId) {
        return snapshot.reports.some((r) => r.reporterId === viewerId && r.planId === planId);
    },
    viewerReportedContent(viewerId, contentKind, contentId) {
        return snapshot.reports.some((r) => r.reporterId === viewerId &&
            r.contentKind === contentKind &&
            r.contentId === contentId);
    },
    /** True when either user has blocked the other — used to gate visibility both ways. */
    isBlockedEitherWay(aId, bId) {
        const a = snapshot.users.find((u) => u.id === aId);
        const b = snapshot.users.find((u) => u.id === bId);
        if (a?.blockedUserIds?.includes(bId))
            return true;
        if (b?.blockedUserIds?.includes(aId))
            return true;
        return false;
    },
    // ---- Muted conversations ----
    setConversationMuted(userId, conversationId, muted) {
        const user = snapshot.users.find((u) => u.id === userId);
        if (!user)
            return undefined;
        const set = new Set(user.mutedConversationIds ?? []);
        if (muted)
            set.add(conversationId);
        else
            set.delete(conversationId);
        user.mutedConversationIds = [...set];
        persist();
        mongoMirror.upsertUser(user);
        return user;
    },
    isConversationMuted(userId, conversationId) {
        return (snapshot.users.find((u) => u.id === userId)?.mutedConversationIds ?? []).includes(conversationId);
    },
    // ---- Pinned inbox conversations (most recently pinned first) ----
    setConversationPinned(userId, conversationId, pinned) {
        const user = snapshot.users.find((u) => u.id === userId);
        if (!user)
            return undefined;
        const list = (user.pinnedConversationIds ?? []).filter((id) => id !== conversationId);
        if (pinned)
            list.unshift(conversationId);
        user.pinnedConversationIds = list;
        persist();
        mongoMirror.upsertUser(user);
        return user;
    },
    isConversationPinned(userId, conversationId) {
        return (snapshot.users.find((u) => u.id === userId)?.pinnedConversationIds ?? []).includes(conversationId);
    },
    pinnedConversationIds(userId) {
        return [...(snapshot.users.find((u) => u.id === userId)?.pinnedConversationIds ?? [])];
    },
    // ---- Left / hidden-from-inbox conversations ----
    setConversationLeft(userId, conversationId, left) {
        const user = snapshot.users.find((u) => u.id === userId);
        if (!user)
            return undefined;
        const set = new Set(user.leftConversationIds ?? []);
        if (left)
            set.add(conversationId);
        else
            set.delete(conversationId);
        user.leftConversationIds = [...set];
        persist();
        mongoMirror.upsertUser(user);
        return user;
    },
    hasLeftConversation(userId, conversationId) {
        return (snapshot.users.find((u) => u.id === userId)?.leftConversationIds ?? []).includes(conversationId);
    },
    /** Filter out users who explicitly left this conversation (unless force-included). */
    filterNotLeft(conversationId, userIds, forceInclude = []) {
        const force = new Set(forceInclude);
        return userIds.filter((id) => force.has(id) || !this.hasLeftConversation(id, conversationId));
    },
    // Neighborhoods
    listNeighborhoods() {
        return [...snapshot.neighborhoods];
    },
    findNeighborhoodById(id) {
        return snapshot.neighborhoods.find((n) => n.id === id);
    },
    /**
     * Resolve a neighborhood reference to the canonical UUID `id`.
     * Accepts the UUID itself, or a leftover Mongo `_id` string from older
     * writes that stored ObjectId instead of our pinned neighborhood UUID.
     */
    resolveNeighborhoodId(raw) {
        if (raw == null)
            return undefined;
        const trimmed = String(raw).trim();
        if (!trimmed)
            return undefined;
        if (this.findNeighborhoodById(trimmed))
            return trimmed;
        for (const n of snapshot.neighborhoods) {
            const oid = n._id;
            if (oid != null && String(oid) === trimmed)
                return n.id;
        }
        return undefined;
    },
    /** Upsert one neighborhood by UUID id (does not wipe the collection). */
    ensureNeighborhood(record) {
        const clean = {
            id: record.id,
            name: record.name,
            metro: record.metro,
            adjacent: [...record.adjacent],
            lat: record.lat,
            lng: record.lng,
        };
        const idx = snapshot.neighborhoods.findIndex((n) => n.id === clean.id);
        if (idx >= 0) {
            // Object.assign keeps any hydrated Mongo `_id` so legacy ObjectId
            // neighborhood refs on users can still be remapped at runtime.
            Object.assign(snapshot.neighborhoods[idx], clean);
        }
        else {
            snapshot.neighborhoods.push({ ...clean });
        }
        persist();
        mongoMirror.upsertNeighborhood(clean);
    },
    /** Nearest hood with coords — used when a plan has a venue but no explicit neighborhood. */
    nearestNeighborhoodId(lat, lng) {
        // ~1° of lat/lng ≈ 60-70 miles. Threshold of 1.0 covers the Philly metro
        // area (NJ suburbs, Wilmington, Allentown) while excluding NYC, Long Island,
        // and other cities. Without this cap every user gets a Philly neighborhood
        // regardless of where on Earth they are.
        const MAX_DIST_SQ = 1.0;
        let bestId;
        let bestD = Infinity;
        for (const n of snapshot.neighborhoods) {
            if (typeof n.lat !== "number" || typeof n.lng !== "number")
                continue;
            const dLat = n.lat - lat;
            const dLng = n.lng - lng;
            const d = dLat * dLat + dLng * dLng;
            if (d < bestD) {
                bestD = d;
                bestId = n.id;
            }
        }
        return bestD <= MAX_DIST_SQ ? bestId : undefined;
    },
    // returns the user's neighborhood + adjacent neighborhood ids
    neighborhoodScope(neighborhoodId) {
        const resolved = this.resolveNeighborhoodId(neighborhoodId) ?? neighborhoodId;
        const root = this.findNeighborhoodById(resolved);
        if (!root)
            return [];
        return [root.id, ...root.adjacent];
    },
    // Plans
    listPlans() {
        return [...snapshot.plans].sort((a, b) => a.date.localeCompare(b.date));
    },
    listPlansByNeighborhoods(neighborhoodIds) {
        const set = new Set(neighborhoodIds);
        return this.listPlans().filter((p) => set.has(p.neighborhoodId));
    },
    listPlansByCreator(creatorId) {
        return this.listPlans().filter((p) => p.creatorId === creatorId);
    },
    findPlanById(id) {
        return snapshot.plans.find((p) => p.id === id);
    },
    /**
     * Plans-by-venue lookup keyed off the Google Places ID. Backs the
     * (post-launch) Spots grid + "people who went to X" venue history. Cheap
     * O(n) scan today — fine while the dataset is small, and the only callers
     * are admin/explore screens. Move to an index if it gets hot.
     */
    listPlansByPlaceId(placeId) {
        if (!placeId)
            return [];
        return snapshot.plans.filter((p) => p.location?.placeId === placeId);
    },
    /**
     * Aggregate plan counts per venue — feeds the Explore Spots grid when it
     * ships. Includes the latest venue snapshot (name/address/coords) so the
     * caller doesn't need to re-resolve from Google.
     */
    listVenueStats() {
        const byPlace = new Map();
        for (const p of snapshot.plans) {
            const pid = p.location?.placeId;
            if (!pid)
                continue;
            const prev = byPlace.get(pid);
            if (prev) {
                prev.planCount += 1;
                if (p.createdAt > prev.lastPlanAt) {
                    prev.lastPlanAt = p.createdAt;
                    // Latest snapshot wins for the display fields so renames roll forward.
                    prev.name = p.location.name;
                    prev.address = p.location.address;
                    prev.lat = p.location.lat;
                    prev.lng = p.location.lng;
                }
            }
            else {
                byPlace.set(pid, {
                    placeId: pid,
                    name: p.location.name,
                    address: p.location.address,
                    lat: p.location.lat,
                    lng: p.location.lng,
                    planCount: 1,
                    lastPlanAt: p.createdAt,
                });
            }
        }
        return Array.from(byPlace.values()).sort((a, b) => b.planCount - a.planCount);
    },
    createPlan(input) {
        const id = randomUUID();
        const plan = {
            isFlexibleLocation: false,
            planKind: "standard",
            visibility: input.visibility ?? "everyone",
            visibilityCommunityTag: null,
            communityId: null,
            capacity: null,
            joinType: "open",
            isRecurring: false,
            seriesId: null,
            lockedAt: null,
            ...input,
            id,
            createdAt: new Date().toISOString(),
        };
        // Recurring posts get their own id as the series anchor unless the caller
        // explicitly passed a seriesId (future code that spawns child instances).
        if (plan.isRecurring && !plan.seriesId) {
            plan.seriesId = id;
        }
        snapshot.plans.push(plan);
        persist();
        mongoMirror.upsertPlan(plan);
        return plan;
    },
    updatePlan(id, patch) {
        const plan = snapshot.plans.find((p) => p.id === id);
        if (!plan)
            return undefined;
        Object.assign(plan, patch);
        // Explicit undefined means "clear" — Object.assign leaves the key as
        // undefined, which JSON/Mongo would otherwise omit and leave stale.
        if ("flyerDataUrl" in patch && patch.flyerDataUrl === undefined) {
            delete plan.flyerDataUrl;
        }
        persist();
        mongoMirror.upsertPlan(plan);
        return plan;
    },
    // Plan suggestions (“looking for” replies)
    listPlanSuggestions(planId) {
        return snapshot.planSuggestions.filter((s) => s.planId === planId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    createPlanSuggestion(planId, userId, body) {
        const row = {
            id: randomUUID(),
            planId,
            userId,
            body,
            createdAt: new Date().toISOString(),
        };
        snapshot.planSuggestions.push(row);
        persist();
        mongoMirror.upsertPlanSuggestion(row);
        return row;
    },
    // Participations
    listAllParticipations() {
        return [...snapshot.participations];
    },
    listAllMessages() {
        return [...snapshot.messages];
    },
    listAllConversations() {
        return [...snapshot.conversations];
    },
    listAllFeedback() {
        return [...snapshot.feedback];
    },
    listAllPlanSuggestions() {
        return [...snapshot.planSuggestions];
    },
    listLogsRecent(limit) {
        return [...snapshot.logs]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, Math.max(0, limit));
    },
    createReport(input) {
        const record = {
            id: randomUUID(),
            reporterId: input.reporterId,
            targetUserId: input.targetUserId,
            planId: input.planId ?? null,
            contentKind: input.contentKind ?? null,
            contentId: input.contentId ?? null,
            source: input.source ?? "report",
            reason: input.reason,
            details: input.details,
            status: "open",
            createdAt: new Date().toISOString(),
            reviewedAt: null,
        };
        snapshot.reports.push(record);
        persist();
        mongoMirror.upsertReport(record);
        return record;
    },
    listReports() {
        return [...snapshot.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    findReportById(id) {
        return snapshot.reports.find((r) => r.id === id);
    },
    updateReportStatus(id, status) {
        const row = this.findReportById(id);
        if (!row)
            return undefined;
        row.status = status;
        row.reviewedAt = status === "reviewed" ? new Date().toISOString() : null;
        persist();
        mongoMirror.upsertReport(row);
        return row;
    },
    createHelpTicket(input) {
        const row = {
            id: randomUUID(),
            userId: input.userId,
            section: input.section,
            body: input.body,
            status: "open",
            reply: null,
            repliedAt: null,
            resolvedAt: null,
            createdAt: new Date().toISOString(),
        };
        snapshot.helpTickets.push(row);
        persist();
        mongoMirror.upsertHelpTicket(row);
        return row;
    },
    listHelpTickets() {
        return [...snapshot.helpTickets].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    listVisibleHelpTicketsForUser(userId) {
        return this.listHelpTickets().filter((t) => t.userId === userId && helpTicketVisibleToUser(t));
    },
    findHelpTicketById(id) {
        return snapshot.helpTickets.find((t) => t.id === id);
    },
    replyToHelpTicket(id, reply) {
        const row = this.findHelpTicketById(id);
        if (!row || row.status === "resolved")
            return undefined;
        row.reply = reply;
        row.repliedAt = new Date().toISOString();
        row.status = "replied";
        persist();
        mongoMirror.upsertHelpTicket(row);
        return row;
    },
    resolveHelpTicket(id) {
        const row = this.findHelpTicketById(id);
        if (!row || row.status === "resolved")
            return undefined;
        row.status = "resolved";
        row.resolvedAt = new Date().toISOString();
        persist();
        mongoMirror.upsertHelpTicket(row);
        return row;
    },
    listParticipationsForPlan(planId) {
        return snapshot.participations.filter((p) => p.planId === planId);
    },
    listParticipationsForUser(userId) {
        return snapshot.participations.filter((p) => p.userId === userId);
    },
    findParticipation(planId, userId) {
        return snapshot.participations.find((p) => p.planId === planId && p.userId === userId);
    },
    upsertParticipation(planId, userId, state) {
        const existing = this.findParticipation(planId, userId);
        if (existing) {
            existing.state = state;
            existing.updatedAt = new Date().toISOString();
            // Backfill createdAt on legacy rows that never had one. After the
            // backfill the field is stable across future state changes.
            if (!existing.createdAt)
                existing.createdAt = existing.updatedAt;
            persist();
            mongoMirror.upsertParticipation(existing);
            return existing;
        }
        const now = new Date().toISOString();
        const record = {
            id: randomUUID(),
            planId,
            userId,
            state,
            createdAt: now,
            updatedAt: now,
            attended: null,
        };
        snapshot.participations.push(record);
        persist();
        mongoMirror.upsertParticipation(record);
        return record;
    },
    /**
     * Set the post-plan attendance signal on a participation. Called from the
     * feedback POST — submitting feedback implicitly confirms you went. We never
     * write `false` from a flow (silence ≠ no-show), but callers can pass it
     * explicitly if a future "didn't go after all" path is added.
     */
    markAttended(planId, userId, attended) {
        const row = this.findParticipation(planId, userId);
        if (!row)
            return undefined;
        row.attended = attended;
        row.updatedAt = new Date().toISOString();
        persist();
        mongoMirror.upsertParticipation(row);
        return row;
    },
    deleteParticipation(planId, userId) {
        snapshot.participations = snapshot.participations.filter((p) => !(p.planId === planId && p.userId === userId));
        persist();
        mongoMirror.deleteParticipation(planId, userId);
    },
    /**
     * Record an explicit drop-out event. Call from any endpoint that removes an
     * active RSVP (DELETE /participation, outgoing host on transfer). Cascade
     * deletes (account deletion) do NOT emit this — the user is gone.
     */
    recordDropOut(userId, planId, fromState) {
        const record = {
            id: randomUUID(),
            userId,
            planId,
            fromState,
            createdAt: new Date().toISOString(),
        };
        snapshot.dropouts.push(record);
        persist();
        mongoMirror.upsertDropout(record);
        return record;
    },
    listAllDropouts() {
        return [...snapshot.dropouts];
    },
    // Conversations + Messages
    findGroupConversationByPlan(planId) {
        return this.listGroupConversationsByPlan(planId)[0];
    },
    listGroupConversationsByPlan(planId) {
        return snapshot.conversations.filter((c) => c.planId === planId && c.type === "group");
    },
    listCommunityConversations(communityId) {
        return snapshot.conversations.filter((c) => c.communityId === communityId);
    },
    /** Remove a plan's group thread and its messages. DMs on the plan stay. */
    deleteGroupConversation(planId) {
        const conv = this.findGroupConversationByPlan(planId);
        if (!conv)
            return false;
        const toRemove = messagesByConvIndex.get(conv.id) ?? [];
        for (const m of toRemove)
            messageIndex.delete(m.id);
        messagesByConvIndex.delete(conv.id);
        snapshot.messages = snapshot.messages.filter((m) => m.conversationId !== conv.id);
        snapshot.conversations = snapshot.conversations.filter((c) => c.id !== conv.id);
        mongoMirror.deleteMessagesByConversation(conv.id);
        mongoMirror.deleteConversation(conv.id);
        persist();
        return true;
    },
    findDmInPlan(planId, a, b) {
        return snapshot.conversations.find((c) => c.planId === planId &&
            c.type === "dm" &&
            c.participantIds.length === 2 &&
            c.participantIds.includes(a) &&
            c.participantIds.includes(b));
    },
    ensureGroupConversation(planId, participantIds, opts) {
        const existing = this.findGroupConversationByPlan(planId);
        if (existing) {
            const toAdd = this.filterNotLeft(existing.id, participantIds, opts?.rejoinIds ?? []);
            existing.participantIds = Array.from(new Set([...existing.participantIds, ...toAdd]));
            persist();
            mongoMirror.upsertConversation(existing);
            return existing;
        }
        const conv = {
            id: randomUUID(),
            planId,
            type: "group",
            participantIds: Array.from(new Set(participantIds)),
            createdAt: new Date().toISOString(),
            lastMessageAt: new Date().toISOString(),
        };
        snapshot.conversations.push(conv);
        persist();
        mongoMirror.upsertConversation(conv);
        return conv;
    },
    /** Remove a single participant from a group conversation (explicit "leave
     *  chat"). Returns the updated conversation, or undefined if not found. */
    removeConversationParticipant(convId, userId) {
        const conv = snapshot.conversations.find((c) => c.id === convId);
        if (!conv)
            return undefined;
        if (!conv.participantIds.includes(userId)) {
            this.setConversationLeft(userId, convId, true);
            return conv;
        }
        conv.participantIds = conv.participantIds.filter((id) => id !== userId);
        this.setConversationLeft(userId, convId, true);
        persist();
        mongoMirror.upsertConversation(conv);
        return conv;
    },
    findDirectDm(a, b) {
        return snapshot.conversations.find((c) => c.type === "dm" &&
            c.planId === "" &&
            !c.communityId &&
            c.participantIds.length === 2 &&
            c.participantIds.includes(a) &&
            c.participantIds.includes(b));
    },
    /** Network DM — not tied to a plan. Reopens the thread if the caller had left it. */
    listDirectDms(userId) {
        return snapshot.conversations.filter((c) => c.type === "dm" && c.planId === "" && !c.communityId && c.participantIds.includes(userId));
    },
    ensureDirectDm(a, b) {
        const existing = this.findDirectDm(a, b);
        if (existing) {
            this.setConversationLeft(a, existing.id, false);
            return existing;
        }
        const now = new Date().toISOString();
        const conv = {
            id: randomUUID(),
            planId: "",
            type: "dm",
            participantIds: [a, b],
            createdAt: now,
            lastMessageAt: now,
        };
        snapshot.conversations.push(conv);
        persist();
        mongoMirror.upsertConversation(conv);
        return conv;
    },
    /** Hide or reveal a network DM for one participant. The thread stays intact. */
    setDmHiddenFrom(convId, userId, hidden) {
        const conv = snapshot.conversations.find((c) => c.id === convId);
        if (!conv)
            return;
        const set = new Set(conv.hiddenFromUserIds ?? []);
        if (hidden)
            set.add(userId);
        else
            set.delete(userId);
        // Empty array, not undefined: the mongo mirror $sets the record, and a
        // missing field would leave the previous hide list in place.
        conv.hiddenFromUserIds = [...set];
        persist();
        mongoMirror.upsertConversation(conv);
    },
    /**
     * Both people are connected. Drop the hold on their network DM and report
     * who can see it now, plus the latest real message, so they can be pinged.
     */
    releaseHeldDmBetween(aId, bId) {
        const conv = snapshot.conversations.find((c) => c.type === "dm" &&
            c.planId === "" &&
            !c.communityId &&
            c.participantIds.includes(aId) &&
            c.participantIds.includes(bId));
        if (!conv)
            return undefined;
        const revealedTo = (conv.hiddenFromUserIds ?? []).filter((id) => id === aId || id === bId);
        if (revealedTo.length === 0)
            return undefined;
        const rest = (conv.hiddenFromUserIds ?? []).filter((id) => id !== aId && id !== bId);
        conv.hiddenFromUserIds = rest;
        persist();
        mongoMirror.upsertConversation(conv);
        const last = this.listMessagesForConversation(conv.id).filter((m) => m.kind !== "system").at(-1);
        if (!last)
            return undefined;
        return {
            conversationId: conv.id,
            revealedTo,
            senderId: last.senderId,
            preview: last.body.length <= 80 ? last.body : last.body.slice(0, 79) + "…",
        };
    },
    createDm(planId, a, b) {
        if (this.isBlockedEitherWay(a, b)) {
            const existing = this.findDmInPlan(planId, a, b);
            if (existing)
                return existing;
            throw new Error("Can't message someone you've blocked");
        }
        const existing = this.findDmInPlan(planId, a, b);
        if (existing)
            return existing;
        const conv = {
            id: randomUUID(),
            planId,
            type: "dm",
            participantIds: [a, b],
            createdAt: new Date().toISOString(),
            lastMessageAt: new Date().toISOString(),
        };
        snapshot.conversations.push(conv);
        persist();
        mongoMirror.upsertConversation(conv);
        return conv;
    },
    findConversationById(id) {
        return snapshot.conversations.find((c) => c.id === id);
    },
    listMessagesForConversation(conversationId) {
        return [...(messagesByConvIndex.get(conversationId) ?? [])];
    },
    /** Opening a thread marks every message read so the inbox badge can drop. */
    markConversationRead(conversationId, userId) {
        let count = 0;
        for (const m of messagesByConvIndex.get(conversationId) ?? []) {
            if (m.readBy.includes(userId))
                continue;
            m.readBy.push(userId);
            mongoMirror.upsertMessage(m);
            count++;
        }
        if (count > 0)
            persist();
        return count;
    },
    /** Wipe a thread for every participant. The conversation row stays. */
    clearConversationMessages(conversationId) {
        const toRemove = messagesByConvIndex.get(conversationId) ?? [];
        for (const m of toRemove)
            messageIndex.delete(m.id);
        messagesByConvIndex.delete(conversationId);
        snapshot.messages = snapshot.messages.filter((m) => m.conversationId !== conversationId);
        mongoMirror.deleteMessagesByConversation(conversationId);
        persist();
    },
    findMessageById(messageId) {
        return messageIndex.get(messageId);
    },
    /** Remove one message for every participant. Rewinds the inbox preview when it was the latest. */
    deleteMessage(messageId) {
        const idx = snapshot.messages.findIndex((m) => m.id === messageId);
        if (idx < 0)
            return false;
        const [removed] = snapshot.messages.splice(idx, 1);
        messageIndex.delete(messageId);
        const convBucket = messagesByConvIndex.get(removed.conversationId);
        if (convBucket) {
            const bi = convBucket.findIndex((m) => m.id === messageId);
            if (bi >= 0)
                convBucket.splice(bi, 1);
        }
        const conv = snapshot.conversations.find((c) => c.id === removed.conversationId);
        if (conv) {
            const remaining = messagesByConvIndex.get(conv.id) ?? [];
            const latest = remaining.at(-1)?.createdAt ?? "";
            const nextAt = latest || conv.createdAt;
            if (conv.lastMessageAt !== nextAt) {
                conv.lastMessageAt = nextAt;
                mongoMirror.upsertConversation(conv);
            }
        }
        persist();
        mongoMirror.deleteMessage(removed.id);
        return true;
    },
    createMessage(conversationId, senderId, body, imageUrl, replyToId) {
        const message = {
            id: randomUUID(),
            conversationId,
            senderId,
            body,
            createdAt: new Date().toISOString(),
            readBy: [senderId],
            kind: "user",
            ...(imageUrl ? { imageUrl } : {}),
            ...(replyToId ? { replyToId } : {}),
        };
        snapshot.messages.push(message);
        messageIndex.set(message.id, message);
        const bucket = messagesByConvIndex.get(conversationId);
        if (bucket)
            bucket.push(message);
        else
            messagesByConvIndex.set(conversationId, [message]);
        const conv = snapshot.conversations.find((c) => c.id === conversationId);
        if (conv)
            conv.lastMessageAt = message.createdAt;
        persist();
        mongoMirror.upsertMessage(message);
        if (conv)
            mongoMirror.upsertConversation(conv);
        return message;
    },
    createSystemMessage(conversationId, body) {
        const message = {
            id: randomUUID(),
            conversationId,
            senderId: "__system__",
            body,
            createdAt: new Date().toISOString(),
            readBy: [],
            kind: "system",
        };
        snapshot.messages.push(message);
        messageIndex.set(message.id, message);
        const bucket = messagesByConvIndex.get(conversationId);
        if (bucket)
            bucket.push(message);
        else
            messagesByConvIndex.set(conversationId, [message]);
        const conv = snapshot.conversations.find((c) => c.id === conversationId);
        if (conv)
            conv.lastMessageAt = message.createdAt;
        persist();
        mongoMirror.upsertMessage(message);
        if (conv)
            mongoMirror.upsertConversation(conv);
        return message;
    },
    /**
     * Copy every message from one conversation into another (new ids, same
     * sender/body/timestamp/kind/reactions/poll). Used by "Do it again" so the
     * re-planned event's group chat carries the previous thread's history.
     * Returns how many messages were cloned.
     */
    cloneConversationMessages(fromConversationId, toConversationId) {
        const src = [...(messagesByConvIndex.get(fromConversationId) ?? [])];
        let lastAt = "";
        for (const m of src) {
            const copy = { ...m, id: randomUUID(), conversationId: toConversationId };
            snapshot.messages.push(copy);
            messageIndex.set(copy.id, copy);
            const bucket = messagesByConvIndex.get(toConversationId);
            if (bucket)
                bucket.push(copy);
            else
                messagesByConvIndex.set(toConversationId, [copy]);
            mongoMirror.upsertMessage(copy);
            if (m.createdAt > lastAt)
                lastAt = m.createdAt;
        }
        if (src.length > 0) {
            const conv = snapshot.conversations.find((c) => c.id === toConversationId);
            if (conv && lastAt > (conv.lastMessageAt ?? "")) {
                conv.lastMessageAt = lastAt;
                mongoMirror.upsertConversation(conv);
            }
            persist();
        }
        return src.length;
    },
    /**
     * Post a poll into a conversation. The poll question doubles as the message
     * `body` so inbox previews and notifications work without poll-specific
     * branching. Options get stable ids so votes survive edits.
     */
    createPollMessage(conversationId, senderId, question, optionTexts) {
        const message = {
            id: randomUUID(),
            conversationId,
            senderId,
            body: question,
            createdAt: new Date().toISOString(),
            readBy: [senderId],
            kind: "poll",
            poll: {
                question,
                options: optionTexts.map((text) => ({ id: randomUUID(), text })),
                votes: {},
                closed: false,
            },
        };
        snapshot.messages.push(message);
        messageIndex.set(message.id, message);
        const pollBucket = messagesByConvIndex.get(conversationId);
        if (pollBucket)
            pollBucket.push(message);
        else
            messagesByConvIndex.set(conversationId, [message]);
        const conv = snapshot.conversations.find((c) => c.id === conversationId);
        if (conv)
            conv.lastMessageAt = message.createdAt;
        persist();
        mongoMirror.upsertMessage(message);
        if (conv)
            mongoMirror.upsertConversation(conv);
        return message;
    },
    /**
     * Cast (or change) a user's vote on a poll. Single-choice: the user is first
     * removed from every option, then added to `optionId` — unless they tapped the
     * option they already held, which clears their vote (toggle off). No-op on a
     * closed poll or unknown option. Returns the updated message, or undefined if
     * the message isn't a votable poll.
     */
    votePoll(messageId, userId, optionId) {
        const message = messageIndex.get(messageId);
        if (!message || message.kind !== "poll" || !message.poll)
            return undefined;
        const poll = message.poll;
        if (poll.closed)
            return message;
        if (!poll.options.some((o) => o.id === optionId))
            return undefined;
        const hadVote = (poll.votes[optionId] ?? []).includes(userId);
        const votes = {};
        for (const [oid, users] of Object.entries(poll.votes)) {
            const kept = users.filter((u) => u !== userId);
            if (kept.length)
                votes[oid] = kept;
        }
        if (!hadVote)
            votes[optionId] = [...(votes[optionId] ?? []), userId];
        poll.votes = votes;
        persist();
        mongoMirror.upsertMessage(message);
        return message;
    },
    /** Freeze a poll's results. Permission is enforced by the caller. */
    closePoll(messageId) {
        const message = messageIndex.get(messageId);
        if (!message || message.kind !== "poll" || !message.poll)
            return undefined;
        message.poll.closed = true;
        message.poll.closedAt = new Date().toISOString();
        persist();
        mongoMirror.upsertMessage(message);
        return message;
    },
    /** Re-open a closed poll so voting resumes. Permission is enforced by the caller. */
    reopenPoll(messageId) {
        const message = messageIndex.get(messageId);
        if (!message || message.kind !== "poll" || !message.poll)
            return undefined;
        message.poll.closed = false;
        delete message.poll.closedAt;
        persist();
        mongoMirror.upsertMessage(message);
        return message;
    },
    /**
     * Toggle a user's emoji reaction on a message. Adds the userId if absent,
     * removes it if present. Empty emoji buckets are pruned. Returns the updated
     * message (or undefined if not found).
     */
    toggleReaction(messageId, userId, emoji) {
        const message = messageIndex.get(messageId);
        if (!message)
            return undefined;
        const reactions = { ...(message.reactions ?? {}) };
        const current = new Set(reactions[emoji] ?? []);
        if (current.has(userId))
            current.delete(userId);
        else
            current.add(userId);
        if (current.size === 0)
            delete reactions[emoji];
        else
            reactions[emoji] = [...current];
        message.reactions = reactions;
        persist();
        mongoMirror.upsertMessage(message);
        return message;
    },
    // Feedback
    createFeedback(input) {
        const record = {
            id: randomUUID(),
            ...input,
            createdAt: new Date().toISOString(),
        };
        snapshot.feedback.push(record);
        persist();
        mongoMirror.upsertFeedback(record);
        return record;
    },
    listFeedbackForHost(hostId) {
        return snapshot.feedback.filter((f) => f.toHostId === hostId);
    },
    listFeedbackForPlan(planId) {
        return snapshot.feedback.filter((f) => f.planId === planId);
    },
    // Declines (used by recommendation algo)
    recordDecline(userId, planId) {
        const record = {
            id: randomUUID(),
            userId,
            planId,
            createdAt: new Date().toISOString(),
        };
        snapshot.declines.push(record);
        persist();
        mongoMirror.upsertDecline(record);
    },
    recentDeclinesForUser(userId, sinceIso) {
        return snapshot.declines.filter((d) => d.userId === userId && d.createdAt >= sinceIso);
    },
    listAllDeclines() {
        return [...snapshot.declines];
    },
    // SMS codes (mock Twilio)
    saveSmsCode(phoneNumber, code, ttlMs) {
        snapshot.smsCodes = snapshot.smsCodes.filter((c) => c.phoneNumber !== phoneNumber);
        const record = {
            phoneNumber,
            code,
            expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        };
        snapshot.smsCodes.push(record);
        persist();
        return record;
    },
    consumeSmsCode(phoneNumber, code) {
        const record = snapshot.smsCodes.find((c) => c.phoneNumber === phoneNumber);
        if (!record)
            return false;
        if (record.code !== code)
            return false;
        if (new Date(record.expiresAt).getTime() < Date.now())
            return false;
        snapshot.smsCodes = snapshot.smsCodes.filter((c) => c.phoneNumber !== phoneNumber);
        persist();
        return true;
    },
    // Comments — kept as messages on the group conversation in v2
    // (legacy `comments` collection removed)
    // Logs
    log(event, payload) {
        const entry = {
            id: randomUUID(),
            event,
            payload,
            createdAt: new Date().toISOString(),
        };
        snapshot.logs.push(entry);
        persist();
        mongoMirror.upsertLog(entry);
    },
    // Invite codes
    listInviteCodesForOwner(ownerUserId) {
        return snapshot.inviteCodes.filter((c) => c.ownerUserId === ownerUserId);
    },
    listAllInviteCodes() {
        return [...snapshot.inviteCodes];
    },
    findInviteCodeByCode(raw) {
        const norm = normalizeInviteCode(raw);
        return snapshot.inviteCodes.find((c) => c.code === norm);
    },
    createInviteCodesForUser(ownerUserId, count) {
        const created = [];
        while (created.length < count) {
            const code = generateInviteCode();
            // Skip if collision against existing — astronomically unlikely with the
            // 32^6 keyspace and ~hundreds of users, but cheap to guard.
            if (snapshot.inviteCodes.some((c) => c.code === code))
                continue;
            const row = {
                id: randomUUID(),
                code,
                ownerUserId,
                redeemedByUserId: null,
                redeemedAt: null,
                createdAt: new Date().toISOString(),
            };
            snapshot.inviteCodes.push(row);
            created.push(row);
            mongoMirror.upsertInviteCode(row);
        }
        persist();
        return created;
    },
    redeemInviteCode(raw, redeemerUserId) {
        const row = this.findInviteCodeByCode(raw);
        if (!row)
            return null;
        if (row.redeemedByUserId)
            return row; // idempotent — return prior state
        if (row.ownerUserId === redeemerUserId)
            return null; // can't redeem your own
        row.redeemedByUserId = redeemerUserId;
        row.redeemedAt = new Date().toISOString();
        persist();
        mongoMirror.upsertInviteCode(row);
        return row;
    },
    // Relationships
    listRelationshipsForUser(userId) {
        return snapshot.relationships.filter((r) => r.userId === userId);
    },
    listAllRelationships() {
        return [...snapshot.relationships];
    },
    upsertRelationship(input) {
        const existing = snapshot.relationships.find((r) => r.userId === input.userId && r.targetId === input.targetId && r.kind === input.kind);
        if (existing)
            return existing;
        const row = {
            id: randomUUID(),
            userId: input.userId,
            targetId: input.targetId,
            kind: input.kind,
            source: input.source ?? "other",
            role: input.kind === "community" ? (input.role ?? "member") : null,
            createdAt: new Date().toISOString(),
        };
        snapshot.relationships.push(row);
        persist();
        mongoMirror.upsertRelationship(row);
        return row;
    },
    /**
     * Promote/demote a community member. No-op for `network` edges. Returns the
     * updated row, or undefined if the relationship doesn't exist.
     */
    setCommunityRole(userId, communityId, role) {
        const row = snapshot.relationships.find((r) => r.userId === userId && r.targetId === communityId && r.kind === "community");
        if (!row)
            return undefined;
        row.role = role;
        persist();
        mongoMirror.upsertRelationship(row);
        return row;
    },
    deleteRelationship(userId, targetId, kind) {
        const before = snapshot.relationships.length;
        snapshot.relationships = snapshot.relationships.filter((r) => !(r.userId === userId && r.targetId === targetId && r.kind === kind));
        if (snapshot.relationships.length !== before) {
            persist();
            mongoMirror.deleteRelationship(userId, targetId, kind);
        }
    },
    // Notifications
    listNotificationsForUser(userId, limit = 50) {
        return snapshot.notifications
            .filter((n) => n.userId === userId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, Math.max(0, limit));
    },
    /** Insert a notification only if no record with the same dedupKey exists. */
    insertNotificationIfNew(input) {
        const existing = snapshot.notifications.find((n) => n.dedupKey === input.dedupKey);
        if (existing)
            return null;
        const row = {
            id: randomUUID(),
            ...input,
            createdAt: new Date().toISOString(),
            readAt: null,
        };
        snapshot.notifications.push(row);
        persist();
        mongoMirror.upsertNotification(row);
        return row;
    },
    /** Clear message pings for a thread the user has now opened. */
    markMessageNotificationsRead(userId, conversationId) {
        const now = new Date().toISOString();
        let count = 0;
        for (const n of snapshot.notifications) {
            if (n.userId !== userId || n.readAt !== null)
                continue;
            if (n.kind !== "newGroupChatMessage" || n.conversationId !== conversationId)
                continue;
            n.readAt = now;
            mongoMirror.upsertNotification(n);
            count++;
        }
        if (count > 0)
            persist();
        return count;
    },
    markAllNotificationsRead(userId) {
        const now = new Date().toISOString();
        let count = 0;
        for (const n of snapshot.notifications) {
            if (n.userId === userId && n.readAt === null) {
                n.readAt = now;
                mongoMirror.upsertNotification(n);
                count++;
            }
        }
        if (count > 0)
            persist();
        return count;
    },
    deleteNotification(userId, notificationId) {
        const before = snapshot.notifications.length;
        snapshot.notifications = snapshot.notifications.filter((n) => !(n.id === notificationId && n.userId === userId));
        if (snapshot.notifications.length === before)
            return false;
        persist();
        mongoMirror.deleteNotification(notificationId);
        return true;
    },
    clearAllNotificationsForUser(userId) {
        const before = snapshot.notifications.length;
        snapshot.notifications = snapshot.notifications.filter((n) => n.userId !== userId);
        const removed = before - snapshot.notifications.length;
        if (removed > 0) {
            persist();
            mongoMirror.deleteNotificationsByUser(userId);
        }
        return removed;
    },
    listAllNotifications() {
        return [...snapshot.notifications];
    },
    // ---- Event-card image library (admin-managed) ----
    listCardImages() {
        return [...snapshot.cardImages].sort((a, b) => a.sortOrder - b.sortOrder);
    },
    addCardImage(input) {
        const maxOrder = snapshot.cardImages.reduce((m, c) => Math.max(m, c.sortOrder), -1);
        const row = {
            id: randomUUID(),
            url: input.url,
            label: input.label?.trim() || undefined,
            category: input.category?.trim() || undefined,
            sortOrder: maxOrder + 1,
            createdAt: new Date().toISOString(),
        };
        snapshot.cardImages.push(row);
        persist();
        mongoMirror.upsertCardImage(row);
        return row;
    },
    updateCardImage(id, patch) {
        const row = snapshot.cardImages.find((c) => c.id === id);
        if (!row)
            return undefined;
        if (patch.label !== undefined)
            row.label = patch.label?.trim() || undefined;
        if (patch.category !== undefined)
            row.category = patch.category?.trim() || undefined;
        persist();
        mongoMirror.upsertCardImage(row);
        return row;
    },
    removeCardImage(id) {
        const before = snapshot.cardImages.length;
        snapshot.cardImages = snapshot.cardImages.filter((c) => c.id !== id);
        if (snapshot.cardImages.length === before)
            return false;
        persist();
        mongoMirror.deleteCardImage(id);
        return true;
    },
    // ---- Communities ----
    listCommunities() {
        return [...snapshot.communities];
    },
    listApprovedCommunities() {
        return snapshot.communities.filter((c) => c.creationStatus === "approved" && !c.hiddenAt);
    },
    listPendingCommunities() {
        return snapshot.communities
            .filter((c) => c.creationStatus === "pending")
            .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    },
    /**
     * Rewrite legacy 8-option community categories (run_club, book_club, …) to
     * the master InterestTag taxonomy. Idempotent — returns how many rows changed.
     */
    migrateCommunityCategories() {
        let migrated = 0;
        for (const community of snapshot.communities) {
            const categories = parseCommunityCategories(community.categories, community.category);
            const category = categories[0] ?? normalizeCommunityCategory(String(community.category ?? ""));
            const cats = categories.length > 0 ? categories : [category];
            const samePrimary = community.category === category;
            const sameList = Array.isArray(community.categories) &&
                community.categories.length === cats.length &&
                community.categories.every((c, i) => c === cats[i]);
            if (samePrimary && sameList)
                continue;
            this.updateCommunity(community.id, { category, categories: cats });
            migrated += 1;
        }
        return migrated;
    },
    findCommunityById(id) {
        return snapshot.communities.find((c) => c.id === id);
    },
    listCommunitiesForOrganizer(organizerId) {
        return snapshot.communities.filter((c) => c.organizerId === organizerId);
    },
    /**
     * Create a community and seed the organizer's active membership.
     * `member_count` starts at 1. User submissions pass `pending` and stay off
     * the feed until an admin approves. Admin founding and seeds pass `approved`.
     */
    createCommunity(input) {
        const now = new Date().toISOString();
        const creationStatus = input.creationStatus ?? "approved";
        const approved = creationStatus === "approved";
        const categories = parseCommunityCategories(input.categories, input.category);
        const category = categories[0] ?? normalizeCommunityCategory(String(input.category ?? ""));
        const community = {
            id: randomUUID(),
            name: input.name,
            description: input.description,
            coverImage: input.coverImage ?? null,
            category,
            categories: categories.length > 0 ? categories : [category],
            organizerId: input.organizerId,
            memberCount: 1,
            creationStatus,
            isFounding: input.isFounding ?? false,
            hiddenAt: null,
            bulletinPermission: input.bulletinPermission ?? "members",
            planPostingPermission: input.planPostingPermission ?? "members",
            chatEnabled: true,
            bulletinEnabled: true,
            bulletinRequiresApproval: false,
            visibility: input.visibility ?? "everyone",
            screeningQuestion: input.screeningQuestion ?? null,
            city: input.city?.trim() ? input.city.trim().slice(0, 80) : null,
            socialLinks: input.socialLinks ?? null,
            rejectionNote: null,
            submittedAt: now,
            reviewedAt: approved ? now : null,
            reviewedBy: approved ? (input.reviewedBy ?? null) : null,
            createdAt: now,
        };
        snapshot.communities.push(community);
        const membership = {
            id: randomUUID(),
            communityId: community.id,
            userId: input.organizerId,
            role: "organizer",
            status: "active",
            screeningAnswer: null,
            joinedAt: now,
        };
        snapshot.communityMembers.push(membership);
        persist();
        mongoMirror.upsertCommunity(community);
        mongoMirror.upsertCommunityMember(membership);
        return community;
    },
    updateCommunity(id, patch) {
        const community = snapshot.communities.find((c) => c.id === id);
        if (!community)
            return undefined;
        Object.assign(community, patch);
        persist();
        mongoMirror.upsertCommunity(community);
        return community;
    },
    /**
     * Hand organizer to an active member. Demotes the previous organizer's
     * membership to `member` (caller removes it separately when leaving).
     */
    transferCommunityOrganizer(communityId, newOrganizerId) {
        const community = snapshot.communities.find((c) => c.id === communityId);
        if (!community)
            return undefined;
        const previousOrganizerId = community.organizerId;
        if (previousOrganizerId === newOrganizerId)
            return community;
        community.organizerId = newOrganizerId;
        mongoMirror.upsertCommunity(community);
        const incoming = this.findCommunityMembership(communityId, newOrganizerId);
        if (incoming) {
            incoming.role = "organizer";
            incoming.status = "active";
            mongoMirror.upsertCommunityMember(incoming);
        }
        else {
            this.upsertCommunityMembership({
                communityId,
                userId: newOrganizerId,
                role: "organizer",
                status: "active",
            });
        }
        const outgoing = this.findCommunityMembership(communityId, previousOrganizerId);
        if (outgoing && outgoing.userId !== newOrganizerId) {
            outgoing.role = "member";
            mongoMirror.upsertCommunityMember(outgoing);
        }
        persist();
        return community;
    },
    /**
     * Hard-delete a community and its memberships, bulletin posts, and group
     * chat. Cancels any still-active plans tagged with this communityId.
     * Returns cancelled plan ids so the route can notify participants.
     */
    deleteCommunity(communityId) {
        const community = snapshot.communities.find((c) => c.id === communityId);
        if (!community)
            return undefined;
        const now = new Date().toISOString();
        const cancelledPlanIds = [];
        for (const plan of snapshot.plans) {
            if (plan.communityId === communityId && !plan.cancelledAt) {
                plan.cancelledAt = now;
                cancelledPlanIds.push(plan.id);
                mongoMirror.upsertPlan(plan);
            }
        }
        snapshot.communityMembers = snapshot.communityMembers.filter((m) => m.communityId !== communityId);
        mongoMirror.deleteCommunityMembersByCommunity(communityId);
        const removedPostIds = new Set(snapshot.communityPosts.filter((p) => p.communityId === communityId).map((p) => p.id));
        snapshot.communityPosts = snapshot.communityPosts.filter((p) => p.communityId !== communityId);
        mongoMirror.deleteCommunityPostsByCommunity(communityId);
        if (removedPostIds.size > 0) {
            snapshot.communityPostLikes = snapshot.communityPostLikes.filter((like) => !removedPostIds.has(like.postId));
            for (const postId of removedPostIds)
                mongoMirror.deleteCommunityPostLikesByPost(postId);
        }
        const conv = this.findCommunityConversation(communityId);
        if (conv) {
            const toRemove = messagesByConvIndex.get(conv.id) ?? [];
            for (const m of toRemove)
                messageIndex.delete(m.id);
            messagesByConvIndex.delete(conv.id);
            snapshot.messages = snapshot.messages.filter((m) => m.conversationId !== conv.id);
            snapshot.conversations = snapshot.conversations.filter((c) => c.id !== conv.id);
            mongoMirror.deleteMessagesByConversation(conv.id);
            mongoMirror.deleteConversation(conv.id);
        }
        snapshot.communities = snapshot.communities.filter((c) => c.id !== communityId);
        mongoMirror.deleteCommunity(communityId);
        persist();
        return { cancelledPlanIds };
    },
    // ---- Community members ----
    listCommunityMembers(communityId) {
        return snapshot.communityMembers.filter((m) => m.communityId === communityId);
    },
    listActiveCommunityMembers(communityId) {
        return snapshot.communityMembers.filter((m) => m.communityId === communityId && m.status === "active");
    },
    listPendingCommunityMembers(communityId) {
        return snapshot.communityMembers
            .filter((m) => m.communityId === communityId && m.status === "pending")
            .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
    },
    /**
     * Timestamps the dashboard can count: approved bulletin posts and replies,
     * non-system chat messages, and current event RSVPs.
     */
    listCommunityInteractions(communityId) {
        const events = [];
        for (const post of snapshot.communityPosts) {
            if (post.communityId !== communityId || post.deletedAt)
                continue;
            if ((post.approvalStatus ?? "approved") !== "approved")
                continue;
            if (!post.authorId || !post.createdAt)
                continue;
            events.push({ at: post.createdAt, userId: post.authorId });
        }
        const conv = snapshot.conversations.find((c) => c.communityId === communityId && c.type === "group");
        if (conv) {
            for (const msg of messagesByConvIndex.get(conv.id) ?? []) {
                if (msg.kind === "system")
                    continue;
                if (!msg.senderId || !msg.createdAt)
                    continue;
                events.push({ at: msg.createdAt, userId: msg.senderId });
            }
        }
        const planIds = new Set(snapshot.plans
            .filter((p) => p.communityId === communityId && !p.cancelledAt)
            .map((p) => p.id));
        if (planIds.size > 0) {
            for (const part of snapshot.participations) {
                if (!planIds.has(part.planId))
                    continue;
                if (part.state !== "going" && part.state !== "interested")
                    continue;
                const at = part.updatedAt || part.createdAt;
                if (!at)
                    continue;
                events.push({ at, userId: part.userId });
            }
        }
        return events;
    },
    listCommunityMembershipsForUser(userId) {
        return snapshot.communityMembers.filter((m) => m.userId === userId);
    },
    findCommunityMembership(communityId, userId) {
        return snapshot.communityMembers.find((m) => m.communityId === communityId && m.userId === userId);
    },
    /** Recompute + persist a community's denormalized active member count. */
    recountCommunityMembers(communityId) {
        const community = snapshot.communities.find((c) => c.id === communityId);
        if (!community)
            return;
        community.memberCount = snapshot.communityMembers.filter((m) => m.communityId === communityId && m.status === "active").length;
        mongoMirror.upsertCommunity(community);
    },
    upsertCommunityMembership(input) {
        const matches = snapshot.communityMembers.filter((m) => m.communityId === input.communityId && m.userId === input.userId);
        if (matches.length > 0) {
            for (const existing of matches) {
                existing.status = input.status;
                if (input.role)
                    existing.role = input.role;
                if (input.screeningAnswer !== undefined)
                    existing.screeningAnswer = input.screeningAnswer;
                mongoMirror.upsertCommunityMember(existing);
            }
            this.recountCommunityMembers(input.communityId);
            persist();
            return matches[0];
        }
        const row = {
            id: randomUUID(),
            communityId: input.communityId,
            userId: input.userId,
            role: input.role ?? "member",
            status: input.status,
            screeningAnswer: input.screeningAnswer ?? null,
            joinedAt: new Date().toISOString(),
        };
        snapshot.communityMembers.push(row);
        persist();
        mongoMirror.upsertCommunityMember(row);
        this.recountCommunityMembers(input.communityId);
        persist();
        return row;
    },
    removeCommunityMembership(communityId, userId) {
        const before = snapshot.communityMembers.length;
        snapshot.communityMembers = snapshot.communityMembers.filter((m) => !(m.communityId === communityId && m.userId === userId));
        if (snapshot.communityMembers.length === before)
            return false;
        // Drop them from the community chat too, if one exists.
        const conv = this.findCommunityConversation(communityId);
        if (conv && conv.participantIds.includes(userId)) {
            conv.participantIds = conv.participantIds.filter((id) => id !== userId);
            mongoMirror.upsertConversation(conv);
        }
        persist();
        mongoMirror.deleteCommunityMember(communityId, userId);
        this.recountCommunityMembers(communityId);
        persist();
        return true;
    },
    // ---- Community bulletin posts ----
    listAllCommunityPosts() {
        return snapshot.communityPosts.filter((p) => !p.deletedAt);
    },
    listCommunityPosts(communityId) {
        return snapshot.communityPosts
            .filter((p) => p.communityId === communityId &&
            !p.deletedAt &&
            !p.parentId &&
            (p.approvalStatus ?? "approved") === "approved")
            .sort((a, b) => {
            // Pinned first, then reverse-chron.
            if (a.pinned !== b.pinned)
                return a.pinned ? -1 : 1;
            return b.createdAt.localeCompare(a.createdAt);
        });
    },
    listCommunityPostReplies(communityId, parentId) {
        return snapshot.communityPosts
            .filter((p) => p.communityId === communityId &&
            p.parentId === parentId &&
            !p.deletedAt &&
            (p.approvalStatus ?? "approved") === "approved")
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    listPendingCommunityPosts(communityId) {
        return snapshot.communityPosts
            .filter((p) => p.communityId === communityId &&
            !p.deletedAt &&
            !p.parentId &&
            p.approvalStatus === "pending")
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    findCommunityPostById(id) {
        return snapshot.communityPosts.find((p) => p.id === id && !p.deletedAt);
    },
    createCommunityPost(input) {
        const row = {
            id: randomUUID(),
            communityId: input.communityId,
            authorId: input.authorId,
            content: input.content,
            image: input.image ?? null,
            pinned: false,
            approvalStatus: input.approvalStatus ?? "approved",
            parentId: input.parentId ?? null,
            createdAt: new Date().toISOString(),
            deletedAt: null,
        };
        snapshot.communityPosts.push(row);
        persist();
        mongoMirror.upsertCommunityPost(row);
        return row;
    },
    updateCommunityPostContent(id, content) {
        const row = snapshot.communityPosts.find((p) => p.id === id && !p.deletedAt);
        if (!row)
            return undefined;
        row.content = content;
        persist();
        mongoMirror.upsertCommunityPost(row);
        return row;
    },
    setCommunityPostApprovalStatus(id, status) {
        const row = snapshot.communityPosts.find((p) => p.id === id && !p.deletedAt);
        if (!row)
            return undefined;
        if (status === "rejected") {
            row.approvalStatus = "rejected";
            row.deletedAt = new Date().toISOString();
        }
        else {
            row.approvalStatus = "approved";
        }
        persist();
        mongoMirror.upsertCommunityPost(row);
        return row;
    },
    setCommunityPostPinned(id, pinned) {
        const row = snapshot.communityPosts.find((p) => p.id === id);
        if (!row)
            return undefined;
        row.pinned = pinned;
        persist();
        mongoMirror.upsertCommunityPost(row);
        return row;
    },
    softDeleteCommunityPost(id) {
        const row = snapshot.communityPosts.find((p) => p.id === id);
        if (!row)
            return undefined;
        const now = new Date().toISOString();
        row.deletedAt = now;
        for (const reply of snapshot.communityPosts.filter((p) => p.parentId === id && !p.deletedAt)) {
            reply.deletedAt = now;
            mongoMirror.upsertCommunityPost(reply);
        }
        persist();
        mongoMirror.upsertCommunityPost(row);
        this.clearCommunityPostLikes(id);
        return row;
    },
    communityPostLikeStats(postId, viewerId) {
        let likeCount = 0;
        let likedByMe = false;
        for (const like of snapshot.communityPostLikes) {
            if (like.postId !== postId)
                continue;
            likeCount += 1;
            if (like.userId === viewerId)
                likedByMe = true;
        }
        return { likeCount, likedByMe };
    },
    /** Toggle the viewer's like. Undefined when the post is missing or not live. */
    toggleCommunityPostLike(postId, userId) {
        const post = this.findCommunityPostById(postId);
        if (!post || (post.approvalStatus ?? "approved") !== "approved")
            return undefined;
        const existing = snapshot.communityPostLikes.find((like) => like.postId === postId && like.userId === userId);
        if (existing) {
            snapshot.communityPostLikes = snapshot.communityPostLikes.filter((like) => like !== existing);
            mongoMirror.deleteCommunityPostLike(postId, userId);
        }
        else {
            const like = {
                postId,
                userId,
                createdAt: new Date().toISOString(),
            };
            snapshot.communityPostLikes.push(like);
            mongoMirror.upsertCommunityPostLike(like);
        }
        persist();
        return this.communityPostLikeStats(postId, userId);
    },
    clearCommunityPostLikes(postId) {
        const ids = new Set(snapshot.communityPosts
            .filter((post) => post.id === postId || post.parentId === postId)
            .map((post) => post.id));
        ids.add(postId);
        if (!snapshot.communityPostLikes.some((like) => ids.has(like.postId)))
            return;
        snapshot.communityPostLikes = snapshot.communityPostLikes.filter((like) => !ids.has(like.postId));
        for (const id of ids)
            mongoMirror.deleteCommunityPostLikesByPost(id);
        persist();
    },
    // ---- Community chat (persistent group thread, not tied to a plan) ----
    findCommunityConversation(communityId) {
        return snapshot.conversations.find((c) => c.communityId === communityId && c.type === "group");
    },
    ensureCommunityConversation(communityId, participantIds, opts) {
        const existing = this.findCommunityConversation(communityId);
        if (existing) {
            const toAdd = this.filterNotLeft(existing.id, participantIds, opts?.rejoinIds ?? []);
            existing.participantIds = Array.from(new Set([...existing.participantIds, ...toAdd]));
            persist();
            mongoMirror.upsertConversation(existing);
            return existing;
        }
        const now = new Date().toISOString();
        const conv = {
            id: randomUUID(),
            planId: "",
            communityId,
            type: "group",
            participantIds: Array.from(new Set(participantIds)),
            createdAt: now,
            lastMessageAt: now,
        };
        snapshot.conversations.push(conv);
        persist();
        mongoMirror.upsertConversation(conv);
        return conv;
    },
    // ---- Interest Forums (V1) ----
    listForums() {
        return [...snapshot.interestForums];
    },
    findForumByTag(tag) {
        return snapshot.interestForums.find((f) => f.interestTag === tag);
    },
    /** Idempotent bootstrap — one forum row per launched interest, created on demand. */
    ensureForumsForInterests() {
        let changed = false;
        for (const tag of FORUM_INTERESTS) {
            if (this.findForumByTag(tag))
                continue;
            const row = {
                id: randomUUID(),
                interestTag: tag,
                createdAt: new Date().toISOString(),
            };
            snapshot.interestForums.push(row);
            mongoMirror.upsertInterestForum(row);
            changed = true;
        }
        if (changed)
            persist();
    },
    findForumMembership(userId, tag) {
        return snapshot.forumMemberships.find((m) => m.userId === userId && m.interestTag === tag);
    },
    /** Active (not-left) memberships for a user. */
    listActiveForumMemberships(userId) {
        return snapshot.forumMemberships.filter((m) => m.userId === userId && m.leftAt === null);
    },
    /** Join (or re-join) a forum. Idempotent — a no-op if already active. */
    joinForum(userId, tag) {
        const existing = this.findForumMembership(userId, tag);
        if (existing) {
            if (existing.leftAt !== null) {
                existing.leftAt = null;
                existing.joinedAt = new Date().toISOString();
                persist();
                mongoMirror.upsertForumMembership(existing);
            }
            return existing;
        }
        const row = {
            userId,
            interestTag: tag,
            joinedAt: new Date().toISOString(),
            leftAt: null,
        };
        snapshot.forumMemberships.push(row);
        persist();
        mongoMirror.upsertForumMembership(row);
        return row;
    },
    /**
     * Leave a forum. Does NOT touch the user's profile `interests` — membership
     * is intentionally decoupled so leaving a forum isn't the same as dropping
     * the interest.
     */
    leaveForum(userId, tag) {
        const existing = this.findForumMembership(userId, tag);
        if (!existing || existing.leftAt !== null)
            return existing;
        existing.leftAt = new Date().toISOString();
        persist();
        mongoMirror.upsertForumMembership(existing);
        return existing;
    },
    /**
     * Auto-join every forum matching the user's current interests. Called from
     * onboarding completion and the interests settings save. Only ever adds
     * memberships — never auto-leaves when an interest is removed, since a user
     * may still want to follow a forum they no longer list as an interest.
     */
    syncForumMembershipsFromInterests(userId, interests) {
        this.ensureForumsForInterests();
        for (const tag of interests) {
            if (!FORUM_INTERESTS.includes(tag))
                continue;
            this.joinForum(userId, tag);
        }
    },
    /**
     * Active memberships for a user, each with a lightweight preview of the
     * forum's latest approved post (used by the Messages → Interests tab).
     */
    listForumsForUser(userId) {
        return this.listActiveForumMemberships(userId)
            .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
            .map((m) => {
            const latest = this.listPosts(m.interestTag, "recent")[0];
            return {
                interestTag: m.interestTag,
                joinedAt: m.joinedAt,
                latestPost: latest
                    ? {
                        authorId: latest.authorId,
                        content: latest.content || (latest.imageUrl ? "📷 Photo" : ""),
                        createdAt: latest.createdAt,
                    }
                    : null,
            };
        });
    },
    listAllForumPosts() {
        return [...snapshot.forumPosts];
    },
    listAllForumReplies() {
        return [...snapshot.forumReplies];
    },
    /** Public feed for a forum — approved posts only, sponsored included once approved. */
    listPosts(tag, sort = "recent") {
        const posts = snapshot.forumPosts.filter((p) => p.interestTag === tag && p.approvalStatus === "approved");
        if (sort === "popular") {
            // Recency-weighted like_count: likes decay with age so a fresh post
            // with a few likes can outrank a stale high-like post.
            const now = Date.now();
            const score = (p) => {
                const ageHours = Math.max(0, (now - Date.parse(p.createdAt)) / 3_600_000);
                return p.likeCount / Math.pow(ageHours + 2, 1.5);
            };
            return posts.sort((a, b) => {
                const diff = score(b) - score(a);
                if (diff !== 0)
                    return diff;
                return b.createdAt.localeCompare(a.createdAt);
            });
        }
        return posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    findForumPostById(id) {
        return snapshot.forumPosts.find((p) => p.id === id);
    },
    createPost(input) {
        const isSponsored = input.isSponsored ?? false;
        const row = {
            id: randomUUID(),
            interestTag: input.interestTag,
            authorId: input.authorId,
            content: input.content,
            imageUrl: input.imageUrl ?? null,
            isSponsored,
            sponsorName: isSponsored ? input.sponsorName ?? null : null,
            // Sponsored posts wait for admin approval; everything else is live immediately.
            approvalStatus: isSponsored ? "pending" : "approved",
            createdAt: new Date().toISOString(),
            replyCount: 0,
            likeCount: 0,
        };
        snapshot.forumPosts.push(row);
        persist();
        mongoMirror.upsertForumPost(row);
        return row;
    },
    deleteForumPost(id) {
        const before = snapshot.forumPosts.length;
        snapshot.forumPosts = snapshot.forumPosts.filter((p) => p.id !== id);
        if (snapshot.forumPosts.length === before)
            return false;
        snapshot.forumReplies = snapshot.forumReplies.filter((r) => r.postId !== id);
        snapshot.forumPostLikes = snapshot.forumPostLikes.filter((l) => l.postId !== id);
        persist();
        mongoMirror.deleteForumPost(id);
        mongoMirror.deleteForumRepliesByPost(id);
        mongoMirror.deleteForumPostLikesByPost(id);
        return true;
    },
    listReplies(postId) {
        return snapshot.forumReplies
            .filter((r) => r.postId === postId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    createReply(postId, authorId, content, imageUrl) {
        const post = this.findForumPostById(postId);
        if (!post)
            return undefined;
        const row = {
            id: randomUUID(),
            postId,
            authorId,
            content,
            imageUrl: imageUrl ?? null,
            createdAt: new Date().toISOString(),
        };
        snapshot.forumReplies.push(row);
        post.replyCount += 1;
        persist();
        mongoMirror.upsertForumReply(row);
        mongoMirror.upsertForumPost(post);
        return row;
    },
    hasLikedPost(postId, userId) {
        return snapshot.forumPostLikes.some((l) => l.postId === postId && l.userId === userId);
    },
    /** Toggle the viewer's like on a post. Returns the updated post, or undefined if not found. */
    toggleLike(postId, userId) {
        const post = this.findForumPostById(postId);
        if (!post)
            return undefined;
        const already = this.hasLikedPost(postId, userId);
        if (already) {
            snapshot.forumPostLikes = snapshot.forumPostLikes.filter((l) => !(l.postId === postId && l.userId === userId));
            post.likeCount = Math.max(0, post.likeCount - 1);
            mongoMirror.deleteForumPostLike(postId, userId);
        }
        else {
            const like = {
                postId,
                userId,
                createdAt: new Date().toISOString(),
            };
            snapshot.forumPostLikes.push(like);
            post.likeCount += 1;
            mongoMirror.upsertForumPostLike(like);
        }
        persist();
        mongoMirror.upsertForumPost(post);
        return post;
    },
    // ---- Admin: sponsored forum post review ----
    listPendingForumPosts() {
        return snapshot.forumPosts
            .filter((p) => p.approvalStatus === "pending")
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    setForumPostApprovalStatus(id, status) {
        const post = this.findForumPostById(id);
        if (!post)
            return undefined;
        post.approvalStatus = status;
        persist();
        mongoMirror.upsertForumPost(post);
        return post;
    },
    // ---- Devices (push notification tokens) ----
    listDevicesForUser(userId) {
        return snapshot.devices.filter((d) => d.userId === userId);
    },
    listAllDevices() {
        return [...snapshot.devices];
    },
    /**
     * Register (or reassign) a device token. Tokens are unique per
     * installation — re-registering under a different account (sign out/in on
     * the same device) moves the existing row rather than creating a duplicate.
     */
    registerDevice(userId, token, platform) {
        const existing = snapshot.devices.find((d) => d.token === token);
        const now = new Date().toISOString();
        if (existing) {
            existing.userId = userId;
            existing.platform = platform;
            existing.updatedAt = now;
            persist();
            mongoMirror.upsertDevice(existing);
            return existing;
        }
        const row = { id: randomUUID(), userId, token, platform, updatedAt: now };
        snapshot.devices.push(row);
        persist();
        mongoMirror.upsertDevice(row);
        return row;
    },
    unregisterDevice(userId, token) {
        const before = snapshot.devices.length;
        snapshot.devices = snapshot.devices.filter((d) => !(d.userId === userId && d.token === token));
        if (snapshot.devices.length === before)
            return false;
        persist();
        mongoMirror.deleteDeviceByToken(token);
        return true;
    },
    /** Remember which Apple gateway accepted this installation so the next send doesn't guess. */
    setDeviceApnsEnv(token, apnsEnv) {
        const row = snapshot.devices.find((d) => d.token === token);
        if (!row || row.apnsEnv === apnsEnv)
            return;
        row.apnsEnv = apnsEnv;
        row.updatedAt = new Date().toISOString();
        persist();
        mongoMirror.upsertDevice(row);
    },
    /** Drop a token regardless of owner — used when APNs reports it as dead (410). */
    unregisterDeviceByToken(token) {
        const before = snapshot.devices.length;
        snapshot.devices = snapshot.devices.filter((d) => d.token !== token);
        if (snapshot.devices.length === before)
            return false;
        persist();
        mongoMirror.deleteDeviceByToken(token);
        return true;
    },
};
