import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store, type PlanRecord, type UserRecord } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import { rankPlansForUser } from "../lib/recommend.js";
import {
  ALL_INTERESTS,
  type InterestTag,
  type JoinType,
  type ParticipationState,
  type PlanDTO,
  type PlanKind,
  type PlanSuggestionDTO,
  type PlanVisibility,
  type PublicUser,
} from "../types/shared.js";
import { onPlanCreatedVenueNudge, notifyInterestedPlanLocked } from "../lib/nudges.js";
import { emit } from "../lib/notify.js";
import { plansOverlap } from "../lib/planTime.js";

export const plansRouter = Router();

function userHoods(me: UserRecord): string[] {
  if (me.neighborhoodIds?.length) return me.neighborhoodIds;
  if (me.neighborhoodId) return [me.neighborhoodId];
  return [];
}

function combinedNeighborhoodScope(me: UserRecord): string[] | null {
  const hoods = userHoods(me);
  if (hoods.length === 0) return null;
  const set = new Set<string>();
  for (const id of hoods) {
    store.neighborhoodScope(id).forEach((x) => set.add(x));
  }
  return [...set];
}

function planVisibleToViewer(plan: PlanRecord, me: UserRecord): boolean {
  const v: PlanVisibility = plan.visibility ?? "everyone";
  if (v === "network") {
    // Visible to the creator, anyone in the creator's network, or anyone
    // already RSVP'd (going or interested) — flipping visibility shouldn't
    // hide a plan from people who already engaged with it.
    if (plan.creatorId === me.id) return true;
    const creator = store.findUserById(plan.creatorId);
    if (creator?.networkIds?.includes(me.id)) return true;
    const myPart = store.findParticipation(plan.id, me.id);
    if (myPart?.state === "going" || myPart?.state === "interested") return true;
    return false;
  }
  if (v === "community") {
    const tag = plan.visibilityCommunityTag;
    if (!tag) return true;
    return me.interests.includes(tag);
  }
  return true;
}

export function userToPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName || "Friend",
    neighborhoodId: user.neighborhoodId,
    avatarSeed: user.avatarSeed,
    avatarStyle: user.avatarStyle,
    avatarPhotoDataUrl: user.avatarPhotoDataUrl,
    avatarParams: user.avatarParams,
  };
}

export async function planSummary(plan: PlanRecord, viewerId: string | null): Promise<PlanDTO> {
  const participations = store.listParticipationsForPlan(plan.id);
  const going = participations.filter((p) => p.state === "going");
  const interested = participations.filter((p) => p.state === "interested");
  const ids = [
    plan.creatorId,
    ...going.map((p) => p.userId),
    ...interested.map((p) => p.userId),
  ];
  const users = await findUsersByIds(ids);
  const mine = viewerId ? participations.find((p) => p.userId === viewerId) : undefined;

  function pu(uid: string): PublicUser {
    const u = users.get(uid);
    return u
      ? userToPublic(u)
      : {
          id: uid,
          firstName: "Former member",
          neighborhoodId: null,
          avatarSeed: uid,
          avatarStyle: "avataaars",
        };
  }

  const creator = users.get(plan.creatorId);
  const coHostIds = (plan.coHostIds ?? []).filter((id) => id !== plan.creatorId);
  const coHostUsers = coHostIds.length ? await findUsersByIds(coHostIds) : new Map();
  const coHosts: PublicUser[] = coHostIds
    .map((id) => coHostUsers.get(id))
    .filter((u): u is UserRecord => !!u)
    .map((u) => userToPublic(u));
  const planKind = plan.planKind ?? "standard";
  const visibility = plan.visibility ?? "everyone";
  const suggestionRows = store.listPlanSuggestions(plan.id);
  const sugUserIds = suggestionRows.map((s) => s.userId);
  const sugUsers = await findUsersByIds(sugUserIds);
  const suggestions: PlanSuggestionDTO[] = suggestionRows.map((s) => {
    const u = sugUsers.get(s.userId);
    return {
      id: s.id,
      author: u ? userToPublic(u) : pu(s.userId),
      body: s.body,
      createdAt: s.createdAt,
    };
  });
  return {
    id: plan.id,
    title: plan.title,
    creator: creator ? userToPublic(creator) : pu(plan.creatorId),
    coHosts,
    neighborhoodId: plan.neighborhoodId,
    location: plan.location,
    date: plan.date,
    time: plan.time,
    isFlexibleTime: plan.isFlexibleTime,
    isFlexibleLocation: plan.isFlexibleLocation ?? false,
    endTime: plan.endTime,
    tags: plan.tags,
    description: plan.description,
    hostEmoji: plan.hostEmoji,
    planKind,
    visibility,
    visibilityCommunityTag: plan.visibilityCommunityTag ?? null,
    communityId: plan.communityId ?? null,
    capacity: plan.capacity ?? null,
    joinType: plan.joinType ?? "open",
    isRecurring: plan.isRecurring ?? false,
    seriesId: plan.seriesId ?? null,
    lockedAt: plan.lockedAt ?? null,
    cancelledAt: plan.cancelledAt ?? null,
    upForGrabsAt: plan.upForGrabsAt ?? null,
    flyerDataUrl: plan.flyerDataUrl,
    flyerLinkUrl: plan.flyerLinkUrl,
    flyerLinkPreview: plan.flyerLinkPreview,
    pendingTimeProposal: plan.pendingTimeProposal ?? null,
    suggestions,
    participants: {
      going: going.map((p) => pu(p.userId)),
      interested: interested.map((p) => pu(p.userId)),
    },
    myState: mine?.state ?? null,
  };
}

// Public preview for the pre-signup tease (PRD §3.1).
plansRouter.get("/preview", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = store
    .listPlans()
    .filter((p) => new Date(p.date).getTime() >= today.getTime())
    .slice(0, 6);
  const summaries = await Promise.all(upcoming.map((p) => planSummary(p, null)));
  res.json(summaries);
});

plansRouter.get("/", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const me = await findUserById(userId);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const scope = combinedNeighborhoodScope(me);
  const inHood = scope ? store.listPlansByNeighborhoods(scope) : store.listPlans();
  // Always include the user's own plans and ones they've RSVP'd to, even if
  // they sit outside their neighborhood scope — otherwise a plan posted to a
  // different hood (or shared "Your Network" only) disappears from its own
  // author's feed.
  const ownPlans = store.listPlansByCreator(me.id);
  const rsvpPlanIds = new Set(
    store.listParticipationsForUser(me.id).map((p) => p.planId),
  );
  const rsvpPlans = store
    .listPlans()
    .filter((p) => rsvpPlanIds.has(p.id));
  const merged = new Map<string, typeof inHood[number]>();
  for (const p of [...inHood, ...ownPlans, ...rsvpPlans]) merged.set(p.id, p);
  const candidates = [...merged.values()].filter((p) => planVisibleToViewer(p, me));
  const ranked = rankPlansForUser(me, candidates);
  const summaries = await Promise.all(ranked.map((plan) => planSummary(plan, userId)));
  res.json(summaries);
});

plansRouter.post("/", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const me = await findUserById(userId);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const title = String(req.body?.title ?? "").trim();
  const location = req.body?.location ?? {};
  const locationName = String(location.name ?? "").trim();
  const locationAddress = String(location.address ?? "").trim();
  const lat = typeof location.lat === "number" ? location.lat : undefined;
  const lng = typeof location.lng === "number" ? location.lng : undefined;
  // Google Places ID — optional, persisted on the plan so we can later
  // aggregate plans by venue (the "Spots" grid + venue history nudges) without
  // having to fuzzy-match on name strings.
  const placeId =
    typeof location.placeId === "string" && location.placeId.trim()
      ? location.placeId.trim().slice(0, 256)
      : undefined;
  const dateInput = String(req.body?.date ?? "").trim();
  const time = String(req.body?.time ?? "").trim();
  const isFlexibleTime = Boolean(req.body?.isFlexibleTime);
  const isFlexibleLocation = Boolean(req.body?.isFlexibleLocation);
  const description = req.body?.description ? String(req.body.description).trim() : undefined;
  const hostEmoji = String(req.body?.hostEmoji ?? "").trim() || "✨";
  const neighborhoodId = String(req.body?.neighborhoodId ?? userHoods(me)[0] ?? "").trim();
  const planKind = (req.body?.planKind === "looking_for" ? "looking_for" : "standard") as PlanKind;
  // "Do it again": when set, carry the previous event's crew + group chat into
  // this new plan.
  const fromPlanId = req.body?.fromPlanId ? String(req.body.fromPlanId).trim() : "";
  const rawVis = String(req.body?.visibility ?? "everyone");
  const visibility = (["everyone", "community", "network"].includes(rawVis) ? rawVis : "everyone") as PlanVisibility;
  const isRecurring = Boolean(req.body?.isRecurring);

  // No hard cap — the algorithm weights ranking by selection frequency (see
  // Feed v2 brief). De-dupe so collapsing emoji vibes (Martini+Burger →
  // food_drinks) doesn't leave duplicate tags.
  const tagsInput = Array.isArray(req.body?.tags) ? (req.body.tags as unknown[]) : [];
  const tags = Array.from(
    new Set(
      tagsInput
        .map((t) => String(t))
        .filter((t): t is InterestTag => ALL_INTERESTS.includes(t as InterestTag)),
    ),
  );

  let visibilityCommunityTag: InterestTag | null = null;
  if (visibility === "community") {
    const tagPick = req.body?.visibilityCommunityTag
      ? String(req.body.visibilityCommunityTag)
      : tags[0];
    if (!tagPick || !ALL_INTERESTS.includes(tagPick as InterestTag)) {
      res.status(400).json({ error: "Pick a vibe tag for community visibility" });
      return;
    }
    visibilityCommunityTag = tagPick as InterestTag;
  }

  if (!title || !dateInput) {
    res.status(400).json({ error: "Title and date are required" });
    return;
  }
  // Neighborhood is required unless the host explicitly toggled flexible. The
  // form no longer renders a free-text "Where" field — the neighborhood is the
  // location signal — so we don't enforce locationName here.
  if (!neighborhoodId && !isFlexibleLocation) {
    res.status(400).json({ error: "Pick a neighborhood or turn on flexible." });
    return;
  }
  if (neighborhoodId && !store.findNeighborhoodById(neighborhoodId)) {
    res.status(400).json({ error: "Unknown neighborhood" });
    return;
  }
  const resolvedLocationName = locationName || "Flexible location";
  const resolvedAddress = locationAddress || resolvedLocationName;

  // Accept communityId from the client now so the field round-trips, but real
  // community records don't exist yet — never validate against anything, just
  // sanitize to string|null. Coming Soon. The whole feature is gated on a
  // future Communities model; the rest of the server ignores this field.
  const rawCommunityId = req.body?.communityId;
  const communityId =
    typeof rawCommunityId === "string" && rawCommunityId.trim() ? rawCommunityId.trim() : null;

  const rawCapacity = req.body?.capacity;
  let capacity: number | null = null;
  if (typeof rawCapacity === "number" && Number.isFinite(rawCapacity) && rawCapacity > 0) {
    capacity = Math.floor(rawCapacity);
  }
  const rawJoinType = String(req.body?.joinType ?? "open");
  const joinType: JoinType = rawJoinType === "approve" ? "approve" : "open";

  // Co-hosts — "make a plan with X" co-creates with the picked person. Validate
  // they're real users, never include the creator, cap at a sane number.
  const rawCoHosts = Array.isArray(req.body?.coHostIds) ? (req.body.coHostIds as unknown[]) : [];
  const coHostIds = Array.from(
    new Set(rawCoHosts.map(String).filter((id) => id && id !== userId)),
  )
    .filter((id) => Boolean(store.findUserById(id)))
    .slice(0, 5);

  // Optional flyer upload — guard size so a runaway base64 string doesn't blow
  // up the JSON store. ~1.5MB data URL is plenty for a flyer screenshot.
  const rawFlyer = typeof req.body?.flyerDataUrl === "string" ? req.body.flyerDataUrl : "";
  const flyerDataUrl =
    rawFlyer.startsWith("data:image/") && rawFlyer.length < 1_600_000 ? rawFlyer : undefined;

  // Optional shareable link. We trust the client-fetched OG preview rather than
  // re-fetching at create time — the preview endpoint already validated and
  // sanitized the URL; refetching here would just double the latency.
  let flyerLinkUrl: string | undefined;
  let flyerLinkPreview: PlanRecord["flyerLinkPreview"];
  const rawLink = typeof req.body?.flyerLinkUrl === "string" ? req.body.flyerLinkUrl.trim() : "";
  if (rawLink) {
    try {
      const u = new URL(rawLink);
      if (u.protocol === "http:" || u.protocol === "https:") {
        flyerLinkUrl = u.toString().slice(0, 2048);
      }
    } catch {
      /* invalid URL — silently drop */
    }
  }
  if (flyerLinkUrl && req.body?.flyerLinkPreview && typeof req.body.flyerLinkPreview === "object") {
    const p = req.body.flyerLinkPreview as Record<string, unknown>;
    const trim = (v: unknown, max: number): string | undefined =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
    flyerLinkPreview = {
      title: trim(p.title, 200),
      description: trim(p.description, 400),
      image: trim(p.image, 2048),
      siteName: trim(p.siteName, 100),
    };
  }

  const plan = store.createPlan({
    creatorId: userId,
    coHostIds: coHostIds.length ? coHostIds : undefined,
    title,
    neighborhoodId,
    location: { name: resolvedLocationName, address: resolvedAddress, lat, lng, placeId },
    date: dateInput,
    time: isFlexibleTime ? "" : time,
    isFlexibleTime: isFlexibleTime || !time,
    isFlexibleLocation,
    tags,
    description,
    hostEmoji,
    planKind,
    visibility,
    visibilityCommunityTag,
    communityId,
    capacity,
    joinType,
    isRecurring,
    lockedAt: null,
    flyerDataUrl,
    flyerLinkUrl,
    flyerLinkPreview,
  });

  store.upsertParticipation(plan.id, userId, "going");
  // Co-hosts are committed + dropped into the group chat, and pinged that
  // they're hosting it together.
  for (const coId of coHostIds) {
    store.upsertParticipation(plan.id, coId, "going");
    await emit({
      userId: coId,
      kind: "planInvite",
      body: `${me.firstName || "Someone"} made you a co-host of "${title}"`,
      planId: plan.id,
      dedupKey: `coHost:${plan.id}:${coId}`,
    });
  }
  const conv = store.ensureGroupConversation(plan.id, [userId, ...coHostIds]);

  // "Do it again": pull the previous event's attendees + group chat forward so
  // the crew and their conversation carry into the new plan.
  if (fromPlanId) {
    const prevPlan = store.findPlanById(fromPlanId);
    // Only the previous host or an attendee may re-plan from it.
    const prevPart = store.findParticipation(fromPlanId, userId);
    const mayReplan = prevPlan && (prevPlan.creatorId === userId || Boolean(prevPart));
    if (prevPlan && mayReplan) {
      const prevAttendees = store
        .listParticipationsForPlan(fromPlanId)
        .filter((p) => p.state === "going" && p.userId !== userId)
        .map((p) => p.userId);

      // Carry the prior crew into the new conversation so the group persists.
      if (prevAttendees.length > 0) {
        store.ensureGroupConversation(plan.id, [userId, ...coHostIds, ...prevAttendees]);
      }
      // Persist the previous group chat history into the new thread.
      const prevConv = store.findGroupConversationByPlan(fromPlanId);
      if (prevConv) store.cloneConversationMessages(prevConv.id, conv.id);

      // Announce the re-plan in the carried-over thread + ping everyone who came.
      const whenLabel = isFlexibleTime || !time ? dateInput : `${dateInput} at ${time}`;
      store.createSystemMessage(
        conv.id,
        `🔁 ${me.firstName || "The host"} planned "${title}" again — ${whenLabel}. Same crew, new date.`,
      );
      for (const attId of prevAttendees) {
        await emit({
          userId: attId,
          kind: "planInvite",
          body: `${me.firstName || "Someone"} is doing "${title}" again — you're in the group`,
          planId: plan.id,
          conversationId: conv.id,
          dedupKey: `replan:${plan.id}:${attId}`,
        });
      }
      store.log("plan_replanned", { planId: plan.id, fromPlanId, carried: prevAttendees.length });
    }
  }

  store.log("plan_created", { planId: plan.id, creatorId: userId, coHosts: coHostIds.length });
  void onPlanCreatedVenueNudge(plan).catch((err) => console.error("[nudge] venue", err));

  res.status(201).json(await planSummary(plan, userId));
});

// Host-only patch for instant fields. Date/time are deliberately excluded —
// those go through the `propose-time` / `apply-time` flow so participants get a
// chance to see a change before it lands.
plansRouter.patch("/:id", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (plan.creatorId !== userId) {
    res.status(403).json({ error: "Only the host can edit this plan" });
    return;
  }

  const patch: Partial<Omit<PlanRecord, "id" | "createdAt">> = {};

  if (req.body?.title !== undefined) {
    const t = String(req.body.title).trim();
    if (!t) {
      res.status(400).json({ error: "Title can't be empty" });
      return;
    }
    patch.title = t;
  }
  if (req.body?.description !== undefined) {
    const d = String(req.body.description ?? "").trim();
    patch.description = d || undefined;
  }
  if (req.body?.hostEmoji !== undefined) {
    const e = String(req.body.hostEmoji).trim();
    if (e) patch.hostEmoji = e;
  }
  if (Array.isArray(req.body?.tags)) {
    const tags = Array.from(
      new Set(
        (req.body.tags as unknown[])
          .map((t) => String(t))
          .filter((t): t is InterestTag => ALL_INTERESTS.includes(t as InterestTag)),
      ),
    );
    patch.tags = tags;
  }
  if (req.body?.neighborhoodId !== undefined) {
    const n = String(req.body.neighborhoodId).trim();
    if (n && !store.findNeighborhoodById(n)) {
      res.status(400).json({ error: "Unknown neighborhood" });
      return;
    }
    if (n) patch.neighborhoodId = n;
  }
  if (req.body?.location && typeof req.body.location === "object") {
    const loc = req.body.location as Record<string, unknown>;
    const name = typeof loc.name === "string" ? loc.name.trim() : "";
    const address = typeof loc.address === "string" ? loc.address.trim() : "";
    const lat = typeof loc.lat === "number" ? loc.lat : undefined;
    const lng = typeof loc.lng === "number" ? loc.lng : undefined;
    if (name) {
      patch.location = { name, address: address || name, lat, lng };
    }
  }
  if (req.body?.isFlexibleLocation !== undefined) {
    patch.isFlexibleLocation = Boolean(req.body.isFlexibleLocation);
  }
  if (req.body?.visibility !== undefined) {
    const raw = String(req.body.visibility);
    if (["everyone", "community", "network"].includes(raw)) {
      patch.visibility = raw as PlanVisibility;
    }
  }
  if (req.body?.visibilityCommunityTag !== undefined) {
    const raw = req.body.visibilityCommunityTag;
    if (raw === null) patch.visibilityCommunityTag = null;
    else if (typeof raw === "string" && ALL_INTERESTS.includes(raw as InterestTag)) {
      patch.visibilityCommunityTag = raw as InterestTag;
    }
  }
  if (req.body?.capacity !== undefined) {
    const raw = req.body.capacity;
    if (raw === null) patch.capacity = null;
    else if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      patch.capacity = Math.floor(raw);
    }
  }
  if (req.body?.joinType !== undefined) {
    const raw = String(req.body.joinType);
    patch.joinType = raw === "approve" ? "approve" : "open";
  }
  if (req.body?.flyerDataUrl !== undefined) {
    const raw = req.body.flyerDataUrl;
    if (raw === null) patch.flyerDataUrl = undefined;
    else if (typeof raw === "string" && raw.startsWith("data:image/") && raw.length < 1_600_000) {
      patch.flyerDataUrl = raw;
    }
  }
  if (req.body?.flyerLinkUrl !== undefined) {
    const raw = req.body.flyerLinkUrl;
    if (raw === null || raw === "") {
      patch.flyerLinkUrl = undefined;
      patch.flyerLinkPreview = undefined;
    } else if (typeof raw === "string") {
      try {
        const u = new URL(raw.trim());
        if (u.protocol === "http:" || u.protocol === "https:") {
          patch.flyerLinkUrl = u.toString().slice(0, 2048);
        }
      } catch {
        /* invalid — drop */
      }
    }
  }
  if (req.body?.flyerLinkPreview !== undefined) {
    const raw = req.body.flyerLinkPreview;
    if (raw === null) {
      patch.flyerLinkPreview = undefined;
    } else if (typeof raw === "object") {
      const p = raw as Record<string, unknown>;
      const trim = (v: unknown, max: number): string | undefined =>
        typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
      patch.flyerLinkPreview = {
        title: trim(p.title, 200),
        description: trim(p.description, 400),
        image: trim(p.image, 2048),
        siteName: trim(p.siteName, 100),
      };
    }
  }

  store.updatePlan(planId, patch);
  const updated = store.findPlanById(planId)!;
  res.json(await planSummary(updated, userId));
});

// Host proposes a new date/time. The proposal is stored on the plan but the
// real date/time don't move until the host applies — keeps participants from
// finding out about a change only when they show up.
plansRouter.post("/:id/propose-time", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (plan.creatorId !== userId) {
    res.status(403).json({ error: "Only the host can propose a time change" });
    return;
  }
  const date = String(req.body?.date ?? "").trim();
  const time = String(req.body?.time ?? "").trim();
  const isFlexibleTime = Boolean(req.body?.isFlexibleTime);
  if (!date) {
    res.status(400).json({ error: "Date required" });
    return;
  }
  const proposedAt = new Date().toISOString();
  store.updatePlan(planId, {
    pendingTimeProposal: { date, time, isFlexibleTime, proposedAt },
  });
  // Notify everyone going or interested except the host.
  const parts = store.listParticipationsForPlan(planId);
  for (const p of parts) {
    if (p.userId === userId) continue;
    void emit({
      userId: p.userId,
      kind: "planTimeProposed",
      planId,
      body: `Host proposed a new time for "${plan.title}"`,
      dedupKey: `planTimeProposed:${planId}:${proposedAt}`,
    });
  }
  store.log("plan_time_proposed", { planId, date, time });
  const updated = store.findPlanById(planId)!;
  res.json(await planSummary(updated, userId));
});

// Host applies the pending proposal — real date/time move, proposal clears,
// participants get a "this changed" notification.
plansRouter.post("/:id/apply-time", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (plan.creatorId !== userId) {
    res.status(403).json({ error: "Only the host can apply the time change" });
    return;
  }
  const proposal = plan.pendingTimeProposal;
  if (!proposal) {
    res.status(400).json({ error: "No pending time proposal" });
    return;
  }
  store.updatePlan(planId, {
    date: proposal.date,
    time: proposal.isFlexibleTime ? "" : proposal.time,
    isFlexibleTime: proposal.isFlexibleTime,
    pendingTimeProposal: null,
  });
  const parts = store.listParticipationsForPlan(planId);
  const stamp = new Date().toISOString();
  for (const p of parts) {
    if (p.userId === userId) continue;
    void emit({
      userId: p.userId,
      kind: "planTimeChanged",
      planId,
      body: `"${plan.title}" moved to a new date/time`,
      dedupKey: `planTimeChanged:${planId}:${stamp}`,
    });
  }
  store.log("plan_time_changed", { planId, date: proposal.date, time: proposal.time });
  const updated = store.findPlanById(planId)!;
  res.json(await planSummary(updated, userId));
});

plansRouter.delete("/:id/propose-time", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (plan.creatorId !== userId) {
    res.status(403).json({ error: "Only the host can cancel the proposal" });
    return;
  }
  store.updatePlan(planId, { pendingTimeProposal: null });
  const updated = store.findPlanById(planId)!;
  res.json(await planSummary(updated, userId));
});

/**
 * Invite picked users to a plan. Sends each a notification (NOT an auto-RSVP):
 * being invited should never silently enroll you — you decide to join from the
 * notification/plan. No-op for users who are already going/interested.
 *
 * Network-only plans: if the invitee isn't in the creator's network, the plan
 * is hidden from their feed. We still notify them and flag it so the client can
 * tell them to add the host first.
 */
plansRouter.post("/:id/invite", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const userIds: string[] = Array.isArray(req.body?.userIds)
    ? (req.body.userIds as unknown[]).map(String)
    : [];
  if (userIds.length === 0) {
    res.status(400).json({ error: "userIds required" });
    return;
  }
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const me = await findUserById(userId);
  if (!me || !planVisibleToViewer(plan, me)) {
    res.status(403).json({ error: "You can't invite to this plan" });
    return;
  }
  const inviterName = me.firstName || "Someone";
  const creator = store.findUserById(plan.creatorId);
  const creatorNet = new Set(creator?.networkIds ?? []);
  const isNetworkOnly = (plan.visibility ?? "everyone") === "network";

  let invited = 0;
  let hiddenForSome = false;
  for (const id of userIds) {
    if (id === userId) continue;
    const existing = store.findParticipation(planId, id);
    if (existing) continue; // already in — nothing to invite
    // Hidden case: network-only plan, invitee not in the host's network and
    // not the host themselves. They can't see it on the feed yet.
    const hidden = isNetworkOnly && id !== plan.creatorId && !creatorNet.has(id);
    if (hidden) hiddenForSome = true;
    const body = hidden
      ? `${inviterName} invited you to "${plan.title}" — it's private to ${creator?.firstName ?? "the host"}'s network, so add them to see it`
      : `${inviterName} invited you to "${plan.title}"`;
    await emit({
      userId: id,
      kind: "planInvite",
      body,
      planId: plan.id,
      // One invite ping per (plan, invitee) — re-inviting won't spam.
      dedupKey: `planInvite:${plan.id}:${id}`,
    });
    invited++;
  }
  res.json({ ok: true, invited, hiddenForSome });
});

plansRouter.post("/:id/suggestions", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const body = String(req.body?.body ?? "").trim();
  if (!body || body.length > 600) {
    res.status(400).json({ error: "Add a short reply (600 characters max)" });
    return;
  }
  const plan = store.findPlanById(planId);
  if (!plan || (plan.planKind ?? "standard") !== "looking_for") {
    res.status(400).json({ error: "Replies are for looking-for posts only" });
    return;
  }
  const me = await findUserById(userId);
  if (!me || !planVisibleToViewer(plan, me)) {
    res.status(403).json({ error: "You can't reply to this plan" });
    return;
  }
  store.createPlanSuggestion(planId, userId, body);
  store.ensureGroupConversation(planId, [plan.creatorId, userId]);
  const updated = store.findPlanById(planId)!;
  res.status(201).json(await planSummary(updated, userId));
});

plansRouter.post("/:id/lock", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  // Looking For lifecycle: only the original poster can lock the plan in.
  // Other interested folks coordinate via the group chat; the creator stays
  // the host through the whole lifecycle. For confirmed plans (already locked
  // once), only the current host can re-lock to edit details.
  const isLookingFor = (plan.planKind ?? "standard") === "looking_for";
  if (plan.creatorId !== userId) {
    res.status(403).json({
      error: isLookingFor
        ? "Only the original poster can lock this in"
        : "Only the host can edit a confirmed plan",
    });
    return;
  }

  const location = req.body?.location ?? {};
  const locationName = String(location.name ?? "").trim();
  const locationAddress = String(location.address ?? "").trim();
  const lat = typeof location.lat === "number" ? location.lat : undefined;
  const lng = typeof location.lng === "number" ? location.lng : undefined;
  const placeId =
    typeof location.placeId === "string" && location.placeId.trim()
      ? location.placeId.trim().slice(0, 256)
      : undefined;
  const dateInput = String(req.body?.date ?? "").trim();
  const time = String(req.body?.time ?? "").trim();
  const isFlexibleTime = Boolean(req.body?.isFlexibleTime);

  if (!locationName || !dateInput) {
    res.status(400).json({ error: "Add a venue and date to lock in" });
    return;
  }

  // Keep planKind as looking_for after a lock so the card on the feed shows
  // "Plan created" rather than becoming an indistinguishable confirmed plan —
  // the lifecycle history is the point. `lockedAt` distinguishes the locked
  // state.
  const patch: Parameters<typeof store.updatePlan>[1] = {
    lockedAt: new Date().toISOString(),
    location: {
      name: locationName,
      address: locationAddress || locationName,
      lat,
      lng,
      placeId,
    },
    date: dateInput,
    time: isFlexibleTime ? "" : time,
    isFlexibleTime,
    isFlexibleLocation: false,
  };
  store.updatePlan(planId, patch);

  const updated = store.findPlanById(planId)!;
  const conv = store.ensureGroupConversation(planId, [updated.creatorId]);
  const host = await findUserById(updated.creatorId);
  const hostName = host?.firstName ?? "Host";
  const dayLabel = new Date(dateInput).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = isFlexibleTime || !time ? "flexible time" : time;
  store.createSystemMessage(
    conv.id,
    `${hostName} locked in the plan — ${locationName}, ${dayLabel} · ${timeLabel}`,
  );

  await notifyInterestedPlanLocked(updated, hostName);

  res.json(await planSummary(updated, userId));
});

plansRouter.get("/:id", requireAuth, async (req, res) => {
  const planId = String(req.params.id);
  const userId = String(req.userId);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  store.log("plan_viewed", { planId, userId });
  res.json(await planSummary(plan, userId));
});

plansRouter.put("/:id/participation", requireAuth, async (req, res) => {
  const planId = String(req.params.id);
  const userId = String(req.userId);
  const state = req.body?.state as ParticipationState;
  if (state !== "interested" && state !== "going") {
    res.status(400).json({ error: "Invalid participation state" });
    return;
  }
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const existing = store.findParticipation(planId, userId);
  // Enforce capacity for "going" RSVPs. Approve-mode plans never let a
  // non-host go directly — they must apply (be interested) until the host
  // promotes them. FCFS plans cap at `capacity` slots.
  if (state === "going" && plan.creatorId !== userId && existing?.state !== "going") {
    const goingCount = store
      .listParticipationsForPlan(planId)
      .filter((p) => p.state === "going").length;
    const joinType = plan.joinType ?? "open";
    if (joinType === "approve") {
      res.status(403).json({ error: "This plan is invite-only — request to join instead." });
      return;
    }
    if (plan.capacity && goingCount >= plan.capacity) {
      res.status(409).json({ error: "This plan is full." });
      return;
    }
  }
  // Double-booking: only blocks "going" commitments (interested doesn't lock
  // your time). Host's own plans are always allowed. Skips cancelled or already-
  // ended plans, and locked-in looking_for variants count as commitments too.
  if (state === "going" && existing?.state !== "going") {
    const myGoing = store
      .listParticipationsForUser(userId)
      .filter((p) => p.state === "going" && p.planId !== planId);
    for (const row of myGoing) {
      const other = store.findPlanById(row.planId);
      if (!other) continue;
      if (other.cancelledAt) continue;
      if (!plansOverlap(plan, other)) continue;
      res.status(409).json({
        error: `You're already going to "${other.title}" at that time.`,
        conflictPlanId: other.id,
      });
      return;
    }
  }
  store.upsertParticipation(planId, userId, state);
  if (state === "going") {
    store.ensureGroupConversation(planId, [plan.creatorId, userId]);
  } else if (state === "interested" && (plan.planKind ?? "standard") === "looking_for") {
    store.ensureGroupConversation(planId, [plan.creatorId, userId]);
  }
  store.log("participation_changed", {
    planId,
    userId,
    from: existing?.state ?? null,
    to: state,
  });
  // Notify host on first promotion to "going" — fires once per (plan, joiner)
  // via dedupKey.
  if (state === "going" && existing?.state !== "going" && plan.creatorId !== userId) {
    const joiner = await findUserById(userId);
    const joinerName = joiner?.firstName || "Someone";
    await emit({
      userId: plan.creatorId,
      kind: "someoneJoinedYourPlan",
      body: `${joinerName} is in for "${plan.title}"`,
      planId: plan.id,
      dedupKey: `someoneJoinedYourPlan:${plan.id}:${userId}`,
    });
  }
  res.json({ ok: true });
});

// Approve-mode host control: promote an "interested" applicant to "going".
// Only the host can call this. Rejects when the plan is full.
plansRouter.post("/:id/approve", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const targetId = String(req.body?.userId ?? "");
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (plan.creatorId !== userId) {
    res.status(403).json({ error: "Only the host can approve" });
    return;
  }
  const target = store.findParticipation(planId, targetId);
  if (!target || target.state !== "interested") {
    res.status(400).json({ error: "That user hasn't applied" });
    return;
  }
  if (plan.capacity) {
    const goingCount = store
      .listParticipationsForPlan(planId)
      .filter((p) => p.state === "going").length;
    if (goingCount >= plan.capacity) {
      res.status(409).json({ error: "Plan is full" });
      return;
    }
  }
  store.upsertParticipation(planId, targetId, "going");
  store.ensureGroupConversation(planId, [plan.creatorId, targetId]);
  store.log("plan_approved", { planId, userId: targetId, by: userId });
  res.json(await planSummary(plan, userId));
});

plansRouter.delete("/:id/participation", requireAuth, async (req, res) => {
  const planId = String(req.params.id);
  const userId = String(req.userId);
  const existing = store.findParticipation(planId, userId);
  store.deleteParticipation(planId, userId);
  // A removal counts as a soft "decline" for the recommendation algo, and
  // separately gets timestamped on the `dropouts` log for analytics (only
  // when there was an active RSVP — bare deletes from a cancelled flow
  // shouldn't show up as a dropout).
  store.recordDecline(userId, planId);
  if (existing) {
    store.recordDropOut(userId, planId, existing.state);
  }
  store.log("participation_changed", {
    planId,
    userId,
    from: existing?.state ?? null,
    to: null,
  });
  // Notify the host when a committed ("going") guest drops out — makes the
  // drop a conscious act rather than a silent ghost. Skips when the host is
  // the one dropping (handled via cancel/transfer) and skips when the user
  // was only "interested" (tentative — not worth pinging).
  if (existing?.state === "going") {
    const plan = store.findPlanById(planId);
    if (plan && plan.creatorId !== userId && !plan.cancelledAt) {
      const leaver = await findUserById(userId);
      const leaverName = leaver?.firstName || "Someone";
      await emit({
        userId: plan.creatorId,
        kind: "someoneJoinedYourPlan",
        body: `${leaverName} dropped out of "${plan.title}"`,
        planId: plan.id,
        dedupKey: `dropOut:${plan.id}:${userId}:${Date.now()}`,
      });
    }
  }
  res.json({ ok: true });
});

// Host transfer — current host hands the plan to another going participant.
// Used when the host needs to drop out but doesn't want to cancel the plan.
// The new host is notified ("You're hosting X now"). Cannot transfer to a
// non-participant or to someone who's only interested — they need to be
// committed before they take over.
plansRouter.post("/:id/transfer-host", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const newHostId = String(req.body?.newHostId ?? "");
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (plan.creatorId !== userId) {
    res.status(403).json({ error: "Only the host can transfer" });
    return;
  }
  if (plan.cancelledAt) {
    res.status(400).json({ error: "Plan was cancelled" });
    return;
  }
  if (!newHostId || newHostId === userId) {
    res.status(400).json({ error: "Pick someone else from the going list" });
    return;
  }
  const target = store.findParticipation(planId, newHostId);
  if (!target || target.state !== "going") {
    res.status(400).json({ error: "New host must be marked going first" });
    return;
  }
  const newHost = await findUserById(newHostId);
  if (!newHost) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  store.updatePlan(planId, { creatorId: newHostId });
  store.ensureGroupConversation(planId, [newHostId]);
  // The outgoing host drops their own participation — they explicitly handed
  // it off, so they're no longer committed. Hosts are implicitly "going"
  // before the transfer, so we log a "going" drop-out for analytics.
  const outgoing = store.findParticipation(planId, userId);
  store.deleteParticipation(planId, userId);
  store.recordDropOut(userId, planId, outgoing?.state ?? "going");
  store.log("plan_host_transferred", { planId, from: userId, to: newHostId });
  await emit({
    userId: newHostId,
    kind: "someoneJoinedYourPlan",
    body: `You're hosting "${plan.title}" now`,
    planId: plan.id,
    dedupKey: `hostTransfer:${plan.id}:${newHostId}`,
  });
  res.json({ ok: true, newHostId });
});

// Host puts hosting "up for grabs" instead of cancelling — anyone who's in can
// claim it. Notifies participants + drops a system message in the chat.
plansRouter.post("/:id/up-for-grabs", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (plan.creatorId !== userId) {
    res.status(403).json({ error: "Only the host can do this" });
    return;
  }
  if (plan.cancelledAt) {
    res.status(400).json({ error: "Plan was cancelled" });
    return;
  }
  store.updatePlan(planId, { upForGrabsAt: new Date().toISOString() });
  const host = await findUserById(userId);
  const conv = store.ensureGroupConversation(planId, [plan.creatorId]);
  store.createSystemMessage(
    conv.id,
    `${host?.firstName ?? "The host"} can't make it — this plan is up for grabs. Tap "Take over hosting" to keep it alive.`,
  );
  for (const p of store.listParticipationsForPlan(planId)) {
    if (p.userId === userId) continue;
    if (p.state !== "going" && p.state !== "interested") continue;
    await emit({
      userId: p.userId,
      kind: "planInvite",
      body: `"${plan.title}" needs a new host — take it over?`,
      planId: plan.id,
      dedupKey: `upForGrabs:${plan.id}:${p.userId}`,
    });
  }
  store.log("plan_up_for_grabs", { planId, by: userId });
  res.json(await planSummary(store.findPlanById(planId)!, userId));
});

// Any going/interested participant claims an up-for-grabs plan and becomes the
// new host. The old host drops to a participant.
plansRouter.post("/:id/claim-host", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (!plan.upForGrabsAt) {
    res.status(400).json({ error: "This plan isn't up for grabs" });
    return;
  }
  if (plan.creatorId === userId) {
    res.status(400).json({ error: "You're already the host" });
    return;
  }
  const part = store.findParticipation(planId, userId);
  if (!part || (part.state !== "going" && part.state !== "interested")) {
    res.status(403).json({ error: "Join the plan before taking it over" });
    return;
  }
  const oldHostId = plan.creatorId;
  store.updatePlan(planId, { creatorId: userId, upForGrabsAt: null });
  store.upsertParticipation(planId, userId, "going");
  store.ensureGroupConversation(planId, [userId]);
  const newHost = await findUserById(userId);
  const conv = store.ensureGroupConversation(planId, [userId]);
  store.createSystemMessage(conv.id, `${newHost?.firstName ?? "Someone"} took over hosting. 🙌`);
  await emit({
    userId: oldHostId,
    kind: "someoneJoinedYourPlan",
    body: `${newHost?.firstName ?? "Someone"} took over hosting "${plan.title}"`,
    planId: plan.id,
    dedupKey: `claimHost:${plan.id}:${userId}`,
  });
  store.log("plan_host_claimed", { planId, from: oldHostId, to: userId });
  res.json(await planSummary(store.findPlanById(planId)!, userId));
});

// Host-only plan cancellation. Marks the plan cancelled and notifies every
// participant (going + interested) so they see it on /notifications.
plansRouter.post("/:id/cancel", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const planId = String(req.params.id);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (plan.creatorId !== userId) {
    res.status(403).json({ error: "Only the host can cancel" });
    return;
  }
  if (plan.cancelledAt) {
    res.status(400).json({ error: "Plan already cancelled" });
    return;
  }
  const cancelledAt = new Date().toISOString();
  store.updatePlan(planId, { cancelledAt });

  const participants = store.listParticipationsForPlan(planId);
  const recipientIds = Array.from(
    new Set(
      participants
        .filter((p) => p.state === "going" || p.state === "interested")
        .map((p) => p.userId)
        .filter((id) => id !== userId),
    ),
  );
  for (const uid of recipientIds) {
    await emit({
      userId: uid,
      kind: "planCancellation",
      body: `"${plan.title}" was cancelled by the host`,
      planId: plan.id,
      dedupKey: `planCancellation:${plan.id}:${uid}`,
    });
  }
  store.log("plan_cancelled", { planId, by: userId, notified: recipientIds.length });
  res.json({ ok: true, cancelledAt });
});
