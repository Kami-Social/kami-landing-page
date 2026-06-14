const { parseJsonBody, sendJson } = require("../lib/request");
const { bearerToken, createUserClient, pickAnonKey } = require("../lib/supabase-auth");

module.exports = async function partnerTerminate(req, res) {
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
  const confirmation =
    typeof body.confirmation === "string" ? body.confirmation.trim() : "";

  if (!partnerId) {
    sendJson(res, 400, { ok: false, error: "partner_id_required" });
    return;
  }

  let supabase;
  try {
    supabase = createUserClient(userJwt);
  } catch (_e) {
    sendJson(res, 503, { ok: false, error: "not_configured" });
    return;
  }

  const { data, error } = await supabase.rpc("terminate_my_partner_participation", {
    p_partner_id: partnerId,
    p_confirmation: confirmation,
  });

  if (error) {
    sendJson(res, 500, { ok: false, error: "rpc_error", message: error.message });
    return;
  }

  if (!data?.ok) {
    sendJson(res, 400, data || { ok: false, error: "terminate_failed" });
    return;
  }

  sendJson(res, 200, data);
};
