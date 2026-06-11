/**
 * Server-only Google Workspace group membership via Admin SDK Directory API.
 * Uses JWT auth with domain-wide delegation.
 *
 * Env:
 *   GOOGLE_WORKSPACE_CLIENT_EMAIL
 *   GOOGLE_WORKSPACE_PRIVATE_KEY  (supports \\n escaped newlines in Vercel)
 *   GOOGLE_WORKSPACE_IMPERSONATED_ADMIN_EMAIL
 *   GOOGLE_ANDROID_BETA_GROUP_EMAIL (default: android-beta@kamisocial.com)
 */
const { google } = require("googleapis");

const MEMBER_SCOPE = "https://www.googleapis.com/auth/admin.directory.group.member";

function readPrivateKey() {
  return process.env.GOOGLE_WORKSPACE_PRIVATE_KEY?.replace(/\\n/g, "\n") || "";
}

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL &&
      readPrivateKey() &&
      process.env.GOOGLE_WORKSPACE_IMPERSONATED_ADMIN_EMAIL
  );
}

function getMissingEnvVars() {
  const missing = [];
  if (!process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL) {
    missing.push("GOOGLE_WORKSPACE_CLIENT_EMAIL");
  }
  if (!readPrivateKey()) missing.push("GOOGLE_WORKSPACE_PRIVATE_KEY");
  if (!process.env.GOOGLE_WORKSPACE_IMPERSONATED_ADMIN_EMAIL) {
    missing.push("GOOGLE_WORKSPACE_IMPERSONATED_ADMIN_EMAIL");
  }
  return missing;
}

function getGroupEmail() {
  return (
    process.env.GOOGLE_ANDROID_BETA_GROUP_EMAIL || "android-beta@kamisocial.com"
  ).trim();
}

async function getAdminClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL,
    key: readPrivateKey(),
    scopes: [MEMBER_SCOPE],
    subject: process.env.GOOGLE_WORKSPACE_IMPERSONATED_ADMIN_EMAIL,
  });

  await auth.authorize();
  return google.admin({ version: "directory_v1", auth });
}

function isAlreadyMemberError(err) {
  const status = err?.code || err?.response?.status;
  if (status === 409) return true;

  const message = String(err?.message || "").toLowerCase();
  if (message.includes("member already exists")) return true;
  if (message.includes("duplicate")) return true;

  const reason =
    err?.errors?.[0]?.reason || err?.response?.data?.error?.errors?.[0]?.reason;
  return reason === "duplicate";
}

/**
 * Adds an email to a Google Group via Admin SDK.
 * Idempotent when the member already exists.
 */
async function addGroupMember(email, groupEmail) {
  console.info("[google-group] adding member", {
    groupEmail,
    emailDomain: email.includes("@") ? email.split("@")[1] : "invalid",
  });

  let admin;
  try {
    admin = await getAdminClient();
  } catch (err) {
    console.error("[google-group] JWT authorize failed", {
      message: err?.message,
    });
    return {
      ok: false,
      error: "Google Workspace authentication failed.",
    };
  }

  try {
    await admin.members.insert({
      groupKey: groupEmail,
      requestBody: {
        email,
        role: "MEMBER",
      },
    });

    console.info("[google-group] member added", { groupEmail });
    return {
      ok: true,
      message: "Added to Android beta group",
      alreadyMember: false,
    };
  } catch (err) {
    if (isAlreadyMemberError(err)) {
      console.info("[google-group] member already exists", { groupEmail });
      return {
        ok: true,
        message: "Already in Android beta group",
        alreadyMember: true,
      };
    }

    const status = err?.code || err?.response?.status;
    const reason =
      err?.errors?.[0]?.reason ||
      err?.response?.data?.error?.errors?.[0]?.reason;
    const apiMessage = err?.response?.data?.error?.message || err?.message;

    console.error("[google-group] members.insert failed", {
      status,
      reason,
      message: apiMessage,
      groupEmail,
    });

    if (status === 403) {
      return {
        ok: false,
        error:
          "Google Workspace permission denied. Check domain-wide delegation and admin impersonation.",
      };
    }

    if (status === 404) {
      return {
        ok: false,
        error: "Google Group not found. Check GOOGLE_ANDROID_BETA_GROUP_EMAIL.",
      };
    }

    return {
      ok: false,
      error: "Could not add member to Android beta group.",
    };
  }
}

/** Adds a member to the configured Android beta Google Group. */
async function addAndroidBetaGroupMember(email) {
  return addGroupMember(email, getGroupEmail());
}

module.exports = {
  isConfigured,
  getMissingEnvVars,
  getGroupEmail,
  addGroupMember,
  addAndroidBetaGroupMember,
};
