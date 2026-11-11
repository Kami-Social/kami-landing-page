const { parseJsonBody, getClientIp, sendJson } = require("./lib/request");
const { isRateLimited } = require("./lib/rate-limit");
const {
  isConfigured,
  getSheetUrl,
  passwordMatches,
  createSessionToken,
  isAuthenticated,
  buildSessionCookie,
} = require("./lib/model-session");

const MODEL_INSTRUCTION =
  "Switch the operating strategy selector to explore different scenarios. Please leave all other cells unchanged.";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendHtml(res, statusCode, html, extraHeaders = {}) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  res.end(html);
}

function pageShell({ title, body, errorMessage = "" }) {
  const errorBlock = errorMessage
    ? `<p class="password-error" role="alert">${escapeHtml(errorMessage)}</p>`
    : `<p class="password-error" aria-live="polite"></p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/assets/k-mark-transparent.png" type="image/png" sizes="any" />
  <style>
    :root {
      --bg:#050814; --text:#f7f3ff; --muted:#a9b0c8;
      --purple:#7c4dff; --purple2:#a56bff; --blue:#4b7cff;
      --line:rgba(255,255,255,.10); --shadow:0 24px 80px rgba(0,0,0,.45);
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      min-height:100vh;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      color:var(--text);
      background:
        radial-gradient(circle at 50% 8%,rgba(104,75,255,.24),transparent 34%),
        radial-gradient(circle at 12% 25%,rgba(36,107,255,.12),transparent 24%),
        linear-gradient(180deg,#040711 0%,#071020 48%,#050814 100%);
    }
    a{color:inherit;text-decoration:none}
    nav{
      position:sticky;top:0;z-index:50;
      backdrop-filter:blur(18px);
      background:rgba(5,8,20,.78);
      border-bottom:1px solid rgba(255,255,255,.06);
    }
    .nav-inner{
      width:min(1180px,calc(100% - 48px));
      margin:0 auto;
      height:76px;
      display:flex;
      align-items:center;
      justify-content:space-between;
    }
    .brand-logo{display:inline-flex;align-items:center;line-height:1}
    .wordmark-img{
      display:block;width:132px;height:auto;object-fit:contain;
      filter:drop-shadow(0 0 18px rgba(124,77,255,.22));
    }
    .nav-home{
      color:#dfe4fb;font-weight:650;font-size:14px;
    }
    .nav-home:hover{color:#fff}
    main{
      width:min(720px,calc(100% - 48px));
      margin:0 auto;
      padding:48px 0 72px;
    }
    .panel{
      border:1px solid rgba(188,158,255,.24);
      border-radius:28px;
      background:linear-gradient(180deg,rgba(19,25,48,.94),rgba(8,13,28,.92));
      box-shadow:var(--shadow),0 0 90px rgba(124,77,255,.24);
      padding:38px;
      text-align:center;
      position:relative;
      overflow:hidden;
    }
    .panel:before{
      content:"";
      position:absolute;inset:-1px;
      background:radial-gradient(circle at 50% 0%,rgba(165,107,255,.20),transparent 36%);
      pointer-events:none;
    }
    .panel>*{position:relative;z-index:1}
    .access-pill{
      display:inline-flex;align-items:center;gap:10px;
      color:#efeaff;
      background:linear-gradient(135deg,rgba(124,77,255,.26),rgba(49,94,255,.12));
      border:1px solid rgba(188,158,255,.36);
      border-radius:999px;
      padding:12px 20px;
      font-size:15px;font-weight:900;
      box-shadow:0 0 36px rgba(124,77,255,.22),inset 0 1px 0 rgba(255,255,255,.12);
    }
    .access-pill svg{width:18px;height:18px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
    h1{
      font-size:clamp(34px,6vw,48px);
      line-height:.96;
      letter-spacing:-2px;
      margin:24px 0 12px;
      background:linear-gradient(135deg,#d9ccff 0%,#b575ff 42%,#8b5cff 78%,#7c4dff 100%);
      -webkit-background-clip:text;
      background-clip:text;
      color:transparent;
    }
    .lead{
      color:#cbd1e7;
      font-size:17px;
      line-height:1.55;
      margin:0 0 26px;
    }
    .instruction{
      margin:0 0 28px;
      padding:16px 18px;
      border-radius:16px;
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.035);
      color:#dce3fb;
      font-size:15px;
      line-height:1.55;
      text-align:left;
    }
    form{display:grid;gap:14px}
    label{
      display:block;
      text-align:left;
      font-size:13px;
      font-weight:750;
      color:#dfe4fb;
      margin:0 0 2px;
    }
    input[type="password"]{
      width:100%;
      border:1px solid rgba(188,158,255,.34);
      background:rgba(255,255,255,.055);
      color:#fff;
      border-radius:14px;
      padding:17px 18px;
      font-size:17px;
      outline:none;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
    }
    input[type="password"]:focus{
      border-color:rgba(165,107,255,.74);
      box-shadow:0 0 0 4px rgba(124,77,255,.16);
    }
    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:10px;
      width:100%;
      border:1px solid rgba(255,255,255,.14);
      border-radius:12px;
      padding:16px 22px;
      background:linear-gradient(135deg,var(--purple),#315eff);
      color:#fff;
      font-weight:850;
      font-size:17px;
      box-shadow:0 12px 32px rgba(87,73,255,.28);
      cursor:pointer;
      text-decoration:none;
      transition:transform .18s ease,filter .18s ease;
    }
    .btn:hover{transform:translateY(-1px);filter:brightness(1.05)}
    .btn svg{width:18px;height:18px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
    .password-error{
      min-height:20px;
      margin:0;
      color:#ffb4b4;
      font-size:14px;
      line-height:1.35;
    }
    .note{
      margin:22px 0 0;
      color:var(--muted);
      font-size:13px;
      line-height:1.45;
    }
    @media (max-width:640px){
      .nav-inner{width:min(100% - 32px,1180px);height:72px}
      .wordmark-img{width:122px}
      main{width:min(100% - 32px,720px);padding:32px 0 56px}
      .panel{padding:26px;border-radius:24px}
      h1{font-size:36px;letter-spacing:-1.6px}
      .lead{font-size:16px}
    }
  </style>
</head>
<body>
  <nav>
    <div class="nav-inner">
      <a class="brand-logo" href="/" aria-label="Kami home">
        <img class="wordmark-img" src="/assets/logo-wordmark.png" alt="Kami" />
      </a>
      <a class="nav-home" href="/">Home</a>
    </div>
  </nav>
  <main>
    <section class="panel">
      ${body.replace("{{ERROR}}", errorBlock)}
    </section>
  </main>
</body>
</html>`;
}

function renderLoginPage(errorMessage = "") {
  const body = `
      <div class="access-pill">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        Private Access
      </div>
      <h1>Financial Model</h1>
      <p class="lead">Enter the password to continue.</p>
      <form method="POST" action="/model" autocomplete="current-password">
        <div>
          <label for="password">Password</label>
          <input id="password" name="password" type="password" required autofocus autocomplete="current-password" />
        </div>
        <button class="btn" type="submit">Unlock</button>
        {{ERROR}}
      </form>`;

  return pageShell({
    title: "Kami | Financial Model",
    body,
    errorMessage,
  });
}

function renderUnlockedPage(sheetUrl) {
  const body = `
      <div class="access-pill">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-8 8.5C7.5 20.5 4 18 4 13V6l8-3 8 3v7Z"/><path d="m9 12 2 2 4-5"/></svg>
        Authenticated
      </div>
      <h1>Kami Financial Model</h1>
      <p class="lead">Explore Kami’s five-year financial model below.</p>
      <p class="instruction">${escapeHtml(MODEL_INSTRUCTION)}</p>
      <a class="btn" href="${escapeHtml(sheetUrl)}" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
        Open financial model
      </a>
      <p class="note">Projections reflect planning assumptions, not actual results or guarantees of future performance.</p>`;

  return pageShell({
    title: "Kami | Financial Model",
    body,
  });
}

function renderUnavailablePage() {
  const body = `
      <div class="access-pill">Private Access</div>
      <h1>Financial Model</h1>
      <p class="lead">This page is temporarily unavailable. Please try again later.</p>`;

  return pageShell({
    title: "Kami | Financial Model",
    body,
  });
}

function readPasswordFromBody(body) {
  if (!body || typeof body !== "object") return "";
  return String(body.password || "").trim();
}

async function parseBody(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/json")) {
    return parseJsonBody(req);
  }

  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw =
    typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : await new Promise((resolve, reject) => {
            let data = "";
            req.on("data", (chunk) => {
              data += chunk;
              if (data.length > 8192) reject(new Error("body_too_large"));
            });
            req.on("end", () => resolve(data));
            req.on("error", reject);
          });

  if (!raw) return {};
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }
  try {
    return JSON.parse(raw);
  } catch (_err) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }
}

function wantsJson(req) {
  const accept = String(req.headers.accept || "").toLowerCase();
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  return accept.includes("application/json") || contentType.includes("application/json");
}

module.exports = async function modelPage(req, res) {
  if (!isConfigured()) {
    if (req.method === "POST" && wantsJson(req)) {
      sendJson(res, 503, {
        ok: false,
        code: "not_configured",
        message: "Model access is not configured.",
      });
      return;
    }
    sendHtml(res, 503, renderUnavailablePage());
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    if (isAuthenticated(req)) {
      sendHtml(res, 200, renderUnlockedPage(getSheetUrl()));
      return;
    }
    sendHtml(res, 200, renderLoginPage());
    return;
  }

  if (req.method !== "POST") {
    if (wantsJson(req)) {
      sendJson(res, 405, { ok: false, code: "method_not_allowed" });
      return;
    }
    sendHtml(res, 405, renderLoginPage("Method not allowed."));
    return;
  }

  const ip = getClientIp(req);
  if (isRateLimited(`model-auth:${ip}`)) {
    if (wantsJson(req)) {
      sendJson(res, 429, {
        ok: false,
        code: "rate_limited",
        message: "Too many attempts. Please wait a few minutes and try again.",
      });
      return;
    }
    sendHtml(res, 429, renderLoginPage("Too many attempts. Please wait a few minutes and try again."));
    return;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (_err) {
    if (wantsJson(req)) {
      sendJson(res, 400, { ok: false, code: "invalid_body", message: "Invalid request." });
      return;
    }
    sendHtml(res, 400, renderLoginPage("Invalid request."));
    return;
  }

  const password = readPasswordFromBody(body);
  if (!password || !passwordMatches(password)) {
    if (wantsJson(req)) {
      sendJson(res, 401, {
        ok: false,
        code: "invalid_password",
        message: "Incorrect password.",
      });
      return;
    }
    sendHtml(res, 401, renderLoginPage("Incorrect password."));
    return;
  }

  const token = createSessionToken();
  if (!token) {
    if (wantsJson(req)) {
      sendJson(res, 503, {
        ok: false,
        code: "not_configured",
        message: "Model access is not configured.",
      });
      return;
    }
    sendHtml(res, 503, renderUnavailablePage());
    return;
  }

  const cookie = buildSessionCookie(token, req);

  if (wantsJson(req)) {
    res.setHeader("Set-Cookie", cookie);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendHtml(res, 200, renderUnlockedPage(getSheetUrl()), {
    "Set-Cookie": cookie,
  });
};
