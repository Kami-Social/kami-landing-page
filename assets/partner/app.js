import {
  copyText,
  escapeHtml,
  formatDate,
  formatDateTime,
} from "./format.js";
import {
  renderAgreementTermsSummary,
  renderProgramTermsCard,
} from "./terms-summary.js";
import { wireTermTips } from "../ambassador/terms-summary.js";
import {
  renderPublicLandingHTML,
  wirePublicLanding,
  clearPublicLandingMode,
} from "./public-landing.js";
import { getAgreement, getCurrentAgreementText } from "./agreements/index.js";

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
  const downloadBtn = document.querySelector(".partner-nav-inner .nav-download");

  if (loggedIn) {
    if (homeLink) homeLink.hidden = false;
    marketingLinks.forEach((link) => {
      link.hidden = true;
    });
    if (downloadBtn) downloadBtn.textContent = "Download";
    return;
  }

  if (homeLink) homeLink.hidden = true;
  marketingLinks.forEach((link) => {
    link.hidden = false;
  });
  if (howLink) howLink.href = "#partner-why";
  if (becomeLink) becomeLink.href = "#partner-inquiry";
  if (downloadBtn) downloadBtn.textContent = "Download Kami";
}

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let supabase = null;
let agreementStatus = null;
let activePartnerId = null;
let activeTab = "venues";

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

function setRoot(html, { publicLanding = false } = {}) {
  if (!ROOT) return;
  ROOT.classList.remove("partner-boot-loading");
  ROOT.removeAttribute("aria-busy");
  if (publicLanding) {
    document.body.classList.add("partner-is-public");
  } else {
    clearPublicLandingMode();
  }
  ROOT.innerHTML = html;
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
  return typeof window.kamiHasLikelyStoredSession === "function" && window.kamiHasLikelyStoredSession();
}

function renderPublicShell({ misconfigured = false, loggedIn = false } = {}) {
  const landingReady = Boolean(ROOT?.querySelector(".partner-land"));

  if (misconfigured || !landingReady) {
    setRoot(renderPublicLandingHTML({ misconfigured }), { publicLanding: true });
  } else {
    ROOT.classList.remove("partner-boot-loading");
    ROOT.removeAttribute("aria-busy");
    document.body.classList.add("partner-is-public");
    const footer = document.getElementById("partner-public-footer");
    if (footer) footer.hidden = false;
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
  const avatarUrl = partner?.avatar_url || partner?.avatarUrl;
  const avatar = avatarUrl
    ? `<img class="agreement-user-avatar" src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer" />`
    : `<div class="agreement-user-avatar agreement-user-avatar-fallback" aria-hidden="true">${escapeHtml(name[0] || "P")}</div>`;
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

function formatLocation(venue) {
  const parts = [venue.neighborhood, venue.city, venue.region].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return venue.address || "Location not listed";
}

function formatCategory(venue) {
  const parts = [venue.category, venue.subcategory].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Venue";
}

function renderVenuePhoto(venue, { featured = false } = {}) {
  const cls = featured ? "venue-photo" : "venue-photo";
  if (venue.photo_url) {
    return `<img class="${cls}" src="${escapeHtml(venue.photo_url)}" alt="" referrerpolicy="no-referrer" />`;
  }
  const initial = (venue.name || "V")[0];
  return `<div class="${cls} venue-photo-fallback" aria-hidden="true">${escapeHtml(initial)}</div>`;
}

function renderVenueCard(venue, { featured = false } = {}) {
  const cardClass = featured ? "venue-card venue-card--featured" : "venue-card";
  const activeBadge = venue.is_active
    ? `<span class="venue-badge is-good">Active</span>`
    : `<span class="venue-badge is-warn">${escapeHtml(venue.status || "Inactive")}</span>`;
  const publicBadge = venue.is_public
    ? `<span class="venue-badge is-good">Public</span>`
    : `<span class="venue-badge is-warn">${escapeHtml(venue.visibility || "Not public")}</span>`;
  const publishedBadge = venue.is_published
    ? `<span class="venue-badge is-good">Published on Kami</span>`
    : `<span class="venue-badge is-warn">Not published</span>`;

  return `<article class="${cardClass}">
    ${renderVenuePhoto(venue, { featured })}
    <div>
      <h3>${escapeHtml(venue.name || "Venue")}</h3>
      <p class="venue-meta">${escapeHtml(formatCategory(venue))}<br>${escapeHtml(formatLocation(venue))}</p>
      <div class="venue-badges">${activeBadge}${publicBadge}${publishedBadge}</div>
    </div>
  </article>`;
}

function renderVenuesSection(venues) {
  const list = Array.isArray(venues) ? venues : [];
  if (list.length === 0) {
    return `<section class="panel">
      <h2>Your Venues</h2>
      <div class="empty-state">
        <h3>No venues linked yet</h3>
        <p>No venues have been linked to this partner account yet. Contact <a href="mailto:partners@kamisocial.com">partners@kamisocial.com</a> if you believe this is an error or need help getting set up.</p>
      </div>
    </section>`;
  }

  const gridClass = list.length === 1 ? "venue-grid" : "venue-grid venue-grid--multi";
  const cards = list
    .map((venue, idx) => renderVenueCard(venue, { featured: list.length === 1 && idx === 0 }))
    .join("");

  return `<section class="panel">
    <h2>Your Venues</h2>
    <p class="muted">${list.length === 1 ? "1 venue linked to your partner account." : `${list.length} venues linked to your partner account.`}</p>
    <div class="${gridClass}">${cards}</div>
  </section>`;
}

function renderReadinessSection(readiness) {
  const items = Array.isArray(readiness) ? readiness : [];
  if (!items.length) return "";
  const rows = items
    .map(
      (item) => `<li class="readiness-item${item.met ? " is-met" : ""}">
        <span class="readiness-mark">${item.met ? "✓" : "○"}</span>
        <span>${escapeHtml(item.label || "")}</span>
      </li>`
    )
    .join("");
  return `<section class="panel">
    <h2>Venue Readiness</h2>
    <ul class="readiness-list">${rows}</ul>
  </section>`;
}

function renderReferralSection(referral) {
  const r = referral || {};
  const code = String(r.code || "").trim();
  const link = String(r.link || "").trim();
  const signupCount = Number(r.signup_count ?? 0);
  const linkHtml = link
    ? `<a class="copy-value copy-value-link" id="ref-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link)}</a>`
    : `<p class="copy-value copy-value-link" id="ref-link">—</p>`;

  return `<section class="panel referral-panel">
    <h2>Referral Program</h2>
    <p class="muted">Share this link with customers and followers to help grow the Kami community.</p>
    <div class="copy-grid">
      <div><label>Referral Code</label><p class="copy-value" id="ref-code">${escapeHtml(code || "—")}</p></div>
      <div><label>Referral Link</label>${linkHtml}</div>
    </div>
    <div class="btn-row">
      <button type="button" class="btn secondary" id="copy-code"${code ? "" : " disabled"}>Copy Code</button>
      <button type="button" class="btn secondary" id="copy-link"${link ? "" : " disabled"}>Copy Link</button>
    </div>
    <p class="referral-stat"><strong>${signupCount}</strong> registration${signupCount === 1 ? "" : "s"} via your link</p>
  </section>`;
}

function renderProgramSection(program) {
  const p = program?.program_parameters || {};
  const agreementLabel =
    program?.agreement_status === "signed"
      ? `Accepted${program.agreement_signed_at ? ` · ${formatDate(program.agreement_signed_at)}` : ""}`
      : "Not yet accepted";

  return `<section class="panel">
    <h2>Program Terms</h2>
    ${renderProgramTermsCard(p)}
    <p class="terms-reminder"><strong>Agreement status:</strong> ${escapeHtml(agreementLabel)}</p>
  </section>`;
}

function renderSupportSection() {
  return `<section class="panel">
    <h2>Support</h2>
    <p>Questions about your venues, referral link, or program terms?</p>
    <p><a href="mailto:partners@kamisocial.com">partners@kamisocial.com</a></p>
    <div class="support-links">
      <a href="/terms">Terms of Service</a>
      <a href="/privacy">Privacy Policy</a>
    </div>
  </section>`;
}

function renderEventsTab(events) {
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) {
    return `<section class="panel">
      <div class="empty-state">
        <h3>No upcoming events found</h3>
        <p>There are no upcoming published events across your linked venues right now. Events will appear here when they are scheduled at venues on your account.</p>
      </div>
    </section>`;
  }

  const cards = list
    .map((event) => {
      const location = [event.place_name, event.place_neighborhood, event.place_city].filter(Boolean).join(" · ");
      return `<article class="event-card">
        <h3>${escapeHtml(event.name || "Event")}</h3>
        <p class="event-meta">
          ${escapeHtml(formatDateTime(event.starts_at))}${event.ends_at ? ` – ${escapeHtml(formatDateTime(event.ends_at))}` : ""}<br>
          ${escapeHtml(location)}<br>
          Status: ${escapeHtml(event.status || "published")}
        </p>
      </article>`;
    })
    .join("");

  return `<section class="panel">
    <h2>Upcoming Events</h2>
    <p class="muted">Events across all venues linked to your partner account.</p>
    <div class="event-list">${cards}</div>
  </section>`;
}

async function renderPortal() {
  const partnerId = activePartnerId || agreementStatus?.partner_id;
  if (!partnerId) {
    await fetchAgreementStatus();
  }

  const pid = activePartnerId || agreementStatus?.partner_id;
  const [dashboard, eventsPayload] = await Promise.all([
    rpc("get_my_partner_dashboard", { p_partner_id: pid }),
    rpc("get_my_partner_events", { p_partner_id: pid }),
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
  const memberships = agreementStatus?.memberships || [];

  const venuesTab =
    renderVenuesSection(dashboard.venues) +
    renderReadinessSection(dashboard.readiness) +
    renderReferralSection(dashboard.referral) +
    renderProgramSection(dashboard.program) +
    renderSupportSection();

  const eventsTab = renderEventsTab(eventsPayload?.events);

  setRoot(`
    ${renderPartnerSwitcher(memberships, pid)}
    <section class="panel dashboard-header">
      <div class="dashboard-header-main">
        <div class="eyebrow dashboard-eyebrow">Partner Portal</div>
        <div class="header-main">
          <div class="header-copy">
            <h1>${escapeHtml(h.display_name || "Partner")}</h1>
            <p class="muted">${escapeHtml(h.contact_email || "")}${h.joined_at ? ` · Joined ${escapeHtml(formatDate(h.joined_at))}` : ""}</p>
          </div>
        </div>
      </div>
      <span class="status-badge">${escapeHtml(h.status_label || "Partner")}</span>
    </section>

    <div class="portal-tabs" role="tablist" aria-label="Partner portal sections">
      <button type="button" class="portal-tab${activeTab === "venues" ? " is-active" : ""}" data-tab="venues" role="tab" aria-selected="${activeTab === "venues"}">Venues</button>
      <button type="button" class="portal-tab${activeTab === "events" ? " is-active" : ""}" data-tab="events" role="tab" aria-selected="${activeTab === "events"}">Events</button>
    </div>

    <div id="tab-venues"${activeTab === "venues" ? "" : " hidden"}>${venuesTab}</div>
    <div id="tab-events"${activeTab === "events" ? "" : " hidden"}>${eventsTab}</div>

    <section class="panel centered-panel">
      <button type="button" class="btn secondary" id="logout-btn">Log out</button>
    </section>
  `);

  wirePartnerSwitcher();
  wireTabs();
  wireCopyButtons(dashboard.referral);
  syncPartnerNav(true);
  document.getElementById("logout-btn")?.addEventListener("click", logout);
}

function wireTabs() {
  document.querySelectorAll(".portal-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.getAttribute("data-tab") || "venues";
      document.querySelectorAll(".portal-tab").forEach((el) => {
        const on = el.getAttribute("data-tab") === activeTab;
        el.classList.toggle("is-active", on);
        el.setAttribute("aria-selected", on ? "true" : "false");
      });
      document.getElementById("tab-venues")?.toggleAttribute("hidden", activeTab !== "venues");
      document.getElementById("tab-events")?.toggleAttribute("hidden", activeTab !== "events");
    });
  });
}

function wireCopyButtons(referral) {
  document.getElementById("copy-code")?.addEventListener("click", (ev) =>
    copyText(referral?.code, ev.currentTarget)
  );
  document.getElementById("copy-link")?.addEventListener("click", (ev) =>
    copyText(referral?.link, ev.currentTarget)
  );
}

async function logout() {
  if (supabase) await supabase.auth.signOut();
  agreementStatus = null;
  activePartnerId = null;
  activeTab = "venues";
  renderPublicShell();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

(async function main() {
  const likelyLoggedIn = hasLikelyStoredSession();
  if (!likelyLoggedIn) {
    renderPublicShell();
  }

  const client = await initSupabase();
  if (!client) return;

  const { data } = await client.auth.getSession();
  if (data?.session) await bootstrapSession();
  else if (likelyLoggedIn) renderPublicShell();
  else wirePublicForm();

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
