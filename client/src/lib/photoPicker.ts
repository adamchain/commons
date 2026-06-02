import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { isNative } from "./platform";
import { fileToResizedDataUrl } from "./imageResize";

interface PickPhotoOptions {
  maxPx?: number;
  quality?: number;
  preferCamera?: boolean;
}

// Returns a data URL string. On native, prompts the user to pick between
// camera and library. On web, callers still drive their own <input type="file">
// — this helper is only used inside onClick handlers that want to skip the
// hidden-input dance entirely on native.
export async function pickPhotoNative(opts: PickPhotoOptions = {}): Promise<string | null> {
  if (!isNative()) return null;
  const photo = await Camera.getPhoto({
    quality: Math.round((opts.quality ?? 0.82) * 100),
    width: opts.maxPx ?? 512,
    height: opts.maxPx ?? 512,
    resultType: CameraResultType.DataUrl,
    source: opts.preferCamera ? CameraSource.Camera : CameraSource.Prompt,
    allowEditing: false,
  });
  return photo.dataUrl ?? null;
}

// Drop-in upgrade for File-based handlers — on native, opens the native
// picker and returns the resulting data URL; on web, runs the existing
// FileReader+canvas resize on the given File.
export async function resolvePhotoDataUrl(file: File | null, opts: PickPhotoOptions = {}): Promise<string | null> {
  if (isNative()) {
    return pickPhotoNative(opts);
  }
  if (!file) return null;
  return fileToResizedDataUrl(file, opts.maxPx ?? 512, opts.quality ?? 0.82);
}
