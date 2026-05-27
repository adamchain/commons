import { useMemo } from "react";
import type { PlanDTO } from "../types/shared";

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Parse/shift in local time. `new Date(iso).toISOString()` would shift the day
// across UTC boundaries; this version stays in the user's calendar day.
function parseLocalIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function shiftIso(iso: string, days: number): string {
  const date = parseLocalIso(iso);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Compact 7-day strip. Tap a day to filter the feed; tap again to clear.
 * Pure calendar — no "X people in your network" nudge copy.
 */
export function WeekStrip({
  plans,
  selectedDayIso,
  onSelectDay,
}: {
  plans: PlanDTO[];
  selectedDayIso: string | null;
  onSelectDay: (iso: string | null) => void;
}) {
  const week = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const mon = startOfWeekMonday(today);
    const dow = ["M", "T", "W", "T", "F", "S", "S"];
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(mon, i);
      days.push({ date, iso: isoDay(date), label: dow[i] ?? "" });
    }
    return { todayIso: isoDay(today), days };
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of plans) {
      const key = p.date.slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [plans]);

  if (selectedDayIso) {
    return <DayView iso={selectedDayIso} todayIso={week.todayIso} onSelectDay={onSelectDay} />;
  }

  return (
    <section className="week-strip" aria-label="Week">
      {week.days.map(({ iso, label, date }) => {
        const hasPlans = (byDay.get(iso) ?? 0) > 0;
        const isToday = iso === week.todayIso;
        const isSelected = iso === selectedDayIso;
        return (
          <button
            key={iso}
            type="button"
            className={`week-strip-day ${hasPlans ? "has-plans" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
            title={date.toLocaleDateString()}
            onClick={() => onSelectDay(isSelected ? null : iso)}
            aria-pressed={isSelected}
          >
            <span className="week-strip-dow">{label}</span>
            <span className="week-strip-num">{date.getDate()}</span>
          </button>
        );
      })}
    </section>
  );
}

function DayView({
  iso,
  todayIso,
  onSelectDay,
}: {
  iso: string;
  todayIso: string;
  onSelectDay: (iso: string | null) => void;
}) {
  const date = parseLocalIso(iso);
  const isToday = iso === todayIso;
  const label = isToday
    ? `Today · ${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
    : date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <section className="day-view" aria-label={`Plans on ${label}`}>
      <button
        type="button"
        className="day-view-nav"
        onClick={() => onSelectDay(shiftIso(iso, -1))}
        aria-label="Previous day"
      >
        ‹
      </button>
      <h2 className="day-view-label">{label}</h2>
      <button
        type="button"
        className="day-view-nav"
        onClick={() => onSelectDay(shiftIso(iso, 1))}
        aria-label="Next day"
      >
        ›
      </button>
      <button
        type="button"
        className="day-view-week-btn"
        onClick={() => onSelectDay(null)}
      >
        Week view
      </button>
    </section>
  );
}
