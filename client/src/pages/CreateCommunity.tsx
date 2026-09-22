import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, ImagePlus, MapPin } from "lucide-react";
import { api } from "../api/http";
import { CoverLibraryModal } from "../components/CoverLibraryModal";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { LegalContent } from "../components/LegalContent";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { BottomSheet } from "../components/ui/BottomSheet";
import {
  ORGANIZER_GUIDELINE_ASKS,
  ORGANIZER_GUIDELINE_TOOLS,
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
  const navigate = useNavigate();
  const coverRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<CommunityCategory[]>([]);
  const [city, setCity] = useState("");
  const [visibility, setVisibility] = useState<CommunityAccessLevel>("everyone");
  const [screeningOn, setScreeningOn] = useState(false);
  const [screening, setScreening] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [showCoverLib, setShowCoverLib] = useState(false);
  const [legalSheet, setLegalSheet] = useState<"terms" | "privacy" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canStep1 =
    name.trim().length > 0 && Boolean(coverImage) && categories.length > 0 && !coverBusy;
  const canStep2 = canStep1 && description.trim().length > 0;
  const canSubmit = canStep2 && !busy;

  async function applyCoverFile(file: File) {
    setCoverBusy(true);
    setErr(null);
    try {
      setCoverImage(await fileToResizedDataUrl(file, 1024, 0.85));
    } catch {
      setErr("Couldn't read that image. Try another.");
    } finally {
      setCoverBusy(false);
    }
  }

  async function openCoverUpload() {
    if (isNative()) {
      setCoverBusy(true);
      setErr(null);
      try {
        const dataUrl = await pickPhotoNative({ maxPx: 1024, quality: 0.85 });
        if (dataUrl) setCoverImage(dataUrl);
      } catch {
        /* user canceled */
      } finally {
        setCoverBusy(false);
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
        setErr("Add a name, cover photo, and at least one category.");
        return;
      }
      setErr(null);
      setStep(2);
      return;
    }
    if (!canStep2) {
      setErr("Add a description.");
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
      <header className="app-header app-header--sticky create-header">
        <button type="button" className="back-circle" aria-label="Back" onClick={goBack}>
          <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="create-header-title cmy-create-title-block">
          <span>New community</span>
          <span className="cmy-create-step">Step {step} of 3</span>
        </div>
        {step < 3 ? (
          <button
            type="button"
            className="create-header-post"
            disabled={step === 1 ? !canStep1 : !canStep2}
            onClick={goNext}
          >
            Next
          </button>
        ) : (
          <span className="create-header-post" aria-hidden="true" style={{ visibility: "hidden" }}>
            Next
          </span>
        )}
        <div className="cmy-create-progress" aria-hidden="true">
          <span className={`cmy-create-progress-fill cmy-create-progress-fill--${step}`} />
        </div>
      </header>

      <div className="create-form cmy-create-body">
        {step === 1 ? (
          <>
            {coverImage ? (
              <div className="cover-picker cover-picker--filled">
                <img className="cover-picker-img" src={coverImage} alt="" />
                <div className="cover-picker-overlay">
                  <button type="button" className="cover-chip" disabled={coverBusy} onClick={() => setShowCoverLib(true)}>
                    Library
                  </button>
                  <button type="button" className="cover-chip" disabled={coverBusy} onClick={() => void openCoverUpload()}>
                    {coverBusy ? "Uploading…" : "Upload"}
                  </button>
                </div>
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

            <label className="luma-card cmy-create-name-card">
              <span className="cmy-create-card-kicker">Name your community</span>
              <input
                className="cmy-create-name"
                value={name}
                placeholder="e.g. Break Room Events"
                maxLength={80}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <div className="luma-card cmy-create-cats-card">
              <div className="cmy-create-cats-head">
                <span className="cmy-create-card-kicker">What&apos;s it about?</span>
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

            <div className="luma-card luma-row cmy-create-city-row">
              <MapPin size={16} strokeWidth={1.8} aria-hidden="true" />
              <LocationAutocomplete
                name={city}
                address=""
                placeholder="City or neighborhood"
                onChange={(v) => setCity(v.name.slice(0, 80))}
              />
            </div>

            <div className="luma-card luma-row cmy-create-vis-row">
              <div>
                <p className="cmy-create-vis-label">Visibility</p>
                <p className="cmy-hint">
                  {visibility === "everyone"
                    ? "Anyone can find and join"
                    : "Only people you approve can join"}
                </p>
              </div>
              <div className="cmy-segmented cmy-create-seg">
                <button
                  type="button"
                  className={`cmy-seg ${visibility === "everyone" ? "cmy-seg--active" : ""}`}
                  onClick={() => setVisibility("everyone")}
                >
                  Public
                </button>
                <button
                  type="button"
                  className={`cmy-seg ${visibility === "members_only" ? "cmy-seg--active" : ""}`}
                  onClick={() => setVisibility("members_only")}
                >
                  Private
                </button>
              </div>
            </div>
          </>
        ) : step === 2 ? (
          <>
            <label className="luma-card cmy-create-desc-card">
              <span className="cmy-create-card-kicker">Description</span>
              <textarea
                className="cmy-textarea cmy-create-desc"
                rows={5}
                value={description}
                maxLength={280}
                placeholder="What's the vibe? Who is this for? What can members expect?"
                onChange={(e) => setDescription(e.target.value)}
              />
              <span className="cmy-create-count cmy-create-count--end">
                {description.length} / 280
              </span>
            </label>

            <div className="luma-card cmy-create-screen-card">
              <div className="cmy-toggle-row">
                <div>
                  <p className="cmy-create-vis-label">Screening questions</p>
                  <p className="cmy-hint">
                    A few questions before they join.
                  </p>
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
                  placeholder="e.g. What's your typical pace?"
                  maxLength={280}
                  onChange={(e) => setScreening(e.target.value)}
                />
              ) : null}
            </div>

            <Button variant="primary" block disabled={!canStep2} onClick={goNext}>
              Next
            </Button>
          </>
        ) : (
          <>
            <div className="cmy-guidelines">
              <h1 className="guidelines-heading">COMMONS Community Guidelines</h1>
              <p className="cmy-guidelines-intro">A few things we ask of every organizer.</p>
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
              <h2 className="cmy-guidelines-tools-heading">What you&apos;re working with</h2>
              <ul className="guidelines-list">
                {ORGANIZER_GUIDELINE_TOOLS.map((item) => (
                  <li key={item.title}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="cmy-guidelines-agree">
                By creating a community, you agree to these guidelines and our{" "}
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
            <Button variant="primary" block disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? "Creating…" : "I agree"}
            </Button>
          </>
        )}

        {err ? <p className="cmy-err">{err}</p> : null}
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
