import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Pan + zoom crop before a photo is saved. Circle for profile pictures,
 * rectangle for plan and community covers. Nothing is committed until Continue.
 */
const STAGE_MAX = 260;

export function AvatarCropModal({
  src,
  outputPx = 512,
  aspect = 1,
  shape = "circle",
  stageMax = STAGE_MAX,
  title = "Position your photo",
  subtitle = "Drag to move, slide to zoom.",
  onCancel,
  onConfirm,
}: {
  src: string;
  /** Width of the saved image. Height follows `aspect`. */
  outputPx?: number;
  /** Width / height of the crop frame. */
  aspect?: number;
  shape?: "circle" | "rect";
  /** Longest side of the on-screen crop frame, in pixels. */
  stageMax?: number;
  title?: string;
  subtitle?: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const safeAspect = aspect > 0 ? aspect : 1;
  const [viewportW, setViewportW] = useState(() =>
    typeof window === "undefined" ? 390 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const requested = stageMax > 120 ? stageMax : STAGE_MAX;
  // Stay inside the dialog. The backdrop and card each pad 20px, so a frame
  // based on the raw window width used to spill past the card and clip the crop.
  const frame = Math.min(requested, Math.max(200, viewportW - 88));
  const stageW = safeAspect >= 1 ? frame : Math.round(frame * safeAspect);
  const stageH = safeAspect >= 1 ? Math.round(frame / safeAspect) : frame;
  const outW = outputPx;
  const outH = Math.max(1, Math.round(outputPx / safeAspect));

  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const placed = useRef(false);

  const coverScale = natural ? Math.max(stageW / natural.w, stageH / natural.h) : 1;
  const effScale = coverScale * zoom;

  function clampWith(o: { x: number; y: number }, eff: number) {
    const w = natural ? natural.w * eff : stageW;
    const h = natural ? natural.h * eff : stageH;
    return {
      x: Math.min(0, Math.max(stageW - w, o.x)),
      y: Math.min(0, Math.max(stageH - h, o.y)),
    };
  }

  function clamp(o: { x: number; y: number }) {
    return clampWith(o, effScale);
  }

  useEffect(() => {
    setZoom(1);
    setNatural(null);
    placed.current = false;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNatural({ w: img.width, h: img.height });
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (!natural || placed.current) return;
    placed.current = true;
    const cover = Math.max(stageW / natural.w, stageH / natural.h);
    setOffset({
      x: (stageW - natural.w * cover) / 2,
      y: (stageH - natural.h * cover) / 2,
    });
  }, [natural, stageW, stageH]);

  function onZoom(nextZoom: number) {
    if (!natural) return;
    const oldEff = coverScale * zoom;
    const newEff = coverScale * nextZoom;
    const cx = stageW / 2;
    const cy = stageH / 2;
    const nx = (cx - offset.x) / oldEff;
    const ny = (cy - offset.y) / oldEff;
    setZoom(nextZoom);
    setOffset(clampWith({ x: cx - nx * newEff, y: cy - ny * newEff }, newEff));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    setOffset(clamp({ x: drag.current.ox + dx, y: drag.current.oy + dy }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  function confirm() {
    const img = imgRef.current;
    if (!img || !natural) return;
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sW = stageW / effScale;
    const sH = stageH / effScale;
    const sx = -offset.x / effScale;
    const sy = -offset.y / effScale;
    ctx.drawImage(img, sx, sy, sW, sH, 0, 0, outW, outH);
    onConfirm(canvas.toDataURL("image/jpeg", 0.82));
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card avatar-crop-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="avatar-crop-title">{title}</h2>
        <p className="avatar-crop-sub">{subtitle}</p>

        <div
          className={`avatar-crop-stage${shape === "rect" ? " avatar-crop-stage--rect" : ""}`}
          style={{ width: stageW, height: stageH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {natural && (
            <img
              className="avatar-crop-img"
              src={src}
              alt=""
              draggable={false}
              style={{
                width: natural.w,
                height: natural.h,
                transformOrigin: "0 0",
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${effScale})`,
              }}
            />
          )}
          {shape === "circle" && <div className="avatar-crop-mask" aria-hidden="true" />}
        </div>

        <input
          className="avatar-crop-zoom"
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
          aria-label="Zoom"
        />

        <div className="avatar-crop-actions">
          <button type="button" className="btn-link" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={confirm} disabled={!natural}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
