import { useMemo, useState } from "react";
import type { AvatarStyle } from "../types/shared";
import { Avatar } from "./Avatar";

interface AvatarBuilderProps {
  initialSeed: string;
  initialStyle?: AvatarStyle;
  onSave: (seed: string, style: AvatarStyle) => void;
}

const STYLES: Array<{ id: AvatarStyle; label: string }> = [
  { id: "avataaars", label: "Classic" },
  { id: "big-smile", label: "Big Smile" },
  { id: "fun-emoji", label: "Emoji" },
];

// We can't deeply customize DiceBear without their npm package, so we offer
// a "shuffle" interface that re-rolls the seed plus a style picker. Keeps the
// PRD vibe (low-friction face creation) without shipping a 5-dropdown form.
export function AvatarBuilder({ initialSeed, initialStyle = "avataaars", onSave }: AvatarBuilderProps) {
  const [seed, setSeed] = useState(initialSeed);
  const [style, setStyle] = useState<AvatarStyle>(initialStyle);

  const previewSeeds = useMemo(() => Array.from({ length: 6 }, () => randomSeed()), []);
  const [pool, setPool] = useState<string[]>(previewSeeds);

  function reshuffle() {
    setPool(Array.from({ length: 6 }, () => randomSeed()));
  }

  return (
    <div className="avatar-builder">
      <div className="avatar-builder-current">
        <Avatar seed={seed} style={style} size="xl" />
      </div>

      <div className="avatar-builder-styles">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`avatar-style-pill ${s.id === style ? "is-active" : ""}`}
            onClick={() => setStyle(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="avatar-builder-pool">
        {pool.map((s) => (
          <button
            key={s}
            type="button"
            className={`avatar-pool-tile ${s === seed ? "is-active" : ""}`}
            onClick={() => setSeed(s)}
          >
            <Avatar seed={s} style={style} size="md" />
          </button>
        ))}
      </div>

      <div className="avatar-builder-actions">
        <button type="button" className="btn-secondary" onClick={reshuffle}>
          Shuffle
        </button>
        <button type="button" className="btn-primary" onClick={() => onSave(seed, style)}>
          Looks good
        </button>
      </div>
    </div>
  );
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
