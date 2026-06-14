import {
  escapeHtml,
  formatAgreementVersionLabel,
  formatDate,
  formatDateTime,
  formatLedgerValue,
  formatMoney,
} from "./format.js";
import {
  normalizeProgramParameters,
  programParametersRows,
  renderProgramParametersSnapshot,
  renderRateTiersHtml,
} from "./terms-summary.js";

function renderHeroPill(label, value) {
  return `<span class="hero-summary-pill"><span class="hero-summary-pill-label">${escapeHtml(label)}</span><span class="hero-summary-pill-value">${escapeHtml(value)}</span></span>`;
}

export function renderPortalSectionGroup(title, bodyHtml) {
  return `<div class="portal-section-group">
    <h2 class="portal-section-group-title">${escapeHtml(title)}</h2>
    <div class="portal-section-group-body">${bodyHtml}</div>
  </div>`;
}

function renderMetricChip(label, value) {
  return `<article class="metric-chip">
    <p class="metric-chip-label">${escapeHtml(label)}</p>
    <p class="metric-chip-value">${escapeHtml(value)}</p>
  </article>`;
}

function renderMetricStrip(items) {
  return `<div class="metric-strip">${items.map(([label, value]) => renderMetricChip(label, value)).join("")}</div>`;
}

function renderSubduedMetricChip(label, value) {
  return `<article class="metric-chip metric-chip--subdued">
    <p class="metric-chip-label">${escapeHtml(label)}</p>
    <p class="metric-chip-value metric-chip-value--subdued">${escapeHtml(value)}</p>
  </article>`;
}

function renderSubduedMetricStrip(items) {
  return `<div class="metric-strip metric-strip--subdued">${items
    .map(([label, value]) => renderSubduedMetricChip(label, value))
    .join("")}</div>`;
}

export function formatCanonicalReferralLink(code) {
  const trimmed = String(code || "").trim();
  if (!trimmed) return "";
  return `www.kamisocial.com/invite/${trimmed}`;
}

export function formatCopyReferralLink(code, fallbackLink = "") {
  const trimmed = String(code || "").trim();
  if (trimmed) return `https://www.kamisocial.com/invite/${trimmed}`;
  return String(fallbackLink || "").trim();
}

function countReferralsByStatus(referrals, predicate) {
  return (referrals || []).filter(predicate).length;
}

function isQualifiedStatus(status) {
  const key = String(status || "").toLowerCase();
  return key === "qualified" || key === "paid";
}

function isPaidStatus(status) {
  return String(status || "").toLowerCase() === "paid";
}

export function deriveReferralStats(referrals = []) {
  const list = Array.isArray(referrals) ? referrals : [];
  return {
    signupCount: list.length,
    qualifiedCount: countReferralsByStatus(list, (row) => isQualifiedStatus(row.qualification_status)),
    paidCount: countReferralsByStatus(list, (row) => isPaidStatus(row.qualification_status)),
  };
}

export function renderAmbassadorHero({ header, avatarHtml, heroMeta = {} }) {
  const h = header || {};
  const meta = heroMeta || {};
  const handleLine = h.handle ? `@${h.handle}` : "";
  const emailLine = h.email || "";
  const identityLine = [handleLine, emailLine].filter(Boolean).join(" · ");

  const pills = [
    meta.sinceLabel ? renderHeroPill("Ambassador since", meta.sinceLabel) : "",
    meta.tierLabel ? renderHeroPill("Current tier", meta.tierLabel) : "",
    meta.lifetimeQualifiedLabel
      ? renderHeroPill("Lifetime qualified", meta.lifetimeQualifiedLabel)
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `<section class="panel dashboard-header dashboard-hero">
    <div class="dashboard-header-main">
      <div class="eyebrow dashboard-eyebrow">Ambassador Dashboard</div>
      <div class="header-main dashboard-hero-main">
        ${avatarHtml
          .replace('class="avatar"', 'class="avatar dashboard-hero-avatar"')
          .replace(
            'class="avatar avatar-fallback"',
            'class="avatar avatar-fallback dashboard-hero-avatar"'
          )}
        <div class="header-copy dashboard-hero-copy">
          <h1>${escapeHtml(h.display_name || "Ambassador")}</h1>
          ${identityLine ? `<p class="muted dashboard-hero-meta">${escapeHtml(identityLine)}</p>` : ""}
          ${pills ? `<div class="hero-summary-pills" aria-label="Ambassador summary">${pills}</div>` : ""}
        </div>
      </div>
    </div>
    <span class="status-badge dashboard-hero-status">${escapeHtml(h.status_label || "Ambassador")}</span>
  </section>`;
}

export function renderGettingStartedCard({
  header,
  referral,
  referrals = [],
  metrics,
  payouts = [],
}) {
  const h = header || {};
  const isActive =
    h.program_status === "active" ||
    String(h.status_label || "")
      .toLowerCase()
      .includes("active");
  const hasCode = Boolean(String(referral?.code || "").trim());
  const referralStats = deriveReferralStats(referrals);
  const hasPayout =
    Number(metrics?.total_paid_lifetime_cents || 0) > 0 ||
    (Array.isArray(payouts) && payouts.some((row) => Number(row?.paid_amount_cents || 0) > 0));

  const steps = [
    { label: "Ambassador approved / account active", done: isActive },
    { label: "Referral code created", done: hasCode },
    { label: "First referral signup", done: referralStats.signupCount > 0 },
    { label: "First qualified referral", done: referralStats.qualifiedCount > 0 },
    { label: "First payout earned", done: hasPayout },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount >= steps.length) return "";

  const items = steps
    .map(
      (step) =>
        `<li class="getting-started-step${step.done ? " is-done" : ""}">
          <span class="getting-started-mark" aria-hidden="true">${step.done ? "✓" : "○"}</span>
          <span>${escapeHtml(step.label)}</span>
        </li>`
    )
    .join("");

  return `<section class="panel panel-primary getting-started-card">
    <h2>Getting Started</h2>
    <p class="section-lede">Track your progress as you grow your Kami ambassador network.</p>
    <ul class="getting-started-list">${items}</ul>
  </section>`;
}

export function renderReferralLinkSection(referral) {
  const code = String(referral?.code || "").trim();
  const displayLink = formatCanonicalReferralLink(code);
  const referralLinkHtml = displayLink
    ? `<a class="copy-value copy-value-link" id="ref-link" href="https://${escapeHtml(displayLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(displayLink)}</a>`
    : `<p class="copy-value copy-value-link" id="ref-link">—</p>`;

  return `<section class="panel panel-primary referral-link-card">
    <h2 class="portal-card-title">Your Referral Link</h2>
    <p class="section-lede">Share your link with people who would genuinely enjoy Kami. This is your main ambassador action.</p>
    <div class="copy-grid referral-link-grid">
      <div>
        <label>Referral Code</label>
        <p class="copy-value" id="ref-code">${escapeHtml(code || "—")}</p>
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
  </section>`;
}

export function renderPerformanceSection(metrics) {
  const m = metrics || {};
  const primary = renderMetricStrip([
    ["Qualified referrals (month)", String(m.current_month_qualified_referrals ?? 0)],
    ["Pending earnings", formatMoney(m.pending_earnings_cents)],
    ["Lifetime earnings", formatMoney(m.lifetime_earnings_cents)],
    ["Total paid lifetime", formatMoney(m.total_paid_lifetime_cents)],
  ]);

  const secondary = renderSubduedMetricStrip([
    ["Approved earnings", formatMoney(m.approved_earnings_cents)],
    [
      "Current tier cap",
      m.monthly_earnings_limit_cents != null ? formatMoney(m.monthly_earnings_limit_cents) : "—",
    ],
    [
      "Remaining before tier cap",
      m.remaining_eligible_earnings_cents != null
        ? formatMoney(m.remaining_eligible_earnings_cents)
        : "—",
    ],
    ["Paid this month", formatMoney(m.paid_this_month_cents)],
  ]);

  return `<section class="panel panel-secondary panel-compact">
    <h3 class="portal-card-title">Performance</h3>
    <p class="section-lede">Your ambassador earnings and referral activity at a glance.</p>
    ${primary}
    <div class="performance-secondary">
      <p class="subsection-title performance-secondary-label">Additional details</p>
      ${secondary}
    </div>
  </section>`;
}

function renderFunnelRow(label, value, { muted = false } = {}) {
  return `<div class="funnel-row${muted ? " funnel-row--muted" : ""}">
    <span class="funnel-row-label">${escapeHtml(label)}</span>
    <span class="funnel-row-value">${escapeHtml(value)}</span>
  </div>`;
}

export function renderReferralFunnel(referrals = []) {
  const stats = deriveReferralStats(referrals);
  const rows = [
    renderFunnelRow("Signups", stats.signupCount > 0 ? String(stats.signupCount) : "0"),
    renderFunnelRow(
      "Qualified referrals",
      stats.qualifiedCount > 0 ? String(stats.qualifiedCount) : "0"
    ),
    renderFunnelRow("Paid referrals", stats.paidCount > 0 ? String(stats.paidCount) : "0"),
  ].join("");

  return `<section class="panel panel-compact panel-secondary">
    <h3 class="portal-card-title">Referral Funnel</h3>
    <p class="section-lede muted">How your referrals are progressing.</p>
    <div class="funnel-card">${rows}</div>
  </section>`;
}

export function renderReferralsTableRows(referrals = []) {
  return (referrals || [])
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
}

export function renderReferralsSection(referrals = []) {
  const list = Array.isArray(referrals) ? referrals : [];
  if (!list.length) {
    return `<section class="panel panel-compact">
      <h3 class="portal-card-title">Referrals</h3>
      <div class="empty-state compact-empty referrals-empty">
        <p>No referrals yet. Share your referral link to start building your Kami network.</p>
      </div>
    </section>`;
  }

  return `<section class="panel table-panel">
    <h3 class="portal-card-title">Referrals</h3>
    <p class="section-lede">${list.length === 1 ? "1 referral attributed to your link." : `${list.length} referrals attributed to your link.`}</p>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Name</th><th>Handle</th><th>Status</th><th>Rate/Tier</th><th>Earnings</th><th>Notes</th></tr></thead><tbody>${renderReferralsTableRows(list)}</tbody></table></div>
  </section>`;
}

export function renderPayoutTableRows(payouts = []) {
  return (payouts || [])
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
}

export function renderEarningsSection({ metrics, payouts = [] }) {
  const m = metrics || {};
  const list = Array.isArray(payouts) ? payouts : [];
  const summary = renderMetricStrip([
    ["Approved earnings", formatMoney(m.approved_earnings_cents)],
    ["Pending earnings", formatMoney(m.pending_earnings_cents)],
    ["Paid this month", formatMoney(m.paid_this_month_cents)],
  ]);

  if (!list.length) {
    return `<section class="panel panel-compact panel-secondary">
      <h3 class="portal-card-title">Earnings</h3>
      ${summary}
      <div class="empty-state compact-empty earnings-empty">
        <p>No payout records yet. Approved earnings become eligible for payout once you reach the program threshold.</p>
      </div>
    </section>`;
  }

  const payoutTable = renderPayoutTableRows(list);
  return `<section class="panel panel-secondary panel-compact">
    <h3 class="portal-card-title">Earnings</h3>
    ${summary}
    <details class="portal-details" open>
      <summary class="portal-details-summary">Payout History (${list.length})</summary>
      <div class="table-wrap"><table><thead><tr><th>Period</th><th>Qualified</th><th>Gross</th><th>Adjustments</th><th>Approved</th><th>Paid</th><th>Paid Date</th><th>Status</th><th>Notes</th></tr></thead><tbody>${payoutTable}</tbody></table></div>
    </details>
  </section>`;
}

function compactTermsValue(value) {
  return escapeHtml(String(value || "—"));
}

function renderProgramTermsValueHtml(label, value, normalized) {
  if (label === "Rate") return renderRateTiersHtml(normalized);
  return compactTermsValue(value);
}

export function renderProgramTermsCompact(programParameters) {
  const normalized = normalizeProgramParameters(programParameters);
  if (!normalized) {
    return `<section class="panel panel-compact panel-secondary">
      <h3 class="portal-card-title">Current Program Terms</h3>
      <p class="muted">Program terms are not available right now.</p>
    </section>`;
  }

  const summaryRows = programParametersRows(normalized)
    .map(
      ([label, value]) =>
        `<div class="terms-compact-row"><dt>${escapeHtml(label)}</dt><dd>${renderProgramTermsValueHtml(label, value, normalized)}</dd></div>`
    )
    .join("");

  return `<section class="panel panel-compact panel-secondary">
    <h3 class="portal-card-title">Current Program Terms</h3>
    <div class="terms-compact-grid">${summaryRows}</div>
    <p class="terms-reminder">Program terms, rates, qualification requirements, and Tier Caps may change from time to time. The current terms shown here apply immediately when posted.</p>
  </section>`;
}

export function renderProgramUpdates(ledgerTable, ledgerEntries = []) {
  const entries = Array.isArray(ledgerEntries) ? ledgerEntries : [];
  const latest = entries[0];
  const summaryHtml = latest
    ? `<div class="ledger-summary">
        <p class="ledger-summary-type"><strong>${escapeHtml(latest.change_type || "Update")}</strong> · ${formatDateTime(latest.date)}</p>
        <p class="muted ledger-summary-note">${escapeHtml(latest.notes || formatLedgerValue(latest.new_value) || "Program record updated.")}</p>
      </div>`
    : `<p class="muted ledger-summary-empty">No program updates recorded yet.</p>`;

  const paginationSlot = entries.length > 3 ? `<div data-change-ledger-footer></div>` : "";

  return `<section class="panel panel-compact panel-secondary" data-change-ledger>
    <h3 class="portal-card-title">Program Updates</h3>
    <p class="section-lede muted">Agreement acceptances and program setting changes for your ambassador account.</p>
    ${summaryHtml}
    <details class="portal-details">
      <summary class="portal-details-summary">View History</summary>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Change Type</th><th>Previous</th><th>New</th><th>Notes</th></tr></thead><tbody data-change-ledger-body>${ledgerTable}</tbody></table></div>
      ${paginationSlot}
    </details>
  </section>`;
}

export function renderAgreementHistorySection(history) {
  const current = history?.current_agreement;
  const historical = history?.historical_agreements || [];

  const currentAgreementHtml = current
    ? `<div class="history-card history-card--compact">
        <p><strong>${escapeHtml(formatAgreementVersionLabel(current.version))}</strong> · Accepted ${formatDateTime(current.accepted_at)}</p>
        <div class="btn-row">
          <button type="button" class="btn secondary btn-sm" data-view-agreement="current">View Agreement</button>
          <button type="button" class="btn secondary btn-sm" data-view-params="current">View Program Parameters Snapshot</button>
        </div>
      </div>`
    : `<p class="muted">No current agreement acceptance on file.</p>`;

  const historicalHtml = historical.length
    ? historical
        .map(
          (item, idx) => `<div class="history-card history-card--compact">
          <p><strong>${escapeHtml(formatAgreementVersionLabel(item.version))}</strong> · Accepted ${formatDateTime(item.accepted_at)}</p>
          <div class="btn-row">
            <button type="button" class="btn secondary btn-sm" data-view-agreement="hist-${idx}">View Agreement Snapshot</button>
            <button type="button" class="btn secondary btn-sm" data-view-params="hist-${idx}">View Parameters Snapshot</button>
          </div>
        </div>`
        )
        .join("")
    : `<p class="muted">No previous accepted agreements.</p>`;

  return `<section class="panel panel-compact panel-secondary">
    <h3 class="portal-card-title">Agreement History</h3>
    <h4 class="subsection-title">Current Agreement</h4>
    ${currentAgreementHtml}
    <details class="history-collapsible">
      <summary class="history-collapsible-summary">Historical Agreements${historical.length ? ` (${historical.length})` : ""}</summary>
      ${historicalHtml}
    </details>
  </section>`;
}

export function renderSupportSection() {
  return `<section class="panel panel-compact">
    <h3 class="portal-card-title">Support</h3>
    <p>Questions or issues? Contact <a href="mailto:ambassadors@kamisocial.com">ambassadors@kamisocial.com</a>.</p>
  </section>`;
}

export function renderLeaveSection() {
  return `<section class="panel danger-panel panel-compact panel-subdued-danger">
    <h3 class="portal-card-title">Leave Ambassador Program</h3>
    <p class="muted">You will stop earning compensation for future referrals. Previously approved earnings remain eligible for payout under the Program Agreement.</p>
    <button type="button" class="btn secondary btn-danger-outline" id="leave-open">Leave Ambassador Program</button>
  </section>`;
}

export function renderLogoutSection() {
  return `<section class="panel centered-panel panel-compact">
    <button type="button" class="btn secondary" id="logout-btn">Log out</button>
  </section>`;
}

export function wireAgreementHistory(history, { showModal }) {
  const current = history?.current_agreement;
  const historical = history?.historical_agreements || [];

  if (current) {
    document.querySelector('[data-view-agreement="current"]')?.addEventListener("click", () =>
      showModal(
        formatAgreementVersionLabel(current.version),
        `<pre class="modal-pre">${escapeHtml(current.agreement_snapshot)}</pre>`
      )
    );
    document.querySelector('[data-view-params="current"]')?.addEventListener("click", () =>
      showModal(
        "Program Parameters Snapshot",
        renderProgramParametersSnapshot(current.program_parameters_snapshot, {
          payout_threshold_display: current.payout_threshold_display,
          tier_cap_display: current.tier_cap_display,
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
}

export function renderAmbassadorDashboardLayout({
  header,
  avatarHtml,
  heroMeta,
  referral,
  metrics,
  programParameters,
  referrals,
  payouts,
  ledgerTable,
  ledgerEntries,
  history,
}) {
  const referralList = Array.isArray(referrals) ? referrals : [];
  const payoutList = Array.isArray(payouts) ? payouts : [];

  const startSection = renderPortalSectionGroup(
    "Start",
    `${renderGettingStartedCard({
      header,
      referral,
      referrals: referralList,
      metrics,
      payouts: payoutList,
    })}
    ${renderReferralLinkSection(referral)}`
  );

  const performanceSection = renderPortalSectionGroup(
    "Performance",
    `${renderPerformanceSection(metrics)}
    ${renderReferralFunnel(referralList)}
    ${renderProgramTermsCompact(programParameters)}`
  );

  const referralsSection = renderPortalSectionGroup(
    "Referrals",
    renderReferralsSection(referralList)
  );

  const earningsSection = renderPortalSectionGroup(
    "Earnings",
    renderEarningsSection({ metrics, payouts: payoutList })
  );

  const accountSection = renderPortalSectionGroup(
    "Account",
    `${renderProgramUpdates(ledgerTable, ledgerEntries)}
    ${renderAgreementHistorySection(history)}
    ${renderSupportSection()}
    ${renderLeaveSection()}
    ${renderLogoutSection()}`
  );

  return `${renderAmbassadorHero({ header, avatarHtml, heroMeta: heroMeta || {} })}
    ${startSection}
    ${performanceSection}
    ${referralsSection}
    ${earningsSection}
    ${accountSection}`;
}

function resolveCurrentTierLabel(programParameters, lifetimeQualified) {
  const normalized = normalizeProgramParameters(programParameters);
  if (!normalized) return "";

  const tiers = Array.isArray(normalized.rate_tiers) ? normalized.rate_tiers : [];
  if (!tiers.length) {
    const cap = normalized.maximum_spend_cents ?? normalized.tier_cap_cents;
    if (cap != null && !Number.isNaN(Number(cap))) {
      return `Cap ${formatMoney(Number(cap))}/mo`;
    }
    return "";
  }

  let remaining = Number(lifetimeQualified) || 0;
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    const count = tier?.referral_count;
    if (count == null || count === "") {
      return `Tier ${index + 1}`;
    }
    const tierCount = Number(count);
    if (Number.isNaN(tierCount)) continue;
    if (remaining < tierCount) return `Tier ${index + 1}`;
    remaining -= tierCount;
  }

  return tiers.length ? `Tier ${tiers.length}` : "";
}

export function buildHeroMeta({ header, programParameters, referrals, history }) {
  const referralStats = deriveReferralStats(referrals);
  const since =
    history?.current_agreement?.accepted_at ||
    (Array.isArray(history?.historical_agreements) && history.historical_agreements.length
      ? history.historical_agreements[history.historical_agreements.length - 1]?.accepted_at
      : null);

  return {
    sinceLabel: since ? formatDate(since) : "",
    tierLabel: resolveCurrentTierLabel(programParameters, referralStats.qualifiedCount),
    lifetimeQualifiedLabel: String(referralStats.qualifiedCount),
  };
}
