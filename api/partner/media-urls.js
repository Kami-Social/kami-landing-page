const { parseJsonBody, sendJson } = require("../lib/request");
const { buildSignedKamiImageUrl } = require("../lib/place-photo-signing");
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
  isUsablePublicUrl,
  signStorageObject,
  resolvePartnerPlaceImageUrl,
} = require("../lib/partner-place-image-resolve");

async function loadApprovedPlaceImages(admin, placeIds) {
  if (!placeIds.length) return new Map();

  const { data, error } = await admin
    .from("place_images")
    .select("place_id, storage_bucket, storage_path, status, approved_at, created_at")
    .in("place_id", placeIds)
    .eq("status", "approved")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) return new Map();

  const byPlace = new Map();
  for (const row of data) {
    if (!row?.place_id || byPlace.has(row.place_id)) continue;
    if (!row.storage_path) continue;
    byPlace.set(row.place_id, row);
  }
  return byPlace;
}

module.exports = async function partnerMediaUrls(req, res) {
  logPartnerMedia("media-urls.request", {
    hasAnonKey: Boolean(pickAnonKey()),
    serviceRoleKeyLength: pickServiceKey().length,
    hasSigningSecret: Boolean(String(process.env.PLACE_PHOTO_SIGNING_SECRET || "").trim()),
    supabaseUrl: pickSupabaseUrl(),
  });

  if (req.method !== "POST") {
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

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (_e) {
    sendJson(res, 400, { ok: false, error: "invalid_body" });
    return;
  }

  const partnerId = typeof body.partner_id === "string" ? body.partner_id.trim() : "";
  if (!partnerId) {
    sendJson(res, 400, { ok: false, error: "partner_id_required" });
    return;
  }

  const clientEvents = Array.isArray(body.events) ? body.events : [];

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

  let admin;
  let adminError = null;
  try {
    admin = createAdminClient();
  } catch (e) {
    admin = null;
    adminError = e?.message || "createAdminClient_failed";
  }
  logPartnerMedia("media-urls.adminClient", { adminCreated: Boolean(admin), adminError });

  const signingSecret = String(process.env.PLACE_PHOTO_SIGNING_SECRET || "").trim();
  const supabaseUrl = pickSupabaseUrl();

  const venues = {};
  const events = {};
  const placeIds = (dashboard.venues || []).map((venue) => venue.place_id).filter(Boolean);
  const imageRows = admin ? await loadApprovedPlaceImages(admin, placeIds) : new Map();

  for (const venue of dashboard.venues || []) {
    const placeId = venue.place_id;
    if (!placeId) continue;

    logPartnerMedia("media-urls.venue.db", {
      placeId,
      name: venue.name,
      photo_storage_bucket: venue.photo_storage_bucket,
      photo_storage_path: venue.photo_storage_path,
      photo_url: venue.photo_url,
      approvedImageRow: imageRows.get(placeId) || null,
    });

    const { url, source: urlSource } = await resolvePartnerPlaceImageUrl({
      supabaseUrl,
      signingSecret,
      placeId,
      venue,
      imageRow: imageRows.get(placeId),
      admin,
      userClient,
    });

    if (url) venues[placeId] = url;
    logPartnerMedia("media-urls.venue.result", { placeId, urlSource, hasUrl: Boolean(url) });
  }

  if (!Object.keys(venues).length && !signingSecret && !admin) {
    logPartnerMedia("media-urls.response", { status: 503, error: "media_not_configured" });
    sendJson(res, 503, { ok: false, error: "media_not_configured" });
    return;
  }

  for (const event of clientEvents) {
    const eventId = event.event_id;
    if (!eventId) continue;

    let url = null;

    if (isUsablePublicUrl(event.image_url)) {
      url = event.image_url;
    } else if (isUsablePublicUrl(event.display_image_url)) {
      url = event.display_image_url;
    } else if (event.place_id && venues[event.place_id]) {
      url = venues[event.place_id];
    } else if (event.place_id && signingSecret) {
      url = buildSignedKamiImageUrl(supabaseUrl, signingSecret, event.place_id, {
        maxHeight: 480,
        maxWidth: 720,
      });
    } else if (event.place_id) {
      const imageRow = imageRows.get(event.place_id);
      if (imageRow && admin) {
        url = await signStorageObject(
          admin,
          imageRow.storage_bucket || "place-images",
          imageRow.storage_path
        );
      }
    }

    if (url) events[eventId] = url;
  }

  logPartnerMedia("media-urls.response", {
    status: 200,
    venueCount: Object.keys(venues).length,
    eventCount: Object.keys(events).length,
  });
  sendJson(res, 200, { ok: true, venues, events, expires_in: SIGNED_URL_TTL_SEC });
};
