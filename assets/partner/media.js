const STORAGE_PUBLIC_PREFIX =
  "https://bscnpilzmilzabagnypx.supabase.co/storage/v1/object/public/";

import { escapeHtml } from "./format.js";

/**
 * True for place-images storage URLs that must not be used as bare <img src>
 * (public object URLs 404; authenticated object URLs return 400 without a JWT).
 */
export function isUnusablePlaceImagesBrowserUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return false;
  if (/\/object\/sign\/place-images\//i.test(value)) return false;
  if (/\/object\/public\/place-images\//i.test(value)) return true;
  if (/\/object\/place-images\//i.test(value)) return true;
  if (/\/storage\/v1\/object\/place-images\//i.test(value)) return true;
  return false;
}

/** @deprecated Use isUnusablePlaceImagesBrowserUrl */
export function isPrivatePlaceImagesUrl(raw) {
  return isUnusablePlaceImagesBrowserUrl(raw);
}

/** Extract object path from a place-images storage URL. */
export function parsePlaceImagesPath(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const patterns = [
    /\/object\/public\/place-images\/(.+)$/i,
    /\/object\/sign\/place-images\/(.+)$/i,
    /\/object\/place-images\/(.+)$/i,
    /\/storage\/v1\/object\/place-images\/(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return decodeURIComponent(match[1].split("?")[0]);
  }
  return "";
}

export function isSignedStorageUrl(raw) {
  return /\/object\/sign\//i.test(String(raw ?? ""));
}

export function pickUsablePhotoUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (value.startsWith("blob:")) return value;
  if (isSignedStorageUrl(raw)) return value;
  if (isUnusablePlaceImagesBrowserUrl(value)) return "";
  return resolveMediaUrl(raw);
}

export function resolveMediaUrl(raw, { bucket = "place-images" } = {}) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    if (isUnusablePlaceImagesBrowserUrl(value)) return "";
    return value;
  }
  if (value.startsWith("/storage/")) {
    const absolute = `https://bscnpilzmilzabagnypx.supabase.co${value}`;
    if (isUnusablePlaceImagesBrowserUrl(absolute)) return "";
    return absolute;
  }
  const path = value.replace(/^\/+/, "");
  if (path.startsWith("storage/v1/object/")) {
    if (path.includes("/place-images/") && !path.includes("/object/sign/place-images/")) return "";
    return `https://bscnpilzmilzabagnypx.supabase.co/${path}`;
  }
  if (bucket === "place-images") return "";
  return `${STORAGE_PUBLIC_PREFIX}${bucket}/${path}`;
}

export function pickDisplayImage(...candidates) {
  for (const candidate of candidates) {
    const url = pickUsablePhotoUrl(candidate);
    if (url) return url;
  }
  return "";
}

/**
 * @param {object} opts
 * @param {string} [opts.url]
 * @param {string} opts.fallbackText
 * @param {string} opts.imgClass
 * @param {string} opts.fallbackClass
 */
export function renderImageOrFallback({ url, fallbackText = "?", imgClass, fallbackClass }) {
  const resolved = pickUsablePhotoUrl(url);
  if (resolved) {
    return `<img class="${imgClass}" src="${escapeHtml(resolved)}" alt="" referrerpolicy="no-referrer" loading="lazy" data-media-fallback="${escapeHtml(fallbackText[0] || "?")}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${fallbackClass}',textContent:this.dataset.mediaFallback,ariaHidden:'true'}))" />`;
  }
  const initial = String(fallbackText || "?")[0] || "?";
  return `<div class="${fallbackClass}" aria-hidden="true">${escapeHtml(initial)}</div>`;
}
