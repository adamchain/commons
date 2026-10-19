import { api } from "../api/http";
import type { PlanDTO } from "../types/shared";

// Started beside /api/auth/me so the home feed can paint without waiting on a
// second round trip. The last list stays in memory so leaving and coming back
// doesn't flash an empty skeleton.
let cached: PlanDTO[] | null = null;
let slot: Promise<PlanDTO[]> | null = null;

export function cachedFeedPlans(): PlanDTO[] | null {
  return cached;
}

export function rememberFeedPlans(rows: PlanDTO[]): void {
  cached = rows;
}

export function prefetchFeedPlans(): void {
  if (slot) return;
  slot = api<PlanDTO[]>("/api/plans")
    .then((rows) => {
      cached = rows;
      return rows;
    })
    .finally(() => {
      slot = null;
    });
}

export function peekFeedPlans(): Promise<PlanDTO[]> | null {
  return slot;
}
