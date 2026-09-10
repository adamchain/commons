import { fileToResizedDataUrl } from "./imageResize";
import { pickPhotoNative } from "./photoPicker";
import { isNative } from "./platform";

export const FORUM_IMAGE_MAX_PX = 1024;
export const FORUM_IMAGE_QUALITY = 0.85;

/** Native camera/library, or a resized data URL from a web file picker. */
export async function resolveForumImage(file?: File | null): Promise<string | null> {
  if (isNative()) {
    return pickPhotoNative({ maxPx: FORUM_IMAGE_MAX_PX, quality: FORUM_IMAGE_QUALITY });
  }
  if (!file) return null;
  return fileToResizedDataUrl(file, FORUM_IMAGE_MAX_PX, FORUM_IMAGE_QUALITY);
}
