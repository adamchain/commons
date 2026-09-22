import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, parseApiError } from "../api/http";
import { Avatar } from "../components/Avatar";
import { CommunityCover } from "../components/CommunityCover";
import { MemberNetworkButton } from "./CommunityDetail";
import {
  COMMUNITY_CATEGORY_LABELS,
  type CommunityDashboardDTO,
  type PublicUser,
} from "../types/shared";
import { formatRelative } from "../lib/format";
import "./Communities.css";

type Section = "analytics" | "requests" | "bulletin" | "members";

function sectionFromParam(raw: string | null): Section {
  if (raw === "requests" || raw === "bulletin" || raw === "members" || raw === "analytics") return raw;
  // Older links used one combined approvals tab.
  if (raw === "approvals") return "requests";
  return "analytics";
}

function personName(user: PublicUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member";
}

function visibilityLabel(value: CommunityDashboardDTO["visibility"]): string {
  return value === "members_only" ? "Members" : "Public";
}


function Bars({
  items,
  accentToday = false,
}: {
  items: { label: string; count: number; isToday?: boolean }[];
  accentToday?: boolean;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <div className="cmy-dash-bars" role="img" aria-label={items.map((item) => `${item.label} ${item.count}`).join(", ")}>
      {items.map((item, index) => {
        const accent = accentToday ? Boolean(item.isToday) : item.count > 0;
        const height = item.count === 0 ? 8 : Math.max(14, Math.round((item.count / max) * 100));
        return (
          <div key={`${item.label}-${index}`} className="cmy-dash-bar-col">
            <div className="cmy-dash-bar-track">
              <div
                className={`cmy-dash-bar${accent ? " is-accent" : ""}`}
                style={{ height: `${height}%` }}
              />
            </div>
            <span className={`cmy-dash-bar-label${item.isToday ? " is-today" : ""}`}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function GrowthChart({ points }: { points: { label: string; count: number }[] }) {
  const w = 300;
  const h = 128;
  const pad = 6;
  const max = Math.max(1, ...points.map((p) => p.count));
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = pad + (1 - p.count / max) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1] ?? [pad, h - pad];
  const first = coords[0] ?? [pad, h - pad];
  const area = `${line} L${last[0].toFixed(1)},${h - pad} L${first[0].toFixed(1)},${h - pad} Z`;
  return (
    <div className="cmy-dash-growth-plot">
      <div className="cmy-dash-growth-axis" aria-hidden="true">
        <span>{max}</span>
        <span>{Math.round(max / 2)}</span>
        <span>0</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="cmy-dash-growth-svg" role="img" aria-label="New members over the last 4 weeks">
        {[0.33, 0.66].map((g) => (
          <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} stroke="rgba(0,0,0,0.06)" />
        ))}
        <path d={area} className="cmy-dash-growth-fill" />
        <path d={line} className="cmy-dash-growth-line" />
      </svg>
    </div>
  );
}

export function CommunityDashboardPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = sectionFromParam(searchParams.get("section"));
  const [data, setData] = useState<CommunityDashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hourMode, setHourMode] = useState(true);
  const [weekday, setWeekday] = useState(0);
  const weekdaySet = useRef(false);
  const [memberQuery, setMemberQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await api<CommunityDashboardDTO>(`/api/communities/${id}/dashboard`);
      setData(next);
      if (!weekdaySet.current) {
        weekdaySet.current = true;
        setWeekday(next.todayWeekday);
      }
      setMissing(false);
    } catch (e) {
      if (e instanceof Error && (e.message.startsWith("403") || e.message.startsWith("404"))) {
        setMissing(true);
      } else {
        setErr(parseApiError(e));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const hourSeries = useMemo(() => {
    return data?.activeTimes.weekdays.find((row) => row.weekday === weekday) ?? data?.activeTimes.weekdays[0];
  }, [data, weekday]);

  async function run(key: string, task: () => Promise<unknown>) {
    if (busyId) return;
    setBusyId(key);
    setErr(null);
    try {
      await task();
      await load();
    } catch (e) {
      setErr(parseApiError(e));
    } finally {
      setBusyId(null);
    }
  }

  function openSection(next: Section) {
    const params = new URLSearchParams(searchParams);
    if (next === "analytics") params.delete("section");
    else params.set("section", next);
    setSearchParams(params, { replace: true });
  }

  if (loading) {
    return (
      <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy">
        <p className="cmy-muted">Loading…</p>
      </main>
    );
  }

  if (missing || !data) {
    return (
      <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy">
        <button type="button" className="cmy-dash-back" aria-label="Back" onClick={() => navigate(`/communities/${id}`)}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <p className="cmy-muted">{err ?? "This dashboard isn’t available."}</p>
      </main>
    );
  }

  const requestCount = data.requests.length;
  const bulletinCount = data.pendingPosts.length;
  const place = data.city?.trim() || "Philadelphia";
  const meta = [place, COMMUNITY_CATEGORY_LABELS[data.category], visibilityLabel(data.visibility)].join(" · ");
  const members = data.memberList.filter((m) => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return true;
    return personName(m.user).toLowerCase().includes(q);
  });
  const delta = data.activityChangePct;
  const growthStart = data.growth.points[0]?.label ?? "";
  const growthEnd = data.growth.points[data.growth.points.length - 1]?.label ?? "";

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy cmy-dash">
      <header className="cmy-dash-head">
        <button type="button" className="cmy-dash-back" aria-label="Back" onClick={() => navigate(`/communities/${id}`)}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="cmy-dash-head-copy">
          <h1>{data.name}</h1>
          <p>Dashboard</p>
        </div>
        <span className="cmy-dash-head-spacer" aria-hidden="true" />
      </header>

      <nav className="cmy-dash-tabs" role="tablist">
        {(
          [
            ["analytics", "Analytics", 0],
            ["requests", "Join requests", requestCount],
            ["bulletin", "Bulletin", bulletinCount],
            ["members", "Members", 0],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            className={`cmy-dash-tab${section === key ? " is-active" : ""}`}
            onClick={() => openSection(key)}
          >
            {label}
            {count > 0 && <span className="cmy-dash-tab-badge">{count}</span>}
          </button>
        ))}
      </nav>

      {err && <p className="cmy-err">{err}</p>}

      {requestCount > 0 && section !== "requests" && (
        <button type="button" className="cmy-dash-notice" onClick={() => openSection("requests")}>
          <span>
            {requestCount} join {requestCount === 1 ? "request" : "requests"} waiting
          </span>
          <span className="cmy-dash-notice-go">Review</span>
        </button>
      )}
      {bulletinCount > 0 && section !== "bulletin" && (
        <button type="button" className="cmy-dash-notice" onClick={() => openSection("bulletin")}>
          <span>
            {bulletinCount} bulletin {bulletinCount === 1 ? "post" : "posts"} waiting
          </span>
          <span className="cmy-dash-notice-go">Review</span>
        </button>
      )}

      {section === "analytics" && (
        <div className="cmy-dash-stack">
          <section className="cmy-dash-card cmy-dash-hero">
            <div className="cmy-dash-hero-cover">
              <CommunityCover coverImage={data.coverImage} category={data.category} className="cmy-cover-fill" iconSize={36} />
            </div>
            <div className="cmy-dash-hero-body">
              <div className="cmy-dash-identity">
                <div className="cmy-dash-thumb">
                  <CommunityCover coverImage={data.coverImage} category={data.category} iconSize={18} />
                </div>
                <div className="cmy-dash-identity-copy">
                  <h2>{data.name}</h2>
                  <p>{meta}</p>
                </div>
              </div>
              <div className="cmy-dash-stats">
                <div>
                  <div className="cmy-dash-stat-num">{data.members}</div>
                  <div className="cmy-dash-stat-label">Members</div>
                </div>
                <div>
                  <div className="cmy-dash-stat-num">{data.activeThisWeek}</div>
                  <div className="cmy-dash-stat-label">Active this week</div>
                </div>
                <div>
                  <div className="cmy-dash-stat-num">{data.interactionsThisWeek}</div>
                  <div className="cmy-dash-stat-label">Interactions</div>
                </div>
              </div>
            </div>
          </section>

          <section className="cmy-dash-card">
            <div className="cmy-dash-card-head">
              <div>
                <h2>Member activity</h2>
                <p>Interactions this week</p>
              </div>
              {delta != null && delta !== 0 && (
                <span className={`cmy-dash-delta${delta > 0 ? " is-up" : " is-down"}`}>
                  {delta > 0 ? "+" : "−"}
                  {Math.abs(delta)}%
                </span>
              )}
              {delta == null && data.interactionsThisWeek > 0 && <span className="cmy-dash-delta is-up">New</span>}
            </div>
            <Bars items={data.activity} accentToday />
          </section>

          <section className="cmy-dash-card">
            <div className="cmy-dash-card-head">
              <h2>Most active times</h2>
              <div className="cmy-dash-mode" role="group" aria-label="Active times">
                <button type="button" className={hourMode ? "is-on" : ""} onClick={() => setHourMode(true)}>
                  Hours
                </button>
                <button type="button" className={!hourMode ? "is-on" : ""} onClick={() => setHourMode(false)}>
                  Days
                </button>
              </div>
            </div>
            {hourMode && hourSeries && (
              <div className="cmy-dash-pager">
                <button
                  type="button"
                  aria-label="Previous day"
                  onClick={() => setWeekday((day) => (day + 6) % 7)}
                >
                  ‹
                </button>
                <span>{hourSeries.label}</span>
                <button
                  type="button"
                  aria-label="Next day"
                  onClick={() => setWeekday((day) => (day + 1) % 7)}
                >
                  ›
                </button>
              </div>
            )}
            <Bars items={hourMode && hourSeries ? hourSeries.hours : data.activeTimes.days} />
          </section>

          <section className="cmy-dash-card">
            <h2>Growth</h2>
            <div className="cmy-dash-legend">
              <span className="cmy-dash-legend-swatch" aria-hidden="true" />
              <span>New members</span>
              <strong>{data.growth.newMembers}</strong>
            </div>
            <GrowthChart points={data.growth.points} />
            <div className="cmy-dash-growth-range">
              <span>{growthStart}</span>
              <span>{growthEnd}</span>
            </div>
          </section>
        </div>
      )}

      {section === "requests" && (
        <div className="cmy-dash-stack">
          <section className="cmy-dash-card">
            <div className="cmy-dash-card-head">
              <h2>Join requests</h2>
              {data.requests.length > 0 && <span className="cmy-dash-count">{data.requests.length}</span>}
            </div>
            {data.requests.length === 0 ? (
              <p className="cmy-dash-empty">Nobody waiting to join.</p>
            ) : (
              <ul className="cmy-dash-people">
                {data.requests.map((m) => {
                  const mutual =
                    m.mutualCount === 1
                      ? "1 mutual connection"
                      : m.mutualCount > 1
                        ? `${m.mutualCount} mutual connections`
                        : formatRelative(m.joinedAt);
                  return (
                    <li key={m.user.id} className="cmy-dash-person">
                      <Avatar
                        seed={m.user.avatarSeed}
                        style={m.user.avatarStyle}
                        photoDataUrl={m.user.avatarPhotoDataUrl}
                        params={m.user.avatarParams}
                        size="sm"
                      />
                      <div className="cmy-dash-person-copy">
                        <span className="cmy-dash-person-name">{personName(m.user)}</span>
                        <span className="cmy-dash-person-sub">{mutual}</span>
                        {m.screeningAnswer && <span className="cmy-dash-person-answer">“{m.screeningAnswer}”</span>}
                      </div>
                      <div className="cmy-dash-person-actions">
                        <button
                          type="button"
                          className="cmy-btn cmy-btn--primary cmy-btn--sm"
                          disabled={busyId !== null}
                          onClick={() =>
                            void run(`approve-${m.user.id}`, () =>
                              api(`/api/communities/${id}/members/${m.user.id}/approve`, { method: "POST" }),
                            )
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="cmy-btn cmy-btn--ghost cmy-btn--sm"
                          disabled={busyId !== null}
                          onClick={() =>
                            void run(`decline-${m.user.id}`, () =>
                              api(`/api/communities/${id}/members/${m.user.id}/decline`, { method: "POST" }),
                            )
                          }
                        >
                          Decline
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {section === "bulletin" && (
        <div className="cmy-dash-stack">
          <section className="cmy-dash-card">
            <div className="cmy-dash-card-head">
              <h2>Bulletin approvals</h2>
              {data.pendingPosts.length > 0 && <span className="cmy-dash-count">{data.pendingPosts.length}</span>}
            </div>
            {data.pendingPosts.length === 0 ? (
              <p className="cmy-dash-empty">No bulletin posts waiting.</p>
            ) : (
              <ul className="cmy-dash-people">
                {data.pendingPosts.map((post) => (
                  <li key={post.id} className="cmy-dash-person">
                    <Avatar
                      seed={post.author.avatarSeed}
                      style={post.author.avatarStyle}
                      photoDataUrl={post.author.avatarPhotoDataUrl}
                      params={post.author.avatarParams}
                      size="sm"
                    />
                    <div className="cmy-dash-person-copy">
                      <span className="cmy-dash-person-name">{personName(post.author)}</span>
                      <span className="cmy-dash-person-sub">{post.content || "Photo"}</span>
                    </div>
                    <div className="cmy-dash-person-actions">
                      <button
                        type="button"
                        className="cmy-btn cmy-btn--primary cmy-btn--sm"
                        disabled={busyId !== null}
                        onClick={() =>
                          void run(`post-approve-${post.id}`, () =>
                            api(`/api/communities/${id}/posts/${post.id}/approve`, { method: "POST" }),
                          )
                        }
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="cmy-btn cmy-btn--ghost cmy-btn--sm"
                        disabled={busyId !== null}
                        onClick={() =>
                          void run(`post-decline-${post.id}`, () =>
                            api(`/api/communities/${id}/posts/${post.id}/decline`, { method: "POST" }),
                          )
                        }
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {section === "members" && (
        <section className="cmy-dash-card">
          <div className="cmy-dash-card-head">
            <h2>Members</h2>
            <span className="cmy-dash-count">{data.memberList.length}</span>
          </div>
          <input
            className="cmy-input cmy-dash-search"
            aria-label="Search members"
            placeholder="Search members…"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
          />
          {members.length === 0 ? (
            <p className="cmy-dash-empty">No members match that search.</p>
          ) : (
            <ul className="cmy-dash-people">
              {members.map((m) => (
                <li key={m.user.id} className="cmy-dash-person">
                  <Avatar
                    seed={m.user.avatarSeed}
                    style={m.user.avatarStyle}
                    photoDataUrl={m.user.avatarPhotoDataUrl}
                    params={m.user.avatarParams}
                    size="sm"
                  />
                  <div className="cmy-dash-person-copy">
                    <span className="cmy-dash-person-name">{personName(m.user)}</span>
                    <span className="cmy-dash-person-sub">Joined {formatRelative(m.joinedAt)}</span>
                  </div>
                  <MemberNetworkButton
                    userId={m.user.id}
                    status={m.networkStatus}
                    requestReceived={m.networkRequestReceived}
                  />
                  {m.role === "organizer" ? (
                    <span className="cmy-org-badge cmy-org-badge--pill">Organizer</span>
                  ) : (
                    <button
                      type="button"
                      className="cmy-icon-btn cmy-remove"
                      disabled={busyId !== null}
                      onClick={() =>
                        void run(`remove-${m.user.id}`, () =>
                          api(`/api/communities/${id}/members/${m.user.id}`, { method: "DELETE" }),
                        )
                      }
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
