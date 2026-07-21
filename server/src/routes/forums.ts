import { Router } from "express";
import { isAdminPhone } from "../lib/adminPhones.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { store, type ForumPostRecord, type ForumReplyRecord } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import { userToPublic } from "./plans.js";
import {
  ALL_INTERESTS,
  INTEREST_EMOJI,
  INTEREST_LABELS,
  type ForumPostDTO,
  type ForumReplyDTO,
  type ForumSort,
  type ForumSummaryDTO,
  type InterestTag,
  type PublicUser,
} from "../types/shared.js";

export const forumsRouter = Router();

const MAX_POST_LENGTH = 4000;
const MAX_REPLY_LENGTH = 2000;
const PREVIEW_LENGTH = 140;

function isInterestTag(value: string): value is InterestTag {
  return (ALL_INTERESTS as string[]).includes(value);
}

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

function postDTO(
  post: ForumPostRecord,
  users: Map<string, Awaited<ReturnType<typeof findUserById>>>,
  viewerId: string,
  viewerIsAdmin: boolean,
): ForumPostDTO {
  return {
    id: post.id,
    interestTag: post.interestTag,
    author: publicFor(post.authorId, users),
    content: post.content,
    imageUrl: post.imageUrl ?? null,
    isSponsored: post.isSponsored,
    sponsorName: post.sponsorName ?? null,
    createdAt: post.createdAt,
    replyCount: post.replyCount,
    likeCount: post.likeCount,
    likedByMe: store.hasLikedPost(post.id, viewerId),
    canDelete: viewerIsAdmin || post.authorId === viewerId,
  };
}

function replyDTO(reply: ForumReplyRecord, users: Map<string, Awaited<ReturnType<typeof findUserById>>>): ForumReplyDTO {
  return {
    id: reply.id,
    postId: reply.postId,
    author: publicFor(reply.authorId, users),
    content: reply.content,
    createdAt: reply.createdAt,
  };
}

function parseSort(raw: unknown): ForumSort {
  return raw === "popular" ? "popular" : "recent";
}

// GET /api/forums — forums the viewer has joined, most recently joined first.
forumsRouter.get("/", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  store.ensureForumsForInterests();
  const forums = store.listForumsForUser(viewerId);
  const authorIds = forums.map((f) => f.latestPost?.authorId).filter((id): id is string => !!id);
  const users = await findUsersByIds(authorIds);
  const dtos: ForumSummaryDTO[] = forums.map((f) => ({
    interestTag: f.interestTag,
    label: INTEREST_LABELS[f.interestTag],
    emoji: INTEREST_EMOJI[f.interestTag],
    latestPost: f.latestPost
      ? {
          authorName: users.get(f.latestPost.authorId)?.firstName || "Someone",
          preview: f.latestPost.content.slice(0, PREVIEW_LENGTH),
          createdAt: f.latestPost.createdAt,
        }
      : null,
    hasUnread: false,
  }));
  res.json({ forums: dtos });
});

// POST /api/forums/:tag/join
forumsRouter.post("/:tag/join", requireAuth, (req, res) => {
  const viewerId = String(req.userId);
  const tag = String(req.params.tag);
  if (!isInterestTag(tag)) {
    res.status(400).json({ error: "Unknown interest" });
    return;
  }
  store.ensureForumsForInterests();
  store.joinForum(viewerId, tag);
  res.json({ ok: true });
});

// POST /api/forums/:tag/leave — does not remove the interest from the profile.
forumsRouter.post("/:tag/leave", requireAuth, (req, res) => {
  const viewerId = String(req.userId);
  const tag = String(req.params.tag);
  if (!isInterestTag(tag)) {
    res.status(400).json({ error: "Unknown interest" });
    return;
  }
  store.leaveForum(viewerId, tag);
  res.json({ ok: true });
});

// GET /api/forums/:tag/posts?sort=recent|popular
forumsRouter.get("/:tag/posts", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const tag = String(req.params.tag);
  if (!isInterestTag(tag)) {
    res.status(400).json({ error: "Unknown interest" });
    return;
  }
  const sort = parseSort(req.query.sort);
  const posts = store.listPosts(tag, sort);
  const users = await findUsersByIds(posts.map((p) => p.authorId));
  const viewerIsAdmin = await isCommonsAdmin(viewerId);
  res.json({
    interestTag: tag,
    label: INTEREST_LABELS[tag],
    emoji: INTEREST_EMOJI[tag],
    posts: posts.map((p) => postDTO(p, users, viewerId, viewerIsAdmin)),
  });
});

// POST /api/forums/:tag/posts — { content, imageUrl? }
forumsRouter.post("/:tag/posts", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const tag = String(req.params.tag);
  if (!isInterestTag(tag)) {
    res.status(400).json({ error: "Unknown interest" });
    return;
  }
  const content = String(req.body?.content ?? "").trim().slice(0, MAX_POST_LENGTH);
  const rawImage = typeof req.body?.imageUrl === "string" ? req.body.imageUrl : "";
  const imageUrl =
    rawImage.startsWith("data:image/") && rawImage.length < 1_600_000
      ? rawImage
      : rawImage.startsWith("http")
        ? rawImage.slice(0, 2048)
        : null;
  if (!content && !imageUrl) {
    res.status(400).json({ error: "Write something to post" });
    return;
  }
  // Sponsored posting is a V1 stub — no client UI submits it yet, but the
  // field is wired through so a future host-tools surface can flip it on.
  const isSponsored = Boolean(req.body?.isSponsored);
  const sponsorName =
    isSponsored && typeof req.body?.sponsorName === "string"
      ? req.body.sponsorName.trim().slice(0, 120) || null
      : null;

  store.ensureForumsForInterests();
  store.joinForum(viewerId, tag); // posting to a forum implicitly joins it
  const post = store.createPost({
    interestTag: tag,
    authorId: viewerId,
    content,
    imageUrl,
    isSponsored,
    sponsorName,
  });
  const users = await findUsersByIds([post.authorId]);
  store.log("forum_post_created", { interestTag: tag, postId: post.id });
  res.status(201).json(postDTO(post, users, viewerId, await isCommonsAdmin(viewerId)));
});

// GET /api/forums/posts/:postId — post + flat replies
forumsRouter.get("/posts/:postId", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const post = store.findForumPostById(String(req.params.postId));
  if (!post || post.approvalStatus !== "approved") {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const replies = store.listReplies(post.id);
  const userIds = [post.authorId, ...replies.map((r) => r.authorId)];
  const users = await findUsersByIds(userIds);
  const viewerIsAdmin = await isCommonsAdmin(viewerId);
  res.json({
    post: postDTO(post, users, viewerId, viewerIsAdmin),
    replies: replies.map((r) => replyDTO(r, users)),
  });
});

// POST /api/forums/posts/:postId/replies — { content }
forumsRouter.post("/posts/:postId/replies", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const post = store.findForumPostById(String(req.params.postId));
  if (!post || post.approvalStatus !== "approved") {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const content = String(req.body?.content ?? "").trim().slice(0, MAX_REPLY_LENGTH);
  if (!content) {
    res.status(400).json({ error: "Write a reply" });
    return;
  }
  const reply = store.createReply(post.id, viewerId, content);
  if (!reply) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const users = await findUsersByIds([reply.authorId]);
  res.status(201).json(replyDTO(reply, users));
});

// POST /api/forums/posts/:postId/like — toggle
forumsRouter.post("/posts/:postId/like", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const postId = String(req.params.postId);
  const post = store.findForumPostById(postId);
  if (!post || post.approvalStatus !== "approved") {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const updated = store.toggleLike(postId, viewerId);
  if (!updated) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const users = await findUsersByIds([updated.authorId]);
  res.json(postDTO(updated, users, viewerId, await isCommonsAdmin(viewerId)));
});

// DELETE /api/forums/posts/:postId — author or COMMONS admin only.
forumsRouter.delete("/posts/:postId", requireAuth, async (req, res) => {
  const viewerId = String(req.userId);
  const post = store.findForumPostById(String(req.params.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const viewerIsAdmin = await isCommonsAdmin(viewerId);
  if (!viewerIsAdmin && post.authorId !== viewerId) {
    res.status(403).json({ error: "You can only delete your own posts" });
    return;
  }
  store.deleteForumPost(post.id);
  res.json({ ok: true });
});
