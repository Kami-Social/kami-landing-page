const { buildSignedKamiImageUrl } = require("./place-photo-signing");
const { logPartnerMedia } = require("./partner-media-debug");

const SIGNED_URL_TTL_SEC = 60 * 60;

function normalizePath(path) {
  return String(path || "")
    .trim()
    .replace(/^\/+/, "");
}

function isUsablePublicUrl(url) {
  const value = String(url || "").trim();
  if (!value || !/^https?:\/\//i.test(value)) return false;
  if (/\/object\/sign\/place-images\//i.test(value)) return true;
  if (/\/object\/public\/place-images\//i.test(value)) return false;
  if (/\/object\/place-images\//i.test(value)) return false;
  if (/\/storage\/v1\/object\/place-images\//i.test(value)) return false;
  return true;
}

async function signStorageObject(admin, bucket, path) {
  const normalizedBucket = String(bucket || "").trim();
  const normalizedPath = normalizePath(path);
  if (!admin || !normalizedBucket || !normalizedPath) return null;

  const { data, error } = await admin.storage
    .from(normalizedBucket)
    .createSignedUrl(normalizedPath, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    logPartnerMedia("signStorageObject.failed", {
      bucket: normalizedBucket,
      path: normalizedPath,
      error: error?.message || "no_signed_url",
    });
    return null;
  }

  return data.signedUrl;
}

async function signWithUserClient(userClient, bucket, path) {
  const normalizedBucket = String(bucket || "place-images").trim();
  const normalizedPath = normalizePath(path);
  if (!userClient || !normalizedPath) return null;

  const { data, error } = await userClient.storage
    .from(normalizedBucket)
    .createSignedUrl(normalizedPath, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    logPartnerMedia("signStorageObject.userClient.failed", {
      bucket: normalizedBucket,
      path: normalizedPath,
      error: error?.message || "no_signed_url",
    });
    return null;
  }

  return data.signedUrl;
}

/**
 * Resolve a browser-usable signed URL for a linked partner venue photo.
 */
async function resolvePartnerPlaceImageUrl({
  supabaseUrl,
  signingSecret,
  placeId,
  venue,
  imageRow,
  admin,
  userClient,
}) {
  if (!placeId) return { url: null, source: null };

  if (signingSecret) {
    const url = buildSignedKamiImageUrl(supabaseUrl, signingSecret, placeId, {
      maxHeight: 480,
      maxWidth: 720,
    });
    if (url) return { url, source: "hmac_place_kami_image" };
  }

  const bucket =
    imageRow?.storage_bucket || venue?.photo_storage_bucket || "place-images";
  const path =
    imageRow?.storage_path ||
    venue?.photo_storage_path ||
    null;

  if (path && admin) {
    const url = await signStorageObject(admin, bucket, path);
    if (url) return { url, source: "admin_storage_sign" };
  }

  if (path && userClient) {
    const url = await signWithUserClient(userClient, bucket, path);
    if (url) return { url, source: "user_storage_sign" };
  }

  if (isUsablePublicUrl(venue?.photo_url)) {
    return { url: venue.photo_url, source: "public_photo_url" };
  }

  return { url: null, source: null };
}

module.exports = {
  SIGNED_URL_TTL_SEC,
  isUsablePublicUrl,
  normalizePath,
  signStorageObject,
  resolvePartnerPlaceImageUrl,
};
