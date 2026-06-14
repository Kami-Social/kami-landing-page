/** Client-side partner media trace (localhost or ?partner_media_debug=1). */
export function partnerMediaDebug(stage, payload) {
  if (typeof window === "undefined") return;
  const forced =
    window.location.search.includes("partner_media_debug=1") ||
    window.__KAMI_PARTNER_MEDIA_DEBUG__ === true;
  const local =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (!forced && !local) return;
  console.log("[partner-media-debug]", stage, payload);
}
