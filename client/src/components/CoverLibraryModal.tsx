import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { api } from "../api/http";
import { BottomSheet } from "./ui/BottomSheet";

type CoverCatalogCategory = {
  id: string;
  label: string;
  images: { url: string; label: string; category: string }[];
};

const COVER_PAGE_SIZE = 16;

function uniqueImages(categories: CoverCatalogCategory[]) {
  const seen = new Set<string>();
  const images: CoverCatalogCategory["images"] = [];
  for (const category of categories) {
    for (const image of category.images) {
      if (seen.has(image.url)) continue;
      seen.add(image.url);
      images.push(image);
    }
  }
  return images;
}

export function CoverLibraryModal({
  onPick,
  onClose,
}: {
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [allImages, setAllImages] = useState<CoverCatalogCategory["images"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(COVER_PAGE_SIZE);
  const gridRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await api<{ categories: CoverCatalogCategory[] }>("/api/card-images/catalog");
        if (!alive) return;
        setAllImages(uniqueImages(r.categories));
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Couldn't load covers");
        setAllImages([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const images = (allImages ?? []).slice(0, visibleCount);
  const hasMore = (allImages?.length ?? 0) > visibleCount;

  useEffect(() => {
    const node = moreRef.current;
    const root = gridRef.current;
    if (!node || !root || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => Math.min(n + COVER_PAGE_SIZE, allImages?.length ?? n));
        }
      },
      { root, rootMargin: "240px 0px", threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, visibleCount, allImages?.length]);

  return (
    <BottomSheet onClose={onClose} labelledBy="cover-lib-title" className="cover-lib">
        <div className="cover-lib-head">
          <span id="cover-lib-title" className="cover-lib-title">Choose a cover</span>
          <button type="button" className="cover-lib-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {allImages === null ? (
          <p className="cover-lib-status">Loading covers…</p>
        ) : error ? (
          <p className="cover-lib-status">{error}</p>
        ) : allImages.length === 0 ? (
          <p className="cover-lib-status">Empty library — upload one.</p>
        ) : (
          <div ref={gridRef} className="cover-lib-grid">
            {images.map((img, index) => (
              <LazyCoverTile
                key={img.url}
                url={img.url}
                label={img.label}
                index={index}
                root={gridRef}
                onPick={onPick}
              />
            ))}
            {hasMore ? (
              <div ref={moreRef} className="cover-lib-more" aria-hidden>
                Loading more…
              </div>
            ) : null}
          </div>
        )}
    </BottomSheet>
  );
}

/** Only assign img src once the tile is near the scroll container — native
 *  loading="lazy" often still downloads everything inside overflow panels. */
function LazyCoverTile({
  url,
  label,
  index,
  root,
  onPick,
}: {
  url: string;
  label: string;
  index: number;
  root: RefObject<HTMLDivElement | null>;
  onPick: (url: string) => void;
}) {
  const tileRef = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = tileRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSrc(url);
          observer.disconnect();
        }
      },
      { root: root.current, rootMargin: "200px 0px", threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [url, root]);

  return (
    <button
      ref={tileRef}
      type="button"
      className={`cover-lib-tile ${src ? "" : "is-pending"} ${ready ? "is-ready" : ""}`}
      style={{ animationDelay: `${Math.min(index, 11) * 28}ms` }}
      onClick={() => onPick(url)}
      aria-label={label || "Cover image"}
    >
      <span className="cover-lib-tile-frame">
        {src ? (
          <img src={src} alt="" decoding="async" onLoad={() => setReady(true)} />
        ) : (
          <span className="cover-lib-skel" aria-hidden />
        )}
      </span>
    </button>
  );
}
