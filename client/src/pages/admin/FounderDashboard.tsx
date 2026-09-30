import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  LayoutGrid,
  Settings2,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "../../api/http";
import {
  AdminUserDetailModal,
  CardImagesManager,
  CommunitiesReview,
  FoundingCommunityControls,
  ReportsReview,
  ReviewInbox,
} from "../Admin";
import "./FounderDashboard.css";

type PageId = "overview" | "health" | "acquisition" | "communities" | "operations";

type Delta = { value: number | null; previous: number | null; delta: number | null; spark: number[] };

type Dashboard = {
  generatedAt: string;
  updatedLabel: string;
  seedExcluded: number;
  viewer: { firstName: string; lastName: string; neighborhoodName: string | null };
  overview: {
    rangeLabel: string;
    weekNumber: number | null;
    sinceLabel: string | null;
    plansCompleted: Delta;
    avgPeople: Delta;
    zeroJoins: Delta;
    wau: Delta;
    funnel: {
      posted: number;
      joined: number;
      completed: number;
      postedToJoinedPct: number | null;
      joinedToCompletedPct: number | null;
      happenedPct: number | null;
      zeroJoins: number;
      shortNoticeZeroJoins: number;
    };
    alerts: { communityId: string; name: string; daysInactive: number }[];
    dau: {
      days: { date: string; count: number }[];
      yesterday: number;
      deltaPct: number | null;
      firstSignupDate: string | null;
    };
    activeCommunities: { id: string; name: string; initials: string; members: number; plans: number }[];
  };
  health: {
    repeatPosting: { ratePct: number | null; converted: number; eligible: number };
    retention: { weekStart: string; signups: number; retained: number; ratePct: number | null }[];
    communities: {
      activeCount: number;
      inactiveCount: number;
      rows: {
        id: string;
        name: string;
        initials: string;
        active: boolean;
        daysInactive: number | null;
        lastActivityAt: string | null;
      }[];
    };
    crossPollination: {
      multiCommunityPct: number | null;
      multiCommunityUsers: number;
      communityMembers: number;
      outsiderJoinPct: number | null;
      outsiderJoinUsers: number;
      communityPlanJoiners: number;
    };
    interestedToIn: { ratePct: number | null; interested: number; converted: number; windowDays: number };
    onboarding: { step: string; count: number; pct: number | null }[];
  };
  acquisition: {
    codes: {
      kind: "creator" | "group_chat" | "community";
      label: string;
      code: string;
      ownerName: string;
      downloads: null;
      signups: number;
      activeAfter7d: number;
      conversionPct: number | null;
    }[];
    byType: { kind: string; label: string; signups: number }[];
    downloadsTracked: false;
    age: { label: string; count: number }[];
    neighborhoods: { name: string; count: number }[];
    signupCount: number;
    waitlist: { available: false; reason: string; formUrl: string };
  };
  communities: {
    rows: {
      id: string;
      name: string;
      initials: string;
      isFounding: boolean;
      hidden: boolean;
      members: number;
      plans: number;
      bulletinPosts: number;
      activeMembers: number;
      lastActivityAt: string | null;
    }[];
  };
  operations: {
    feedback: {
      formUrl: string;
      trackedInApp: false;
      hostNotes: { id: string; thumb: "up" | "down"; note: string; createdAt: string; planTitle: string }[];
    };
    users: { id: string; firstName: string; lastName: string; phoneTail: string; neighborhoodName: string | null; seed: boolean }[];
    system: {
      dashboardMs: number;
      apiLatencyTracked: false;
      appLoadTracked: false;
      sentry: { connected: false; reason: string };
      twilio: { connected: boolean; messages: number | null; priceUsd: number | null; windowDays: number; error: string | null };
      railway: { connected: boolean; environment: string | null; service: string | null };
      anthropic: { connected: boolean };
    };
  };
};

type CommunityDetail = {
  id: string;
  name: string;
  initials: string;
  isFounding: boolean;
  hidden: boolean;
  members: number;
  description: string;
  weeks: { weekStart: string; label: string; newMembers: number; plans: number; bulletinPosts: number; activeMembers: number }[];
};

const PAGES: { id: PageId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "health", label: "Health", icon: Activity },
  { id: "acquisition", label: "Acquisition", icon: UserPlus },
  { id: "communities", label: "Communities", icon: Users },
  { id: "operations", label: "Operations", icon: Settings2 },
];

const MARKS = ["#6f8f72", "#6d7ea0", "#b08968", "#8d6e93", "#5f8f86", "#a35d5d"];
const SNOOZE_KEY = "commons_admin_alert_snooze";

function markColor(name: string): string {
  let n = 0;
  for (const ch of name) n = (n + ch.charCodeAt(0)) % MARKS.length;
  return MARKS[n] ?? MARKS[0];
}

function fmt(n: number | null, digits = 0): string {
  if (n === null || Number.isNaN(n)) return "—";
  return digits ? n.toFixed(digits) : String(Math.round(n));
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`;
}

function fmtDelta(n: number | null): string {
  if (n === null) return "—";
  const rounded = Math.round(n * 10) / 10;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${rounded > 0 ? "+" : ""}${body}`;
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <span className="fdash-spark" aria-hidden="true">
      {values.map((v, i) => (
        <i
          key={i}
          className={i === values.length - 1 ? "is-last" : ""}
          style={{ height: `${v > 0 ? Math.max(12, (v / max) * 100) : 0}%` }}
        />
      ))}
    </span>
  );
}

function DeltaLine({ delta, digits = false }: { delta: number | null; digits?: boolean }) {
  const up = delta !== null && delta > 0;
  const down = delta !== null && delta < 0;
  const shown = digits && delta !== null ? fmtDelta(Math.round(delta * 10) / 10) : fmtDelta(delta);
  return (
    <div className={`fdash-kpi-delta${up ? " is-up" : down ? " is-down" : ""}`}>
      {shown} vs last week
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  spark,
  hint,
}: {
  label: string;
  value: string;
  delta: number | null;
  spark: number[];
  hint?: string;
}) {
  return (
    <article className="fdash-card">
      <div className="fdash-kpi-top">
        <div className="fdash-card-label">{label}</div>
        <Spark values={spark} />
      </div>
      <div className="fdash-kpi-value">{value}</div>
      <DeltaLine delta={delta} digits={label.startsWith("Average")} />
      {hint ? <p className="fdash-muted" style={{ marginTop: 6 }}>{hint}</p> : null}
    </article>
  );
}

function readSnooze(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const page = (PAGES.some((p) => p.id === params.get("page")) ? params.get("page") : "overview") as PageId;
  const communityId = params.get("community");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [snooze, setSnooze] = useState<Record<string, number>>(readSnooze);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api<Dashboard>("/api/admin/dashboard"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      if (msg.startsWith("401:")) setError("Sign in with an admin phone, then come back here.");
      else if (msg.startsWith("403:")) setError("This account isn't on the admin phone list.");
      else setError(msg.replace(/^\d+:\s*/, ""));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setData(await api<Dashboard>("/api/admin/dashboard"));
    } catch {
      // Keep the current dashboard if a follow-up refresh fails.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function go(next: PageId, community?: string | null) {
    const q = new URLSearchParams();
    if (next !== "overview") q.set("page", next);
    if (community) q.set("community", community);
    setParams(q);
  }

  const viewer = data?.viewer;
  const initial = `${(viewer?.firstName?.[0] ?? "A")}${(viewer?.lastName?.[0] ?? "")}`.toUpperCase();

  return (
    <div className="fdash">
      <aside className="fdash-side">
        <div className="fdash-brand">
          <strong>COMMONS</strong>
          <span>Founder admin</span>
        </div>
        <nav className="fdash-nav" aria-label="Admin">
          {PAGES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={page === item.id ? "is-active" : ""}
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => go(item.id)}
              >
                <Icon size={16} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="fdash-me">
          <div className="fdash-avatar" aria-hidden="true">{initial}</div>
          <div>
            <strong>{viewer ? `${viewer.firstName}${viewer.lastName ? ` ${viewer.lastName[0]}.` : ""}` : "Admin"}</strong>
            <span>{viewer?.neighborhoodName ?? "Commons"}</span>
          </div>
        </div>
      </aside>
      <main className="fdash-main">
        {error ? (
          <div className="fdash-error">
            <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 560, marginTop: 0 }}>Commons admin</h1>
            <p className="fdash-muted">{error}</p>
            <p style={{ marginTop: 14 }}>
              <Link to="/onboarding" className="fdash-btn">Sign in</Link>
            </p>
          </div>
        ) : loading && !data ? (
          <p className="fdash-muted">Loading the week…</p>
        ) : data ? (
          <>
            {page === "overview" && (
              <Overview data={data} snooze={snooze} onSnooze={(id) => {
                const next = { ...snooze, [id]: Date.now() + 7 * 86400000 };
                setSnooze(next);
                localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
              }} onOpenCommunity={(id) => go("communities", id)} />
            )}
            {page === "health" && <Health data={data} />}
            {page === "acquisition" && <Acquisition data={data} />}
            {page === "communities" && (
              <Communities
                data={data}
                communityId={communityId}
                onOpen={(id) => go("communities", id)}
                onBack={() => go("communities")}
                onChanged={() => void refresh()}
              />
            )}
            {page === "operations" && (
              <Operations data={data} onSelectUser={setSelectedUserId} onChanged={() => void refresh()} />
            )}
          </>
        ) : null}
      </main>
      {selectedUserId ? (
        <AdminUserDetailModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      ) : null}
    </div>
  );
}

function PageHead({
  title,
  sub,
  updated,
}: {
  title: string;
  sub: string;
  updated?: string;
}) {
  return (
    <header className="fdash-head">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {updated ? <div className="fdash-updated">{updated}</div> : null}
    </header>
  );
}

function Overview({
  data,
  snooze,
  onSnooze,
  onOpenCommunity,
}: {
  data: Dashboard;
  snooze: Record<string, number>;
  onSnooze: (id: string) => void;
  onOpenCommunity: (id: string) => void;
}) {
  const o = data.overview;
  const alerts = o.alerts.filter((a) => (snooze[a.communityId] ?? 0) < Date.now());
  const weekBit = o.weekNumber ? ` · Week ${o.weekNumber} ${o.sinceLabel ?? ""}` : "";
  const maxDau = Math.max(1, ...o.dau.days.map((d) => d.count));
  const first = o.dau.days[0]?.date;
  const last = o.dau.days[o.dau.days.length - 1]?.date;
  const launch = o.dau.days.find((d) => d.date === o.dau.firstSignupDate);

  return (
    <>
      <PageHead
        title="Overview"
        sub={`${o.rangeLabel}${weekBit}${data.seedExcluded ? " · Demo accounts excluded" : ""}`}
        updated={data.updatedLabel}
      />
      <section className="fdash-kpis">
        <Kpi label="Plans completed this week" value={fmt(o.plansCompleted.value)} delta={o.plansCompleted.delta} spark={o.plansCompleted.spark} />
        <Kpi label="Average people per plan" value={fmt(o.avgPeople.value, 1)} delta={o.avgPeople.delta} spark={o.avgPeople.spark} />
        <Kpi label="Plans with zero joins" value={fmt(o.zeroJoins.value)} delta={o.zeroJoins.delta} spark={o.zeroJoins.spark} />
        <Kpi label="Weekly active users" value={fmt(o.wau.value)} delta={o.wau.delta} spark={o.wau.spark} />
      </section>

      <section className="fdash-row">
        <article className="fdash-card">
          <div className="fdash-card-head">
            <h2>Plan funnel</h2>
            <span className="fdash-card-sub">Plans posted this week</span>
          </div>
          <div className="fdash-funnel">
            <FunnelStep label="Posted" value={o.funnel.posted} pct={null} width={o.funnel.posted ? 100 : 0} />
            <FunnelStep label="Joined · 1+ person" value={o.funnel.joined} pct={o.funnel.postedToJoinedPct} width={o.funnel.posted ? (o.funnel.joined / o.funnel.posted) * 100 : 0} />
            <FunnelStep label="Completed" value={o.funnel.completed} pct={o.funnel.joinedToCompletedPct} width={o.funnel.posted ? (o.funnel.completed / o.funnel.posted) * 100 : 0} />
          </div>
          <p className="fdash-note">
            {o.funnel.happenedPct === null
              ? "No plans were posted in this window."
              : `${fmtPct(o.funnel.happenedPct)} of posted plans were marked happened. ${o.funnel.zeroJoins} got no joins${o.funnel.shortNoticeZeroJoins ? ` — ${o.funnel.shortNoticeZeroJoins} of those were posted with under 24 hours' notice` : ""}.`}
          </p>
        </article>
        <article className="fdash-card fdash-alert">
          <div className="fdash-alert-kicker">
            <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--red)" }} />
            NEEDS ATTENTION
            {alerts.length > 0 ? <span className="fdash-alert-count">{alerts.length}</span> : null}
          </div>
          <h2>
            {alerts.length === 0
              ? "Founding communities were active in the last 7 days"
              : `${alerts.length} founding ${alerts.length === 1 ? "community" : "communities"} inactive 7+ days`}
          </h2>
          {alerts.slice(0, 6).map((a) => (
            <div className="fdash-alert-row" key={a.communityId}>
              <button type="button" className="fdash-linkish" onClick={() => onOpenCommunity(a.communityId)}>{a.name}</button>
              <span>{a.daysInactive} days</span>
            </div>
          ))}
          {alerts.length > 0 ? (
            <div className="fdash-alert-actions">
              <button type="button" className="fdash-btn" onClick={() => onOpenCommunity(alerts[0]!.communityId)}>Open community</button>
              <button type="button" className="fdash-btn fdash-btn--ghost" onClick={() => alerts.forEach((a) => onSnooze(a.communityId))}>Snooze</button>
            </div>
          ) : null}
        </article>
      </section>

      <section className="fdash-row fdash-row--even">
        <article className="fdash-card">
          <div className="fdash-card-head">
            <div>
              <h2>Daily active users</h2>
              <p className="fdash-muted">Last 30 days{launch ? ` · first signup ${pretty(launch.date)}` : ""}</p>
            </div>
            <div className="fdash-dau-stat">
              <div className={o.dau.deltaPct !== null && o.dau.deltaPct >= 0 ? "fdash-ok" : "fdash-flag"}>
                {o.dau.deltaPct === null ? "" : `${o.dau.deltaPct > 0 ? "+" : ""}${fmtPct(o.dau.deltaPct)}`}
              </div>
              <strong>{o.dau.yesterday}</strong>
              <div className="fdash-muted">yesterday</div>
            </div>
          </div>
          <div className="fdash-chart" aria-hidden="true">
            {o.dau.days.map((d, i) => (
              <i
                key={d.date}
                className={i === o.dau.days.length - 1 ? "is-last" : ""}
                title={`${d.date}: ${d.count}`}
                style={{ height: `${Math.max(3, (d.count / maxDau) * 100)}%` }}
              />
            ))}
          </div>
          <div className="fdash-chart-axis">
            <span>{first ? pretty(first) : ""}</span>
            <span>{launch && launch.date !== first && launch.date !== last ? "First signup" : ""}</span>
            <span>{last ? pretty(last) : ""}</span>
          </div>
        </article>
        <article className="fdash-card">
          <div className="fdash-card-head">
            <h2>Most active communities</h2>
            <span className="fdash-card-sub">This week</span>
          </div>
          {o.activeCommunities.length === 0 ? (
            <p className="fdash-muted">No approved communities yet.</p>
          ) : (
            <table className="fdash-table">
              <thead>
                <tr>
                  <th>Community</th>
                  <th className="is-num">Members</th>
                  <th className="is-num">Plans</th>
                </tr>
              </thead>
              <tbody>
                {o.activeCommunities.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="fdash-who">
                        <span className="fdash-mark" style={{ background: markColor(c.name) }}>{c.initials}</span>
                        <button type="button" className="fdash-linkish" onClick={() => onOpenCommunity(c.id)}>{c.name}</button>
                      </div>
                    </td>
                    <td className="is-num">{c.members}</td>
                    <td className="is-num">{c.plans}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </section>
    </>
  );
}

function FunnelStep({ label, value, pct, width }: { label: string; value: number; pct: number | null; width: number }) {
  return (
    <div>
      <div className="fdash-funnel-label">
        {label}
        {pct !== null ? <span className="fdash-funnel-pct">{fmtPct(pct)}</span> : null}
      </div>
      <div className="fdash-funnel-num">{value}</div>
      <div className="fdash-hbar"><span style={{ width: `${Math.max(0, Math.min(100, width))}%` }} /></div>
    </div>
  );
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Health({ data }: { data: Dashboard }) {
  const h = data.health;
  const latest = h.retention[0];
  return (
    <>
      <PageHead title="Health" sub="Weekly check · demo accounts excluded" updated={data.updatedLabel} />
      <section className="fdash-metrics">
        <article className="fdash-card">
          <div className="fdash-card-label">Repeat posting rate</div>
          <div className="fdash-metric-value">{fmtPct(h.repeatPosting.ratePct)}</div>
          <p className="fdash-muted">
            {h.repeatPosting.converted} of {h.repeatPosting.eligible} people posted a second plan within 30 days of their first. Only hosts whose first plan is at least 30 days old are counted.
          </p>
        </article>
        <article className="fdash-card">
          <div className="fdash-card-label">Week-4 retention</div>
          <div className="fdash-metric-value">{fmtPct(latest?.ratePct ?? null)}</div>
          <p className="fdash-muted">
            {latest
              ? `Of ${latest.signups} signups in the week of ${pretty(latest.weekStart)}, ${latest.retained} were still active four weeks later.`
              : "No signup week has reached four weeks yet."}
          </p>
          {h.retention.length > 1 ? (
            <table className="fdash-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Signup week</th>
                  <th className="is-num">Signups</th>
                  <th className="is-num">Still active</th>
                </tr>
              </thead>
              <tbody>
                {h.retention.map((row) => (
                  <tr key={row.weekStart}>
                    <td>{pretty(row.weekStart)}</td>
                    <td className="is-num">{row.signups}</td>
                    <td className="is-num">{fmtPct(row.ratePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </article>
        <article className="fdash-card">
          <div className="fdash-card-label">Interested → I'm In</div>
          <div className="fdash-metric-value">{fmtPct(h.interestedToIn.ratePct)}</div>
          <p className="fdash-muted">
            {h.interestedToIn.converted} of {h.interestedToIn.interested} Interested taps became I'm In, from the last {h.interestedToIn.windowDays} days of activity logs.
          </p>
        </article>
        <article className="fdash-card">
          <div className="fdash-card-label">Cross-pollination</div>
          <div className="fdash-metric-value">{fmtPct(h.crossPollination.multiCommunityPct)}</div>
          <p className="fdash-muted">
            {h.crossPollination.multiCommunityUsers} of {h.crossPollination.communityMembers} community members are in more than one community.
            {" "}
            {h.crossPollination.communityPlanJoiners === 0
              ? "Nobody has joined a community plan yet."
              : `${fmtPct(h.crossPollination.outsiderJoinPct)} of people who joined a community plan (${h.crossPollination.outsiderJoinUsers}) weren't a member of that community.`}
          </p>
        </article>
      </section>

      <section className="fdash-row" style={{ marginTop: 14 }}>
        <article className="fdash-card">
          <div className="fdash-card-head">
            <h2>Communities active in the last 7 days</h2>
            <span className="fdash-card-sub">{h.communities.activeCount} active · {h.communities.inactiveCount} quiet</span>
          </div>
          {h.communities.rows.length === 0 ? (
            <p className="fdash-muted">No approved communities yet.</p>
          ) : (
            <table className="fdash-table">
              <thead>
                <tr>
                  <th>Community</th>
                  <th>Status</th>
                  <th className="is-num">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {h.communities.rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="fdash-who">
                        <span className="fdash-mark" style={{ background: markColor(c.name) }}>{c.initials}</span>
                        {c.name}
                      </div>
                    </td>
                    <td>{c.active ? <span className="fdash-ok">Active</span> : <span className="fdash-flag">Inactive{c.daysInactive !== null ? ` · ${c.daysInactive}d` : ""}</span>}</td>
                    <td className="is-num">{c.lastActivityAt ? pretty(c.lastActivityAt.slice(0, 10)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
        <article className="fdash-card">
          <div className="fdash-card-head">
            <h2>Onboarding funnel</h2>
          </div>
          <p className="fdash-muted">Share of signups who reached each saved step. Later steps count as having passed the earlier ones.</p>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {h.onboarding.map((step) => (
              <div key={step.step}>
                <div className="fdash-funnel-label">
                  {step.step}
                  <span className="fdash-funnel-pct">{fmtPct(step.pct)}</span>
                </div>
                <div style={{ fontWeight: 680, marginTop: 2 }}>{step.count}</div>
                <div className="fdash-hbar"><span style={{ width: `${step.pct ?? 0}%` }} /></div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}

function HBars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="fdash-bars">
      {rows.map((row) => (
        <div className="fdash-bar-row" key={row.label}>
          <span>{row.label}</span>
          <i><span style={{ width: `${(row.count / max) * 100}%` }} /></i>
          <b>{row.count}</b>
        </div>
      ))}
    </div>
  );
}

function Acquisition({ data }: { data: Dashboard }) {
  const a = data.acquisition;
  const maxType = Math.max(1, ...a.byType.map((t) => t.signups));
  return (
    <>
      <PageHead
        title="Acquisition"
        sub={`All time · ${a.signupCount} signups. App Store downloads aren't attributed to codes.`}
        updated={data.updatedLabel}
      />
      <section className="fdash-split">
        <article className="fdash-card">
          <div className="fdash-card-head">
            <h2>Invite codes</h2>
            <span className="fdash-card-sub">Redeemed codes · one use each</span>
          </div>
          {a.codes.length === 0 ? (
            <p className="fdash-muted">No invite codes have been redeemed yet. Group-chat and community codes aren't issued.</p>
          ) : (
            <table className="fdash-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th className="is-num">Downloads</th>
                  <th className="is-num">Signups</th>
                  <th className="is-num">Active after 7 days</th>
                  <th className="is-num">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {a.codes.map((c) => (
                  <tr key={c.code}>
                    <td>
                      <div className="fdash-code">{c.code}</div>
                      <div className="fdash-type">{c.label} · {c.ownerName}</div>
                    </td>
                    <td className="is-num">—</td>
                    <td className="is-num">{c.signups}</td>
                    <td className="is-num">{c.activeAfter7d}</td>
                    <td className="is-num" style={{ color: "var(--red)", fontWeight: 700 }}>{fmtPct(c.conversionPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="fdash-note">Conversion = active after 7 days ÷ signups. Downloads per code aren't collected.</p>
        </article>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <article className="fdash-card">
            <div className="fdash-card-head">
              <h2>Signups by age</h2>
              <span className="fdash-card-sub">{a.signupCount}</span>
            </div>
            <HBars rows={a.age} />
          </article>
          <article className="fdash-card">
            <div className="fdash-card-head"><h2>Signups by neighborhood</h2></div>
            <HBars rows={a.neighborhoods.map((n) => ({ label: n.name, count: n.count }))} />
          </article>
        </div>
      </section>
      <section className="fdash-row" style={{ marginTop: 14 }}>
        <article className="fdash-card">
          <div className="fdash-card-head">
            <h2>Signups by code type</h2>
            <span className="fdash-card-sub">Group chat and community codes aren't issued yet</span>
          </div>
          <div className="fdash-chart" style={{ height: 140 }}>
            {a.byType.map((t) => (
              <i key={t.kind} title={t.label} style={{ height: t.signups ? `${Math.max(10, (t.signups / maxType) * 100)}%` : "3px", background: t.signups ? "var(--red)" : "#ddd4c6" }} />
            ))}
          </div>
          <div className="fdash-chart-axis">
            {a.byType.map((t) => <span key={t.kind}>{t.label} · {t.signups}</span>)}
          </div>
        </article>
        <article className="fdash-card">
          <div className="fdash-card-label">Waitlist conversion</div>
          <div className="fdash-metric-value">—</div>
          <p className="fdash-muted">{a.waitlist.reason}</p>
          <p style={{ marginTop: 12 }}>
            <a className="fdash-btn" href={a.waitlist.formUrl} target="_blank" rel="noreferrer">Open waitlist form</a>
          </p>
        </article>
      </section>
    </>
  );
}

function Communities({
  data,
  communityId,
  onOpen,
  onBack,
  onChanged,
}: {
  data: Dashboard;
  communityId: string | null;
  onOpen: (id: string) => void;
  onBack: () => void;
  onChanged: () => void;
}) {
  if (communityId) return <CommunityDetail id={communityId} onBack={onBack} onChanged={onChanged} />;
  return (
    <>
      <PageHead title="Communities" sub="Approved communities · plans are all-time, active members are this week" updated={data.updatedLabel} />
      <article className="fdash-card">
        {data.communities.rows.some((c) => c.isFounding) ? (
          <p className="fdash-muted" style={{ marginTop: 0 }}>
            Hide a founding community to take it off the app and show it again later. Delete removes it and cancels its plans.
          </p>
        ) : null}
        {data.communities.rows.length === 0 ? (
          <p className="fdash-muted">No approved communities yet.</p>
        ) : (
          <table className="fdash-table">
            <thead>
              <tr>
                <th>Community</th>
                <th className="is-num">Members</th>
                <th className="is-num">Plans</th>
                <th className="is-num">Bulletin</th>
                <th className="is-num">Active this week</th>
                <th className="is-num">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {data.communities.rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="fdash-who">
                      <span className="fdash-mark" style={{ background: markColor(c.name) }}>{c.initials}</span>
                      <button type="button" className="fdash-linkish" onClick={() => onOpen(c.id)}>
                        {c.name}
                        {c.isFounding ? <span className="fdash-type"> · Founding</span> : null}
                        {c.hidden ? <span className="fdash-type"> · Hidden</span> : null}
                      </button>
                    </div>
                    {c.isFounding ? (
                      <div style={{ marginTop: 8 }}>
                        <FoundingCommunityControls
                          id={c.id}
                          name={c.name}
                          hidden={c.hidden}
                          hideClassName="fdash-btn fdash-btn--ghost"
                          deleteClassName="fdash-btn"
                          onDone={onChanged}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td className="is-num">{c.members}</td>
                  <td className="is-num">{c.plans}</td>
                  <td className="is-num">{c.bulletinPosts}</td>
                  <td className="is-num">{c.activeMembers}</td>
                  <td className="is-num">{c.lastActivityAt ? pretty(c.lastActivityAt.slice(0, 10)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </>
  );
}

function CommunityDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api<CommunityDetail>(`/api/admin/dashboard/communities/${id}`)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Failed to load"));
    return () => { live = false; };
  }, [id]);
  const maxPlans = Math.max(1, ...(detail?.weeks.map((w) => w.plans) ?? [1]));
  return (
    <>
      <button type="button" className="fdash-back" onClick={onBack}>← All communities</button>
      {!detail ? (
        <p className="fdash-muted">{error ?? "Loading community…"}</p>
      ) : (
        <>
          <PageHead
            title={detail.name}
            sub={`${detail.members} members${detail.isFounding ? " · Founding" : ""}${detail.hidden ? " · Hidden" : ""} · ${detail.description || "No description"}`}
          />
          {detail.isFounding ? (
            <div style={{ margin: "0 0 14px" }}>
              <FoundingCommunityControls
                id={detail.id}
                name={detail.name}
                hidden={detail.hidden}
                hideClassName="fdash-btn fdash-btn--ghost"
                deleteClassName="fdash-btn"
                onDone={(action) => {
                  onChanged();
                  if (action === "delete") onBack();
                  else setDetail((current) => (current ? { ...current, hidden: action === "hide" } : current));
                }}
              />
            </div>
          ) : null}
          <article className="fdash-card">
            <h2>Plans posted by week</h2>
            <div className="fdash-weekbars">
              {detail.weeks.map((w) => (
                <div key={w.weekStart}>
                  <i
                    title={`${w.plans} plans`}
                    style={{
                      height: w.plans ? `${Math.max(10, (w.plans / maxPlans) * 100)}%` : "3px",
                      background: w.plans ? "var(--red)" : "#ddd4c6",
                    }}
                  />
                  <span>{w.label}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="fdash-card" style={{ marginTop: 14 }}>
            <table className="fdash-table">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th className="is-num">New members</th>
                  <th className="is-num">Plans</th>
                  <th className="is-num">Bulletin</th>
                  <th className="is-num">Active members</th>
                </tr>
              </thead>
              <tbody>
                {[...detail.weeks].reverse().map((w) => (
                  <tr key={w.weekStart}>
                    <td>{w.label}</td>
                    <td className="is-num">{w.newMembers}</td>
                    <td className="is-num">{w.plans}</td>
                    <td className="is-num">{w.bulletinPosts}</td>
                    <td className="is-num">{w.activeMembers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </>
      )}
    </>
  );
}

function Operations({
  data,
  onSelectUser,
  onChanged,
}: {
  data: Dashboard;
  onSelectUser: (id: string) => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const sys = data.operations.system;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const named = data.operations.users.filter((u) => u.firstName && u.firstName !== "—" && !u.seed);
    if (!q) return named.slice(0, 8);
    return data.operations.users.filter((u) =>
      `${u.firstName} ${u.lastName} ${u.phoneTail} ${u.neighborhoodName ?? ""}`.toLowerCase().includes(q),
    ).slice(0, 12);
  }, [data.operations.users, query]);
  const twilio = sys.twilio;

  return (
    <>
      <PageHead title="Operations" sub="Queues, safety, and the systems this app depends on" updated={data.updatedLabel} />
      <section className="fdash-sys">
        <article className="fdash-card">
          <div className="fdash-card-label">This dashboard</div>
          <div className="fdash-metric-value" style={{ fontSize: 28 }}>{sys.dashboardMs} ms</div>
          <p className="fdash-muted">Time to build this snapshot. Rolling API latency and app load time aren't recorded.</p>
        </article>
        <article className="fdash-card">
          <div className="fdash-card-label">Sentry</div>
          <div className="fdash-metric-value" style={{ fontSize: 28 }}>—</div>
          <p className="fdash-muted">{sys.sentry.reason}</p>
        </article>
        <article className="fdash-card">
          <div className="fdash-card-label">Twilio SMS · {twilio.windowDays} days</div>
          <div className="fdash-metric-value" style={{ fontSize: 28 }}>
            {twilio.messages === null ? "—" : twilio.messages.toLocaleString()}
          </div>
          <p className="fdash-muted">
            {!twilio.connected
              ? "Twilio credentials aren't set on this server."
              : twilio.error
                ? twilio.error
                : `${twilio.priceUsd === null ? "Cost unavailable" : `$${twilio.priceUsd.toFixed(2)} outbound`} · outbound SMS only, not Verify.`}
          </p>
        </article>
      </section>
      <section className="fdash-sys" style={{ marginTop: 14 }}>
        <ServiceCard
          name="Railway"
          status={sys.railway.connected ? sys.railway.environment || "Connected" : "Not detected in this process"}
          detail={sys.railway.service ? `Service ${sys.railway.service}` : "Production API host"}
          href="https://railway.com"
        />
        <ServiceCard
          name="Twilio"
          status={twilio.connected ? "Credentials set" : "Not configured"}
          detail="Verify for sign-in, Programmable SMS for alerts"
          href="https://console.twilio.com"
        />
        <ServiceCard
          name="Anthropic"
          status={sys.anthropic.connected ? "API key set" : "Not configured"}
          detail="Help chat. Usage isn't pulled into this dashboard."
          href="https://console.anthropic.com"
        />
      </section>

      <section className="fdash-ops" style={{ marginTop: 18 }}>
        <article className="fdash-card">
          <div className="fdash-card-head">
            <h2>Beta feedback</h2>
            <a href={data.operations.feedback.formUrl} target="_blank" rel="noreferrer">Open the form</a>
          </div>
          <p className="fdash-muted">Product feedback is collected in a Google Form, so read/handled status isn't stored here.</p>
          {data.operations.feedback.hostNotes.length > 0 ? (
            <table className="fdash-table" style={{ marginTop: 10 }}>
              <thead>
                <tr><th>In-app host notes</th><th className="is-num">When</th></tr>
              </thead>
              <tbody>
                {data.operations.feedback.hostNotes.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <strong>{n.thumb === "up" ? "Up" : "Down"}</strong> · {n.planTitle}
                      <div className="fdash-muted">{n.note}</div>
                    </td>
                    <td className="is-num">{pretty(n.createdAt.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </article>

        <article className="fdash-card">
          <h2>Look up a member</h2>
          <input className="fdash-search" placeholder="Name, neighborhood, or last 4 of phone" value={query} onChange={(e) => setQuery(e.target.value)} />
          <table className="fdash-table">
            <tbody>
              {matches.map((u) => (
                <tr key={u.id}>
                  <td>
                    <button type="button" className="fdash-linkish" onClick={() => onSelectUser(u.id)}>
                      {u.firstName} {u.lastName}
                    </button>
                    {u.seed ? <span className="fdash-type"> · Seed</span> : null}
                  </td>
                  <td className="is-num">{u.neighborhoodName ?? "—"} · {u.phoneTail || "••••"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <ReviewInbox />
        <CommunitiesReview onChanged={onChanged} />
        <ReportsReview />
        <details className="fdash-card">
          <summary style={{ cursor: "pointer", fontWeight: 680 }}>Event card library</summary>
          <CardImagesManager />
        </details>
      </section>
    </>
  );
}

function ServiceCard({ name, status, detail, href }: { name: string; status: string; detail: string; href: string }) {
  return (
    <article className="fdash-card">
      <div className="fdash-card-head">
        <h2>{name}</h2>
        <a href={href} target="_blank" rel="noreferrer">Open</a>
      </div>
      <p style={{ margin: "4px 0 0", fontWeight: 650 }}>{status}</p>
      <p className="fdash-muted">{detail}</p>
    </article>
  );
}
