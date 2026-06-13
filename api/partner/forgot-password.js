const { parseJsonBody, getClientIp, sendJson } = require("../lib/request");
const { createAdminClient, pickServiceKey } = require("../lib/supabase-auth");
const { isRateLimited } = require("../lib/rate-limit");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function pickPasswordResetRedirect(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  if (host.includes("localhost") || host.startsWith("127.0.0.1")) {
    return `${proto}://${host}/password-reset`;
  }
  if (host.includes("kamisocial.com")) {
    return `https://${host.replace(/^www\./, "")}/password-reset`;
  }
  return "https://kamisocial.com/password-reset";
}

module.exports = async function partnerForgotPassword(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, code: "method_not_allowed" });
    return;
  }

  if (!pickServiceKey()) {
    sendJson(res, 503, {
      ok: false,
      code: "not_configured",
      message: "Password reset is not available right now. Please try again later.",
    });
    return;
  }

  const ip = getClientIp(req);
  if (isRateLimited(`partner-forgot:${ip}`)) {
    sendJson(res, 429, {
      ok: false,
      code: "rate_limited",
      message: "Too many attempts. Please wait a few minutes and try again.",
    });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (_e) {
    sendJson(res, 400, { ok: false, code: "invalid_body", message: "Invalid request." });
    return;
  }

  const email = normalizeEmail(body.email);
  if (!email || !EMAIL_RE.test(email)) {
    sendJson(res, 400, {
      ok: false,
      code: "invalid_email",
      message: "Enter a valid email address.",
    });
    return;
  }

  const admin = createAdminClient();

  const { data: check, error: checkErr } = await admin.rpc("kami_partner_forgot_password_check", {
    p_email: email,
  });

  if (checkErr) {
    sendJson(res, 500, {
      ok: false,
      code: "lookup_failed",
      message: "Something went wrong. Please try again.",
    });
    return;
  }

  if (!check?.ok) {
    const code = check?.code || "lookup_failed";
    const status = code === "email_not_found" ? 404 : code === "not_partner" ? 403 : 400;
    sendJson(res, status, {
      ok: false,
      code,
      message: check?.message || "Something went wrong. Please try again.",
    });
    return;
  }

  const resetEmail = String(check.email || email).trim();
  const redirectTo = pickPasswordResetRedirect(req);
  const { error: resetErr } = await admin.auth.resetPasswordForEmail(resetEmail, { redirectTo });

  if (resetErr) {
    sendJson(res, 500, {
      ok: false,
      code: "reset_failed",
      message: "Could not send the reset email. Please try again.",
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    code: "email_sent",
    message: "A password reset link has been sent to your email.",
  });
};
