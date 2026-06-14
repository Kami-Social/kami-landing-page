import { escapeHtml, formatMoney, formatDateTime } from "./format.js";

const TOOLTIPS = {
  qualified_referral:
    "Qualified Referrals are determined by the current criteria shown in your Ambassador Dashboard. Criteria may include registration, verification, activity thresholds, retention, fraud screening, or other program requirements.",
  rate:
    "Your current compensation rate is based on the program settings shown here. Rates may change over time as described in the agreement.",
  tier_cap:
    "Your Tier Cap is the current earnings cap for your ambassador tier. Tier Caps may be adjusted based on performance, participation, and program needs.",
  payout_threshold:
    "Approved earnings become eligible for payout once your unpaid approved balance reaches this amount. Eligible payouts are generally processed periodically by Kami.",
  status:
    "Your ambassador status determines whether you can currently earn compensation for Qualified Referrals.",
};

function parseRateTiers(params) {
  if (Array.isArray(params?.rate_tiers)) return params.rate_tiers;
  const raw = String(params?.compensation_rate || "");
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function formatRateLine(rateCents) {
  return `${formatMoney(rateCents)} / Qualified Referral`;
}

export function formatRateSummary(params) {
  const tiers = parseRateTiers(params);
  if (tiers.length === 0) {
    const cents = params?.rate_cents_per_registration;
    if (cents != null && !Number.isNaN(Number(cents))) {
      return formatRateLine(Number(cents));
    }
    const raw = String(params?.compensation_rate || "");
    const money = raw.match(/\$[\d,.]+/);
    if (money) return `${money[0]} / Qualified Referral`;
    return "See dashboard for current rate";
  }

  if (tiers.length === 1) {
    const only = tiers[0];
    const count = only?.referral_count;
    if (count == null || count === "") {
      return formatRateLine(Number(only?.rate_cents || 0));
    }
    return `Tier 1: ${formatRateLine(Number(only?.rate_cents || 0))} for first ${count} Qualified Referrals`;
  }

  return tiers
    .map((tier, index) => {
      const rate = formatRateLine(Number(tier?.rate_cents || 0));
      const count = tier?.referral_count;
      const label = `Tier ${index + 1}: ${rate}`;

      if (count == null || count === "") {
        return index === 0 ? label : `${label} for all remaining Qualified Referrals`;
      }

      if (index === 0) {
        return `${label} for first ${count} Qualified Referrals`;
      }

      return `${label} for next ${count} Qualified Referrals`;
    })
    .join("\n");
}

export function formatQualifiedReferralSummary(params) {
  const text = String(params?.qualification_requirements || "").toLowerCase();
  if (text.includes("onboarding") && (text.includes("active") || text.includes("criteria"))) {
    return "Signup + active-user review";
  }
  if (text.includes("signup") || text.includes("create a kami account")) {
    return "Completed signup";
  }
  const sentence = String(params?.qualification_requirements || "").split(".")[0].trim();
  if (sentence.length > 72) return "Signup + active-user review";
  return sentence || "See dashboard for criteria";
}

export function formatTierCapSummary(params) {
  const cents = params?.tier_cap_cents ?? params?.maximum_spend_cents;
  if (cents != null && !Number.isNaN(Number(cents))) {
    return `${formatMoney(Number(cents))} / month`;
  }

  const display = String(
    params?.tier_cap_display ?? params?.tier_cap_snapshot_display ?? ""
  ).trim();
  if (display && !/no cap set at time of agreement|no cap currently set/i.test(display)) {
    const displayMoney = display.match(/\$[\d,.]+/);
    if (displayMoney) return `${displayMoney[0]} / month`;
    return display;
  }

  const text = String(params?.monthly_earnings_limit || "");
  const money = text.match(/\$[\d,.]+/);
  if (money) return `${money[0]} / month`;
  if (/no cap|not set|unlimited/i.test(text)) return "No cap currently set";
  return "No cap currently set";
}

export function formatPayoutThresholdSummary(params) {
  const cents = params?.payout_threshold_cents;
  if (cents != null && !Number.isNaN(Number(cents))) {
    const amount = Number(cents);
    if (amount <= 0) return "No payout threshold";
    return formatMoney(amount);
  }

  const raw = String(params?.payout_threshold || "").trim();
  if (!raw) return "No payout threshold";
  if (/no payout threshold|not set|none|no threshold|unlimited|n\/a/i.test(raw)) {
    return "No payout threshold";
  }

  const money = raw.match(/\$[\d,.]+/);
  if (money) return money[0];

  if (raw.length <= 32 && !raw.includes(".")) return raw;

  const numeric = raw.replace(/[$,]/g, "");
  if (/^\d+(\.\d+)?$/.test(numeric)) {
    const amount = Number(numeric);
    if (amount <= 0) return "No payout threshold";
    return formatMoney(Math.round(amount * 100));
  }

  return "No payout threshold";
}

export function formatAmbassadorStatusSummary(profile, { agreementRequired = false } = {}) {
  if (agreementRequired) return "Pending acceptance";
  const programStatus = String(profile?.program_status || "").toLowerCase();
  const status = String(profile?.status || "").toLowerCase();
  if (programStatus === "inactive" || status.includes("terminated") || status.includes("paused")) {
    return "Paused";
  }
  if (programStatus === "active") return "Active";
  return "Active";
}

function capitalizeWords(text) {
  if (text == null || text === "" || text === "—") return text;
  return String(text)
    .split("\n")
    .map((line) => line.replace(/(^|[\s+\-/])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase()))
    .join("\n");
}

function renderTermsValueHtml(value) {
  const lines = String(value || "—")
    .split("\n")
    .map((line) => `<span class="terms-value-line">${escapeHtml(line)}</span>`)
    .join("");
  return lines;
}

export function renderRateTiersHtml(params) {
  const tiers = parseRateTiers(params);
  if (tiers.length === 0) {
    return renderTermsValueHtml(capitalizeWords(formatRateSummary(params)));
  }

  if (tiers.length === 1) {
    const only = tiers[0];
    const count = only?.referral_count;
    if (count == null || count === "") {
      return `<span class="terms-value-line">${escapeHtml(formatRateLine(Number(only?.rate_cents || 0)))}</span>`;
    }
  }

  return tiers
    .map((tier, index) => {
      const rate = formatRateLine(Number(tier?.rate_cents || 0));
      const count = tier?.referral_count;
      const tierLabel = `Tier ${index + 1}:`;
      let rest;

      if (count == null || count === "") {
        rest = index === 0 ? rate : `${rate} for all remaining Qualified Referrals`;
      } else if (index === 0) {
        rest = `${rate} for first ${count} Qualified Referrals`;
      } else {
        rest = `${rate} for next ${count} Qualified Referrals`;
      }

      return `<span class="terms-value-line"><strong>${escapeHtml(tierLabel)}</strong> ${escapeHtml(capitalizeWords(rest))}</span>`;
    })
    .join("");
}

function renderTermCard(id, label, value, tooltip) {
  const displayValue = capitalizeWords(value);
  const lines = renderTermsValueHtml(displayValue);

  return `<article class="term-card">
    <div class="term-card-head">
      <span class="term-label">${escapeHtml(label)}</span>
      <button type="button" class="term-help" data-term-tip="${id}" data-term-tip-label="${escapeHtml(label)}" data-term-tip-text="${escapeHtml(tooltip)}" aria-haspopup="dialog" aria-label="Learn more about ${escapeHtml(label)}" aria-expanded="false">?</button>
    </div>
    <div class="term-value">${lines}</div>
  </article>`;
}

export function renderAgreementTermsSummary(params, profile) {
  const cards = [
    renderTermCard(
      "qualified",
      "Qualified Referral",
      formatQualifiedReferralSummary(params),
      TOOLTIPS.qualified_referral
    ),
    renderTermCard("rate", "Rate", formatRateSummary(params), TOOLTIPS.rate),
    renderTermCard("tier-cap", "Tier Cap", formatTierCapSummary(params), TOOLTIPS.tier_cap),
    renderTermCard(
      "payout-threshold",
      "Payout Threshold",
      formatPayoutThresholdSummary(params),
      TOOLTIPS.payout_threshold
    ),
    renderTermCard(
      "status",
      "Status",
      formatAmbassadorStatusSummary(profile, { agreementRequired: true }),
      TOOLTIPS.status
    ),
  ].join("");

  return `<div class="terms-summary">
    <h3 class="terms-summary-title">Current Ambassador Terms</h3>
    <p class="terms-summary-lede">Review your current ambassador settings before accepting the agreement.</p>
    <div class="terms-summary-grid">${cards}</div>
    <p class="terms-summary-footer">These are your current ambassador settings. Program terms may change over time as described in the agreement. Your Ambassador Dashboard always shows the current terms.</p>
  </div>`;
}

const NO_TIER_CAP_AT_ACCEPTANCE = "No Cap Set At Time of Agreement";

function pickDisplayValue(...candidates) {
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (text) return text;
  }
  return "";
}

function formatTierCapSnapshotDisplay(params, { tier_cap_display } = {}) {
  const fromSnapshot = pickDisplayValue(
    params?.tier_cap_snapshot_display,
    tier_cap_display
  );
  if (fromSnapshot) return fromSnapshot;

  const cents = params?.tier_cap_cents ?? params?.maximum_spend_cents;
  if (cents == null || Number.isNaN(Number(cents))) {
    return NO_TIER_CAP_AT_ACCEPTANCE;
  }

  return formatTierCapSummary(params);
}

function formatPayoutThresholdSnapshotDisplay(params, { payout_threshold_display } = {}) {
  const fromSnapshot = pickDisplayValue(
    params?.payout_threshold_snapshot_display,
    payout_threshold_display
  );
  if (fromSnapshot) return fromSnapshot;

  const summary = formatPayoutThresholdSummary(params);
  const raw = String(params?.payout_threshold || "").trim();
  if (summary !== "No payout threshold" || !raw) return summary;
  if (raw.length > 48) return "Threshold-based eligibility";
  return summary;
}

export function normalizeProgramParameters(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "object" && parsed ? parsed : null;
    } catch (_e) {
      return null;
    }
  }
  return null;
}

export function programParametersRows(params) {
  const normalized = normalizeProgramParameters(params);
  if (!normalized) return [];
  return [
    ["Qualified Referral", capitalizeWords(formatQualifiedReferralSummary(normalized))],
    ["Rate", capitalizeWords(formatRateSummary(normalized))],
    ["Tier Cap", capitalizeWords(formatTierCapSummary(normalized))],
    ["Payout Threshold", capitalizeWords(formatPayoutThresholdSummary(normalized))],
    ["Last Updated", formatDateTime(normalized.last_updated)],
  ];
}

export function programParametersSnapshotRows(params, display = {}) {
  const normalized = normalizeProgramParameters(params);
  if (!normalized) return [];
  return [
    ["Qualified Referral", capitalizeWords(formatQualifiedReferralSummary(normalized))],
    ["Rate", capitalizeWords(formatRateSummary(normalized))],
    ["Tier Cap", formatTierCapSnapshotDisplay(normalized, display)],
    ["Payout Threshold", formatPayoutThresholdSnapshotDisplay(normalized, display)],
    ["Last Updated", formatDateTime(normalized.last_updated)],
  ];
}

export function renderProgramParametersSnapshot(params, display = {}) {
  const normalized = normalizeProgramParameters(params);
  if (!normalized) return `<p class="muted">No program parameters on file.</p>`;
  const rows = programParametersSnapshotRows(normalized, display)
    .map(
      ([label, value]) =>
        `<div class="terms-row"><dt>${escapeHtml(label)}</dt><dd>${renderTermsValueHtml(value)}</dd></div>`
    )
    .join("");
  return `<div class="terms-grid snapshot-terms-grid">${rows}</div>`;
}

export function renderProgramTermsCard(params, { reminder = true } = {}) {
  const rows = programParametersRows(params)
    .map(
      ([label, value]) =>
        `<div class="terms-row"><dt>${escapeHtml(label)}</dt><dd>${renderTermsValueHtml(value)}</dd></div>`
    )
    .join("");
  const reminderHtml = reminder
    ? `<p class="terms-reminder">Program terms, rates, qualification requirements, and Tier Caps may change from time to time. The current terms shown here apply immediately when posted.</p>`
    : `<p class="terms-reminder">These are the current Ambassador Program settings applicable to your participation. Program settings may change over time as described in the Ambassador Program Agreement. The current settings displayed in your Ambassador Dashboard are always authoritative.</p>`;
  return `<div class="terms-grid">${rows}</div>${reminderHtml}`;
}

let termTipOverlay = null;
let termTipTrigger = null;

function ensureTermTipOverlay() {
  if (termTipOverlay) return termTipOverlay;

  termTipOverlay = document.createElement("div");
  termTipOverlay.id = "term-tip-overlay";
  termTipOverlay.className = "term-tip-overlay";
  termTipOverlay.hidden = true;
  termTipOverlay.innerHTML = `<div class="term-tip-backdrop" data-term-tip-close tabindex="-1" aria-hidden="true"></div>
    <div class="term-tip-card" role="dialog" aria-modal="true" aria-labelledby="term-tip-overlay-title">
      <button type="button" class="term-tip-close" data-term-tip-close aria-label="Close">×</button>
      <h4 id="term-tip-overlay-title" class="term-tip-overlay-title"></h4>
      <p class="term-tip-overlay-body"></p>
      <button type="button" class="btn secondary term-tip-dismiss" data-term-tip-close>Got it</button>
    </div>`;
  document.body.appendChild(termTipOverlay);

  termTipOverlay.querySelectorAll("[data-term-tip-close]").forEach((el) => {
    el.addEventListener("click", hideTermTipOverlay);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && termTipOverlay && !termTipOverlay.hidden) hideTermTipOverlay();
  });

  return termTipOverlay;
}

function showTermTipOverlay(label, text, trigger) {
  const overlay = ensureTermTipOverlay();
  termTipTrigger = trigger || null;
  overlay.querySelector(".term-tip-overlay-title").textContent = label;
  overlay.querySelector(".term-tip-overlay-body").textContent = text;
  overlay.hidden = false;
  document.body.classList.add("term-tip-open");
  if (trigger) trigger.setAttribute("aria-expanded", "true");
  overlay.querySelector(".term-tip-dismiss")?.focus();
}

function hideTermTipOverlay() {
  if (!termTipOverlay || termTipOverlay.hidden) return;
  termTipOverlay.hidden = true;
  document.body.classList.remove("term-tip-open");
  document.querySelectorAll(".term-help[aria-expanded='true']").forEach((el) => {
    el.setAttribute("aria-expanded", "false");
  });
  if (termTipTrigger && typeof termTipTrigger.focus === "function") termTipTrigger.focus();
  termTipTrigger = null;
}

export function wireTermTips(root = document) {
  if (root.dataset.termTipsWired) return;
  root.dataset.termTipsWired = "1";
  ensureTermTipOverlay();

  root.addEventListener("click", (ev) => {
    const button = ev.target.closest(".term-help[data-term-tip]");
    if (!button || !root.contains(button)) return;
    ev.preventDefault();
    ev.stopPropagation();
    showTermTipOverlay(
      button.getAttribute("data-term-tip-label") || "Details",
      button.getAttribute("data-term-tip-text") || "",
      button
    );
  });
}
