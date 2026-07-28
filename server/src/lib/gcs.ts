// Thin wrapper over Google Cloud Storage for admin image uploads.
//
// Config (all via env):
//   GCS_BUCKET / GCS_BUCKET_NAME — bucket name (required to enable GCS uploads)
//   GCS_PROJECT_ID               — optional; otherwise inferred from credentials
//   Credentials (pick one):
//     GCS_CLIENT_EMAIL + GCS_PRIVATE_KEY — Railway-friendly (paste key with \n)
//     GCS_KEY_FILE                       — path to a service-account JSON
//     else Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS /
//       Workload Identity on Cloud Run / GKE)
//   GCS_PUBLIC_BASE_URL   — optional CDN / custom-domain base. Defaults to
//                           https://storage.googleapis.com/<bucket>.
//   GCS_DEFAULTS_PREFIX   — optional folder holding the standard placeholder
//                           library images. Defaults to `defaults/`. "Load
//                           default images" lists this folder and seeds it.
//
// When the bucket env is unset, `isGcsConfigured()` returns false and callers
// fall back to storing the image inline (data URL) — so local dev works with
// no GCS.

import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

let storage: Storage | null = null;

/** Bucket name — accepts either Commons (`GCS_BUCKET`) or SuiteNote-style (`GCS_BUCKET_NAME`). */
export function gcsBucketName(): string | undefined {
  return process.env.GCS_BUCKET?.trim() || process.env.GCS_BUCKET_NAME?.trim() || undefined;
}

export function isGcsConfigured(): boolean {
  return Boolean(gcsBucketName());
}

/** Normalize private keys pasted into env vars (`\\n` → real newlines). */
function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

function client(): Storage {
  if (!storage) {
    const projectId = process.env.GCS_PROJECT_ID?.trim() || undefined;
    const keyFilename = process.env.GCS_KEY_FILE?.trim() || undefined;
    const clientEmail = process.env.GCS_CLIENT_EMAIL?.trim();
    const privateKeyRaw = process.env.GCS_PRIVATE_KEY?.trim();

    if (clientEmail && privateKeyRaw) {
      storage = new Storage({
        projectId,
        credentials: {
          client_email: clientEmail,
          private_key: normalizePrivateKey(privateKeyRaw),
        },
      });
    } else {
      storage = new Storage({
        projectId,
        keyFilename: keyFilename || undefined,
      });
    }
  }
  return storage;
}

function publicUrl(bucket: string, objectPath: string, downloadToken?: string): string {
  // Firebase Storage download-token URLs work on buckets with uniform access
  // (plain storage.googleapis.com URLs 403 without public IAM).
  if (downloadToken) {
    const encoded = encodeURIComponent(objectPath);
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media&token=${downloadToken}`;
  }
  const base = process.env.GCS_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (base) return `${base}/${objectPath}`;
  return `https://storage.googleapis.com/${bucket}/${objectPath}`;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** Parse a `data:image/...;base64,...` URL into bytes + content type. */
export function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1].toLowerCase();
  if (!EXT_BY_MIME[contentType]) return null;
  return { buffer: Buffer.from(m[2], "base64"), contentType };
}

/**
 * Upload image bytes to the configured bucket under `card-images/` and return a
 * stable public URL. Throws if GCS isn't configured — callers should guard with
 * `isGcsConfigured()` first.
 */
export async function uploadCardImage(buffer: Buffer, contentType: string): Promise<string> {
  const bucketName = gcsBucketName();
  if (!bucketName) throw new Error("GCS_BUCKET is not configured");

  const ext = EXT_BY_MIME[contentType] ?? "jpg";
  const objectPath = `card-images/${randomUUID()}.${ext}`;
  const file = client().bucket(bucketName).file(objectPath);
  const downloadToken = randomUUID();

  await file.save(buffer, {
    contentType,
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });

  // Best-effort public ACL. No-op (and ignored) on uniform bucket-level access
  // buckets, where public reads are granted by IAM at the bucket level instead.
  try {
    await file.makePublic();
  } catch {
    /* uniform bucket-level access — Firebase download token URL still works */
  }

  return publicUrl(bucketName, objectPath, downloadToken);
}

/** Turn `defaults/summer-bbq.jpg` into a friendly label like "Summer Bbq". */
function labelFromObjectName(objectName: string): string {
  const base = objectName.split("/").pop() ?? objectName;
  const stem = base.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  if (!stem) return "";
  return stem.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** `defaults/Night-Out/foo.jpg` → "Night Out". */
function categoryFromObjectName(objectName: string, prefix: string): string {
  const rest = objectName.startsWith(prefix) ? objectName.slice(prefix.length) : objectName;
  const folder = rest.split("/")[0] ?? "";
  if (!folder || folder === rest) return "Other";
  return folder.replace(/[-_]+/g, " ").trim();
}

export type CoverCatalogItem = { url: string; label: string; category: string };
export type CoverCatalogCategory = { id: string; label: string; images: CoverCatalogItem[] };

/**
 * List the standard placeholder images stored under `GCS_DEFAULTS_PREFIX`
 * (default `defaults/`) in the bucket, as `{ url, label }` pairs sorted by name.
 * Returns `[]` if GCS isn't configured or the folder is empty. Throws on a real
 * storage/permission error so callers can surface it.
 */
export async function listDefaultImages(): Promise<{ url: string; label: string }[]> {
  const catalog = await listDefaultCatalog();
  return catalog.flatMap((c) => c.images.map(({ url, label }) => ({ url, label })));
}

/**
 * Categorized cover catalog for the create-plan picker — one group per folder
 * under `defaults/` (Coffee, Food, Events, …).
 */
export async function listDefaultCatalog(): Promise<CoverCatalogCategory[]> {
  const bucketName = gcsBucketName();
  if (!bucketName) return [];

  const rawPrefix = process.env.GCS_DEFAULTS_PREFIX?.trim() || "defaults/";
  const prefix = rawPrefix.endsWith("/") ? rawPrefix : `${rawPrefix}/`;

  const [files] = await client().bucket(bucketName).getFiles({ prefix });
  const byCat = new Map<string, CoverCatalogItem[]>();

  for (const file of files) {
    const name = file.name;
    if (name === prefix || !/\.(png|jpe?g|gif|webp|avif)$/i.test(name)) continue;
    const custom = (file.metadata?.metadata ?? {}) as Record<string, string | undefined>;
    let token = custom.firebaseStorageDownloadTokens?.split(",")[0]?.trim();
    if (!token) {
      // Backfill a download token so the URL is readable on Firebase buckets.
      token = randomUUID();
      try {
        await file.setMetadata({
          metadata: { ...custom, firebaseStorageDownloadTokens: token },
        });
      } catch {
        token = undefined;
      }
    }
    const category = categoryFromObjectName(name, prefix);
    const item: CoverCatalogItem = {
      url: publicUrl(bucketName, name, token),
      label: labelFromObjectName(name),
      category,
    };
    const list = byCat.get(category) ?? [];
    list.push(item);
    byCat.set(category, list);
  }

  return [...byCat.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, images]) => ({
      id: label.toLowerCase().replace(/\s+/g, "-"),
      label,
      images: images.sort((a, b) => a.label.localeCompare(b.label)),
    }));
}
