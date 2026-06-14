import {
  copyText,
  escapeHtml,
  formatAgreementVersionLabel,
  formatDate,
  formatDateTime,
  formatLedgerValue,
  formatMoney,
} from "./format.js";
import {
  renderAgreementTermsSummary,
  renderProgramParametersSnapshot,
  renderProgramTermsCard,
  wireTermTips,
} from "./terms-summary.js";
import { getAgreement, getCurrentAgreementText } from "./agreements/index.js";
import { wireEditReferralCode } from "../shared/referral-code-edit.js";

const ROOT = document.getElementById("ambassador-root");
const MODAL = document.getElementById("amb-modal");
const MODAL_BODY = document.getElementById("amb-modal-body");
const MODAL_TITLE = document.getElementById("amb-modal-title");
const MODAL_CLOSE = document.getElementById("amb-modal-close");

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let supabase = null;
let agreementStatus = null;

async function loadPublicConfig() {
  const fallbackUrl = "https://bscnpilzmilzabagnypx.supabase.co";
  let url = fallbackUrl;
  let anonKey = "";
  try {
    const r = await fetch("/api/supabase-public?v=4", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (r.ok) {
      const j = await r.json();
      if (j.url && String(j.url).trim()) url = String(j.url).trim();
      if (j.anonKey && String(j.anonKey).trim()) anonKey = String(j.anonKey).trim();
    }
  } catch (_e) {
    /* fallback below */
  }
  const w = window.__KAMI_BROWSER_SUPABASE__ || {};
  if (!anonKey && w.anonKey && String(w.anonKey).trim()) anonKey = String(w.anonKey).trim();
  if (w.url && String(w.url).trim()) url = String(w.url).trim();
  return { url, anonKey };
}

async function initSupabase() {
  const cfg = await loadPublicConfig();
  if (!cfg.anonKey) {
    renderPublicShell({ misconfigured: true });
    return null;
  }
  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm"
  );
  supabase = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return supabase;
}

function setRoot(html) {
  if (!ROOT) return;
  ROOT.classList.remove("amb-boot-loading");
  ROOT.removeAttribute("aria-busy");
  ROOT.innerHTML = html;
}

function showModal(title, bodyHtml, { titleClass = "" } = {}) {
  if (!MODAL || !MODAL_BODY || !MODAL_TITLE) return;
  MODAL_TITLE.textContent = title;
  MODAL_TITLE.className = titleClass || "";
  MODAL_BODY.innerHTML = bodyHtml;
  MODAL.hidden = false;
}

function showKamiDialog({ title, message, variant = "info" }) {
  const boxClass =
    variant === "success" ? "dialog-box dialog-box--success" : variant === "error" ? "dialog-box dialog-box--error" : "dialog-box";
  showModal(
    title,
    `<div class="${boxClass}">
      <p class="dialog-message">${escapeHtml(message)}</p>
      <button type="button" class="btn dialog-ok" id="amb-dialog-ok">OK</button>
    </div>`,
    { titleClass: "dialog-title" }
  );
  document.getElementById("amb-dialog-ok")?.addEventListener("click", hideModal, { once: true });
}

function showForgotPasswordResult(code, message) {
  if (code === "email_sent") {
    showKamiDialog({
      title: "Check your email",
      message: message || "A password reset link has been sent to your email.",
      variant: "success",
    });
    return;
  }
  if (code === "email_not_found") {
    showKamiDialog({
      title: "No account found",
      message: message || "No Kami account was found for that email address.",
      variant: "error",
    });
    return;
  }
  if (code === "not_ambassador") {
    showKamiDialog({
      title: "Not an ambassador",
      message:
        message ||
        "That email is registered with Kami, but it is not linked to an approved ambassador account.",
      variant: "error",
    });
    return;
  }
  if (code === "invalid_email") {
    showKamiDialog({
      title: "Invalid email",
      message: message || "Enter a valid email address.",
      variant: "error",
    });
    return;
  }
  showKamiDialog({
    title: "Could not send reset",
    message: message || "Something went wrong. Please try again.",
    variant: "error",
  });
}

function hideModal() {
  if (MODAL) MODAL.hidden = true;
  if (MODAL_TITLE) MODAL_TITLE.className = "";
}

if (MODAL_CLOSE) MODAL_CLOSE.addEventListener("click", hideModal);
if (MODAL) {
  MODAL.addEventListener("click", (ev) => {
    if (ev.target === MODAL || ev.target.classList.contains("amb-modal-backdrop")) hideModal();
  });
}

function renderPublicShell({ misconfigured = false } = {}) {
  const misconfiguredHtml = misconfigured
    ? `<div class="msg err">This page could not load Supabase configuration. Set <strong>SUPABASE_ANON_KEY</strong> on the Vercel project or add the anon key to <code>assets/supabase-browser-public.js</code>.</div>`
    : "";

  setRoot(`
    <section class="hero-block">
      <img class="hero-logo" src="/assets/k-mark-transparent.png" alt="Kami" width="72" height="72" />
      <div class="eyebrow">Kami Ambassador Program</div>
      <h1>Help grow the Kami network.</h1>
      <p class="hero-copy">Earn rewards for introducing people to Kami and helping build stronger real-world communities.</p>
      <ul class="hero-benefits" aria-label="Program benefits">
        <li>
          <svg class="hero-benefit-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
          <span>Referral Rewards</span>
        </li>
        <li>
          <svg class="hero-benefit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>
          <span>Early Feature Access</span>
        </li>
        <li>
          <svg class="hero-benefit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
          <span>Help Shape Kami</span>
        </li>
        <li>
          <svg class="hero-benefit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Grow the Network</span>
        </li>
      </ul>
    </section>
    <section class="panel login-panel">
      <h2>Ambassador Login</h2>
      ${misconfiguredHtml}
      <form id="login-form" class="stack-form" novalidate>
        <label for="login-email">Email</label>
        <input id="login-email" type="email" autocomplete="email" required />
        <label for="login-password">Password</label>
        <input id="login-password" type="password" autocomplete="current-password" required />
        <div id="login-error" class="msg err" hidden role="alert"></div>
        <button class="btn" type="submit" id="login-submit">Log in</button>
      </form>
      <p class="helper-row"><button type="button" class="text-link" id="forgot-password">Forgot password?</button></p>
      <p class="helper-row">Haven't created a Kami account yet? <a href="/#download">Download Kami</a> and create your account first.</p>
      <p class="helper-row">Questions? Contact <a href="mailto:ambassadors@kamisocial.com">ambassadors@kamisocial.com</a></p>
    </section>
  `);

  wirePublicForm();
}

function wirePublicForm() {
  const form = document.getElementById("login-form");
  const err = document.getElementById("login-error");
  const forgot = document.getElementById("forgot-password");
  if (!form || !supabase) return;

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (err) err.hidden = true;
    const email = document.getElementById("login-email")?.value.trim() || "";
    const password = document.getElementById("login-password")?.value || "";
    const submit = document.getElementById("login-submit");
    if (submit) submit.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (submit) submit.disabled = false;
    if (error) {
      if (err) {
        err.textContent = error.message || "Could not sign in.";
        err.hidden = false;
      }
      return;
    }
    await bootstrapSession();
  });

  if (forgot) {
    forgot.addEventListener("click", async () => {
      const email = document.getElementById("login-email")?.value.trim() || "";
      if (!email) {
        showKamiDialog({
          title: "Email required",
          message: "Enter your email address in the field above, then click Forgot password.",
          variant: "error",
        });
        return;
      }

      forgot.disabled = true;

      const { data: check, error: checkError } = await supabase.rpc(
        "kami_ambassador_forgot_password_check",
        { p_email: email }
      );

      if (checkError) {
        showForgotPasswordResult("lookup_failed", checkError.message || "Something went wrong. Please try again.");
        forgot.disabled = false;
        return;
      }

      if (!check?.ok) {
        showForgotPasswordResult(check?.code, check?.message);
        forgot.disabled = false;
        return;
      }

      const resetEmail = String(check.email || email).trim();
      const redirectTo = `${window.location.origin}/password-reset`;

      let sent = false;
      try {
        const response = await fetch("/api/ambassador/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: resetEmail }),
        });
        let payload = {};
        try {
          payload = await response.json();
        } catch (_e) {
          payload = {};
        }
        if (response.ok && payload.ok && payload.code === "email_sent") {
          sent = true;
          showForgotPasswordResult("email_sent", payload.message);
        } else if (payload.code) {
          showForgotPasswordResult(payload.code, payload.message);
          sent = true;
        }
      } catch (_e) {
        /* fall through to client reset */
      }

      if (!sent) {
        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo });
        if (error) {
          showForgotPasswordResult("reset_failed", error.message || "Could not send the reset email. Please try again.");
        } else {
          showForgotPasswordResult("email_sent", "A password reset link has been sent to your email.");
        }
      }

      forgot.disabled = false;
    });
  }
}

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || `RPC ${name} failed`);
  return data;
}

function formatAcceptError(payload, fallback = "Could not save agreement acceptance.") {
  const code = payload?.error || payload?.code;
  const friendly = {
    not_authenticated: "Session expired. Please log in again.",
    invalid_session: "Session expired. Please log in again.",
    not_configured: "Agreement acceptance is temporarily unavailable. Please try again later.",
    agreement_version_mismatch: "The agreement was updated. Refresh the page and try again.",
    program_not_active: "Your ambassador account is not active.",
    profile_not_found: "Ambassador profile not found.",
    not_ambassador: "This account is not registered as an ambassador.",
    missing_fields: "Missing agreement data. Refresh the page and try again.",
    invalid_agreement_snapshot: "Agreement text could not be saved. Refresh the page and try again.",
    accept_failed: fallback,
  };
  return payload?.message || friendly[code] || code || fallback;
}

async function acceptAgreementViaRpc(version, agreementText) {
  const { data, error } = await supabase.rpc("accept_my_ambassador_agreement", {
    p_agreement_version: version,
    p_agreement_snapshot: agreementText,
    p_program_parameters_snapshot: agreementStatus.program_parameters,
    p_ip_address: null,
    p_user_agent: String(navigator.userAgent || "").slice(0, 500),
  });
  if (error) {
    return { ok: false, error: "rpc_error", message: error.message };
  }
  return data || { ok: false, error: "accept_failed" };
}

async function fetchAgreementStatus() {
  agreementStatus = await rpc("get_my_ambassador_agreement_status");
  return agreementStatus;
}

async function bootstrapSession() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    renderPublicShell();
    return;
  }
  try {
    await fetchAgreementStatus();
  } catch (error) {
    setRoot(`
      <section class="panel"><h2>Dashboard unavailable</h2>
      <p class="muted">We couldn't load ambassador data. The backend RPCs may not be deployed yet.</p>
      <p class="muted">${escapeHtml(error.message)}</p>
      <button class="btn secondary" type="button" id="logout-btn">Log out</button></section>`);
    document.getElementById("logout-btn")?.addEventListener("click", logout);
    return;
  }

  const state = agreementStatus?.state;
  if (state === "not_ambassador") renderNotAmbassador();
  else if (state === "agreement_required") renderAgreementFlow();
  else if (state === "dashboard") await renderDashboard();
  else renderPublicShell();
}

function renderAgreementUserChip(profile) {
  const name = String(profile?.display_name || profile?.displayName || "Ambassador").trim() || "Ambassador";
  const avatarUrl = profile?.avatar_url || profile?.avatarUrl;
  const avatar = avatarUrl
    ? `<img class="agreement-user-avatar" src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="agreement-user-avatar agreement-user-avatar-fallback" aria-hidden="true">${escapeHtml(name[0] || "K")}</div>`;
  return `<div class="agreement-user-chip">${avatar}<span class="agreement-user-name">${escapeHtml(name)}</span></div>`;
}

function renderNotAmbassador() {
  setRoot(`
    <section class="panel centered-panel">
      <h2>Ambassadors only</h2>
      <p>This page is for approved Kami ambassadors only. If you're interested in participating, please contact <a href="mailto:ambassadors@kamisocial.com">ambassadors@kamisocial.com</a>.</p>
      <button class="btn secondary" type="button" id="logout-btn">Log out</button>
    </section>
  `);
  document.getElementById("logout-btn")?.addEventListener("click", logout);
}

function renderAgreementFlow() {
  const version = agreementStatus.current_agreement_version || "ambassador_terms_v1_1";
  const agreement = getAgreement(version);
  const agreementText = agreement?.text || getCurrentAgreementText(version);
  const params = agreementStatus.program_parameters;
  const profile = agreementStatus.profile || {};

  setRoot(`
    <section class="panel agreement-panel">
      <div class="agreement-panel-top">
        <div class="agreement-panel-head">
          <h2 class="agreement-page-title">Accept Ambassador Agreement</h2>
          <p class="agreement-intro">Review your current ambassador terms and accept the agreement to continue.</p>
        </div>
        ${renderAgreementUserChip(profile)}
      </div>
      ${renderAgreementTermsSummary(params, profile)}
    </section>
    <section class="panel agreement-doc-panel">
      <h3>${escapeHtml(agreement?.title || "Ambassador Program Agreement")}</h3>
      <div class="agreement-scroll">${escapeHtml(agreementText).replace(/\n/g, "<br>")}</div>
      <label class="check-row"><input type="checkbox" id="agree-check" /> I have read and agree to the Kami Ambassador Program Agreement.</label>
      <div id="accept-error" class="msg err" hidden role="alert"></div>
      <div class="agreement-actions">
        <button class="btn" type="button" id="accept-btn" disabled>Accept and Continue</button>
        <button class="btn secondary" type="button" id="logout-btn">Log out</button>
      </div>
    </section>
  `);

  const check = document.getElementById("agree-check");
  const acceptBtn = document.getElementById("accept-btn");
  check?.addEventListener("change", () => {
    if (acceptBtn) acceptBtn.disabled = !check.checked;
  });

  if (ROOT) wireTermTips(ROOT);

  acceptBtn?.addEventListener("click", acceptAgreement);
  document.getElementById("logout-btn")?.addEventListener("click", logout);
}

async function acceptAgreement() {
  const version = agreementStatus.current_agreement_version || "ambassador_terms_v1_1";
  const agreementText = getCurrentAgreementText(version);
  const err = document.getElementById("accept-error");
  const btn = document.getElementById("accept-btn");
  if (btn) btn.disabled = true;
  if (err) err.hidden = true;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    if (err) {
      err.textContent = "Session expired. Please log in again.";
      err.hidden = false;
    }
    if (btn) btn.disabled = false;
    return;
  }

  const response = await fetch("/api/ambassador/accept-agreement", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      agreement_version: version,
      agreement_snapshot: agreementText,
      program_parameters_snapshot: agreementStatus.program_parameters,
    }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (_e) {}

  let result = response.ok && payload.ok ? payload : null;

  if (!result) {
    result = await acceptAgreementViaRpc(version, agreementText);
  }

  if (!result?.ok) {
    if (err) {
      err.textContent = formatAcceptError(result || payload);
      err.hidden = false;
    }
    if (btn) btn.disabled = false;
    return;
  }

  await bootstrapSession();
}

async function renderDashboard() {
  const [dashboard, referrals, payouts, ledger, history] = await Promise.all([
    rpc("get_my_ambassador_dashboard"),
    rpc("get_my_ambassador_referrals"),
    rpc("get_my_ambassador_payout_history"),
    rpc("get_my_ambassador_change_ledger"),
    rpc("get_my_ambassador_agreement_history"),
  ]);

  if (!dashboard?.ok) {
    if (dashboard?.error === "dashboard_locked") {
      agreementStatus = dashboard.agreement_status;
      renderAgreementFlow();
      return;
    }
    throw new Error(dashboard?.error || "dashboard_load_failed");
  }

  const h = dashboard.header || {};
  const referral = dashboard.referral || {};
  const m = dashboard.metrics || {};
  const avatar = h.avatar_url
    ? `<img class="avatar" src="${escapeHtml(h.avatar_url)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="avatar avatar-fallback">${escapeHtml((h.display_name || "K")[0])}</div>`;

  const metricsHtml = [
    ["Current Month Qualified Referrals", String(m.current_month_qualified_referrals ?? 0)],
    ["Pending Earnings", formatMoney(m.pending_earnings_cents)],
    ["Approved Earnings", formatMoney(m.approved_earnings_cents)],
    ["Lifetime Earnings", formatMoney(m.lifetime_earnings_cents)],
    ["Current Tier Cap", m.monthly_earnings_limit_cents != null ? formatMoney(m.monthly_earnings_limit_cents) : "—"],
    ["Remaining Before Tier Cap", m.remaining_eligible_earnings_cents != null ? formatMoney(m.remaining_eligible_earnings_cents) : "—"],
    ["Paid This Month", formatMoney(m.paid_this_month_cents)],
    ["Total Paid Lifetime", formatMoney(m.total_paid_lifetime_cents)],
  ]
    .map(
      ([label, value]) =>
        `<article class="metric-card"><p class="metric-label">${escapeHtml(label)}</p><p class="metric-value">${escapeHtml(value)}</p></article>`
    )
    .join("");

  const referralRows = (referrals?.referrals || [])
    .map((row) => {
      const avatarCell = row.avatar_url
        ? `<img class="table-avatar" src="${escapeHtml(row.avatar_url)}" alt="" referrerpolicy="no-referrer" />`
        : `<span class="table-avatar table-avatar-fallback">${escapeHtml((row.name || "?")[0])}</span>`;
      return `<tr>
        <td>${formatDate(row.date)}</td>
        <td><span class="name-cell">${avatarCell}<span>${escapeHtml(row.name)}</span></span></td>
        <td>${escapeHtml(row.handle || "—")}</td>
        <td><span class="status-pill">${escapeHtml(row.qualification_status)}</span></td>
        <td>${escapeHtml(row.applied_rate || "—")}</td>
        <td>${formatMoney(row.earnings_cents)}</td>
        <td class="muted-col">${escapeHtml(row.reason || "")}</td>
      </tr>`;
    })
    .join("");

  const referralsTable =
    referralRows ||
    `<tr><td colspan="7" class="empty-cell">No referrals yet. Share your referral link to start building your Kami network.</td></tr>`;

  const payoutRows = (payouts?.payouts || [])
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.period || "—")}</td>
      <td>${row.qualified_referrals ?? "—"}</td>
      <td>${formatMoney(row.gross_earnings_cents)}</td>
      <td>${formatMoney(row.adjustments_cents)}</td>
      <td>${formatMoney(row.approved_amount_cents)}</td>
      <td>${formatMoney(row.paid_amount_cents)}</td>
      <td>${formatDate(row.paid_date)}</td>
      <td>${escapeHtml(row.status || "—")}</td>
      <td>${escapeHtml(row.notes || "")}</td>
    </tr>`
    )
    .join("");

  const payoutTable =
    payoutRows ||
    `<tr><td colspan="9" class="empty-cell">No payout records yet.</td></tr>`;

  const referralLink = String(referral.link || "").trim();
  const referralLinkHtml = referralLink
    ? `<a class="copy-value copy-value-link" id="ref-link" href="${escapeHtml(referralLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(referralLink)}</a>`
    : `<p class="copy-value copy-value-link" id="ref-link">—</p>`;

  const ledgerRows = (ledger?.ledger || [])
    .map(
      (row) => `<tr>
      <td>${formatDateTime(row.date)}</td>
      <td>${escapeHtml(row.change_type || "—")}</td>
      <td>${escapeHtml(formatLedgerValue(row.previous_value))}</td>
      <td>${escapeHtml(formatLedgerValue(row.new_value))}</td>
      <td>${escapeHtml(row.notes || "")}</td>
    </tr>`
    )
    .join("");

  const ledgerTable =
    ledgerRows || `<tr><td colspan="5" class="empty-cell">No change history yet.</td></tr>`;

  const currentAgreement = history?.current_agreement;
  const historical = history?.historical_agreements || [];

  const currentAgreementHtml = currentAgreement
    ? `<div class="history-card">
        <p><strong>Version:</strong> ${escapeHtml(formatAgreementVersionLabel(currentAgreement.version))}</p>
        <p><strong>Accepted:</strong> ${formatDateTime(currentAgreement.accepted_at)}</p>
        <button type="button" class="btn secondary btn-sm" data-view-agreement="current">View Agreement</button>
        <button type="button" class="btn secondary btn-sm" data-view-params="current">View Program Parameters Snapshot</button>
      </div>`
    : `<p class="muted">No current agreement acceptance on file.</p>`;

  const historicalHtml = historical.length
    ? historical
        .map(
          (item, idx) => `<div class="history-card">
          <p><strong>Version:</strong> ${escapeHtml(formatAgreementVersionLabel(item.version))}</p>
          <p><strong>Accepted:</strong> ${formatDateTime(item.accepted_at)}</p>
          <button type="button" class="btn secondary btn-sm" data-view-agreement="hist-${idx}">View Agreement Snapshot</button>
          <button type="button" class="btn secondary btn-sm" data-view-params="hist-${idx}">View Program Parameters Snapshot</button>
        </div>`
        )
        .join("")
    : `<p class="muted">No historical agreements.</p>`;

  setRoot(`
    <section class="panel dashboard-header">
      <div class="dashboard-header-main">
        <div class="eyebrow dashboard-eyebrow">Ambassador Dashboard</div>
        <div class="header-main">
          ${avatar}
          <div class="header-copy">
            <h1>${escapeHtml(h.display_name || "Ambassador")}</h1>
            <p class="muted">${escapeHtml(h.handle ? `@${h.handle}` : "")}${h.email ? ` · ${escapeHtml(h.email)}` : ""}</p>
          </div>
        </div>
      </div>
      <span class="status-badge">${escapeHtml(h.status_label || "Ambassador")}</span>
    </section>

    <section class="panel">
      <h2>Referral Link</h2>
      <div class="copy-grid">
        <div>
          <label>Referral Code</label>
          <p class="copy-value" id="ref-code">${escapeHtml(referral.code || "—")}</p>
          <div class="btn-row">
            <button type="button" class="btn secondary" id="copy-code">Copy Code</button>
            <button type="button" class="btn secondary" id="edit-code">Edit Code</button>
          </div>
        </div>
        <div>
          <label>Referral Link</label>
          ${referralLinkHtml}
          <div class="btn-row">
            <button type="button" class="btn secondary" id="copy-link">Copy Link</button>
          </div>
        </div>
      </div>
      <p class="helper-row">Share your referral link with people you think would enjoy Kami. Qualified Referrals are determined by the current qualification criteria shown below.</p>
    </section>

    <section class="panel"><h2>Metrics</h2><div class="metrics-grid">${metricsHtml}</div></section>
    <section class="panel"><h2>Current Program Terms</h2>${renderProgramTermsCard(dashboard.program_parameters)}</section>

    <section class="panel table-panel">
      <h2>Referrals</h2>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Name</th><th>Handle</th><th>Status</th><th>Rate/Tier</th><th>Earnings</th><th>Notes</th></tr></thead><tbody>${referralsTable}</tbody></table></div>
    </section>

    <section class="panel table-panel">
      <h2>Payout History</h2>
      <div class="table-wrap"><table><thead><tr><th>Period</th><th>Qualified</th><th>Gross</th><th>Adjustments</th><th>Approved</th><th>Paid</th><th>Paid Date</th><th>Status</th><th>Notes</th></tr></thead><tbody>${payoutTable}</tbody></table></div>
    </section>

    <section class="panel table-panel">
      <h2>Change Ledger</h2>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Change Type</th><th>Previous</th><th>New</th><th>Notes</th></tr></thead><tbody>${ledgerTable}</tbody></table></div>
    </section>

    <section class="panel">
      <h2>Agreement History</h2>
      <h3>Current Agreement</h3>
      ${currentAgreementHtml}
      <details class="history-collapsible">
        <summary class="history-collapsible-summary">Historical Agreements${historical.length ? ` (${historical.length})` : ""}</summary>
        ${historicalHtml}
      </details>
    </section>

    <section class="panel">
      <h2>Support</h2>
      <p>Questions or issues? Contact <a href="mailto:ambassadors@kamisocial.com">ambassadors@kamisocial.com</a>.</p>
    </section>

    <section class="panel danger-panel">
      <h2>Leave Ambassador Program</h2>
      <p class="muted">You will stop earning compensation for future referrals. Previously approved earnings remain eligible for payout under the Program Agreement.</p>
      <button type="button" class="btn secondary btn-danger-outline" id="leave-open">Leave Ambassador Program</button>
    </section>

    <section class="panel centered-panel">
      <button type="button" class="btn secondary" id="logout-btn">Log out</button>
    </section>
  `);

  document.getElementById("copy-code")?.addEventListener("click", (ev) =>
    copyText(referral.code, ev.currentTarget)
  );
  document.getElementById("copy-link")?.addEventListener("click", (ev) =>
    copyText(referral.link, ev.currentTarget)
  );
  wireEditReferralCode({
    rpc,
    showModal,
    hideModal,
    currentCode: referral.code,
    onUpdated: ({ code, link }) => {
      referral.code = code;
      referral.link = link;
    },
  });
  document.getElementById("logout-btn")?.addEventListener("click", logout);

  if (currentAgreement) {
    document.querySelector('[data-view-agreement="current"]')?.addEventListener("click", () =>
      showModal(
        formatAgreementVersionLabel(currentAgreement.version),
        `<pre class="modal-pre">${escapeHtml(currentAgreement.agreement_snapshot)}</pre>`
      )
    );
    document.querySelector('[data-view-params="current"]')?.addEventListener("click", () =>
      showModal(
        "Program Parameters Snapshot",
        renderProgramParametersSnapshot(currentAgreement.program_parameters_snapshot, {
          payout_threshold_display: currentAgreement.payout_threshold_display,
          tier_cap_display: currentAgreement.tier_cap_display,
        })
      )
    );
  }

  historical.forEach((item, idx) => {
    document.querySelector(`[data-view-agreement="hist-${idx}"]`)?.addEventListener("click", () =>
      showModal(
        formatAgreementVersionLabel(item.version),
        `<pre class="modal-pre">${escapeHtml(item.agreement_snapshot)}</pre>`
      )
    );
    document.querySelector(`[data-view-params="hist-${idx}"]`)?.addEventListener("click", () =>
      showModal(
        `Parameters ${formatAgreementVersionLabel(item.version)}`,
        renderProgramParametersSnapshot(item.program_parameters_snapshot, {
          payout_threshold_display: item.payout_threshold_display,
          tier_cap_display: item.tier_cap_display,
        })
      )
    );
  });

  wireLeaveModal(history);
}

function wireLeaveModal() {
  const open = document.getElementById("leave-open");
  open?.addEventListener("click", () => {
    showModal(
      "Leave Ambassador Program",
      `<p>Are you sure you want to leave the Kami Ambassador Program?</p>
       <p class="muted">You will stop earning compensation for future referrals. Previously approved earnings will remain eligible for payout under the Program Agreement.</p>
       <label for="leave-confirm">Type <strong>LEAVE</strong> to confirm</label>
       <input id="leave-confirm" type="text" autocomplete="off" />
       <div id="leave-error" class="msg err" hidden role="alert"></div>
       <button type="button" class="btn" id="leave-submit" disabled>Leave Ambassador Program</button>`
    );

    const input = document.getElementById("leave-confirm");
    const submit = document.getElementById("leave-submit");
    input?.addEventListener("input", () => {
      if (submit) submit.disabled = input.value.trim() !== "LEAVE";
    });
    submit?.addEventListener("click", submitLeave);
  });
}

async function submitLeave() {
  const err = document.getElementById("leave-error");
  const submit = document.getElementById("leave-submit");
  const confirmation = document.getElementById("leave-confirm")?.value.trim() || "";
  if (submit) submit.disabled = true;
  if (err) err.hidden = true;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch("/api/ambassador/terminate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
    body: JSON.stringify({ confirmation }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (_e) {}

  if (!response.ok || !payload.ok) {
    if (err) {
      err.textContent = payload.error || "Could not leave the program.";
      err.hidden = false;
    }
    if (submit) submit.disabled = false;
    return;
  }

  hideModal();
  await bootstrapSession();
}

async function logout() {
  if (supabase) await supabase.auth.signOut();
  agreementStatus = null;
  renderPublicShell();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

(async function main() {
  const client = await initSupabase();
  if (!client) return;

  const { data } = await client.auth.getSession();
  if (data?.session) await bootstrapSession();
  else renderPublicShell();

  client.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    if (!session) {
      agreementStatus = null;
      renderPublicShell();
    } else if (event === "SIGNED_IN") {
      bootstrapSession();
    }
  });
})();
