import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { store } from "../store.js";
import { userToPublic } from "./plans.js";
import type { ConversationDTO, MessageDTO } from "../types/shared.js";

export const chatRouter = Router();

// GET /api/plans/:planId/conversation — fetch the group conversation for a plan
chatRouter.get("/plans/:planId/conversation", requireAuth, (req, res) => {
  const planId = String(req.params.planId);
  const userId = String(req.userId);
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  // Membership check: user must be going or hosting.
  const part = store.findParticipation(planId, userId);
  if (plan.creatorId !== userId && part?.state !== "going") {
    res.status(403).json({ error: "Join the plan to access chat" });
    return;
  }
  const conv = store.ensureGroupConversation(planId, [plan.creatorId, userId]);
  res.json(toConversationDto(conv, userId));
});

// POST /api/plans/:planId/dms { otherUserId } — open or create a DM scoped to this plan
chatRouter.post("/plans/:planId/dms", requireAuth, (req, res) => {
  const planId = String(req.params.planId);
  const userId = String(req.userId);
  const otherUserId = String(req.body?.otherUserId ?? "");
  if (!otherUserId || otherUserId === userId) {
    res.status(400).json({ error: "Invalid other user" });
    return;
  }
  const plan = store.findPlanById(planId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  // Both users must share this plan.
  const myPart = store.findParticipation(planId, userId);
  const theirPart = store.findParticipation(planId, otherUserId);
  const iAmInPlan = plan.creatorId === userId || myPart?.state === "going";
  const theyAreInPlan = plan.creatorId === otherUserId || theirPart?.state === "going";
  if (!iAmInPlan || !theyAreInPlan) {
    res.status(403).json({ error: "Both users must be in the plan to DM" });
    return;
  }
  const conv = store.createDm(planId, userId, otherUserId);
  res.json(toConversationDto(conv, userId));
});

// GET /api/conversations/:id/messages
chatRouter.get("/conversations/:id/messages", requireAuth, (req, res) => {
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
  const messages = store.listMessagesForConversation(convId).map(toMessageDto);
  res.json(messages);
});

// POST /api/conversations/:id/messages { body }
chatRouter.post("/conversations/:id/messages", requireAuth, (req, res) => {
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
  res.status(201).json(toMessageDto(message));
});

function toConversationDto(conv: ReturnType<typeof store.findConversationById> & {}, _viewerId: string): ConversationDTO {
  const messages = store.listMessagesForConversation(conv.id);
  return {
    id: conv.id,
    planId: conv.planId,
    type: conv.type,
    participants: conv.participantIds.map((id) => {
      const u = store.findUserById(id);
      return u ? userToPublic(u) : { id, firstName: "Unknown", neighborhoodId: null, avatarSeed: "missing", avatarStyle: "avataaars" as const };
    }),
    lastMessageAt: conv.lastMessageAt,
    unreadCount: messages.filter((m) => !m.readBy.includes(_viewerId)).length,
  };
}

function toMessageDto(m: ReturnType<typeof store.listMessagesForConversation>[number]): MessageDTO {
  const sender = store.findUserById(m.senderId);
  return {
    id: m.id,
    conversationId: m.conversationId,
    sender: sender ? userToPublic(sender) : { id: m.senderId, firstName: "Unknown", neighborhoodId: null, avatarSeed: "missing", avatarStyle: "avataaars" },
    body: m.body,
    createdAt: m.createdAt,
  };
}
