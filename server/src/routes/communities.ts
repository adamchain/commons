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
import { listAdminPhones } from "../lib/adminPhones.js";
import { isQaOrTestCommunityName } from "../lib/qaCommunities.js";
import {
  canViewCommunityBoard,
  communityCreationBlockReason,
  communityMembershipBlockReason,
  communityRequiresJoinApproval,
  isActiveCommunityMember,
  isCommunityOrganizer,
} from "../lib/communityAccess.js";
import { textBlockedReason } from "../lib/contentFilter.js";
import { buildCommunityAnalytics } from "../lib/communityDashboard.js";
import {
  communityCategoriesOf,
  parseCommunityCategories,
  type CommunityCardDTO,
  type CommunityDTO,
  type CommunitySocialLinks,
  type CommunityMemberDTO,
  type CommunityDashboardDTO,
  type CommunityPostDTO,
  type CommunityPostingPermission,
  type NetworkLinkStatus,
  type PublicUser,
} from "../types/shared.js";

const SOCIAL_HANDLE = /^[A-Za-z0-9._]{1,40}$/;

/** Accept a bare handle, @handle, or a profile URL and store just the handle. */
function socialSlug(raw: unknown, hosts: string[]): { ok: true; value: string } | { ok: false } {
  let s = String(raw ?? "").trim();
  if (!s) return { ok: true, value: "" };
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const lower = s.toLowerCase();
  for (const host of hosts) {
    const prefix = `${host}/`;
    if (lower.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }
  s = s.replace(/^@+/, "").split(/[/?#]/)[0] ?? "";
  if (!s) return { ok: true, value: "" };
  if (!SOCIAL_HANDLE.test(s)) return { ok: false };
  return { ok: true, value: s };
}

function publicSocialLinks(
  links: CommunityRecord["socialLinks"],
): CommunitySocialLinks | null {
  if (!links) return null;
  const out: CommunitySocialLinks = {};
  if (links.instagram) out.instagram = links.instagram;
  if (links.tiktok) out.tiktok = links.tiktok;
  if (links.linktree) out.linktree = links.linktree;
  return Object.keys(out).length ? out : null;
}

function parseCommunitySocialLinks(raw: unknown): CommunitySocialLinks | null | "invalid" {
  if (raw == null) return null;
  if (typeof raw !== "object") return "invalid";
  const body = raw as Record<string, unknown>;
  const ig = socialSlug(body.instagram, ["instagram.com"]);
  const tt = socialSlug(body.tiktok, ["tiktok.com", "www.tiktok.com"]);
  const lt = socialSlug(body.linktree, ["linktr.ee", "linktree.com"]);
  if (!ig.ok || !tt.ok || !lt.ok) return "invalid";
  const links: CommunitySocialLinks = {};
  if (ig.value) links.instagram = ig.value;
  if (tt.value) links.tiktok = tt.value;
  if (lt.value) links.linktree = lt.value;
  return Object.keys(links).length ? links : null;
}

export const communitiesRouter = Router();

/** COMMONS admins — ops via /api/admin; not treated as community organizers. */
async function isCommonsAdmin(userId: string): Promise<boolean> {
  const u = await findUserById(userId);
  return !!u && listAdminPhones().includes(u.phoneNumber);
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
    socialLinks: publicSocialLinks(community.socialLinks),
    coverImage: community.coverImage ?? null,
    category: communityCategoriesOf(community)[0]!,
    categories: communityCategoriesOf(community),
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
    city: community.city?.trim() || null,
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

function organizerPublic(uid: string, users: Awaited<ReturnType<typeof findUsersByIds>>): PublicUser {
  const u = users.get(uid);
  return u
    ? userToPublic(u)
    : { id: uid, firstName: "Organizer", neighborhoodId: null, avatarSeed: uid, avatarStyle: "avataaars" };
}

function toCommunityCard(
  community: CommunityRecord,
  viewerId: string,
  users: Awaited<ReturnType<typeof findUsersByIds>>,
): CommunityCardDTO {
  const membership = store.findCommunityMembership(community.id, viewerId);
  const active = store.listActiveCommunityMembers(community.id);
  const ordered = [
    ...active.filter((m) => m.userId === community.organizerId),
    ...active.filter((m) => m.userId !== community.organizerId),
  ];
  return {
    id: community.id,
    name: community.name,
    coverImage: community.coverImage ?? null,
    category: communityCategoriesOf(community)[0]!,
    categories: communityCategoriesOf(community),
    memberCount: community.memberCount,
    isFounding: community.isFounding,
    organizer: organizerPublic(community.organizerId, users),
    myRole: membership?.status === "active" ? membership.role : null,
    myMembershipStatus: membership?.status ?? null,
    hasScreening: !!community.screeningQuestion,
    visibility: community.visibility ?? "everyone",
    memberPreview: ordered.slice(0, 3).map((m) => publicFor(m.userId, users)),
  };
}

/** Approved communities this person actively belongs to. Organizer roles come first. */
export async function communityCardsForUser(userId: string): Promise<CommunityCardDTO[]> {
  const seen = new Set<string>();
  const list: CommunityRecord[] = [];
  for (const membership of store.listCommunityMembershipsForUser(userId)) {
    if (membership.status !== "active" || seen.has(membership.communityId)) continue;
    const community = store.findCommunityById(membership.communityId);
    if (!community || community.creationStatus !== "approved") continue;
    if (isQaOrTestCommunityName(community.name)) continue;
    seen.add(community.id);
    list.push(community);
  }
  list.sort((a, b) => {
    const aOrg = a.organizerId === userId ? 0 : 1;
    const bOrg = b.organizerId === userId ? 0 : 1;
    if (aOrg !== bOrg) return aOrg - bOrg;
    return a.name.localeCompare(b.name);
  });
  return toCommunityCards(list, userId);
}

async function toCommunityCards(
  communities: CommunityRecord[],
  viewerId: string,
): Promise<CommunityCardDTO[]> {
  const ids = new Set<string>();
  for (const c of communities) {
    ids.add(c.organizerId);
    for (const m of store.listActiveCommunityMembers(c.id).slice(0, 6)) {
      ids.add(m.userId);
    }
  }
  const users = await findUsersByIds([...ids]);
  return communities.map((c) => toCommunityCard(c, viewerId, users));
}

function postDTO(
  post: CommunityPostRecord,
  users: Map<string, Awaited<ReturnType<typeof findUserById>>>,
  organizerId: string,
  viewerId: string,
  viewerIsOrganizer: boolean,
  replies: CommunityPostDTO[] = [],
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
    replies,
  };
}

function memberDTO(
  m: CommunityMemberRecord,
  users: Map<string, Awaited<ReturnType<typeof findUserById>>>,
  organizerId: string,
  includeAnswer: boolean,
  viewer?: { id: string; networkIds?: string[]; incomingNetworkRequests?: string[] } | null,
): CommunityMemberDTO {
  const dto: CommunityMemberDTO = {
    user: publicFor(m.userId, users),
    role: m.userId === organizerId ? "organizer" : m.role,
    status: m.status,
    screeningAnswer: includeAnswer ? m.screeningAnswer ?? null : null,
    joinedAt: m.joinedAt,
  };
  if (!viewer || viewer.id === m.userId) return dto;
  const inNetwork = (viewer.networkIds ?? []).includes(m.userId);
  const requestSent = (users.get(m.userId)?.incomingNetworkRequests ?? []).includes(viewer.id);
  const requestReceived = (viewer.incomingNetworkRequests ?? []).includes(m.userId);
  const networkStatus: NetworkLinkStatus = inNetwork ? "connected" : requestSent ? "pending" : "none";
  return {
    ...dto,
    networkStatus,
    networkRequestReceived: !inNetwork && requestReceived,
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
communitiesRouter.get("/", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const list = store
    .listApprovedCommunities()
    .filter((c) => !isQaOrTestCommunityName(c.name))
    .sort((a, b) => {
      if (a.isFounding !== b.isFounding) return a.isFounding ? -1 : 1;
      return b.memberCount - a.memberCount;
    });
  res.json({ communities: await toCommunityCards(list, viewerId) });
});

// GET /api/communities/mine — communities the viewer organizes, is an active
// member of, or has a pending join request for (`myMembershipStatus` distinguishes).
communitiesRouter.get("/mine", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const memberships = store.listCommunityMembershipsForUser(viewerId);
  const list: CommunityRecord[] = [];
  for (const m of memberships) {
    const community = store.findCommunityById(m.communityId);
    if (!community) continue;
    // Show approved communities; also surface the viewer's own pending submissions
    // so a creator sees their in-review community from their profile.
    if (community.creationStatus === "rejected") continue;
    if (community.creationStatus === "pending" && community.organizerId !== viewerId) continue;
    list.push(community);
  }
  res.json({ communities: await toCommunityCards(list, viewerId) });
});

function parseCoverImage(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  if (raw.startsWith("data:image/") && raw.length < 1_600_000) return raw;
  if (raw.startsWith("http")) return raw.slice(0, 2048);
  return null;
}

// POST /api/communities — submit a community for COMMONS admin review.
// Stays off Explore / search until approved.
communitiesRouter.post("/", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const name = String(req.body?.name ?? "").trim().slice(0, 80);
  const description = String(req.body?.description ?? "").trim().slice(0, 2000);
  const categories = parseCommunityCategories(
    req.body?.categories,
    typeof req.body?.category === "string" ? req.body.category : null,
  );
  const coverImage = parseCoverImage(req.body?.coverImage);
  const screeningRaw = req.body?.screeningQuestion;
  const screeningQuestion =
    typeof screeningRaw === "string" && screeningRaw.trim()
      ? screeningRaw.trim().slice(0, 280)
      : null;

  if (!name || !description) {
    res.status(400).json({ error: "Name and description are required" });
    return;
  }
  if (!coverImage) {
    res.status(400).json({ error: "A cover photo is required" });
    return;
  }
  if (categories.length === 0) {
    res.status(400).json({ error: "Pick at least one category (up to 3)" });
    return;
  }
  const cityRaw = req.body?.city;
  const city =
    typeof cityRaw === "string" && cityRaw.trim() ? cityRaw.trim().slice(0, 80) : null;

  const filtered = textBlockedReason(name, description, screeningQuestion, city);
  if (filtered) {
    res.status(400).json({ error: filtered });
    return;
  }

  const community = store.createCommunity({
    name,
    description,
    coverImage,
    category: categories[0]!,
    categories,
    organizerId: userId,
    screeningQuestion,
    city,
    visibility:
      req.body?.visibility === "members_only" ? "members_only" : "everyone",
    creationStatus: "pending",
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

function sharedNetwork(
  a: { networkIds?: string[] } | undefined,
  b: { networkIds?: string[] } | undefined,
): number {
  const mine = new Set(a?.networkIds ?? []);
  if (mine.size === 0) return 0;
  let n = 0;
  for (const id of b?.networkIds ?? []) if (mine.has(id)) n += 1;
  return n;
}

// GET /api/communities/:id/dashboard — organizer metrics, join/post queue, members.
communitiesRouter.get("/:id/dashboard", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const community = store.findCommunityById(String(req.params.id));
  if (!community) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  if (!isCommunityOrganizer(community, viewerId)) {
    res.status(403).json({ error: "Only the organizer can view the dashboard" });
    return;
  }

  const active = store.listActiveCommunityMembers(community.id);
  active.sort((a, b) => {
    if (a.userId === community.organizerId) return -1;
    if (b.userId === community.organizerId) return 1;
    return b.joinedAt.localeCompare(a.joinedAt);
  });
  const pending = store.listPendingCommunityMembers(community.id);
  const posts = store.listPendingCommunityPosts(community.id);
  const users = await findUsersByIds([
    ...active.map((m) => m.userId),
    ...pending.map((m) => m.userId),
    ...posts.map((p) => p.authorId),
    community.organizerId,
  ]);
  const organizer = users.get(community.organizerId);
  const analytics = buildCommunityAnalytics({
    interactions: store.listCommunityInteractions(community.id),
    joinedAt: active.map((m) => m.joinedAt),
  });

  const body: CommunityDashboardDTO = {
    id: community.id,
    name: community.name,
    coverImage: community.coverImage ?? null,
    category: community.category,
    city: community.city ?? null,
    visibility: community.visibility,
    members: community.memberCount,
    ...analytics,
    requests: pending.map((m) => ({
      ...memberDTO(m, users, community.organizerId, true),
      mutualCount: sharedNetwork(organizer, users.get(m.userId)),
    })),
    pendingPosts: posts.map((p) => ({
      id: p.id,
      content: (p.content || (p.image ? "Photo" : "")).replace(/\s+/g, " ").trim().slice(0, 140),
      createdAt: p.createdAt,
      author: publicFor(p.authorId, users),
    })),
    memberList: active.map((m) => memberDTO(m, users, community.organizerId, false, organizer)),
  };
  res.json(body);
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
  if (Array.isArray(req.body?.categories) || typeof req.body?.category === "string") {
    const categories = parseCommunityCategories(
      req.body?.categories,
      typeof req.body?.category === "string" ? req.body.category : null,
    );
    if (categories.length === 0) {
      res.status(400).json({ error: "Pick at least one category (up to 3)" });
      return;
    }
    patch.category = categories[0]!;
    patch.categories = categories;
  }
  if ("coverImage" in (req.body ?? {})) {
    const c = req.body.coverImage;
    if (c === null || c === "") {
      res.status(400).json({ error: "A cover photo is required" });
      return;
    }
    const parsed = parseCoverImage(c);
    if (!parsed) {
      res.status(400).json({ error: "Couldn't use that image. Try another." });
      return;
    }
    patch.coverImage = parsed;
  }
  if ("screeningQuestion" in (req.body ?? {})) {
    const s = req.body.screeningQuestion;
    patch.screeningQuestion =
      typeof s === "string" && s.trim() ? s.trim().slice(0, 280) : null;
  }
  if ("socialLinks" in (req.body ?? {})) {
    const links = parseCommunitySocialLinks(req.body.socialLinks);
    if (links === "invalid") {
      res.status(400).json({ error: "Use a handle for Instagram, TikTok, and Linktree." });
      return;
    }
    patch.socialLinks = links ?? {};
  }
  const filtered = textBlockedReason(
    patch.name,
    patch.description,
    patch.screeningQuestion,
    patch.socialLinks?.instagram,
    patch.socialLinks?.tiktok,
    patch.socialLinks?.linktree,
  );
  if (filtered) {
    res.status(400).json({ error: filtered });
    return;
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
  // A rejected community goes back to the review queue — it does not go live
  // again until an admin approves it.
  if (community.creationStatus === "rejected" && Object.keys(patch).length > 0) {
    patch.creationStatus = "pending";
    patch.rejectionNote = null;
    patch.reviewedAt = null;
    patch.reviewedBy = null;
    patch.submittedAt = new Date().toISOString();
  }
  const updated = store.updateCommunity(community.id, patch) ?? community;
  res.json(await toCommunityDTO(updated, viewerId));
});

// POST /api/communities/:id/join — instant join for public communities.
// Private communities and screening questions create a pending request.
// Being in the organizer's network does not skip approval.
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
  if (communityRequiresJoinApproval(community)) {
    const answer = String(req.body?.screeningAnswer ?? "").trim().slice(0, 1000);
    if (community.screeningQuestion && !answer) {
      res.status(400).json({ error: "Answer the screening question to request to join" });
      return;
    }
    store.upsertCommunityMembership({
      communityId: community.id,
      userId,
      role: "member",
      status: "pending",
      screeningAnswer: answer || null,
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
  const viewer = await findUserById(viewerId);

  res.json({
    members: active.map((m) => memberDTO(m, users, community.organizerId, false, viewer)),
    pending: pending.map((m) => memberDTO(m, users, community.organizerId, true, viewer)),
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
  const posts = store.listCommunityPosts(community.id).filter((p) => {
    if (p.authorId === viewerId) return true;
    if (store.isUserEjected(p.authorId)) return false;
    if (store.isBlockedEitherWay(viewerId, p.authorId)) return false;
    if (store.viewerReportedContent(viewerId, "community_post", p.id)) return false;
    return true;
  });
  function visibleReply(p: CommunityPostRecord): boolean {
    if (p.authorId === viewerId) return true;
    if (store.isUserEjected(p.authorId)) return false;
    if (store.isBlockedEitherWay(viewerId, p.authorId)) return false;
    if (store.viewerReportedContent(viewerId, "community_post", p.id)) return false;
    return true;
  }
  // Authors can see their own pending posts on the feed; organizers get the
  // full pending queue in a separate array for the approval UI.
  const myPending = viewerIsOrganizer
    ? []
    : store.listPendingCommunityPosts(community.id).filter((p) => p.authorId === viewerId);
  const pending = viewerIsOrganizer ? store.listPendingCommunityPosts(community.id) : [];
  const repliesByParent = new Map<string, CommunityPostRecord[]>();
  for (const post of posts) {
    const nested = store.listCommunityPostReplies(community.id, post.id).filter(visibleReply);
    if (nested.length) repliesByParent.set(post.id, nested);
  }
  const allForUsers = [
    ...posts,
    ...myPending,
    ...pending,
    ...[...repliesByParent.values()].flat(),
  ];
  const users = await findUsersByIds(allForUsers.map((p) => p.authorId));
  const toDto = (p: CommunityPostRecord, nested: CommunityPostDTO[] = []) =>
    postDTO(p, users, community.organizerId, viewerId, viewerIsOrganizer, nested);
  res.json({
    posts: [
      ...myPending.map((p) => toDto(p)),
      ...posts.map((p) =>
        toDto(
          p,
          (repliesByParent.get(p.id) ?? []).map((r) => toDto(r)),
        ),
      ),
    ],
    pending: pending.map((p) => toDto(p)),
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
  const parentIdRaw = typeof req.body?.parentId === "string" ? req.body.parentId.trim() : "";
  const mayPost =
    viewerIsOrganizer || (community.bulletinPermission === "members" && isActive);
  const mayReply = Boolean(parentIdRaw) && (viewerIsOrganizer || isActive);
  if (!mayPost && !mayReply) {
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
  const filtered = textBlockedReason(content);
  if (filtered) {
    res.status(400).json({ error: filtered });
    return;
  }
  let parentId: string | null = null;
  if (parentIdRaw) {
    const parent = store.findCommunityPostById(parentIdRaw);
    if (
      !parent ||
      parent.communityId !== community.id ||
      parent.parentId ||
      (parent.approvalStatus ?? "approved") !== "approved"
    ) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    parentId = parent.id;
  }
  // Organizer posts are always live. Member posts wait when approval is required.
  // Replies skip the queue so the thread can actually continue.
  const needsApproval =
    !parentId && !viewerIsOrganizer && (community.bulletinRequiresApproval ?? false);
  const post = store.createCommunityPost({
    communityId: community.id,
    authorId: viewerId,
    content,
    image: parentId ? null : image,
    approvalStatus: needsApproval ? "pending" : "approved",
    parentId,
  });
  if (needsApproval) {
    const author = await findUserById(viewerId);
    try {
      await emit({
        userId: community.organizerId,
        kind: "communityPostPending",
        body: `${author?.firstName || "Someone"} posted in ${community.name} — waiting for your approval`,
        communityId: community.id,
        dedupKey: `communityPostPending:${post.id}`,
      });
    } catch (err) {
      console.error(
        "[communities] post-approval notify failed",
        err instanceof Error ? err.message : err,
      );
    }
  }
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
  if (post.parentId) {
    res.status(400).json({ error: "Replies can't be pinned" });
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
    coverImage: community.coverImage ?? null,
    category: community.category,
  });
});
