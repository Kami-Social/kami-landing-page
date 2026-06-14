import { parsePlaceImagesPath, pickUsablePhotoUrl } from "./media.js";

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
    if (!response.ok) return null;
    const payload = await response.json();
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

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function resolveVenuePhotoUrl(supabase, venue, partnerId) {
  const placeId = venue?.place_id;
  const bucket = venue.photo_storage_bucket || "place-images";
  const path = venue.photo_storage_path || parsePlaceImagesPath(venue.photo_url);

  if (path) {
    const blobUrl = await downloadStorageBlob(supabase, bucket, path);
    if (blobUrl) return blobUrl;

    const signed = await signStoragePath(supabase, bucket, path);
    if (signed) return signed;
  }

  if (partnerId && placeId) {
    const apiUrl = await fetchSignedKamiImageFromApi(supabase, partnerId, placeId);
    if (apiUrl) return apiUrl;
  }

  return pickUsablePhotoUrl(venue.photo_url);
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
