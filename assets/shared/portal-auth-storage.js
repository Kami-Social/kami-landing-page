/** Per-portal Supabase auth storage so ambassador and partner can use different accounts. */

export const PORTAL_AUTH_IDS = Object.freeze({
  ambassador: "ambassador",
  partner: "partner",
});

/** @param {string} supabaseUrl */
export function getSupabaseProjectRef(supabaseUrl) {
  return new URL(String(supabaseUrl || "https://bscnpilzmilzabagnypx.supabase.co").trim()).hostname.split(
    "."
  )[0];
}

/**
 * @param {"ambassador" | "partner"} portal
 * @param {string} supabaseUrl
 */
export function getPortalAuthStorageKey(portal, supabaseUrl) {
  const ref = getSupabaseProjectRef(supabaseUrl);
  return `sb-${ref}-auth-token-${portal}`;
}

/** @deprecated Default key used by password-reset and legacy single-session flows. */
export function getLegacyAuthStorageKey(supabaseUrl) {
  return `sb-${getSupabaseProjectRef(supabaseUrl)}-auth-token`;
}

/**
 * @param {string} storageKey
 * @param {string} supabaseUrl
 */
export function readStoredSessionToken(storageKey, supabaseUrl) {
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
 * @param {"ambassador" | "partner"} portal
 * @param {string} supabaseUrl
 */
export function hasLikelyPortalStoredSession(portal, supabaseUrl) {
  const key = getPortalAuthStorageKey(portal, supabaseUrl);
  return Boolean(readStoredSessionToken(key, supabaseUrl));
}
