import type { PlanRecord } from "../store.js";

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

/** Plans are Philly plans. The API runs in UTC, so wall-clock times are
 *  interpreted in this zone — otherwise a 7pm plan fires at 3pm. */
export const PLAN_TIME_ZONE = "America/New_York";

/** Parse `HH:mm` (24h) for datetime construction. */
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

/** Instant for a calendar day + clock time in America/New_York. */
export function zonedTimestamp(day: string, hms: string): number {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  const [hh, mm, ss = 0] = hms.split(":").map((part) => parseInt(part, 10) || 0);
  if (!y || !m || !d) return Number.NaN;
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i++) guess = wallAsUtc - tzOffsetMs(new Date(guess));
  return guess;
}

/** YYYY-MM-DD in the plan zone. `toISOString()` flips the day after 8pm ET. */
export function calendarDayInPlanZone(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PLAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Approximate end instant for “past”, reminders, and sorting. */
export function planEndTimestamp(plan: PlanRecord): number {
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

export function planHasEnded(plan: PlanRecord, now = new Date()): boolean {
  if (plan.isFlexibleDate && !plan.lockedAt) return false;
  if (plan.isThisWeek && !plan.lockedAt) {
    const weekEnd = zonedTimestamp(plan.date.slice(0, 10), "23:59:59");
    return weekEnd < now.getTime();
  }
  return planEndTimestamp(plan) < now.getTime();
}

/** Mirror of the client feed cutoff — a timed plan is off the feed once it starts, or once it ends when an end time is set. */
export function planFeedHasPassed(plan: PlanRecord, now = new Date()): boolean {
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

export function planStartTimestamp(plan: PlanRecord): number {
  const day = plan.date.slice(0, 10);
  const flexTime = plan.isFlexibleTime || !plan.time?.trim();
  const startHms = flexTime ? "12:00:00" : timeToHms(plan.time);
  const start = zonedTimestamp(day, startHms);
  if (!Number.isFinite(start)) return zonedTimestamp(day, "12:00:00");
  return start;
}

/** Two plans overlap if their [start, end] windows intersect. Flexible-time
 *  plans land at midday + 3h, which is conservative enough to flag obvious
 *  conflicts ("two same-day plans") without false-positiving across genuinely
 *  separate parts of the day. */
export function plansOverlap(a: PlanRecord, b: PlanRecord): boolean {
  const aStart = planStartTimestamp(a);
  const aEnd = planEndTimestamp(a);
  const bStart = planStartTimestamp(b);
  const bEnd = planEndTimestamp(b);
  return aStart < bEnd && bStart < aEnd;
}

/** Host asked to approve joins. A capacity by itself still uses Join until it's full. */
export function planRequiresHostApproval(plan: {
  capacity?: number | null;
  joinType?: string;
}): boolean {
  return plan.joinType === "approve";
}
