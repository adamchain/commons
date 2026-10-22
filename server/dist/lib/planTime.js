/** Stored on "Anytime" idea posts — far enough out that feed/end logic never treats them as past. */
export const FLEXIBLE_DATE_PLACEHOLDER = "2099-12-31";
/** Upcoming Saturday (today if Saturday) — sort anchor for "This week" ideas. */
export function thisWeekAnchorDate(now = new Date()) {
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
/**
 * Clock time as `HH:mm:ss`. Accepts `19:00` and `7:00 PM`.
 * A bare split on `:` used to read `7:00 PM` as 7:00 AM, so an evening plan
 * pinged in the morning.
 */
function timeToHms(t) {
    const parsed = parsePlanClock(t);
    if (!parsed)
        return "12:00:00";
    return `${parsed}:00`;
}
/** `HH:mm` in 24h, or null when the string isn't a clock time. */
export function canonicalPlanTime(raw) {
    return parsePlanClock(raw);
}
function parsePlanClock(raw) {
    const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap]m)?$/i);
    if (!match)
        return null;
    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2] ?? "0", 10);
    const mer = match[3]?.toLowerCase();
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59 || hour > 23)
        return null;
    if (mer === "pm" && hour < 12)
        hour += 12;
    if (mer === "am" && hour === 12)
        hour = 0;
    if (hour > 23)
        return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function tzOffsetMs(instant) {
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
    const get = (type) => parts.find((p) => p.type === type)?.value ?? "0";
    let hour = Number(get("hour"));
    if (hour === 24)
        hour = 0;
    const asUTC = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")), hour, Number(get("minute")), Number(get("second")));
    return asUTC - instant.getTime();
}
/** Instant for a calendar day + clock time in America/New_York. */
export function zonedTimestamp(day, hms) {
    const [y, m, d] = day.slice(0, 10).split("-").map(Number);
    const [hh, mm, ss = 0] = hms.split(":").map((part) => parseInt(part, 10) || 0);
    if (!y || !m || !d)
        return Number.NaN;
    const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
    let guess = wallAsUtc;
    for (let i = 0; i < 3; i++)
        guess = wallAsUtc - tzOffsetMs(new Date(guess));
    return guess;
}
/** YYYY-MM-DD in the plan zone. `toISOString()` flips the day after 8pm ET. */
export function calendarDayInPlanZone(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: PLAN_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}
/** Approximate end instant for “past”, reminders, and sorting. */
export function planEndTimestamp(plan) {
    const day = plan.date.slice(0, 10);
    const flexTime = plan.isFlexibleTime || !plan.time?.trim();
    const startHms = flexTime ? "12:00:00" : timeToHms(plan.time);
    const start = zonedTimestamp(day, startHms);
    if (!Number.isFinite(start))
        return zonedTimestamp(day, "23:59:59");
    if (plan.endTime?.trim()) {
        const end = zonedTimestamp(day, timeToHms(plan.endTime));
        if (Number.isFinite(end))
            return end > start ? end : end + 24 * 60 * 60 * 1000;
    }
    return start + 4 * 60 * 60 * 1000;
}
export function planHasEnded(plan, now = new Date()) {
    if (plan.isFlexibleDate && !plan.lockedAt)
        return false;
    if (plan.isThisWeek && !plan.lockedAt) {
        const weekEnd = zonedTimestamp(plan.date.slice(0, 10), "23:59:59");
        return weekEnd < now.getTime();
    }
    return planEndTimestamp(plan) < now.getTime();
}
/** Mirror of the client feed cutoff — a timed plan is off the feed once it starts, or once it ends when an end time is set. */
export function planFeedHasPassed(plan, now = new Date()) {
    if (plan.isFlexibleDate && !plan.lockedAt)
        return false;
    if (plan.isThisWeek && !plan.lockedAt) {
        const weekEnd = zonedTimestamp(plan.date.slice(0, 10), "23:59:59");
        return weekEnd < now.getTime();
    }
    const day = plan.date.slice(0, 10);
    const flexTime = plan.isFlexibleTime || !plan.time?.trim();
    if (!flexTime && plan.endTime?.trim()) {
        const end = zonedTimestamp(day, timeToHms(plan.endTime));
        if (Number.isFinite(end))
            return end < now.getTime();
    }
    if (!flexTime && plan.time?.trim()) {
        const start = zonedTimestamp(day, timeToHms(plan.time));
        if (Number.isFinite(start))
            return start < now.getTime();
    }
    return zonedTimestamp(day, "23:59:59") < now.getTime();
}
export function planStartTimestamp(plan) {
    const day = plan.date.slice(0, 10);
    const flexTime = plan.isFlexibleTime || !plan.time?.trim();
    const startHms = flexTime ? "12:00:00" : timeToHms(plan.time);
    const start = zonedTimestamp(day, startHms);
    if (!Number.isFinite(start))
        return zonedTimestamp(day, "12:00:00");
    return start;
}
/** Two plans overlap if their [start, end] windows intersect. Flexible-time
 *  plans land at midday + 3h, which is conservative enough to flag obvious
 *  conflicts ("two same-day plans") without false-positiving across genuinely
 *  separate parts of the day. */
export function plansOverlap(a, b) {
    const aStart = planStartTimestamp(a);
    const aEnd = planEndTimestamp(a);
    const bStart = planStartTimestamp(b);
    const bEnd = planEndTimestamp(b);
    return aStart < bEnd && bStart < aEnd;
}
/** Host asked to approve joins. A capacity by itself still uses Join until it's full. */
export function planRequiresHostApproval(plan) {
    return plan.joinType === "approve";
}
