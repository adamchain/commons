import type { AvatarStyle } from "../types/shared";

interface AvatarProps {
  seed: string;
  style?: AvatarStyle;
  size?: "sm" | "md" | "lg" | "xl";
  backgroundColor?: string;
  photoDataUrl?: string;
  /** DiceBear URL overrides ("top=longHair&skinColor=..."). Stamps the generated avatar with the user's preset. */
  params?: string;
  /** When set (and no photo), show initials instead of illustrated avatar. */
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

export function dicebearUrl(
  seed: string,
  style: AvatarStyle = "avataaars",
  pixelSize = 96,
  backgroundColor?: string,
  params?: string,
): string {
  const search = new URLSearchParams({ seed, size: String(pixelSize) });
  if (backgroundColor) search.set("backgroundColor", backgroundColor);
  let url = `https://api.dicebear.com/9.x/${style}/svg?${search.toString()}`;
  // Append preset overrides verbatim — DiceBear takes the first occurrence,
  // so caller-provided `top`/`skinColor`/etc. win over the seed's randoms.
  if (params) url += `&${params}`;
  return url;
}

export function Avatar({
  seed,
  style = "avataaars",
  size = "md",
  backgroundColor,
  photoDataUrl,
  params,
  name,
}: AvatarProps) {
  const px = PIXEL_SIZE[size];
  const cls = `avatar avatar-${size}`;
  if (photoDataUrl) {
    return <img src={photoDataUrl} width={px} height={px} className={cls} alt="" loading="lazy" />;
  }
  // When the user has picked a preset, render the customized DiceBear directly.
  if (params) {
    const src = dicebearUrl(seed, style, px * 2, backgroundColor, params);
    return <img src={src} width={px} height={px} className={cls} alt="" loading="lazy" />;
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
