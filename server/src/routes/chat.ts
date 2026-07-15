import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import { userToPublic } from "./plans.js";
import { emit } from "../lib/notify.js";
import type { ConversationDTO, ConversationSummaryDTO, MessageDTO, PollDTO } from "../types/shared.js";

export const chatRouter = Router();

// GET /api/conversations — unified inbox: group chats for every plan the user
// is hosting / going to / interested in. Upcoming plans always show; past plans
// only show once there's been real (non-system) chatter.
chatRouter.get("/conversations", requireAuth, (req, res) => {
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

  const summaries: ConversationSummaryDTO[] = [];
  for (const [planId, myRole] of roleByPlan) {
    const plan = store.findPlanById(planId);
    if (!plan) continue;
    const conv = store.findGroupConversationByPlan(planId);
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
      lastMessagePreview: lastMsg
        ? lastMsg.kind === "poll"
          ? `📊 ${truncate(lastMsg.body, 78)}`
          : truncate(lastMsg.body, 80)
        : null,
      unreadCount: conv ? msgs.filter((m) => !m.readBy.includes(userId)).length : 0,
      participantCount,
      myRole,
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
      lastMessagePreview: lastMsg
        ? lastMsg.kind === "poll"
          ? `📊 ${truncate(lastMsg.body, 78)}`
          : truncate(lastMsg.body, 80)
        : null,
      unreadCount: conv ? msgs.filter((m) => !m.readBy.includes(userId)).length : 0,
      participantCount: community.memberCount,
      myRole: community.organizerId === userId ? "hosting" : "going",
      communityId: community.id,
      communityName: community.name,
    });
  }

  // Most recent chatter first; then upcoming-but-quiet plans by date.
  summaries.sort((a, b) => {
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
  if (plan.creatorId === userId) return true;
  const part = store.findParticipation(planId, userId);
  if (part?.state === "going") return true;
  if (part?.state === "interested") return true;
  // Carried-over group members (e.g. a "Do it again" re-plan that brought the
  // previous crew along) already belong to the conversation before they RSVP —
  // let them read the persisted thread.
  const conv = store.findGroupConversationByPlan(planId);
  if (conv?.participantIds.includes(userId)) return true;
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
  const existed = store.findGroupConversationByPlan(planId);
  const alreadyHadUser = existed?.participantIds.includes(userId) ?? false;
  const conv = store.ensureGroupConversation(planId, [plan.creatorId, userId]);

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
  if (!conv.participantIds.includes(userId)) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  const hostId = store.findPlanById(conv.planId)?.creatorId ?? "";
  const raw = store.listMessagesForConversation(convId);
  const messages = await Promise.all(raw.map((m) => toMessageDto(m, userId, hostId)));
  res.json(messages);
});

// POST /api/conversations/:id/messages { body }
chatRouter.post("/conversations/:id/messages", requireAuth, async (req, res) => {
  const convId = String(req.params.id);
  const userId = String(req.userId);
  const body = String(req.body?.body ?? "").trim();
  if (!body) {
    res.status(400).json({ error: "Message body required" });
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
  const message = store.createMessage(convId, userId, body);
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
      await emit({
        userId: recipientId,
        kind: "newGroupChatMessage",
        body: `${senderName} in "${planTitle}": ${truncate(body, 80)}`,
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
  const conv = store.findConversationById(convId);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (!conv.participantIds.includes(userId)) {
    res.status(403).json({ error: "Not a participant" });
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
  const hostId = store.findPlanById(conv.planId)?.creatorId ?? "";
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
  const updated = store.votePoll(msgId, userId, optionId);
  if (!updated || updated.conversationId !== convId) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }
  const hostId = store.findPlanById(conv.planId)?.creatorId ?? "";
  res.json(await toMessageDto(updated, userId, hostId));
});

// POST /api/conversations/:id/messages/:msgId/close-poll
// Only the poll's author or the plan host can freeze results.
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
  const hostId = store.findPlanById(conv.planId)?.creatorId ?? "";
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
// Mirror of close-poll: only the poll's author or the plan host can re-open it.
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
  const hostId = store.findPlanById(conv.planId)?.creatorId ?? "";
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

async function toConversationDto(
  conv: NonNullable<ReturnType<typeof store.findConversationById>>,
  _viewerId: string,
): Promise<ConversationDTO> {
  const messages = store.listMessagesForConversation(conv.id);
  const users = await findUsersByIds(conv.participantIds);
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
