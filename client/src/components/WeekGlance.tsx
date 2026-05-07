import { useMemo } from "react";
import type { PlanDTO } from "../types/shared";
import { Link } from "react-router-dom";

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 Sun — 6 Sat
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

/** Mon–Sun strip with ambient copy about the week (approximate “network” counts from plan participation). */
export function WeekGlance({
  plans,
  viewerGoingPlanIds,
  viewerId,
}: {
  plans: PlanDTO[];
  viewerGoingPlanIds: Set<string>;
  viewerId?: string;
}) {
  const week = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const mon = startOfWeekMonday(today);
    const days: { date: Date; label: string; iso: string }[] = [];
    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let i = 0; i < 7; i++) {
      const date = addDays(mon, i);
      days.push({
        date,
        iso: isoDay(date),
        label: dow[i] ?? "",
      });
    }
    return { todayIso: isoDay(today), days };
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, PlanDTO[]>();
    for (const p of plans) {
      const key = p.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [plans]);

  const nudge = useMemo(() => {
    const todayIso = week.todayIso;
    const list = byDay.get(todayIso) ?? [];
    let people = 0;
    for (const p of list) {
      people += p.participants.going.length + p.participants.interested.length;
    }
    const busy = people >= 6;
    const imIn = list.some((p) => viewerGoingPlanIds.has(p.id));
    const dayName = new Date(todayIso).toLocaleDateString(undefined, { weekday: "long" });

    if (busy && imIn) {
      return `${dayName} is busy — ${people} people in your network have plans. You're already in on one.`;
    }
    if (busy && !imIn) {
      return (
        <>
          {dayName} is busy — {people} people in your network have plans.{" "}
          <Link to="#feed-plans" className="week-glance-link">
            See what&apos;s happening →
          </Link>
        </>
      );
    }
    const around = people || Math.min(12, plans.length * 3 + 2);
    return `${dayName} is open — ${around} people around and nothing planned yet. Good time to post something.`;
  }, [byDay, week.todayIso, viewerGoingPlanIds, plans.length]);

  const daysRow = (
    <div className="week-glance-days">
      {week.days.map(({ iso, label, date }) => {
        const hasPlans = (byDay.get(iso)?.length ?? 0) > 0;
        const isToday = iso === week.todayIso;
        return (
          <div
            key={iso}
            className={`week-glance-day ${hasPlans ? "has-plans" : ""} ${isToday ? "is-today" : ""}`}
            title={date.toLocaleDateString()}
          >
            <span className="week-glance-dow">{label}</span>
            <span className="week-glance-num">{date.getDate()}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="week-glance" aria-label="Week at a glance">
      {viewerId ? (
        <Link to={`/profile/${viewerId}?calendar=1`} className="week-glance-calendar-link">
          {daysRow}
        </Link>
      ) : (
        daysRow
      )}
      <p className="week-glance-nudge">{nudge}</p>
    </section>
  );
}
