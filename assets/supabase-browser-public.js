/**
 * Optional fallback: Supabase **anon (public)** key for the password-reset page.
 * Safe to commit — it only works together with your RLS policies.
 *
 * Use this if `/api/supabase-public` stays empty (e.g. env vars live on a *different*
 * Vercel project than this static site). Paste the anon key from:
 * Supabase Dashboard → Settings → API → Project API keys → anon public
 */
window.__KAMI_BROWSER_SUPABASE__ = {
  url: "https://bscnpilzmilzabagnypx.supabase.co",
  anonKey: "sb_publishable_KZjXdTtB1w5nm1to8f2MXA_Pg0JbiU6",
};

/** Sync hint for boot UI — avoids flashing the portal loader for logged-out visitors. */
window.kamiHasLikelyStoredSession = function kamiHasLikelyStoredSession() {
  try {
    const cfg = window.__KAMI_BROWSER_SUPABASE__ || {};
    const url = String(cfg.url || "https://bscnpilzmilzabagnypx.supabase.co").trim();
    const ref = new URL(url).hostname.split(".")[0];
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return false;

    const data = JSON.parse(raw);
    const session = data?.session || data;
    const expiresAt = session?.expires_at;
    if (typeof expiresAt === "number" && expiresAt * 1000 <= Date.now()) return false;

    return Boolean(session?.access_token);
  } catch (_e) {
    return false;
  }
};
