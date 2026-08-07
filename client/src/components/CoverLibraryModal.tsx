import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { api } from "../api/http";

type CoverCatalogCategory = {
  id: string;
  label: string;
  images: { url: string; label: string; category: string }[];
};

const COVER_PAGE_SIZE = 12;

export function CoverLibraryModal({
  onPick,
  onClose,
}: {
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [categories, setCategories] = useState<CoverCatalogCategory[] | null>(null);
  const [active, setActive] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(COVER_PAGE_SIZE);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await api<{ categories: CoverCatalogCategory[] }>("/api/card-images/catalog");
        if (!alive) return;
        setCategories(r.categories);
        // Start on the first category — "All" would fire ~100 full-res downloads.
        setActive(r.categories[0]?.id ?? "all");
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Couldn't load covers");
        setCategories([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Reset the progressive window whenever the category changes.
  useEffect(() => {
    setVisibleCount(COVER_PAGE_SIZE);
    gridRef.current?.scrollTo({ top: 0 });
  }, [active]);

  const chips = categories ?? [];
  const allImages =
    !categories
      ? []
      : active === "all"
        ? categories.flatMap((c) => c.images)
        : (categories.find((c) => c.id === active)?.images ?? []);
  const images = allImages.slice(0, visibleCount);
  const hasMore = visibleCount < allImages.length;

  function loadMore() {
    if (!hasMore) return;
    setVisibleCount((n) => Math.min(n + COVER_PAGE_SIZE, allImages.length));
  }

  return (
    <div
      className="cover-lib-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a cover image"
      onClick={onClose}
    >
      <div className="cover-lib" onClick={(e) => e.stopPropagation()}>
        <div className="cover-lib-head">
          <span className="cover-lib-title">Choose a cover</span>
          <button type="button" className="cover-lib-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {chips.length > 1 && (
          <div className="cover-lib-cats" role="tablist" aria-label="Cover categories">
            <button
              type="button"
              role="tab"
              aria-selected={active === "all"}
              className={`cover-lib-cat ${active === "all" ? "is-active" : ""}`}
              onClick={() => setActive("all")}
            >
              All
            </button>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active === c.id}
                className={`cover-lib-cat ${active === c.id ? "is-active" : ""}`}
                onClick={() => setActive(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {categories === null ? (
          <p className="cover-lib-status">Loading covers…</p>
        ) : error ? (
          <p className="cover-lib-status">{error}</p>
        ) : allImages.length === 0 ? (
          <p className="cover-lib-status">No covers yet — upload one from your camera roll.</p>
        ) : (
          <div
            ref={gridRef}
            className="cover-lib-grid"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) loadMore();
            }}
          >
            {images.map((img) => (
              <LazyCoverTile
                key={img.url}
                url={img.url}
                label={img.label}
                root={gridRef}
                onPick={onPick}
              />
            ))}
            {hasMore && (
              <button type="button" className="cover-lib-more" onClick={loadMore}>
                Show more ({allImages.length - visibleCount} left)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Only assign img src once the tile is near the scroll container — native
 *  loading="lazy" often still downloads everything inside overflow panels. */
function LazyCoverTile({
  url,
  label,
  root,
  onPick,
}: {
  url: string;
  label: string;
  root: RefObject<HTMLDivElement | null>;
  onPick: (url: string) => void;
}) {
  const tileRef = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState<string | null>(null);

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
      className={`cover-lib-tile ${src ? "" : "is-pending"}`}
      onClick={() => onPick(url)}
      aria-label={label || "Cover image"}
    >
      <span className="cover-lib-tile-frame">
        {src ? <img src={src} alt="" decoding="async" /> : <span className="cover-lib-skel" aria-hidden />}
      </span>
    </button>
  );
}
