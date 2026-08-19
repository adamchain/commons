import { useEffect, useMemo, useRef, useState } from "react";
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

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Compact day strip. Tap a day to filter the feed; tap again to clear.
 * A visible All dates / Today control on the strip itself returns to the
 * unfiltered feed and jumps the scroller back to today.
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
  // Render a long, horizontally scrollable run of days — from the start of
  // this week through ~5 weeks out — so the user can swipe left/right to see
  // the rest of the month instead of being capped at a single 7-day window.
  const DAYS_TO_SHOW = 35;
  const week = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const mon = startOfWeekMonday(today);
    const dowLabels = ["M", "T", "W", "T", "F", "S", "S"];
    const days = [];
    for (let i = 0; i < DAYS_TO_SHOW; i++) {
      const date = addDays(mon, i);
      days.push({
        date,
        iso: isoDay(date),
        label: dowLabels[date.getDay() === 0 ? 6 : date.getDay() - 1] ?? "",
        // Mark the first day of each month so the scroll has month context.
        monthLabel: date.getDate() === 1 || i === 0
          ? date.toLocaleDateString(undefined, { month: "short" })
          : null,
      });
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

  const stripRef = useRef<HTMLElement>(null);
  const todayBtnRef = useRef<HTMLButtonElement>(null);
  const [todayInView, setTodayInView] = useState(true);

  useEffect(() => {
    const strip = stripRef.current;
    const todayBtn = todayBtnRef.current;
    if (!strip || !todayBtn) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry) setTodayInView(entry.isIntersecting);
      },
      { root: strip, threshold: 0.6 },
    );
    io.observe(todayBtn);
    return () => io.disconnect();
  }, []);

  const jumpToToday = () => {
    const strip = stripRef.current;
    const todayBtn = todayBtnRef.current;
    if (!strip || !todayBtn) return;
    const delta = todayBtn.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    strip.scrollTo({
      left: Math.max(0, strip.scrollLeft + delta),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const showReset = selectedDayIso !== null || !todayInView;
  const resetLabel = selectedDayIso ? "All dates" : "Today";

  return (
    <div className="week-strip-wrap">
      <section
        ref={stripRef}
        className="week-strip week-strip--scroll"
        aria-label="Calendar — scroll for more days"
      >
        {week.days.map(({ iso, label, date, monthLabel }) => {
          const hasPlans = (byDay.get(iso) ?? 0) > 0;
          const isToday = iso === week.todayIso;
          const isSelected = iso === selectedDayIso;
          return (
            <button
              key={iso}
              ref={isToday ? todayBtnRef : undefined}
              type="button"
              className={`week-strip-day ${hasPlans ? "has-plans" : ""} ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
              title={date.toLocaleDateString()}
              onClick={() => onSelectDay(isSelected ? null : iso)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
            >
              {monthLabel && <span className="week-strip-month">{monthLabel}</span>}
              <span className="week-strip-dow">{label}</span>
              <span className="week-strip-num">{date.getDate()}</span>
            </button>
          );
        })}
      </section>
      {showReset && (
        <button
          type="button"
          className="week-strip-reset"
          onClick={() => {
            if (selectedDayIso) onSelectDay(null);
            jumpToToday();
          }}
          aria-label={selectedDayIso ? "Show all dates" : "Jump to today"}
        >
          {resetLabel}
        </button>
      )}
    </div>
  );
}
