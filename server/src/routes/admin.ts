import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { verifySessionToken } from "../lib/jwt.js";
import { isAdminPhone } from "../lib/adminPhones.js";
import { isGcsConfigured, listDefaultImages, parseDataUrl, uploadCardImage } from "../lib/gcs.js";
import { store } from "../store.js";
import { listAllUsers, findUserById } from "../userRepo.js";
import { normalizeCommunityCategory } from "../types/shared.js";

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

// ---- Single user: full profile + activity (admin drill-down) ----
adminRouter.get("/users/:id", async (req, res) => {
  const id = String(req.params.id);
  const u = await findUserById(id);
  if (!u) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const hoodName = new Map(store.listNeighborhoods().map((n) => [n.id, n.name]));
  const hoodIds = u.neighborhoodIds?.length
    ? u.neighborhoodIds
    : u.neighborhoodId
      ? [u.neighborhoodId]
      : [];

  const allPlans = store.listPlans();
  const hosted = allPlans
    .filter((p) => p.creatorId === id)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((p) => ({
      id: p.id,
      title: p.title,
      date: p.date,
      cancelled: Boolean(p.cancelledAt),
      goingCount: store.listParticipationsForPlan(p.id).filter((q) => q.state === "going").length,
    }));

  const parts = store.listParticipationsForUser(id);
  const participations: { planId: string; title: string; date: string; state: string }[] = [];
  for (const pa of parts) {
    const plan = store.findPlanById(pa.planId);
    if (!plan || plan.creatorId === id) continue; // hosting shown separately
    participations.push({ planId: plan.id, title: plan.title, date: plan.date, state: pa.state });
  }
  participations.sort((a, b) => (a.date < b.date ? 1 : -1));

  const messagesCount = store
    .listAllMessages()
    .filter((m) => m.senderId === id && m.kind === "user").length;

  res.json({
    user: {
      id: u.id,
      firstName: u.firstName || "",
      lastName: u.lastName ?? null,
      phoneNumber: u.phoneNumber,
      neighborhoodIds: hoodIds,
      neighborhoodNames: hoodIds.map((h) => hoodName.get(h) ?? h),
      interests: u.interests ?? [],
      avatarSeed: u.avatarSeed,
      avatarStyle: u.avatarStyle,
      avatarPhotoDataUrl: u.avatarPhotoDataUrl ?? null,
      avatarParams: u.avatarParams ?? null,
      accountSource: u.accountSource ?? "verify",
      onboardingComplete: u.onboardingComplete,
      createdAt: u.createdAt,
      networkSize: u.networkIds?.length ?? 0,
      guidelinesAcknowledgedAt: u.guidelinesAcknowledgedAt ?? null,
      socialLinks: u.socialLinks ?? null,
    },
    activity: {
      hostedCount: hosted.length,
      rsvpCount: parts.length,
      goingCount: parts.filter((p) => p.state === "going").length,
      interestedCount: parts.filter((p) => p.state === "interested").length,
      messagesCount,
      hosted,
      participations,
    },
  });
});

// ---- Event-card image library ----
// Admins curate the cover images used on event cards without a code deploy.
// File uploads go to Google Cloud Storage (when GCS_BUCKET is set); we store
// the resulting public URL. External URLs are stored as-is. When GCS isn't
// configured (local dev), uploads fall back to inline data URLs.

const MAX_CARD_IMAGE_BYTES = 1_500_000; // ~1.5MB — fallback inline cap.

/** Last-resort stand-ins, used only when GCS isn't configured (local dev). The
 *  real standard library lives in the bucket's defaults folder (see GCS_DEFAULTS_PREFIX). */
const DEFAULT_CARD_IMAGES: { url: string; label: string }[] = [
  { url: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=60", label: "Celebration" },
  { url: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=60", label: "Dinner" },
  { url: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=60", label: "Party" },
  { url: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=800&q=60", label: "Gathering" },
];

adminRouter.get("/card-images", (_req, res) => {
  res.json({ images: store.listCardImages(), gcsConfigured: isGcsConfigured() });
});

// Add by external URL (stored as-is — already hosted elsewhere).
adminRouter.post("/card-images", (req, res) => {
  const body = (req.body ?? {}) as { url?: unknown; label?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : undefined;

  const isHttp = /^https?:\/\/\S+$/i.test(url);
  const isDataImage = /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(url);
  if (!isHttp && !isDataImage) {
    res.status(400).json({ error: "Provide an http(s) image URL or an uploaded image." });
    return;
  }
  if (isDataImage && url.length > MAX_CARD_IMAGE_BYTES) {
    res.status(413).json({ error: "Image is too large — keep uploads under ~1MB." });
    return;
  }

  const row = store.addCardImage({ url, label });
  res.status(201).json({ image: row });
});

// Upload a file: bytes arrive as a data URL, get pushed to GCS, and we store
// the public URL. Falls back to inline storage when GCS isn't configured.
adminRouter.post("/card-images/upload", async (req, res) => {
  const body = (req.body ?? {}) as { dataUrl?: unknown; label?: unknown };
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const label = typeof body.label === "string" ? body.label.trim() || undefined : undefined;

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    res.status(400).json({ error: "Expected a base64 image data URL (png/jpeg/gif/webp/avif)." });
    return;
  }

  if (isGcsConfigured()) {
    try {
      const publicUrl = await uploadCardImage(parsed.buffer, parsed.contentType);
      const row = store.addCardImage({ url: publicUrl, label });
      res.status(201).json({ image: row });
    } catch (err) {
      console.error("[admin] card image GCS upload failed", err);
      res.status(502).json({ error: "Upload to storage failed — check GCS config / permissions." });
    }
    return;
  }

  // No GCS — store inline, but enforce the snapshot-size cap.
  if (dataUrl.length > MAX_CARD_IMAGE_BYTES) {
    res.status(413).json({ error: "GCS isn't configured, so uploads are stored inline — keep this under ~1MB." });
    return;
  }
  const row = store.addCardImage({ url: dataUrl, label });
  res.status(201).json({ image: row });
});

// One-click: seed the standard placeholder library. When GCS is configured, the
// defaults come from the bucket's defaults folder (GCS_DEFAULTS_PREFIX) so admins
// can curate them without a deploy; otherwise we fall back to the built-in
// stand-ins. Idempotent — skips images already present by URL.
adminRouter.post("/card-images/seed-defaults", async (_req, res) => {
  let defaults = DEFAULT_CARD_IMAGES;
  if (isGcsConfigured()) {
    try {
      const fromBucket = await listDefaultImages();
      if (fromBucket.length > 0) defaults = fromBucket;
    } catch (err) {
      console.error("[admin] listing default card images from GCS failed", err);
      res.status(502).json({ error: "Could not read the defaults folder from storage — check GCS config / permissions." });
      return;
    }
  }

  const existing = new Set(store.listCardImages().map((c) => c.url));
  const added = [];
  for (const def of defaults) {
    if (existing.has(def.url)) continue;
    added.push(store.addCardImage(def));
  }
  res.json({ added: added.length, images: store.listCardImages() });
});

adminRouter.delete("/card-images/:id", (req, res) => {
  const ok = store.removeCardImage(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

// ---- Communities review ----

// GET /api/admin/communities?status=pending — review queue (default pending).
adminRouter.get("/communities", async (req, res) => {
  const status = String(req.query.status ?? "pending");
  const all = store.listCommunities();
  const filtered =
    status === "all" ? all : all.filter((c) => c.creationStatus === status);
  filtered.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const rows = await Promise.all(
    filtered.map(async (c) => {
      const organizer = await findUserById(c.organizerId);
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        category: normalizeCommunityCategory(String(c.category ?? "")),
        organizer: organizer
          ? { id: organizer.id, firstName: organizer.firstName, lastName: organizer.lastName ?? "" }
          : { id: c.organizerId, firstName: "Unknown", lastName: "" },
        memberCount: c.memberCount,
        isFounding: c.isFounding,
        submittedAt: c.submittedAt,
        creationStatus: c.creationStatus,
      };
    }),
  );
  res.json({ communities: rows });
});

// POST /api/admin/communities/:id/approve — goes live immediately.
adminRouter.post("/communities/:id/approve", (req, res) => {
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  const updated = store.updateCommunity(community.id, {
    creationStatus: "approved",
    rejectionNote: null,
    reviewedAt: new Date().toISOString(),
    reviewedBy: req.userId ?? "admin",
  });
  store.log("community_approved", { communityId: community.id });
  res.json({ ok: true, community: updated });
});

// POST /api/admin/communities/:id/reject { note? } — takes offline; organizer edit republishes.
adminRouter.post("/communities/:id/reject", (req, res) => {
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  const note =
    typeof req.body?.note === "string" && req.body.note.trim()
      ? req.body.note.trim().slice(0, 500)
      : null;
  const updated = store.updateCommunity(community.id, {
    creationStatus: "rejected",
    rejectionNote: note,
    reviewedAt: new Date().toISOString(),
    reviewedBy: req.userId ?? "admin",
  });
  store.log("community_rejected", { communityId: community.id });
  res.json({ ok: true, community: updated });
});

// POST /api/admin/communities/founding — create-and-approve a Founding Community,
// assigning the organizer by user lookup (phone or id).
adminRouter.post("/communities/founding", async (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 80);
  const description = String(req.body?.description ?? "").trim().slice(0, 2000);
  const category = normalizeCommunityCategory(String(req.body?.category ?? ""));
  const organizerLookup = String(req.body?.organizer ?? "").trim();
  if (!name || !description || !organizerLookup) {
    res.status(400).json({ error: "name, description, and organizer are required" });
    return;
  }
  // Resolve organizer by user id first, then by phone.
  let organizer = await findUserById(organizerLookup);
  if (!organizer) {
    const users = await listAllUsers();
    organizer = users.find(
      (u) => u.phoneNumber === organizerLookup || u.phoneNumber === `+${organizerLookup.replace(/\D/g, "")}`,
    );
  }
  if (!organizer) {
    res.status(404).json({ error: "Organizer user not found (pass a user id or E.164 phone)" });
    return;
  }
  const community = store.createCommunity({
    name,
    description,
    category,
    organizerId: organizer.id,
    isFounding: true,
    creationStatus: "approved",
    reviewedBy: req.userId ?? "admin",
    coverImage: typeof req.body?.coverImage === "string" ? req.body.coverImage.slice(0, 2048) : null,
  });
  store.log("community_founding_created", { communityId: community.id, organizerId: organizer.id });
  res.status(201).json({ ok: true, community });
});

// ---- Interest Forums review ----

// GET /api/admin/forums/pending-posts — sponsored posts awaiting approval.
adminRouter.get("/forums/pending-posts", (_req, res) => {
  const pending = store.listPendingForumPosts();
  const rows = pending.map((p) => ({
    id: p.id,
    interestTag: p.interestTag,
    content: p.content,
    imageUrl: p.imageUrl ?? null,
    sponsorName: p.sponsorName ?? null,
    createdAt: p.createdAt,
  }));
  res.json({ posts: rows });
});

// POST /api/admin/forums/posts/:id/approve
adminRouter.post("/forums/posts/:id/approve", (req, res) => {
  const post = store.setForumPostApprovalStatus(String(req.params.id), "approved");
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  store.log("forum_post_approved", { postId: post.id });
  res.json({ ok: true, post });
});

// POST /api/admin/forums/posts/:id/reject
adminRouter.post("/forums/posts/:id/reject", (req, res) => {
  const post = store.setForumPostApprovalStatus(String(req.params.id), "rejected");
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  store.log("forum_post_rejected", { postId: post.id });
  res.json({ ok: true, post });
});

export { adminRouter };
