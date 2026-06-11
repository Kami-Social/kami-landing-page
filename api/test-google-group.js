/**
 * TEMPORARY: Test Google Workspace group enrollment without signup capture.
 * POST /api/test-google-group  { "email": "someone@example.com" }
 *
 * Remove or protect before long-term production use.
 */
const { parseJsonBody, sendJson } = require("./lib/request");
const { normalizeEmail, isValidEmail } = require("./lib/email");
const {
  isConfigured,
  getMissingEnvVars,
  getGroupEmail,
  addAndroidBetaGroupMember,
} = require("./lib/google-group");

module.exports = async function testGoogleGroup(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "Method not allowed." });
    return;
  }

  if (!isConfigured()) {
    sendJson(res, 503, {
      success: false,
      error: "Google Workspace env vars not configured.",
      missing: getMissingEnvVars(),
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
  if (!isValidEmail(email)) {
    sendJson(res, 400, { success: false, error: "Enter a valid email address." });
    return;
  }

  const groupEmail = getGroupEmail();
  const result = await addAndroidBetaGroupMember(email);

  if (!result.ok) {
    sendJson(res, 500, {
      success: false,
      error: result.error,
      groupEmail,
    });
    return;
  }

  sendJson(res, 200, {
    success: true,
    message: result.message,
    groupEmail,
    alreadyMember: Boolean(result.alreadyMember),
  });
};
