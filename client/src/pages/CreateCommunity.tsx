import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { fileToResizedDataUrl } from "../lib/imageResize";
import { pickPhotoNative } from "../lib/photoPicker";
import { isNative } from "../lib/platform";
import {
  ALL_COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_LABELS,
  type CommunityCategory,
  type CommunityDTO,
} from "../types/shared";
import "./Communities.css";

export function CreateCommunityPage() {
  const navigate = useNavigate();
  const coverRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CommunityCategory>("social");
  const [screening, setScreening] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && description.trim().length > 0 && !busy;

  async function pickCover(file?: File) {
    setCoverBusy(true);
    try {
      let dataUrl: string | null = null;
      if (isNative()) {
        dataUrl = await pickPhotoNative({ maxPx: 1024, quality: 0.85 });
      } else if (file) {
        dataUrl = await fileToResizedDataUrl(file, 1024, 0.85);
      }
      if (dataUrl) setCoverImage(dataUrl);
    } catch {
      setErr("Couldn't read that image. Try another.");
    } finally {
      setCoverBusy(false);
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const created = await api<CommunityDTO>("/api/communities", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category,
          screeningQuestion: screening.trim() || undefined,
          coverImage: coverImage ?? undefined,
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
        <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" onClick={() => navigate(-1)}>← Back</button>
        <h1 className="cmy-name">Create a community</h1>
      </header>

      <div className="cmy-settings">
        <div className="cmy-cover-upload">
          <span className="cmy-field-label">Cover image <em className="cmy-hint">(optional)</em></span>
          {coverImage ? (
            <div className="cmy-cover-preview" style={{ backgroundImage: `url(${coverImage})` }}>
              <div className="cmy-cover-preview-actions">
                <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" disabled={coverBusy} onClick={() => void pickCover()}>
                  Change
                </button>
                <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" onClick={() => setCoverImage(null)}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="cmy-cover-upload-btn" disabled={coverBusy} onClick={() => void pickCover()}>
              {coverBusy ? "Uploading…" : "Upload cover photo"}
            </button>
          )}
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickCover(f);
              if (coverRef.current) coverRef.current.value = "";
            }}
          />
          {!isNative() && !coverImage && (
            <button type="button" className="cmy-btn cmy-btn--ghost cmy-btn--sm" onClick={() => coverRef.current?.click()}>
              Choose from library
            </button>
          )}
        </div>
        <label className="cmy-field">
          <span>Name</span>
          <input className="cmy-input" value={name} placeholder="Saturday Long Run" maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="cmy-field">
          <span>Description</span>
          <textarea className="cmy-textarea" rows={4} value={description} placeholder="What's this community about, who's it for, when do you meet?" onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="cmy-field">
          <span>Category</span>
          <select className="cmy-input" value={category} onChange={(e) => setCategory(e.target.value as CommunityCategory)}>
            {ALL_COMMUNITY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{COMMUNITY_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
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
          Your community goes live right away. Others can find it in Explore and join.
        </p>
        <button type="button" className="cmy-btn cmy-btn--primary cmy-btn--block" disabled={!canSubmit} onClick={submit}>
          Create community
        </button>
      </div>
    </main>
  );
}
