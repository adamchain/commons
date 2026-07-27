import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/http";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import { useCardImages } from "../lib/cardImages";
import { NumberPicker } from "../components/NumberPicker";
import {
  VIBE_OPTIONS,
  type InterestTag,
  type JoinType,
  type PlanDTO,
  type PlanVisibility,
  type PublicUser,
  type VibeIcon,
} from "../types/shared";

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const MIN_LEAD_MINUTES = 15;

/** "HH:MM" floor for a same-day time picker — now plus a grace window. */
const minTimeForToday = (): string => {
  const d = new Date(Date.now() + MIN_LEAD_MINUTES * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Recurrence cadence for the "Repeats" dropdown (Zoom-style). Maps to the
// existing `isRecurring` boolean on the plan; finer cadence is sent as
// `recurrence` for forward-compat.
type Recurrence = "none" | "weekly" | "biweekly" | "monthly";

// Single-letter labels for the weekly day picker, indexed Sun..Sat to match
// Date.getDay().
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Day-of-week (0=Sun) for a YYYY-MM-DD string, parsed in local time to avoid
// the UTC-midnight off-by-one that `new Date("2026-06-23")` produces.
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};

// The upcoming Saturday (or today, if today already is one) — used as the
// anchor date for "That week" ideas so the plan still sorts/shows sensibly
// on the feed without needing a dedicated "loose week" concept server-side.
const endOfThisWeek = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + (6 - d.getDay()));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// F.11 — loose date buckets for "Just an idea" (specific day, sometime this
// week, or fully open-ended).
type IdeaDateMode = "specific" | "week" | "anytime";

// F.10 — placeholder copy rotates through these so the empty field doesn't
// feel like a blank homework assignment.
const IDEA_PLACEHOLDERS = [
  "Want to try a yoga class?",
  "Free for a drink on Thursday?",
  "Want to cross something off your Philly bucket list?",
  "Anyone up for a walk this weekend?",
  "Looking for a coffee shop to work from — join me?",
  "Free Saturday, someone pick something",
  "New to the city — show me your favorite spot",
];

// Tappable starters — short chip label mapped to the fuller phrase it drops
// into the field.
const IDEA_STARTER_CHIPS: { label: string; text: string }[] = [
  { label: "Yoga class", text: "Want to try a yoga class?" },
  { label: "Drinks Thursday", text: "Free for a drink on Thursday?" },
  { label: "Bucket list", text: "Want to cross something off your Philly bucket list?" },
  { label: "Weekend walk", text: "Anyone up for a walk this weekend?" },
];

export function CreatePlanPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // "Host another like this →" on a past plan's card navigates here with
  // { hostAgainFrom: planId } in nav state — prefill from that plan below.
  const hostAgainFrom = (location.state as { hostAgainFrom?: string } | null)?.hostAgainFrom ?? null;
  // "Make this a plan" from an Interest Forum navigates here with
  // { fromForumTag: tag } — preselect that interest as the plan's vibe.
  const fromForumTag = (location.state as { fromForumTag?: string } | null)?.fromForumTag ?? null;
  const prefillName = searchParams.get("name") ?? "";
  const prefillAddress = searchParams.get("address") ?? "";
  // "Do it again" seeds the title from a past plan, and carries that plan's
  // crew + group chat forward via fromPlanId (handled server-side on create).
  const prefillTitle = searchParams.get("title") ?? "";
  const fromPlanId = searchParams.get("fromPlanId");
  // 0.9 — arriving here to recreate a past plan (either "Host another like
  // this" or "Do it again") should send Back to that plan, not into a blank
  // New Plan flow.
  const backToSourceId = hostAgainFrom ?? fromPlanId ?? null;
  const prefillTagParam = searchParams.get("tag");
  const inviteUserId = searchParams.get("inviteUser");
  const inviteUserName = searchParams.get("inviteName");
  // Plural variant from the chat-to-plan re-plan flow — seeds multiple
  // invitees at once. inviteNames is parallel to inviteUserIds.
  const inviteUserIdsParam = searchParams.get("inviteUserIds") ?? "";
  const inviteUserIds = useMemo(
    () => inviteUserIdsParam.split(",").map((s) => s.trim()).filter(Boolean),
    [inviteUserIdsParam],
  );
  const inviteNamesParam = searchParams.get("inviteNames") ?? "";
  const inviteNames = useMemo(
    () => inviteNamesParam.split(",").map((s) => s.trim()).filter(Boolean),
    [inviteNamesParam],
  );
  const prefillVibe: VibeIcon | null = useMemo(() => {
    if (!prefillTagParam) return null;
    const opt = VIBE_OPTIONS.find((o) => o.tag === prefillTagParam);
    return opt?.id ?? null;
  }, [prefillTagParam]);

  const forumVibe: VibeIcon | null = useMemo(() => {
    if (!fromForumTag) return null;
    const opt = VIBE_OPTIONS.find((o) => o.tag === fromForumTag);
    return opt?.id ?? null;
  }, [fromForumTag]);

  // Interests start empty so the host consciously tags the plan — pre-checking
  // their onboarding interests led to mis-tagged plans. A prefill from Explore
  // (e.g. a venue's vibe) or "Make this a plan" from a forum still seeds a
  // single tag.
  const defaultVibes = useMemo<VibeIcon[]>(() => {
    if (forumVibe) return [forumVibe];
    if (prefillVibe) return [prefillVibe];
    return [];
  }, [forumVibe, prefillVibe]);

  const [form, setForm] = useState({
    title: prefillTitle,
    locationName: prefillName,
    locationAddress: prefillAddress,
    locationLat: undefined as number | undefined,
    locationLng: undefined as number | undefined,
    locationPlaceId: undefined as string | undefined,
    neighborhoodId: user?.neighborhoodIds?.[0] ?? user?.neighborhoodId ?? "",
    date: today(),
    time: "19:00",
    isFlexibleTime: false,
    isFlexibleLocation: false,
    isFlexibleDate: false,
    vibes: defaultVibes,
    description: "",
    visibility: (inviteUserId || inviteUserIds.length > 0 ? "network" : "everyone") as PlanVisibility,
    capacityOn: false,
    capacity: "6",
    joinType: "open" as JoinType,
    recurrence: "none" as Recurrence,
    // Weekdays (0=Sun) the plan repeats on, Zoom-style. Seeded from the start
    // date; only used when recurrence is weekly/biweekly.
    repeatDays: [weekdayOf(today())] as number[],
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
  // Step 1 — user picks Make a plan (full form) vs Just an idea (loose, looking_for).
  // Skipped automatically when arriving with an invite seed.
  type Path = "choose" | "plan" | "idea";
  const [path, setPath] = useState<Path>(
    inviteUserId || inviteUserIds.length > 0 || prefillTitle || prefillName || hostAgainFrom || fromForumTag
      ? "plan"
      : "choose",
  );
  // Carries the source plan id server-side so "Host another like this" also
  // pulls the previous crew + group chat forward, same as "Do it again".
  const [carryFromId, setCarryFromId] = useState<string | null>(fromPlanId);
  // The path selector now requires an explicit pick + Continue rather than
  // navigating on the first tap.
  const [pendingPath, setPendingPath] = useState<"plan" | "idea" | null>(null);
  const [network, setNetwork] = useState<PublicUser[] | null>(null);

  // Community tagging — when arriving from a community's "Post a plan" button
  // (?communityId=…), the plan is tagged to that community and the host picks
  // whether it's public (feed + community) or community-only.
  const communityId = searchParams.get("communityId");
  const [communityName, setCommunityName] = useState<string | null>(null);
  const [communityVisibility, setCommunityVisibility] = useState<"public" | "community_only">(
    "public",
  );
  useEffect(() => {
    if (!communityId) return;
    let alive = true;
    api<{ name: string }>(`/api/communities/${communityId}`)
      .then((c) => {
        if (alive) setCommunityName(c.name);
      })
      .catch(() => {
        /* tag still sends; banner just won't show a name */
      });
    return () => {
      alive = false;
    };
  }, [communityId]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(() => {
    const seed = new Set<string>();
    if (inviteUserId) seed.add(inviteUserId);
    for (const id of inviteUserIds) seed.add(id);
    return seed;
  });
  const navigate = useNavigate();
  const flyerRef = useRef<HTMLInputElement>(null);
  const coverPool = useCardImages();
  const [showCoverLib, setShowCoverLib] = useState(false);

  // F.6 — inline "what's missing" guidance. Errors only render once the host
  // has actually tried to post, so the form doesn't nag while they're still
  // filling it out.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const locationCardRef = useRef<HTMLDivElement>(null);
  const dateCardRef = useRef<HTMLDivElement>(null);
  const capacityRowRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Always load the user's network once — needed for both the
    // "Inviting [name]" seeded flow and the hand-pick picker inside the
    // Your Network visibility option.
    void api<{ users: PublicUser[] }>("/api/auth/network")
      .then((r) => setNetwork(r.users))
      .catch(() => setNetwork([]));
  }, []);

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

  // "Host another like this" — prefill the form from the past plan, but
  // never carry its (now-past) date/time forward.
  useEffect(() => {
    if (!hostAgainFrom) return;
    let alive = true;
    void api<PlanDTO>(`/api/plans/${hostAgainFrom}`)
      .then((prev) => {
        if (!alive) return;
        const vibeIds = Array.from(
          new Set(VIBE_OPTIONS.filter((o) => prev.tags.includes(o.tag)).map((o) => o.id)),
        );
        setForm((f) => ({
          ...f,
          title: prev.title,
          locationName: prev.isFlexibleLocation ? "" : prev.location.name,
          locationAddress: prev.isFlexibleLocation ? "" : prev.location.address,
          locationLat: prev.isFlexibleLocation ? undefined : prev.location.lat,
          locationLng: prev.isFlexibleLocation ? undefined : prev.location.lng,
          locationPlaceId: prev.isFlexibleLocation ? undefined : prev.location.placeId,
          neighborhoodId: prev.neighborhoodId || f.neighborhoodId,
          isFlexibleLocation: false,
          vibes: vibeIds.length ? vibeIds : f.vibes,
          description: prev.description ?? "",
          visibility: prev.visibility,
          capacityOn: prev.capacity !== null,
          capacity: prev.capacity !== null ? String(prev.capacity) : f.capacity,
          joinType: prev.joinType,
          flyerDataUrl: prev.flyerDataUrl ?? null,
        }));
        setCarryFromId(hostAgainFrom);
        setPath("plan");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hostAgainFrom]);

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

  // Req 3.1 — block past dates outright, and same-day times need at least
  // MIN_LEAD_MINUTES of runway. Derived (not state) so it re-evaluates live
  // as the host edits the form; also re-checked on submit as the source of truth.
  // F.6 — a wholly missing date folds into this same inline message rather
  // than only surfacing in a bottom banner.
  const dateError = !form.isFlexibleDate && !form.date
    ? "Add a day or mark it flexible."
    : !form.isFlexibleDate && form.date && form.date < today()
      ? "Pick today or a future date."
      : null;
  const timeError =
    !dateError && !form.isFlexibleDate && !form.isFlexibleTime && form.date === today() && form.time
      ? form.time < minTimeForToday()
        ? `Pick a time at least ${MIN_LEAD_MINUTES} minutes from now.`
        : null
      : null;
  const locationError =
    !form.neighborhoodId && !form.isFlexibleLocation
      ? "Add a location or mark it flexible."
      : null;
  const capacityNum = form.capacityOn ? Number(form.capacity) : null;
  const capacityError =
    capacityNum !== null && (!Number.isFinite(capacityNum) || capacityNum < 1)
      ? "Enter a number of spots, or turn off the limit."
      : null;
  const titleError = !form.title.trim() ? "Give your plan a title." : null;

  // F.6 — flag exactly what's missing inline, next to the field, and scroll
  // it into view, instead of leaving the host to guess from a generic bottom
  // banner (or a Post button that's mysteriously disabled).
  const validate = (): boolean => {
    setError(null);
    setAttemptedSubmit(true);
    if (titleError) {
      titleInputRef.current?.focus();
      titleInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    if (locationError) {
      locationCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    if (dateError || timeError) {
      dateCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    if (capacityError) {
      setShowMore(true);
      setTimeout(() => capacityRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return false;
    }
    return true;
  };

  // Req 6.8 — on failure, the form/draft is left exactly as the host typed
  // it (we never clear `form`), and postPlan can be re-invoked from the
  // error banner's Retry button without re-entering anything.
  const postPlan = async () => {
    setError(null);
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
            placeId: form.locationPlaceId,
          },
          date: form.isFlexibleDate ? today() : form.date,
          time: form.isFlexibleTime ? "" : form.time,
          isFlexibleTime: form.isFlexibleTime || form.isFlexibleDate,
          isFlexibleLocation: form.isFlexibleLocation,
          tags: resolvedTags,
          description: form.description.trim() || undefined,
          hostEmoji: VIBE_OPTIONS.find((o) => o.id === form.vibes[0])?.emoji ?? "✨",
          planKind,
          // "Make a plan with X" (single seeded person) co-creates — they show
          // as a co-host rather than just getting an invite.
          coHostIds: inviteUserId ? [inviteUserId] : undefined,
          visibility: form.visibility,
          capacity: capacityNum,
          joinType: form.joinType,
          isRecurring: form.recurrence !== "none",
          recurrence: form.recurrence,
          repeatDays:
            form.recurrence === "weekly" || form.recurrence === "biweekly"
              ? form.repeatDays
              : undefined,
          flyerDataUrl: form.flyerDataUrl ?? undefined,
          flyerLinkUrl: form.flyerLinkUrl.trim() || undefined,
          flyerLinkPreview: form.flyerLinkPreview ?? undefined,
          fromPlanId: carryFromId ?? undefined,
          communityId: communityId ?? undefined,
          communityVisibility: communityId ? communityVisibility : undefined,
        }),
      });
      // The co-host (seeded inviteUser) is already added server-side — don't
      // also fire a plain invite at them.
      const inviteList = [...invitedIds].filter((id) => id !== inviteUserId);
      if (inviteList.length > 0) {
        try {
          await api(`/api/plans/${created.id}/invite`, {
            method: "POST",
            body: JSON.stringify({ userIds: inviteList }),
          });
        } catch {
          /* best-effort — user can invite again from the plan */
        }
      }
      // F.3 — land on the feed with a "you're live" success sheet (Invite
      // someone / Done) rather than dropping straight into the invite sheet.
      navigate("/", { state: { justPostedId: created.id, showPostSuccess: true } });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't post — check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const runSubmit = async () => {
    if (!validate()) return;
    await postPlan();
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    void runSubmit();
  };

  const retry = () => void runSubmit();

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

  const openFlyerPicker = async () => {
    if (isNative()) {
      try {
        const dataUrl = await pickPhotoNative({ maxPx: 1024, quality: 0.85 });
        if (dataUrl) setForm((f) => ({ ...f, flyerDataUrl: dataUrl }));
      } catch {
        /* user canceled */
      }
      return;
    }
    flyerRef.current?.click();
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

  if (path === "choose") {
    const firstName = user?.firstName || "there";
    return (
      <main className="app-shell app-shell--mid">
        <header className="app-header app-header--minimal app-header--sticky">
          <Link to="/" className="detail-back">
            ← Back
          </Link>
        </header>
        <h1 className="path-picker-intent-head">
          Hey {firstName},<br />what&apos;s on your mind?
        </h1>
        <p className="path-picker-intent-sub">
          Drop something in, you never know who&apos;s down.
        </p>
        <div className="path-picker-divider" />
        <div className="path-picker">
          <button
            type="button"
            className={`path-picker-card ${pendingPath === "idea" ? "is-selected" : ""}`}
            onClick={() => setPendingPath("idea")}
            aria-pressed={pendingPath === "idea"}
          >
            <span className="path-picker-title">Just an idea</span>
            <span className="path-picker-sub">
              A casual thought — see who&apos;s down before committing to anything.
            </span>
          </button>
          <button
            type="button"
            className={`path-picker-card ${pendingPath === "plan" ? "is-selected" : ""}`}
            onClick={() => setPendingPath("plan")}
            aria-pressed={pendingPath === "plan"}
          >
            <span className="path-picker-title">Make a plan</span>
            <span className="path-picker-sub">
              Know what you want to do. Set the details, post it, and see who&apos;s in.
            </span>
          </button>
        </div>
        <div className="path-picker-divider" />
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!pendingPath}
          onClick={() => {
            if (pendingPath === "idea") {
              setForm((f) => ({
                ...f,
                isFlexibleLocation: true,
                isFlexibleTime: true,
                isFlexibleDate: true,
              }));
              setPath("idea");
            } else if (pendingPath === "plan") {
              setPath("plan");
            }
          }}
        >
          Continue
        </button>
      </main>
    );
  }

  const isIdea = path === "idea";

  // Idea path renders a stripped-down form (single text input + a couple of
  // collapsed optional disclosures). The full-form path below is the standard
  // "Make a plan" experience.
  if (isIdea) {
    return (
      <>
        <IdeaForm
          form={form}
          setForm={setForm}
          submit={submit}
          retry={retry}
          submitting={submitting}
          error={error}
          attemptedSubmit={attemptedSubmit}
          dateError={dateError}
          toggleVibe={toggleVibe}
          onBack={() => {
            if (backToSourceId) navigate(`/plans/${backToSourceId}`);
            else setPath("choose");
          }}
          onOpenFlyer={() => void openFlyerPicker()}
          onShowCoverLib={() => setShowCoverLib(true)}
          onClearFlyer={() => setForm((f) => ({ ...f, flyerDataUrl: null }))}
        />
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
        {showCoverLib && (
          <CoverLibraryModal
            coverPool={coverPool}
            onPick={(url) => {
              setForm((f) => ({ ...f, flyerDataUrl: url }));
              setShowCoverLib(false);
            }}
            onClose={() => setShowCoverLib(false)}
          />
        )}
      </>
    );
  }

  return (
    <main className="app-shell app-shell--mid create-plan">
      <header className="app-header create-header app-header--sticky">
        <button
          type="button"
          className="detail-back"
          onClick={() => {
            // 0.9 — recreating a past plan sends Back to that plan instead of
            // the blank path picker.
            if (backToSourceId) navigate(`/plans/${backToSourceId}`);
            else setPath("choose");
          }}
        >
          ← Back
        </button>
        <span className="create-header-title">New plan</span>
        <button
          type="submit"
          form="create-plan-form"
          className="create-header-post"
          disabled={submitting}
        >
          {submitting ? "Posting…" : "Post it"}
        </button>
      </header>

      {(inviteUserId && inviteUserName) || inviteNames.length > 0 ? (
        <div className="create-plan-invite-banner" role="note">
          Inviting{" "}
          <strong>
            {inviteUserName ?? inviteNames[0]}
          </strong>
          {(() => {
            const total = invitedIds.size;
            const extras = total - 1;
            return extras > 0 ? ` + ${extras} more` : "";
          })()}{" "}
          once you post ·{" "}
          {form.visibility === "network"
            ? "Visible to your network"
            : "Visible to everyone on COMMONS"}
        </div>
      ) : null}

      <form id="create-plan-form" onSubmit={submit} className="create-form">
        {/* Cover image — prominent at the top, per New Plan handoff. */}
        {form.flyerDataUrl ? (
          <div className="cover-picker cover-picker--filled">
            <img src={form.flyerDataUrl} alt="" className="cover-picker-img" />
            <div className="cover-picker-overlay">
              <button type="button" className="cover-chip" onClick={() => setShowCoverLib(true)}>
                Change
              </button>
              <button
                type="button"
                className="cover-chip"
                onClick={() => setForm((f) => ({ ...f, flyerDataUrl: null }))}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="cover-picker">
            <span className="cover-picker-title">Add a cover image</span>
            <span className="cover-picker-sub">Make your plan stand out</span>
            <div className="cover-picker-buttons">
              <button type="button" className="cover-btn" onClick={() => setShowCoverLib(true)}>
                <LibraryIcon />
                Choose from our library
              </button>
              <button type="button" className="cover-btn" onClick={() => void openFlyerPicker()}>
                <UploadIcon />
                Upload your own
              </button>
            </div>
          </div>
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

        {/* Plan name */}
        <input
          id="title"
          ref={titleInputRef}
          className="create-title-input"
          placeholder="Plan name"
          value={form.title}
          aria-invalid={Boolean(attemptedSubmit && titleError)}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        {attemptedSubmit && titleError && <p className="luma-inline-error">{titleError}</p>}

        {/* When — Date + Time as Luma-style rows, each with its own Flexible
            pill. Borderless rows on the card, hairline-divided. Req 3.1 —
            past dates are blocked and same-day times need runway. */}
        <div className="luma-card" ref={dateCardRef}>
          <div className="luma-row">
            <span className="luma-label">Date</span>
            <div className="luma-value">
              {!form.isFlexibleDate ? (
                <input
                  id="date"
                  type="date"
                  className="luma-input"
                  min={today()}
                  value={form.date}
                  aria-invalid={Boolean(dateError)}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              ) : (
                <span className="luma-flex-text">Flexible day</span>
              )}
              <FlexToggle
                active={form.isFlexibleDate}
                onClick={() => setForm((f) => ({ ...f, isFlexibleDate: !f.isFlexibleDate }))}
                label="Flexible"
              />
            </div>
          </div>
          <div className="luma-row">
            <span className="luma-label">Time</span>
            <div className="luma-value">
              {!form.isFlexibleTime ? (
                <input
                  id="time"
                  type="time"
                  className="luma-input"
                  min={!form.isFlexibleDate && form.date === today() ? minTimeForToday() : undefined}
                  value={form.time}
                  aria-invalid={Boolean(timeError)}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                />
              ) : (
                <span className="luma-flex-text">Flexible time</span>
              )}
              <FlexToggle
                active={form.isFlexibleTime}
                onClick={() => setForm((f) => ({ ...f, isFlexibleTime: !f.isFlexibleTime }))}
                label="Flexible"
              />
            </div>
          </div>
        </div>
        {(dateError || timeError) && (
          <p className="luma-inline-error">{dateError || timeError}</p>
        )}

        {/* Location — single row, Google-Places-backed, flexible toggle inline.
            Neighborhood is kept from the user's default when a place is picked;
            picking a place and toggling Flexible are mutually exclusive —
            each one clears the other (req: location fixes). */}
        <div className="luma-card" ref={locationCardRef}>
          <div className="location-row">
            <div className="location-row-main">
              {!form.isFlexibleLocation ? (
                <PlacePicker
                  value={form.locationName}
                  address={form.locationAddress}
                  placeholder="Search a venue, or type your own — e.g. Somewhere in Fishtown"
                  onChange={(name) =>
                    setForm((f) => ({
                      ...f,
                      locationName: name,
                      locationAddress: "",
                      locationLat: undefined,
                      locationLng: undefined,
                      locationPlaceId: undefined,
                    }))
                  }
                  onSelect={(p) =>
                    setForm((f) => ({
                      ...f,
                      locationName: p.name,
                      locationAddress: p.address,
                      locationLat: p.lat,
                      locationLng: p.lng,
                      locationPlaceId: p.placeId,
                      isFlexibleLocation: false,
                    }))
                  }
                  onClear={() =>
                    setForm((f) => ({
                      ...f,
                      locationName: "",
                      locationAddress: "",
                      locationLat: undefined,
                      locationLng: undefined,
                      locationPlaceId: undefined,
                    }))
                  }
                />
              ) : (
                <span className="luma-flex-text location-row-flex-text">Flexible location</span>
              )}
            </div>
            <FlexToggle
              active={form.isFlexibleLocation}
              onClick={() =>
                setForm((f) => {
                  const next = !f.isFlexibleLocation;
                  return next
                    ? {
                        ...f,
                        isFlexibleLocation: true,
                        locationName: "",
                        locationAddress: "",
                        locationLat: undefined,
                        locationLng: undefined,
                        locationPlaceId: undefined,
                      }
                    : { ...f, isFlexibleLocation: false };
                })
              }
              label="Flexible"
            />
          </div>
        </div>
        {attemptedSubmit && locationError && (
          <p className="luma-inline-error">{locationError}</p>
        )}

        {/* Description */}
        <textarea
          id="description"
          className="create-desc-input"
          placeholder="Add a description — vibes, what to bring, who it's for…"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />

        {/* Category — wrapping pills. */}
        <p className="form-eyebrow">Category</p>
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
                <span className="vibe-tile-label">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Settings — visibility segmented toggle + optional extras. */}
        <p className="form-eyebrow">Settings</p>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-row-label">Visibility</span>
            <div className="seg-toggle" role="group" aria-label="Visibility">
              <button
                type="button"
                className={`seg-toggle-btn ${form.visibility === "everyone" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
                aria-pressed={form.visibility === "everyone"}
              >
                Everyone
              </button>
              <button
                type="button"
                className={`seg-toggle-btn ${form.visibility === "network" ? "is-active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, visibility: "network" }))}
                aria-pressed={form.visibility === "network"}
              >
                Network
              </button>
            </div>
          </div>

          {/* Granular hand-pick inside Your Network. Empty list = full network. */}
          {form.visibility === "network" && (
            <div className="settings-handpick">
              <NetworkHandPick
                network={network}
                invitedIds={invitedIds}
                onToggle={toggleInvited}
              />
            </div>
          )}

          {/* Options — spots, repeats, link. Collapsed to keep the form short. */}
          <button
            type="button"
            className="settings-options-toggle"
            onClick={() => setShowMore((s) => !s)}
            aria-expanded={showMore}
          >
            <span className="settings-row-label">Options</span>
            <span className="settings-options-hint">Spots, repeats, link</span>
            <ChevronIcon open={showMore} />
          </button>

        {showMore && (
          <div className="create-more">
            {/* Spots — toggle for open vs capped */}
            <section className="form-section" ref={capacityRowRef}>
              <div className="form-row-flex">
                <div className="form-row-flex-main">
                  <label className="form-question">Limited spots?</label>
                  <p className="form-help" style={{ marginTop: 2, marginBottom: 4 }}>Optional</p>
                  {!form.capacityOn ? (
                    <p className="form-help" style={{ marginTop: 4 }}>
                      Open — no cap on who can join
                    </p>
                  ) : (
                    <NumberPicker
                      value={Number(form.capacity) || 0}
                      onChange={(n) => setForm((f) => ({ ...f, capacity: String(n) }))}
                      ariaLabel="Number of spots"
                    />
                  )}
                </div>
                <FlexToggle
                  active={form.capacityOn}
                  onClick={() => setForm((f) => ({ ...f, capacityOn: !f.capacityOn }))}
                  label="Set limit"
                />
              </div>
              {attemptedSubmit && capacityError && (
                <p className="luma-inline-error">{capacityError}</p>
              )}

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
                      Approve
                    </button>
                  </div>
                </>
              )}
            </section>

            {/* Repeats — Zoom-style cadence dropdown */}
            <section className="form-section">
              <label className="form-question" htmlFor="repeats">Repeats</label>
              <select
                id="repeats"
                className="form-select"
                value={form.recurrence}
                onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as Recurrence }))}
              >
                <option value="none">Doesn't repeat</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
              {(form.recurrence === "weekly" || form.recurrence === "biweekly") && (
                <div className="repeat-days" role="group" aria-label="Repeats on">
                  {DAY_LABELS.map((label, i) => {
                    const on = form.repeatDays.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        className={on ? "repeat-day is-active" : "repeat-day"}
                        aria-pressed={on}
                        aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            repeatDays: f.repeatDays.includes(i)
                              ? f.repeatDays.filter((d) => d !== i)
                              : [...f.repeatDays, i].sort((a, b) => a - b),
                          }))
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Link — paste a URL to show a preview on the card. The cover
                image at the top of the form handles uploads. */}
            <section className="form-section">
              <label className="form-question" htmlFor="flyer-link">
                Add a link
              </label>
              <p className="form-help">Paste a link — it'll show as a preview on the card.</p>
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
          {linkError && <p className="form-help" style={{ color: "var(--accent)" }}>{linkError}</p>}
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
        </div>

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

        {error && (
          <div className="form-error-banner">
            <p className="error-text">{error}</p>
            <button type="button" className="btn-link" onClick={retry} disabled={submitting}>
              Try again
            </button>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Posting…" : "Post it"}
        </button>

        {communityId ? (
          <div className="create-community-tag">
            <p className="create-community-tag-title">
              🏙️ Posting to <strong>{communityName ?? "your community"}</strong>
            </p>
            <div className="seg-toggle" role="group" aria-label="Community visibility">
              <button
                type="button"
                className={`seg-toggle-btn ${communityVisibility === "public" ? "is-active" : ""}`}
                onClick={() => setCommunityVisibility("public")}
                aria-pressed={communityVisibility === "public"}
              >
                Public
              </button>
              <button
                type="button"
                className={`seg-toggle-btn ${communityVisibility === "community_only" ? "is-active" : ""}`}
                onClick={() => setCommunityVisibility("community_only")}
                aria-pressed={communityVisibility === "community_only"}
              >
                Community only
              </button>
            </div>
            <p className="create-community-tag-hint">
              {communityVisibility === "public"
                ? "Shows on the main feed with a community tag, and on the community's events board."
                : "Only community members can see this — it won't appear on the main feed."}
            </p>
          </div>
        ) : (
          <p className="create-communities-footer">
            <strong>Communities</strong>{" "}
            <Link to="/communities" className="visibility-option-pill">
              Explore →
            </Link>
            <br />
            Run clubs, book clubs, recurring crews.
          </p>
        )}
      </form>

      {showCoverLib && (
        <CoverLibraryModal
          coverPool={coverPool}
          onPick={(url) => {
            setForm((f) => ({ ...f, flyerDataUrl: url }));
            setShowCoverLib(false);
          }}
          onClose={() => setShowCoverLib(false)}
        />
      )}
    </main>
  );
}

function CoverLibraryModal({
  coverPool,
  onPick,
  onClose,
}: {
  coverPool: string[];
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="cover-lib-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a cover image"
      onClick={onClose}
    >
      <div className="cover-lib" onClick={(e) => e.stopPropagation()}>
        <div className="cover-lib-head">
          <span className="cover-lib-title">Choose a cover</span>
          <button type="button" className="cover-lib-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="cover-lib-grid">
          {coverPool.map((url) => (
            <button key={url} type="button" className="cover-lib-tile" onClick={() => onPick(url)}>
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type FormShape = {
  title: string;
  locationName: string;
  locationAddress: string;
  locationLat: number | undefined;
  locationLng: number | undefined;
  locationPlaceId: string | undefined;
  neighborhoodId: string;
  date: string;
  time: string;
  isFlexibleTime: boolean;
  isFlexibleLocation: boolean;
  isFlexibleDate: boolean;
  vibes: VibeIcon[];
  description: string;
  visibility: PlanVisibility;
  capacityOn: boolean;
  capacity: string;
  joinType: JoinType;
  recurrence: Recurrence;
  repeatDays: number[];
  flyerDataUrl: string | null;
  flyerLinkUrl: string;
  flyerLinkPreview: null | {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  };
};

/**
 * Just an Idea form — a loose, casual post. Location, a rough date bucket,
 * and a cover photo all live in the main flow now (F.12); spots and the
 * Communities row are dropped entirely since ideas aren't meant to be that
 * formal. "Add details" is left for lower-priority extras (more color,
 * category tags).
 */
function IdeaForm({
  form,
  setForm,
  submit,
  retry,
  submitting,
  error,
  attemptedSubmit,
  dateError,
  toggleVibe,
  onBack,
  onOpenFlyer,
  onShowCoverLib,
  onClearFlyer,
}: {
  form: FormShape;
  setForm: (updater: (f: FormShape) => FormShape) => void;
  submit: (event?: FormEvent) => void;
  retry: () => void;
  submitting: boolean;
  error: string | null;
  attemptedSubmit: boolean;
  dateError: string | null;
  toggleVibe: (id: VibeIcon) => void;
  onBack: () => void;
  onOpenFlyer: () => void;
  onShowCoverLib: () => void;
  onClearFlyer: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dateMode, setDateMode] = useState<IdeaDateMode>(form.isFlexibleDate ? "anytime" : "specific");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  // F.10 — rotate the placeholder copy so the empty field reads as an
  // invitation to riff, not a blank homework assignment.
  useEffect(() => {
    const t = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % IDEA_PLACEHOLDERS.length);
    }, 3200);
    return () => clearInterval(t);
  }, []);

  // F.6 — focus the field that's actually missing instead of leaving a
  // disabled Post button with no explanation.
  useEffect(() => {
    if (attemptedSubmit && !form.title.trim()) {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Only re-run when a submit attempt actually happens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptedSubmit]);

  // 0.6 — when "Add details" opens, bring it above the keyboard instead of
  // letting the accessory bar bury its fields.
  useEffect(() => {
    if (!detailsOpen) return;
    const t = setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [detailsOpen]);

  // Reserve room at the bottom of the form for however much the on-screen
  // keyboard is currently covering, via the visualViewport API where it's
  // available (iOS/Android web views).
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  // F.11 — three loose date buckets. "This week" anchors to the coming
  // Saturday so the plan still sorts sensibly without over-committing to a
  // single day; "Anytime" stays fully open-ended.
  const selectDateMode = (mode: IdeaDateMode) => {
    setDateMode(mode);
    if (mode === "specific") {
      setForm((f) => ({
        ...f,
        isFlexibleDate: false,
        date: f.date && f.date >= today() ? f.date : today(),
      }));
    } else if (mode === "week") {
      setForm((f) => ({ ...f, isFlexibleDate: false, date: endOfThisWeek() }));
    } else {
      setForm((f) => ({ ...f, isFlexibleDate: true, date: today() }));
    }
  };

  const titleMissing = attemptedSubmit && !form.title.trim();

  return (
    <main className="app-shell app-shell--mid">
      <header className="app-header app-header--minimal app-header--sticky">
        <button type="button" className="detail-back" onClick={onBack}>
          ← Back
        </button>
      </header>
      <h1 className="brand" style={{ marginBottom: 8 }}>Just an idea</h1>
      <p className="brand-tagline" style={{ marginBottom: 24 }}>
        Just a thought. See who&apos;s down.
      </p>

      <form
        onSubmit={submit}
        className="form-card"
        style={detailsOpen && keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
      >
        {/* F.10 — tappable starters pre-fill the field with a fuller phrase. */}
        <div className="idea-starter-chips" role="group" aria-label="Idea starters">
          {IDEA_STARTER_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={`idea-starter-chip ${form.title === chip.text ? "is-active" : ""}`}
              onClick={() => setForm((f) => ({ ...f, title: chip.text }))}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <section className="form-section">
          <textarea
            ref={textareaRef}
            className="idea-textarea"
            placeholder={IDEA_PLACEHOLDERS[placeholderIdx]}
            value={form.title}
            aria-invalid={titleMissing}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            rows={3}
            autoFocus
          />
          {titleMissing && <p className="luma-inline-error">Add a few words about the idea.</p>}
        </section>

        {/* F.11 — loose date options: a specific day, sometime this week, or
            wide open. */}
        <p className="form-eyebrow">When?</p>
        <div className="seg-toggle idea-date-toggle" role="group" aria-label="When">
          <button
            type="button"
            className={`seg-toggle-btn ${dateMode === "specific" ? "is-active" : ""}`}
            onClick={() => selectDateMode("specific")}
            aria-pressed={dateMode === "specific"}
          >
            A day
          </button>
          <button
            type="button"
            className={`seg-toggle-btn ${dateMode === "week" ? "is-active" : ""}`}
            onClick={() => selectDateMode("week")}
            aria-pressed={dateMode === "week"}
          >
            This week
          </button>
          <button
            type="button"
            className={`seg-toggle-btn ${dateMode === "anytime" ? "is-active" : ""}`}
            onClick={() => selectDateMode("anytime")}
            aria-pressed={dateMode === "anytime"}
          >
            Anytime
          </button>
        </div>
        {dateMode === "specific" && (
          <div className="idea-date-input-row">
            <input
              type="date"
              className="luma-input idea-date-input"
              min={today()}
              value={form.date}
              aria-invalid={Boolean(dateError)}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
            {dateError && <p className="luma-inline-error">{dateError}</p>}
          </div>
        )}

        {/* F.12 / 0.1 — optional location, same venue picker as the full
            form. Left flexible unless the host picks a spot. */}
        <p className="form-eyebrow">Where?</p>
        <div className="luma-card">
          <div className="location-row">
            <div className="location-row-main">
              {!form.isFlexibleLocation ? (
                <PlacePicker
                  value={form.locationName}
                  address={form.locationAddress}
                  placeholder="Search a spot, or leave it flexible"
                  onChange={(name) =>
                    setForm((f) => ({
                      ...f,
                      locationName: name,
                      locationAddress: "",
                      locationLat: undefined,
                      locationLng: undefined,
                      locationPlaceId: undefined,
                    }))
                  }
                  onSelect={(p) =>
                    setForm((f) => ({
                      ...f,
                      locationName: p.name,
                      locationAddress: p.address,
                      locationLat: p.lat,
                      locationLng: p.lng,
                      locationPlaceId: p.placeId,
                      isFlexibleLocation: false,
                    }))
                  }
                  onClear={() =>
                    setForm((f) => ({
                      ...f,
                      locationName: "",
                      locationAddress: "",
                      locationLat: undefined,
                      locationLng: undefined,
                      locationPlaceId: undefined,
                    }))
                  }
                />
              ) : (
                <span className="luma-flex-text location-row-flex-text">Flexible location</span>
              )}
            </div>
            <FlexToggle
              active={form.isFlexibleLocation}
              onClick={() =>
                setForm((f) => {
                  const next = !f.isFlexibleLocation;
                  return next
                    ? {
                        ...f,
                        isFlexibleLocation: true,
                        locationName: "",
                        locationAddress: "",
                        locationLat: undefined,
                        locationLng: undefined,
                        locationPlaceId: undefined,
                      }
                    : { ...f, isFlexibleLocation: false };
                })
              }
              label="Flexible"
            />
          </div>
        </div>

        {/* F.12 — cover photo moved out of "Add details" into the main flow.
            No redundant "Cover image" label above it (1.17) — the picker's
            own copy already says as much. */}
        {form.flyerDataUrl ? (
          <div className="cover-picker cover-picker--filled">
            <img src={form.flyerDataUrl} alt="" className="cover-picker-img" />
            <div className="cover-picker-overlay">
              <button type="button" className="cover-chip" onClick={onShowCoverLib}>
                Change
              </button>
              <button type="button" className="cover-chip" onClick={onClearFlyer}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="cover-picker">
            <span className="cover-picker-title">Add a cover image</span>
            <span className="cover-picker-sub">Make your idea stand out</span>
            <div className="cover-picker-buttons">
              <button type="button" className="cover-btn" onClick={onShowCoverLib}>
                <LibraryIcon />
                Choose from our library
              </button>
              <button type="button" className="cover-btn" onClick={onOpenFlyer}>
                <UploadIcon />
                Upload your own
              </button>
            </div>
          </div>
        )}

        {/* 1.17 — tighter gap under the label, and the toggle no longer
            stretches the full width of the card. */}
        <p className="form-eyebrow idea-visibility-label">Who can see this?</p>
        <div className="seg-toggle idea-visibility-toggle" role="group" aria-label="Visibility">
          <button
            type="button"
            className={`seg-toggle-btn ${form.visibility === "everyone" ? "is-active" : ""}`}
            onClick={() => setForm((f) => ({ ...f, visibility: "everyone" }))}
            aria-pressed={form.visibility === "everyone"}
          >
            Everyone
          </button>
          <button
            type="button"
            className={`seg-toggle-btn ${form.visibility === "network" ? "is-active" : ""}`}
            onClick={() => setForm((f) => ({ ...f, visibility: "network" }))}
            aria-pressed={form.visibility === "network"}
          >
            Your network
          </button>
        </div>

        <button
          type="button"
          className="idea-disclosure"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((v) => !v)}
        >
          <span>Add details</span>
          <span className={`idea-disclosure-chevron ${detailsOpen ? "is-open" : ""}`}>›</span>
        </button>
        {detailsOpen && (
          <div className="idea-details" ref={detailsRef}>
            <label className="form-question">Add more detail</label>
            <textarea
              className="idea-detail-input"
              placeholder="Any more color? Who it's for, timing, what to bring…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />

            <label className="form-question" style={{ marginTop: 14 }}>Category</label>
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
                    <span className="vibe-tile-label">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="form-error-banner">
            <p className="error-text">{error}</p>
            <button type="button" className="btn-link" onClick={retry} disabled={submitting}>
              Try again
            </button>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Posting…" : "Put it out there"}
        </button>
      </form>
    </main>
  );
}

/**
 * Hand-pick a subset of the user's network. Empty selection means the plan
 * still lands on the user's full network (we don't want a footgun where the
 * host posts to no one). Once any chip is picked, the audience is narrowed
 * to that explicit list via the existing invitedIds flow.
 */
function NetworkHandPick({
  network,
  invitedIds,
  onToggle,
}: {
  network: PublicUser[] | null;
  invitedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (network === null) {
    return <p className="form-help" style={{ marginTop: 8 }}>Loading your network…</p>;
  }
  if (network.length === 0) {
    return (
      <div className="network-empty-prompt" style={{ marginTop: 8 }}>
        <p className="form-help" style={{ marginTop: 0, marginBottom: 10 }}>
          You haven&apos;t added anyone yet — invite someone or add people you&apos;ve met.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/invite" className="btn-pill-accent" style={{ textDecoration: "none" }}>
            Invite friends
          </Link>
          <Link to="/search" className="btn-pill-ghost" style={{ textDecoration: "none" }}>
            Find people
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10 }}>
      <p className="form-help" style={{ marginTop: 0 }}>
        Want to narrow it down? Pick specific people — leave blank to share with everyone in your network.
      </p>
      <div className="invite-people-list">
        {network.map((u) => {
          const picked = invitedIds.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              className={`invite-person ${picked ? "is-picked" : ""}`}
              onClick={() => onToggle(u.id)}
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
    </div>
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
  /** e.g. "Fishtown" — parsed server-side from Places address components. */
  neighborhood?: string;
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
  placeholder,
}: {
  value: string;
  address: string;
  onChange: (name: string) => void;
  onSelect: (p: { name: string; address: string; lat?: number; lng?: number; placeId?: string }) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errored, setErrored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setErrored(false);
      void api<{ results: PlaceHit[] }>(`/api/places/search?q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.results ?? []))
        .catch(() => {
          setResults([]);
          setErrored(true);
        })
        .finally(() => {
          setLoading(false);
          setSearched(true);
        });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Clean up the blur timer on unmount.
  useEffect(() => () => {
    if (blurRef.current) clearTimeout(blurRef.current);
  }, []);

  const choose = (p: PlaceHit) => {
    skipNextSearch.current = true;
    onSelect({ name: p.name, address: p.address, lat: p.lat, lng: p.lng, placeId: p.placeId });
    setResults([]);
    setSearched(false);
    setFocused(false);
  };

  const hasPickedAddress = Boolean(address && address !== value);
  // Visibility is gated on focus (not a separate flag that can desync), so the
  // list stays put while you read it instead of flickering on every keystroke.
  const showDropdown = focused && value.trim().length >= 2;

  return (
    <div className="place-picker">
      <div className="place-picker-field">
        <PinIcon />
        <input
          type="text"
          placeholder={placeholder ?? "Search a venue, or type your own"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delay so a result tap (mousedown) registers before we hide.
            blurRef.current = setTimeout(() => setFocused(false), 150);
          }}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            className="place-picker-clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear();
              setResults([]);
              setSearched(false);
            }}
            aria-label="Clear place"
          >
            ×
          </button>
        )}
      </div>
      {hasPickedAddress && !showDropdown && <p className="place-picker-chosen">📍 {address}</p>}
      {showDropdown && (
        <ul className="place-picker-results" role="listbox">
          {loading && results.length === 0 && <li className="place-picker-empty">Searching…</li>}
          {!loading && errored && (
            <li className="place-picker-empty">
              Venue search is unavailable — we'll use "{value.trim()}" as the venue.
            </li>
          )}
          {!loading && !errored && searched && results.length === 0 && (
            <li className="place-picker-empty">No matches — we'll use "{value.trim()}" as the venue.</li>
          )}
          {results.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                className="place-picker-result"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
              >
                <span className="place-picker-result-name">{p.name}</span>
                {(p.neighborhood || p.address) && (
                  <span className="place-picker-result-addr">{p.neighborhood ?? p.address}</span>
                )}
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

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}
