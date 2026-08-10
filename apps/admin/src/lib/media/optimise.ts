/**
 * Shrink an image in the browser, before it is uploaded.
 *
 * ## Why here and not on the server
 *
 * The Worker cannot do it. Resizing needs an image codec, and the two ways to
 * get one into a Worker are Cloudflare Images (a paid product on a zone this
 * project does not have) or a WASM codec compiled into the bundle (megabytes,
 * and more CPU per request than the free tier allows). The browser already
 * ships both a decoder and a WebP encoder, and the admin is a browser.
 *
 * ## Why it matters, measured
 *
 * From the site's own Lighthouse run: the hero portrait was a **344 KB PNG at
 * 768×768** displayed at 465 px, and two social icons were **1280×1280 and
 * 800×800 PNGs displayed at 18 px** — 246 KB spent on two marks the size of a
 * full stop. Roughly 700 KB of the mobile page was image bytes nothing could
 * use, and mobile LCP was 4.5 s against a 2.5 s target.
 *
 * The cause is not carelessness. It is that "upload a logo" gives no hint that
 * the file will be drawn at 18 px, and no editor should have to know. So the
 * tool does the arithmetic instead of the person.
 *
 * ## What it does, and what it refuses to do
 *
 * Downscale to fit `MAX_EDGE` and re-encode as WebP. Never upscale — enlarging
 * a small image adds bytes and removes nothing. Never touch PDFs or SVGs, and
 * never touch an image that is already smaller than the threshold: a 3 KB icon
 * re-encoded is a 3 KB icon with one more generation of loss.
 *
 * **It keeps the smaller of the two.** Re-encoding can lose — a flat-colour
 * logo is often smaller as a PNG than as WebP — so the result is compared with
 * the original and the original wins ties. A function that always returned its
 * own output would sometimes make the problem worse while reporting success.
 *
 * Failure returns the original file. An image the browser cannot decode is
 * still an image the server might accept, and refusing to upload it because
 * an optimisation failed would be the optimisation breaking the feature.
 */

/** The longest edge kept. Twice the widest slot the site actually renders. */
const MAX_EDGE = 1600;

/** Below this, the file is already small enough that re-encoding only loses. */
const SKIP_BELOW_BYTES = 24 * 1024;

/** WebP quality. High enough that a portrait holds up at 2× on a phone. */
const QUALITY = 0.85;

export interface OptimiseResult {
  readonly file: File;
  /** True when the returned file is not the one that came in. */
  readonly changed: boolean;
  readonly originalBytes: number;
  readonly bytes: number;
}

function unchanged(file: File): OptimiseResult {
  return {
    file,
    changed: false,
    originalBytes: file.size,
    bytes: file.size,
  };
}

export async function optimiseImage(file: File): Promise<OptimiseResult> {
  // PDFs and SVGs are not raster images; a canvas would rasterise the SVG and
  // throw away the one property that makes it worth having.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return unchanged(file);
  }
  if (file.size < SKIP_BELOW_BYTES) return unchanged(file);

  try {
    // `createImageBitmap` decodes off the main thread, so a 12-megapixel photo
    // does not freeze the form while it is read.
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return unchanged(file);
    }
    // Best available resampling: the default is a box filter, which turns a
    // downscaled logo into aliased mush.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", QUALITY);
    });

    // A browser without WebP encoding silently hands back a PNG, which for a
    // photograph is usually larger than what came in. The size comparison
    // below catches that too.
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) {
      return unchanged(file);
    }

    const name = file.name.replace(/\.[^.]+$/, "") || "image";
    return {
      file: new File([blob], `${name}.webp`, {
        type: "image/webp",
        lastModified: file.lastModified,
      }),
      changed: true,
      originalBytes: file.size,
      bytes: blob.size,
    };
  } catch {
    return unchanged(file);
  }
}

/** `344128` → `336 KB`. For telling the editor what just happened. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
