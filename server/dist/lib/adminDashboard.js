// Founder admin metrics. Seed/demo accounts are left out of every rate so the
// glance reflects people who signed up through Verify. External systems we
// don't record (App Store downloads, the Google Form waitlist, Sentry) are
// returned as unavailable rather than filled in.
import twilio from "twilio";
import { isMongoConnected } from "./db.js";
import { planPoint } from "./geo.js";
import { planStartTimestamp } from "./planTime.js";
import { LogModel } from "../models/index.js";
import { store } from "../store.js";
import { AGE_RANGE_LABELS } from "../types/shared.js";
import { findUserById, listAllUsers } from "../userRepo.js";
const TZ = "America/New_York";
/** Launch day. Dashboard counts ignore anything earlier than this New York date. */
export const ADMIN_DATA_START = "2026-10-01";
const BETA_FORM = "https://docs.google.com/forms/u/0/d/e/1FAIpQLSfiQUov1e2K9wUlgvIR26Qxnm9MPhQ88MHgophxKS4AClZwZQ/viewform";
const WAITLIST_FORM = "https://forms.gle/GxVDLYj74rvXtGYb9";
function dayKey(date) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}
function dayKeyFromIso(iso) {
    if (!iso)
        return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t))
        return null;
    return dayKey(new Date(t));
}
function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + n));
    return dt.toISOString().slice(0, 10);
}
function daysBetween(start, end) {
    const out = [];
    for (let d = start; d <= end; d = addDays(d, 1))
        out.push(d);
    return out;
}
function mondayOf(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
    const dow = dt.getUTCDay();
    const delta = dow === 0 ? -6 : 1 - dow;
    return addDays(iso, delta);
}
function inRange(day, start, end) {
    return Boolean(day && day >= start && day <= end);
}
function pct(num, den) {
    if (!den)
        return null;
    return Math.round((1000 * num) / den) / 10;
}
function round1(n) {
    return Math.round(n * 10) / 10;
}
function isSeed(user) {
    return user?.accountSource === "seed";
}
function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0)
        return "•";
    if (parts.length === 1)
        return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
function prettyDay(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function prettyRange(start, end) {
    if (start.slice(0, 7) === end.slice(0, 7)) {
        return `${prettyDay(start)} – ${Number(end.slice(8))}`;
    }
    return `${prettyDay(start)} – ${prettyDay(end)}`;
}
function isDay(value) {
    return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
export function defaultAdminDashboardView() {
    return {
        from: ADMIN_DATA_START,
        to: "today",
        preset: "since_launch",
        communityId: null,
        neighborhoodId: null,
        includeSeed: false,
    };
}
export function resolveAdminDashboardView(input, today) {
    const base = { ...defaultAdminDashboardView(), ...(input ?? {}) };
    const preset = input?.preset ?? (input?.from || input?.to ? "custom" : base.preset);
    let from = isDay(base.from) ? base.from : ADMIN_DATA_START;
    let to = base.to === "today" || !isDay(base.to) ? today : base.to;
    if (preset === "since_launch") {
        from = ADMIN_DATA_START;
        to = today;
    }
    else if (preset === "last_7") {
        from = addDays(today, -6);
        to = today;
    }
    else if (preset === "last_30") {
        from = addDays(today, -29);
        to = today;
    }
    if (from < ADMIN_DATA_START)
        from = ADMIN_DATA_START;
    if (to < ADMIN_DATA_START)
        to = ADMIN_DATA_START;
    if (to > today)
        to = today;
    if (from > to)
        from = to;
    const rangeDays = daysBetween(from, to);
    const span = rangeDays.length;
    const prevEnd = addDays(from, -1);
    const prevStartRaw = addDays(from, -span);
    const prevStart = prevStartRaw < ADMIN_DATA_START ? ADMIN_DATA_START : prevStartRaw;
    const prevDays = prevEnd >= ADMIN_DATA_START && prevStart <= prevEnd ? daysBetween(prevStart, prevEnd) : [];
    const compareLabel = prevDays.length === 0
        ? "before Oct 1 isn't included"
        : prevDays.length === 7 && span === 7
            ? "vs prior week"
            : `vs prior ${prevDays.length} day${prevDays.length === 1 ? "" : "s"}`;
    return {
        from,
        to,
        communityId: base.communityId || null,
        neighborhoodId: base.neighborhoodId || null,
        includeSeed: Boolean(base.includeSeed),
        preset,
        rangeDays,
        prevDays,
        compareLabel,
        today,
    };
}
export function sanitizeAdminDashboardView(body, today) {
    const raw = body && typeof body === "object" ? body : {};
    const communityId = typeof raw.communityId === "string" ? raw.communityId : null;
    const neighborhoodId = typeof raw.neighborhoodId === "string" ? raw.neighborhoodId : null;
    const preset = raw.preset === "since_launch" || raw.preset === "last_7" || raw.preset === "last_30" || raw.preset === "custom"
        ? raw.preset
        : "custom";
    const resolved = resolveAdminDashboardView({
        from: typeof raw.from === "string" ? raw.from : ADMIN_DATA_START,
        to: typeof raw.to === "string" ? raw.to : "today",
        preset,
        communityId,
        neighborhoodId,
        includeSeed: raw.includeSeed === true || raw.includeSeed === "1" || raw.includeSeed === "true",
    }, today);
    return {
        from: resolved.from,
        to: preset === "custom" ? resolved.to : "today",
        preset,
        communityId: resolved.communityId,
        neighborhoodId: resolved.neighborhoodId,
        includeSeed: resolved.includeSeed,
    };
}
function userInNeighborhood(user, neighborhoodId) {
    if (user.neighborhoodId === neighborhoodId)
        return true;
    return (user.neighborhoodIds ?? []).includes(neighborhoodId);
}
function deltaOf(value, previous, spark) {
    return {
        value,
        previous,
        delta: value === null || previous === null ? null : round1(value - previous),
        spark,
    };
}
function touch(activity, iso, userId, seedIds, minDay = ADMIN_DATA_START, maxDay = "9999-99-99") {
    if (!userId || seedIds.has(userId))
        return;
    const day = dayKeyFromIso(iso);
    if (!day || day < minDay || day > maxDay)
        return;
    let set = activity.byDay.get(day);
    if (!set) {
        set = new Set();
        activity.byDay.set(day, set);
    }
    set.add(userId);
}
function usersOnDays(activity, days) {
    const ids = new Set();
    for (const day of days) {
        const set = activity.byDay.get(day);
        if (!set)
            continue;
        for (const id of set)
            ids.add(id);
    }
    return ids;
}
function goingCount(plan, hostCounts) {
    const rows = store.listParticipationsForPlan(plan.id).filter((p) => p.state === "going");
    const ids = new Set(rows.map((p) => p.userId));
    if (hostCounts && !ids.has(plan.creatorId))
        ids.add(plan.creatorId);
    return ids.size;
}
function hasJoin(plan, seedIds) {
    return store.listParticipationsForPlan(plan.id).some((p) => p.userId !== plan.creatorId &&
        !seedIds.has(p.userId) &&
        (p.state === "going" || p.state === "interested"));
}
function payloadField(payload, key) {
    if (!payload || typeof payload !== "object")
        return null;
    const value = payload[key];
    return typeof value === "string" && value ? value : null;
}
async function loadLogs(sinceIso) {
    if (isMongoConnected()) {
        try {
            const rows = await LogModel.find({ createdAt: { $gte: sinceIso } })
                .select({ event: 1, payload: 1, createdAt: 1, _id: 0 })
                .lean();
            return rows.map((r) => ({ event: r.event, payload: r.payload, createdAt: r.createdAt }));
        }
        catch (err) {
            console.error("[adminDashboard] log read failed", err);
        }
    }
    return store.listLogsRecent(2000).filter((r) => r.createdAt >= sinceIso);
}
async function twilioSms(windowDays) {
    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();
    if (!sid || !token) {
        return { connected: false, messages: null, priceUsd: null, windowDays, error: null };
    }
    try {
        const client = twilio(sid, token);
        const end = new Date();
        const start = new Date(end.getTime() - windowDays * 86400000);
        const records = await client.usage.records.list({
            category: "sms-outbound",
            startDate: start,
            endDate: end,
            limit: 200,
        });
        let messages = 0;
        let price = 0;
        for (const row of records) {
            messages += Number(row.count) || 0;
            price += Number(row.price) || 0;
        }
        return { connected: true, messages, priceUsd: Math.round(price * 100) / 100, windowDays, error: null };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Twilio usage request failed";
        return { connected: true, messages: null, priceUsd: null, windowDays, error: message };
    }
}
export async function buildAdminDashboard(viewerId, requested, saved = null) {
    const started = Date.now();
    const now = new Date();
    const today = dayKey(now);
    const scope = resolveAdminDashboardView(requested, today);
    const weekStart = scope.from;
    const weekEnd = scope.to;
    const weekDays = scope.rangeDays;
    const prevDays = scope.prevDays;
    const dauDays = scope.rangeDays;
    const users = await listAllUsers();
    const allSeedIds = new Set(users.filter((u) => isSeed(u)).map((u) => u.id));
    const seedIds = scope.includeSeed ? new Set() : allSeedIds;
    const userById = new Map(users.map((u) => [u.id, u]));
    const neighborhoods = store.listNeighborhoods();
    const hoodName = new Map(neighborhoods.map((n) => [n.id, n.name]));
    const communities = store.listCommunities();
    if (scope.communityId && !communities.some((c) => c.id === scope.communityId))
        scope.communityId = null;
    if (scope.neighborhoodId && !neighborhoods.some((n) => n.id === scope.neighborhoodId))
        scope.neighborhoodId = null;
    const population = users.filter((u) => scope.includeSeed || !isSeed(u));
    const memberIds = scope.communityId
        ? new Set(store.listCommunityMembers(scope.communityId)
            .filter((member) => {
            if (member.status !== "active")
                return false;
            const day = dayKeyFromIso(member.joinedAt);
            return !!day && day >= ADMIN_DATA_START && day <= scope.to;
        })
            .map((member) => member.userId))
        : null;
    function inCohort(user) {
        const day = dayKeyFromIso(user.createdAt);
        if (!day || day < scope.from || day > scope.to)
            return false;
        if (scope.neighborhoodId && !userInNeighborhood(user, scope.neighborhoodId))
            return false;
        if (memberIds && !memberIds.has(user.id))
            return false;
        return true;
    }
    const realUsers = population.filter(inCohort);
    function actorOk(userId) {
        if (!userId || seedIds.has(userId))
            return false;
        if (!scope.neighborhoodId)
            return true;
        const user = userById.get(userId);
        return !!user && userInNeighborhood(user, scope.neighborhoodId);
    }
    function note(iso, userId) {
        if (!actorOk(userId))
            return;
        touch(activity, iso, userId, seedIds, ADMIN_DATA_START, scope.to);
    }
    function eventDayOk(iso, minDay = ADMIN_DATA_START) {
        const day = dayKeyFromIso(iso);
        return !!day && day >= minDay && day <= scope.to;
    }
    const plans = store.listPlans().filter((plan) => {
        if (!scope.includeSeed && allSeedIds.has(plan.creatorId))
            return false;
        if (scope.communityId && plan.communityId !== scope.communityId)
            return false;
        if (scope.neighborhoodId && plan.neighborhoodId !== scope.neighborhoodId)
            return false;
        const created = dayKeyFromIso(plan.createdAt);
        const dated = plan.date?.slice(0, 10) ?? null;
        const createdOk = !!created && created >= ADMIN_DATA_START && created <= scope.to;
        const datedOk = !!dated && dated >= ADMIN_DATA_START && dated <= scope.to;
        return createdOk || datedOk;
    });
    const livePlans = plans.filter((p) => !p.cancelledAt);
    const planIds = new Set(plans.map((p) => p.id));
    const conversations = store.listAllConversations().filter((convo) => {
        if (!scope.communityId)
            return true;
        return convo.communityId === scope.communityId;
    });
    const convoIds = new Set(conversations.map((c) => c.id));
    const messages = store.listAllMessages().filter((message) => {
        if (scope.communityId && !convoIds.has(message.conversationId))
            return false;
        return eventDayOk(message.createdAt);
    });
    const posts = store.listAllCommunityPosts().filter((post) => {
        if (scope.communityId && post.communityId !== scope.communityId)
            return false;
        return eventDayOk(post.createdAt);
    });
    const forumPosts = scope.communityId
        ? []
        : store.listAllForumPosts().filter((post) => eventDayOk(post.createdAt));
    const forumReplies = scope.communityId
        ? []
        : store.listAllForumReplies().filter((reply) => eventDayOk(reply.createdAt));
    const feedback = store.listAllFeedback().filter((row) => {
        if (!eventDayOk(row.createdAt))
            return false;
        if (!scope.communityId && !scope.neighborhoodId)
            return true;
        const plan = store.findPlanById(row.planId);
        if (!plan)
            return false;
        if (scope.communityId && plan.communityId !== scope.communityId)
            return false;
        if (scope.neighborhoodId && plan.neighborhoodId !== scope.neighborhoodId)
            return false;
        return true;
    });
    const activity = { byDay: new Map() };
    for (const plan of plans)
        note(plan.createdAt, plan.creatorId);
    for (const part of store.listAllParticipations()) {
        if (!planIds.has(part.planId))
            continue;
        note(part.updatedAt, part.userId);
        note(part.createdAt, part.userId);
    }
    for (const message of messages) {
        if (message.kind === "system")
            continue;
        note(message.createdAt, message.senderId);
    }
    for (const post of posts)
        note(post.createdAt, post.authorId);
    for (const post of forumPosts)
        note(post.createdAt, post.authorId);
    for (const reply of forumReplies)
        note(reply.createdAt, reply.authorId);
    for (const row of feedback)
        note(row.createdAt, row.fromUserId);
    const logSince = addDays(ADMIN_DATA_START, -1) + "T00:00:00.000Z";
    const logs = await loadLogs(logSince);
    const interestPairs = new Set();
    const convertedPairs = new Set();
    for (const log of logs) {
        const day = dayKeyFromIso(log.createdAt);
        if (!day || day < ADMIN_DATA_START || day > scope.to)
            continue;
        const inSelected = day >= scope.from;
        if (log.event === "plan_viewed") {
            note(log.createdAt, payloadField(log.payload, "userId"));
        }
        else if (log.event === "participation_changed") {
            const userId = payloadField(log.payload, "userId");
            const planId = payloadField(log.payload, "planId");
            note(log.createdAt, userId);
            if (!inSelected || !userId || !planId || !actorOk(userId))
                continue;
            if ((scope.communityId || scope.neighborhoodId) && !planIds.has(planId))
                continue;
            const toState = payloadField(log.payload, "to");
            const fromState = payloadField(log.payload, "from");
            const key = `${planId}:${userId}`;
            if (toState === "interested")
                interestPairs.add(key);
            if (fromState === "interested" && toState === "going")
                convertedPairs.add(key);
        }
        else if (log.event === "plan_approved") {
            const userId = payloadField(log.payload, "userId");
            const planId = payloadField(log.payload, "planId");
            if (!inSelected || !userId || !planId || !actorOk(userId))
                continue;
            if ((scope.communityId || scope.neighborhoodId) && !planIds.has(planId))
                continue;
            convertedPairs.add(`${planId}:${userId}`);
        }
    }
    function postedOn(days) {
        if (days.length === 0)
            return [];
        const start = days[0];
        const end = days[days.length - 1];
        return livePlans.filter((p) => inRange(dayKeyFromIso(p.createdAt), start, end));
    }
    function completedOn(days) {
        if (days.length === 0)
            return [];
        const start = days[0];
        const end = days[days.length - 1];
        return livePlans.filter((p) => p.happenedOutcome === "yes" && inRange(p.date.slice(0, 10), start, end));
    }
    function zeroJoinCount(rows) {
        return rows.filter((p) => !hasJoin(p, seedIds)).length;
    }
    function meanPeople(rows) {
        if (rows.length === 0)
            return null;
        const total = rows.reduce((sum, plan) => sum + goingCount(plan, true), 0);
        return round1(total / rows.length);
    }
    const hasPrev = prevDays.length > 0;
    const posted = postedOn(weekDays);
    const prevPosted = postedOn(prevDays);
    const completed = completedOn(weekDays);
    const prevCompleted = completedOn(prevDays);
    const joined = posted.filter((p) => hasJoin(p, seedIds));
    const completedPosted = posted.filter((p) => p.happenedOutcome === "yes");
    const zeroJoins = zeroJoinCount(posted);
    let shortNotice = 0;
    for (const plan of posted) {
        if (hasJoin(plan, seedIds) || plan.isFlexibleDate)
            continue;
        const startAt = planStartTimestamp(plan);
        const created = Date.parse(plan.createdAt);
        if (Number.isFinite(startAt) && Number.isFinite(created) && startAt - created < 24 * 3600 * 1000 && startAt >= created) {
            shortNotice += 1;
        }
    }
    const wau = usersOnDays(activity, weekDays).size;
    const prevWau = hasPrev ? usersOnDays(activity, prevDays).size : null;
    const peopleSpark = weekDays.map((day) => meanPeople(completedOn([day])) ?? 0);
    const completedSpark = weekDays.map((day) => completedOn([day]).length);
    const zeroSpark = weekDays.map((day) => zeroJoinCount(postedOn([day])));
    const wauSpark = weekDays.map((day) => activity.byDay.get(day)?.size ?? 0);
    const dauSeries = dauDays.map((date) => ({ date, count: activity.byDay.get(date)?.size ?? 0 }));
    const yesterday = dauSeries[dauSeries.length - 1]?.count ?? 0;
    const dayBefore = dauSeries[dauSeries.length - 2]?.count ?? 0;
    const firstSignup = population
        .filter((user) => {
        const day = dayKeyFromIso(user.createdAt);
        if (!day || day < ADMIN_DATA_START)
            return false;
        if (scope.neighborhoodId && !userInNeighborhood(user, scope.neighborhoodId))
            return false;
        if (memberIds && !memberIds.has(user.id))
            return false;
        return true;
    })
        .map((user) => dayKeyFromIso(user.createdAt))
        .filter((day) => Boolean(day))
        .sort()[0] ?? null;
    function membersJoined(communityId) {
        let count = 0;
        for (const member of store.listCommunityMembers(communityId)) {
            if (member.status !== "active")
                continue;
            const day = dayKeyFromIso(member.joinedAt);
            if (!day || day < scope.from || day > scope.to)
                continue;
            const user = userById.get(member.userId);
            if (!user || !actorOk(member.userId))
                continue;
            count += 1;
        }
        return count;
    }
    const communityActivity = communityActivityIndex(communities.map((c) => c.id), posts, livePlans, conversations, messages, { minDay: ADMIN_DATA_START, maxDay: scope.to, userOk: actorOk });
    const quietSinceLaunch = daysBetween(ADMIN_DATA_START, scope.to).length;
    const alerts = communities
        .filter((c) => c.isFounding && c.creationStatus === "approved" && !c.hiddenAt)
        .filter((c) => !scope.communityId || c.id === scope.communityId)
        .map((c) => {
        const lastDay = dayKeyFromIso(communityActivity.lastAt.get(c.id));
        const daysInactive = lastDay && lastDay >= ADMIN_DATA_START && lastDay <= scope.to
            ? daysBetween(lastDay, scope.to).length - 1
            : quietSinceLaunch;
        return { communityId: c.id, name: c.name, daysInactive };
    })
        .filter((c) => c.daysInactive >= 7)
        .sort((a, b) => b.daysInactive - a.daysInactive);
    const activeCommunities = communities
        .filter((c) => c.creationStatus === "approved" && !c.hiddenAt)
        .filter((c) => !scope.communityId || c.id === scope.communityId)
        .map((c) => ({
        id: c.id,
        name: c.name,
        initials: initials(c.name),
        members: membersJoined(c.id),
        plans: livePlans.filter((p) => p.communityId === c.id && inRange(dayKeyFromIso(p.createdAt), weekStart, weekEnd)).length,
    }))
        .sort((a, b) => b.plans - a.plans || b.members - a.members)
        .slice(0, 6);
    const rangePlans = livePlans.filter((p) => inRange(dayKeyFromIso(p.createdAt), weekStart, weekEnd));
    const rangePosts = posts.filter((p) => inRange(dayKeyFromIso(p.createdAt), weekStart, weekEnd));
    const health = buildHealth({
        realUsers,
        livePlans: rangePlans,
        activity,
        today: scope.to,
        clockDay: today,
        communities,
        communityActivity,
        now,
        interestPairs,
        convertedPairs,
        seedIds,
        from: scope.from,
        communityId: scope.communityId,
        neighborhoodId: scope.neighborhoodId,
        userOk: actorOk,
        windowDays: weekDays.length,
    });
    const acquisition = buildAcquisition({ realUsers, hoodName, activity, userById, from: scope.from, to: scope.to });
    const communityRows = buildCommunityRows(weekStart, weekEnd, rangePlans, rangePosts, communityActivity, scope.communityId, membersJoined, scope.includeSeed);
    const twilioDays = Math.max(1, weekDays.length);
    const twilioUsage = await Promise.race([
        twilioSms(twilioDays),
        new Promise((resolve) => {
            setTimeout(() => resolve({ connected: true, messages: null, priceUsd: null, windowDays: twilioDays, error: "Timed out reading Twilio usage" }), 4000);
        }),
    ]);
    const viewer = viewerId ? await findUserById(viewerId) : null;
    const viewerHood = viewer?.neighborhoodId ? hoodName.get(viewer.neighborhoodId) ?? null : null;
    return {
        generatedAt: now.toISOString(),
        updatedLabel: `Updated today, ${now.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })}`,
        seedExcluded: scope.includeSeed ? 0 : allSeedIds.size,
        view: {
            dataStart: ADMIN_DATA_START,
            today,
            from: scope.from,
            to: scope.to,
            communityId: scope.communityId,
            neighborhoodId: scope.neighborhoodId,
            includeSeed: scope.includeSeed,
            preset: scope.preset,
            rangeLabel: prettyRange(scope.from, scope.to),
            compareLabel: scope.compareLabel,
            saved,
            options: {
                communities: [...communities]
                    .map((c) => ({ id: c.id, name: c.name }))
                    .sort((a, b) => a.name.localeCompare(b.name)),
                neighborhoods: [...neighborhoods]
                    .map((n) => ({ id: n.id, name: n.name }))
                    .sort((a, b) => a.name.localeCompare(b.name)),
            },
        },
        viewer: {
            firstName: viewer?.firstName || "Admin",
            lastName: viewer?.lastName || "",
            neighborhoodName: viewerHood,
        },
        overview: {
            rangeLabel: prettyRange(weekStart, weekEnd),
            weekNumber: firstSignup ? Math.max(1, Math.floor((Date.parse(weekEnd) - Date.parse(firstSignup)) / (7 * 86400000)) + 1) : null,
            sinceLabel: firstSignup ? `since first signup ${prettyDay(firstSignup)}` : null,
            plansCompleted: deltaOf(completed.length, hasPrev ? prevCompleted.length : null, completedSpark),
            avgPeople: deltaOf(meanPeople(completed), hasPrev ? meanPeople(prevCompleted) : null, peopleSpark),
            zeroJoins: deltaOf(zeroJoins, hasPrev ? zeroJoinCount(prevPosted) : null, zeroSpark),
            wau: deltaOf(wau, prevWau, wauSpark),
            funnel: {
                posted: posted.length,
                joined: joined.length,
                completed: completedPosted.length,
                postedToJoinedPct: pct(joined.length, posted.length),
                joinedToCompletedPct: pct(completedPosted.length, joined.length),
                happenedPct: pct(completedPosted.length, posted.length),
                zeroJoins,
                shortNoticeZeroJoins: shortNotice,
            },
            alerts,
            dau: {
                days: dauSeries,
                yesterday,
                latestLabel: prettyDay(dauDays[dauDays.length - 1] ?? scope.to),
                deltaPct: dayBefore > 0 ? pct(yesterday - dayBefore, dayBefore) : null,
                firstSignupDate: firstSignup,
            },
            activeCommunities,
        },
        health,
        acquisition,
        communities: { rows: communityRows },
        operations: {
            feedback: {
                formUrl: BETA_FORM,
                trackedInApp: false,
                hostNotes: feedback
                    .filter((f) => f.note?.trim() && inRange(dayKeyFromIso(f.createdAt), scope.from, scope.to))
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .slice(0, 20)
                    .map((f) => ({
                    id: f.id,
                    thumb: f.thumb,
                    note: f.note.trim(),
                    createdAt: f.createdAt,
                    planTitle: store.findPlanById(f.planId)?.title || "Removed plan",
                })),
            },
            users: realUsers
                .map((u) => ({
                id: u.id,
                firstName: u.firstName || "—",
                lastName: u.lastName || "",
                phoneTail: u.phoneNumber.replace(/\D/g, "").slice(-4),
                neighborhoodName: (u.neighborhoodId && hoodName.get(u.neighborhoodId)) || null,
                seed: isSeed(u),
                onboardingComplete: u.onboardingComplete,
                createdAt: u.createdAt,
            }))
                .sort((a, b) => a.firstName.localeCompare(b.firstName)),
            system: {
                dashboardMs: Date.now() - started,
                apiLatencyTracked: false,
                appLoadTracked: false,
                sentry: {
                    connected: false,
                    reason: process.env.SENTRY_DSN?.trim() || process.env.VITE_SENTRY_DSN?.trim()
                        ? "A Sentry DSN is set, but this server doesn't query Sentry for an error rate."
                        : "Sentry isn't connected.",
                },
                twilio: twilioUsage,
                railway: {
                    connected: Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID),
                    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || null,
                    service: process.env.RAILWAY_SERVICE_NAME || null,
                },
                anthropic: { connected: Boolean(process.env.ANTHROPIC_API_KEY?.trim()) },
            },
        },
    };
}
function communityActivityIndex(communityIds, posts, plans, conversations, messages, bounds) {
    const lastAt = new Map();
    const actors = new Map();
    const bump = (communityId, at, userId) => {
        if (bounds) {
            const day = dayKeyFromIso(at);
            if (!day || day < bounds.minDay || day > bounds.maxDay)
                return;
        }
        if (userId && bounds?.userOk && !bounds.userOk(userId))
            return;
        const prev = lastAt.get(communityId);
        if (!prev || at > prev)
            lastAt.set(communityId, at);
        if (!userId)
            return;
        const list = actors.get(communityId) ?? [];
        list.push({ at, userId });
        actors.set(communityId, list);
    };
    for (const id of communityIds)
        actors.set(id, []);
    for (const post of posts)
        bump(post.communityId, post.createdAt, post.authorId);
    for (const plan of plans) {
        if (plan.communityId)
            bump(plan.communityId, plan.createdAt, plan.creatorId);
    }
    const convoByCommunity = new Map();
    for (const convo of conversations) {
        if (!convo.communityId)
            continue;
        convoByCommunity.set(convo.id, convo.communityId);
        bump(convo.communityId, convo.lastMessageAt);
    }
    for (const message of messages) {
        if (message.kind === "system")
            continue;
        const communityId = convoByCommunity.get(message.conversationId);
        if (communityId)
            bump(communityId, message.createdAt, message.senderId);
    }
    for (const community of store.listCommunities()) {
        for (const member of store.listCommunityMembers(community.id)) {
            if (bounds?.userOk && !bounds.userOk(member.userId))
                continue;
            bump(community.id, member.joinedAt, member.userId);
        }
    }
    return { lastAt, actors };
}
function buildHealth(input) {
    const plansByUser = new Map();
    for (const plan of input.livePlans) {
        const list = plansByUser.get(plan.creatorId) ?? [];
        list.push(plan.createdAt);
        plansByUser.set(plan.creatorId, list);
    }
    let eligible = 0;
    let converted = 0;
    const asOf = Date.parse(`${input.today}T12:00:00Z`);
    const cutoff = asOf - 30 * 86400000;
    for (const times of plansByUser.values()) {
        times.sort();
        const first = Date.parse(times[0] ?? "");
        if (!Number.isFinite(first) || first > cutoff)
            continue;
        eligible += 1;
        const second = times.slice(1).some((t) => Date.parse(t) - first <= 30 * 86400000);
        if (second)
            converted += 1;
    }
    const cohorts = new Map();
    for (const user of input.realUsers) {
        const day = dayKeyFromIso(user.createdAt);
        if (!day)
            continue;
        const week = mondayOf(day);
        const list = cohorts.get(week) ?? [];
        list.push(user.id);
        cohorts.set(week, list);
    }
    const retention = [...cohorts.entries()]
        .map(([weekStart, ids]) => {
        const windowStart = addDays(weekStart, 28);
        const windowEnd = addDays(windowStart, 6);
        if (windowEnd > input.today)
            return null;
        if (windowEnd === input.today && input.today === input.clockDay)
            return null;
        const days = daysBetween(windowStart, windowEnd);
        const active = usersOnDays(input.activity, days);
        const retained = ids.filter((id) => active.has(id)).length;
        return { weekStart, signups: ids.length, retained, ratePct: pct(retained, ids.length) };
    })
        .filter((row) => Boolean(row))
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
        .slice(0, 6);
    const approved = input.communities.filter((c) => c.creationStatus === "approved" && !c.hiddenAt && (!input.communityId || c.id === input.communityId));
    const communityRows = approved
        .map((c) => {
        const last = input.communityActivity.lastAt.get(c.id) ?? null;
        const lastDay = dayKeyFromIso(last);
        const daysInactive = lastDay && lastDay <= input.today ? daysBetween(lastDay, input.today).length - 1 : null;
        const active = daysInactive !== null && daysInactive < 7;
        return {
            id: c.id,
            name: c.name,
            initials: initials(c.name),
            active,
            daysInactive,
            lastActivityAt: last,
        };
    })
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    const memberships = new Map();
    let communityMembers = 0;
    let multi = 0;
    for (const community of approved) {
        for (const member of store.listCommunityMembers(community.id)) {
            if (member.status !== "active" || !input.userOk(member.userId))
                continue;
            const joinedDay = dayKeyFromIso(member.joinedAt);
            if (!joinedDay || joinedDay < input.from || joinedDay > input.today)
                continue;
            const list = memberships.get(member.userId) ?? [];
            list.push({ communityId: member.communityId, joinedAt: member.joinedAt });
            memberships.set(member.userId, list);
        }
    }
    for (const list of memberships.values()) {
        communityMembers += 1;
        if (list.length > 1)
            multi += 1;
    }
    const joiners = new Set();
    const outsiders = new Set();
    for (const part of store.listAllParticipations()) {
        if (!input.userOk(part.userId))
            continue;
        if (part.state !== "going" && part.state !== "interested")
            continue;
        const when = part.createdAt ?? part.updatedAt;
        const whenDay = dayKeyFromIso(when);
        if (!whenDay || whenDay < input.from || whenDay > input.today)
            continue;
        const plan = store.findPlanById(part.planId);
        if (!plan?.communityId || plan.cancelledAt)
            continue;
        if (input.communityId && plan.communityId !== input.communityId)
            continue;
        if (input.neighborhoodId && plan.neighborhoodId !== input.neighborhoodId)
            continue;
        joiners.add(part.userId);
        const joined = (memberships.get(part.userId) ?? []).find((m) => m.communityId === plan.communityId);
        if (!joined || joined.joinedAt > when)
            outsiders.add(part.userId);
    }
    const steps = onboardingSteps(input.realUsers);
    const interested = input.interestPairs.size;
    let convertedInterest = 0;
    for (const key of input.interestPairs) {
        if (input.convertedPairs.has(key))
            convertedInterest += 1;
    }
    return {
        repeatPosting: { ratePct: pct(converted, eligible), converted, eligible },
        retention,
        communities: {
            activeCount: communityRows.filter((c) => c.active).length,
            inactiveCount: communityRows.filter((c) => !c.active).length,
            rows: communityRows,
        },
        crossPollination: {
            multiCommunityPct: pct(multi, communityMembers),
            multiCommunityUsers: multi,
            communityMembers,
            outsiderJoinPct: pct(outsiders.size, joiners.size),
            outsiderJoinUsers: outsiders.size,
            communityPlanJoiners: joiners.size,
        },
        interestedToIn: {
            ratePct: pct(convertedInterest, interested),
            interested,
            converted: convertedInterest,
            windowDays: input.windowDays,
        },
        onboarding: steps,
    };
}
function onboardingSteps(users) {
    const furthest = users.map((user) => {
        if (user.onboardingComplete)
            return 6;
        if (user.termsAcceptedAt && user.privacyAcceptedAt)
            return 5;
        if (user.ageRange)
            return 4;
        if (user.firstName?.trim() && user.avatarPhotoDataUrl?.trim())
            return 3;
        if ((user.interests?.length ?? 0) > 0)
            return 2;
        if (user.neighborhoodId || (user.neighborhoodIds?.length ?? 0) > 0)
            return 1;
        return 0;
    });
    const labels = [
        "Signed up",
        "Neighborhood",
        "Interests",
        "Profile",
        "Age",
        "Terms & privacy",
        "Finished",
    ];
    return labels.map((step, index) => {
        const count = furthest.filter((n) => n >= index).length;
        return { step, count, pct: pct(count, users.length) };
    });
}
function buildAcquisition(input) {
    const ageOrder = [
        { id: "18_24", label: AGE_RANGE_LABELS["18_24"] },
        { id: "25_35", label: AGE_RANGE_LABELS["25_35"] },
        { id: "35_50", label: AGE_RANGE_LABELS["35_50"] },
        { id: "50_plus", label: AGE_RANGE_LABELS["50_plus"] },
        { id: "unset", label: "Not set" },
    ];
    const ageCounts = new Map(ageOrder.map((a) => [a.id, 0]));
    const hoodCounts = new Map();
    for (const user of input.realUsers) {
        const age = user.ageRange ?? "unset";
        ageCounts.set(age, (ageCounts.get(age) ?? 0) + 1);
        const hood = (user.neighborhoodId && input.hoodName.get(user.neighborhoodId)) || "Other";
        hoodCounts.set(hood, (hoodCounts.get(hood) ?? 0) + 1);
    }
    const codes = store.listAllInviteCodes()
        .filter((c) => {
        if (!c.redeemedByUserId || !c.redeemedAt)
            return false;
        const day = dayKeyFromIso(c.redeemedAt);
        return !!day && day >= input.from && day <= input.to && day >= ADMIN_DATA_START;
    })
        .map((c) => {
        const redeemer = c.redeemedByUserId ? input.userById.get(c.redeemedByUserId) : undefined;
        const redeemDay = dayKeyFromIso(c.redeemedAt);
        let active = false;
        if (redeemer && !isSeed(redeemer) && redeemDay) {
            const after = addDays(redeemDay, 7);
            for (const [day, ids] of input.activity.byDay) {
                if (day >= after && ids.has(redeemer.id)) {
                    active = true;
                    break;
                }
            }
        }
        const owner = input.userById.get(c.ownerUserId);
        return {
            kind: "creator",
            label: "Creator",
            code: c.code,
            ownerName: owner?.firstName || "Member",
            downloads: null,
            signups: redeemer && !isSeed(redeemer) ? 1 : 0,
            activeAfter7d: active ? 1 : 0,
            conversionPct: null,
        };
    })
        .filter((c) => c.signups > 0)
        .map((c) => ({ ...c, conversionPct: pct(c.activeAfter7d, c.signups) }))
        .sort((a, b) => b.activeAfter7d - a.activeAfter7d || a.code.localeCompare(b.code));
    return {
        codes,
        byType: [
            { kind: "creator", label: "Creator", signups: codes.length },
            { kind: "group_chat", label: "Group Chat", signups: 0 },
            { kind: "community", label: "Community", signups: 0 },
        ],
        downloadsTracked: false,
        age: ageOrder.map((a) => ({ label: a.label, count: ageCounts.get(a.id) ?? 0 })),
        neighborhoods: [...hoodCounts.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8),
        signupCount: input.realUsers.length,
        waitlist: {
            available: false,
            reason: "Waitlist emails live in a Google Form and aren't stored on accounts, so this rate can't be calculated yet.",
            formUrl: WAITLIST_FORM,
        },
    };
}
function buildCommunityRows(weekStart, weekEnd, plans, posts, communityActivity, communityId, membersOf, includeSeed) {
    const week = new Set(daysBetween(weekStart, weekEnd));
    return store
        .listCommunities()
        .filter((c) => c.creationStatus === "approved" && (!communityId || c.id === communityId))
        .map((c) => {
        const actors = communityActivity.actors.get(c.id) ?? [];
        const active = new Set();
        for (const actor of actors) {
            const day = dayKeyFromIso(actor.at);
            if (!day || !week.has(day) || !actor.userId)
                continue;
            if (!includeSeed && store.findUserById(actor.userId)?.accountSource === "seed")
                continue;
            active.add(actor.userId);
        }
        return {
            id: c.id,
            name: c.name,
            initials: initials(c.name),
            isFounding: c.isFounding,
            hidden: Boolean(c.hiddenAt),
            members: membersOf(c.id),
            plans: plans.filter((p) => p.communityId === c.id).length,
            bulletinPosts: posts.filter((p) => p.communityId === c.id && !p.parentId).length,
            activeMembers: active.size,
            lastActivityAt: communityActivity.lastAt.get(c.id) ?? null,
        };
    })
        .sort((a, b) => {
        if (a.hidden !== b.hidden)
            return a.hidden ? 1 : -1;
        return b.activeMembers - a.activeMembers || b.plans - a.plans || a.name.localeCompare(b.name);
    });
}
export function buildCommunityDetail(communityId, requested) {
    const community = store.findCommunityById(communityId);
    if (!community)
        return null;
    const scope = resolveAdminDashboardView(requested, dayKey(new Date()));
    const posts = store.listAllCommunityPosts().filter((p) => p.communityId === communityId);
    const plans = store.listPlans().filter((p) => p.communityId === communityId && !p.cancelledAt);
    const members = store.listCommunityMembers(communityId);
    const convo = store.listAllConversations().find((c) => c.communityId === communityId);
    const messages = convo
        ? store.listAllMessages().filter((m) => m.conversationId === convo.id && m.kind !== "system")
        : [];
    const weeks = [];
    const startMonday = mondayOf(scope.from);
    const endMonday = mondayOf(scope.to);
    for (let start = startMonday; start <= endMonday; start = addDays(start, 7)) {
        const end = addDays(start, 6);
        const inWeek = (iso) => {
            const day = dayKeyFromIso(iso);
            return !!day && day >= start && day <= end && day >= ADMIN_DATA_START && day >= scope.from && day <= scope.to;
        };
        const active = new Set();
        for (const post of posts)
            if (inWeek(post.createdAt))
                active.add(post.authorId);
        for (const plan of plans)
            if (inWeek(plan.createdAt))
                active.add(plan.creatorId);
        for (const message of messages)
            if (inWeek(message.createdAt))
                active.add(message.senderId);
        weeks.push({
            weekStart: start,
            label: prettyDay(start),
            newMembers: members.filter((m) => inWeek(m.joinedAt)).length,
            plans: plans.filter((p) => inWeek(p.createdAt)).length,
            bulletinPosts: posts.filter((p) => !p.parentId && inWeek(p.createdAt)).length,
            activeMembers: active.size,
        });
    }
    return {
        id: community.id,
        name: community.name,
        initials: initials(community.name),
        isFounding: community.isFounding,
        hidden: Boolean(community.hiddenAt),
        members: community.memberCount,
        description: community.description,
        weeks,
    };
}
/** Spread people who only have a neighborhood so they don't stack on one pixel. */
function neighborhoodJitter(id) {
    let h = 0;
    for (const ch of id)
        h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    const angle = ((h % 360) * Math.PI) / 180;
    const miles = 0.12 + ((h >>> 8) % 100) / 100 * 0.28;
    return {
        dLat: (miles / 69) * Math.cos(angle),
        dLng: (miles / (69 * Math.cos((40 * Math.PI) / 180))) * Math.sin(angle),
    };
}
const PHILLY_BOUNDS = { minLat: 39.88, maxLat: 40.1, minLng: -75.28, maxLng: -74.95 };
const BASEMAP_WIDTH = 640;
const BASEMAP_HEIGHT = 416;
/** Google Static Maps uses Web Mercator. Overlay dots must use the same math. */
function mercatorPixel(lat, lng, zoom) {
    const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
    const scale = 256 * 2 ** zoom;
    return {
        x: scale * (0.5 + lng / 360),
        y: scale * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
    };
}
function basemapFrame(bounds) {
    const center = {
        lat: (bounds.minLat + bounds.maxLat) / 2,
        lng: (bounds.minLng + bounds.maxLng) / 2,
    };
    const corners = [
        [bounds.minLat, bounds.minLng],
        [bounds.minLat, bounds.maxLng],
        [bounds.maxLat, bounds.minLng],
        [bounds.maxLat, bounds.maxLng],
    ];
    let zoom = 11;
    for (let z = 16; z >= 1; z--) {
        const origin = mercatorPixel(center.lat, center.lng, z);
        const fits = corners.every(([lat, lng]) => {
            const p = mercatorPixel(lat, lng, z);
            const x = BASEMAP_WIDTH / 2 + (p.x - origin.x);
            const y = BASEMAP_HEIGHT / 2 + (p.y - origin.y);
            return x >= 16 && x <= BASEMAP_WIDTH - 16 && y >= 16 && y <= BASEMAP_HEIGHT - 16;
        });
        if (fits) {
            zoom = z;
            break;
        }
    }
    return { center, zoom, width: BASEMAP_WIDTH, height: BASEMAP_HEIGHT };
}
export function buildGodView(requested) {
    const scope = resolveAdminDashboardView(requested, dayKey(new Date()));
    const hoods = store.listNeighborhoods();
    const hoodById = new Map(hoods.map((h) => [h.id, h]));
    const people = [];
    for (const user of store.listUsers()) {
        if (!scope.includeSeed && user.accountSource === "seed")
            continue;
        const created = dayKeyFromIso(user.createdAt);
        if (!created || created < scope.from || created > scope.to)
            continue;
        if (scope.neighborhoodId && !userInNeighborhood(user, scope.neighborhoodId))
            continue;
        if (scope.communityId) {
            const member = store.listCommunityMembers(scope.communityId).some((row) => {
                if (row.userId !== user.id || row.status !== "active")
                    return false;
                const day = dayKeyFromIso(row.joinedAt);
                return !!day && day >= ADMIN_DATA_START && day <= scope.to;
            });
            if (!member)
                continue;
        }
        const hoodId = user.neighborhoodIds?.[0] ?? user.neighborhoodId;
        const hood = hoodId ? hoodById.get(hoodId) : undefined;
        const precise = typeof user.locationLat === "number" && typeof user.locationLng === "number";
        let lat = precise ? user.locationLat : null;
        let lng = precise ? user.locationLng : null;
        let placed = "precise";
        if (!precise) {
            if (!hood || typeof hood.lat !== "number" || typeof hood.lng !== "number")
                continue;
            const jitter = neighborhoodJitter(user.id);
            lat = hood.lat + jitter.dLat;
            lng = hood.lng + jitter.dLng;
            placed = "neighborhood";
        }
        if (lat === null || lng === null)
            continue;
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
        people.push({
            id: user.id,
            name: name || "Unnamed",
            lat,
            lng,
            placed,
            neighborhoodName: hood?.name ?? null,
            seed: user.accountSource === "seed",
        });
    }
    const today = scope.today;
    const plans = store
        .listPlans()
        .filter((plan) => {
        if (plan.cancelledAt)
            return false;
        if (!scope.includeSeed && store.findUserById(plan.creatorId)?.accountSource === "seed")
            return false;
        if (scope.communityId && plan.communityId !== scope.communityId)
            return false;
        if (scope.neighborhoodId && plan.neighborhoodId !== scope.neighborhoodId)
            return false;
        const created = dayKeyFromIso(plan.createdAt);
        const dated = plan.date?.slice(0, 10) ?? null;
        const createdOk = !!created && created >= scope.from && created <= scope.to;
        const datedOk = !!dated && dated >= scope.from && dated <= scope.to;
        return createdOk || datedOk;
    })
        .map((plan) => {
        const point = planPoint(plan);
        if (!point)
            return null;
        return {
            id: plan.id,
            title: plan.title,
            lat: point.lat,
            lng: point.lng,
            date: plan.date.slice(0, 10),
            upcoming: plan.date.slice(0, 10) >= today,
        };
    })
        .filter((plan) => plan !== null);
    const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    const bump = (iso) => {
        if (!iso)
            return;
        const day = dayKeyFromIso(iso);
        if (!day || day < scope.from || day > scope.to)
            return;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime()))
            return;
        matrix[d.getUTCDay()][d.getUTCHours()] += 1;
    };
    for (const user of store.listUsers()) {
        if (!scope.includeSeed && user.accountSource === "seed")
            continue;
        if (scope.neighborhoodId && !userInNeighborhood(user, scope.neighborhoodId))
            continue;
        bump(user.createdAt);
    }
    for (const plan of plans)
        bump(`${plan.date}T16:00:00.000Z`);
    const communityConvoIds = scope.communityId
        ? new Set(store.listAllConversations().filter((c) => c.communityId === scope.communityId).map((c) => c.id))
        : null;
    for (const message of store.listAllMessages()) {
        if (message.kind !== "user")
            continue;
        if (communityConvoIds && !communityConvoIds.has(message.conversationId))
            continue;
        if (!scope.includeSeed && store.findUserById(message.senderId)?.accountSource === "seed")
            continue;
        if (scope.neighborhoodId) {
            const sender = store.findUserById(message.senderId);
            if (!sender || !userInNeighborhood(sender, scope.neighborhoodId))
                continue;
        }
        bump(message.createdAt);
    }
    for (const part of store.listAllParticipations()) {
        if (!scope.includeSeed && store.findUserById(part.userId)?.accountSource === "seed")
            continue;
        const plan = store.findPlanById(part.planId);
        if (scope.communityId && plan?.communityId !== scope.communityId)
            continue;
        if (scope.neighborhoodId && plan?.neighborhoodId !== scope.neighborhoodId)
            continue;
        bump(part.updatedAt);
    }
    const hoodLats = hoods.map((h) => h.lat).filter((n) => typeof n === "number");
    const hoodLngs = hoods.map((h) => h.lng).filter((n) => typeof n === "number");
    const bounds = hoodLats.length > 0 && hoodLngs.length > 0
        ? {
            minLat: Math.min(...hoodLats) - 0.02,
            maxLat: Math.max(...hoodLats) + 0.02,
            minLng: Math.min(...hoodLngs) - 0.025,
            maxLng: Math.max(...hoodLngs) + 0.025,
        }
        : PHILLY_BOUNDS;
    const inside = (lat, lng) => lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
    const visiblePeople = people.filter((person) => inside(person.lat, person.lng));
    const visiblePlans = plans.filter((plan) => inside(plan.lat, plan.lng));
    return {
        people: visiblePeople,
        plans: visiblePlans,
        outside: {
            people: people.length - visiblePeople.length,
            plans: plans.length - visiblePlans.length,
        },
        neighborhoods: hoods
            .filter((h) => typeof h.lat === "number" && typeof h.lng === "number")
            .map((h) => ({ name: h.name, lat: h.lat, lng: h.lng })),
        bounds,
        basemap: basemapFrame(bounds),
        heatmap: {
            matrix,
            max: Math.max(1, ...matrix.flat()),
            label: `UTC · ${prettyRange(scope.from, scope.to)}. Activity before Oct 1 is left out.`,
        },
    };
}
