import {
  copyText,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatLedgerValue,
  formatMoney,
} from "./format.js";
import { renderImageOrFallback } from "./media.js";
import { wireEditReferralCode } from "../shared/referral-code-edit.js";
import { enrichPartnerMedia } from "./enrich-media.js?v=20260617e";
import { pickUsablePhotoUrl } from "./media.js";
import { partnerMediaDebug } from "./media-debug.js";
import {
  loadPartnerVenueAnalytics,
  buildInsightsFromDashboard,
  buildInsightsPayload,
} from "./venue-analytics.js?v=20260615";
import {
  renderPartnerHero,
  renderPortalTabs,
  renderPartnerOverviewTab,
  renderPartnerVenuesTab,
  renderPartnerEventsTab,
  isValidPortalTab,
  wireAgreementHistory,
  wireNetworkDetails,
} from "./dashboard-sections.js?v=20260617c";
import { wireAllVenueVisitHistories, wireUserConnectionActions } from "./venue-visitors.js?v=20260617k";
import { wireAllVenueWalls } from "./venue-wall.js?v=20260617k";

function readTabFromUrl() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return isValidPortalTab(tab) ? tab : "overview";
}

function setTabInUrl(tab) {
  const url = new URL(window.location.href);
  if (tab === "overview") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url);
}

function wireLeaveModal(partnerId, { showModal, hideModal, supabase, onLeft }) {
  document.getElementById("leave-open")?.addEventListener("click", () => {
    showModal(
      "Leave Partner Program",
      `<p>Are you sure you want to leave the Kami Partner Program?</p>
       <p class="muted">You will stop participating as a partner for future referrals and portal access. Previously approved earnings remain eligible for payout under the Program Agreement.</p>
       <label for="leave-confirm">Type <strong>LEAVE</strong> to confirm</label>
       <input id="leave-confirm" type="text" autocomplete="off" />
       <div id="leave-error" class="msg err" hidden role="alert"></div>
       <button type="button" class="btn" id="leave-submit" disabled>Leave Partner Program</button>`
    );

    const input = document.getElementById("leave-confirm");
    const submit = document.getElementById("leave-submit");
    input?.addEventListener("input", () => {
      if (submit) submit.disabled = input.value.trim() !== "LEAVE";
    });
    submit?.addEventListener("click", async () => {
      const err = document.getElementById("leave-error");
      const confirmation = document.getElementById("leave-confirm")?.value.trim() || "";
      if (submit) submit.disabled = true;
      if (err) err.hidden = true;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      let payload = { ok: false };
      try {
        const response = await fetch("/api/partner/terminate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
          },
          body: JSON.stringify({ partner_id: partnerId, confirmation }),
        });
        payload = await response.json();
      } catch (_e) {
        payload = { ok: false, error: "request_failed" };
      }

      if (!payload.ok) {
        const { data, error } = await supabase.rpc("terminate_my_partner_participation", {
          p_partner_id: partnerId,
          p_confirmation: confirmation,
        });
        if (error) {
          if (err) {
            err.textContent = error.message || "Could not leave the program.";
            err.hidden = false;
          }
          if (submit) submit.disabled = false;
          return;
        }
        payload = data || payload;
      }

      if (!payload.ok) {
        if (err) {
          err.textContent = payload.error || "Could not leave the program.";
          err.hidden = false;
        }
        if (submit) submit.disabled = false;
        return;
      }

      hideModal();
      onLeft();
    });
  });
}

function updatePortalTabUi(tab) {
  document.querySelectorAll(".portal-tab[data-portal-tab]").forEach((el) => {
    const on = el.getAttribute("data-portal-tab") === tab;
    el.classList.toggle("is-active", on);
    el.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function wirePortalTabs(onTabSelect) {
  document.querySelectorAll(".portal-tab[data-portal-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-portal-tab") || "overview";
      if (!isValidPortalTab(tab)) return;
      onTabSelect(tab);
    });
  });
}

async function safeRpc(rpc, name, args = {}) {
  try {
    return await rpc(name, args);
  } catch (error) {
    return { ok: false, error: error?.message || "rpc_failed" };
  }
}

function setCardPhoto(
  card,
  url,
  {
    fallbackText = "?",
    imgClass = "venue-photo",
    fallbackClass = "venue-photo venue-photo-fallback",
    placeId = null,
  } = {}
) {
  const usable = pickUsablePhotoUrl(url);
  const existing = card.querySelector(".venue-photo, .venue-photo-fallback, .event-photo, .event-photo-fallback");

  partnerMediaDebug("setCardPhoto", {
    place_id: placeId,
    incoming_url: url,
    final_src: usable || null,
    has_existing_node: Boolean(existing),
    skipped: !existing || !usable,
  });

  if (!existing || !usable) return;

  const img = document.createElement("img");
  img.className = imgClass;
  img.src = usable;
  img.alt = "";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.dataset.mediaFallback = String(fallbackText || "?")[0] || "?";
  img.onerror = () => {
    partnerMediaDebug("setCardPhoto.onerror", {
      place_id: placeId,
      failed_src: img.src,
    });
    const fallback = document.createElement("div");
    fallback.className = fallbackClass;
    fallback.textContent = img.dataset.mediaFallback || "?";
    fallback.setAttribute("aria-hidden", "true");
    img.replaceWith(fallback);
  };
  existing.replaceWith(img);
}

function applyPartnerMedia(root, { dashboard, eventsPayload }) {
  if (!root) return;

  for (const venue of dashboard?.venues || []) {
    if (!venue?.place_id) continue;
    const card =
      root.querySelector(`[data-place-id="${venue.place_id}"]`) ||
      root.querySelector(`[data-venue-detail="${venue.place_id}"]`)?.closest(".venue-card");
    if (!card) continue;
    setCardPhoto(card, venue.photo_url, {
      fallbackText: venue.name || "V",
      placeId: venue.place_id,
    });
  }

  for (const event of eventsPayload?.events || []) {
    const url = event.display_image_url || event.image_url;
    if (!event?.event_id) continue;
    const card = root.querySelector(`[data-event-detail="${event.event_id}"]`)?.closest(".venue-card, .event-card");
    if (!card) continue;
    setCardPhoto(card, url, {
      fallbackText: event.name || "E",
      imgClass: "event-photo",
      fallbackClass: "event-photo event-photo-fallback",
    });
  }
}

export async function renderPartnerDashboard(ctx) {
  const {
    rpc,
    setRoot,
    showModal,
    hideModal,
    supabase,
    partnerId,
    switcherHtml,
    activeTab: initialTab,
    setActiveTab,
    syncPartnerNav,
    wirePartnerSwitcher,
    onDashboardLocked,
    onLeft,
    logout,
  } = ctx;

  const activeTab = isValidPortalTab(initialTab) ? initialTab : readTabFromUrl();
  const pid = partnerId;

  const [dashboardResult, referrals, payouts, ledger, history, eventsResult, insightsResult, storeRewardsResult, outreachResult] =
    await Promise.all([
      safeRpc(rpc, "get_my_partner_dashboard", { p_partner_id: pid }),
      safeRpc(rpc, "get_my_partner_referrals", { p_partner_id: pid }),
      safeRpc(rpc, "get_my_partner_payout_history", { p_partner_id: pid }),
      safeRpc(rpc, "get_my_partner_change_ledger", { p_partner_id: pid }),
      safeRpc(rpc, "get_my_partner_agreement_history", { p_partner_id: pid }),
      safeRpc(rpc, "get_my_partner_events", { p_partner_id: pid }),
      safeRpc(rpc, "get_my_partner_insights", { p_partner_id: pid }),
      safeRpc(rpc, "get_my_partner_store_rewards", { p_partner_id: pid }),
      safeRpc(rpc, "get_my_partner_outreach_recent", { p_partner_id: pid, p_limit: 20 }),
    ]);

  let dashboard = dashboardResult;
  let eventsPayload = eventsResult?.ok === false ? { events: [] } : eventsResult;

  if (!dashboard?.ok) {
    if (dashboard?.error === "dashboard_locked") {
      onDashboardLocked(dashboard.agreement_status);
      return;
    }
    throw new Error(dashboard?.error || "dashboard_load_failed");
  }

  const h = dashboard.header || {};
  const referral = dashboard.referral || {};
  const programParameters =
    dashboard.program_parameters || dashboard.program?.program_parameters || {};
  const insights = buildInsightsFromDashboard(dashboard, insightsResult);
  const storeRewards =
    storeRewardsResult?.ok === false ? [] : storeRewardsResult?.rewards || [];
  const outreach = outreachResult?.ok === false ? { events: [], daily: {} } : outreachResult;

  let liveInsights = insights;

  const avatar = renderImageOrFallback({
    url: h.avatar_url,
    fallbackText: h.display_name || "P",
    imgClass: "avatar",
    fallbackClass: "avatar avatar-fallback",
  });

  const referralRows = (referrals?.referrals || [])
    .map((row) => {
      const avatarCell = renderImageOrFallback({
        url: row.avatar_url,
        fallbackText: row.name || "?",
        imgClass: "table-avatar",
        fallbackClass: "table-avatar table-avatar-fallback",
      });
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
    `<tr><td colspan="7" class="empty-cell">No referrals yet. Share your partner referral link when you're ready to grow the Kami community.</td></tr>`;

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
    payoutRows || `<tr><td colspan="9" class="empty-cell">No payout records yet.</td></tr>`;

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
    ledgerRows || `<tr><td colspan="5" class="empty-cell">No program updates recorded yet.</td></tr>`;

  const ledgerEntries = Array.isArray(ledger?.ledger) ? ledger.ledger : [];

  let currentTab = activeTab;
  let liveDashboard = dashboard;
  let liveEventsPayload = eventsPayload;

  const tabRenderers = {
    overview: () =>
      renderPartnerOverviewTab({
        venues: liveDashboard.venues,
        events: liveEventsPayload?.events,
        insights: liveInsights,
        outreach,
        storeRewards,
        referral,
        metrics: liveDashboard.metrics,
        programParameters,
        referralsTable,
        payoutTable,
        ledgerTable,
        ledgerEntries,
        history,
      }),
    venues: () =>
      renderPartnerVenuesTab({
        venues: liveDashboard.venues,
        insights: liveInsights,
      }),
    events: () =>
      renderPartnerEventsTab({
        events: liveEventsPayload?.events,
        insights: liveInsights,
      }),
  };

  function renderActiveTabContent(tab) {
    const panel = document.getElementById("portal-tab-content");
    if (!panel) return;
    const key = isValidPortalTab(tab) ? tab : "overview";
    panel.innerHTML = tabRenderers[key]?.() || tabRenderers.overview();
  }

  function wireOverviewTabActions() {
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
      partnerId: pid,
      onUpdated: ({ code, link }) => {
        referral.code = code;
        referral.link = link;
      },
    });
    wireAgreementHistory(history, { showModal });
    wireLeaveModal(pid, { showModal, hideModal, supabase, onLeft });

    const overviewPanel = document.getElementById("portal-tab-content");
    const connectionRequests = overviewPanel?.querySelector("[data-connection-requests]");
    if (connectionRequests) {
      wireUserConnectionActions(connectionRequests, {
        rpc,
        supabase,
        partnerId: pid,
        showModal,
        onActionComplete: () => showTab("overview"),
      });
    }
  }

  function wireTabPanelActions(tab) {
    if (tab === "overview") {
      wireOverviewTabActions();
      return;
    }
    if (tab === "venues" || tab === "events") {
      wireNetworkDetails({
        venues: liveDashboard.venues,
        events: liveEventsPayload?.events,
        insights: liveInsights,
        showModal,
      });
    }
    if (tab === "venues") {
      wireAllVenueVisitHistories({
        rpc,
        supabase,
        partnerId: pid,
        root: document.getElementById("portal-tab-content"),
        showModal,
      });
      void rpc("kami_resolve_auth_app_user_id")
        .then((appUserId) => {
          wireAllVenueWalls({
            rpc,
            supabase,
            partnerId: pid,
            appUserId,
            root: document.getElementById("portal-tab-content"),
            showModal,
          });
        })
        .catch(() => {
          wireAllVenueWalls({
            rpc,
            supabase,
            partnerId: pid,
            appUserId: null,
            root: document.getElementById("portal-tab-content"),
            showModal,
          });
        });
    }
  }

  function showTab(tab) {
    const next = isValidPortalTab(tab) ? tab : "overview";
    currentTab = next;
    setActiveTab(next);
    setTabInUrl(next);
    updatePortalTabUi(next);
    renderActiveTabContent(next);
    wireTabPanelActions(next);
    applyPartnerMedia(document.getElementById("partner-root"), {
      dashboard: liveDashboard,
      eventsPayload: liveEventsPayload,
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  document.body.classList.add("partner-dashboard");
  document.body.classList.remove("partner-is-public");

  const heroStats = {
    venuesCount: (dashboard.venues || []).length,
    eventsCount: (eventsPayload?.events || []).length,
    referralEarningsCents: dashboard.metrics?.lifetime_earnings_cents ?? 0,
  };

  setRoot(`
    ${switcherHtml}
    ${renderPartnerHero(h, avatar, heroStats)}
    ${renderPortalTabs(currentTab)}
    <div id="portal-tab-content" class="portal-tab-content" role="tabpanel"></div>
  `);

  wirePartnerSwitcher();
  wirePortalTabs(showTab);
  showTab(currentTab);
  syncPartnerNav(true);

  function refreshLiveData({ rerenderTab = true } = {}) {
    applyPartnerMedia(document.getElementById("partner-root"), {
      dashboard: liveDashboard,
      eventsPayload: liveEventsPayload,
    });
    if (rerenderTab) {
      renderActiveTabContent(currentTab);
      wireTabPanelActions(currentTab);
    }
  }

  void Promise.all([
    enrichPartnerMedia(supabase, pid, liveDashboard, liveEventsPayload),
    loadPartnerVenueAnalytics(rpc, pid, liveDashboard.venues),
  ])
    .then(([enriched, venueAnalytics]) => {
      liveDashboard = enriched.dashboard;
      liveEventsPayload = enriched.eventsPayload;
      liveInsights = buildInsightsPayload(liveInsights, venueAnalytics, liveDashboard.venues);
      refreshLiveData();
    })
    .catch(() => {
      refreshLiveData({ rerenderTab: false });
    });
}

export { readTabFromUrl };
