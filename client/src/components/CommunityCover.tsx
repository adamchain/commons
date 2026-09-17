import type { ReactNode } from "react";
import { interestVisual } from "../lib/interestIcons";
import { photoForInterest } from "../lib/placePhotos";
import type { CommunityCategory } from "../types/shared";
import "./CommunityCover.css";

type Props = {
  coverImage: string | null;
  category: CommunityCategory;
  className?: string;
  /** Lucide icon size for the empty-cover fallback. */
  iconSize?: number;
  children?: ReactNode;
};

/** Cover photo, editorial interest photo, or a category mark when none exist. */
export function CommunityCover({
  coverImage,
  category,
  className = "",
  iconSize = 28,
  children,
}: Props) {
  const vis = interestVisual(category);
  const Icon = vis.Icon;
  const photo = coverImage || photoForInterest(category);
  return (
    <div className={`cmy-cover-media ${className}`.trim()}>
      {photo ? (
        <img src={photo} alt="" className="cmy-cover-media-img" loading="lazy" />
      ) : (
        <div
          className="cmy-cover-fallback"
          style={{ backgroundColor: vis.tint, color: vis.iconColor }}
          aria-hidden="true"
        >
          <Icon size={iconSize} strokeWidth={1.6} />
        </div>
      )}
      {children}
    </div>
  );
}
