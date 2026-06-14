import { escapeHtml, formatMoney } from "./format.js";
import {
  formatPayoutThresholdSummary,
  formatQualifiedReferralSummary,
  formatRateSummary,
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

export function renderProgramTermsCard(params) {
  const p = params || {};
  const rate =
    p.rate_display ||
    (p.rate_cents_per_registration != null
      ? `${formatMoney(p.rate_cents_per_registration)} per qualified referral`
      : "See your Partner Portal for current rates");
  const threshold = p.payout_threshold || "Contact partners@kamisocial.com";
  const qualification =
    p.qualification_requirements ||
    "Qualified referrals must meet Kami's active-user criteria. Contact partners@kamisocial.com for details.";
  const schedule =
    p.payout_schedule || "Payouts are processed periodically for approved balances that meet the payout threshold.";

  return `<dl class="terms-grid">
    <div class="terms-row"><dt>Referral reward</dt><dd>${escapeHtml(rate)}</dd></div>
    <div class="terms-row"><dt>Payout threshold</dt><dd>${escapeHtml(threshold)}</dd></div>
    <div class="terms-row"><dt>Qualification requirements</dt><dd>${escapeHtml(qualification)}</dd></div>
    <div class="terms-row"><dt>Payout schedule</dt><dd>${escapeHtml(schedule)}</dd></div>
  </dl>`;
}
