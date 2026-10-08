import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  LayoutGrid,
  Map as MapIcon,
  Settings2,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { api } from "../../api/http";
import {
  AdminUserDetailModal,
  CardImagesManager,
  CommunitiesReview,
  FoundingCommunityControls,
  HelpTicketsReview,
  ReportsReview,
  ReviewInbox,
} from "../Admin";
import "./FounderDashboard.css";

type PageId = "overview" | "health" | "acquisition" | "communities" | "users" | "map" | "operations";

type Delta = { value: number | null; previous: number | null; delta: number | null; spark: number[] };

type Dashboard = {
  generatedAt: string;
  updatedLabel: string;
  seedExcluded: number;
  view: {
    dataStart: string;
    today: string;
    from: string;
    to: string;
    communityId: string | null;
    neighborhoodId: string | null;
    includeSeed: boolean;
    preset: "since_launch" | "last_7" | "last_30" | "custom";
    rangeLabel: string;
    compareLabel: string;
    saved: DashFiltersSaved | null;
    options: {
      communities: { id: string; name: string }[];
      neighborhoods: { id: string; name: string }[];
    };
  };
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
      latestLabel: string;
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
    users: {
      id: string;
      firstName: string;
      lastName: string;
      phoneTail: string;
      neighborhoodName: string | null;
      seed: boolean;
      onboardingComplete: boolean;
      createdAt: string;
    }[];
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
  { id: "users", label: "Users", icon: UserRound },
  { id: "map", label: "God view", icon: MapIcon },
  { id: "operations", label: "Operations", icon: Settings2 },
];

const MARKS = ["#6f8f72", "#6d7ea0", "#b08968", "#8d6e93", "#5f8f86", "#a35d5d"];
const SNOOZE_KEY = "commons_admin_alert_snooze";
const FILTER_SESSION_KEY = "commons_admin_dashboard_filters";

type DashPreset = "since_launch" | "last_7" | "last_30" | "custom";

type DashFilters = {
  from: string;
  to: string;
  communityId: string;
  neighborhoodId: string;
  includeSeed: boolean;
  preset: DashPreset;
};

type DashFiltersSaved = {
  from: string;
  to: string;
  preset: DashPreset;
  communityId: string | null;
  neighborhoodId: string | null;
  includeSeed: boolean;
};

function filtersFromView(view: Dashboard["view"]): DashFilters {
  return {
    from: view.from,
    to: view.to,
    communityId: view.communityId ?? "",
    neighborhoodId: view.neighborhoodId ?? "",
    includeSeed: view.includeSeed,
    preset: view.preset,
  };
}

function filtersQuery(filters: DashFilters): string {
  const q = new URLSearchParams();
  q.set("from", filters.from);
  q.set("to", filters.to);
  q.set("preset", filters.preset);
  q.set("communityId", filters.communityId);
  q.set("neighborhoodId", filters.neighborhoodId);
  q.set("includeSeed", filters.includeSeed ? "1" : "0");
  return `?${q.toString()}`;
}

function readSessionFilters(): DashFilters | null {
  try {
    const raw = sessionStorage.getItem(FILTER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DashFilters>;
    if (!parsed.from || !parsed.to || !parsed.preset) return null;
    return {
      from: parsed.from,
      to: parsed.to,
      communityId: parsed.communityId ?? "",
      neighborhoodId: parsed.neighborhoodId ?? "",
      includeSeed: Boolean(parsed.includeSeed),
      preset: parsed.preset,
    };
  } catch {
    return null;
  }
}

function matchesSaved(current: DashFilters, saved: DashFiltersSaved | null, today: string): boolean {
  if (!saved) return false;
  if (current.preset !== saved.preset) return false;
  if ((current.communityId || null) !== (saved.communityId || null)) return false;
  if ((current.neighborhoodId || null) !== (saved.neighborhoodId || null)) return false;
  if (current.includeSeed !== saved.includeSeed) return false;
  if (current.preset !== "custom") return true;
  const savedTo = saved.to === "today" ? today : saved.to;
  return current.from === saved.from && current.to === savedTo;
}

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

function DeltaLine({ delta, compare, digits = false }: { delta: number | null; compare: string; digits?: boolean }) {
  const up = delta !== null && delta > 0;
  const down = delta !== null && delta < 0;
  const shown = digits && delta !== null ? fmtDelta(Math.round(delta * 10) / 10) : fmtDelta(delta);
  return (
    <div className={`fdash-kpi-delta${up ? " is-up" : down ? " is-down" : ""}`}>
      {shown} {compare}
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  spark,
  compare,
  hint,
}: {
  label: string;
  value: string;
  delta: number | null;
  spark: number[];
  compare: string;
  hint?: string;
}) {
  return (
    <article className="fdash-card">
      <div className="fdash-kpi-top">
        <div className="fdash-card-label">{label}</div>
        <Spark values={spark} />
      </div>
      <div className="fdash-kpi-value">{value}</div>
      <DeltaLine delta={delta} compare={compare} digits={label.startsWith("Average")} />
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
  const [filters, setFilters] = useState<DashFilters | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [snooze, setSnooze] = useState<Record<string, number>>(readSnooze);
  const filtersRef = useRef<DashFilters | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async (next?: DashFilters) => {
    const id = ++reqId.current;
    if (!next) setLoading(true);
    setError(null);
    try {
      const payload = await api<Dashboard>("/api/admin/dashboard" + (next ? filtersQuery(next) : ""));
      if (id !== reqId.current) return;
      const applied = filtersFromView(payload.view);
      filtersRef.current = applied;
      setFilters(applied);
      setData(payload);
      sessionStorage.setItem(FILTER_SESSION_KEY, JSON.stringify(applied));
    } catch (e) {
      if (id !== reqId.current) return;
      const msg = e instanceof Error ? e.message : "Failed to load";
      if (msg.startsWith("401:")) setError("Sign in with an admin phone, then come back here.");
      else if (msg.startsWith("403:")) setError("This account isn't on the admin phone list.");
      else setError(msg.replace(/^\d+:\s*/, ""));
      if (!next) setData(null);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = filtersRef.current ?? undefined;
    const id = ++reqId.current;
    try {
      const payload = await api<Dashboard>("/api/admin/dashboard" + (next ? filtersQuery(next) : ""));
      if (id !== reqId.current) return;
      const applied = filtersFromView(payload.view);
      filtersRef.current = applied;
      setFilters(applied);
      setData(payload);
    } catch {
      // Keep the current dashboard if a follow-up refresh fails.
    }
  }, []);

  useEffect(() => {
    void load(readSessionFilters() ?? undefined);
  }, [load]);

  function applyFilters(next: DashFilters) {
    const floor = data?.view.dataStart;
    const today = data?.view.today;
    let from = next.from;
    let to = next.to;
    if (floor && from < floor) from = floor;
    if (today && to > today) to = today;
    if (floor && to < floor) to = floor;
    if (from > to) from = to;
    const fixed = { ...next, from, to };
    filtersRef.current = fixed;
    setFilters(fixed);
    setSaveState("idle");
    setSaveError(null);
    void load(fixed);
  }

  async function saveDefault() {
    const current = filtersRef.current;
    if (!current) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      await api("/api/admin/dashboard/view", {
        method: "PUT",
        body: JSON.stringify({
          from: current.from,
          to: current.preset === "custom" ? current.to : "today",
          preset: current.preset,
          communityId: current.communityId || null,
          neighborhoodId: current.neighborhoodId || null,
          includeSeed: current.includeSeed,
        }),
      });
      setSaveState("idle");
      await load(current);
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Couldn't save the default view");
    }
  }

  async function clearSaved() {
    setSaveError(null);
    try {
      await api("/api/admin/dashboard/view", { method: "DELETE" });
      const floor = data?.view.dataStart ?? filters?.from ?? "";
      const today = data?.view.today ?? filters?.to ?? "";
      applyFilters({
        from: floor,
        to: today,
        preset: "since_launch",
        communityId: "",
        neighborhoodId: "",
        includeSeed: false,
      });
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Couldn't clear the saved view");
    }
  }

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
        ) : data && filters ? (
          <>
            <FilterBar
              filters={filters}
              view={data.view}
              saving={saveState === "saving"}
              saveError={saveError}
              onChange={applyFilters}
              onSave={() => void saveDefault()}
              onClearSaved={() => void clearSaved()}
              onReset={() => applyFilters({
                from: data.view.dataStart,
                to: data.view.today,
                preset: "since_launch",
                communityId: "",
                neighborhoodId: "",
                includeSeed: false,
              })}
            />
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
                filterQuery={filtersQuery(filters)}
                onOpen={(id) => go("communities", id)}
                onBack={() => go("communities")}
                onChanged={() => void refresh()}
              />
            )}
            {page === "users" && (
              <UsersPage data={data} onSelectUser={setSelectedUserId} onChanged={() => void refresh()} />
            )}
            {page === "map" && <GodView filters={filters} onSelectUser={setSelectedUserId} />}
            {page === "operations" && (
              <Operations data={data} onSelectUser={setSelectedUserId} onChanged={() => void refresh()} />
            )}
          </>
        ) : null}
      </main>
      {selectedUserId ? (
        <AdminUserDetailModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onDeleted={() => {
            setSelectedUserId(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function FilterBar({
  filters,
  view,
  saving,
  saveError,
  onChange,
  onSave,
  onClearSaved,
  onReset,
}: {
  filters: DashFilters;
  view: Dashboard["view"];
  saving: boolean;
  saveError: string | null;
  onChange: (next: DashFilters) => void;
  onSave: () => void;
  onClearSaved: () => void;
  onReset: () => void;
}) {
  const saved = matchesSaved(filters, view.saved, view.today);
  const presets: { id: DashPreset; label: string }[] = [
    { id: "since_launch", label: "Since Oct 1" },
    { id: "last_7", label: "Last 7 days" },
    { id: "last_30", label: "Last 30 days" },
  ];
  return (
    <section className="fdash-filters" aria-label="Dashboard filters">
      <div className="fdash-filter-presets">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={filters.preset === preset.id ? "is-on" : ""}
            onClick={() => onChange({ ...filters, preset: preset.id })}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label>
        From
        <input
          type="date"
          min={view.dataStart}
          max={filters.to || view.today}
          value={filters.from}
          onChange={(e) => {
            if (!e.target.value) return;
            onChange({ ...filters, from: e.target.value, preset: "custom" });
          }}
        />
      </label>
      <label>
        To
        <input
          type="date"
          min={filters.from || view.dataStart}
          max={view.today}
          value={filters.to}
          onChange={(e) => {
            if (!e.target.value) return;
            onChange({ ...filters, to: e.target.value, preset: "custom" });
          }}
        />
      </label>
      <label>
        Community
        <select
          value={filters.communityId}
          onChange={(e) => onChange({ ...filters, communityId: e.target.value })}
        >
          <option value="">All communities</option>
          {view.options.communities.map((community) => (
            <option key={community.id} value={community.id}>{community.name}</option>
          ))}
        </select>
      </label>
      <label>
        Neighborhood
        <select
          value={filters.neighborhoodId}
          onChange={(e) => onChange({ ...filters, neighborhoodId: e.target.value })}
        >
          <option value="">All neighborhoods</option>
          {view.options.neighborhoods.map((hood) => (
            <option key={hood.id} value={hood.id}>{hood.name}</option>
          ))}
        </select>
      </label>
      <label className="fdash-check fdash-filter-check">
        <input
          type="checkbox"
          checked={filters.includeSeed}
          onChange={(e) => onChange({ ...filters, includeSeed: e.target.checked })}
        />
        Include demo accounts
      </label>
      <div className="fdash-filter-actions">
        <button type="button" className="fdash-btn" disabled={saving || saved} onClick={onSave}>
          {saving ? "Saving…" : saved ? "Saved as default" : "Save as default"}
        </button>
        <button type="button" className="fdash-btn fdash-btn--ghost" onClick={onReset}>Reset</button>
        {view.saved ? (
          <button type="button" className="fdash-linkish" onClick={onClearSaved}>Clear saved</button>
        ) : null}
      </div>
      <p className="fdash-filter-note">
        Counts start October 1, 2026. Anything earlier is left out.
        {filters.preset === "custom" ? " A custom end date stays fixed." : " Last 7 days, last 30 days, and Since Oct 1 stay current when saved."}
        {saveError ? ` ${saveError}` : ""}
      </p>
    </section>
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
        <Kpi label="Plans completed" value={fmt(o.plansCompleted.value)} delta={o.plansCompleted.delta} spark={o.plansCompleted.spark} compare={data.view.compareLabel} />
        <Kpi label="Average people per plan" value={fmt(o.avgPeople.value, 1)} delta={o.avgPeople.delta} spark={o.avgPeople.spark} compare={data.view.compareLabel} />
        <Kpi label="Plans with zero joins" value={fmt(o.zeroJoins.value)} delta={o.zeroJoins.delta} spark={o.zeroJoins.spark} compare={data.view.compareLabel} />
        <Kpi label="Active users" value={fmt(o.wau.value)} delta={o.wau.delta} spark={o.wau.spark} compare={data.view.compareLabel} />
      </section>

      <section className="fdash-row">
        <article className="fdash-card">
          <div className="fdash-card-head">
            <h2>Plan funnel</h2>
            <span className="fdash-card-sub">Plans posted in this range</span>
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
              <p className="fdash-muted">{data.view.rangeLabel}{launch ? ` · first signup ${pretty(launch.date)}` : ""}</p>
            </div>
            <div className="fdash-dau-stat">
              <div className={o.dau.deltaPct !== null && o.dau.deltaPct >= 0 ? "fdash-ok" : "fdash-flag"}>
                {o.dau.deltaPct === null ? "" : `${o.dau.deltaPct > 0 ? "+" : ""}${fmtPct(o.dau.deltaPct)}`}
              </div>
              <strong>{o.dau.yesterday}</strong>
              <div className="fdash-muted">{o.dau.latestLabel}</div>
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
            <span className="fdash-card-sub">{data.view.rangeLabel}</span>
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
      <PageHead title="Health" sub={`${data.view.rangeLabel} · activity before Oct 1 is excluded`} updated={data.updatedLabel} />
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
            {h.interestedToIn.converted} of {h.interestedToIn.interested} Interested taps became I'm In in this date range.
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
        sub={`${data.view.rangeLabel} · ${a.signupCount} signups. App Store downloads aren't attributed to codes.`}
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
  filterQuery,
  onOpen,
  onBack,
  onChanged,
}: {
  data: Dashboard;
  communityId: string | null;
  filterQuery: string;
  onOpen: (id: string) => void;
  onBack: () => void;
  onChanged: () => void;
}) {
  if (communityId) return <CommunityDetail id={communityId} filterQuery={filterQuery} onBack={onBack} onChanged={onChanged} />;
  return (
    <>
      <PageHead title="Communities" sub={`Pending review, then approved communities · counts are for ${data.view.rangeLabel}`} updated={data.updatedLabel} />
      <CommunitiesReview pendingOnly onChanged={onChanged} />
      <article className="fdash-card">
        <p className="fdash-muted" style={{ marginTop: 0 }}>
          Hide takes a community off the app and keeps its members. Show brings it back. Delete removes it and cancels its plans.
        </p>
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
                  <th className="is-num">Active</th>
                <th className="is-num">Last activity</th>
                <th> </th>
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
                  </td>
                  <td className="is-num">{c.members}</td>
                  <td className="is-num">{c.plans}</td>
                  <td className="is-num">{c.bulletinPosts}</td>
                  <td className="is-num">{c.activeMembers}</td>
                  <td className="is-num">{c.lastActivityAt ? pretty(c.lastActivityAt.slice(0, 10)) : "—"}</td>
                  <td>
                    <FoundingCommunityControls
                      id={c.id}
                      name={c.name}
                      hidden={c.hidden}
                      hideClassName="fdash-btn fdash-btn--ghost"
                      deleteClassName="fdash-btn"
                      onDone={onChanged}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </>
  );
}

function CommunityDetail({ id, filterQuery, onBack, onChanged }: { id: string; filterQuery: string; onBack: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api<CommunityDetail>(`/api/admin/dashboard/communities/${id}${filterQuery}`)
      .then((d) => live && setDetail(d))
      .catch((e) => live && setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Failed to load"));
    return () => { live = false; };
  }, [id, filterQuery]);
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

function UsersPage({
  data,
  onSelectUser,
  onChanged,
}: {
  data: Dashboard;
  onSelectUser: (id: string) => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [deletingTests, setDeletingTests] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const seedCount = data.operations.users.filter((u) => u.seed).length || data.seedExcluded;

  async function deleteTestAccounts() {
    if (seedCount === 0) return;
    if (!window.confirm(`Delete ${seedCount} test account${seedCount === 1 ? "" : "s"}? This can't be undone.`)) return;
    setDeletingTests(true);
    setDeleteError(null);
    try {
      await api("/api/admin/test-accounts/delete", { method: "POST" });
      onChanged();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Couldn't delete test accounts");
    } finally {
      setDeletingTests(false);
    }
  }
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.operations.users
      .filter((u) => {
        if (!q) return true;
        return `${u.firstName} ${u.lastName} ${u.phoneTail} ${u.neighborhoodName ?? ""}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.operations.users, query]);

  return (
    <>
      <PageHead
        title="Users"
        sub={`${rows.length} signed up ${data.view.rangeLabel} · last 4 of the phone only`}
        updated={data.updatedLabel}
      />
      <article className="fdash-card">
        <div className="fdash-userbar">
          <input
            className="fdash-search"
            placeholder="Name, neighborhood, or last 4"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {seedCount > 0 && (
            <button type="button" className="fdash-linkish" disabled={deletingTests} onClick={() => void deleteTestAccounts()}>
              {deletingTests ? "Deleting…" : `Delete ${seedCount} test account${seedCount === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
        {deleteError && <p className="fdash-muted">{deleteError}</p>}
        {rows.length === 0 ? (
          <p className="fdash-muted">No matching accounts.</p>
        ) : (
          <table className="fdash-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Neighborhood</th>
                <th>Phone</th>
                <th>Onboarded</th>
                <th className="is-num">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <button type="button" className="fdash-linkish" onClick={() => onSelectUser(u.id)}>
                      {u.firstName} {u.lastName}
                    </button>
                    {u.seed ? <span className="fdash-type"> · Demo</span> : null}
                  </td>
                  <td>{u.neighborhoodName ?? "—"}</td>
                  <td>{u.phoneTail ? `•••${u.phoneTail}` : "—"}</td>
                  <td>{u.onboardingComplete ? "Yes" : "No"}</td>
                  <td className="is-num">{u.createdAt ? pretty(u.createdAt.slice(0, 10)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </>
  );
}

type GodViewData = {
  people: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    placed: "precise" | "neighborhood";
    neighborhoodName: string | null;
    seed: boolean;
  }[];
  plans: { id: string; title: string; lat: number; lng: number; date: string; upcoming: boolean }[];
  neighborhoods: { name: string; lat: number; lng: number }[];
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  basemap: { center: { lat: number; lng: number }; zoom: number; width: number; height: number };
  outside: { people: number; plans: number };
  heatmap: { matrix: number[][]; max: number; label: string };
};

const HEAT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function GodView({ filters, onSelectUser }: { filters: DashFilters; onSelectUser: (id: string) => void }) {
  const [data, setData] = useState<GodViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSeed, setShowSeed] = useState(filters.includeSeed);
  const [showPlans, setShowPlans] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const query = filtersQuery(filters);

  useEffect(() => {
    setShowSeed(filters.includeSeed);
  }, [filters.includeSeed]);

  useEffect(() => {
    let live = true;
    api<GodViewData>(`/api/admin/map${query}`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Failed to load"));
    return () => { live = false; };
  }, [query]);

  const people = data?.people.filter((p) => showSeed || !p.seed) ?? [];

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const markers: GoogleMarker[] = [];
    void (async () => {
      try {
        const { key } = await api<{ key: string }>("/api/admin/map/key");
        if (cancelled || !mapRef.current) return;
        window.gm_authFailure = () => {
          if (!cancelled) {
            setMapError("Turn on the Maps JavaScript API for this Google Cloud key, then reload.");
          }
        };
        await loadGoogleMaps(key);
        const maps = window.google?.maps;
        if (cancelled || !mapRef.current || !maps) return;
        const map = new maps.Map(mapRef.current, {
          center: data.basemap.center,
          zoom: data.basemap.zoom,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        const add = (
          lat: number,
          lng: number,
          fill: string,
          scale: number,
          title: string,
          onClick?: () => void,
        ) => {
          const marker = new maps.Marker({
            position: { lat, lng },
            map,
            title,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale,
              fillColor: fill,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 1.5,
            },
          });
          if (onClick) marker.addListener("click", onClick);
          markers.push(marker);
        };
        for (const person of data.people) {
          if (!showSeed && person.seed) continue;
          add(
            person.lat,
            person.lng,
            person.placed === "precise" ? "#b04a3f" : "#2a2a32",
            person.placed === "precise" ? 7 : 5,
            person.neighborhoodName ? `${person.name} · ${person.neighborhoodName}` : person.name,
            () => onSelectUser(person.id),
          );
        }
        if (showPlans) {
          for (const plan of data.plans) {
            add(plan.lat, plan.lng, plan.upcoming ? "#6f8f72" : "#8a8478", plan.upcoming ? 6 : 4, `${plan.title} · ${plan.date}`);
          }
        }
        if (!cancelled) setMapError(null);
      } catch (e) {
        if (!cancelled) setMapError(e instanceof Error ? e.message.replace(/^\d+:\s*/, "") : "Google Maps failed to load");
      }
    })();
    return () => {
      cancelled = true;
      for (const marker of markers) marker.setMap(null);
    };
  }, [data, showSeed, showPlans, onSelectUser]);

  return (
    <>
      <PageHead title="God view" sub="People and plans on the map, and when the app is actually used" />
      {error ? <p className="fdash-muted">{error}</p> : null}
      {!data && !error ? <p className="fdash-muted">Loading the map…</p> : null}
      {data ? (
        <>
          <article className="fdash-card">
            <div className="fdash-userbar">
              <label className="fdash-check">
                <input type="checkbox" checked={showPlans} onChange={(e) => setShowPlans(e.target.checked)} />
                Plans
              </label>
              <label className="fdash-check">
                <input type="checkbox" checked={showSeed} onChange={(e) => setShowSeed(e.target.checked)} />
                Demo accounts
              </label>
              <span className="fdash-muted">
                {people.length} on the map · {data.plans.filter((p) => p.upcoming).length} upcoming plans
                {data.outside.people > 0 ? ` · ${data.outside.people} outside Philadelphia` : ""}
              </span>
            </div>
            {mapError ? <p className="fdash-muted">{mapError}</p> : null}
            <div ref={mapRef} className="fdash-gmap" hidden={Boolean(mapError)} role="img" aria-label="Map of members and plans" />
            {mapError ? (
              <GodViewPlot data={data} people={people} showPlans={showPlans} onSelectUser={onSelectUser} />
            ) : null}
            <p className="fdash-muted fdash-map-legend">
              <i className="fdash-dot fdash-dot--person" /> Exact location
              <i className="fdash-dot fdash-dot--hood" /> Placed on their neighborhood
              <i className="fdash-dot fdash-dot--plan" /> Plan
            </p>
          </article>
          <article className="fdash-card" style={{ marginTop: 14 }}>
            <h2>When people use Commons</h2>
            <p className="fdash-muted">{data.heatmap.label}</p>
            <div className="fdash-heat" style={{ gridTemplateColumns: `44px repeat(24, minmax(10px, 1fr))` }}>
              <span />
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} className="fdash-heat-h">{hour % 3 === 0 ? hour : ""}</span>
              ))}
              {data.heatmap.matrix.map((row, day) => (
                <span key={HEAT_DAYS[day]} style={{ display: "contents" }}>
                  <span className="fdash-heat-d">{HEAT_DAYS[day]}</span>
                  {row.map((count, hour) => (
                    <span
                      key={hour}
                      className="fdash-heat-cell"
                      title={`${HEAT_DAYS[day]} ${hour}:00 UTC · ${count}`}
                      style={{ background: heatColor(count, data.heatmap.max) }}
                    />
                  ))}
                </span>
              ))}
            </div>
          </article>
        </>
      ) : null}
    </>
  );
}

function GodViewPlot({
  data,
  people,
  showPlans,
  onSelectUser,
}: {
  data: GodViewData;
  people: GodViewData["people"];
  showPlans: boolean;
  onSelectUser: (id: string) => void;
}) {
  const width = 800;
  const height = 520;
  const frame = data.basemap;
  const project = (lat: number, lng: number) => {
    const origin = mercatorPixel(frame.center.lat, frame.center.lng, frame.zoom);
    const point = mercatorPixel(lat, lng, frame.zoom);
    return {
      x: (frame.width / 2 + (point.x - origin.x)) * (width / frame.width),
      y: (frame.height / 2 + (point.y - origin.y)) * (height / frame.height),
    };
  };
  return (
    <svg className="fdash-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Map of members and plans">
      <rect width={width} height={height} className="fdash-map-bg" />
      {data.neighborhoods.map((hood) => {
        const p = project(hood.lat, hood.lng);
        return (
          <text key={hood.name} x={p.x} y={p.y} className="fdash-map-hood">{hood.name}</text>
        );
      })}
      {showPlans
        ? data.plans.map((plan) => {
            const p = project(plan.lat, plan.lng);
            return (
              <circle key={plan.id} cx={p.x} cy={p.y} r={plan.upcoming ? 5 : 3} className={plan.upcoming ? "fdash-map-plan" : "fdash-map-plan is-past"}>
                <title>{`${plan.title} · ${plan.date}`}</title>
              </circle>
            );
          })
        : null}
      {people.map((person) => {
        const p = project(person.lat, person.lng);
        return (
          <circle
            key={person.id}
            cx={p.x}
            cy={p.y}
            r={4.5}
            className={person.placed === "precise" ? "fdash-map-person is-precise" : "fdash-map-person"}
            onClick={() => onSelectUser(person.id)}
          >
            <title>{person.name}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function mercatorPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  const scale = 256 * 2 ** zoom;
  return {
    x: scale * (0.5 + lng / 360),
    y: scale * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

type GoogleMarker = {
  setMap: (map: null) => void;
  addListener: (event: string, fn: () => void) => void;
};

interface GoogleMapsNamespace {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => unknown;
    Marker: new (opts: Record<string, unknown>) => GoogleMarker;
    SymbolPath: { CIRCLE: number };
  };
}

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    gm_authFailure?: () => void;
  }
}

function loadGoogleMaps(key: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-commons-gmap]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    script.async = true;
    script.dataset.commonsGmap = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
}

function heatColor(count: number, max: number): string {
  if (count <= 0) return "rgba(0,0,0,0.05)";
  const t = Math.max(0.18, count / Math.max(1, max));
  return `rgba(176, 74, 63, ${t})`;
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
        <HelpTicketsReview />
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
