import type { AvatarStyle } from "../types/shared";

interface AvatarProps {
  seed: string;
  style?: AvatarStyle;
  size?: "sm" | "md" | "lg" | "xl";
  backgroundColor?: string;
  photoDataUrl?: string;
  /** User-picked emoji shown in a tinted circle. Highest priority when set. */
  emoji?: string;
  /** When set (and no photo/emoji), show initials instead of illustrated avatar. */
  name?: string;
}

const PIXEL_SIZE: Record<NonNullable<AvatarProps["size"]>, number> = {
  sm: 32,
  md: 48,
  lg: 72,
  xl: 128,
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase();
  const one = parts[0] ?? "?";
  return one.slice(0, 2).toUpperCase();
}

export function dicebearUrl(seed: string, style: AvatarStyle = "avataaars", pixelSize = 96, backgroundColor?: string): string {
  const params = new URLSearchParams({ seed, size: String(pixelSize) });
  if (backgroundColor) params.set("backgroundColor", backgroundColor);
  return `https://api.dicebear.com/9.x/${style}/svg?${params.toString()}`;
}

export function Avatar({ seed, style = "avataaars", size = "md", backgroundColor, photoDataUrl, emoji, name }: AvatarProps) {
  const px = PIXEL_SIZE[size];
  const cls = `avatar avatar-${size}`;
  if (emoji?.trim()) {
    return (
      <span
        className={`${cls} avatar-emoji`}
        style={{ width: px, height: px, fontSize: px * 0.58 }}
        aria-hidden
      >
        {emoji}
      </span>
    );
  }
  if (photoDataUrl) {
    return <img src={photoDataUrl} width={px} height={px} className={cls} alt="" loading="lazy" />;
  }
  if (name?.trim()) {
    return (
      <span
        className={`${cls} avatar-initials`}
        style={{ width: px, height: px, fontSize: px * 0.35 }}
        aria-hidden
      >
        {initialsFrom(name)}
      </span>
    );
  }
  const src = dicebearUrl(seed, style, px * 2, backgroundColor);
  return <img src={src} width={px} height={px} className={cls} alt="" loading="lazy" />;
}
