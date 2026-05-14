import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { verifySessionToken } from "../lib/jwt.js";
import { isAdminPhone } from "../lib/adminPhones.js";
import { store } from "../store.js";
import { listAllUsers, findUserById } from "../userRepo.js";

const adminRouter = Router();

function adminApiToken(): string | undefined {
  const t = process.env.ADMIN_API_TOKEN?.trim();
  return t || undefined;
}

function tokenFromRequest(req: Request): string | undefined {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  const header = (req.headers["x-admin-token"] as string | undefined)?.trim();
  return bearer || header || undefined;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const expected = adminApiToken();
  const got = tokenFromRequest(req);
  if (expected && got === expected) {
    next();
    return;
  }

  const sessionCookie = req.cookies?.session as string | undefined;
  if (!sessionCookie) {
    res.status(401).json({ error: "Sign in with an admin phone (Twilio Verify), or provide ADMIN_API_TOKEN." });
    return;
  }
  try {
    const payload = verifySessionToken(sessionCookie);
    const user = await findUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: "Session invalid" });
      return;
    }
    if (!isAdminPhone(user.phoneNumber)) {
      res.status(403).json({ error: "This account is not authorized for admin." });
      return;
    }
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({ error: "Session invalid" });
  }
}

adminRouter.use(requireAdmin);

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDay(d);
}

function emptyHeatmap(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

function bumpHeatmap(matrix: number[][], iso: string): void {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return;
  const day = d.getUTCDay();
  const hr = d.getUTCHours();
  matrix[day][hr] += 1;
}

function seriesLastNDays(n: number): Map<string, number> {
  const today = isoDay(new Date());
  const map = new Map<string, number>();
  for (let i = n - 1; i >= 0; i--) {
    map.set(addDays(today, -i), 0);
  }
  return map;
}

adminRouter.get("/summary", async (_req, res) => {
  const users = await listAllUsers();
  const plans = store.listPlans();
  const parts = store.listAllParticipations();
  const messages = store.listAllMessages();
  const convs = store.listAllConversations();
  const feedback = store.listAllFeedback();
  const suggestions = store.listAllPlanSuggestions();
  const declines = store.listAllDeclines();
  const logs = store.listLogsRecent(100);
  const neighborhoods = store.listNeighborhoods();
  const hoodName = new Map(neighborhoods.map((n) => [n.id, n.name]));

  const today = isoDay(new Date());
  const d7 = addDays(today, -6);
  const d14 = addDays(today, -13);
  const d30 = addDays(today, -29);

  const signupsByDay = seriesLastNDays(14);
  const plansByDay = seriesLastNDays(14);

  const heatmap = emptyHeatmap();
  for (const u of users) {
    bumpHeatmap(heatmap, u.createdAt);
    const day = u.createdAt.slice(0, 10);
    if (signupsByDay.has(day)) signupsByDay.set(day, (signupsByDay.get(day) ?? 0) + 1);
  }
  for (const p of plans) {
    bumpHeatmap(heatmap, p.createdAt);
    const day = p.createdAt.slice(0, 10);
    if (plansByDay.has(day)) plansByDay.set(day, (plansByDay.get(day) ?? 0) + 1);
  }
  for (const m of messages) bumpHeatmap(heatmap, m.createdAt);
  for (const pa of parts) bumpHeatmap(heatmap, pa.updatedAt);

  const maxHeat = Math.max(1, ...heatmap.flat());

  const usersInRange = (since: string) => users.filter((u) => u.createdAt >= since).length;
  const plansInRange = (since: string) => plans.filter((p) => p.createdAt >= since).length;
  const msgsInRange = (since: string) => messages.filter((m) => m.createdAt >= since).length;

  const onboarded = users.filter((u) => u.onboardingComplete).length;
  const seedUsers = users.filter((u) => u.accountSource === "seed").length;

  const going = parts.filter((p) => p.state === "going").length;
  const interested = parts.filter((p) => p.state === "interested").length;

  const uniqueCreators = new Set(plans.map((p) => p.creatorId));
  const dms = convs.filter((c) => c.type === "dm").length;
  const groups = convs.filter((c) => c.type === "group").length;

  const activeUserIds = new Set<string>();
  const since7 = addDays(today, -6) + "T00:00:00.000Z";
  for (const m of messages) {
    if (m.createdAt >= since7 && m.kind === "user") activeUserIds.add(m.senderId);
  }
  for (const pa of parts) {
    if (pa.updatedAt >= since7) activeUserIds.add(pa.userId);
  }
  for (const p of plans) {
    if (p.createdAt >= since7) activeUserIds.add(p.creatorId);
  }

  const userById = new Map(users.map((u) => [u.id, u]));
  const signedUpWithActivity = users.filter((u) => {
    const acts = store.listParticipationsForUser(u.id);
    return acts.some((a) => a.state === "going" || a.state === "interested");
  }).length;

  const hoodCounts = new Map<string, number>();
  for (const u of users) {
    const hid = u.neighborhoodIds?.[0] ?? u.neighborhoodId;
    if (hid) hoodCounts.set(hid, (hoodCounts.get(hid) ?? 0) + 1);
  }
  const neighborhoodsTop = [...hoodCounts.entries()]
    .map(([id, count]) => ({ id, name: hoodName.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const interestMix = new Map<string, number>();
  for (const u of users) {
    for (const t of u.interests ?? []) {
      interestMix.set(t, (interestMix.get(t) ?? 0) + 1);
    }
  }
  const topInterests = [...interestMix.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const thumbUp = feedback.filter((f) => f.thumb === "up").length;
  const thumbDown = feedback.filter((f) => f.thumb === "down").length;

  res.json({
    generatedAt: new Date().toISOString(),
    kpis: {
      totalUsers: users.length,
      onboardedUsers: onboarded,
      onboardingRatePct: users.length ? Math.round((1000 * onboarded) / users.length) / 10 : 0,
      seedUsers,
      totalPlans: plans.length,
      uniqueHosts: uniqueCreators.size,
      avgPlansPerHost:
        uniqueCreators.size > 0 ? Math.round((100 * plans.length) / uniqueCreators.size) / 100 : 0,
      goingRsvps: going,
      interestedRsvps: interested,
      totalMessages: messages.length,
      userMessages: messages.filter((m) => m.kind === "user").length,
      groupChats: groups,
      dms: dms,
      planSuggestions: suggestions.length,
      feedbackUp: thumbUp,
      feedbackDown: thumbDown,
      declines7d: declines.filter((d) => d.createdAt >= since7).length,
      wauProxy: activeUserIds.size,
      usersWithRsvp: signedUpWithActivity,
    },
    ranges: {
      signups7d: usersInRange(d7),
      signups14d: usersInRange(d14),
      signups30d: usersInRange(d30),
      plans7d: plansInRange(d7),
      messages7d: msgsInRange(since7),
    },
    series14d: {
      signups: [...signupsByDay.entries()].map(([date, count]) => ({ date, count })),
      plans: [...plansByDay.entries()].map(([date, count]) => ({ date, count })),
    },
    heatmap: { matrix: heatmap, max: maxHeat, label: "UTC — signups, plans, messages, RSVPs" },
    neighborhoodsTop,
    topInterests,
    recentLogs: logs.map((l) => ({ id: l.id, event: l.event, createdAt: l.createdAt })),
    recentUsers: users.slice(0, 30).map((u) => ({
      id: u.id,
      firstName: u.firstName || "—",
      phoneNumber: u.phoneNumber,
      neighborhoodId: u.neighborhoodIds?.[0] ?? u.neighborhoodId,
      neighborhoodName:
        hoodName.get(u.neighborhoodIds?.[0] ?? u.neighborhoodId ?? "") ?? null,
      onboardingComplete: u.onboardingComplete,
      accountSource: u.accountSource ?? "verify",
      interestsCount: (u.interests ?? []).length,
      networkSize: u.networkIds?.length ?? 0,
      createdAt: u.createdAt,
    })),
    userTable: users.map((u) => ({
      id: u.id,
      firstName: u.firstName || "",
      phoneNumber: u.phoneNumber,
      neighborhoodId: u.neighborhoodIds?.[0] ?? u.neighborhoodId,
      neighborhoodName:
        hoodName.get(u.neighborhoodIds?.[0] ?? u.neighborhoodId ?? "") ?? null,
      onboardingComplete: u.onboardingComplete,
      accountSource: u.accountSource ?? "verify",
      interests: u.interests ?? [],
      createdAt: u.createdAt,
      plansHosted: plans.filter((p) => p.creatorId === u.id).length,
      rsvps: store.listParticipationsForUser(u.id).length,
    })),
  });
});

export { adminRouter };
