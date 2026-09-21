/** Philadelphia-local buckets for the organizer dashboard. */

const TZ = "America/New_York";
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const HOUR_LABELS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];
const DAY_LONG = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
/** Monday-first short labels, matching a calendar week. */
const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

type Ymd = { y: number; m: number; d: number };
type Zoned = Ymd & { weekday: number; hour: number };

export interface DashboardAnalytics {
  activeThisWeek: number;
  interactionsThisWeek: number;
  activityChangePct: number | null;
  activity: { label: string; count: number; isToday: boolean }[];
  todayWeekday: number;
  activeTimes: {
    weekdays: { weekday: number; label: string; hours: { label: string; count: number }[] }[];
    days: { label: string; count: number }[];
  };
  growth: { newMembers: number; points: { label: string; count: number }[] };
}

function zoned(iso: string): Zoned | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  const weekday = WEEKDAY_INDEX[bag.weekday ?? ""];
  if (weekday == null) return null;
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    y: Number(bag.year),
    m: Number(bag.month),
    d: Number(bag.day),
    weekday,
    hour,
  };
}

function keyOf(p: Ymd): string {
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function addDays(p: Ymd, n: number): Ymd {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function mondayOf(p: Zoned): Ymd {
  return addDays(p, -((p.weekday + 6) % 7));
}

function shortDate(p: Ymd): string {
  return `${p.m}/${p.d}`;
}

export function buildCommunityAnalytics(input: {
  now?: Date;
  interactions: { at: string; userId: string }[];
  joinedAt: string[];
}): DashboardAnalytics {
  const now = zoned((input.now ?? new Date()).toISOString()) ?? {
    y: 2026,
    m: 1,
    d: 1,
    weekday: 4,
    hour: 12,
  };
  const monday = mondayOf(now);
  const thisWeek = Array.from({ length: 7 }, (_, i) => keyOf(addDays(monday, i)));
  const prevWeek = Array.from({ length: 7 }, (_, i) => keyOf(addDays(monday, i - 7)));
  const daysSoFar = ((now.weekday + 6) % 7) + 1;
  const thisPartial = new Set(thisWeek.slice(0, daysSoFar));
  const prevPartial = new Set(prevWeek.slice(0, daysSoFar));

  const weekCounts = thisWeek.map(() => 0);
  let prevTotal = 0;
  let thisTotal = 0;
  const active = new Set<string>();

  const lookbackStart = keyOf(addDays(now, -55));
  const hourBuckets = Array.from({ length: 7 }, () => HOUR_LABELS.map(() => 0));
  const dayBuckets = WEEK_LABELS.map(() => 0);

  for (const event of input.interactions) {
    const z = zoned(event.at);
    if (!z) continue;
    const key = keyOf(z);
    const weekIndex = thisWeek.indexOf(key);
    if (weekIndex >= 0) {
      weekCounts[weekIndex] += 1;
      if (thisPartial.has(key)) {
        thisTotal += 1;
        if (event.userId) active.add(event.userId);
      }
    } else if (prevPartial.has(key)) {
      prevTotal += 1;
    }
    if (key >= lookbackStart && key <= keyOf(now)) {
      const hourIndex = Math.min(7, Math.floor(z.hour / 3));
      hourBuckets[z.weekday]![hourIndex] += 1;
      const monIndex = (z.weekday + 6) % 7;
      dayBuckets[monIndex] += 1;
    }
  }

  const activityChangePct =
    prevTotal === 0 ? (thisTotal === 0 ? 0 : null) : Math.round(((thisTotal - prevTotal) / prevTotal) * 100);

  const growthStart = addDays(now, -27);
  const growthKeys = Array.from({ length: 28 }, (_, i) => addDays(growthStart, i));
  const growthCounts = new Map(growthKeys.map((p) => [keyOf(p), 0]));
  for (const iso of input.joinedAt) {
    const z = zoned(iso);
    if (!z) continue;
    const key = keyOf(z);
    if (growthCounts.has(key)) growthCounts.set(key, (growthCounts.get(key) ?? 0) + 1);
  }
  const points = growthKeys.map((p) => ({
    label: shortDate(p),
    count: growthCounts.get(keyOf(p)) ?? 0,
  }));

  return {
    activeThisWeek: active.size,
    interactionsThisWeek: thisTotal,
    activityChangePct,
    activity: thisWeek.map((key, i) => ({
      label: WEEK_LABELS[i] ?? "",
      count: weekCounts[i] ?? 0,
      isToday: key === keyOf(now),
    })),
    todayWeekday: now.weekday,
    activeTimes: {
      weekdays: DAY_LONG.map((label, weekday) => ({
        weekday,
        label,
        hours: HOUR_LABELS.map((hourLabel, i) => ({
          label: hourLabel,
          count: hourBuckets[weekday]?.[i] ?? 0,
        })),
      })),
      days: WEEK_LABELS.map((label, i) => ({ label, count: dayBuckets[i] ?? 0 })),
    },
    growth: {
      newMembers: points.reduce((sum, p) => sum + p.count, 0),
      points,
    },
  };
}
