const { sendResendEmail } = require("./resend");
const { logEmailDelivery } = require("./email-delivery-log");

const BETA_CONFIRMATION_SUBJECT = "Welcome to the Kami Beta";
const BETA_CONFIRMATION_FROM = "Benji from Kami <benji@mail.kamisocial.com>";
const BETA_CONFIRMATION_REPLY_TO = "hello@kamisocial.com";
const DEFAULT_ANDROID_PLAY_LINK =
  "https://play.google.com/store/apps/details?id=com.kamisocial.app";
const DEFAULT_IOS_TESTFLIGHT_LINK =
  "https://testflight.apple.com/join/wPwJCSyX";
const LOGO_URL = "https://admin.kamisocial.com/kami-logo.png";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isConfiguredLink(link) {
  return Boolean(link && typeof link === "string" && !link.trim().startsWith("TODO"));
}

function resolveAndroidPlayLink() {
  const configured = String(process.env.ANDROID_PLAY_TEST_LINK || "").trim();
  if (isConfiguredLink(configured)) return configured;
  return DEFAULT_ANDROID_PLAY_LINK;
}

function resolveIosTestflightLink() {
  const configured = String(process.env.IOS_TESTFLIGHT_LINK || "").trim();
  if (isConfiguredLink(configured)) return configured;
  return DEFAULT_IOS_TESTFLIGHT_LINK;
}

function renderBetaConfirmationEmailText({ platform, ctaUrl, ctaLabel, title, body }) {
  const lines = [title, "", body, ""];

  if (ctaUrl && ctaLabel) {
    lines.push(`${ctaLabel}: ${ctaUrl}`, "");
  }

  lines.push(
    "Questions? Reply to this email or contact hello@kamisocial.com.",
    "",
    "— Kami"
  );

  return lines.join("\n");
}

function renderBetaConfirmationEmailHtml({ platform, ctaUrl, ctaLabel, title, body }) {
  const ctaBlock =
    ctaUrl && ctaLabel
      ? `<tr>
              <td align="center" style="padding:28px 32px 8px">
                <a href="${escapeHtml(ctaUrl)}" style="background-color:#a855f7;border-radius:999px;color:#ffffff;display:inline-block;font-size:16px;font-weight:800;line-height:1;padding:16px 32px;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
              </td>
            </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${escapeHtml(BETA_CONFIRMATION_SUBJECT)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#07030f;color:#ffffff;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#07030f;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#120824;border:1px solid rgba(168,85,247,0.28);border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background-color:#a855f7;background-image:linear-gradient(90deg,#7c3aed 0%,#a855f7 55%,#c084fc 100%);font-size:0;line-height:0;height:4px;">&nbsp;</td>
            </tr>
            <tr>
              <td align="center" style="padding:32px 32px 16px">
                <img src="${escapeHtml(LOGO_URL)}" alt="Kami" width="72" height="72" style="display:block;border:0;height:auto;max-width:72px" />
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px">
                <p style="margin:0 0 8px;color:rgba(255,255,255,0.68);font-size:13px;font-weight:700;letter-spacing:0.08em;text-align:center;text-transform:uppercase;">Kami Beta</p>
                <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;line-height:1.25;text-align:center;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0">
                <p style="margin:0;color:rgba(255,255,255,0.82);font-size:16px;line-height:1.65;">${escapeHtml(body)}</p>
              </td>
            </tr>
            ${ctaBlock}
            <tr>
              <td style="padding:24px 32px 24px;border-top:1px solid rgba(255,255,255,0.08);">
                <p style="margin:0;color:rgba(255,255,255,0.68);font-size:14px;line-height:1.6;text-align:center;">Questions? Reply to this email or contact <a href="mailto:hello@kamisocial.com" style="color:#c084fc;font-weight:600;text-decoration:none;">hello@kamisocial.com</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildBetaConfirmationContent(platform) {
  if (platform === "android") {
    return {
      title: "Welcome to the Kami Android Beta",
      body: "You're in. Use the button below to open Kami on Google Play and install the beta (be sure you're logged into the Play Store with this email address).",
      ctaLabel: "Open on Google Play",
      ctaUrl: resolveAndroidPlayLink(),
    };
  }

  const testflightLink = resolveIosTestflightLink();
  if (testflightLink) {
    return {
      title: "Welcome to the Kami iOS Beta",
      body: "You're in. Use the button below to open Kami in TestFlight and install the beta.",
      ctaLabel: "Open in TestFlight",
      ctaUrl: testflightLink,
    };
  }

  return {
    title: "Welcome to the Kami iOS Beta",
    body: "You're on the Kami iOS beta list. We'll send access as soon as the next TestFlight round opens.",
    ctaLabel: null,
    ctaUrl: null,
  };
}

function resolveBetaConfirmationLogFields(platform) {
  if (platform === "android") {
    return {
      email_type: "beta_signup_confirmation_android",
      template_key: "beta-signup-confirmation-android",
    };
  }

  if (resolveIosTestflightLink()) {
    return {
      email_type: "beta_signup_confirmation_ios_testflight",
      template_key: "beta-signup-confirmation-ios-testflight",
    };
  }

  return {
    email_type: "beta_signup_confirmation_ios_waitlist",
    template_key: "beta-signup-confirmation-ios-waitlist",
  };
}

async function sendBetaConfirmationEmail({ email, platform, source = "website" }) {
  const content = buildBetaConfirmationContent(platform);
  const html = renderBetaConfirmationEmailHtml({ platform, ...content });
  const text = renderBetaConfirmationEmailText({ platform, ...content });
  const { email_type, template_key } = resolveBetaConfirmationLogFields(platform);
  const trigger =
    platform === "android" ? "POST /api/beta/android" : "POST /api/beta/ios";

  const logBase = {
    email_type,
    template_key,
    category_slug: "registration",
    recipient_email: email,
    subject: BETA_CONFIRMATION_SUBJECT,
    from_address: BETA_CONFIRMATION_FROM,
    reply_to: BETA_CONFIRMATION_REPLY_TO,
    is_test: false,
    metadata: {
      platform,
      source,
      trigger,
    },
  };

  const result = await sendResendEmail({
    from: BETA_CONFIRMATION_FROM,
    to: email,
    subject: BETA_CONFIRMATION_SUBJECT,
    html,
    text,
    replyTo: BETA_CONFIRMATION_REPLY_TO,
  });

  if (!result.ok) {
    await logEmailDelivery({
      ...logBase,
      status: "failed",
      failure_reason: result.message || result.error,
    });
    return {
      ok: false,
      error: result.error || "send_failed",
      message: result.message || null,
    };
  }

  await logEmailDelivery({
    ...logBase,
    status: "sent",
    provider_message_id: result.id,
  });

  return { ok: true, id: result.id || null };
}

module.exports = {
  BETA_CONFIRMATION_SUBJECT,
  BETA_CONFIRMATION_FROM,
  BETA_CONFIRMATION_REPLY_TO,
  resolveAndroidPlayLink,
  resolveIosTestflightLink,
  sendBetaConfirmationEmail,
};
