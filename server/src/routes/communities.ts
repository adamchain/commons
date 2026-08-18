import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  store,
  type CommunityRecord,
  type CommunityMemberRecord,
  type CommunityPostRecord,
} from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import { userToPublic, planSummary } from "./plans.js";
import { emit } from "../lib/notify.js";
import { isAdminPhone } from "../lib/adminPhones.js";
import {
  canViewCommunityBoard,
  communityCreationBlockReason,
  communityMembershipBlockReason,
  isActiveCommunityMember,
  isCommunityOrganizer,
} from "../lib/communityAccess.js";
import {
  ALL_COMMUNITY_CATEGORIES,
  normalizeCommunityCategory,
  type CommunityCardDTO,
  type CommunityCategory,
  type CommunityDTO,
  type CommunityMemberDTO,
  type CommunityPostDTO,
  type CommunityPostingPermission,
  type PublicUser,
} from "../types/shared.js";

export const communitiesRouter = Router();

/** COMMONS admins — ops via /api/admin; not treated as community organizers. */
async function isCommonsAdmin(userId: string): Promise<boolean> {
  const u = await findUserById(userId);
  return !!u && isAdminPhone(u.phoneNumber);
}

function publicFor(uid: string, users: Map<string, Awaited<ReturnType<typeof findUserById>>>): PublicUser {
  const u = users.get(uid);
  return u
    ? userToPublic(u)
    : { id: uid, firstName: "Former member", neighborhoodId: null, avatarSeed: uid, avatarStyle: "avataaars" };
}

async function toCommunityDTO(
  community: CommunityRecord,
  viewerId: string,
): Promise<CommunityDTO> {
  const organizer = await findUserById(community.organizerId);
  const membership = store.findCommunityMembership(community.id, viewerId);
  // Real organizer only — COMMONS admins must Join like any other member.
  const isOrganizer = isCommunityOrganizer(community, viewerId);
  const isActiveMember = membership?.status === "active";
  const canPostBulletin =
    (community.bulletinEnabled ?? true) &&
    (isOrganizer || (community.bulletinPermission === "members" && isActiveMember));
  const canPostPlan =
    isOrganizer || (community.planPostingPermission === "members" && isActiveMember);
  return {
    id: community.id,
    name: community.name,
    description: community.description,
    coverImage: community.coverImage ?? null,
    category: normalizeCommunityCategory(String(community.category ?? "")),
    organizer: organizer
      ? userToPublic(organizer)
      : { id: community.organizerId, firstName: "Organizer", neighborhoodId: null, avatarSeed: community.organizerId, avatarStyle: "avataaars" },
    memberCount: community.memberCount,
    isFounding: community.isFounding,
    creationStatus: community.creationStatus,
    bulletinPermission: community.bulletinPermission,
    planPostingPermission: community.planPostingPermission,
    chatEnabled: community.chatEnabled,
    bulletinEnabled: community.bulletinEnabled ?? true,
    bulletinRequiresApproval: community.bulletinRequiresApproval ?? false,
    visibility: community.visibility ?? "everyone",
    screeningQuestion: isOrganizer ? community.screeningQuestion ?? null : null,
    hasScreening: !!community.screeningQuestion,
    createdAt: community.createdAt,
    myMembership: membership
      ? { role: membership.role, status: membership.status }
      : null,
    isOrganizer,
    canPostBulletin,
    canPostPlan,
    pendingRequestCount: isOrganizer ? store.listPendingCommunityMembers(community.id).length : 0,
    pendingBulletinCount: isOrganizer ? store.listPendingCommunityPosts(community.id).length : 0,
  };
}

function toCommunityCard(community: CommunityRecord, viewerId: string): CommunityCardDTO {
  const membership = store.findCommunityMembership(community.id, viewerId);
  return {
    id: community.id,
    name: community.name,
    coverImage: community.coverImage ?? null,
    category: normalizeCommunityCategory(String(community.category ?? "")),
    memberCount: community.memberCount,
    isFounding: community.isFounding,
    myRole: membership?.status === "active" ? membership.role : null,
    myMembershipStatus: membership?.status ?? null,
    hasScreening: !!community.screeningQuestion,
  };
}

function postDTO(
  post: CommunityPostRecord,
  users: Map<string, Awaited<ReturnType<typeof findUserById>>>,
  organizerId: string,
  viewerId: string,
  viewerIsOrganizer: boolean,
): CommunityPostDTO {
  const status = post.approvalStatus ?? "approved";
  return {
    id: post.id,
    author: publicFor(post.authorId, users),
    authorIsOrganizer: post.authorId === organizerId,
    content: post.content,
    image: post.image ?? null,
    pinned: post.pinned,
    approvalStatus: status === "pending" ? "pending" : "approved",
    createdAt: post.createdAt,
    canDelete: viewerIsOrganizer || post.authorId === viewerId,
  };
}

function memberDTO(
  m: CommunityMemberRecord,
  users: Map<string, Awaited<ReturnType<typeof findUserById>>>,
  organizerId: string,
  includeAnswer: boolean,
): CommunityMemberDTO {
  return {
    user: publicFor(m.userId, users),
    role: m.userId === organizerId ? "organizer" : m.role,
    status: m.status,
    screeningAnswer: includeAnswer ? m.screeningAnswer ?? null : null,
    joinedAt: m.joinedAt,
  };
}

/** Shared guard for mutating endpoints that require a live (or in-review) community.
 *  Organizers may act while their community is pending review; everyone else gets
 *  a clear error instead of a silent 404. Same rule as community chat writes. */
function requireCommunityForMutation(
  communityId: string,
  viewerId: string,
  res: import("express").Response,
): { community: CommunityRecord; isOrganizer: boolean } | null {
  const community = store.findCommunityById(communityId);
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return null;
  }
  const isOrganizer = isCommunityOrganizer(community, viewerId);
  const blocked = communityCreationBlockReason(community, viewerId);
  if (blocked) {
    res.status(blocked === "This community is pending review" ? 403 : 404).json({ error: blocked });
    return null;
  }
  return { community, isOrganizer };
}

/** Board/detail reads: live communities for everyone; pending/rejected only for organizer. */
function requireCommunityForRead(
  communityId: string,
  viewerId: string,
  res: import("express").Response,
): CommunityRecord | null {
  const community = store.findCommunityById(communityId);
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return null;
  }
  if (
    community.creationStatus !== "approved" &&
    !isCommunityOrganizer(community, viewerId)
  ) {
    res.status(404).json({ error: "Community not found" });
    return null;
  }
  return community;
}

function parsePermission(
  raw: unknown,
  fallback: CommunityPostingPermission,
): CommunityPostingPermission {
  return raw === "organizer_only" || raw === "members" ? raw : fallback;
}

// GET /api/communities — approved communities as cards (Explore rail + browse).
communitiesRouter.get("/", requireAuth, (req, res) => {
  const viewerId = String(req.userId);
  const cards = store
    .listApprovedCommunities()
    .sort((a, b) => {
      if (a.isFounding !== b.isFounding) return a.isFounding ? -1 : 1;
      return b.memberCount - a.memberCount;
    })
    .map((c) => toCommunityCard(c, viewerId));
  res.json({ communities: cards });
});

// GET /api/communities/mine — communities the viewer belongs to / organizes.
communitiesRouter.get("/mine", requireAuth, (req, res) => {
  const viewerId = String(req.userId);
  const memberships = store.listCommunityMembershipsForUser(viewerId);
  const cards: CommunityCardDTO[] = [];
  for (const m of memberships) {
    const community = store.findCommunityById(m.communityId);
    if (!community) continue;
    // Show approved communities; also surface the viewer's own pending submissions
    // so a creator sees their in-review community from their profile.
    if (community.creationStatus === "rejected") continue;
    if (community.creationStatus === "pending" && community.organizerId !== viewerId) continue;
    cards.push(toCommunityCard(community, viewerId));
  }
  res.json({ communities: cards });
});

// POST /api/communities — create a community (goes live immediately).
communitiesRouter.post("/", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const name = String(req.body?.name ?? "").trim().slice(0, 80);
  const description = String(req.body?.description ?? "").trim().slice(0, 2000);
  const rawCategory = String(req.body?.category ?? "");
  const category = normalizeCommunityCategory(rawCategory);
  const rawCover = typeof req.body?.coverImage === "string" ? req.body.coverImage : "";
  const coverImage =
    rawCover.startsWith("data:image/") && rawCover.length < 1_600_000
      ? rawCover
      : rawCover.startsWith("http")
        ? rawCover.slice(0, 2048)
        : null;
  const screeningRaw = req.body?.screeningQuestion;
  const screeningQuestion =
    typeof screeningRaw === "string" && screeningRaw.trim()
      ? screeningRaw.trim().slice(0, 280)
      : null;

  if (!name || !description) {
    res.status(400).json({ error: "Name and description are required" });
    return;
  }

  const community = store.createCommunity({
    name,
    description,
    coverImage,
    category,
    organizerId: userId,
    screeningQuestion,
    creationStatus: "approved",
  });
  store.log("community_created", { communityId: community.id, organizerId: userId });
  res.status(201).json(await toCommunityDTO(community, userId));
});

// GET /api/communities/:id — full detail. Pending communities are only visible
// to their creator and to COMMONS admins.
communitiesRouter.get("/:id", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  const viewerIsAdmin = await isCommonsAdmin(viewerId);
  if (
    community.creationStatus !== "approved" &&
    !isCommunityOrganizer(community, viewerId) &&
    !viewerIsAdmin
  ) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  res.json(await toCommunityDTO(community, viewerId));
});

// PATCH /api/communities/:id — organizer settings (name/description/cover/category,
// screening question, posting permissions, chat toggle).
communitiesRouter.patch("/:id", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  // Settings are organizer-only. COMMONS admins are not treated as organizers
  // here — they must Join (or be the real organizer) like any other member.
  if (!isCommunityOrganizer(community, viewerId)) {
    res.status(403).json({ error: "Only the organizer can edit this community" });
    return;
  }
  const patch: Partial<CommunityRecord> = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) {
    patch.name = req.body.name.trim().slice(0, 80);
  }
  if (typeof req.body?.description === "string") {
    patch.description = req.body.description.trim().slice(0, 2000);
  }
  if (
    typeof req.body?.category === "string" &&
    ALL_COMMUNITY_CATEGORIES.includes(req.body.category as CommunityCategory)
  ) {
    patch.category = req.body.category as CommunityCategory;
  }
  if ("coverImage" in (req.body ?? {})) {
    const c = req.body.coverImage;
    if (c === null || c === "") {
      patch.coverImage = null;
    } else if (typeof c === "string") {
      patch.coverImage =
        c.startsWith("data:image/") && c.length < 1_600_000
          ? c
          : c.startsWith("http")
            ? c.slice(0, 2048)
            : community.coverImage ?? null;
    }
  }
  if ("screeningQuestion" in (req.body ?? {})) {
    const s = req.body.screeningQuestion;
    patch.screeningQuestion =
      typeof s === "string" && s.trim() ? s.trim().slice(0, 280) : null;
  }
  if ("bulletinPermission" in (req.body ?? {})) {
    patch.bulletinPermission = parsePermission(req.body.bulletinPermission, community.bulletinPermission);
  }
  if ("planPostingPermission" in (req.body ?? {})) {
    patch.planPostingPermission = parsePermission(
      req.body.planPostingPermission,
      community.planPostingPermission,
    );
  }
  if ("chatEnabled" in (req.body ?? {})) {
    patch.chatEnabled = Boolean(req.body.chatEnabled);
  }
  if ("bulletinEnabled" in (req.body ?? {})) {
    patch.bulletinEnabled = Boolean(req.body.bulletinEnabled);
  }
  if ("bulletinRequiresApproval" in (req.body ?? {})) {
    patch.bulletinRequiresApproval = Boolean(req.body.bulletinRequiresApproval);
  }
  if (req.body?.visibility === "everyone" || req.body?.visibility === "members_only") {
    patch.visibility = req.body.visibility;
  }
  // Rejected → edit republishes immediately (admin can reject again if needed).
  if (community.creationStatus === "rejected" && Object.keys(patch).length > 0) {
    patch.creationStatus = "approved";
    patch.rejectionNote = null;
    patch.reviewedAt = new Date().toISOString();
    patch.reviewedBy = null;
  }
  const updated = store.updateCommunity(community.id, patch) ?? community;
  res.json(await toCommunityDTO(updated, viewerId));
});

// POST /api/communities/:id/join — instant join, or request-to-join if a
// screening question is set (creates a pending membership with the answer).
communitiesRouter.post("/:id/join", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community || community.creationStatus !== "approved") {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  const existing = store.findCommunityMembership(community.id, userId);
  if (existing) {
    res.json(await toCommunityDTO(community, userId));
    return;
  }
  const me = await findUserById(userId);
  if (community.screeningQuestion) {
    const answer = String(req.body?.screeningAnswer ?? "").trim().slice(0, 1000);
    if (!answer) {
      res.status(400).json({ error: "Answer the screening question to request to join" });
      return;
    }
    store.upsertCommunityMembership({
      communityId: community.id,
      userId,
      role: "member",
      status: "pending",
      screeningAnswer: answer,
    });
    // Notify the organizer (in-app + push). Never fail the join if notify hiccups.
    try {
      await emit({
        userId: community.organizerId,
        kind: "communityJoinRequest",
        body: `${me?.firstName || "Someone"} asked to join ${community.name}`,
        communityId: community.id,
        profileUserId: userId,
        dedupKey: `communityJoinRequest:${community.id}:${userId}`,
      });
    } catch (err) {
      console.error(
        "[communities] join-request notify failed",
        err instanceof Error ? err.message : err,
      );
    }
    store.log("community_join_requested", { communityId: community.id, userId });
  } else {
    store.upsertCommunityMembership({
      communityId: community.id,
      userId,
      role: "member",
      status: "active",
    });
    // Drop them into the group chat if it's enabled and already spun up.
    const conv = store.findCommunityConversation(community.id);
    if (conv && community.chatEnabled) {
      store.ensureCommunityConversation(community.id, [userId]);
    }
    store.log("community_joined", { communityId: community.id, userId });
  }
  res.json(await toCommunityDTO(store.findCommunityById(community.id)!, userId));
});

// POST /api/communities/:id/leave — members can leave anytime. Organizers must
// transfer ownership first (POST …/transfer-organizer) or delete the community.
communitiesRouter.post("/:id/leave", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  if (community.organizerId === userId) {
    res.status(400).json({
      error: "Transfer the community to another member, or delete it, before leaving.",
    });
    return;
  }
  store.removeCommunityMembership(community.id, userId);
  store.log("community_left", { communityId: community.id, userId });
  res.json(await toCommunityDTO(store.findCommunityById(community.id)!, userId));
});

// POST /api/communities/:id/transfer-organizer — organizer hands ownership to an
// active member, then leaves (same shape as plan host transfer).
communitiesRouter.post("/:id/transfer-organizer", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  const viewerIsAdmin = await isCommonsAdmin(userId);
  if (community.organizerId !== userId && !viewerIsAdmin) {
    res.status(403).json({ error: "Only the organizer can transfer this community" });
    return;
  }
  const newOrganizerId = String(req.body?.newOrganizerId ?? "");
  if (!newOrganizerId || newOrganizerId === community.organizerId) {
    res.status(400).json({ error: "Pick another active member to take over" });
    return;
  }
  const targetMembership = store.findCommunityMembership(community.id, newOrganizerId);
  if (!targetMembership || targetMembership.status !== "active") {
    res.status(400).json({ error: "New organizer must be an active member first" });
    return;
  }
  const newOrganizer = await findUserById(newOrganizerId);
  if (!newOrganizer) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const previousOrganizerId = community.organizerId;
  store.transferCommunityOrganizer(community.id, newOrganizerId);
  // Outgoing organizer leaves after handoff. A COMMONS admin transferring on
  // someone else's behalf demotes the old organizer to member instead.
  if (previousOrganizerId === userId) {
    store.removeCommunityMembership(community.id, userId);
  }

  if (community.chatEnabled) {
    store.ensureCommunityConversation(community.id, [newOrganizerId]);
  }

  store.log("community_organizer_transferred", {
    communityId: community.id,
    from: previousOrganizerId,
    to: newOrganizerId,
    by: userId,
  });
  await emit({
    userId: newOrganizerId,
    kind: "communityRequestApproved",
    body: `You're now the organizer of ${community.name}`,
    communityId: community.id,
    dedupKey: `communityOrganizerTransfer:${community.id}:${newOrganizerId}`,
  });

  const updated = store.findCommunityById(community.id)!;
  res.json({ ok: true, newOrganizerId, community: await toCommunityDTO(updated, userId) });
});

// DELETE /api/communities/:id — organizer (or admin) permanently deletes the
// community. Cascades memberships, bulletin, chat; cancels linked plans.
communitiesRouter.delete("/:id", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  const viewerIsAdmin = await isCommonsAdmin(userId);
  if (community.organizerId !== userId && !viewerIsAdmin) {
    res.status(403).json({ error: "Only the organizer can delete this community" });
    return;
  }

  const name = community.name;
  const communityId = community.id;
  const result = store.deleteCommunity(communityId);
  if (!result) {
    res.status(404).json({ error: "Community not found" });
    return;
  }

  for (const planId of result.cancelledPlanIds) {
    const plan = store.findPlanById(planId);
    if (!plan) continue;
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
        body: `"${plan.title}" was cancelled — ${name} was deleted`,
        planId: plan.id,
        dedupKey: `planCancellation:${plan.id}:${uid}`,
      });
    }
  }

  store.log("community_deleted", {
    communityId,
    by: userId,
    cancelledPlans: result.cancelledPlanIds.length,
  });
  res.json({ ok: true });
});

// GET /api/communities/:id/members — active members always; pending requests
// (with screening answers) only when the viewer is the organizer.
communitiesRouter.get("/:id/members", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = requireCommunityForRead(String(req.params.id), viewerId, res);
  if (!community) return;
  const isOrganizer = isCommunityOrganizer(community, viewerId);
  if (!canViewCommunityBoard(community, viewerId)) {
    res.status(403).json({ error: "Join the community to see its members" });
    return;
  }

  const active = store.listActiveCommunityMembers(community.id);
  // Organizer first, then by join time.
  active.sort((a, b) => {
    if (a.userId === community.organizerId) return -1;
    if (b.userId === community.organizerId) return 1;
    return a.joinedAt.localeCompare(b.joinedAt);
  });
  const pending = isOrganizer ? store.listPendingCommunityMembers(community.id) : [];
  const allIds = [...active, ...pending].map((m) => m.userId);
  const users = await findUsersByIds(allIds);

  res.json({
    members: active.map((m) => memberDTO(m, users, community.organizerId, false)),
    pending: pending.map((m) => memberDTO(m, users, community.organizerId, true)),
  });
});

// POST /api/communities/:id/members/:userId/approve
communitiesRouter.post("/:id/members/:userId/approve", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  if (!isCommunityOrganizer(community, viewerId)) {
    res.status(403).json({ error: "Only the organizer can approve members" });
    return;
  }
  const targetId = String(req.params.userId);
  const membership = store.findCommunityMembership(community.id, targetId);
  if (!membership || membership.status !== "pending") {
    res.status(404).json({ error: "No pending request from this user" });
    return;
  }
  store.upsertCommunityMembership({ communityId: community.id, userId: targetId, status: "active" });
  if (community.chatEnabled && store.findCommunityConversation(community.id)) {
    store.ensureCommunityConversation(community.id, [targetId]);
  }
  await emit({
    userId: targetId,
    kind: "communityRequestApproved",
    body: `You're in — welcome to ${community.name}`,
    communityId: community.id,
    dedupKey: `communityApproved:${community.id}:${targetId}`,
  });
  store.log("community_member_approved", { communityId: community.id, userId: targetId });
  res.json({ ok: true });
});

// POST /api/communities/:id/members/:userId/decline
communitiesRouter.post("/:id/members/:userId/decline", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  if (!isCommunityOrganizer(community, viewerId)) {
    res.status(403).json({ error: "Only the organizer can decline members" });
    return;
  }
  const targetId = String(req.params.userId);
  const membership = store.findCommunityMembership(community.id, targetId);
  if (!membership || membership.status !== "pending") {
    res.status(404).json({ error: "No pending request from this user" });
    return;
  }
  store.removeCommunityMembership(community.id, targetId);
  await emit({
    userId: targetId,
    kind: "communityRequestDeclined",
    body: `Your request to join ${community.name} wasn't approved`,
    communityId: community.id,
    dedupKey: `communityDeclined:${community.id}:${targetId}:${membership.joinedAt}`,
  });
  store.log("community_member_declined", { communityId: community.id, userId: targetId });
  res.json({ ok: true });
});

// POST /api/communities/:id/members — organizer adds a member directly (no screening).
communitiesRouter.post("/:id/members", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const ctx = requireCommunityForMutation(String(req.params.id), viewerId, res);
  if (!ctx) return;
  const { community, isOrganizer } = ctx;
  if (!isOrganizer) {
    res.status(403).json({ error: "Only the organizer can add members" });
    return;
  }
  const targetId = String(req.body?.userId ?? "").trim();
  if (!targetId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }
  const target = await findUserById(targetId);
  if (!target || !target.onboardingComplete) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (targetId === community.organizerId) {
    res.status(400).json({ error: "The organizer is already a member" });
    return;
  }
  const existing = store.findCommunityMembership(community.id, targetId);
  if (existing?.status === "active") {
    res.status(400).json({ error: "Already a member" });
    return;
  }
  store.upsertCommunityMembership({
    communityId: community.id,
    userId: targetId,
    role: "member",
    status: "active",
  });
  if (community.chatEnabled && store.findCommunityConversation(community.id)) {
    store.ensureCommunityConversation(community.id, [targetId]);
  }
  await emit({
    userId: targetId,
    kind: "communityRequestApproved",
    body: `You were added to ${community.name}`,
    communityId: community.id,
    dedupKey: `communityAdded:${community.id}:${targetId}`,
  });
  store.log("community_member_added", { communityId: community.id, userId: targetId });
  res.status(201).json({ ok: true });
});

// DELETE /api/communities/:id/members/:userId — organizer removes a member.
// Removed users may re-request. Organizer can't remove themselves.
communitiesRouter.delete("/:id/members/:userId", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  if (!isCommunityOrganizer(community, viewerId)) {
    res.status(403).json({ error: "Only the organizer can remove members" });
    return;
  }
  const targetId = String(req.params.userId);
  if (targetId === community.organizerId) {
    res.status(400).json({ error: "The organizer can't be removed" });
    return;
  }
  store.removeCommunityMembership(community.id, targetId);
  store.log("community_member_removed", { communityId: community.id, userId: targetId });
  res.json({ ok: true });
});

// GET /api/communities/:id/posts — bulletin (pinned first, then reverse-chron).
communitiesRouter.get("/:id/posts", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = requireCommunityForRead(String(req.params.id), viewerId, res);
  if (!community) return;
  if (!(community.bulletinEnabled ?? true)) {
    res.status(403).json({ error: "Bulletin is turned off for this community" });
    return;
  }
  const viewerIsOrganizer = isCommunityOrganizer(community, viewerId);
  if (!canViewCommunityBoard(community, viewerId)) {
    res.status(403).json({ error: "Join the community to see the bulletin" });
    return;
  }
  const posts = store.listCommunityPosts(community.id);
  // Authors can see their own pending posts on the feed; organizers get the
  // full pending queue in a separate array for the approval UI.
  const myPending = viewerIsOrganizer
    ? []
    : store.listPendingCommunityPosts(community.id).filter((p) => p.authorId === viewerId);
  const pending = viewerIsOrganizer ? store.listPendingCommunityPosts(community.id) : [];
  const allForUsers = [...posts, ...myPending, ...pending];
  const users = await findUsersByIds(allForUsers.map((p) => p.authorId));
  res.json({
    posts: [
      ...myPending.map((p) => postDTO(p, users, community.organizerId, viewerId, viewerIsOrganizer)),
      ...posts.map((p) => postDTO(p, users, community.organizerId, viewerId, viewerIsOrganizer)),
    ],
    pending: pending.map((p) => postDTO(p, users, community.organizerId, viewerId, viewerIsOrganizer)),
  });
});

// POST /api/communities/:id/posts — post to the bulletin (per bulletin_permission).
communitiesRouter.post("/:id/posts", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const ctx = requireCommunityForMutation(String(req.params.id), viewerId, res);
  if (!ctx) return;
  const { community } = ctx;
  if (!(community.bulletinEnabled ?? true)) {
    res.status(403).json({ error: "Bulletin is turned off for this community" });
    return;
  }
  const viewerIsOrganizer = isCommunityOrganizer(community, viewerId);
  const isActive = isActiveCommunityMember(community.id, viewerId);
  const blocked = communityMembershipBlockReason(community, viewerId);
  if (blocked) {
    res.status(403).json({ error: blocked });
    return;
  }
  const mayPost =
    viewerIsOrganizer || (community.bulletinPermission === "members" && isActive);
  if (!mayPost) {
    res.status(403).json({ error: "You don't have permission to post here" });
    return;
  }
  const content = String(req.body?.content ?? "").trim().slice(0, 4000);
  const rawImage = typeof req.body?.image === "string" ? req.body.image : "";
  const image =
    rawImage.startsWith("data:image/") && rawImage.length < 1_600_000 ? rawImage : null;
  if (!content && !image) {
    res.status(400).json({ error: "Write something to post" });
    return;
  }
  // Organizer posts are always live. Member posts wait when approval is required.
  const needsApproval =
    !viewerIsOrganizer && (community.bulletinRequiresApproval ?? false);
  const post = store.createCommunityPost({
    communityId: community.id,
    authorId: viewerId,
    content,
    image,
    approvalStatus: needsApproval ? "pending" : "approved",
  });
  const users = await findUsersByIds([post.authorId]);
  store.log("community_post_created", {
    communityId: community.id,
    postId: post.id,
    approvalStatus: post.approvalStatus,
  });
  res
    .status(201)
    .json(postDTO(post, users, community.organizerId, viewerId, viewerIsOrganizer));
});

// POST /api/communities/:id/posts/:postId/approve — organizer approves a pending post.
communitiesRouter.post("/:id/posts/:postId/approve", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  if (!isCommunityOrganizer(community, viewerId)) {
    res.status(403).json({ error: "Only the organizer can approve posts" });
    return;
  }
  const post = store.findCommunityPostById(String(req.params.postId));
  if (!post || post.communityId !== community.id || post.approvalStatus !== "pending") {
    res.status(404).json({ error: "Pending post not found" });
    return;
  }
  store.setCommunityPostApprovalStatus(post.id, "approved");
  store.log("community_post_approved", { communityId: community.id, postId: post.id });
  res.json({ ok: true });
});

// POST /api/communities/:id/posts/:postId/decline — organizer declines a pending post.
communitiesRouter.post("/:id/posts/:postId/decline", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  if (!isCommunityOrganizer(community, viewerId)) {
    res.status(403).json({ error: "Only the organizer can decline posts" });
    return;
  }
  const post = store.findCommunityPostById(String(req.params.postId));
  if (!post || post.communityId !== community.id || post.approvalStatus !== "pending") {
    res.status(404).json({ error: "Pending post not found" });
    return;
  }
  store.setCommunityPostApprovalStatus(post.id, "rejected");
  store.log("community_post_declined", { communityId: community.id, postId: post.id });
  res.json({ ok: true });
});

// POST /api/communities/:id/posts/:postId/pin — organizer pin/unpin. { pinned }
communitiesRouter.post("/:id/posts/:postId/pin", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  if (!(community.bulletinEnabled ?? true)) {
    res.status(403).json({ error: "Bulletin is turned off for this community" });
    return;
  }
  if (!isCommunityOrganizer(community, viewerId)) {
    res.status(403).json({ error: "Only the organizer can pin posts" });
    return;
  }
  const post = store.findCommunityPostById(String(req.params.postId));
  if (!post || post.communityId !== community.id) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if ((post.approvalStatus ?? "approved") !== "approved") {
    res.status(400).json({ error: "Only approved posts can be pinned" });
    return;
  }
  store.setCommunityPostPinned(post.id, Boolean(req.body?.pinned));
  res.json({ ok: true });
});

// DELETE /api/communities/:id/posts/:postId — author deletes own; organizer any.
communitiesRouter.delete("/:id/posts/:postId", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  const post = store.findCommunityPostById(String(req.params.postId));
  if (!post || post.communityId !== community.id) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const viewerIsOrganizer = isCommunityOrganizer(community, viewerId);
  if (!viewerIsOrganizer && post.authorId !== viewerId) {
    res.status(403).json({ error: "You can only delete your own posts" });
    return;
  }
  store.softDeleteCommunityPost(post.id);
  res.json({ ok: true });
});

// GET /api/communities/:id/events — plans tagged to this community, by date.
// community_only plans are only returned to active members / the organizer.
communitiesRouter.get("/:id/events", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = requireCommunityForRead(String(req.params.id), viewerId, res);
  if (!community) return;
  const isMember = isActiveCommunityMember(community.id, viewerId);
  const isOrganizer = isCommunityOrganizer(community, viewerId);
  if (!canViewCommunityBoard(community, viewerId)) {
    res.status(403).json({ error: "Join the community to see its events" });
    return;
  }
  const plans = store
    .listPlans()
    .filter((p) => p.communityId === community.id && !p.cancelledAt)
    .filter((p) => {
      if (p.communityVisibility === "community_only") return isMember || isOrganizer;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const summaries = await Promise.all(plans.map((p) => planSummary(p, viewerId)));
  res.json(summaries);
});

// GET /api/communities/:id/conversation — ensure + return the persistent group
// chat for the community. Active members only; requires chat_enabled.
communitiesRouter.get("/:id/conversation", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = requireCommunityForRead(String(req.params.id), viewerId, res);
  if (!community) return;
  if (!community.chatEnabled) {
    res.status(403).json({ error: "Chat is turned off for this community" });
    return;
  }
  const blocked = communityMembershipBlockReason(community, viewerId, "access chat");
  if (blocked) {
    res.status(403).json({ error: blocked });
    return;
  }
  const activeIds = store.listActiveCommunityMembers(community.id).map((m) => m.userId);
  const existing = store.findCommunityConversation(community.id);
  // Opening chat intentionally rejoins after an inbox leave.
  if (existing) store.setConversationLeft(viewerId, existing.id, false);
  const conv = store.ensureCommunityConversation(community.id, activeIds, {
    rejoinIds: [viewerId],
  });
  const users = await findUsersByIds(conv.participantIds);
  const messages = store.listMessagesForConversation(conv.id);
  const hostId = community.organizerId;
  res.json({
    id: conv.id,
    communityId: community.id,
    communityName: community.name,
    type: conv.type,
    participants: conv.participantIds.map((id) => publicFor(id, users)),
    lastMessageAt: conv.lastMessageAt,
    unreadCount: messages.filter((m) => !m.readBy.includes(viewerId)).length,
    muted: store.isConversationMuted(viewerId, conv.id),
    isHost: hostId === viewerId,
    hostId,
  });
});
