import { escapeHtml } from "./format.js";
import {
  renderAgreementTermsSummary,
} from "./terms-summary.js";
import { wireTermTips } from "../ambassador/terms-summary.js";
import {
  renderPublicLandingHTML,
  wirePublicLanding,
  clearPublicLandingMode,
  syncSiteFooter,
} from "./public-landing.js";
import { getAgreement, getCurrentAgreementText } from "./agreements/index.js";
import { renderImageOrFallback } from "./media.js";
import { renderPartnerDashboard, readTabFromUrl } from "./dashboard.js?v=20260616a";
import {
  getPortalAuthStorageKey,
  hasLikelyPortalStoredSession,
  PORTAL_AUTH_IDS,
} from "../shared/portal-auth-storage.js";

const ROOT = document.getElementById("partner-root");
const MODAL = document.getElementById("partner-modal");
const MODAL_BODY = document.getElementById("partner-modal-body");
const MODAL_TITLE = document.getElementById("partner-modal-title");
const MODAL_CLOSE = document.getElementById("partner-modal-close");

const PARTNER_MARKETING_HASHES = new Set(["#partner-why", "#partner-inquiry"]);

function isPartnerMarketingHash(hash = window.location.hash) {
  return PARTNER_MARKETING_HASHES.has(hash);
}

/** @param {boolean} loggedIn */
function syncPartnerNav(loggedIn = false) {
  const homeLink = document.querySelector(".partner-nav-home");
  const marketingLinks = document.querySelectorAll(".partner-nav-marketing");
  const howLink = document.querySelector('.partner-nav-marketing[href*="partner-why"]');
  const becomeLink = document.querySelector('.partner-nav-marketing[href*="partner-inquiry"]');
  const navLogout = document.getElementById("partner-nav-logout");

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
  if (howLink) howLink.href = "#partner-why";
  if (becomeLink) becomeLink.href = "#partner-inquiry";
}

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let supabase = null;
let agreementStatus = null;
let activePartnerId = null;
let activeTab = readTabFromUrl();

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
      storageKey: getPortalAuthStorageKey(PORTAL_AUTH_IDS.partner, cfg.url),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return supabase;
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
    (document.body.classList.contains("partner-is-public") || Boolean(ROOT.querySelector(".partner-land")));

  ROOT.classList.remove("partner-boot-loading");
  ROOT.removeAttribute("aria-busy");
  if (publicLanding) {
    document.body.classList.add("partner-is-public");
  } else {
    clearPublicLandingMode();
  }
  ROOT.innerHTML = html;

  if (leavingPublicLanding) {
    resetPortalViewport();
  }
}

function showModal(title, bodyHtml) {
  if (!MODAL || !MODAL_BODY || !MODAL_TITLE) return;
  MODAL_TITLE.textContent = title;
  MODAL_BODY.innerHTML = bodyHtml;
  MODAL.hidden = false;
}

function hideModal() {
  if (MODAL) MODAL.hidden = true;
}

if (MODAL_CLOSE) MODAL_CLOSE.addEventListener("click", hideModal);
if (MODAL) {
  MODAL.addEventListener("click", (ev) => {
    if (ev.target === MODAL || ev.target.classList.contains("partner-modal-backdrop")) hideModal();
  });
}

function showKamiDialog({ title, message, variant = "info" }) {
  const boxClass =
    variant === "success"
      ? "dialog-box dialog-box--success"
      : variant === "error"
        ? "dialog-box dialog-box--error"
        : "dialog-box";
  showModal(
    title,
    `<div class="${boxClass}">
      <p class="dialog-message">${escapeHtml(message)}</p>
      <button type="button" class="btn dialog-ok" id="partner-dialog-ok">OK</button>
    </div>`
  );
  document.getElementById("partner-dialog-ok")?.addEventListener("click", hideModal, { once: true });
}

function showForgotPasswordResult(code, message) {
  const map = {
    email_sent: ["Check your email", message || "A password reset link has been sent to your email.", "success"],
    email_not_found: ["No account found", message || "No Kami account was found for that email address.", "error"],
    not_partner: [
      "Not a partner",
      message ||
        "That email is registered with Kami, but it is not linked to a partner account.",
      "error",
    ],
    invalid_email: ["Invalid email", message || "Enter a valid email address.", "error"],
  };
  const [title, msg, variant] = map[code] || [
    "Could not send reset",
    message || "Something went wrong. Please try again.",
    "error",
  ];
  showKamiDialog({ title, message: msg, variant });
}

function hasLikelyStoredSession() {
  const cfg = window.__KAMI_BROWSER_SUPABASE__ || {};
  const url = String(cfg.url || "https://bscnpilzmilzabagnypx.supabase.co").trim();
  if (typeof window.kamiHasLikelyStoredSession === "function") {
    return window.kamiHasLikelyStoredSession(PORTAL_AUTH_IDS.partner);
  }
  return hasLikelyPortalStoredSession(PORTAL_AUTH_IDS.partner, url);
}

function renderPublicShell({ misconfigured = false, loggedIn = false } = {}) {
  const landingReady = Boolean(ROOT?.querySelector(".partner-land"));

  if (misconfigured || !landingReady) {
    setRoot(renderPublicLandingHTML({ misconfigured }), { publicLanding: true });
  } else {
    ROOT.classList.remove("partner-boot-loading");
    ROOT.removeAttribute("aria-busy");
    document.body.classList.add("partner-is-public");
    syncSiteFooter(true);
  }

  wirePublicLanding({ wireLoginForm: wirePublicForm });
  syncPartnerNav(loggedIn);
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

      const { data: check, error: checkError } = await supabase.rpc("kami_partner_forgot_password_check", {
        p_email: email,
      });

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

      let sent = false;
      try {
        const response = await fetch("/api/partner/forgot-password", {
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
        /* fall through */
      }

      if (!sent) {
        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
          redirectTo: `${window.location.origin}/password-reset`,
        });
        if (error) {
          showForgotPasswordResult("reset_failed", error.message || "Could not send the reset email.");
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

async function fetchAgreementStatus(partnerId = activePartnerId) {
  agreementStatus = await rpc("get_my_partner_agreement_status", {
    p_partner_id: partnerId || null,
  });
  if (agreementStatus?.partner_id) activePartnerId = agreementStatus.partner_id;
  return agreementStatus;
}

async function bootstrapSession() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    renderPublicShell();
    return;
  }

  try {
    await fetchAgreementStatus(activePartnerId);
  } catch (error) {
    setRoot(`
      <section class="panel"><h2>Portal unavailable</h2>
      <p class="muted">We couldn't load partner data. The backend RPCs may not be deployed yet.</p>
      <p class="muted">${escapeHtml(error.message)}</p>
      <button class="btn secondary" type="button" id="logout-btn">Log out</button></section>`);
    document.getElementById("logout-btn")?.addEventListener("click", logout);
    syncPartnerNav(true);
    return;
  }

  const state = agreementStatus?.state;
  if (state === "not_partner") {
    if (isPartnerMarketingHash()) {
      renderPublicShell({ loggedIn: true });
      return;
    }
    renderNotPartner();
  } else if (state === "agreement_required") renderAgreementFlow();
  else if (state === "dashboard") await renderPortal();
  else renderPublicShell({ loggedIn: true });
}

function renderPortalError(message) {
  setRoot(`
    <section class="panel"><h2>Could not load partner portal</h2>
    <p class="muted">Something went wrong while loading your dashboard. Try refreshing the page.</p>
    <p class="muted">${escapeHtml(message || "Unknown error")}</p>
    <button class="btn secondary" type="button" id="logout-btn">Log out</button></section>`);
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  syncPartnerNav(true);
}

function renderNotPartner() {
  setRoot(`
    <section class="panel partner-access-panel" aria-labelledby="partner-access-title">
      <div class="partner-access-card">
        <img class="partner-access-mark" src="/assets/k-mark-transparent.png" alt="" width="52" height="52" aria-hidden="true" />
        <h2 id="partner-access-title">Partner Portal</h2>
        <p class="partner-access-lead">This area is reserved for approved Kami venue and event partners.</p>
        <p class="partner-access-body">Approved partners can manage venues, events, referrals, agreements, and participation in the Kami Partner Network.</p>
        <div class="partner-access-cta">
          <p class="partner-access-cta-label">Interested in becoming a partner?</p>
          <a class="btn partner-access-contact" href="mailto:partners@kamisocial.com">Contact partners@kamisocial.com</a>
        </div>
        <ul class="partner-access-benefits">
          <li>Promote venues and events</li>
          <li>Reach nearby Kami users</li>
          <li>Track referrals and engagement</li>
          <li>Access partner-only tools</li>
        </ul>
        <button class="btn secondary btn-sm partner-access-logout" type="button" id="logout-btn">Log out</button>
      </div>
    </section>
  `);
  syncPartnerNav(true);
  document.getElementById("logout-btn")?.addEventListener("click", logout);
}

function renderPartnerSwitcher(memberships, selectedId) {
  if (!Array.isArray(memberships) || memberships.length <= 1) return "";
  const options = memberships
    .map(
      (m) =>
        `<option value="${escapeHtml(m.partner_id)}"${m.partner_id === selectedId ? " selected" : ""}>${escapeHtml(m.display_name)}</option>`
    )
    .join("");
  return `<div class="partner-switcher panel">
    <label for="partner-select">Partner account</label>
    <select id="partner-select">${options}</select>
  </div>`;
}

function renderAgreementPartnerChip(partner) {
  const name = String(partner?.display_name || "Partner").trim() || "Partner";
  const avatar = renderImageOrFallback({
    url: partner?.avatar_url || partner?.avatarUrl,
    fallbackText: name,
    imgClass: "agreement-user-avatar",
    fallbackClass: "agreement-user-avatar agreement-user-avatar-fallback",
  });
  return `<div class="agreement-user-chip">${avatar}<span class="agreement-user-name">${escapeHtml(name)}</span></div>`;
}

function renderAgreementFlow() {
  const version = agreementStatus.current_agreement_version || "partner_terms_v1";
  const agreement = getAgreement(version);
  const agreementText = agreement?.text || getCurrentAgreementText(version);
  const params = agreementStatus.program_parameters;
  const partner = agreementStatus.partner || {};

  setRoot(`
    ${renderPartnerSwitcher(agreementStatus.memberships, agreementStatus.partner_id)}
    <section class="panel agreement-panel">
      <div class="agreement-panel-top">
        <div class="agreement-panel-head">
          <h2 class="agreement-page-title">Accept Partner Agreement</h2>
          <p class="agreement-intro">Review your current partner terms and accept the agreement to continue.</p>
        </div>
        ${renderAgreementPartnerChip(partner)}
      </div>
      ${renderAgreementTermsSummary(params, partner)}
    </section>
    <section class="panel agreement-doc-panel">
      <h3>${escapeHtml(agreement?.title || "Partner Program Agreement")}</h3>
      <div class="agreement-scroll">${escapeHtml(agreementText).replace(/\n/g, "<br>")}</div>
      <label class="check-row"><input type="checkbox" id="agree-check" /> I have read and agree to the Kami Partner Program Agreement.</label>
      <div id="accept-error" class="msg err" hidden role="alert"></div>
      <div class="agreement-actions">
        <button class="btn" type="button" id="accept-btn" disabled>Accept and Continue</button>
        <button class="btn secondary" type="button" id="logout-btn">Log out</button>
      </div>
    </section>
  `);

  wirePartnerSwitcher();
  if (ROOT) wireTermTips(ROOT);
  syncPartnerNav(true);
  const check = document.getElementById("agree-check");
  const acceptBtn = document.getElementById("accept-btn");
  check?.addEventListener("change", () => {
    if (acceptBtn) acceptBtn.disabled = !check.checked;
  });
  acceptBtn?.addEventListener("click", acceptAgreement);
  document.getElementById("logout-btn")?.addEventListener("click", logout);
}

function wirePartnerSwitcher() {
  const select = document.getElementById("partner-select");
  if (!select) return;
  select.addEventListener("change", async () => {
    activePartnerId = select.value;
    await fetchAgreementStatus(activePartnerId);
    const state = agreementStatus?.state;
    if (state === "agreement_required") renderAgreementFlow();
    else if (state === "dashboard") await renderPortal();
    else await bootstrapSession();
  });
}

async function acceptAgreement() {
  const version = agreementStatus.current_agreement_version || "partner_terms_v1";
  const agreementText = getCurrentAgreementText(version);
  const partnerId = agreementStatus.partner_id || activePartnerId;
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

  const response = await fetch("/api/partner/accept-agreement", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      partner_id: partnerId,
      agreement_version: version,
      agreement_snapshot: agreementText,
      program_parameters_snapshot: agreementStatus.program_parameters,
    }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (_e) {}

  if (!response.ok || !payload.ok) {
    if (!payload?.ok) {
      const { data, error } = await supabase.rpc("accept_my_partner_agreement", {
        p_partner_id: partnerId,
        p_agreement_version: version,
        p_agreement_snapshot: agreementText,
        p_program_parameters_snapshot: agreementStatus.program_parameters,
        p_ip_address: null,
        p_user_agent: String(navigator.userAgent || "").slice(0, 500),
      });
      if (error) {
        if (err) {
          err.textContent = error.message || "Could not save agreement acceptance.";
          err.hidden = false;
        }
        if (btn) btn.disabled = false;
        return;
      }
      payload = data || payload;
    }
    if (!payload?.ok && !payload?.already_accepted) {
      if (err) {
        err.textContent = payload?.error || "Could not save agreement acceptance.";
        err.hidden = false;
      }
      if (btn) btn.disabled = false;
      return;
    }
  }

  await bootstrapSession();
}

async function renderPortal() {
  try {
    const partnerId = activePartnerId || agreementStatus?.partner_id;
    if (!partnerId) {
      await fetchAgreementStatus();
    }

    const pid = activePartnerId || agreementStatus?.partner_id;
    const memberships = agreementStatus?.memberships || [];

    await renderPartnerDashboard({
      rpc,
      setRoot,
      showModal,
      hideModal,
      supabase,
      partnerId: pid,
      memberships,
      switcherHtml: renderPartnerSwitcher(memberships, pid),
      activeTab,
      setActiveTab: (tab) => {
        activeTab = tab;
      },
      syncPartnerNav,
      wirePartnerSwitcher,
      onDashboardLocked: (status) => {
        agreementStatus = status;
        renderAgreementFlow();
      },
      onLeft: () => bootstrapSession(),
      logout,
    });
  } catch (error) {
    renderPortalError(error?.message);
  }
}

async function logout() {
  if (supabase) await supabase.auth.signOut();
  agreementStatus = null;
  activePartnerId = null;
  activeTab = "overview";
  renderPublicShell();
  window.scrollTo({ top: 0, behavior: "auto" });
}

(async function main() {
  syncPartnerNav(false);

  const likelyLoggedIn = hasLikelyStoredSession();
  if (!likelyLoggedIn) {
    renderPublicShell();
  }

  document.getElementById("partner-nav-logout")?.addEventListener("click", logout);

  const client = await initSupabase();
  if (!client) return;

  const { data } = await client.auth.getSession();
  if (data?.session) {
    try {
      await bootstrapSession();
    } catch (error) {
      renderPortalError(error?.message);
    }
  } else {
    syncPartnerNav(false);
    if (likelyLoggedIn) renderPublicShell();
    else wirePublicForm();
  }

  client.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    if (!session) {
      agreementStatus = null;
      activePartnerId = null;
      renderPublicShell();
    } else if (event === "SIGNED_IN") {
      bootstrapSession();
    }
  });
})();
