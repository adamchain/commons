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
 * Compact day strip. Tap a day to filter the feed; tap that day again to
 * clear. Today, when the current day has scrolled out of view, jumps the
 * scroller back without changing the filter.
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
        monthLabel: date.toLocaleDateString(undefined, { month: "short" }),
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
  const [pinnedMonth, setPinnedMonth] = useState(
    () => week.days[0]?.monthLabel ?? "",
  );

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const updateMonth = () => {
      const buttons = strip.querySelectorAll<HTMLButtonElement>(".week-strip-day");
      const edge = strip.getBoundingClientRect().left + 4;
      let month = week.days[0]?.monthLabel ?? "";
      for (const button of buttons) {
        if (button.getBoundingClientRect().right < edge) continue;
        month = button.dataset.month || month;
        break;
      }
      setPinnedMonth(month);
    };
    updateMonth();
    strip.addEventListener("scroll", updateMonth, { passive: true });
    return () => strip.removeEventListener("scroll", updateMonth);
  }, [week.days]);

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

  const showReset = selectedDayIso === null && !todayInView;

  return (
    <div className="week-strip-wrap">
      {pinnedMonth ? (
        <span className="week-strip-month-pin">{pinnedMonth}</span>
      ) : null}
      <section
        id="week-strip-days"
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
              data-month={monthLabel ?? undefined}
              title={date.toLocaleDateString()}
              onClick={() => onSelectDay(isSelected ? null : iso)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
            >
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
          onClick={jumpToToday}
          aria-label="Jump to today"
        >
          Today
        </button>
      )}
    </div>
  );
}
