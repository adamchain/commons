import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Globe2, ImagePlus, MapPin, UserRound, Users } from "lucide-react";
import { api } from "../api/http";
import { useAuth } from "../context/AuthContext";
import { AvatarCropModal } from "../components/AvatarCropModal";
import { CoverLibraryModal } from "../components/CoverLibraryModal";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { LegalContent } from "../components/LegalContent";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { BottomSheet } from "../components/ui/BottomSheet";
import {
  ORGANIZER_GUIDELINE_ASKS,
} from "../content/communityGuidelines";
import { LEGAL_DOCS } from "../content/legal";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import {
  ALL_COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  MAX_COMMUNITY_CATEGORIES,
  toggleCommunityCategory,
  type CommunityAccessLevel,
  type CommunityCategory,
  type CommunityDTO,
} from "../types/shared";
import "./Communities.css";

export function CreateCommunityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const coverRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [linktree, setLinktree] = useState("");
  const [categories, setCategories] = useState<CommunityCategory[]>([]);
  const [city, setCity] = useState("");
  const [visibility, setVisibility] = useState<CommunityAccessLevel>("everyone");
  const [screeningOn, setScreeningOn] = useState(false);
  const [screening, setScreening] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [showCoverLib, setShowCoverLib] = useState(false);
  const [legalSheet, setLegalSheet] = useState<"terms" | "privacy" | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canStep1 =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    Boolean(coverImage) &&
    categories.length > 0 &&
    !coverBusy;
  const canStep2 = canStep1;
  const canSubmit = canStep2 && agreed && !busy;
  const stepTitle =
    step === 1 ? "Create a home for your group" : step === 2 ? "Shape the experience" : "Community Guidelines";
  const stepAction = step === 1 ? "Continue" : step === 2 ? "Review Guidelines" : busy ? "Creating…" : "I agree";

  async function applyCoverFile(file: File) {
    setCoverBusy(true);
    setErr(null);
    try {
      setCropSrc(await fileToResizedDataUrl(file, 1600, 0.9));
    } catch {
      setErr("Couldn't read that image. Try another.");
    } finally {
      setCoverBusy(false);
    }
  }

  async function openCoverUpload() {
    if (isNative()) {
      setErr(null);
      try {
        const dataUrl = await pickPhotoNative({ maxPx: 1600, quality: 0.9 });
        if (dataUrl) setCropSrc(dataUrl);
      } catch {
        /* user canceled */
      }
      return;
    }
    coverRef.current?.click();
  }

  function goBack() {
    if (step === 1) {
      navigate(-1);
      return;
    }
    setErr(null);
    setStep(step === 3 ? 2 : 1);
  }

  function goNext() {
    if (step === 1) {
      if (!canStep1) {
        setErr("Add a name, description, cover photo, and at least one category.");
        return;
      }
      setErr(null);
      setStep(2);
      return;
    }
      if (!canStep2) {
        setErr("Finish the basics first.");
        return;
      }
    setErr(null);
    setStep(3);
  }

  async function submit() {
    if (!canSubmit || !coverImage) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await api<CommunityDTO>("/api/communities", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          socialLinks: {
            instagram: instagram.trim(),
            tiktok: tiktok.trim(),
            linktree: linktree.trim(),
          },
          category: categories[0],
          categories,
          screeningQuestion: screeningOn ? screening.trim() || undefined : undefined,
          coverImage,
          visibility,
          city: city.trim() || undefined,
        }),
      });
      navigate(`/communities/${created.id}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const m = raw.match(/^\d+:\s*(.*)$/);
      let message = raw;
      if (m) {
        try {
          const parsed = JSON.parse(m[1]!);
          message = parsed?.error ?? m[1]!;
        } catch {
          message = m[1]!;
        }
      }
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  const coverInput = (
    <input
      ref={coverRef}
      type="file"
      accept="image/*"
      style={{ display: "none" }}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void applyCoverFile(f);
        if (coverRef.current) coverRef.current.value = "";
      }}
    />
  );

  return (
    <main className="app-shell create-plan cmy cmy-create">
      <header className="app-header app-header--sticky create-header cmy-create-top">
        <button type="button" className="back-circle" aria-label="Back" onClick={goBack}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="create-header-title cmy-create-title-block">
          <span className="cmy-create-kicker">New community · {step} of 3</span>
          <strong>{stepTitle}</strong>
        </div>
        <span className="create-header-post" aria-hidden="true" />
      </header>
      <div className="cmy-create-progress-bars" aria-hidden="true">
        <i className={step >= 1 ? "is-complete" : ""} />
        <i className={step >= 2 ? "is-complete" : ""} />
        <i className={step >= 3 ? "is-complete" : ""} />
      </div>

      <div className="create-form cmy-create-body">
        {step === 1 ? (
          <>
            {coverImage ? (
              <div className="cmy-create-hero">
                <img src={coverImage} alt="" />
                <span className="cmy-create-hero-shade" />
                <div className="cmy-create-hero-copy">
                  <small>{city.trim() || "Home base"}</small>
                  <h1>{name.trim() || "Community name"}</h1>
                  {categories[0] ? <span>{COMMUNITY_CATEGORY_LABELS[categories[0]]}</span> : null}
                </div>
                <button type="button" className="cmy-create-hero-cover" disabled={coverBusy} onClick={() => setShowCoverLib(true)}>
                  <ImagePlus size={17} /> Change cover
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="cover-picker cmy-create-cover-cta"
                disabled={coverBusy}
                onClick={() => setShowCoverLib(true)}
              >
                <Camera size={22} strokeWidth={1.7} aria-hidden="true" />
                <span className="cover-picker-title">
                  {coverBusy ? "Uploading…" : "Add a cover photo"}
                </span>
                <span className="cover-picker-sub">Sets the tone</span>
                <span
                  className="cover-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void openCoverUpload();
                  }}
                >
                  <ImagePlus size={16} strokeWidth={1.8} aria-hidden="true" />
                  Upload your own
                </span>
              </button>
            )}
            {coverInput}

            <section className="cmy-create-identity">
              <label>
                <span className="cmy-create-card-kicker">Community name</span>
                <input
                  className="cmy-create-name"
                  value={name}
                  placeholder="e.g. Break Room Events"
                  maxLength={80}
                  autoComplete="off"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                <span className="cmy-create-card-kicker">What brings people together?</span>
                <textarea
                  className="cmy-textarea cmy-create-desc"
                  rows={4}
                  value={description}
                  maxLength={280}
                  placeholder="What's the vibe? Who is this for?"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </section>

            <div className="cmy-create-summary">
              <div className="cmy-create-summary-row">
                <span className="cmy-create-summary-icon"><MapPin size={20} /></span>
                <span>
                  <small>Home base</small>
                  <LocationAutocomplete
                    name={city}
                    address=""
                    placeholder="City or neighborhood"
                    onChange={(v) => setCity(v.name.slice(0, 80))}
                  />
                </span>
              </div>
              <div className="cmy-create-summary-row">
                <span className="cmy-create-summary-icon"><UserRound size={20} /></span>
                <span>
                  <small>Organized by</small>
                  <strong>{user?.firstName || "You"}</strong>
                </span>
              </div>
            </div>

            <div className="luma-card cmy-create-cats-card">
              <div className="cmy-create-cats-head">
                <div>
                  <h2>Help people find the community</h2>
                  <p>Choose up to {MAX_COMMUNITY_CATEGORIES} interests.</p>
                </div>
                <span className="cmy-create-count">
                  {categories.length} / {MAX_COMMUNITY_CATEGORIES}
                </span>
              </div>
              <div className="cmy-create-cats" role="group" aria-label="Categories">
                {ALL_COMMUNITY_CATEGORIES.map((c) => {
                  const selected = categories.includes(c);
                  const blocked = !selected && categories.length >= MAX_COMMUNITY_CATEGORIES;
                  return (
                    <Chip
                      key={c}
                      active={selected}
                      tone="red-outline"
                      disabled={blocked}
                      onClick={() => setCategories((prev) => toggleCommunityCategory(prev, c))}
                    >
                      {COMMUNITY_CATEGORY_LABELS[c]}
                    </Chip>
                  );
                })}
              </div>
            </div>

            <section className="cmy-join-policy">
              <div>
                <h2>Who can join?</h2>
                <p>You can change this later in community settings.</p>
              </div>
              <div className="cmy-join-policy-grid">
                <button
                  type="button"
                  className={visibility === "everyone" ? "is-selected" : ""}
                  onClick={() => setVisibility("everyone")}
                >
                  <Globe2 size={19} />
                  <span>
                    <strong>Anyone</strong>
                    <small>People join immediately.</small>
                  </span>
                </button>
                <button
                  type="button"
                  className={visibility === "members_only" ? "is-selected" : ""}
                  onClick={() => setVisibility("members_only")}
                >
                  <Users size={19} />
                  <span>
                    <strong>Request to join</strong>
                    <small>You approve each person.</small>
                  </span>
                </button>
              </div>
            </section>
          </>
        ) : step === 2 ? (
          <>
            <div className="luma-card cmy-create-screen-card">
              <h2>Links and socials</h2>
              <p className="cmy-hint">Help members find you elsewhere. Everything here is optional.</p>
              <div className="cmy-social-fields">
                <label className="cmy-field">
                  <span>Instagram</span>
                  <input
                    className="cmy-input"
                    value={instagram}
                    placeholder="@yourcommunity"
                    maxLength={200}
                    onChange={(e) => setInstagram(e.target.value)}
                  />
                </label>
                <label className="cmy-field">
                  <span>TikTok</span>
                  <input
                    className="cmy-input"
                    value={tiktok}
                    placeholder="@handle"
                    maxLength={200}
                    onChange={(e) => setTiktok(e.target.value)}
                  />
                </label>
                <label className="cmy-field">
                  <span>Website</span>
                  <input
                    className="cmy-input"
                    value={linktree}
                    placeholder="https://..."
                    maxLength={200}
                    onChange={(e) => setLinktree(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="luma-card cmy-create-screen-card">
              <div className="cmy-toggle-row">
                <div>
                  <p className="cmy-create-vis-label">Screening questions</p>
                  <p className="cmy-hint">Ask people a few things before approving them.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={screeningOn}
                  className={`cmy-switch ${screeningOn ? "is-on" : ""}`}
                  onClick={() => setScreeningOn((v) => !v)}
                >
                  <span className="cmy-switch-knob" />
                </button>
              </div>
              {screeningOn ? (
                <textarea
                  className="cmy-textarea"
                  rows={3}
                  value={screening}
                  placeholder="What brings you to this community?"
                  maxLength={280}
                  onChange={(e) => setScreening(e.target.value)}
                />
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="cmy-guidelines cmy-guidelines-card">
              <div className="cmy-guidelines-mark"><Users size={28} /></div>
              <h1 className="guidelines-heading">Help keep COMMONS human.</h1>
              <p className="cmy-guidelines-intro">Communities should make it easier for people to connect safely, respectfully, and in real life.</p>
              <ul className="guidelines-list">
                {ORGANIZER_GUIDELINE_ASKS.map((item) => (
                  <li key={item.title}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`cmy-guidelines-check${agreed ? " is-checked" : ""}`}
                onClick={() => setAgreed((v) => !v)}
              >
                <span aria-hidden="true">{agreed ? "✓" : ""}</span>
                <strong>I have read and agree to the Community Guidelines.</strong>
              </button>
              <p className="cmy-guidelines-agree">
                You also agree to our{" "}
                <button type="button" className="btn-link" onClick={() => setLegalSheet("terms")}>
                  Terms of Service
                </button>{" "}
                and{" "}
                <button type="button" className="btn-link" onClick={() => setLegalSheet("privacy")}>
                  Privacy Policy
                </button>
                .
              </p>
            </div>
            <div className="cmy-create-review">
              {coverImage ? <img src={coverImage} alt="" /> : null}
              <span>
                <strong>{name.trim() || "Untitled community"}</strong>
                <small>{categories.map((c) => COMMUNITY_CATEGORY_LABELS[c]).join(" · ")}</small>
              </span>
            </div>
          </>
        )}

        {err ? <p className="cmy-err">{err}</p> : null}
        <div className="cmy-create-action">
          {step < 3 ? (
            <Button variant="primary" block disabled={step === 1 ? !canStep1 : !canStep2} onClick={goNext}>
              {stepAction}
            </Button>
          ) : (
            <Button variant="primary" block disabled={!canSubmit} onClick={() => void submit()}>
              {stepAction}
            </Button>
          )}
        </div>
      </div>

      {showCoverLib && (
        <CoverLibraryModal
          onPick={(url) => {
            setCoverImage(url);
            setShowCoverLib(false);
          }}
          onClose={() => setShowCoverLib(false)}
        />
      )}
      {legalSheet && <LegalSheet slug={legalSheet} onClose={() => setLegalSheet(null)} />}
      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          shape="rect"
          aspect={16 / 9}
          stageMax={420}
          outputPx={1200}
          title="Position your cover"
          subtitle="Drag and zoom. The cover keeps this wide shape."
          onCancel={() => setCropSrc(null)}
          onConfirm={(dataUrl) => {
            setCoverImage(dataUrl);
            setCropSrc(null);
          }}
        />
      )}
    </main>
  );
}

function LegalSheet({ slug, onClose }: { slug: "terms" | "privacy"; onClose: () => void }) {
  const doc = LEGAL_DOCS[slug];
  return (
    <BottomSheet onClose={onClose} labelledBy="cmy-legal-sheet-title">
      <div className="filter-sheet-header">
        <h3 id="cmy-legal-sheet-title" className="filter-sheet-title">{doc.title}</h3>
        <button type="button" className="btn-link" onClick={onClose}>
          Close
        </button>
      </div>
      <LegalContent doc={doc} hideTitle />
    </BottomSheet>
  );
}
