import { Lightbulb } from "lucide-react";
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

/** Thought-bubble/idea mark from “Just an idea” / float an idea, on a warm gradient. */
export function IdeaCoverFallback({
  className = "",
  iconSize = 36,
}: {
  className?: string;
  iconSize?: number;
}) {
  return (
    <div className={`idea-cover-fallback ${className}`.trim()} aria-hidden="true">
      <Lightbulb size={iconSize} strokeWidth={1.6} />
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
        <IdeaCoverFallback iconSize={18} />
      </div>
    );
  }
  const src = pickCoverImage(pool, planId);
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
