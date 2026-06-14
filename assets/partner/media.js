const STORAGE_PUBLIC_PREFIX =
  "https://bscnpilzmilzabagnypx.supabase.co/storage/v1/object/public/";

import { escapeHtml } from "./format.js";

/** Extract object path from a place-images public or signed URL. */
export function parsePlaceImagesPath(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const publicMatch = value.match(/\/object\/public\/place-images\/(.+)$/i);
  if (publicMatch) return decodeURIComponent(publicMatch[1].split("?")[0]);
  const signMatch = value.match(/\/object\/sign\/place-images\/(.+)$/i);
  if (signMatch) return decodeURIComponent(signMatch[1].split("?")[0]);
  return "";
}

export function isPrivatePlaceImagesUrl(raw) {
  const value = String(raw ?? "").trim();
  return /\/object\/public\/place-images\//i.test(value);
}

export function isSignedStorageUrl(raw) {
  return /\/object\/sign\//i.test(String(raw ?? ""));
}

export function pickUsablePhotoUrl(raw) {
  const value = String(raw ?? "").trim();
  if (value.startsWith("blob:")) return value;
  if (isSignedStorageUrl(raw)) return value;
  return resolveMediaUrl(raw);
}

export function resolveMediaUrl(raw, { bucket = "place-images" } = {}) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    if (isPrivatePlaceImagesUrl(value)) return "";
    return value;
  }
  if (value.startsWith("/storage/")) {
    return `https://bscnpilzmilzabagnypx.supabase.co${value}`;
  }
  const path = value.replace(/^\/+/, "");
  if (path.startsWith("storage/v1/object/public/")) {
    if (path.includes("/place-images/")) return "";
    return `https://bscnpilzmilzabagnypx.supabase.co/${path}`;
  }
  return `${STORAGE_PUBLIC_PREFIX}${bucket}/${path}`;
}

export function pickDisplayImage(...candidates) {
  for (const candidate of candidates) {
    const url = resolveMediaUrl(candidate);
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
