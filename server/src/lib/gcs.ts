// Thin wrapper over Google Cloud Storage for admin image uploads.
//
// Config (all via env):
//   GCS_BUCKET            — bucket name (required to enable GCS uploads)
//   GCS_PROJECT_ID        — optional; otherwise inferred from credentials
//   GCS_KEY_FILE          — optional path to a service-account JSON. If unset,
//                           the client uses Application Default Credentials
//                           (GOOGLE_APPLICATION_CREDENTIALS, or Workload
//                           Identity on Cloud Run / GKE).
//   GCS_PUBLIC_BASE_URL   — optional CDN / custom-domain base. Defaults to
//                           https://storage.googleapis.com/<bucket>.
//   GCS_DEFAULTS_PREFIX   — optional folder holding the standard placeholder
//                           library images. Defaults to `defaults/`. "Load
//                           default images" lists this folder and seeds it.
//
// When GCS_BUCKET is unset, `isGcsConfigured()` returns false and callers fall
// back to storing the image inline (data URL) — so local dev works with no GCS.

import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

let storage: Storage | null = null;

export function isGcsConfigured(): boolean {
  return Boolean(process.env.GCS_BUCKET?.trim());
}

function client(): Storage {
  if (!storage) {
    storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID?.trim() || undefined,
      keyFilename: process.env.GCS_KEY_FILE?.trim() || undefined,
    });
  }
  return storage;
}

function publicUrl(bucket: string, objectPath: string): string {
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
  const bucketName = process.env.GCS_BUCKET?.trim();
  if (!bucketName) throw new Error("GCS_BUCKET is not configured");

  const ext = EXT_BY_MIME[contentType] ?? "jpg";
  const objectPath = `card-images/${randomUUID()}.${ext}`;
  const file = client().bucket(bucketName).file(objectPath);

  await file.save(buffer, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
  });

  // Best-effort public ACL. No-op (and ignored) on uniform bucket-level access
  // buckets, where public reads are granted by IAM at the bucket level instead.
  try {
    await file.makePublic();
  } catch {
    /* uniform bucket-level access — bucket IAM controls visibility */
  }

  return publicUrl(bucketName, objectPath);
}

/** Turn `defaults/summer-bbq.jpg` into a friendly label like "Summer Bbq". */
function labelFromObjectName(objectName: string): string {
  const base = objectName.split("/").pop() ?? objectName;
  const stem = base.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  if (!stem) return "";
  return stem.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * List the standard placeholder images stored under `GCS_DEFAULTS_PREFIX`
 * (default `defaults/`) in the bucket, as `{ url, label }` pairs sorted by name.
 * Returns `[]` if GCS isn't configured or the folder is empty. Throws on a real
 * storage/permission error so callers can surface it.
 */
export async function listDefaultImages(): Promise<{ url: string; label: string }[]> {
  const bucketName = process.env.GCS_BUCKET?.trim();
  if (!bucketName) return [];

  const rawPrefix = process.env.GCS_DEFAULTS_PREFIX?.trim() || "defaults/";
  const prefix = rawPrefix.endsWith("/") ? rawPrefix : `${rawPrefix}/`;

  const [files] = await client().bucket(bucketName).getFiles({ prefix });
  return files
    .map((f) => f.name)
    // Keep only real image objects — skips the folder placeholder & stray files.
    .filter((name) => name !== prefix && /\.(png|jpe?g|gif|webp|avif)$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ url: publicUrl(bucketName, name), label: labelFromObjectName(name) }));
}
