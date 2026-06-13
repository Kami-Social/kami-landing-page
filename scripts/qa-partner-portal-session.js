#!/usr/bin/env node
/**
 * QA helper: obtain a partner session via admin magic link (no password change).
 * Reads SUPABASE_SERVICE_ROLE_KEY from env — never logs secrets.
 * Usage: node scripts/qa-partner-portal-session.js bensdecker+2@gmail.com
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let val = trimmed.slice(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile(path.join(__dirname, "..", ".env.qa.prod.pull"));

const url = process.env.SUPABASE_URL || "https://bscnpilzmilzabagnypx.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_KZjXdTtB1w5nm1to8f2MXA_Pg0JbiU6";
const email = process.argv[2] || "bensdecker+2@gmail.com";

if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY (pull production env for local QA only).");
  process.exit(1);
}

async function main() {
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error("generateLink failed:", linkErr?.message || "no hashed_token");
    process.exit(1);
  }

  const { data: sessionData, error: sessionErr } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });

  if (sessionErr || !sessionData?.session) {
    console.error("verifyOtp failed:", sessionErr?.message || "no session");
    process.exit(1);
  }

  const session = sessionData.session;
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });

  const checks = [
    ["get_my_partner_agreement_status", {}],
    ["get_my_partner_dashboard", { p_partner_id: null }],
  ];

  for (const [rpc, args] of checks) {
    const callArgs =
      rpc === "get_my_partner_dashboard"
        ? { p_partner_id: (await userClient.rpc("get_my_partner_agreement_status")).data?.partner_id }
        : args;
    const { data, error } = await userClient.rpc(rpc, callArgs);
    if (error) {
      console.error(`${rpc} error:`, error.message);
      process.exit(1);
    }
    console.log(`${rpc}:`, JSON.stringify({ ok: data?.ok, state: data?.state, error: data?.error }));
  }

  const dashboardId = (await userClient.rpc("get_my_partner_agreement_status")).data?.partner_id;
  const { data: dash } = await userClient.rpc("get_my_partner_dashboard", {
    p_partner_id: dashboardId,
  });
  const { data: events } = await userClient.rpc("get_my_partner_events", {
    p_partner_id: dashboardId,
  });

  console.log(
    "dashboard_summary:",
    JSON.stringify({
      venues: Array.isArray(dash?.venues) ? dash.venues.length : 0,
      readiness: Array.isArray(dash?.readiness) ? dash.readiness.length : 0,
      referral_code: dash?.referral?.code ? "present" : "missing",
      signup_count: dash?.referral?.signup_count,
      events: Array.isArray(events?.events) ? events.events.length : 0,
    })
  );

  console.log("SESSION_JSON_START");
  console.log(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      partner_id: dashboardId,
      agreement_state: (await userClient.rpc("get_my_partner_agreement_status")).data?.state,
    })
  );
  console.log("SESSION_JSON_END");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
