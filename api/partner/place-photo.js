const { sendJson } = require("../lib/request");
const { buildSignedKamiImageUrl } = require("../lib/place-photo-signing");
const {
  bearerToken,
  createUserClient,
  pickAnonKey,
  pickSupabaseUrl,
} = require("../lib/supabase-auth");

const SIGNED_URL_TTL_SEC = 60 * 60;

module.exports = async function partnerPlacePhoto(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  if (!pickAnonKey()) {
    sendJson(res, 503, { ok: false, error: "not_configured" });
    return;
  }

  const userJwt = bearerToken(req);
  if (!userJwt) {
    sendJson(res, 401, { ok: false, error: "not_authenticated" });
    return;
  }

  const partnerId = String(req.query?.partner_id || "").trim();
  const placeId = String(req.query?.place_id || "").trim();
  if (!partnerId || !placeId) {
    sendJson(res, 400, { ok: false, error: "partner_id_and_place_id_required" });
    return;
  }

  let userClient;
  try {
    userClient = createUserClient(userJwt);
  } catch (_e) {
    sendJson(res, 503, { ok: false, error: "not_configured" });
    return;
  }

  const { data: dashboard, error: dashError } = await userClient.rpc("get_my_partner_dashboard", {
    p_partner_id: partnerId,
  });

  if (dashError || !dashboard?.ok) {
    sendJson(res, 403, { ok: false, error: "access_denied" });
    return;
  }

  const venue = (dashboard.venues || []).find((row) => row?.place_id === placeId);
  if (!venue) {
    sendJson(res, 403, { ok: false, error: "venue_not_linked" });
    return;
  }

  const signingSecret = String(process.env.PLACE_PHOTO_SIGNING_SECRET || "").trim();
  const maxh = req.query?.maxh;
  const maxw = req.query?.maxw;
  let url = null;

  if (signingSecret) {
    url = buildSignedKamiImageUrl(pickSupabaseUrl(), signingSecret, placeId, {
      maxHeight: maxh,
      maxWidth: maxw,
    });
  }

  const storagePath = String(venue.photo_storage_path || "").trim();
  const storageBucket = String(venue.photo_storage_bucket || "place-images").trim();

  if (!url && storagePath) {
    const { data, error } = await userClient.storage
      .from(storageBucket)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
    if (!error && data?.signedUrl) {
      url = data.signedUrl;
    }
  }

  if (!url) {
    sendJson(res, 404, { ok: false, error: "photo_unavailable" });
    return;
  }

  sendJson(res, 200, { ok: true, url, expires_in: SIGNED_URL_TTL_SEC });
};
