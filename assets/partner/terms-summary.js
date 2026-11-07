import { escapeHtml, formatMoney, formatDateTime } from "./format.js";
import {
  formatPayoutThresholdSummary,
  formatRateSummary,
  normalizeProgramParameters,
} from "../ambassador/terms-summary.js";

const TOOLTIPS = {
  qualified_referral:
    "The qualification requirement currently in effect is completed registration with a valid partner referral attribution, subject to validation, fraud, and eligibility review. Entering a code or creating an account does not by itself qualify a referral. The compensation rate is the rate in effect when registration completes. Kami may change the requirement for later registrations by posting it here and sending notice. Descriptive copy explains the current requirement and does not by itself add an automated condition.",
  rate:
    "The rate shown here is the current Partner Portal parameter. Each referral keeps the rate effective when that referral completed registration. Later changes do not reprice compensation already accrued.",
  payout_threshold:
    "The current payout threshold applies to unpaid compensation that has not already become payable. Raising the threshold does not withdraw a payment obligation that was already triggered, and it does not restart that payment period.",
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

export function formatPartnerQualifiedReferralSummary() {
  return "Completed registration";
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
      formatPartnerQualifiedReferralSummary(),
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
    <p class="terms-summary-footer">These are the current Partner Portal parameters. The qualification requirement currently in effect is completed registration. Each referral keeps the compensation rate and qualification requirement in effect when that referral completed registration, as described in Section 5. Descriptive copy does not by itself add an automated condition. Later changes do not reprice compensation already accrued, and a threshold change does not withdraw a payment obligation that was already triggered.</p>
  </div>`;
}

export function renderProgramNotice(notice) {
  const change = notice?.parameter_change;
  if (!notice || notice.ok === false || !change) return "";
  if (change.status === "pending_notice") {
    return `<p class="terms-reminder">A parameter update is posted in your Partner Portal and is not in effect until the notice email is sent. The terms below remain your current parameters.</p>`;
  }
  if (change.status === "scheduled") {
    const when = change.effective_at ? formatDateTime(change.effective_at) : "the stated effective time";
    return `<p class="terms-reminder">A parameter update is posted and takes effect ${escapeHtml(when)}. The terms below remain current until then.</p>`;
  }
  return "";
}

export function renderProgramTermsCard(params, { reminder = true } = {}) {
  const normalized = normalizeProgramParameters(params) || {};
  const rows = [
    ["Qualified Referral", capitalizeWords(formatPartnerQualifiedReferralSummary())],
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
    ? `<p class="terms-reminder">Kami may change compensation rates, payout thresholds, qualification requirements, and other Program parameters at any time. The qualification requirement currently in effect is completed registration. This Partner Portal shows that requirement, and any descriptive copy explains it without adding an automated condition by itself. Each referral keeps the compensation rate and qualification requirement in effect when that referral completed registration. A change takes effect on its stated effective date, no earlier than when it is posted here and notice has been sent to your account email, and applies to registrations that complete on or after that time. Later changes do not reprice compensation already accrued. A payout-threshold change does not withdraw a payment obligation that was already triggered or restart that payment period.</p>`
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
    ["Qualified Referral", capitalizeWords(formatPartnerQualifiedReferralSummary())],
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
