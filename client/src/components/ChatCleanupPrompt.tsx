import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { needsOnboarding } from "../lib/onboarding";
import type { PlanDTO } from "../types/shared";
import { BottomSheet, Button } from "./ui";

/**
 * After an event ends, ask the host (or the community organizer) whether to
 * delete the group chat. The plan page asks too; this covers the next time
 * they open the app without opening that plan.
 */
export function ChatCleanupPrompt() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || needsOnboarding(user)) {
      setPlan(null);
      setOpen(false);
      return;
    }
    let alive = true;
    void api<{ plan: PlanDTO | null }>("/api/plans/chat-cleanup-pending")
      .then((r) => {
        if (!alive) return;
        const next = r.plan;
        setPlan(next);
        const dismissed = next ? sessionStorage.getItem(`chat-cleanup:${next.id}`) : null;
        setOpen(Boolean(next) && !dismissed);
      })
      .catch(() => {
        if (alive) setOpen(false);
      });
    return () => {
      alive = false;
    };
  }, [user?.id]);

  if (!user || !plan || !open) return null;
  const isHost = plan.creator.id === user.id || (plan.coHosts?.some((h) => h.id === user.id) ?? false);
  if (pathname === `/plans/${plan.id}` && isHost) return null;

  function dismiss() {
    sessionStorage.setItem(`chat-cleanup:${plan!.id}`, "1");
    setOpen(false);
  }

  async function choose(action: "keep" | "delete") {
    if (!plan) return;
    setBusy(true);
    try {
      await api(`/api/plans/${plan.id}/chat-cleanup`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setOpen(false);
      setPlan(null);
    } catch {
      /* leave the sheet up so they can try again */
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet onClose={dismiss} ariaLabel="Delete the chat?">
      <h2 className="plan-chat-cleanup-title">Delete this chat?</h2>
      <p className="plan-chat-cleanup-copy">
        {plan.title} is over. You can delete the group chat, or keep it so people can still look back.
      </p>
      <div className="plan-chat-cleanup-actions">
        <Button variant="primary" block disabled={busy} onClick={() => void choose("delete")}>
          Delete chat
        </Button>
        <Button variant="secondary" block disabled={busy} onClick={() => void choose("keep")}>
          Keep it
        </Button>
      </div>
    </BottomSheet>
  );
}
