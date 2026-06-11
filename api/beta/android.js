/**
 * Android beta signup: persist email (Supabase when configured), then add to
 * Google Group via Admin SDK (domain-wide delegation).
 */
const { parseJsonBody, getClientIp, sendJson } = require("../lib/request");
const { isRateLimited } = require("../lib/rate-limit");
const { storeBetaSignup } = require("../lib/beta-signup-store");
const { normalizeEmail, isValidEmail } = require("../lib/email");
const {
  isConfigured,
  getMissingEnvVars,
  addAndroidBetaGroupMember,
} = require("../lib/google-group");

module.exports = async function androidBetaSignup(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "Method not allowed." });
    return;
  }

  const clientIp = getClientIp(req);
  if (isRateLimited(`android-beta:ip:${clientIp}`)) {
    sendJson(res, 429, {
      success: false,
      error: "Too many requests. Please try again later.",
    });
    return;
  }

  if (!isConfigured()) {
    console.error("[android-beta] missing env", { missing: getMissingEnvVars() });
    sendJson(res, 503, {
      success: false,
      error: "Beta signup is temporarily unavailable. Please try again later.",
    });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (_err) {
    sendJson(res, 400, { success: false, error: "Invalid request body." });
    return;
  }

  const email = normalizeEmail(body.email);
  const source =
    typeof body.source === "string" && body.source.trim()
      ? body.source.trim().slice(0, 64)
      : "website";

  if (!isValidEmail(email)) {
    sendJson(res, 400, { success: false, error: "Enter a valid email address." });
    return;
  }

  if (isRateLimited(`android-beta:email:${email}`)) {
    sendJson(res, 429, {
      success: false,
      error: "Too many requests. Please try again later.",
    });
    return;
  }

  const storage = await storeBetaSignup(email, "android", source);
  if (storage.stored) {
    console.info("[android-beta] signup captured", {
      duplicate: Boolean(storage.duplicate),
    });
  } else if (storage.skipped) {
    console.info("[android-beta] supabase storage skipped (no service key)");
  } else {
    console.error("[android-beta] supabase storage failed; continuing with google group", {
      errorCode: storage.errorCode,
      errorMessage: storage.errorMessage,
      errorDetails: storage.errorDetails,
    });
  }

  const added = await addAndroidBetaGroupMember(email);
  if (!added.ok) {
    sendJson(res, 500, { success: false, error: added.error });
    return;
  }

  if (!storage.stored && !storage.skipped) {
    console.warn("[android-beta] google group succeeded but supabase row missing", {
      emailDomain: email.includes("@") ? email.split("@")[1] : "invalid",
      errorCode: storage.errorCode,
    });
  }

  sendJson(res, 200, {
    success: true,
    message: added.message,
  });
};
