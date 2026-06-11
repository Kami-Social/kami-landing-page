const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  if (!EMAIL_RE.test(value)) return false;
  if (value.length > 254) return false;
  return true;
}

module.exports = {
  normalizeEmail,
  isValidEmail,
};
