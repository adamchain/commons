import { App as CapApp } from "@capacitor/app";
import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { api } from "../api/http";
import { isNative } from "./platform";
import type { MeDTO, MessageDTO, MessageReplyDTO, PublicUser } from "../types/shared";

const POLL_MS = 2500;
/** Re-fetch a window behind the newest local stamp so a send can't skip others. */
const OVERLAP_MS = 60_000;

export function mergeChatMessages(
  current: MessageDTO[],
  incoming: MessageDTO[],
  deleted: Set<string>,
): MessageDTO[] {
  if (!incoming.length) return current;
  const withoutLocalDupes = current.filter((m) => {
    if (!m.id.startsWith("local-")) return true;
    return !incoming.some(
      (i) => i.sender?.id === m.sender?.id && i.body === m.body && i.imageUrl === m.imageUrl,
    );
  });
  const ids = new Set(withoutLocalDupes.map((m) => m.id));
  const fresh = incoming.filter((m) => !ids.has(m.id) && !deleted.has(m.id));
  if (!fresh.length && withoutLocalDupes.length === current.length) return current;
  return [...withoutLocalDupes, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function senderFromMe(me: MeDTO): PublicUser {
  return {
    id: me.id,
    firstName: me.firstName,
    lastName: me.lastName,
    bio: me.bio,
    ageRange: me.ageRange,
    neighborhoodId: me.neighborhoodId ?? null,
    avatarSeed: me.avatarSeed,
    avatarStyle: me.avatarStyle,
    avatarPhotoDataUrl: me.avatarPhotoDataUrl,
    avatarParams: me.avatarParams,
  };
}

/** Paint the bubble immediately, then swap in the server row. */
export async function postOwnChatMessage(args: {
  convId: string;
  text: string;
  imageUrl: string | null;
  replyTo: MessageReplyDTO | null;
  me: MeDTO;
  deletedIds: Set<string>;
  setMessages: Dispatch<SetStateAction<MessageDTO[]>>;
}): Promise<void> {
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const optimistic: MessageDTO = {
    id: localId,
    conversationId: args.convId,
    kind: "user",
    sender: senderFromMe(args.me),
    body: args.text || (args.imageUrl ? "📷 Photo" : ""),
    createdAt: new Date().toISOString(),
    imageUrl: args.imageUrl,
    replyTo: args.replyTo ?? undefined,
  };
  args.setMessages((prev) => mergeChatMessages(prev, [optimistic], args.deletedIds));
  try {
    const msg = await api<MessageDTO>(`/api/conversations/${args.convId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        ...(args.text ? { body: args.text } : {}),
        ...(args.imageUrl ? { imageUrl: args.imageUrl } : {}),
        ...(args.replyTo ? { replyToId: args.replyTo.id } : {}),
      }),
    });
    args.setMessages((prev) => {
      const without = prev.filter((m) => m.id !== localId);
      return mergeChatMessages(without, [msg], args.deletedIds);
    });
  } catch (err) {
    args.setMessages((prev) => prev.filter((m) => m.id !== localId));
    throw err;
  }
}

export async function toggleChatHeart(args: {
  convId: string;
  messageId: string;
  meId: string;
  setMessages: Dispatch<SetStateAction<MessageDTO[]>>;
}): Promise<void> {
  args.setMessages((prev) =>
    prev.map((m) => {
      if (m.id !== args.messageId) return m;
      const hearts = m.reactions?.["❤️"] ?? [];
      const next = hearts.includes(args.meId)
        ? hearts.filter((id) => id !== args.meId)
        : [...hearts, args.meId];
      return { ...m, reactions: { ...(m.reactions ?? {}), "❤️": next } };
    }),
  );
  try {
    const updated = await api<MessageDTO>(
      `/api/conversations/${args.convId}/messages/${args.messageId}/react`,
      { method: "POST", body: JSON.stringify({ emoji: "❤️" }) },
    );
    args.setMessages((prev) => prev.map((m) => (m.id === args.messageId ? updated : m)));
  } catch {
    /* they can tap again */
  }
}

/**
 * Keep an open thread current. Chat used `since` = last local timestamp, so
 * sending a message jumped the cursor past anyone else's notes that hadn't
 * been merged yet — people had to kill the app to see the thread.
 */
export function useLiveChatMessages(
  convId: string | null | undefined,
  setMessages: Dispatch<SetStateAction<MessageDTO[]>>,
  deletedIds: MutableRefObject<Set<string>>,
) {
  const messagesRef = useRef<MessageDTO[]>([]);

  const pull = useCallback(async () => {
    if (!convId) return;
    const list = messagesRef.current;
    const last = list[list.length - 1]?.createdAt;
    let since = "";
    if (last) {
      const t = Date.parse(last);
      since = Number.isFinite(t) ? new Date(t - OVERLAP_MS).toISOString() : last;
    }
    try {
      const incoming = await api<MessageDTO[]>(
        `/api/conversations/${convId}/messages?peek=1${since ? `&since=${encodeURIComponent(since)}` : ""}`,
      );
      if (!incoming.length) return;
      setMessages((cur) => {
        const next = mergeChatMessages(cur, incoming, deletedIds.current);
        messagesRef.current = next;
        return next;
      });
    } catch {
      /* keep the open thread; next tick retries */
    }
  }, [convId, deletedIds, setMessages]);

  useEffect(() => {
    if (!convId) return;
    void pull();
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void pull();
    }, POLL_MS);
    const onWake = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void pull();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("commons:notifications-changed", onWake);
    window.addEventListener("focus", onWake);
    let removeCap: (() => void) | undefined;
    if (isNative()) {
      void CapApp.addListener("appStateChange", (state) => {
        if (state.isActive) void pull();
      }).then((handle) => {
        removeCap = () => {
          void handle.remove();
        };
      });
    }
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("commons:notifications-changed", onWake);
      window.removeEventListener("focus", onWake);
      removeCap?.();
    };
  }, [convId, pull]);

  return { messagesRef, mergeIncoming: mergeChatMessages };
}
