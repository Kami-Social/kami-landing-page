const { parseJsonBody, getClientIp, sendJson } = require("../lib/request");
const { isRateLimited } = require("../lib/rate-limit");
const { sendResendEmail } = require("../lib/resend");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PARTNERS_INBOX = "partners@kamisocial.com";

function cleanText(value, maxLen = 500) {
  return String(value || "")
    .trim()
    .slice(0, maxLen);
}

module.exports = async function partnerInquiry(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, code: "method_not_allowed" });
    return;
  }

  const ip = getClientIp(req);
  if (isRateLimited(`partner-inquiry:${ip}`)) {
    sendJson(res, 429, {
      ok: false,
      code: "rate_limited",
      message: "Too many submissions. Please wait a few minutes and try again.",
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

  const businessName = cleanText(body.business_name, 200);
  const contactName = cleanText(body.contact_name, 120);
  const email = cleanText(body.email, 254).toLowerCase();
  const businessType = cleanText(body.business_type, 80);
  const website = cleanText(body.website, 300);
  const instagram = cleanText(body.instagram, 80);
  const whyInterested = cleanText(body.why_interested, 2000);

  if (!businessName || !contactName || !email || !businessType || !whyInterested) {
    sendJson(res, 400, {
      ok: false,
      code: "missing_fields",
      message: "Please fill in all required fields.",
    });
    return;
  }

  if (!EMAIL_RE.test(email)) {
    sendJson(res, 400, {
      ok: false,
      code: "invalid_email",
      message: "Enter a valid email address.",
    });
    return;
  }

  if (isRateLimited(`partner-inquiry:email:${email}`)) {
    sendJson(res, 429, {
      ok: false,
      code: "rate_limited",
      message: "Too many submissions. Please wait a few minutes and try again.",
    });
    return;
  }

  const subject = `Partner inquiry: ${businessName}`;
  const text = [
    "New partner program inquiry",
    "",
    `Business: ${businessName}`,
    `Contact: ${contactName}`,
    `Email: ${email}`,
    `Type: ${businessType}`,
    `Website: ${website || "—"}`,
    `Instagram: ${instagram || "—"}`,
    "",
    "Why interested:",
    whyInterested,
    "",
    `Submitted from IP: ${ip}`,
  ].join("\n");

  const html = text
    .split("\n")
    .map((line) => `<p style="margin:0 0 8px;font-family:sans-serif;font-size:14px;line-height:1.5;">${line.replace(/</g, "&lt;")}</p>`)
    .join("");

  const from = process.env.PARTNER_INQUIRY_FROM || "Kami Partners <partners@mail.kamisocial.com>";
  const result = await sendResendEmail({
    from,
    to: PARTNERS_INBOX,
    replyTo: email,
    subject,
    text,
    html,
  });

  if (!result.ok) {
    sendJson(res, 503, {
      ok: false,
      code: result.error || "send_failed",
      message: "Could not submit your inquiry right now. Email partners@kamisocial.com directly.",
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    message: "Thanks! Our team will follow up at the email you provided.",
  });
};
