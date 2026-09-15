import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { CoverLibraryModal } from "../components/CoverLibraryModal";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import {
  ALL_COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  MAX_COMMUNITY_CATEGORIES,
  toggleCommunityCategory,
  type CommunityCategory,
  type CommunityDTO,
} from "../types/shared";
import "./Communities.css";

export function CreateCommunityPage() {
  const navigate = useNavigate();
  const coverRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<CommunityCategory[]>([]);
  const [screening, setScreening] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [showCoverLib, setShowCoverLib] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    Boolean(coverImage) &&
    categories.length > 0 &&
    !busy &&
    !coverBusy;

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
          screeningQuestion: screening.trim() || undefined,
          coverImage,
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

  return (
    <main className="app-shell app-shell--with-nav app-shell--with-topbar cmy">
      <header className="cmy-create-head">
        <button type="button" className="detail-back" onClick={() => navigate(-1)}>← Back</button>
        <h1 className="cmy-create-kicker">Create a community</h1>
      </header>

      <div className="cmy-settings">
        <label className="cmy-field cmy-create-name-field">
          <input
            className="cmy-create-name"
            value={name}
            placeholder="Community name"
            maxLength={80}
            autoComplete="off"
            aria-label="Community name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="cmy-cover-upload">
          <span className="cmy-field-label">Cover photo</span>
          {coverImage ? (
            <div className="cmy-cover-preview" style={{ backgroundImage: `url(${coverImage})` }}>
              <div className="cmy-cover-preview-actions">
                <button
                  type="button"
                  className="cmy-btn cmy-btn--ghost cmy-btn--sm"
                  disabled={coverBusy}
                  onClick={() => setShowCoverLib(true)}
                >
                  Library
                </button>
                <button
                  type="button"
                  className="cmy-btn cmy-btn--ghost cmy-btn--sm"
                  disabled={coverBusy}
                  onClick={() => void openCoverUpload()}
                >
                  {coverBusy ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          ) : (
            <div className="cmy-cover-empty">
              <button
                type="button"
                className="cmy-cover-upload-btn"
                disabled={coverBusy}
                onClick={() => setShowCoverLib(true)}
              >
                {coverBusy ? "Uploading…" : "Add a cover photo"}
              </button>
              <button
                type="button"
                className="cmy-btn cmy-btn--ghost cmy-btn--sm"
                disabled={coverBusy}
                onClick={() => void openCoverUpload()}
              >
                Upload your own
              </button>
            </div>
          )}
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

        <div className="cmy-field">
          <span>Categories <em className="cmy-hint">({categories.length}/{MAX_COMMUNITY_CATEGORIES})</em></span>
          <div className="cmy-create-cats" role="group" aria-label="Categories">
            {ALL_COMMUNITY_CATEGORIES.map((c) => {
              const selected = categories.includes(c);
              const blocked = !selected && categories.length >= MAX_COMMUNITY_CATEGORIES;
              return (
                <button
                  key={c}
                  type="button"
                  className={`cmy-cat-pill ${selected ? "is-active" : ""}`}
                  aria-pressed={selected}
                  disabled={blocked}
                  onClick={() => setCategories((prev) => toggleCommunityCategory(prev, c))}
                >
                  {COMMUNITY_CATEGORY_LABELS[c]}
                </button>
              );
            })}
          </div>
        </div>

        <label className="cmy-field">
          <span>Description</span>
          <textarea
            className="cmy-textarea"
            rows={4}
            value={description}
            placeholder="What's this community about, who's it for, when do you meet?"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="cmy-field">
          <span>Screening question <em className="cmy-hint">(optional — leave blank for instant join)</em></span>
          <textarea
            className="cmy-textarea"
            rows={3}
            value={screening}
            placeholder="e.g. What's your typical pace?"
            maxLength={280}
            onChange={(e) => setScreening(e.target.value)}
          />
        </label>

        {err && <p className="cmy-err">{err}</p>}
        <p className="cmy-hint cmy-create-note">
          Your community goes live right away. Others can find it in Communities and join.
        </p>
        <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--block" disabled={!canSubmit} onClick={() => void submit()}>
          Create community
        </button>
      </div>
    </main>
  );
}
