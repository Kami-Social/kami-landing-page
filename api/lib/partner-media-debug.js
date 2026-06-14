function isPartnerMediaDebugEnabled() {
  return (
    process.env.PARTNER_MEDIA_DEBUG === "1" ||
    process.env.PARTNER_MEDIA_DEBUG === "true" ||
    (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")
  );
}

function logPartnerMedia(stage, payload) {
  if (!isPartnerMediaDebugEnabled()) return;
  console.log("[partner-media-debug]", stage, payload);
}

module.exports = { isPartnerMediaDebugEnabled, logPartnerMedia };
