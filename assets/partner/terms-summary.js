import { escapeHtml, formatMoney, formatDateTime } from "./format.js";
import {
  formatPayoutThresholdSummary,
  formatQualifiedReferralSummary,
  formatRateSummary,
  normalizeProgramParameters,
} from "../ambassador/terms-summary.js";

const TOOLTIPS = {
  qualified_referral:
    "Qualified Referrals are determined by the current criteria shown in your Partner Portal. Criteria may include registration, verification, activity thresholds, retention, fraud screening, or other program requirements.",
  rate:
    "Referral compensation applies only when enabled for your partnership. When enabled, your rate is based on the program settings shown here and the parameters snapshot accepted with this Agreement.",
  payout_threshold:
    "When referral compensation applies, approved earnings become eligible for payout once your unpaid approved balance reaches this amount.",
  payout_schedule:
    "When referral compensation applies, eligible payouts are generally processed according to the schedule shown in your Partner Portal.",
  status:
    "Your partner status determines whether you can access the Partner Portal and participate in the Program.",
};

export function formatPartnerTierCapSummary(params) {
  const cents = params?.tier_cap_cents ?? params?.maximum_spend_cents;
  if (cents == null || Number.isNaN(Number(cents))) return "No tier cap set";
  return `${formatMoney(Number(cents))} monthly cap`;
}

function capitalizeWords(text) {
  if (text == null || text === "" || text === "—") return text;
  return String(text)
    .split("\n")
    .map((line) => line.replace(/(^|[\s+\-/])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase()))
    .join("\n");
}

function renderTermsValueHtml(value) {
  return String(value || "—")
    .split("\n")
    .map((line) => `<span class="terms-value-line">${escapeHtml(line)}</span>`)
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

export function formatPartnerRateSummary(params) {
  const cents = params?.rate_cents_per_registration;
  if (cents == null || Number(cents) === 0) {
    return "Not enabled for this partner";
  }
  return formatRateSummary(params);
}

export function formatPayoutScheduleSummary(params) {
  const text = String(params?.payout_schedule || "").trim();
  if (!text || /contact partners@kamisocial\.com/i.test(text)) {
    return "See Partner Portal";
  }
  const sentence = text.split(".")[0].trim();
  if (sentence.length > 56) return "After payout threshold is reached";
  return sentence;
}

export function formatPartnerStatusSummary(partner, { agreementRequired = false } = {}) {
  if (agreementRequired) return "Pending acceptance";
  const status = String(partner?.status || "").toLowerCase();
  if (status.includes("paused") || status.includes("inactive")) return "Paused";
  if (status.includes("active")) return "Active";
  return "Active";
}

export function renderAgreementTermsSummary(params, partner) {
  const cards = [
    renderTermCard(
      "qualified",
      "Qualified Referral",
      formatQualifiedReferralSummary(params),
      TOOLTIPS.qualified_referral
    ),
    renderTermCard("rate", "Rate", formatPartnerRateSummary(params), TOOLTIPS.rate),
    renderTermCard(
      "payout-threshold",
      "Payout Threshold",
      formatPayoutThresholdSummary(params),
      TOOLTIPS.payout_threshold
    ),
    renderTermCard(
      "payout-schedule",
      "Payout Schedule",
      formatPayoutScheduleSummary(params),
      TOOLTIPS.payout_schedule
    ),
    renderTermCard(
      "status",
      "Status",
      formatPartnerStatusSummary(partner, { agreementRequired: true }),
      TOOLTIPS.status
    ),
  ].join("");

  return `<div class="terms-summary">
    <h3 class="terms-summary-title">Current Partner Terms</h3>
    <p class="terms-summary-lede">Review your current partner settings before accepting the agreement.</p>
    <div class="terms-summary-grid">${cards}</div>
    <p class="terms-summary-footer">These are your current partner settings. Program terms may change over time as described in the agreement. Your Partner Portal always shows the current terms.</p>
  </div>`;
}

export function renderProgramTermsCard(params, { reminder = true } = {}) {
  const normalized = normalizeProgramParameters(params) || {};
  const rows = [
    ["Qualified Referral", capitalizeWords(formatQualifiedReferralSummary(normalized))],
    ["Rate Schedule", capitalizeWords(formatPartnerRateSummary(normalized))],
    ["Tier Cap", capitalizeWords(formatPartnerTierCapSummary(normalized))],
    ["Payout Threshold", capitalizeWords(formatPayoutThresholdSummary(normalized))],
    ["Last Updated", formatDateTime(normalized.last_updated)],
  ]
    .map(
      ([label, value]) =>
        `<div class="terms-row"><dt>${escapeHtml(label)}</dt><dd>${renderTermsValueHtml(value)}</dd></div>`
    )
    .join("");
  const reminderHtml = reminder
    ? `<p class="terms-reminder">Program terms, rates, qualification requirements, and tier caps may change from time to time. The current terms shown here apply when posted. Your Partner Portal always shows the current settings.</p>`
    : "";
  return `<div class="terms-grid">${rows}</div>${reminderHtml}`;
}

export function renderProgramParametersSnapshot(params, display = {}) {
  const normalized = normalizeProgramParameters(params);
  if (!normalized) return `<p class="muted">No program parameters on file.</p>`;
  const threshold =
    display.payout_threshold_display ||
    normalized.payout_threshold ||
    formatPayoutThresholdSummary(normalized);
  const tierCap =
    display.tier_cap_display ||
    formatPartnerTierCapSummary(normalized);
  const rows = [
    ["Qualified Referral", capitalizeWords(formatQualifiedReferralSummary(normalized))],
    ["Rate Schedule", capitalizeWords(formatPartnerRateSummary(normalized))],
    ["Tier Cap", tierCap],
    ["Payout Threshold", capitalizeWords(threshold)],
    ["Last Updated", formatDateTime(normalized.last_updated)],
  ]
    .map(
      ([label, value]) =>
        `<div class="terms-row"><dt>${escapeHtml(label)}</dt><dd>${renderTermsValueHtml(value)}</dd></div>`
    )
    .join("");
  return `<div class="terms-grid snapshot-terms-grid">${rows}</div>`;
}
