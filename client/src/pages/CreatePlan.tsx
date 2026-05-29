import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import {
  VIBE_OPTIONS,
  type InterestTag,
  type JoinType,
  type NeighborhoodDTO,
  type PlanVisibility,
  type PublicUser,
  type VibeIcon,
} from "../types/shared";

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function CreatePlanPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodDTO[]>([]);
  const prefillName = searchParams.get("name") ?? "";
  const prefillAddress = searchParams.get("address") ?? "";
  const prefillTagParam = searchParams.get("tag");
  const inviteUserId = searchParams.get("inviteUser");
  const inviteUserName = searchParams.get("inviteName");
  const prefillVibe: VibeIcon | null = useMemo(() => {
    if (!prefillTagParam) return null;
    const opt = VIBE_OPTIONS.find((o) => o.tag === prefillTagParam);
    return opt?.id ?? null;
  }, [prefillTagParam]);

  // Default vibes to the user's onboarding interests so the feed map starts
  // pointed at the right communities.
  const defaultVibes = useMemo<VibeIcon[]>(() => {
    if (prefillVibe) return [prefillVibe];
    const userInterests = new Set(user?.interests ?? []);
    return VIBE_OPTIONS.filter((o) => userInterests.has(o.tag)).map((o) => o.id);
  }, [prefillVibe, user?.interests]);

  const [form, setForm] = useState({
    title: "",
    locationName: prefillName,
    locationAddress: prefillAddress,
    locationLat: undefined as number | undefined,
    locationLng: undefined as number | undefined,
    neighborhoodId: user?.neighborhoodIds?.[0] ?? user?.neighborhoodId ?? "",
    date: today(),
    time: "19:00",
    isFlexibleTime: false,
    isFlexibleLocation: false,
    isFlexibleDate: false,
    vibes: defaultVibes,
    description: "",
    visibility: (inviteUserId ? "network" : "everyone") as PlanVisibility,
    capacityOn: false,
    capacity: "6",
    joinType: "open" as JoinType,
    isRecurring: false,
    flyerDataUrl: null as string | null,
    flyerLinkUrl: "",
    flyerLinkPreview: null as null | {
      title?: string;
      description?: string;
      image?: string;
      siteName?: string;
    },
  });
  const [submitting, setSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<PublicUser[] | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(() =>
    inviteUserId ? new Set([inviteUserId]) : new Set(),
  );
  const navigate = useNavigate();
  const flyerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api<NeighborhoodDTO[]>("/api/neighborhoods").then(setNeighborhoods).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!inviteUserId) return;
    void api<{ users: PublicUser[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]));
  }, [inviteUserId]);

  const seededOutsideNetwork = useMemo(() => {
    if (!inviteUserId || !inviteUserName || !network) return null;
    if (network.some((u) => u.id === inviteUserId)) return null;
    return { id: inviteUserId, firstName: inviteUserName };
  }, [inviteUserId, inviteUserName, network]);

  const toggleInvited = (id: string) => {
    setInvitedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const first = user?.neighborhoodIds?.[0] ?? user?.neighborhoodId;
    if (first && !form.neighborhoodId) {
      setForm((f) => ({ ...f, neighborhoodId: first }));
    }
  }, [user, form.neighborhoodId]);

  const resolvedTags = useMemo<InterestTag[]>(() => {
    const set = new Set<InterestTag>();
    for (const id of form.vibes) {
      const opt = VIBE_OPTIONS.find((o) => o.id === id);
      if (opt) set.add(opt.tag);
    }
    return Array.from(set);
  }, [form.vibes]);

  // A "looking for" plan = at least one of date/time/location is flexible.
  // We derive planKind from the flex toggles rather than asking up-front.
  const planKind = form.isFlexibleDate || form.isFlexibleTime || form.isFlexibleLocation
    ? "looking_for"
    : "standard";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Give your plan a title.");
      return;
    }
    if (!form.neighborhoodId && !form.isFlexibleLocation) {
      setError("Pick a neighborhood or toggle flexible.");
      return;
    }
    if (!form.isFlexibleDate && !form.date) {
      setError("Pick a day or toggle date flexible.");
      return;
    }

    const capacityNum = form.capacityOn ? Number(form.capacity) : null;
    if (capacityNum !== null && (!Number.isFinite(capacityNum) || capacityNum < 1)) {
      setError("Spots must be a positive number, or leave open.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await api<{ id: string }>("/api/plans", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          neighborhoodId: form.neighborhoodId,
          location: {
            name: form.locationName.trim(),
            address: form.locationAddress.trim() || form.locationName.trim(),
            lat: form.locationLat,
            lng: form.locationLng,
          },
          date: form.isFlexibleDate ? today() : form.date,
          time: form.isFlexibleTime ? "" : form.time,
          isFlexibleTime: form.isFlexibleTime || form.isFlexibleDate,
          isFlexibleLocation: form.isFlexibleLocation,
          tags: resolvedTags,
          description: form.description.trim() || undefined,
          hostEmoji: VIBE_OPTIONS.find((o) => o.id === form.vibes[0])?.emoji ?? "✨",
          planKind,
          visibility: form.visibility,
          capacity: capacityNum,
          joinType: form.joinType,
          isRecurring: form.isRecurring,
          flyerDataUrl: form.flyerDataUrl ?? undefined,
          flyerLinkUrl: form.flyerLinkUrl.trim() || undefined,
          flyerLinkPreview: form.flyerLinkPreview ?? undefined,
        }),
      });
      if (invitedIds.size > 0) {
        try {
          await api(`/api/plans/${created.id}/invite`, {
            method: "POST",
            body: JSON.stringify({ userIds: [...invitedIds] }),
          });
        } catch {
          /* best-effort — user can invite again from the plan */
        }
      }
      navigate("/", { state: { justPostedId: created.id, openInviteForPlanId: created.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleVibe = (id: VibeIcon) => {
    setForm((prev) => ({
      ...prev,
      vibes: prev.vibes.includes(id) ? prev.vibes.filter((v) => v !== id) : [...prev.vibes, id],
    }));
  };

  const onFlyerPick = (file: File) => {
    fileToResizedDataUrl(file)
      .then((dataUrl) => setForm((f) => ({ ...f, flyerDataUrl: dataUrl })))
      .catch(() => setError("Couldn't read that image. Try another."));
  };

  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const fetchLinkPreview = async (rawUrl: string) => {
    setLinkError(null);
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      setForm((f) => ({ ...f, flyerLinkUrl: "", flyerLinkPreview: null }));
      return;
    }
    // Tolerate "example.com" without a scheme.
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    setLinkBusy(true);
    try {
      const preview = await api<{
        url: string;
        title?: string;
        description?: string;
        image?: string;
        siteName?: string;
      }>("/api/link-preview", {
        method: "POST",
        body: JSON.stringify({ url: withScheme }),
      });
      setForm((f) => ({
        ...f,
        flyerLinkUrl: preview.url,
        flyerLinkPreview: {
          title: preview.title,
          description: preview.description,
          image: preview.image,
          siteName: preview.siteName,
        },
      }));
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Couldn't load preview");
      // Keep the URL string so the user can still post even if the preview
      // failed (some sites block scrapers).
      setForm((f) => ({ ...f, flyerLinkUrl: withScheme, flyerLinkPreview: null }));
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <main className="app-shell app-shell--mid">
      <header className="app-header app-header--minimal">
        <Link to="/" className="detail-back">
          ← Back
        </Link>
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>
        New plan
      </h1>
      <p className="brand-tagline" style={{ marginBottom: 24 }}>
        Fill what you know · toggle what's flexible
      </p>

      {inviteUserId && inviteUserName && (
        <div className="create-plan-invite-banner" role="note">
          Inviting <strong>{inviteUserName}</strong>
          {invitedIds.size > 1 && ` + ${invitedIds.size - 1} more`} once you post ·{" "}
          {form.visibility === "network"
            ? "Visible to your network"
            : "Visible to everyone on COMMONS"}
        </div>
      )}

      <form onSubmit={(event) => void submit(event)} className="form-card">
        {/* Title */}
        <section className="form-section">
          <label className="form-question" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            placeholder="Trivia at National Mechanics"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </section>

        {/* Where — specific venue (Google place) + neighborhood */}
        <section className="form-section">
          <label className="form-question">Where</label>
          <PlacePicker
            value={form.locationName}
            address={form.locationAddress}
            onChange={(name) =>
              setForm((f) => ({
                ...f,
                locationName: name,
                locationLat: undefined,
                locationLng: undefined,
              }))
            }
            onSelect={(p) =>
              setForm((f) => ({
                ...f,
                locationName: p.name,
                locationAddress: p.address,
                locationLat: p.lat,
                locationLng: p.lng,
              }))
            }
            onClear={() =>
              setForm((f) => ({
                ...f,
                locationName: "",
                locationAddress: "",
                locationLat: undefined,
                locationLng: undefined,
              }))
            }
          />
          <div className="form-row-flex">
            <div className="form-row-flex-main">
              <label className="form-sublabel" htmlFor="neighborhood">
                Neighborhood
              </label>
              <select
                id="neighborhood"
                value={form.neighborhoodId}
                onChange={(e) => setForm((f) => ({ ...f, neighborhoodId: e.target.value }))}
              >
                <option value="">Whereabouts…</option>
                {neighborhoods.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <FlexToggle
              active={form.isFlexibleLocation}
              onClick={() => setForm((f) => ({ ...f, isFlexibleLocation: !f.isFlexibleLocation }))}
              label="Flexible"
            />
          </div>
        </section>

        {/* When — date + time side by side */}
        <section className="form-section">
          <label className="form-question">When</label>
          <div className="form-when-grid">
            <div className="form-when-cell">
              <span className="form-sublabel">Date</span>
              {!form.isFlexibleDate ? (
                <input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              ) : (
                <div className="form-flex-placeholder">Flexible day</div>
              )}
              <FlexToggle
                active={form.isFlexibleDate}
                onClick={() => setForm((f) => ({ ...f, isFlexibleDate: !f.isFlexibleDate }))}
                label="Flexible"
              />
            </div>
            <div className="form-when-cell">
              <span className="form-sublabel">Time</span>
              {!form.isFlexibleTime ? (
                <input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                />
              ) : (
                <div className="form-flex-placeholder">Flexible time</div>
              )}
              <FlexToggle
                active={form.isFlexibleTime}
                onClick={() => setForm((f) => ({ ...f, isFlexibleTime: !f.isFlexibleTime }))}
                label="Flexible"
              />
            </div>
          </div>
        </section>

        {/* Interests — defaults to the user's onboarding interests. */}
        <section className="form-section">
          <label className="form-question">Interests</label>
          <div className="vibe-grid">
            {VIBE_OPTIONS.map((opt) => {
              const selected = form.vibes.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`vibe-tile ${selected ? "is-selected" : ""}`}
                  onClick={() => toggleVibe(opt.id)}
                  aria-pressed={selected}
                >
                  <span className="vibe-tile-emoji" aria-hidden="true">{opt.emoji}</span>
                  <span className="vibe-tile-label">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Details */}
        <section className="form-section">
          <label className="form-question" htmlFor="description">
            Details
          </label>
          <textarea
            id="description"
            placeholder="Anything else — vibes, dress code, who else is invited…"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </section>

        {/* Advanced options — collapsed by default to keep the form short */}
        <button
          type="button"
          className="create-more-toggle"
          onClick={() => setShowMore((s) => !s)}
          aria-expanded={showMore}
        >
          <span className="create-more-toggle-main">
            {showMore ? "Fewer options" : "More options"}
          </span>
          <span className="create-more-toggle-sub">Visibility · spots · repeat · flyer</span>
          <ChevronIcon open={showMore} />
        </button>

        {showMore && (
          <div className="create-more">
            {/* Visibility — who can see this plan on the feed */}
            <section className="form-section">
              <label className="form-question">Who can see this?</label>
              <div className="visibility-options">
                <button
                  type="button"
                  className={`visibility-option ${form.visibility === "everyone" ? "is-active" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
                  aria-pressed={form.visibility === "everyone"}
                >
                  <span className="visibility-option-title">Everyone on COMMONS</span>
                  <span className="visibility-option-sub">Open to anyone in your neighborhood</span>
                </button>
                <button
                  type="button"
                  className={`visibility-option ${form.visibility === "network" ? "is-active" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, visibility: "network" }))}
                  aria-pressed={form.visibility === "network"}
                >
                  <span className="visibility-option-title">Your Network</span>
                  <span className="visibility-option-sub">Only people you've added show up</span>
                </button>
                <button
                  type="button"
                  className="visibility-option is-disabled"
                  disabled
                  aria-disabled="true"
                >
                  <span className="visibility-option-title">
                    Communities <span className="visibility-option-pill">Coming soon</span>
                  </span>
                  <span className="visibility-option-sub">Run clubs, book clubs, recurring crews</span>
                </button>
              </div>
            </section>

            {/* Spots — toggle for open vs capped */}
            <section className="form-section">
              <div className="form-row-flex">
                <div className="form-row-flex-main">
                  <label className="form-question">Spots available</label>
                  {!form.capacityOn ? (
                    <p className="form-help" style={{ marginTop: 4 }}>
                      Open — no cap on who can join
                    </p>
                  ) : (
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      placeholder="e.g. 6"
                      value={form.capacity}
                      onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                    />
                  )}
                </div>
                <FlexToggle
                  active={form.capacityOn}
                  onClick={() => setForm((f) => ({ ...f, capacityOn: !f.capacityOn }))}
                  label="Set cap"
                />
              </div>

              {form.capacityOn && (
                <>
                  <label className="form-question" style={{ marginTop: 12 }}>
                    How do people get in?
                  </label>
                  <div className="segmented">
                    <button
                      type="button"
                      className={form.joinType === "open" ? "is-active" : ""}
                      onClick={() => setForm((f) => ({ ...f, joinType: "open" }))}
                    >
                      First come
                    </button>
                    <button
                      type="button"
                      className={form.joinType === "approve" ? "is-active" : ""}
                      onClick={() => setForm((f) => ({ ...f, joinType: "approve" }))}
                    >
                      Pick from applicants
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Repeats weekly */}
            <section className="form-section">
              <label className="flex-toggle">
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                />
                Repeats weekly
              </label>
            </section>

            {/* Flyer — image upload OR link with preview */}
            <section className="form-section">
              <label className="form-question">Flyer (optional)</label>
              <p className="form-help">Upload a screenshot or paste a link — it'll show on the card.</p>
              <div className="flyer-uploader">
            {form.flyerDataUrl ? (
              <div className="flyer-preview">
                <img src={form.flyerDataUrl} alt="" />
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setForm((f) => ({ ...f, flyerDataUrl: null }))}
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-secondary btn-block"
                onClick={() => flyerRef.current?.click()}
              >
                Upload flyer
              </button>
            )}
            <input
              ref={flyerRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFlyerPick(f);
                if (flyerRef.current) flyerRef.current.value = "";
              }}
            />
          </div>

          <label className="form-question" htmlFor="flyer-link" style={{ marginTop: 12 }}>
            Or paste a link
          </label>
          <input
            id="flyer-link"
            type="url"
            placeholder="https://…"
            value={form.flyerLinkUrl}
            onChange={(e) => setForm((f) => ({ ...f, flyerLinkUrl: e.target.value }))}
            onBlur={(e) => void fetchLinkPreview(e.target.value)}
            disabled={linkBusy}
          />
          {linkBusy && <p className="form-help">Loading preview…</p>}
          {linkError && <p className="form-help" style={{ color: "var(--color-danger, #c0392b)" }}>{linkError}</p>}
          {form.flyerLinkPreview && (
            <div className="link-preview" style={{ marginTop: 8 }}>
              {form.flyerLinkPreview.image && (
                <img src={form.flyerLinkPreview.image} alt="" className="link-preview-image" />
              )}
              <div className="link-preview-body">
                {form.flyerLinkPreview.siteName && (
                  <div className="link-preview-site">{form.flyerLinkPreview.siteName}</div>
                )}
                {form.flyerLinkPreview.title && (
                  <div className="link-preview-title">{form.flyerLinkPreview.title}</div>
                )}
                {form.flyerLinkPreview.description && (
                  <div className="link-preview-desc">{form.flyerLinkPreview.description}</div>
                )}
              </div>
              <button
                type="button"
                className="btn-link"
                onClick={() => setForm((f) => ({ ...f, flyerLinkUrl: "", flyerLinkPreview: null }))}
              >
                Remove
              </button>
            </div>
          )}
            </section>
          </div>
        )}

        {inviteUserId && (
          <section className="form-section">
            <label className="form-question">Invite from your network</label>
            <p className="form-help">
              {inviteUserName ? <><strong>{inviteUserName}</strong> is already added. </> : null}
              Pick anyone else you want in on this.
            </p>
            {network === null && <p className="form-help">Loading…</p>}
            {network !== null && network.length === 0 && !seededOutsideNetwork && (
              <p className="form-help">No one in your network yet — you can still post.</p>
            )}
            {(network && network.length > 0) || seededOutsideNetwork ? (
              <div className="invite-people-list">
                {seededOutsideNetwork && (
                  <button
                    type="button"
                    className="invite-person is-picked"
                    disabled
                    aria-pressed
                  >
                    <Avatar seed={seededOutsideNetwork.id} style="avataaars" name={seededOutsideNetwork.firstName} size="sm" />
                    <span className="invite-person-name">{seededOutsideNetwork.firstName}</span>
                    <span className="invite-person-check">✓</span>
                  </button>
                )}
                {network?.map((u) => {
                  const picked = invitedIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`invite-person ${picked ? "is-picked" : ""}`}
                      onClick={() => toggleInvited(u.id)}
                      aria-pressed={picked}
                    >
                      <Avatar
                        seed={u.avatarSeed}
                        style={u.avatarStyle}
                        photoDataUrl={u.avatarPhotoDataUrl}
                        params={u.avatarParams}
                        name={u.firstName}
                        size="sm"
                      />
                      <span className="invite-person-name">{u.firstName}</span>
                      {picked && <span className="invite-person-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        )}

        {error && <p className="error-text">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Posting…" : "Post it"}
        </button>
      </form>
    </main>
  );
}

function FlexToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`flex-toggle-btn ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      title={label}
    >
      <FlexIcon />
      <span>{label}</span>
    </button>
  );
}

function FlexIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
      <path d="m12 5-7 7 7 7" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`create-more-chevron ${open ? "is-open" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

interface PlaceHit {
  placeId: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
}

/**
 * Google-Places-backed venue picker. Free-text typing is kept as a custom
 * venue name (onChange); choosing a suggestion fills name + address + coords
 * (onSelect). Falls back gracefully to plain text when Places isn't configured.
 */
function PlacePicker({
  value,
  address,
  onChange,
  onSelect,
  onClear,
}: {
  value: string;
  address: string;
  onChange: (name: string) => void;
  onSelect: (p: { name: string; address: string; lat?: number; lng?: number }) => void;
  onClear: () => void;
}) {
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Seed true when a venue is already filled (e.g. prefilled from Explore) so
  // we don't auto-search and pop the dropdown on mount.
  const skipNextSearch = useRef(value.trim().length >= 2);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      void api<{ results: PlaceHit[] }>(`/api/places/search?q=${encodeURIComponent(q)}`)
        .then((r) => {
          setResults(r.results);
          setOpen(r.results.length > 0);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const choose = (p: PlaceHit) => {
    skipNextSearch.current = true;
    onSelect({ name: p.name, address: p.address, lat: p.lat, lng: p.lng });
    setOpen(false);
    setResults([]);
  };

  const hasPickedAddress = Boolean(address && address !== value);

  return (
    <div className="place-picker">
      <div className="place-picker-field">
        <PinIcon />
        <input
          type="text"
          placeholder="Search a venue, or type your own"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            className="place-picker-clear"
            onClick={() => {
              onClear();
              setResults([]);
              setOpen(false);
            }}
            aria-label="Clear place"
          >
            ×
          </button>
        )}
      </div>
      {loading && <p className="form-help">Searching…</p>}
      {hasPickedAddress && !open && <p className="place-picker-chosen">📍 {address}</p>}
      {open && results.length > 0 && (
        <ul className="place-picker-results" role="listbox">
          {results.map((p) => (
            <li key={p.placeId}>
              <button type="button" className="place-picker-result" onClick={() => choose(p)}>
                <span className="place-picker-result-name">{p.name}</span>
                {p.address && <span className="place-picker-result-addr">{p.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
