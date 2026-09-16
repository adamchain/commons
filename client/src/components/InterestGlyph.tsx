import { interestVisual } from "../lib/interestIcons";

/** Colored icon-in-circle — the coffee-cup treatment on plan-summary pills. */
export function InterestGlyph({
  tag,
  size = 32,
  iconSize,
  className = "",
}: {
  tag: string | null | undefined;
  size?: number;
  iconSize?: number;
  className?: string;
}) {
  const { Icon, iconColor, tint } = interestVisual(tag);
  const glyph = iconSize ?? Math.round(size * 0.5);
  return (
    <span
      className={`interest-glyph ${className}`.trim()}
      style={{ width: size, height: size, background: tint, color: iconColor }}
      aria-hidden="true"
    >
      <Icon size={glyph} strokeWidth={1.8} />
    </span>
  );
}
