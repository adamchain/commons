import { CommunityCover } from "./CommunityCover";
import { pickCoverImage, useCardImages } from "../lib/cardImages";
import type { CommunityCategory } from "../types/shared";

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

/** Plan flyer if one was added, otherwise a stable library cover. */
export function PlanCoverThumb({
  planId,
  flyerDataUrl,
  className = "",
}: {
  planId: string;
  flyerDataUrl?: string | null;
  className?: string;
}) {
  const pool = useCardImages();
  const src = flyerDataUrl || pickCoverImage(pool, planId);
  return <CoverThumb src={src} className={className} />;
}

/** Community cover photo, or the category pattern when none is set. */
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
