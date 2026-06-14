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

function kamiSupabaseProjectRef() {
  const cfg = window.__KAMI_BROWSER_SUPABASE__ || {};
  const url = String(cfg.url || "https://bscnpilzmilzabagnypx.supabase.co").trim();
  return new URL(url).hostname.split(".")[0];
}

/** @param {"ambassador" | "partner"} portal */
window.kamiPortalAuthStorageKey = function kamiPortalAuthStorageKey(portal) {
  return `sb-${kamiSupabaseProjectRef()}-auth-token-${portal}`;
};

window.kamiLegacyAuthStorageKey = function kamiLegacyAuthStorageKey() {
  return `sb-${kamiSupabaseProjectRef()}-auth-token`;
};

function kamiReadStoredSessionToken(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const data = JSON.parse(raw);
    const session = data?.session || data;
    const expiresAt = session?.expires_at;
    if (typeof expiresAt === "number" && expiresAt * 1000 <= Date.now()) return null;

    return session?.access_token || null;
  } catch (_e) {
    return null;
  }
}

/**
 * Sync hint for boot UI — avoids flashing the portal loader for logged-out visitors.
 * Pass "ambassador" or "partner" for portal-specific sessions.
 * Omit portal to check the legacy shared key (password-reset page).
 */
window.kamiHasLikelyStoredSession = function kamiHasLikelyStoredSession(portal) {
  const key =
    portal === "ambassador" || portal === "partner"
      ? window.kamiPortalAuthStorageKey(portal)
      : window.kamiLegacyAuthStorageKey();
  return Boolean(kamiReadStoredSessionToken(key));
};
