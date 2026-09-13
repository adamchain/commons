import { store } from "../store.js";
import {
  isGcsConfigured,
  listDefaultCatalog,
  type CoverCatalogCategory,
  type CoverCatalogItem,
} from "./gcs.js";

const CATALOG_TTL_MS = 5 * 60 * 1000;

let gcsCache: { at: number; categories: CoverCatalogCategory[] } | null = null;
let poolCache: string[] | null = null;

export function invalidateCoverCatalogCache(): void {
  gcsCache = null;
  poolCache = null;
}

export function slugCategory(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
}

function rememberPool(categories: CoverCatalogCategory[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const c of categories) {
    for (const img of c.images) {
      if (seen.has(img.url)) continue;
      seen.add(img.url);
      urls.push(img.url);
    }
  }
  poolCache = urls;
  return urls;
}

async function gcsCategories(): Promise<CoverCatalogCategory[]> {
  if (!isGcsConfigured()) return [];
  if (gcsCache && Date.now() - gcsCache.at < CATALOG_TTL_MS) return gcsCache.categories;
  const categories = await listDefaultCatalog();
  gcsCache = { at: Date.now(), categories };
  return categories;
}

export async function buildCoverCatalog(): Promise<CoverCatalogCategory[]> {
  const items: CoverCatalogItem[] = [];
  const seen = new Set<string>();
  const library = store.listCardImages();
  const byUrl = new Map(library.map((row) => [row.url, row]));

  try {
    for (const cat of await gcsCategories()) {
      for (const img of cat.images) {
        if (seen.has(img.url)) continue;
        const row = byUrl.get(img.url);
        items.push({
          url: img.url,
          label: row?.label ?? img.label,
          category: row?.category?.trim() || img.category,
          libraryId: row?.id ?? null,
        });
        seen.add(img.url);
      }
    }
  } catch (err) {
    console.error("[cover-catalog] GCS list failed", err);
  }

  for (const row of library) {
    if (seen.has(row.url)) continue;
    items.push({
      url: row.url,
      label: row.label ?? "Cover",
      category: row.category?.trim() || "Library",
      libraryId: row.id,
    });
    seen.add(row.url);
  }

  const byCat = new Map<string, CoverCatalogItem[]>();
  for (const img of items) {
    const key = img.category || "Other";
    const list = byCat.get(key) ?? [];
    list.push(img);
    byCat.set(key, list);
  }

  const categories = [...byCat.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, images]) => ({
      id: slugCategory(label),
      label,
      images: images.sort((a, b) => a.label.localeCompare(b.label)),
    }));

  rememberPool(categories);
  return categories;
}

/** Sync pool for OG/share cards — store library plus last warmed GCS catalog. */
export function coverPoolSync(): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const u of [...(poolCache ?? []), ...store.listCardImages().map((c) => c.url)]) {
    if (seen.has(u)) continue;
    seen.add(u);
    urls.push(u);
  }
  return urls;
}

export function warmCoverCatalog(): void {
  void buildCoverCatalog().catch((err) => {
    console.error("[cover-catalog] warm failed", err);
  });
}
