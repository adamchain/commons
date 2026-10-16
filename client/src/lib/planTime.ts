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

/** Mirror of the server zone. Plan clocks are Philadelphia time even if the
 *  phone is set somewhere else. */
const PLAN_TIME_ZONE = "America/New_York";

function timeToHms(t: string): string {
  const s = t.trim();
  if (!s) return "12:00:00";
  const [h, m = "00"] = s.split(":");
  const hh = String(Math.min(23, Math.max(0, parseInt(h, 10) || 12))).padStart(2, "0");
  const mm = String(Math.min(59, parseInt(m, 10) || 0)).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

function tzOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLAN_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    hour,
    Number(get("minute")),
    Number(get("second")),
  );
  return asUTC - instant.getTime();
}

function zonedTimestamp(day: string, hms: string): number {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  const [hh, mm, ss = 0] = hms.split(":").map((part) => parseInt(part, 10) || 0);
  if (!y || !m || !d) return Number.NaN;
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i++) guess = wallAsUtc - tzOffsetMs(new Date(guess));
  return guess;
}

export function planEndTimestamp(plan: PlanDTO): number {
  const day = plan.date.slice(0, 10);
  const flexTime = plan.isFlexibleTime || !plan.time?.trim();
  const startHms = flexTime ? "12:00:00" : timeToHms(plan.time);
  const start = zonedTimestamp(day, startHms);
  if (!Number.isFinite(start)) return zonedTimestamp(day, "23:59:59");
  if (plan.endTime?.trim()) {
    const end = zonedTimestamp(day, timeToHms(plan.endTime));
    if (Number.isFinite(end)) return end > start ? end : end + 24 * 60 * 60 * 1000;
  }
  return start + 4 * 60 * 60 * 1000;
}

export function planHasEnded(plan: PlanDTO, now: Date = new Date()): boolean {
  if (plan.isFlexibleDate && !plan.lockedAt) return false;
  if (plan.isThisWeek && !plan.lockedAt) {
    const weekEnd = zonedTimestamp(plan.date.slice(0, 10), "23:59:59");
    return weekEnd < now.getTime();
  }
  return planEndTimestamp(plan) < now.getTime();
}

/**
 * Home feed cutoff. A timed plan leaves as soon as its start passes, or at its
 * end time when one is set. No extra hours after the clock time.
 * Flexible-date and unlocked "this week" ideas stay until that window closes.
 */
export function planFeedHasPassed(plan: PlanDTO, now: Date = new Date()): boolean {
  if (plan.isFlexibleDate && !plan.lockedAt) return false;
  if (plan.isThisWeek && !plan.lockedAt) {
    const weekEnd = zonedTimestamp(plan.date.slice(0, 10), "23:59:59");
    return weekEnd < now.getTime();
  }
  const day = plan.date.slice(0, 10);
  const flexTime = plan.isFlexibleTime || !plan.time?.trim();
  if (!flexTime && plan.endTime?.trim()) {
    const end = zonedTimestamp(day, timeToHms(plan.endTime));
    if (Number.isFinite(end)) return end < now.getTime();
  }
  if (!flexTime && plan.time?.trim()) {
    const start = zonedTimestamp(day, timeToHms(plan.time));
    if (Number.isFinite(start)) return start < now.getTime();
  }
  return zonedTimestamp(day, "23:59:59") < now.getTime();
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

/** Host asked to approve joins. A capacity by itself still uses Join until it's full. */
export function planRequiresHostApproval(plan: {
  capacity?: number | null;
  joinType?: string;
}): boolean {
  return plan.joinType === "approve";
}
