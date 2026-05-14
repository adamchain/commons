import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import { findUserById, findUsersByIds } from "../userRepo.js";
import { userToPublic } from "./plans.js";
import type { ConversationDTO, MessageDTO } from "../types/shared.js";

export const chatRouter = Router();

function canAccessPlanGroupChat(planId: string, userId: string): boolean {
  const plan = store.findPlanById(planId);
  if (!plan) return false;
  if (plan.creatorId === userId) return true;
  const part = store.findParticipation(planId, userId);
  if (part?.state === "going") return true;
  if (part?.state === "interested") return true;
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
  const raw = store.listMessagesForConversation(convId);
  const messages = await Promise.all(raw.map((m) => toMessageDto(m)));
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
  res.status(201).json(await toMessageDto(message));
});

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
        : { id, firstName: "Unknown", neighborhoodId: null, avatarSeed: "missing", avatarStyle: "avataaars" as const };
    }),
    lastMessageAt: conv.lastMessageAt,
    unreadCount: messages.filter((m) => !m.readBy.includes(_viewerId)).length,
  };
}

async function toMessageDto(m: ReturnType<typeof store.listMessagesForConversation>[number]): Promise<MessageDTO> {
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
  return {
    id: m.id,
    conversationId: m.conversationId,
    kind: "user",
    sender: sender
      ? userToPublic(sender)
      : { id: m.senderId, firstName: "Unknown", neighborhoodId: null, avatarSeed: "missing", avatarStyle: "avataaars" },
    body: m.body,
    createdAt: m.createdAt,
  };
}
