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
