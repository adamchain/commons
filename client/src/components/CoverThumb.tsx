import { CommunityCover } from "./CommunityCover";
import { pickCoverImage, useCardImages } from "../lib/cardImages";
import { photoForInterest } from "../lib/placePhotos";
import type { CommunityCategory } from "../types/shared";

const IDEA_GRADIENTS = [
  "linear-gradient(145deg, #f7ead4 0%, #f3dcc8 46%, #efd0d0 100%)",
  "linear-gradient(145deg, #e8e0f5 0%, #d9cff0 46%, #cec8ea 100%)",
  "linear-gradient(145deg, #d4edda 0%, #c8e3cc 46%, #bcd9c0 100%)",
  "linear-gradient(145deg, #d4e8f7 0%, #c8dcf0 46%, #bfd3ea 100%)",
  "linear-gradient(145deg, #f7e8c2 0%, #f0dab0 46%, #e8cc9a 100%)",
  "linear-gradient(145deg, #cce8e4 0%, #c0deda 46%, #b4d4d0 100%)",
  "linear-gradient(145deg, #f5d8d8 0%, #edcece 46%, #e4c4c4 100%)",
  "linear-gradient(145deg, #f5ddd0 0%, #edcfc0 46%, #e4c0ad 100%)",
];

function seedGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  return IDEA_GRADIENTS[Math.abs(h) % IDEA_GRADIENTS.length];
}

/** Host-supplied cover: uploaded flyer, or the image from an attached link. */
export function planPhotoUrl(plan: {
  flyerDataUrl?: string | null;
  flyerLinkPreview?: { image?: string | null } | null;
}): string | null {
  return plan.flyerDataUrl || plan.flyerLinkPreview?.image || null;
}

/** Small photo tile for list rows (profile, messages, my plans). */
export function CoverThumb({
  src,
  className = "",
}: {
  src: string;
  className?: string;
}) {
  return <img src={src} alt="" className={`cover-thumb ${className}`.trim()} loading="lazy" />;
}

/** Gradient background for ideas with no image — color is stable per seed (plan/tag id). */
export function IdeaCoverFallback({
  seed = "",
  className = "",
}: {
  seed?: string;
  className?: string;
}) {
  return (
    <div
      className={`idea-cover-fallback ${className}`.trim()}
      style={{ background: seedGradient(seed) }}
      aria-hidden="true"
    />
  );
}

/** Interest/forum tile: real photo when we have one, otherwise a gradient. */
export function InterestCover({
  tag,
  className = "",
}: {
  tag: string | null | undefined;
  className?: string;
}) {
  const photo = photoForInterest(tag);
  if (photo) return <CoverThumb src={photo} className={className} />;
  return (
    <div className={`cover-thumb-frame ${className}`.trim()}>
      <IdeaCoverFallback seed={tag ?? ""} />
    </div>
  );
}

/** Plan flyer if one was added; ideas without a photo use the idea mark; otherwise a stock cover. */
export function PlanCoverThumb({
  planId,
  flyerDataUrl,
  isIdea = false,
  className = "",
}: {
  planId: string;
  flyerDataUrl?: string | null;
  isIdea?: boolean;
  className?: string;
}) {
  const pool = useCardImages();
  if (flyerDataUrl) return <CoverThumb src={flyerDataUrl} className={className} />;
  if (isIdea) {
    return (
      <div className={`cover-thumb-frame ${className}`.trim()}>
        <IdeaCoverFallback seed={planId} />
      </div>
    );
  }
  const src = pickCoverImage(pool, planId);
  return <CoverThumb src={src} className={className} />;
}

/** Community cover photo, editorial interest photo, or the category pattern. */
export function CommunityCoverThumb({
  coverImage,
  category,
  className = "",
  iconSize = 16,
}: {
  coverImage: string | null;
  category: CommunityCategory;
  className?: string;
  iconSize?: number;
}) {
  return (
    <div className={`cover-thumb-frame ${className}`.trim()}>
      <CommunityCover coverImage={coverImage} category={category} iconSize={iconSize} />
    </div>
  );
}
