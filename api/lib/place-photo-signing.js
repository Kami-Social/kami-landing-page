const crypto = require("crypto");

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_SEC = 86400 * 7;

function signPlacePhotoUrl(secret, placeId, exp, maxHeight, maxWidth) {
  const payload = `${TOKEN_VERSION}|${placeId}|${exp}|${maxHeight}|${maxWidth}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function clampDimension(value, fallback, { min = 32, max = 2048 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function buildSignedKamiImageUrl(
  supabaseUrl,
  secret,
  placeId,
  { maxHeight = 480, maxWidth = 720, ttlSec = DEFAULT_TTL_SEC } = {}
) {
  const base = String(supabaseUrl || "").trim().replace(/\/$/, "");
  const signingSecret = String(secret || "").trim();
  if (!base || !signingSecret || !placeId) return null;

  const maxh = clampDimension(maxHeight, 480);
  const maxw = clampDimension(maxWidth, 720);
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = signPlacePhotoUrl(signingSecret, placeId, exp, maxh, maxw);

  const url = new URL(`${base}/functions/v1/place-kami-image`);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("maxh", String(maxh));
  url.searchParams.set("maxw", String(maxw));
  url.searchParams.set("sig", sig);
  return url.toString();
}

module.exports = {
  buildSignedKamiImageUrl,
  signPlacePhotoUrl,
};
