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
