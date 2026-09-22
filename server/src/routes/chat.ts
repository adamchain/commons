import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import type { ConversationRecord } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import { userToPublic } from "./plans.js";
import { emit } from "../lib/notify.js";
import {
  communityCreationBlockReason,
  communityMembershipBlockReason,
  isCommunityOrganizer,
} from "../lib/communityAccess.js";
import { isGcsConfigured, parseDataUrl, uploadCardImage } from "../lib/gcs.js";
import { textBlockedReason } from "../lib/contentFilter.js";
import { planVisibleToViewer } from "../lib/feedScope.js";
import { planHasEnded } from "../lib/planTime.js";
import type { ConversationDTO, ConversationSummaryDTO, MessageDTO, PollDTO } from "../types/shared.js";

const MAX_CHAT_IMAGE_CHARS = 1_600_000;

function messagePreview(msg: { kind?: string; body: string; imageUrl?: string | null }): string {
  if (msg.kind === "poll") return `📊 ${truncate(msg.body, 78)}`;
  if (msg.imageUrl) {
    const caption = msg.body.trim();
    if (!caption || caption === "📷 Photo") return "📷 Photo";
    return `📷 ${truncate(caption, 78)}`;
  }
  return truncate(msg.body, 80);
}

function lastSenderName(msg: { senderId: string; kind?: string } | null): string | null {
  if (!msg || msg.kind === "system") return null;
  const name = store.findUserById(msg.senderId)?.firstName?.trim();
  return name || null;
}

async function resolveChatImageUrl(raw: string): Promise<string | null> {
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.slice(0, 2048);
  }
  if (!raw.startsWith("data:image/") || raw.length >= MAX_CHAT_IMAGE_CHARS) return null;
  if (isGcsConfigured()) {
    const parsed = parseDataUrl(raw);
    if (parsed) {
      try {
        return await uploadCardImage(parsed.buffer, parsed.contentType, "chat-images");
      } catch (err) {
        console.error("[chat] image GCS upload failed; storing inline", err);
      }
    }
  }
  return raw;
}

export const chatRouter = Router();

// For community group chats, being present in `participantIds` is not enough to
// keep writing — a user can be in the roster yet no longer be an active member
// (pending, removed, or a drift between roster and membership). Also apply the
// same pending-review gate as bulletin: organizers may write while pending;
// other members cannot. Plan chats have no community and pass straight through.
// Returns a 403 message when blocked, else null.
function communityPostBlockReason(
  conv: ConversationRecord,
  userId: string,
): string | null {
  if (!conv.communityId) return null;
  const community = store.findCommunityById(conv.communityId);
  const creationBlocked = communityCreationBlockReason(community, userId);
  if (creationBlocked) return creationBlocked;
  return communityMembershipBlockReason(community, userId);
}

// POST /api/dm { userId } — open or create a direct chat with someone in your network.
chatRouter.post("/dm", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const otherId = String(req.body?.userId ?? "").trim();
  if (!otherId || otherId === userId) {
    res.status(400).json({ error: "Pick someone else to message." });
    return;
  }
  const [me, other] = await Promise.all([findUserById(userId), findUserById(otherId)]);
  if (!me || !other) {
    res.status(404).json({ error: "Couldn't find that person." });
    return;
  }
  if (store.isBlockedEitherWay(userId, otherId)) {
    res.status(403).json({ error: "You can't message this person." });
    return;
  }
  if (!(me.networkIds ?? []).includes(otherId)) {
    res.status(403).json({ error: "Add them to your network before messaging." });
    return;
  }
  const conv = store.ensureDirectDm(userId, otherId);
  res.json(await toConversationDto(conv, userId));
});

// GET /api/conversations — unified inbox: plan chats, community chats, and
// network DMs. Upcoming plans always show; past plans only show once there's
// been real (non-system) chatter.
chatRouter.get("/conversations", requireAuth, async (req, res) => {
  const userId = String(req.userId);
  const todayIso = new Date().toISOString().slice(0, 10);

  // role per accessible plan — hosting wins over participation.
  const roleByPlan = new Map<string, ConversationSummaryDTO["myRole"]>();
  for (const plan of store.listPlans()) {
    if (plan.creatorId === userId && !plan.cancelledAt) roleByPlan.set(plan.id, "hosting");
  }
  for (const part of store.listParticipationsForUser(userId)) {
    if (roleByPlan.has(part.planId)) continue;
    if (part.state !== "going" && part.state !== "interested") continue;
    const plan = store.findPlanById(part.planId);
    if (plan && !plan.cancelledAt) roleByPlan.set(part.planId, part.state);
  }

  const pinRank = new Map(store.pinnedConversationIds(userId).map((id, i) => [id, i]));
  const summaries: ConversationSummaryDTO[] = [];
  for (const [planId, myRole] of roleByPlan) {
    const plan = store.findPlanById(planId);
    if (!plan) continue;
    if (plan.creatorId !== userId && store.isBlockedEitherWay(userId, plan.creatorId)) continue;
    const conv = store.findGroupConversationByPlan(planId);
    if (conv && store.hasLeftConversation(userId, conv.id)) continue;
    // If a conversation exists but the user explicitly left it, keep it out of
    // their inbox even though they're still on the plan.
    if (conv && !conv.participantIds.includes(userId)) continue;
    const msgs = conv ? store.listMessagesForConversation(conv.id) : [];
    const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
    const hasRealChatter = msgs.some((m) => m.kind !== "system");
    const isUpcoming = (plan.date ?? "") >= todayIso;
    if (!isUpcoming && !hasRealChatter) continue;

    const participantCount =
      store
        .listParticipationsForPlan(planId)
        .filter((p) => (p.state === "going" || p.state === "interested") && p.userId !== plan.creatorId)
        .length + 1;

    summaries.push({
      planId,
      planTitle: plan.title,
      hostEmoji: plan.hostEmoji,
      planDate: plan.date,
      conversationId: conv?.id ?? null,
      lastMessageAt: conv && msgs.length ? conv.lastMessageAt : null,
      lastMessagePreview: lastMsg ? messagePreview(lastMsg) : null,
      lastMessageSender: lastSenderName(lastMsg),
      unreadCount: conv ? msgs.filter((m) => !m.readBy.includes(userId)).length : 0,
      participantCount,
      myRole,
      coverImage: plan.flyerDataUrl ?? plan.flyerLinkPreview?.image ?? null,
      isIdea: plan.planKind === "looking_for" && !plan.lockedAt,
      pinned: conv ? pinRank.has(conv.id) : false,
    });
  }

  // Community group chats — one persistent thread per community the user is an
  // active member of (and chat is enabled). They ride the same inbox as plan
  // chats but link to the community page.
  for (const membership of store.listCommunityMembershipsForUser(userId)) {
    if (membership.status !== "active") continue;
    const community = store.findCommunityById(membership.communityId);
    if (!community || !community.chatEnabled || community.creationStatus !== "approved") continue;
    const conv = store.findCommunityConversation(community.id);
    if (conv && store.hasLeftConversation(userId, conv.id)) continue;
    if (conv && !conv.participantIds.includes(userId)) continue;
    const msgs = conv ? store.listMessagesForConversation(conv.id) : [];
    const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
    summaries.push({
      planId: "",
      planTitle: community.name,
      hostEmoji: "🏙️",
      planDate: community.createdAt.slice(0, 10),
      conversationId: conv?.id ?? null,
      lastMessageAt: conv && msgs.length ? conv.lastMessageAt : null,
      lastMessagePreview: lastMsg ? messagePreview(lastMsg) : null,
      lastMessageSender: lastSenderName(lastMsg),
      unreadCount: conv ? msgs.filter((m) => !m.readBy.includes(userId)).length : 0,
      participantCount: community.memberCount,
      myRole: community.organizerId === userId ? "hosting" : "going",
      communityId: community.id,
      communityName: community.name,
      coverImage: community.coverImage ?? null,
      pinned: conv ? pinRank.has(conv.id) : false,
    });
  }

  for (const conv of store.listDirectDms(userId)) {
    if (store.hasLeftConversation(userId, conv.id)) continue;
    if (!conv.participantIds.includes(userId)) continue;
    const otherId = conv.participantIds.find((id) => id !== userId);
    if (!otherId || store.isBlockedEitherWay(userId, otherId)) continue;
    const other = await findUserById(otherId);
    const msgs = store.listMessagesForConversation(conv.id);
    const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
    const name = [other?.firstName, other?.lastName].filter(Boolean).join(" ") || "Message";
    summaries.push({
      planId: "",
      planTitle: name,
      hostEmoji: "💬",
      planDate: conv.createdAt.slice(0, 10),
      conversationId: conv.id,
      lastMessageAt: msgs.length ? conv.lastMessageAt : null,
      lastMessagePreview: lastMsg ? messagePreview(lastMsg) : null,
      lastMessageSender: lastSenderName(lastMsg),
      unreadCount: msgs.filter((m) => !m.readBy.includes(userId)).length,
      participantCount: 2,
      myRole: "going",
      dmUserId: otherId,
      coverImage: other?.avatarPhotoDataUrl ?? null,
      pinned: pinRank.has(conv.id),
    });
  }

  // Pinned threads stay at the top (most recently pinned first). Everything
  // else is most recent chatter, then upcoming-but-quiet plans by date.
  summaries.sort((a, b) => {
    const aPin = a.conversationId != null ? pinRank.get(a.conversationId) : undefined;
    const bPin = b.conversationId != null ? pinRank.get(b.conversationId) : undefined;
    const aPinned = aPin !== undefined;
    const bPinned = bPin !== undefined;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned && aPin !== bPin) return aPin - bPin;
    if (a.lastMessageAt && b.lastMessageAt) return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return a.planDate < b.planDate ? -1 : 1;
  });

  res.json(summaries);
});

function canAccessPlanGroupChat(planId: string, userId: string): boolean {
  const plan = store.findPlanById(planId);
  if (!plan) return false;
  const me = store.findUserById(userId);
  if (!me) return false;
  return planVisibleToViewer(plan, me);
}

function canReadConversation(conv: ConversationRecord, userId: string): boolean {
  if (conv.participantIds.includes(userId)) return true;
  if (conv.planId) return canAccessPlanGroupChat(conv.planId, userId);
  return false;
}

// GET /api/plans/:planId/conversation — group thread for the plan (no DMs in v1)
chatRouter.get("/plans/:planId/conversation", requireAuth, async (req, res) => {
  const planId = String(req.params.planId);
  const userId = String(req.userId);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  if (!canAccessPlanGroupChat(planId, userId)) {
    res.status(403).json({ error: "Join the plan to access chat" });
    return;
  }
  // Plan-detail preview uses ?join=0 so just looking at a plan doesn't dump
  // the viewer into the inbox. Opening the full thread (default) still joins.
  const join = String(req.query.join ?? "1") !== "0";
  const existed = store.findGroupConversationByPlan(planId);
  const alreadyHadUser = existed?.participantIds.includes(userId) ?? false;
  if (!join) {
    const conv = store.ensureGroupConversation(planId, [plan.creatorId]);
    res.json(await toConversationDto(conv, userId));
    return;
  }
  // Opening chat intentionally rejoins after an inbox leave.
  if (existed) store.setConversationLeft(userId, existed.id, false);
  const conv = store.ensureGroupConversation(planId, [plan.creatorId, userId], {
    rejoinIds: [userId],
  });

  // First non-creator joiner: drop a one-time welcome so the thread feels alive.
  if (!alreadyHadUser && userId !== plan.creatorId) {
    const hasUserMsgs = store.listMessagesForConversation(conv.id).some((m) => m.kind === "user");
    if (!hasUserMsgs) {
      const host = await findUserById(plan.creatorId);
      const hostName = host?.firstName || "the host";
      const joiner = await findUserById(userId);
      const joinerName = joiner?.firstName || "Someone";
      store.createSystemMessage(
        conv.id,
        `${joinerName} joined — say hi to the group. ${hostName} is here too.`,
      );
    }
  }

  res.json(await toConversationDto(conv, userId));
});

// GET /api/conversations/:id/messages
chatRouter.get("/conversations/:id/messages", requireAuth, async (req, res) => {
  const convId = String(req.params.id);
  const userId = String(req.userId);
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!canReadConversation(conv, userId)) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  const hostId = conversationHostId(conv);
  const raw = store.listMessagesForConversation(convId).filter((m) => {
    if (m.kind === "system") return true;
    if (m.senderId === userId) return true;
    if (store.isUserEjected(m.senderId)) return false;
    if (store.isBlockedEitherWay(userId, m.senderId)) return false;
    if (store.viewerReportedContent(userId, "message", m.id)) return false;
    return true;
  });
  const messages = await Promise.all(raw.map((m) => toMessageDto(m, userId, hostId)));
  res.json(messages);
});

// POST /api/conversations/:id/messages { body?, imageUrl? }
chatRouter.post("/conversations/:id/messages", requireAuth, async (req, res) => {
  const convId = String(req.params.id);
  const userId = String(req.userId);
  const body = String(req.body?.body ?? "").trim().slice(0, 2000);
  const rawImage = typeof req.body?.imageUrl === "string" ? req.body.imageUrl : "";
  const imageUrl = rawImage ? await resolveChatImageUrl(rawImage) : null;
  if (rawImage && !imageUrl) {
    res.status(400).json({ error: "Couldn't use that image. Try a smaller photo." });
    return;
  }
  if (!body && !imageUrl) {
    res.status(400).json({ error: "Message body required" });
    return;
  }
  const filtered = textBlockedReason(body);
  if (filtered) {
    res.status(400).json({ error: filtered });
    return;
  }
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!conv.participantIds.includes(userId)) {
    if (conv.planId && canAccessPlanGroupChat(conv.planId, userId)) {
      store.ensureGroupConversation(conv.planId, [userId], { rejoinIds: [userId] });
    } else {
      res.status(403).json({ error: "Not a participant" });
      return;
    }
  }
  if (conv.type === "dm") {
    const otherId = conv.participantIds.find((id) => id !== userId);
    if (otherId && store.isBlockedEitherWay(userId, otherId)) {
      res.status(403).json({ error: "You can't message this person" });
      return;
    }
  }
  const blocked = communityPostBlockReason(conv, userId);
  if (blocked) {
    res.status(403).json({ error: blocked });
    return;
  }
  // Image-only messages get a placeholder body so inbox previews + notifications
  // stay readable without poll/image-specific branching everywhere.
  const storedBody = body || (imageUrl ? "📷 Photo" : "");
  const message = store.createMessage(convId, userId, storedBody, imageUrl);
  // Notify every other group participant. Group chat only — DM rooms collapse
  // unread to a single signal that's already in conversation lists.
  if (conv.type === "group") {
    const sender = await findUserById(userId);
    const senderName = sender?.firstName || "Someone";
    const plan = store.findPlanById(conv.planId);
    const planTitle = plan?.title ?? "your plan";
    // Dedup per (conversation, recipient) — one "new message" until the user
    // reads. Once they mark notifications read, dedup advances by message id.
    for (const recipientId of conv.participantIds) {
      if (recipientId === userId) continue;
      if (store.isBlockedEitherWay(userId, recipientId)) continue;
      await emit({
        userId: recipientId,
        kind: "newGroupChatMessage",
        body: `${senderName} in "${planTitle}": ${messagePreview(message)}`,
        planId: conv.planId,
        conversationId: convId,
        dedupKey: `newGroupChatMessage:${message.id}:${recipientId}`,
      });
    }
  }
  res.status(201).json(await toMessageDto(message, userId));
});

// POST /api/conversations/:id/polls { question, options: string[] }
// Any participant can post a poll. The question doubles as the message body so
// it flows through inbox previews + notifications like a normal message.
chatRouter.post("/conversations/:id/polls", requireAuth, async (req, res) => {
  const convId = String(req.params.id);
  const userId = String(req.userId);
  const question = String(req.body?.question ?? "").trim();
  const rawOptions = Array.isArray(req.body?.options) ? req.body.options : [];
  const options = rawOptions
    .map((o: unknown) => String(o ?? "").trim())
    .filter((o: string) => o.length > 0)
    .slice(0, 6);
  if (!question) {
    res.status(400).json({ error: "Poll question required" });
    return;
  }
  if (options.length < 2) {
    res.status(400).json({ error: "Add at least two options" });
    return;
  }
  const filtered = textBlockedReason(question, ...options);
  if (filtered) {
    res.status(400).json({ error: filtered });
    return;
  }
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!conv.participantIds.includes(userId)) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  const blocked = communityPostBlockReason(conv, userId);
  if (blocked) {
    res.status(403).json({ error: blocked });
    return;
  }
  const message = store.createPollMessage(convId, userId, question, options);
  if (conv.type === "group") {
    const sender = await findUserById(userId);
    const senderName = sender?.firstName || "Someone";
    const plan = store.findPlanById(conv.planId);
    const planTitle = plan?.title ?? "your plan";
    for (const recipientId of conv.participantIds) {
      if (recipientId === userId) continue;
      if (store.isBlockedEitherWay(userId, recipientId)) continue;
      await emit({
        userId: recipientId,
        kind: "newGroupChatMessage",
        body: `${senderName} posted a poll in "${planTitle}": ${truncate(question, 70)}`,
        planId: conv.planId,
        conversationId: convId,
        dedupKey: `newGroupChatMessage:${message.id}:${recipientId}`,
      });
    }
  }
  const hostId = conversationHostId(conv);
  res.status(201).json(await toMessageDto(message, userId, hostId));
});

// POST /api/conversations/:id/messages/:msgId/vote { optionId }
chatRouter.post("/conversations/:id/messages/:msgId/vote", requireAuth, async (req, res) => {
  const convId = String(req.params.id);
  const msgId = String(req.params.msgId);
  const userId = String(req.userId);
  const optionId = String(req.body?.optionId ?? "");
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!conv.participantIds.includes(userId)) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  const blocked = communityPostBlockReason(conv, userId);
  if (blocked) {
    res.status(403).json({ error: blocked });
    return;
  }
  const updated = store.votePoll(msgId, userId, optionId);
  if (!updated || updated.conversationId !== convId) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }
  const hostId = conversationHostId(conv);
  res.json(await toMessageDto(updated, userId, hostId));
});

// POST /api/conversations/:id/messages/:msgId/close-poll
// Only the poll's author or the plan host / community organizer can freeze results.
chatRouter.post("/conversations/:id/messages/:msgId/close-poll", requireAuth, async (req, res) => {
  const convId = String(req.params.id);
  const msgId = String(req.params.msgId);
  const userId = String(req.userId);
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!conv.participantIds.includes(userId)) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  const existing = store.findMessageById(msgId);
  if (!existing || existing.conversationId !== convId || existing.kind !== "poll") {
    res.status(404).json({ error: "Poll not found" });
    return;
  }
  const hostId = conversationHostId(conv);
  if (userId !== existing.senderId && userId !== hostId) {
    res.status(403).json({ error: "Only the poll's author or the host can close it" });
    return;
  }
  const updated = store.closePoll(msgId);
  if (!updated) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }
  res.json(await toMessageDto(updated, userId, hostId));
});

// POST /api/conversations/:id/messages/:msgId/reopen-poll
// Mirror of close-poll: only the poll's author or the plan host / community organizer can re-open it.
chatRouter.post("/conversations/:id/messages/:msgId/reopen-poll", requireAuth, async (req, res) => {
  const convId = String(req.params.id);
  const msgId = String(req.params.msgId);
  const userId = String(req.userId);
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!conv.participantIds.includes(userId)) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  const existing = store.findMessageById(msgId);
  if (!existing || existing.conversationId !== convId || existing.kind !== "poll") {
    res.status(404).json({ error: "Poll not found" });
    return;
  }
  const hostId = conversationHostId(conv);
  if (userId !== existing.senderId && userId !== hostId) {
    res.status(403).json({ error: "Only the poll's author or the host can re-open it" });
    return;
  }
  const updated = store.reopenPoll(msgId);
  if (!updated) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }
  res.json(await toMessageDto(updated, userId, hostId));
});

// POST /api/conversations/:id/clear — wipe a thread for everyone.
// Community group chats: the organizer, any time.
// Plan chats: the host, or that plan's community organizer, only after the plan.
chatRouter.post("/conversations/:id/clear", requireAuth, (req, res) => {
  const convId = String(req.params.id);
  const userId = String(req.userId);
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (conv.communityId) {
    const community = store.findCommunityById(conv.communityId);
    if (!community || !isCommunityOrganizer(community, userId)) {
      res.status(403).json({ error: "Only the organizer can delete this chat for everyone" });
      return;
    }
    store.clearConversationMessages(convId);
    store.createSystemMessage(convId, "The organizer cleared this chat for everyone.");
    res.json({ ok: true });
    return;
  }
  const plan = conv.planId ? store.findPlanById(conv.planId) : undefined;
  if (!plan) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!plan.cancelledAt && !planHasEnded(plan)) {
    res.status(403).json({ error: "You can delete this chat for everyone after the plan" });
    return;
  }
  const planCommunity = plan.communityId ? store.findCommunityById(plan.communityId) : undefined;
  const allowed =
    plan.creatorId === userId ||
    (planCommunity ? isCommunityOrganizer(planCommunity, userId) : false);
  if (!allowed) {
    res.status(403).json({ error: "Only the host can delete this chat for everyone" });
    return;
  }
  store.clearConversationMessages(convId);
  store.createSystemMessage(convId, "The host cleared this chat for everyone.");
  res.json({ ok: true });
});

// POST /api/conversations/:id/leave — drop yourself from a group chat. Works
// any time, including after the event. You stay on the plan; the chat just
// leaves your Messages inbox.
chatRouter.post("/conversations/:id/leave", requireAuth, (req, res) => {
  const convId = String(req.params.id);
  const userId = String(req.userId);
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  store.removeConversationParticipant(convId, userId);
  res.json({ ok: true });
});

// POST /api/conversations/:id/pin { pinned: boolean } — keep this thread at the
// top of the viewer's inbox. Toggle-only; body is optional (defaults to
// flipping the current state). Most recently pinned lands first.
chatRouter.post("/conversations/:id/pin", requireAuth, (req, res) => {
  const convId = String(req.params.id);
  const userId = String(req.userId);
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!conv.participantIds.includes(userId)) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  const next =
    typeof req.body?.pinned === "boolean" ? req.body.pinned : !store.isConversationPinned(userId, convId);
  store.setConversationPinned(userId, convId, next);
  res.json({ ok: true, pinned: next });
});

// POST /api/conversations/:id/mute { muted: boolean } — quiets notifications
// for this thread without leaving it. Toggle-only; body is optional (defaults
// to flipping the current state).
chatRouter.post("/conversations/:id/mute", requireAuth, (req, res) => {
  const convId = String(req.params.id);
  const userId = String(req.userId);
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!conv.participantIds.includes(userId)) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  const next =
    typeof req.body?.muted === "boolean" ? req.body.muted : !store.isConversationMuted(userId, convId);
  store.setConversationMuted(userId, convId, next);
  res.json({ ok: true, muted: next });
});

// POST /api/conversations/:id/messages/:msgId/react { emoji }
// Toggle the caller's reaction on a message. Only ❤️ is offered today, but the
// store handles any emoji so the UI can grow.
chatRouter.post("/conversations/:id/messages/:msgId/react", requireAuth, async (req, res) => {
  const convId = String(req.params.id);
  const msgId = String(req.params.msgId);
  const userId = String(req.userId);
  const emoji = String(req.body?.emoji ?? "❤️").slice(0, 8) || "❤️";
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!conv.participantIds.includes(userId)) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  const blocked = communityPostBlockReason(conv, userId);
  if (blocked) {
    res.status(403).json({ error: blocked });
    return;
  }
  const updated = store.toggleReaction(msgId, userId, emoji);
  if (!updated || updated.conversationId !== convId) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  res.json(await toMessageDto(updated));
});

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function viewerCanClearConversation(
  conv: NonNullable<ReturnType<typeof store.findConversationById>>,
  viewerId: string,
): boolean {
  if (conv.communityId) {
    const community = store.findCommunityById(conv.communityId);
    return !!community && isCommunityOrganizer(community, viewerId);
  }
  const plan = conv.planId ? store.findPlanById(conv.planId) : undefined;
  if (!plan || (!plan.cancelledAt && !planHasEnded(plan))) return false;
  if (plan.creatorId === viewerId) return true;
  const planCommunity = plan.communityId ? store.findCommunityById(plan.communityId) : undefined;
  return !!planCommunity && isCommunityOrganizer(planCommunity, viewerId);
}

function conversationHostId(
  conv: NonNullable<ReturnType<typeof store.findConversationById>>,
): string {
  if (conv.communityId) {
    return store.findCommunityById(conv.communityId)?.organizerId ?? "";
  }
  return store.findPlanById(conv.planId)?.creatorId ?? "";
}

async function toConversationDto(
  conv: NonNullable<ReturnType<typeof store.findConversationById>>,
  _viewerId: string,
): Promise<ConversationDTO> {
  const messages = store.listMessagesForConversation(conv.id);
  const users = await findUsersByIds(conv.participantIds);
  const hostId = conversationHostId(conv);
  return {
    id: conv.id,
    planId: conv.planId,
    type: conv.type,
    participants: conv.participantIds.map((id) => {
      const u = users.get(id);
      return u
        ? userToPublic(u)
        : { id, firstName: "Former member", neighborhoodId: null, avatarSeed: id, avatarStyle: "avataaars" as const };
    }),
    lastMessageAt: conv.lastMessageAt,
    unreadCount: messages.filter((m) => !m.readBy.includes(_viewerId)).length,
    muted: store.isConversationMuted(_viewerId, conv.id),
    isHost: hostId === _viewerId,
    hostId,
    canClearForEveryone: viewerCanClearConversation(conv, _viewerId),
  };
}

async function toMessageDto(
  m: ReturnType<typeof store.listMessagesForConversation>[number],
  viewerId = "",
  hostId = "",
): Promise<MessageDTO> {
  if (m.kind === "system") {
    return {
      id: m.id,
      conversationId: m.conversationId,
      kind: "system",
      body: m.body,
      createdAt: m.createdAt,
    };
  }
  const sender = await findUserById(m.senderId);
  const senderPublic = sender
    ? userToPublic(sender)
    : { id: m.senderId, firstName: "Former member", neighborhoodId: null, avatarSeed: m.senderId, avatarStyle: "avataaars" as const };

  if (m.kind === "poll" && m.poll) {
    return {
      id: m.id,
      conversationId: m.conversationId,
      kind: "poll",
      sender: senderPublic,
      body: m.body,
      createdAt: m.createdAt,
      poll: pollToDto(m.poll, m.senderId, viewerId, hostId),
    };
  }

  return {
    id: m.id,
    conversationId: m.conversationId,
    kind: "user",
    sender: senderPublic,
    body: m.body,
    createdAt: m.createdAt,
    reactions: m.reactions ?? {},
    ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
  };
}

function pollToDto(
  poll: NonNullable<ReturnType<typeof store.listMessagesForConversation>[number]["poll"]>,
  authorId: string,
  viewerId: string,
  hostId: string,
): PollDTO {
  const voters = new Set<string>();
  let myVote: string | null = null;
  const options = poll.options.map((o) => {
    const voterIds = poll.votes[o.id] ?? [];
    for (const v of voterIds) voters.add(v);
    if (voterIds.includes(viewerId)) myVote = o.id;
    return { id: o.id, text: o.text, voterIds };
  });
  return {
    question: poll.question,
    options,
    closed: poll.closed,
    totalVotes: voters.size,
    myVote,
    canClose: viewerId === authorId || viewerId === hostId,
  };
}
