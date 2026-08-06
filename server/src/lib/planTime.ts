import type { PlanRecord } from "../store.js";

/** Stored on "Anytime" idea posts — far enough out that feed/end logic never treats them as past. */
export const FLEXIBLE_DATE_PLACEHOLDER = "2099-12-31";

/** Parse `HH:mm` (24h) for ISO datetime construction. */
function timeToHms(t: string): string {
  const s = t.trim();
  if (!s) return "12:00:00";
  const [h, m = "00"] = s.split(":");
  const hh = String(Math.min(23, Math.max(0, parseInt(h, 10) || 12))).padStart(2, "0");
  const mm = String(Math.min(59, parseInt(m, 10) || 0)).padStart(2, "0");
  return `${hh}:${mm}:00`;
}

/** Approximate end instant for “past”, reminders, and sorting. */
export function planEndTimestamp(plan: PlanRecord): number {
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

export function planHasEnded(plan: PlanRecord, now = new Date()): boolean {
  if (plan.isFlexibleDate && !plan.lockedAt) return false;
  return planEndTimestamp(plan) < now.getTime();
}

export function planStartTimestamp(plan: PlanRecord): number {
  const day = plan.date.slice(0, 10);
  const flexTime = plan.isFlexibleTime || !plan.time?.trim();
  const startHms = flexTime ? "12:00:00" : timeToHms(plan.time);
  const start = new Date(`${day}T${startHms}`);
  if (Number.isNaN(start.getTime())) return new Date(`${day}T12:00:00`).getTime();
  return start.getTime();
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
