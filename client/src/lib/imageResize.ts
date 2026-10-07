// Shared client-side image downscaler. Large phone photos can be 4–8 MB raw —
// posting them as data URLs blows up payload size and breaks the server's
// JSON body limit. Resize before they leave the page so any source size works.

const DEFAULT_MAX_PX = 512;
const DEFAULT_QUALITY = 0.82;

export function fileToResizedDataUrl(
  file: File,
  maxPx: number = DEFAULT_MAX_PX,
  quality: number = DEFAULT_QUALITY,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        const longest = Math.max(img.width, img.height);
        const ratio = longest > maxPx ? maxPx / longest : 1;
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not available"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** Re-encode a data URL as JPEG, shrinking until it fits `maxChars` (the profile gallery sends several at once). */
export function shrinkDataUrl(src: string, maxPx: number, maxChars: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Could not decode image"));
    img.onload = () => {
      let px = maxPx;
      let quality = 0.68;
      for (let i = 0; i < 6; i++) {
        const longest = Math.max(img.width, img.height);
        const ratio = longest > px ? px / longest : 1;
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not available"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const url = canvas.toDataURL("image/jpeg", quality);
        if (url.length <= maxChars) {
          resolve(url);
          return;
        }
        if (quality <= 0.42 && px <= 480) {
          reject(new Error("Couldn't use that photo. Try a smaller image."));
          return;
        }
        quality = Math.max(0.42, quality - 0.1);
        px = Math.max(480, Math.round(px * 0.85));
      }
      reject(new Error("Couldn't use that photo. Try a smaller image."));
    };
    img.src = src;
  });
}
