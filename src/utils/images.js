// Listing photo helpers. Uploads are resized to WebP in the browser, then
// stored in the public `listing-images` bucket under the seller's own folder.
export const IMAGE_BUCKET = "listing-images";
export const MAX_IMAGE_WIDTH = 1200;
export const WEBP_QUALITY = 0.82;
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // before compression
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // matches the bucket limit
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateSourceImage(file) {
  if (!file) return "Choose a photo.";
  if (!ACCEPTED_TYPES.includes(file.type))
    return "Choose a JPG, PNG or WebP photo.";
  if (file.size > MAX_SOURCE_BYTES)
    return "That photo is over 15 MB. Choose a smaller one.";
  return "";
}

/** Scale (w, h) down so the long edge used for width is at most `max`. */
export function fitWithin(width, height, max = MAX_IMAGE_WIDTH) {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0 };
  // Portrait photos are limited by their longer side too, so cards stay light.
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function listingImagePath(userId, id, ext = "webp") {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId)))
    throw new Error("Sign in again before uploading a photo.");
  const safe = String(id)
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 80);
  if (!safe) throw new Error("Could not name the photo file.");
  return `${userId.toLowerCase()}/${safe}.${ext}`;
}

/** Same rule as the database check: our bucket, the seller's own folder. */
export function isListingImageUrl(url, sellerId) {
  if (typeof url !== "string" || url.length > 600) return false;
  const match = url.match(
    /^(https:\/\/[a-z0-9-]+\.supabase\.co|http:\/\/(127\.0\.0\.1|localhost):54321)\/storage\/v1\/object\/public\/listing-images\/([0-9a-f-]{36})\/[A-Za-z0-9._-]{1,120}$/,
  );
  return !!match && (!sellerId || match[3] === sellerId);
}

/** Browser only: resize and re-encode to WebP (JPEG where WebP is unsupported). */
export async function compressImage(file, { max = MAX_IMAGE_WIDTH } = {}) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const encode = (type, quality) =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await encode("image/webp", WEBP_QUALITY);
  let type = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await encode("image/jpeg", 0.85);
    type = "image/jpeg";
  }
  for (
    let q = WEBP_QUALITY - 0.12;
    blob && blob.size > MAX_UPLOAD_BYTES && q > 0.4;
    q -= 0.12
  )
    blob = await encode(type, q);
  if (!blob || blob.size > MAX_UPLOAD_BYTES)
    throw new Error("That photo could not be made small enough. Try another.");
  return {
    blob,
    type,
    width,
    height,
    ext: type === "image/webp" ? "webp" : "jpg",
  };
}

export const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("That photo could not be read."));
    reader.readAsDataURL(blob);
  });
