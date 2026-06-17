import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Circular crop + confirm step for a freshly-picked profile photo. The user
 * pans (drag) and zooms (slider) within a round mask, then must hit Continue to
 * commit — nothing is locked in until they confirm. Outputs a square JPEG data
 * URL sized to `outputPx`.
 */
const CROP = 260; // on-screen crop box (square, px)

export function AvatarCropModal({
  src,
  outputPx = 512,
  onCancel,
  onConfirm,
}: {
  src: string;
  outputPx?: number;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Scale needed for the image to fully cover the crop box at zoom = 1.
  const coverScale = natural ? Math.max(CROP / natural.w, CROP / natural.h) : 1;
  const effScale = coverScale * zoom;
  const dispW = natural ? natural.w * effScale : CROP;
  const dispH = natural ? natural.h * effScale : CROP;

  // Keep the image covering the crop box at all times.
  function clamp(o: { x: number; y: number }) {
    const minX = CROP - dispW;
    const minY = CROP - dispH;
    return {
      x: Math.min(0, Math.max(minX, o.x)),
      y: Math.min(0, Math.max(minY, o.y)),
    };
  }

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNatural({ w: img.width, h: img.height });
    };
    img.src = src;
  }, [src]);

  // Center the image once we know its size.
  useEffect(() => {
    if (!natural) return;
    setOffset({ x: (CROP - dispW) / 2, y: (CROP - dispH) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural]);

  function onZoom(nextZoom: number) {
    if (!natural) return;
    const oldEff = coverScale * zoom;
    const newEff = coverScale * nextZoom;
    // Zoom around the center of the crop box so it feels anchored.
    const cx = CROP / 2;
    const cy = CROP / 2;
    const nx = (cx - offset.x) / oldEff;
    const ny = (cy - offset.y) / oldEff;
    const next = clampWith({ x: cx - nx * newEff, y: cy - ny * newEff }, newEff);
    setZoom(nextZoom);
    setOffset(next);
  }

  function clampWith(o: { x: number; y: number }, eff: number) {
    const w = natural ? natural.w * eff : CROP;
    const h = natural ? natural.h * eff : CROP;
    return {
      x: Math.min(0, Math.max(CROP - w, o.x)),
      y: Math.min(0, Math.max(CROP - h, o.y)),
    };
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
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = outputPx;
    canvas.height = outputPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Map the crop box back into natural image coordinates.
    const sSize = CROP / effScale;
    const sx = -offset.x / effScale;
    const sy = -offset.y / effScale;
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, outputPx, outputPx);
    onConfirm(canvas.toDataURL("image/jpeg", 0.85));
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card avatar-crop-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="avatar-crop-title">Position your photo</h2>
        <p className="avatar-crop-sub">Drag to move, slide to zoom.</p>

        <div
          className="avatar-crop-stage"
          style={{ width: CROP, height: CROP }}
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
                width: dispW,
                height: dispH,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
          <div className="avatar-crop-mask" aria-hidden="true" />
        </div>

        <input
          className="avatar-crop-zoom"
          type="range"
          min={1}
          max={3}
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
