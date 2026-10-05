import { api } from "../api/http";
import type { PlanDTO } from "../types/shared";

// Started beside /api/auth/me so the feed does not wait for a second round
// trip after the splash. Retired once a live Feed paint consumes it, so a
// later visit loads fresh.
let slot: Promise<PlanDTO[]> | null = null;
let retired = false;

export function prefetchFeedPlans(): void {
  if (retired || slot) return;
  slot = api<PlanDTO[]>("/api/plans");
}

export function peekFeedPlans(): Promise<PlanDTO[]> | null {
  if (retired) return null;
  return slot;
}

export function retireFeedPlans(): void {
  retired = true;
  slot = null;
}
