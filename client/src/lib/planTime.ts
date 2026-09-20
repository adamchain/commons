import type { PlanDTO } from "../types/shared";

/** Stored on "Anytime" idea posts — far enough out that feed/end logic never treats them as past. */
export const FLEXIBLE_DATE_PLACEHOLDER = "2099-12-31";

/** Upcoming Saturday (today if Saturday) — sort anchor for "This week" ideas. */
export function thisWeekAnchorDate(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + (6 - d.getDay()));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Mirror of server `planTime.ts` — kept in sync. Used for client-side "happened"
 *  treatment on cards and other lifecycle gates without needing a server round-trip. */

function timeToHms(t: string): string {
  const s = t.trim();
  if (!s) return "12:00:00";
  const [h, m = "00"] = s.split(":");
  const hh = String(Math.min(23, Math.max(0, parseInt(h, 10) || 12))).padStart(2, "0");
  const mm = String(Math.min(59, parseInt(m, 10) || 0)).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

export function planEndTimestamp(plan: PlanDTO): number {
  const day = plan.date.slice(0, 10);
  const flexTime = plan.isFlexibleTime || !plan.time?.trim();
  const startHms = flexTime ? "12:00:00" : timeToHms(plan.time);
  const start = new Date(`${day}T${startHms}`);
  if (Number.isNaN(start.getTime())) {
    return new Date(`${day}T23:59:59`).getTime();
  }
  if (plan.endTime?.trim()) {
    const end = new Date(`${day}T${timeToHms(plan.endTime)}`);
    if (!Number.isNaN(end.getTime())) return end.getTime();
  }
  return start.getTime() + 4 * 60 * 60 * 1000;
}

export function planHasEnded(plan: PlanDTO, now: Date = new Date()): boolean {
  if (plan.isFlexibleDate && !plan.lockedAt) return false;
  if (plan.isThisWeek && !plan.lockedAt) {
    const [y, m, day] = plan.date.slice(0, 10).split("-").map(Number);
    const weekEnd = new Date(y, m - 1, day, 23, 59, 59);
    return weekEnd.getTime() < now.getTime();
  }
  return planEndTimestamp(plan) < now.getTime();
}

/** Unlocked looking-for posts — feed Ideas tab and the red-edge idea card. */
export function isIdeaPlan(plan: Pick<PlanDTO, "planKind" | "lockedAt">): boolean {
  return plan.planKind === "looking_for" && !plan.lockedAt;
}

/** Positive spot cap, or null when the plan is uncapped. */
export function planCapacityValue(capacity: unknown): number | null {
  const n = typeof capacity === "number" ? capacity : Number(capacity);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

/** True when Going has filled every reserved spot. */
export function isPlanAtCapacity(capacity: unknown, goingCount: number): boolean {
  const cap = planCapacityValue(capacity);
  return cap !== null && goingCount >= cap;
}
