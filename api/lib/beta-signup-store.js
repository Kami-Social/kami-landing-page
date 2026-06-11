const { createClient } = require("@supabase/supabase-js");

function pickSupabaseUrl() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://bscnpilzmilzabagnypx.supabase.co";
  return String(url).trim().replace(/\/$/, "");
}

function isConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Persists a beta signup row when Supabase service role is configured.
 * Returns { stored: true } on insert or duplicate.
 * Returns { stored: false, skipped: true } when service key is unset.
 * Returns { stored: false, errorCode, ... } on non-duplicate failures (non-blocking).
 */
async function storeBetaSignup(email, platform, source) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!serviceKey) {
    return { stored: false, skipped: true };
  }

  const admin = createClient(pickSupabaseUrl(), serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.from("beta_signups").insert({
    email,
    platform,
    source,
  });

  if (!error) {
    return { stored: true };
  }

  // Unique violation — already captured.
  if (error.code === "23505") {
    return { stored: true, duplicate: true };
  }

  console.error("[beta-signup-store] insert failed", {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    platform,
    emailDomain: email.includes("@") ? email.split("@")[1] : "invalid",
  });

  return {
    stored: false,
    errorCode: error.code || null,
    errorMessage: error.message || null,
    errorDetails: error.details || null,
  };
}

module.exports = {
  isConfigured,
  storeBetaSignup,
};
