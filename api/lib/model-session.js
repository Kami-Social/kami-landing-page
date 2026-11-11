const crypto = require("crypto");

const COOKIE_NAME = "kami_model_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const TOKEN_VERSION = "v1";

function getPassword() {
  return String(process.env.MODEL_PAGE_PASSWORD || "").trim();
}

function getSessionSecret() {
  return String(process.env.MODEL_SESSION_SECRET || "").trim();
}

function getSheetUrl() {
  return String(process.env.MODEL_SHEET_URL || "").trim();
}

function isConfigured() {
  return Boolean(getPassword() && getSessionSecret() && getSheetUrl());
}

function safeEqualStrings(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    const dig = crypto.createHash("sha256").update(left).digest();
    crypto.timingSafeEqual(dig, dig);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function passwordMatches(candidate) {
  const expected = getPassword();
  if (!expected) return false;
  return safeEqualStrings(candidate, expected);
}

function signPayload(payload) {
  const secret = getSessionSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function createSessionToken(nowMs = Date.now()) {
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${exp}`;
  const sig = signPayload(payload);
  if (!sig) return null;
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expRaw, sig] = parts;
  if (version !== TOKEN_VERSION) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const payload = `${version}.${expRaw}`;
  const expected = signPayload(payload);
  if (!expected) return false;
  return safeEqualStrings(sig, expected);
}

function parseCookies(headerValue) {
  const out = {};
  if (!headerValue || typeof headerValue !== "string") return out;
  for (const part of headerValue.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch (_err) {
      out[key] = value;
    }
  }
  return out;
}

function readSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || "";
}

function isRequestSecure(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (proto === "https") return true;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  return !(host.includes("localhost") || host.startsWith("127.0.0.1"));
}

function buildSessionCookie(token, req) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isRequestSecure(req)) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie(req) {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isRequestSecure(req)) parts.push("Secure");
  return parts.join("; ");
}

function isAuthenticated(req) {
  return verifySessionToken(readSessionToken(req));
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  isConfigured,
  getSheetUrl,
  passwordMatches,
  createSessionToken,
  isAuthenticated,
  buildSessionCookie,
  clearSessionCookie,
};
