/**
 * Ambassador portal app. Logged-out landing page lives in public-landing.js.
 * Previous public shell backup: assets/ambassador/archive/public-shell-v20260614.backup.js
 * Previous dashboard backup: assets/ambassador/archive/dashboard-pre-refresh-v20260617.backup.js
 */
import {
  copyText,
  escapeHtml,
  formatDateTime,
  formatLedgerValue,
} from "./format.js";
import { renderAgreementTermsSummary, wireTermTips } from "./terms-summary.js";
import {
  buildHeroMeta,
  formatCanonicalReferralLink,
  formatCopyReferralLink,
  renderAmbassadorDashboardLayout,
  wireAgreementHistory,
} from "./dashboard-sections.js";
import { getAgreement, getCurrentAgreementText } from "./agreements/index.js";
import { wireEditReferralCode } from "../shared/referral-code-edit.js";
import {
  getPortalAuthStorageKey,
  hasLikelyPortalStoredSession,
  PORTAL_AUTH_IDS,
} from "../shared/portal-auth-storage.js";
import {
  renderPublicLandingHTML,
  wirePublicLanding,
  clearPublicLandingMode,
  syncSiteFooter,
} from "./public-landing.js";

const ROOT = document.getElementById("ambassador-root");
const MODAL = document.getElementById("amb-modal");
const MODAL_BODY = document.getElementById("amb-modal-body");
const MODAL_TITLE = document.getElementById("amb-modal-title");
const MODAL_CLOSE = document.getElementById("amb-modal-close");

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let supabase = null;
let agreementStatus = null;

/** @param {boolean} loggedIn */
function syncAmbassadorNav(loggedIn = false) {
  const homeLink = document.querySelector(".ambassador-nav-home");
  const marketingLinks = document.querySelectorAll(".ambassador-nav-marketing");
  const navLogout = document.getElementById("ambassador-nav-logout");

  if (loggedIn) {
    if (homeLink) homeLink.hidden = false;
    marketingLinks.forEach((link) => {
      link.hidden = true;
    });
    if (navLogout) {
      navLogout.hidden = false;
      navLogout.removeAttribute("aria-hidden");
    }
    return;
  }

  if (homeLink) homeLink.hidden = true;
  if (navLogout) {
    navLogout.hidden = true;
    navLogout.setAttribute("aria-hidden", "true");
  }
  marketingLinks.forEach((link) => {
    link.hidden = false;
  });
}

function resetPortalViewport() {
  if (window.location.hash) {
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState({}, "", url);
  }
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function setRoot(html, { publicLanding = false } = {}) {
  if (!ROOT) return;
  const leavingPublicLanding =
    !publicLanding &&
    (document.body.classList.contains("ambassador-is-public") || Boolean(ROOT.querySelector(".ambassador-land")));

  ROOT.classList.remove("amb-boot-loading");
  ROOT.removeAttribute("aria-busy");
  if (publicLanding) {
    document.body.classList.add("ambassador-is-public");
  } else {
    clearPublicLandingMode();
  }
  ROOT.innerHTML = html;

  if (leavingPublicLanding) {
    resetPortalViewport();
  }
}

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
      storageKey: getPortalAuthStorageKey(PORTAL_AUTH_IDS.ambassador, cfg.url),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return supabase;
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

function hasLikelyStoredSession() {
  const cfg = window.__KAMI_BROWSER_SUPABASE__ || {};
  const url = String(cfg.url || "https://bscnpilzmilzabagnypx.supabase.co").trim();
  if (typeof window.kamiHasLikelyStoredSession === "function") {
    return window.kamiHasLikelyStoredSession(PORTAL_AUTH_IDS.ambassador);
  }
  return hasLikelyPortalStoredSession(PORTAL_AUTH_IDS.ambassador, url);
}

function renderPublicShell({ misconfigured = false, loggedIn = false } = {}) {
  const landingReady = Boolean(ROOT?.querySelector(".ambassador-land"));

  if (misconfigured || !landingReady) {
    setRoot(renderPublicLandingHTML({ misconfigured }), { publicLanding: true });
  } else {
    ROOT.classList.remove("amb-boot-loading");
    ROOT.removeAttribute("aria-busy");
    document.body.classList.add("ambassador-is-public");
    syncSiteFooter(true);
  }

  wirePublicLanding({ wireLoginForm: wirePublicForm });
  syncAmbassadorNav(loggedIn);
}

function wirePublicForm() {
  const form = document.getElementById("login-form");
  const err = document.getElementById("login-error");
  const forgot = document.getElementById("forgot-password");
  if (!form || !supabase || form.dataset.loginWired) return;
  form.dataset.loginWired = "1";
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
    syncAmbassadorNav(true);
    return;
  }

  const state = agreementStatus?.state;
  if (state === "not_ambassador") {
    renderNotAmbassador();
    syncAmbassadorNav(true);
  } else if (state === "agreement_required") {
    renderAgreementFlow();
    syncAmbassadorNav(true);
  } else if (state === "dashboard") {
    await renderDashboard();
    syncAmbassadorNav(true);
  } else {
    renderPublicShell();
  }
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

const LEDGER_PAGE_SIZE = 3;

function renderLedgerRow(row) {
  return `<tr>
    <td>${formatDateTime(row.date)}</td>
    <td>${escapeHtml(row.change_type || "—")}</td>
    <td>${escapeHtml(formatLedgerValue(row.previous_value))}</td>
    <td>${escapeHtml(formatLedgerValue(row.new_value))}</td>
    <td>${escapeHtml(row.notes || "")}</td>
  </tr>`;
}

function renderLedgerTableBody(entries, offset = 0) {
  const pageEntries = entries.slice(offset, offset + LEDGER_PAGE_SIZE);
  if (!pageEntries.length) {
    return `<tr><td colspan="5" class="empty-cell">No program updates yet.</td></tr>`;
  }
  return pageEntries.map(renderLedgerRow).join("");
}

function renderChangeLedgerPagination(entries, offset = 0) {
  const total = entries.length;
  if (total <= LEDGER_PAGE_SIZE) return "";

  const page = Math.floor(offset / LEDGER_PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE));
  const start = offset + 1;
  const end = Math.min(offset + LEDGER_PAGE_SIZE, total);

  return `<div class="table-panel-footer">
    <p class="muted table-panel-range">Showing ${start}–${end} of ${total}</p>
    <div class="table-panel-pagination">
      <button type="button" class="btn secondary btn-sm change-ledger-prev" ${offset <= 0 ? "disabled" : ""}>Previous</button>
      <span class="table-panel-page">Page ${page} of ${totalPages}</span>
      <button type="button" class="btn secondary btn-sm change-ledger-next" ${offset + LEDGER_PAGE_SIZE >= total ? "disabled" : ""}>Next</button>
    </div>
  </div>`;
}

function wireChangeLedgerPagination(entries) {
  const section = document.querySelector("[data-change-ledger]");
  const tbody = section?.querySelector("[data-change-ledger-body]");
  const footer = section?.querySelector("[data-change-ledger-footer]");
  if (!section || !tbody || !footer || entries.length <= LEDGER_PAGE_SIZE) return;

  let offset = 0;

  function renderPage() {
    tbody.innerHTML = renderLedgerTableBody(entries, offset);
    footer.innerHTML = renderChangeLedgerPagination(entries, offset);
    footer.querySelector(".change-ledger-prev")?.addEventListener("click", () => {
      if (offset <= 0) return;
      offset = Math.max(0, offset - LEDGER_PAGE_SIZE);
      renderPage();
    });
    footer.querySelector(".change-ledger-next")?.addEventListener("click", () => {
      if (offset + LEDGER_PAGE_SIZE >= entries.length) return;
      offset += LEDGER_PAGE_SIZE;
      renderPage();
    });
  }

  renderPage();
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
  const referralList = Array.isArray(referrals?.referrals) ? referrals.referrals : [];
  const payoutList = Array.isArray(payouts?.payouts) ? payouts.payouts : [];
  const ledgerEntries = Array.isArray(ledger?.ledger) ? ledger.ledger : [];
  const ledgerTable = renderLedgerTableBody(ledgerEntries, 0);
  const avatar = h.avatar_url
    ? `<img class="avatar" src="${escapeHtml(h.avatar_url)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="avatar avatar-fallback">${escapeHtml((h.display_name || "K")[0])}</div>`;
  const heroMeta = buildHeroMeta({
    header: h,
    programParameters: dashboard.program_parameters,
    referrals: referralList,
    history,
  });
  const copyLink = formatCopyReferralLink(referral.code, referral.link);

  document.body.classList.add("ambassador-dashboard");

  setRoot(
    renderAmbassadorDashboardLayout({
      header: h,
      avatarHtml: avatar,
      heroMeta,
      referral,
      metrics: dashboard.metrics || {},
      programParameters: dashboard.program_parameters,
      referrals: referralList,
      payouts: payoutList,
      ledgerTable,
      ledgerEntries,
      history,
    })
  );

  document.getElementById("copy-code")?.addEventListener("click", (ev) =>
    copyText(referral.code, ev.currentTarget)
  );
  document.getElementById("copy-link")?.addEventListener("click", (ev) =>
    copyText(copyLink, ev.currentTarget)
  );
  wireEditReferralCode({
    rpc,
    showModal,
    hideModal,
    currentCode: referral.code,
    onUpdated: ({ code, link }) => {
      referral.code = code;
      referral.link = link || formatCopyReferralLink(code);
      const linkEl = document.getElementById("ref-link");
      const display = formatCanonicalReferralLink(code);
      if (linkEl && display) {
        if (linkEl.tagName === "A") {
          linkEl.href = formatCopyReferralLink(code, link);
          linkEl.textContent = display;
        } else {
          linkEl.textContent = display;
        }
      }
    },
  });
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  wireAgreementHistory(history, { showModal });
  wireChangeLedgerPagination(ledgerEntries);
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
  document.body.classList.remove("ambassador-dashboard");
  renderPublicShell();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

(async function main() {
  syncAmbassadorNav(false);

  const likelyLoggedIn = hasLikelyStoredSession();
  if (!likelyLoggedIn) {
    renderPublicShell();
  }

  document.getElementById("ambassador-nav-logout")?.addEventListener("click", logout);

  const client = await initSupabase();
  if (!client) return;

  const { data } = await client.auth.getSession();
  if (data?.session) {
    await bootstrapSession();
  } else {
    syncAmbassadorNav(false);
    if (likelyLoggedIn) {
      renderPublicShell();
    } else {
      wirePublicForm();
    }
  }

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
