import type { CSSProperties, ReactNode } from "react";

const ICONS: Array<{
  key: string;
  top: string;
  left: string;
  size: number;
  delay: string;
  duration: string;
  rotate: string;
  svg: ReactNode;
}> = [
  // Coffee cup
  {
    key: "coffee",
    top: "12%",
    left: "8%",
    size: 56,
    delay: "0s",
    duration: "5.5s",
    rotate: "-8deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
        <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
        <path d="M6 2v3" />
        <path d="M10 2v3" />
        <path d="M14 2v3" />
      </svg>
    ),
  },
  // Dumbbell (workout)
  {
    key: "dumbbell",
    top: "22%",
    left: "78%",
    size: 64,
    delay: "0.6s",
    duration: "6.4s",
    rotate: "12deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6.5 6.5 11 11" />
        <path d="m21 21-1-1" />
        <path d="m3 3 1 1" />
        <path d="m18 22 4-4" />
        <path d="m2 6 4-4" />
        <path d="m3 10 7-7" />
        <path d="m14 21 7-7" />
      </svg>
    ),
  },
  // Mountain (outdoors)
  {
    key: "mountain",
    top: "48%",
    left: "5%",
    size: 70,
    delay: "1.2s",
    duration: "7s",
    rotate: "0deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
      </svg>
    ),
  },
  // Music / karaoke
  {
    key: "music",
    top: "70%",
    left: "20%",
    size: 50,
    delay: "0.3s",
    duration: "5.2s",
    rotate: "-14deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  // Pizza slice (food / social)
  {
    key: "pizza",
    top: "62%",
    left: "82%",
    size: 56,
    delay: "1.8s",
    duration: "6.8s",
    rotate: "16deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 11h.01" />
        <path d="M11 15h.01" />
        <path d="M16 16h.01" />
        <path d="m2 16 20 6-6-20A20 20 0 0 0 2 16" />
        <path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4" />
      </svg>
    ),
  },
  // Ticket (events)
  {
    key: "ticket",
    top: "82%",
    left: "60%",
    size: 60,
    delay: "0.9s",
    duration: "6s",
    rotate: "8deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
        <path d="M13 5v2" />
        <path d="M13 17v2" />
        <path d="M13 11v2" />
      </svg>
    ),
  },
  // Sparkle
  {
    key: "sparkle",
    top: "8%",
    left: "55%",
    size: 36,
    delay: "1.4s",
    duration: "4.6s",
    rotate: "0deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="m5.6 5.6 2.1 2.1" />
        <path d="m16.3 16.3 2.1 2.1" />
        <path d="m5.6 18.4 2.1-2.1" />
        <path d="m16.3 7.7 2.1-2.1" />
      </svg>
    ),
  },
  // Pin / location
  {
    key: "pin",
    top: "36%",
    left: "42%",
    size: 44,
    delay: "2.1s",
    duration: "5.8s",
    rotate: "-6deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  // Wine / drinks
  {
    key: "wine",
    top: "38%",
    left: "88%",
    size: 42,
    delay: "0.4s",
    duration: "5.4s",
    rotate: "10deg",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 22h8" />
        <path d="M12 11v11" />
        <path d="M19 3H5l1.4 7.5a6 6 0 0 0 11.2 0Z" />
      </svg>
    ),
  },
];

export function LoadingScreen({ tagline = "Loading your plans" }: { tagline?: string }) {
  return (
    <div className="loader-screen" role="status" aria-live="polite">
      <div className="loader-icons" aria-hidden="true">
        {ICONS.map((icon) => {
          const style: CSSProperties & { ["--rot"]?: string } = {
            top: icon.top,
            left: icon.left,
            width: icon.size,
            height: icon.size,
            animationDelay: icon.delay,
            animationDuration: icon.duration,
            ["--rot"]: icon.rotate,
          };
          return (
            <span key={icon.key} className="loader-icon" style={style}>
              {icon.svg}
            </span>
          );
        })}
      </div>

      <div className="loader-center">
        <h1 className="loader-wordmark">COMMONS</h1>
        <div className="loader-tagline">{tagline}</div>
        <div className="loader-bar" />
      </div>
    </div>
  );
}
