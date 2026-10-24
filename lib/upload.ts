import { useEffect, useState } from 'react';
import { decode } from 'base64-arraybuffer';
import { Platform, Image as RNImage } from 'react-native';
// SDK 54 moved readAsStringAsync/EncodingType to the legacy entry point; the
// new expo-file-system API no longer exports them from the package root.
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { checkImageIntegrity } from '@/lib/imageIntegrity';
import { mapWithConcurrency } from '@/lib/concurrency';

// How many listing photos are processed at once. See the note in
// uploadListingImages for why this is capped rather than unbounded.
const MAX_CONCURRENT_PHOTO_UPLOADS = 3;

export type LocalImage = { uri: string; base64?: string | null };

// Resize ceiling for avatars — small, since they only ever render in a circle.
const AVATAR_MAX_EDGE = 512;
const AVATAR_QUALITY = 0.85;

// Profile banners render full-bleed across the widest viewport we support, so
// they need far more pixels than an avatar. 1280 covers a tablet/web layout at
// 2x without paying for a full-size camera file, and 0.78 keeps gradients in
// sky/skin tones from banding at that width.
const BANNER_MAX_EDGE = 1280;
const BANNER_QUALITY = 0.78;

// Resize/compress ceiling for listing photos. Phone cameras hand us 3-12 MB
// 3000px+ JPEGs; storing those raw is why the grid was slow to paint. 1440px
// on the long edge at q0.7 is plenty for cards + the fullscreen viewer and
// typically cuts a photo to ~200-400 KB. This runs at upload time so it helps
// regardless of whether the Supabase image-transform CDN is enabled.
const LISTING_MAX_EDGE = 1440;
const LISTING_QUALITY = 0.7;

// Card-sized copy stored alongside each listing photo (listings.thumbnails).
//
// The 1440px upload above is right for the product page's fullscreen viewer and
// far too big for a grid tile: a card renders at ~194px wide on a phone, and
// lib/images.thumbWidthFor asks for 1.5x that (291px). The widest realistic
// tile is a 4-column tablet grid at ~288px, wanting 432px.
//
// 640 on the LONG edge covers both: a portrait 3:4 photo becomes 480x640, so
// the width (480) clears the 432px worst case, while a phone gets ~1.6x the
// pixels it displays. At q0.72 that lands around 40-70 KB versus ~260 KB for
// the 1440px version — the ~5x saving this column exists for.
//
// Quality is a touch higher than the full-size 0.7 on purpose: JPEG artefacts
// are proportionally more visible at small dimensions, and 0.02 costs very
// little on an image this size.
const THUMB_MAX_EDGE = 640;
const THUMB_QUALITY = 0.72;

/** One uploaded photo: the full-size URL plus its card-sized copy. */
export type UploadedImage = {
  url: string;
  /** Card-sized copy. Falls back to `url` when thumbnail generation failed. */
  thumbUrl: string;
};

// Read the intrinsic pixel size of an image so we only ever scale down.
function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

// Native (iOS/Android) resize + re-encode via expo-image-manipulator. Always
// re-encodes to JPEG at `quality`; only resizes when the image exceeds maxEdge
// so we never upscale. Falls back to the original on any failure so an upload
// is never blocked by compression.
async function compressNative(
  image: LocalImage,
  maxEdge: number,
  quality: number,
): Promise<LocalImage> {
  try {
    let context = ImageManipulator.manipulate(image.uri);
    const size = await getImageSize(image.uri).catch(() => null);
    if (size) {
      const longest = Math.max(size.width, size.height);
      if (longest > maxEdge) {
        const scale = maxEdge / longest;
        context =
          size.width >= size.height
            ? context.resize({ width: Math.round(size.width * scale) })
            : context.resize({ height: Math.round(size.height * scale) });
      }
    }
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return { uri: result.uri, base64: result.base64 ?? null };
  } catch (e) {
    console.warn('[upload] native image compression failed; using original', e);
    return image;
  }
}

// Browser-only resize + re-encode via a canvas. Returns a fresh base64 + data
// URI; re-encodes to JPEG even when no resize is needed so large-but-small-
// dimension photos still shrink. Falls back to the input on any failure (CORS,
// tainted canvas, etc.) so the upload still succeeds.
// Decode a picked image in the browser. Prefers the base64 payload the picker
// hands back over its `blob:` URI, so the bitmap survives the object URL being
// revoked.
function decodeInBrowser(image: LocalImage): Promise<HTMLImageElement> {
  const ct = image.uri ? inferContentType(image.uri) : 'image/jpeg';
  const src = image.base64 ? `data:${ct};base64,${image.base64}` : image.uri;
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

async function compressOnWeb(
  image: LocalImage,
  maxEdge: number,
  quality: number,
): Promise<LocalImage> {
  if (Platform.OS !== 'web') return image;
  if (typeof window === 'undefined' || typeof document === 'undefined') return image;
  try {
    const bitmap = await decodeInBrowser(image);
    const longest = Math.max(bitmap.naturalWidth, bitmap.naturalHeight);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const w = Math.round(bitmap.naturalWidth * scale);
    const h = Math.round(bitmap.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return image;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const comma = dataUrl.indexOf(',');
    return { uri: dataUrl, base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl };
  } catch {
    return image;
  }
}

// One entry point per platform for compressing a picked image.
function compressImage(
  image: LocalImage,
  maxEdge: number,
  quality: number,
): Promise<LocalImage> {
  return Platform.OS === 'web'
    ? compressOnWeb(image, maxEdge, quality)
    : compressNative(image, maxEdge, quality);
}

async function readBase64FromUri(uri: string): Promise<string> {
  if (Platform.OS !== 'web') {
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  }
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function imageToArrayBuffer(image: LocalImage): Promise<ArrayBuffer> {
  const b64 = image.base64 ?? (await readBase64FromUri(image.uri));
  return decode(b64);
}

function inferContentType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

function inferExt(uri: string): string {
  const ct = inferContentType(uri);
  if (ct === 'image/png') return 'png';
  if (ct === 'image/webp') return 'webp';
  if (ct === 'image/heic') return 'heic';
  return 'jpg';
}

function randomId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Storage path for a thumbnail, derived from its full-size sibling's path.
// Kept as one function so the upload side and the delete side cannot disagree
// about the naming.
export function thumbPathFor(fullPath: string): string {
  const dot = fullPath.lastIndexOf('.');
  return dot < 0 ? `${fullPath}_thumb` : `${fullPath.slice(0, dot)}_thumb${fullPath.slice(dot)}`;
}

// Browser/CDN cache lifetime for uploaded media, in seconds (1 year) plus
// `immutable`, which tells the browser not to even revalidate.
//
// Supabase defaults this to 3600, so without it every viewer re-downloads every
// photo once an hour — and images are the overwhelming majority of this
// project's egress. Exhausting the free plan's 5 GB cached-egress quota is what
// took the whole API offline with a 402 on 2026-08-05, so this is a cost
// control, not a micro-optimization.
//
// Safe at this duration because every path here is a fresh `randomId()` and
// uploads are `upsert: false` — a given URL's bytes can never change. Replacing
// an avatar or a listing photo writes a NEW random path and the old object is
// orphaned, so there is nothing for a stale cache entry to be wrong about.
const MEDIA_CACHE_CONTROL = '31536000, immutable';

async function uploadToPath(bucket: string, image: LocalImage, path: string): Promise<string> {
  const ab = await imageToArrayBuffer(image);
  const contentType = inferContentType(image.uri);

  // Refuse incomplete bytes BEFORE anything is written.
  //
  // compressImage() falls back to the ORIGINAL image on any failure, which is
  // right for a tainted canvas or a CORS refusal but also lets genuinely broken
  // bytes through: a truncated file fails to decode, hits the same catch, and
  // would be uploaded raw — after which a listing row is created pointing at an
  // image that can never render. That is how the "Testtt" listing came to hold
  // a JPEG with no FFD9 end marker.
  //
  // This is the one chokepoint every upload passes through (listings, avatars,
  // banners, wardrobe), so one guard here covers all of them. Throwing aborts
  // uploadListingImages before it returns, so SellSheet never reaches its
  // insert.
  const integrity = checkImageIntegrity(new Uint8Array(ab), contentType);
  if (!integrity.ok) {
    throw new Error(`That photo looks incomplete — ${integrity.reason}. Please pick it again.`);
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, ab, {
      contentType,
      cacheControl: MEDIA_CACHE_CONTROL,
      upsert: false,
    });
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadOne(
  bucket: string,
  image: LocalImage,
  pathPrefix: string,
  index: number,
): Promise<string> {
  const ext = inferExt(image.uri);
  const safePrefix = pathPrefix.replace(/\.\./g, '').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  const path = `${safePrefix ? safePrefix + '/' : ''}${randomId()}.${ext}`;
  return uploadToPath(bucket, image, path);
}

export async function uploadListingImages(
  images: LocalImage[],
  sellerId: string,
): Promise<UploadedImage[]> {
  const folder = `${sellerId}/${Date.now()}`;
  const safeFolder = folder.replace(/\.\./g, '').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  // Paths written so far, so a failure partway through a multi-photo listing
  // doesn't strand the ones that already landed. SellSheet's own cleanup can't
  // cover this: it only sees the returned urls, which never exist if we throw.
  // Pushes from concurrent photos are safe — JS runs one at a time.
  const written: string[] = [];

  let out: UploadedImage[];
  try {
    // Photos were uploaded strictly one after another: a 4-photo listing meant
    // 8 sequential round trips, each waiting on the last. The work is
    // network-bound, so overlapping it is close to a linear win.
    //
    // ponytail: fixed cap of 3. Each in-flight photo holds a decoded bitmap,
    // and a 12 MP original is tens of MB, so unbounded parallelism would OOM a
    // low-end phone on a 10-photo listing. If this ever needs tuning, make it
    // adaptive on Platform/deviceYearClass rather than simply raising it.
    out = await mapWithConcurrency(images, MAX_CONCURRENT_PHOTO_UPLOADS, async (image) => {
      const full = await compressImage(image, LISTING_MAX_EDGE, LISTING_QUALITY);
      const ext = inferExt(full.uri);
      const fullPath = `${safeFolder}/${randomId()}.${ext}`;
      const url = await uploadToPath('listing-images', full, fullPath);
      written.push(fullPath);

      // The thumbnail is derived from the already-compressed 1440px copy rather
      // than from the original: downscaling 1440 → 640 is visually identical to
      // going straight from a 12 MP camera file, and it avoids decoding the
      // original a second time on a phone that just spent memory on it.
      //
      // A thumbnail is an optimization, never a reason to fail a listing. If
      // either the resize or its upload fails we fall back to the full-size URL,
      // which is exactly what rows created before this existed already do.
      let thumbUrl = url;
      try {
        const thumbPath = thumbPathFor(fullPath);
        const thumb = await compressImage(full, THUMB_MAX_EDGE, THUMB_QUALITY);
        thumbUrl = await uploadToPath('listing-images', thumb, thumbPath);
        written.push(thumbPath);
      } catch (e) {
        console.warn('[upload] thumbnail failed; card will use the full-size image', e);
      }

      return { url, thumbUrl };
    });
  } catch (e) {
    // Roll back whatever already reached storage, then re-throw so the caller
    // still fails and never inserts a listing row. Cleanup is best-effort: the
    // original error is the one worth surfacing.
    if (written.length) {
      try {
        await supabase.storage.from('listing-images').remove(written);
      } catch (cleanupErr) {
        console.warn('[upload] partial-upload cleanup failed', cleanupErr);
      }
    }
    throw e;
  }

  return out;
}

/** A crop region in SOURCE pixel coordinates. */
export type CropRect = { originX: number; originY: number; width: number; height: number };

// Native crop via expo-image-manipulator. Rect is in source pixels; the caller
// has already clamped it to the image, but round defensively because a
// sub-pixel origin makes the native module throw rather than nudge.
async function cropNative(image: LocalImage, rect: CropRect): Promise<LocalImage> {
  try {
    const context = ImageManipulator.manipulate(image.uri).crop({
      originX: Math.max(0, Math.round(rect.originX)),
      originY: Math.max(0, Math.round(rect.originY)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    });
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      compress: BANNER_QUALITY,
      format: SaveFormat.JPEG,
      base64: true,
    });
    return { uri: result.uri, base64: result.base64 ?? null };
  } catch (e) {
    console.warn('[upload] native crop failed; using the uncropped image', e);
    return image;
  }
}

async function cropOnWeb(image: LocalImage, rect: CropRect): Promise<LocalImage> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return image;
  try {
    const bitmap = await decodeInBrowser(image);
    // Clamp into the source so a rounding error at the edges can't ask the
    // canvas for pixels that don't exist (which would letterbox with black).
    const sw = Math.max(1, Math.min(Math.round(rect.width), bitmap.naturalWidth));
    const sh = Math.max(1, Math.min(Math.round(rect.height), bitmap.naturalHeight));
    const sx = Math.max(0, Math.min(Math.round(rect.originX), bitmap.naturalWidth - sw));
    const sy = Math.max(0, Math.min(Math.round(rect.originY), bitmap.naturalHeight - sh));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return image;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = canvas.toDataURL('image/jpeg', BANNER_QUALITY);
    const comma = dataUrl.indexOf(',');
    return { uri: dataUrl, base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl };
  } catch {
    return image;
  }
}

/**
 * Crop a picked image to `rect` (source pixels), on any platform.
 *
 * Every platform routes through the app's own <BannerCropper> rather than the
 * OS picker's crop UI, because neither alternative is usable here: the web build
 * of expo-image-picker ignores `allowsEditing`/`aspect` entirely, and on iOS
 * `aspect` is Android-only — `allowsEditing` there yields a SQUARE crop, which
 * is the wrong shape for a 16:9 banner.
 *
 * Returns the input unchanged on any failure — a crop is never a reason to lose
 * the user's photo.
 */
export function cropImage(image: LocalImage, rect: CropRect): Promise<LocalImage> {
  return Platform.OS === 'web' ? cropOnWeb(image, rect) : cropNative(image, rect);
}

export async function uploadAvatar(image: LocalImage, userId: string): Promise<string> {
  const compressed = await compressImage(image, AVATAR_MAX_EDGE, AVATAR_QUALITY);
  return uploadOne('avatars', compressed, userId, 0);
}

// Banners share the `avatars` bucket on purpose. That bucket's write policy is
// keyed on the first path segment being the caller's own user id, so writing
// here needs no new bucket and no new storage policy — see the banner_url
// migration for the full reasoning.
// ID / CNIC photos live in a PRIVATE bucket: only the owner and admins can
// read them, and only through short-lived signed URLs. Returns the storage
// path (what verifications.notes stores), never a URL.
export const VERIFICATION_BUCKET = 'verification-docs';

export async function uploadVerificationDocument(image: LocalImage, userId: string): Promise<string> {
  const compressed = await compressImage(image, BANNER_MAX_EDGE, BANNER_QUALITY);
  const path = `${userId}/${randomId()}.${inferExt(compressed.uri)}`;
  await uploadToPath(VERIFICATION_BUCKET, compressed, path);
  return path;
}

// Displayable URI for a verification photo: a just-picked local image or a
// legacy URL passes through; a stored path becomes a 1-hour signed URL.
const DIRECT_URI = /^(https?:|file:|content:|data:|blob:|ph:)/;

export function useVerificationPhotoUrl(value?: string | null): string | null {
  const direct = !value || DIRECT_URI.test(value);
  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    setSigned(null);
    if (direct || !value) return;
    let live = true;
    supabase.storage
      .from(VERIFICATION_BUCKET)
      .createSignedUrl(value, 3600)
      .then(({ data }) => {
        if (live) setSigned(data?.signedUrl ?? null);
      });
    return () => {
      live = false;
    };
  }, [value, direct]);
  return direct ? (value ?? null) : signed;
}

export async function uploadBanner(image: LocalImage, userId: string): Promise<string> {
  const compressed = await compressImage(image, BANNER_MAX_EDGE, BANNER_QUALITY);
  return uploadOne('avatars', compressed, userId, 0);
}

export async function deleteListingImages(urls: string[]): Promise<void> {
  const paths = urls.map((url) => {
    const parts = url.split('/listing-images/');
    return parts.length > 1 ? parts[1] : null;
  }).filter(Boolean) as string[];

  if (paths.length === 0) return;

  const { error } = await supabase.storage.from('listing-images').remove(paths);
  if (error) {
    // Log but don't throw — this runs on the publish failure path as a
    // best-effort cleanup. Letting it throw would mask the original DB error
    // shown to the user with a less actionable storage error.
    console.warn('[upload] deleteListingImages failed:', error.message, 'paths:', paths);
  }

  // Thumbnails go in a SEPARATE call whose failure is swallowed, deliberately.
  //
  // Most of these paths won't exist — every listing created before
  // listings.thumbnails did has no `_thumb` sibling — and rather than depend on
  // how storage.remove() reports partially-missing prefixes, this keeps the
  // uncertainty off the path that actually matters. The full-size delete above
  // has already reported its own result by this point.
  const thumbPaths = paths.map(thumbPathFor);
  const { error: thumbError } = await supabase.storage
    .from('listing-images')
    .remove(thumbPaths);
  if (thumbError) {
    console.warn('[upload] thumbnail cleanup skipped:', thumbError.message);
  }
}

export async function uploadWardrobeImage(image: LocalImage, userId: string): Promise<string> {
  const compressed = await compressImage(image, LISTING_MAX_EDGE, LISTING_QUALITY);
  return uploadOne('wardrobe-images', compressed, userId, 0);
}
