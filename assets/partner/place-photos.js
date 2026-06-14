import { parsePlaceImagesPath, pickUsablePhotoUrl } from "./media.js";
import { partnerMediaDebug } from "./media-debug.js";

const SIGNED_URL_TTL_SEC = 60 * 60;

function normalizeStoragePath(path) {
  return String(path || "")
    .trim()
    .replace(/^\/+/, "");
}

async function fetchSignedKamiImageFromApi(supabase, partnerId, placeId) {
  if (!supabase || !partnerId || !placeId) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  try {
    const params = new URLSearchParams({
      partner_id: partnerId,
      place_id: placeId,
      maxh: "480",
      maxw: "720",
    });
    const response = await fetch(`/api/partner/place-photo?${params}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    partnerMediaDebug("place-photo.api", {
      placeId,
      status: response.status,
      ok: payload?.ok,
      error: payload?.error,
      hasUrl: Boolean(payload?.url),
    });
    if (!response.ok) return null;
    return payload?.ok && payload?.url ? payload.url : null;
  } catch (_e) {
    return null;
  }
}

async function downloadStorageBlob(supabase, bucket, path) {
  const normalizedBucket = String(bucket || "place-images").trim();
  const normalizedPath = normalizeStoragePath(path);
  if (!supabase || !normalizedPath) return null;

  const { data, error } = await supabase.storage.from(normalizedBucket).download(normalizedPath);
  partnerMediaDebug("storage.download", {
    bucket: normalizedBucket,
    path: normalizedPath,
    ok: Boolean(data),
    error: error?.message || null,
  });
  if (error || !data) return null;
  return URL.createObjectURL(data);
}

async function signStoragePath(supabase, bucket, path) {
  const normalizedBucket = String(bucket || "place-images").trim();
  const normalizedPath = normalizeStoragePath(path);
  if (!supabase || !normalizedPath) return null;

  const { data, error } = await supabase.storage
    .from(normalizedBucket)
    .createSignedUrl(normalizedPath, SIGNED_URL_TTL_SEC);

  partnerMediaDebug("storage.createSignedUrl", {
    bucket: normalizedBucket,
    path: normalizedPath,
    ok: Boolean(data?.signedUrl),
    error: error?.message || null,
  });

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function resolveVenuePhotoUrl(supabase, venue, partnerId) {
  const placeId = venue?.place_id;
  const bucket = venue.photo_storage_bucket || "place-images";
  const path = venue.photo_storage_path || parsePlaceImagesPath(venue.photo_url);

  partnerMediaDebug("resolveVenuePhotoUrl.start", {
    placeId,
    bucket,
    path,
    rawPhotoUrl: venue.photo_url,
  });

  if (partnerId && placeId) {
    const apiUrl = await fetchSignedKamiImageFromApi(supabase, partnerId, placeId);
    if (apiUrl) {
      partnerMediaDebug("resolveVenuePhotoUrl.result", { placeId, source: "place_photo_api" });
      return apiUrl;
    }
  }

  if (path) {
    const signed = await signStoragePath(supabase, bucket, path);
    if (signed) {
      partnerMediaDebug("resolveVenuePhotoUrl.result", { placeId, source: "client_signed_url" });
      return signed;
    }

    const blobUrl = await downloadStorageBlob(supabase, bucket, path);
    if (blobUrl) {
      partnerMediaDebug("resolveVenuePhotoUrl.result", { placeId, source: "blob_download" });
      return blobUrl;
    }
  }

  const fallback = pickUsablePhotoUrl(venue.photo_url);
  partnerMediaDebug("resolveVenuePhotoUrl.result", { placeId, source: "fallback", fallback });
  return fallback;
}

export async function signVenuePhotoUrls(supabase, partnerId, venues) {
  const urls = {};
  for (const venue of venues || []) {
    if (!venue?.place_id) continue;
    const url = await resolveVenuePhotoUrl(supabase, venue, partnerId);
    if (url) urls[venue.place_id] = url;
  }
  return urls;
}
