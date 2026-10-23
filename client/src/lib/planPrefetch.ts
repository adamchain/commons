import { api } from "../api/http";
import type { PlanDTO } from "../types/shared";

// Per-plan cache so tapping a card (or returning to a detail you've already
// opened) can paint from the last-known plan while a fresh copy loads in the
// background. Mirrors feedPrefetch but keyed by plan id. Starting the fetch on
// pointer-down means the request is usually in flight — often already done —
// by the time the detail page mounts, so the hero fills in instead of flashing
// the skeleton.
const cache = new Map<string, PlanDTO>();
const inflight = new Map<string, Promise<PlanDTO>>();

export function cachedPlan(id: string): PlanDTO | null {
  return cache.get(id) ?? null;
}

export function rememberPlan(plan: PlanDTO): void {
  cache.set(plan.id, plan);
}

export function prefetchPlan(id: string): Promise<PlanDTO> {
  const existing = inflight.get(id);
  if (existing) return existing;
  const slot = api<PlanDTO>(`/api/plans/${id}`)
    .then((data) => {
      cache.set(id, data);
      return data;
    })
    .finally(() => {
      inflight.delete(id);
    });
  inflight.set(id, slot);
  return slot;
}

export function peekPlan(id: string): Promise<PlanDTO> | null {
  return inflight.get(id) ?? null;
}
