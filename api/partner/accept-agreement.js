const { parseJsonBody, getClientIp, sendJson } = require("../lib/request");
const { bearerToken, createUserClient, pickAnonKey } = require("../lib/supabase-auth");

module.exports = async function partnerAcceptAgreement(req, res) {
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
  const agreementVersion =
    typeof body.agreement_version === "string" ? body.agreement_version.trim() : "";
  const agreementSnapshot =
    typeof body.agreement_snapshot === "string" ? body.agreement_snapshot : "";
  const programParametersSnapshot =
    body.program_parameters_snapshot && typeof body.program_parameters_snapshot === "object"
      ? body.program_parameters_snapshot
      : null;

  if (!partnerId || !agreementVersion || !agreementSnapshot) {
    sendJson(res, 400, { ok: false, error: "missing_fields" });
    return;
  }

  let supabase;
  try {
    supabase = createUserClient(userJwt);
  } catch (_e) {
    sendJson(res, 503, { ok: false, error: "not_configured" });
    return;
  }

  const { data, error } = await supabase.rpc("accept_my_partner_agreement", {
    p_partner_id: partnerId,
    p_agreement_version: agreementVersion,
    p_agreement_snapshot: agreementSnapshot,
    p_program_parameters_snapshot: programParametersSnapshot,
    p_ip_address: getClientIp(req),
    p_user_agent: String(req.headers["user-agent"] || "").slice(0, 500),
  });

  if (error) {
    sendJson(res, 500, { ok: false, error: "rpc_error", message: error.message });
    return;
  }

  if (!data?.ok) {
    sendJson(res, 400, data || { ok: false, error: "accept_failed" });
    return;
  }

  sendJson(res, 200, data);
};
