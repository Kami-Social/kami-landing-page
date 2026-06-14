const { sendJson } = require("../lib/request");
const { logPartnerMedia } = require("../lib/partner-media-debug");
const {
  bearerToken,
  createUserClient,
  createAdminClient,
  pickAnonKey,
  pickSupabaseUrl,
  pickServiceKey,
} = require("../lib/supabase-auth");
const {
  SIGNED_URL_TTL_SEC,
  resolvePartnerPlaceImageUrl,
} = require("../lib/partner-place-image-resolve");

async function loadApprovedPlaceImage(admin, placeId) {
  if (!admin || !placeId) return null;
  const { data, error } = await admin
    .from("place_images")
    .select("storage_bucket, storage_path, status")
    .eq("place_id", placeId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.storage_path) return null;
  return data;
}

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

  let admin = null;
  try {
    admin = createAdminClient();
  } catch (e) {
    logPartnerMedia("place-photo.adminClient", { error: e?.message || "createAdminClient_failed" });
  }

  const imageRow = admin ? await loadApprovedPlaceImage(admin, placeId) : null;
  const { url, source } = await resolvePartnerPlaceImageUrl({
    supabaseUrl: pickSupabaseUrl(),
    signingSecret: String(process.env.PLACE_PHOTO_SIGNING_SECRET || "").trim(),
    placeId,
    venue,
    imageRow,
    admin,
    userClient,
  });

  if (!url) {
    logPartnerMedia("place-photo.response", {
      status: 404,
      error: "photo_unavailable",
      placeId,
      serviceRoleKeyLength: pickServiceKey().length,
    });
    sendJson(res, 404, { ok: false, error: "photo_unavailable" });
    return;
  }

  logPartnerMedia("place-photo.response", { status: 200, placeId, source, hasUrl: true });
  sendJson(res, 200, { ok: true, url, expires_in: SIGNED_URL_TTL_SEC });
};
