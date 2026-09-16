import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

/**
 * Explore masthead: full-bleed photo, small-caps eyebrow, bold headline.
 */
export function PhotoHero({
  photo,
  eyebrow,
  title,
  pin = true,
  topLeft,
  topRight,
}: {
  photo: string;
  eyebrow: string;
  title: string;
  pin?: boolean;
  topLeft?: ReactNode;
  topRight?: ReactNode;
}) {
  return (
    <header className="xpl-hero">
      <img src={photo} alt="" className="xpl-hero-img" />
      <div className="xpl-hero-gradient" aria-hidden="true" />
      {topLeft ? <div className="xpl-hero-top xpl-hero-top--left">{topLeft}</div> : null}
      {topRight ? <div className="xpl-hero-top xpl-hero-top--right">{topRight}</div> : null}
      <div className="xpl-hero-copy">
        <div className="xpl-hero-location">
          {pin ? <MapPin size={10} color="var(--red)" strokeWidth={2.2} aria-hidden="true" /> : null}
          <span>{eyebrow}</span>
        </div>
        <h1 className="xpl-hero-title">{title}</h1>
      </div>
    </header>
  );
}
