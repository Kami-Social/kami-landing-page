import { escapeHtml, formatMoney } from "./format.js";

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

export function renderAgreementTermsSummary(params) {
  return `<section class="panel terms-summary-panel">
    <h3>Program Summary</h3>
    ${renderProgramTermsCard(params)}
  </section>`;
}
