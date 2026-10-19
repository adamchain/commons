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

/** Clock time as `HH:mm:ss`. Accepts `19:00` and `7:00 PM`. */
function timeToHms(t: string): string {
  const match = t.trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap]m)?$/i);
  if (!match) return "12:00:00";
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] ?? "0", 10);
  const mer = match[3]?.toLowerCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59 || hour > 23) return "12:00:00";
  if (mer === "pm" && hour < 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;
  if (hour > 23) return "12:00:00";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
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

/** Calendar day in Philadelphia, `YYYY-MM-DD`. */
export function planZoneToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PLAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A plan stays live until it ends. Once its calendar day is over it belongs
 *  in Past, even if the end clock never landed. Anytime and unlocked
 *  this-week ideas stay live until their own window closes. */
export function planBelongsInPast(plan: PlanDTO, now: Date = new Date()): boolean {
  if (plan.isFlexibleDate && !plan.lockedAt) return false;
  if (planHasEnded(plan, now)) return true;
  if (plan.isThisWeek && !plan.lockedAt) return false;
  const day = plan.date.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day < planZoneToday(now);
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
