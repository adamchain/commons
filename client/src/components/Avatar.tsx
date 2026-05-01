import type { AvatarStyle } from "../types/shared";

interface AvatarProps {
  seed: string;
  style?: AvatarStyle;
  size?: "sm" | "md" | "lg" | "xl";
  backgroundColor?: string;
}

const PIXEL_SIZE: Record<NonNullable<AvatarProps["size"]>, number> = {
  sm: 32,
  md: 48,
  lg: 72,
  xl: 128,
};

// DiceBear v9 public HTTP API — returns SVG. No auth, free, cacheable.
// Docs: https://www.dicebear.com/styles/
export function dicebearUrl(seed: string, style: AvatarStyle = "avataaars", pixelSize = 96, backgroundColor?: string): string {
  const params = new URLSearchParams({ seed, size: String(pixelSize) });
  if (backgroundColor) params.set("backgroundColor", backgroundColor);
  return `https://api.dicebear.com/9.x/${style}/svg?${params.toString()}`;
}

export function Avatar({ seed, style = "avataaars", size = "md", backgroundColor }: AvatarProps) {
  const px = PIXEL_SIZE[size];
  const cls = `avatar avatar-${size}`;
  return (
    <img
      src={dicebearUrl(seed, style, px * 2, backgroundColor)}
      width={px}
      height={px}
      className={cls}
      alt=""
      loading="lazy"
    />
  );
}
