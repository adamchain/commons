import { useMemo, useRef, useState } from "react";
import type { AvatarStyle } from "../types/shared";
import { Avatar } from "./Avatar";
import { isNative } from "../lib/platform";
import { pickPhotoNative } from "../lib/photoPicker";

interface AvatarBuilderProps {
  initialSeed: string;
  initialStyle?: AvatarStyle;
  initialPhotoDataUrl?: string;
  onSave: (seed: string, style: AvatarStyle, photoDataUrl: string | null) => void;
}

const STYLES: Array<{ id: AvatarStyle; label: string }> = [
  { id: "avataaars", label: "Classic" },
  { id: "big-smile", label: "Big Smile" },
  { id: "fun-emoji", label: "Emoji" },
];

const TARGET_PX = 256;
const JPEG_QUALITY = 0.82;

type Mode = "build" | "upload";

export function AvatarBuilder({ initialSeed, initialStyle = "avataaars", initialPhotoDataUrl, onSave }: AvatarBuilderProps) {
  const [mode, setMode] = useState<Mode>(initialPhotoDataUrl ? "upload" : "build");
  const [seed, setSeed] = useState(initialSeed);
  const [style, setStyle] = useState<AvatarStyle>(initialStyle);
  const [photo, setPhoto] = useState<string | null>(initialPhotoDataUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewSeeds = useMemo(() => Array.from({ length: 6 }, () => randomSeed()), []);
  const [pool, setPool] = useState<string[]>(previewSeeds);

  function reshuffle() {
    setPool(Array.from({ length: 6 }, () => randomSeed()));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file, TARGET_PX, JPEG_QUALITY);
      setPhoto(dataUrl);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openPicker() {
    if (isNative()) {
      setUploading(true);
      try {
        const dataUrl = await pickPhotoNative({ maxPx: TARGET_PX, quality: JPEG_QUALITY });
        if (dataUrl) setPhoto(dataUrl);
      } catch {
        /* user canceled or denied permission */
      } finally {
        setUploading(false);
      }
      return;
    }
    fileRef.current?.click();
  }

  function commit() {
    if (mode === "upload" && photo) {
      onSave(seed, style, photo);
    } else {
      onSave(seed, style, null);
    }
  }

  return (
    <div className="avatar-builder">
      <div className="avatar-builder-tabs">
        <button
          type="button"
          className={`avatar-tab ${mode === "build" ? "is-active" : ""}`}
          onClick={() => setMode("build")}
        >
          Build
        </button>
        <button
          type="button"
          className={`avatar-tab ${mode === "upload" ? "is-active" : ""}`}
          onClick={() => setMode("upload")}
        >
          Upload
        </button>
      </div>

      {mode === "build" ? (
        <>
          <div className="avatar-builder-current">
            <Avatar seed={seed} style={style} size="xl" />
          </div>

          <div className="avatar-builder-styles">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`avatar-style-pill ${s.id === style ? "is-active" : ""}`}
                onClick={() => setStyle(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="avatar-builder-pool">
            {pool.map((s) => (
              <button
                key={s}
                type="button"
                className={`avatar-pool-tile ${s === seed ? "is-active" : ""}`}
                onClick={() => setSeed(s)}
              >
                <Avatar seed={s} style={style} size="md" />
              </button>
            ))}
          </div>

          <div className="avatar-builder-actions">
            <button type="button" className="btn-secondary" onClick={reshuffle}>
              Shuffle
            </button>
            <button type="button" className="btn-primary" onClick={commit}>
              Looks good
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="avatar-builder-current">
            {photo ? (
              <img src={photo} className="avatar avatar-xl" alt="" />
            ) : (
              <div className="avatar avatar-xl avatar-placeholder">📷</div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={(e) => void onFile(e)}
            style={{ display: "none" }}
          />

          <div className="avatar-builder-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void openPicker()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : photo ? "Choose another" : "Choose photo"}
            </button>
            <button type="button" className="btn-primary" disabled={!photo || uploading} onClick={commit}>
              Looks good
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function fileToResizedDataUrl(file: File, maxPx: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        const ratio = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not available"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
