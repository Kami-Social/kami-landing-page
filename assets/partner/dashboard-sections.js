import {
  escapeHtml,
  formatAgreementVersionLabel,
  formatDate,
  formatDateTime,
  formatLedgerValue,
  formatMoney,
} from "./format.js";
import { renderImageOrFallback } from "./media.js";
import {
  renderProgramParametersSnapshot,
  renderProgramTermsCard,
} from "./terms-summary.js";
import { renderConnectionAction, renderUserIdentityCell } from "./venue-visitors.js?v=20260617k";

const PORTAL_TABS = ["overview", "venues", "events"];

function formatLocation(venue) {
  const cityState = [venue.city, venue.region].filter(Boolean).join(", ");
  if (cityState) return cityState;
  const parts = [venue.neighborhood, venue.city, venue.region].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return venue.address || "Location not listed";
}

function formatCategory(venue) {
  const parts = [venue.category, venue.subcategory].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Venue";
}

function formatMetric(value, { emptyLabel = "—" } = {}) {
  if (value == null) return emptyLabel;
  const n = Number(value);
  if (Number.isNaN(n)) return emptyLabel;
  return String(n);
}

function formatPeakTime(day, hour) {
  if (!day && hour == null) return "—";
  if (day && hour != null) {
    const h = Number(hour);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${day} · ${hour12} ${suffix}`;
  }
  return day || "—";
}

function venueMetricsMap(insights) {
  const map = new Map();
  for (const row of insights?.venue_metrics || []) {
    if (row?.place_id) map.set(row.place_id, row);
  }
  return map;
}

function eventTimingState(event) {
  const now = Date.now();
  const start = event?.starts_at ? new Date(event.starts_at).getTime() : NaN;
  const end = event?.ends_at ? new Date(event.ends_at).getTime() : NaN;
  if (!Number.isNaN(start) && start > now) return { label: "Upcoming", tone: "good" };
  if (!Number.isNaN(end) && end < now) return { label: "Past", tone: "muted" };
  if (!Number.isNaN(start) && start <= now) return { label: "Live", tone: "good" };
  return { label: "Scheduled", tone: "warn" };
}

function renderInsightCard(label, value, { hint = "" } = {}) {
  return `<article class="metric-card insight-card">
    <p class="metric-label">${escapeHtml(label)}</p>
    <p class="metric-value">${escapeHtml(value)}</p>
    ${hint ? `<p class="metric-hint">${escapeHtml(hint)}</p>` : ""}
  </article>`;
}

function renderSummaryStat(label, value) {
  return `<article class="summary-stat">
    <p class="summary-stat-label">${escapeHtml(label)}</p>
    <p class="summary-stat-value">${escapeHtml(value)}</p>
  </article>`;
}

function renderHeroPill(label, value) {
  return `<span class="hero-summary-pill"><span class="hero-summary-pill-label">${escapeHtml(label)}</span><span class="hero-summary-pill-value">${escapeHtml(value)}</span></span>`;
}

function renderPortalSectionGroup(title, bodyHtml) {
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
  const chips = items
    .map(([label, value]) => renderMetricChip(label, value))
    .join("");
  return `<div class="metric-strip">${chips}</div>`;
}

function resolveVenueMetrics(venue, metricsByPlace) {
  const fromMap = metricsByPlace?.get?.(venue?.place_id);
  return {
    unique_visitors_30d:
      fromMap?.unique_visitors_30d ?? venue?.unique_visitors_30d ?? null,
    total_visits_30d: fromMap?.total_visits_30d ?? venue?.total_visits_30d ?? null,
    first_time_visitors_30d:
      fromMap?.first_time_visitors_30d ?? venue?.first_time_visitors_30d ?? null,
    visitors_this_month:
      fromMap?.visitors_this_month ?? venue?.visitors_this_month ?? null,
    busiest_day: fromMap?.busiest_day ?? venue?.busiest_day ?? null,
    busiest_hour: fromMap?.busiest_hour ?? venue?.busiest_hour ?? null,
    points_earned_30d:
      fromMap?.points_earned_30d ?? venue?.points_earned_30d ?? null,
  };
}

function venueHasActivity(metrics) {
  if (!metrics) return false;
  return (
    Number(metrics.unique_visitors_30d) > 0 ||
    Number(metrics.total_visits_30d) > 0 ||
    Number(metrics.first_time_visitors_30d) > 0
  );
}

function formatRepeatVisitors(metrics) {
  const unique = Number(metrics?.unique_visitors_30d);
  const firstTime = Number(metrics?.first_time_visitors_30d);
  if (Number.isNaN(unique) || Number.isNaN(firstTime)) return "—";
  if (unique === 0 && firstTime === 0) return "0";
  return String(Math.max(unique - firstTime, 0));
}

function venueHasRealStoreRewards(venue) {
  const rewards = Array.isArray(venue?.store_rewards) ? venue.store_rewards : [];
  return rewards.some((row) => row && (row.name || row.title || row.reward_name));
}

function renderVenueStoreRewardsSection(venue) {
  if (!venueHasRealStoreRewards(venue)) return "";

  return `<div class="venue-card-section">
    <h4 class="venue-card-section-title">Store Rewards</h4>
    ${renderVenueStoreRewards(venue)}
  </div>`;
}

function renderVenueStoreRewards(venue) {
  const rewards = Array.isArray(venue?.store_rewards) ? venue.store_rewards : [];
  const connected = rewards.filter(
    (row) => row && (row.name || row.title || row.reward_name)
  );

  if (!connected.length) {
    return `<p class="muted venue-card-empty">No store rewards connected.</p>`;
  }

  return `<div class="venue-rewards-list">${connected
    .map((reward) => {
      const name = reward.name || reward.title || reward.reward_name || "Reward";
      const status = reward.status || "—";
      const redemptions =
        reward.redemptions != null
          ? formatMetric(reward.redemptions, { emptyLabel: "0" })
          : "—";
      const link = String(reward.store_url || reward.url || "").trim();
      const linkHtml = link
        ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">View in store</a>`
        : "";

      return `<article class="venue-reward-row">
        <div class="venue-reward-main">
          <p class="venue-reward-name">${escapeHtml(name)}</p>
          <p class="muted venue-reward-meta">Status: ${escapeHtml(status)} · Redemptions: ${escapeHtml(redemptions)}</p>
        </div>
        ${linkHtml}
      </article>`;
    })
    .join("")}</div>`;
}

function renderConsolidatedVenueCard(venue, metricsByPlace) {
  const metrics = resolveVenueMetrics(venue, metricsByPlace);
  const photo = renderImageOrFallback({
    url: venue.photo_url,
    fallbackText: venue.name || "V",
    imgClass: "venue-photo",
    fallbackClass: "venue-photo venue-photo-fallback",
  });
  const activeBadge = venue.is_active
    ? `<span class="venue-badge is-good">Active</span>`
    : `<span class="venue-badge is-warn">${escapeHtml(venue.status || "Inactive")}</span>`;
  const publishedBadge = venue.is_published
    ? `<span class="venue-badge is-good">Published on Kami</span>`
    : `<span class="venue-badge is-warn">Not published</span>`;
  const addressLine = venue.address
    ? `<p class="venue-address muted">${escapeHtml(venue.address)}</p>`
    : `<p class="venue-address muted">${escapeHtml(formatLocation(venue))}</p>`;

  const performanceHtml = renderMetricStrip([
    ["Unique visitors", formatMetric(metrics.unique_visitors_30d, { emptyLabel: "0" })],
    ["First-time visitors", formatMetric(metrics.first_time_visitors_30d, { emptyLabel: "0" })],
    ["Total visits", formatMetric(metrics.total_visits_30d, { emptyLabel: "0" })],
    ["Repeat visitors", formatRepeatVisitors(metrics)],
    ["Points earned", formatMetric(metrics.points_earned_30d, { emptyLabel: "0" })],
  ]);

  return `<article class="venue-card venue-card--consolidated" data-place-id="${escapeHtml(venue.place_id || "")}">
    <div class="venue-card-section venue-card-section--info">
      <h4 class="venue-card-section-title">Venue Info</h4>
      <div class="venue-card-header">
        ${photo}
        <div class="venue-card-content">
          <h3>${escapeHtml(venue.name || "Venue")}</h3>
          <p class="venue-meta">${escapeHtml(formatCategory(venue))}</p>
          ${addressLine}
          <div class="venue-badges">${activeBadge}${publishedBadge}</div>
          <div class="venue-card-actions">
            <button type="button" class="btn secondary btn-sm" data-venue-detail="${escapeHtml(venue.place_id || "")}">View Details</button>
          </div>
        </div>
      </div>
    </div>
    <div class="venue-card-section">
      <h4 class="venue-card-section-title">Performance</h4>
      <p class="muted venue-card-section-lede">Aggregate 30-day activity. Individual user identities are never shown.</p>
      ${performanceHtml}
    </div>
    <div class="venue-card-section venue-card-section--visitors">
      <h4 class="venue-card-section-title">Recent Visitors</h4>
      <div data-venue-visitors="${escapeHtml(venue.place_id || "")}">
        <p class="muted venue-card-empty">Loading visitors…</p>
      </div>
    </div>
    <div class="venue-card-section venue-card-section--wall">
      <h4 class="venue-card-section-title">Venue Wall</h4>
      <div data-venue-wall="${escapeHtml(venue.place_id || "")}">
        <p class="muted venue-card-empty">Loading wall…</p>
      </div>
    </div>
    ${renderVenueStoreRewardsSection(venue)}
  </article>`;
}

function renderConsolidatedEventCard(event, insights) {
  const location = [event.place_name, event.place_neighborhood, event.place_city].filter(Boolean).join(" · ");
  const timing = eventTimingState(event);
  const image = renderImageOrFallback({
    url: event.display_image_url || event.image_url || event.place_photo_url,
    fallbackText: event.name || "E",
    imgClass: "event-photo",
    fallbackClass: "event-photo event-photo-fallback",
  });
  const statusBadge =
    event.status === "published"
      ? `<span class="venue-badge is-good">Published</span>`
      : `<span class="venue-badge is-warn">${escapeHtml(event.status || "Draft")}</span>`;
  const timingBadge = `<span class="venue-badge is-${timing.tone}">${escapeHtml(timing.label)}</span>`;
  const eventVisits = formatMetric(insights?.insights?.event_visits_30d, { emptyLabel: "0" });
  const hasEventRewards = venueHasRealStoreRewards(event);

  const performanceHtml = renderMetricStrip([
    ["Event visits (30d)", eventVisits],
    ["Unique visitors", "—"],
    ["First-time visitors", "—"],
    ["Repeat visitors", "—"],
    ["Points earned", "—"],
  ]);

  const activityHtml =
    Number(insights?.insights?.event_visits_30d || 0) > 0
      ? `<p class="muted venue-card-empty">${escapeHtml(eventVisits)} aggregate check-ins across linked events in the last 30 days.</p>`
      : `<p class="muted venue-card-empty">No recent activity yet. Check-ins will appear here once Kami users attend.</p>`;

  return `<article class="venue-card venue-card--consolidated event-card--consolidated">
    <div class="venue-card-section venue-card-section--info">
      <h4 class="venue-card-section-title">Event Info</h4>
      <div class="venue-card-header">
        ${image}
        <div class="venue-card-content">
          <h3>${escapeHtml(event.name || "Event")}</h3>
          <p class="event-meta">
            ${escapeHtml(formatDateTime(event.starts_at))}${event.ends_at ? ` – ${escapeHtml(formatDateTime(event.ends_at))}` : ""}<br>
            ${escapeHtml(location || "Venue not listed")}<br>
            ${statusBadge} ${timingBadge}
          </p>
          <div class="venue-card-actions">
            <button type="button" class="btn secondary btn-sm" data-event-detail="${escapeHtml(event.event_id || "")}">View Details</button>
          </div>
        </div>
      </div>
    </div>
    <div class="venue-card-section">
      <h4 class="venue-card-section-title">Performance</h4>
      <p class="muted venue-card-section-lede">Aggregate activity for this event. Individual user identities are never shown.</p>
      ${performanceHtml}
    </div>
    <div class="venue-card-section">
      <h4 class="venue-card-section-title">Recent Activity</h4>
      ${activityHtml}
    </div>
    ${hasEventRewards ? renderVenueStoreRewardsSection(event) : ""}
  </article>`;
}

export function renderPartnerHero(header, avatarHtml, heroStats = {}) {
  const h = header || {};
  const stats = heroStats || {};
  const venueCount = stats.venuesCount ?? 0;
  const eventCount = stats.eventsCount ?? 0;
  const earningsLabel = stats.referralEarningsLabel || formatMoney(stats.referralEarningsCents ?? 0);

  return `<section class="panel dashboard-header dashboard-hero">
    <div class="dashboard-header-main">
      <div class="eyebrow dashboard-eyebrow">Partner Portal</div>
      <div class="header-main dashboard-hero-main">
        ${avatarHtml.replace('class="avatar"', 'class="avatar dashboard-hero-avatar"').replace('class="avatar avatar-fallback"', 'class="avatar avatar-fallback dashboard-hero-avatar"')}
        <div class="header-copy dashboard-hero-copy">
          <h1>${escapeHtml(h.display_name || "Partner")}</h1>
          <p class="muted dashboard-hero-meta">${escapeHtml(h.contact_email || "")}${h.joined_at ? ` · Joined ${escapeHtml(formatDate(h.joined_at))}` : ""}</p>
          <div class="hero-summary-pills" aria-label="Partner summary">
            ${renderHeroPill("Venues", String(venueCount))}
            ${renderHeroPill("Events", String(eventCount))}
            ${renderHeroPill("Referral earnings", earningsLabel)}
          </div>
        </div>
      </div>
    </div>
    <span class="status-badge dashboard-hero-status">${escapeHtml(h.status_label || "Partner")}</span>
  </section>`;
}

export function renderPortalTabs(activeTab) {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "venues", label: "Venues" },
    { id: "events", label: "Events" },
  ];
  const buttons = tabs
    .map(
      (tab) =>
        `<button type="button" class="portal-tab portal-tab--top${activeTab === tab.id ? " is-active" : ""}" data-portal-tab="${tab.id}" role="tab" aria-controls="portal-tab-content" aria-selected="${activeTab === tab.id}">${escapeHtml(tab.label)}</button>`
    )
    .join("");

  return `<nav class="portal-tabs portal-tabs--top" role="tablist" aria-label="Partner portal sections">${buttons}</nav>`;
}

export function isValidPortalTab(tab) {
  return PORTAL_TABS.includes(tab);
}

function renderGettingStartedCard({ venues, insights, outreach, referral, storeRewards }) {
  const steps = [
    { label: "Venue connected", done: (venues || []).length > 0 },
    { label: "First Kami visitor", done: Boolean(insights?.has_activity) },
    {
      label: "First connection request",
      done: Array.isArray(outreach?.events) && outreach.events.length > 0,
    },
    {
      label: "First referral signup",
      done: Number(referral?.signup_count || 0) > 0,
    },
    {
      label: "First reward redemption",
      done: (storeRewards || []).some((row) => Number(row?.redemptions || 0) > 0),
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount >= steps.length) return "";
  if (doneCount >= 4 && insights?.has_activity) return "";

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
    <p class="section-lede">Track your progress as your partner account comes to life on Kami.</p>
    <ul class="getting-started-list">${items}</ul>
  </section>`;
}

function renderNetworkSummary({ venues, events }) {
  const venueList = Array.isArray(venues) ? venues : [];
  const eventList = Array.isArray(events) ? events : [];
  const activeVenues = venueList.filter((v) => v.is_active).length;
  const upcomingEvents = eventList.filter((e) => eventTimingState(e).label === "Upcoming").length;
  const liveEvents = eventList.filter((e) => eventTimingState(e).label === "Live").length;

  return `<section class="panel panel-secondary panel-compact">
    <h3 class="portal-card-title">Partner Network</h3>
    <p class="section-lede">Summary of venues and events connected to your partner account.</p>
    <div class="summary-stats-grid summary-stats-grid--three">
      ${renderSummaryStat("Active Venues", String(activeVenues))}
      ${renderSummaryStat("Upcoming Events", String(upcomingEvents))}
      ${renderSummaryStat("Live Events", String(liveEvents))}
    </div>
  </section>`;
}

function formatOutreachStatus(status) {
  const key = String(status || "").toLowerCase();
  if (key === "accepted") return "Accepted";
  if (key === "sent") return "Sent";
  if (key === "failed") return "Failed";
  if (!key) return "—";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function formatConnectionRequestStatus(row) {
  const connection = String(row.connection_status || "");
  if (connection === "accepted") return "Accepted";
  if (connection === "outgoing_pending") return "Sent";
  if (connection === "incoming_pending") return "Incoming";
  return formatOutreachStatus(row.status);
}

function renderConnectionRequestRow(row) {
  const user = {
    user_id: row.user_id,
    display_name: row.display_name,
    ig_handle: row.ig_handle,
    avatar_url: row.avatar_url,
    connection_status: row.connection_status,
  };
  const statusTone =
    user.connection_status === "accepted"
      ? "good"
      : user.connection_status === "outgoing_pending"
        ? "warn"
        : "muted";

  return `<article class="connection-request-row">
    <div class="connection-request-user">${renderUserIdentityCell(user)}</div>
    <div class="connection-request-meta">
      <p class="connection-request-venue">${escapeHtml(row.venue_name || "Venue")}</p>
      <p class="muted connection-request-date">${escapeHtml(formatDateTime(row.created_at))}</p>
    </div>
    <div class="connection-request-status">
      <span class="status-pill status-pill--${statusTone}">${escapeHtml(formatConnectionRequestStatus(row))}</span>
    </div>
    <div class="connection-request-action">${renderConnectionAction(user, { allowConnect: false })}</div>
  </article>`;
}

function renderConnectionRequestsSection(outreachPayload) {
  const events = Array.isArray(outreachPayload?.events) ? outreachPayload.events : [];
  const dailyApp = outreachPayload?.daily || {};
  const dailyPortal = outreachPayload?.daily_dashboard || {};
  const appLimit = Number(dailyApp.limit ?? 5);
  const appUsed = Number(dailyApp.used_today ?? 0);
  const appRemaining = Number.isFinite(Number(dailyApp.remaining_today))
    ? Number(dailyApp.remaining_today)
    : Math.max(appLimit - appUsed, 0);
  const portalLimit = Number(dailyPortal.limit ?? 5);
  const portalUsed = Number(dailyPortal.used_today ?? 0);
  const portalRemaining = Number.isFinite(Number(dailyPortal.remaining_today))
    ? Number(dailyPortal.remaining_today)
    : Math.max(portalLimit - portalUsed, 0);

  const capHint = `Kami app in-venue outreach: up to ${appLimit}/day (${appUsed} used, ${appRemaining} remaining). Partner portal (Venues tab): up to ${portalLimit}/day (${portalUsed} used, ${portalRemaining} remaining).`;

  const list = events.length
    ? `<div class="connection-request-list">${events.map(renderConnectionRequestRow).join("")}</div>`
    : `<div class="empty-state compact-empty">
        <p>No connection requests yet. Requests sent from the Kami app or the partner portal Venues tab will appear here.</p>
      </div>`;

  return `<section class="panel panel-secondary panel-compact" data-connection-requests>
    <h3 class="portal-card-title">Recent Connection Requests</h3>
    <p class="section-lede">Connection requests sent from your partner account at linked venues. Message connected users in the same thread as the Kami app.</p>
    <p class="muted outreach-cap-note">${escapeHtml(capHint)}</p>
    ${list}
  </section>`;
}

function renderInsightsSummaryCard(insightsPayload) {
  const ins = insightsPayload?.insights || {};
  const hasVenues = insightsPayload?.has_linked_venues;
  const hasActivity = insightsPayload?.has_activity;

  if (!hasVenues) {
    return `<section class="panel panel-secondary panel-compact">
      <h3 class="portal-card-title">Venue / Event Insights</h3>
      <div class="empty-state compact-empty">
        <p>Link a venue to your partner account to see aggregate visitor trends and engagement.</p>
      </div>
    </section>`;
  }

  const emptyCopy =
    '<div class="empty-state insights-empty compact-empty"><p>No activity yet. Insights will appear once Kami activity is detected at your venues or events.</p></div>';

  const metricsGrid = `<div class="metric-strip metric-strip--insights">
    ${renderMetricChip("Visitors this month", formatMetric(ins.visitors_this_month, { emptyLabel: "0" }))}
    ${renderMetricChip("Unique visitors (30d)", formatMetric(ins.unique_visitors_30d, { emptyLabel: "0" }))}
    ${renderMetricChip("Repeat visitors (30d)", formatMetric(ins.repeat_visitors_30d, { emptyLabel: "0" }))}
    ${renderMetricChip("Event visits (30d)", formatMetric(ins.event_visits_30d, { emptyLabel: "0" }))}
    ${renderMetricChip("Points at venues (30d)", formatMetric(ins.points_earned_at_venues_30d, { emptyLabel: "0" }))}
  </div>`;

  return `<section class="panel panel-secondary panel-compact">
    <h3 class="portal-card-title">Venue / Event Insights</h3>
    <p class="section-lede">Aggregate activity across your linked venues and events. Individual user identities are never shown.</p>
    ${hasActivity ? "" : emptyCopy}
    ${metricsGrid}
  </section>`;
}

function renderPartnerStoreRewardsSection(storeRewards) {
  const rewards = Array.isArray(storeRewards) ? storeRewards : [];

  const body = rewards.length
    ? `<div class="partner-rewards-list">${rewards
        .map((reward) => {
          const title = reward.title || "Reward";
          const status = reward.status || "—";
          const redemptions = formatMetric(reward.redemptions, { emptyLabel: "0" });
          const link = String(reward.store_url || "").trim();
          const linkHtml = link
            ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">View in store</a>`
            : "";
          return `<article class="venue-reward-row">
            <div class="venue-reward-main">
              <p class="venue-reward-name">${escapeHtml(title)}</p>
              <p class="muted venue-reward-meta">Status: ${escapeHtml(status)} · Redemptions: ${escapeHtml(redemptions)}${reward.points_cost != null ? ` · ${escapeHtml(String(reward.points_cost))} pts` : ""}</p>
            </div>
            ${linkHtml}
          </article>`;
        })
        .join("")}</div>`
    : `<div class="empty-state compact-empty">
        <p>No store rewards are currently connected to your partner account.</p>
      </div>`;

  return `<section class="panel panel-secondary panel-compact">
    <h3 class="portal-card-title">Partner Store Rewards</h3>
    <p class="section-lede">Kami Store rewards connected to your partner account via <a href="/store">kamisocial.com/store</a>.</p>
    ${body}
  </section>`;
}

function renderEventAnalyticsSection(events, insights) {
  const eventList = Array.isArray(events) ? events : [];

  if (!eventList.length) {
    return `<section class="panel panel-primary">
      <h2>Event Analytics</h2>
      <div class="empty-state">
        <p>No events linked yet. Events linked by Kami will appear here.</p>
      </div>
    </section>`;
  }

  const hasEventActivity = Number(insights?.insights?.event_visits_30d || 0) > 0;

  const blocks = eventList
    .map((event) => {
      const timing = eventTimingState(event);
      const location = [event.place_name, event.place_city].filter(Boolean).join(" · ");
      const metricsHtml = hasEventActivity
        ? `<div class="analytics-metrics-grid analytics-metrics-grid--compact">
            ${renderInsightCard("Kami Attendees", "—")}
            ${renderInsightCard("Unique Kami Visitors", "—")}
            ${renderInsightCard("First-Time Users", "—")}
            ${renderInsightCard("Referral-Attributed Users", "—")}
            ${renderInsightCard("Points from Attendance", "—")}
          </div>`
        : `<p class="muted analytics-empty">No event activity yet.</p>`;

      return `<article class="analytics-block">
        <h3>${escapeHtml(event.name || "Event")}</h3>
        <p class="muted analytics-location">${escapeHtml(formatDateTime(event.starts_at))}${location ? ` · ${escapeHtml(location)}` : ""} · ${escapeHtml(timing.label)}</p>
        ${metricsHtml}
      </article>`;
    })
    .join("");

  return `<section class="panel panel-primary">
    <h2>Event Analytics</h2>
    <p class="section-lede">Aggregate performance for each linked event. Per-event metrics will populate as activity is detected.</p>
    <div class="analytics-blocks">${blocks}</div>
  </section>`;
}

function renderEventActivitySection(events, insights) {
  const eventList = Array.isArray(events) ? events : [];
  const hasActivity = Number(insights?.insights?.event_visits_30d || 0) > 0;

  if (!eventList.length || !hasActivity) {
    return `<section class="panel panel-secondary">
      <h2>Event Activity</h2>
      <div class="empty-state compact-empty">
        <p>No event activity yet.</p>
      </div>
    </section>`;
  }

  return `<section class="panel panel-secondary">
    <h2>Event Activity</h2>
    <p class="section-lede">Aggregate event check-ins across your linked events (30d): <strong>${formatMetric(insights?.insights?.event_visits_30d, { emptyLabel: "0" })}</strong></p>
  </section>`;
}

export function renderPartnerOverviewTab({
  venues,
  events,
  insights,
  outreach,
  storeRewards,
  referral,
  metrics,
  programParameters,
  referralsTable,
  payoutTable,
  ledgerTable,
  ledgerEntries,
  history,
}) {
  const performance = `${renderNetworkSummary({ venues, events })}
    ${renderInsightsSummaryCard(insights)}`;

  const community = renderConnectionRequestsSection(outreach);

  const earnings = `${renderPartnerStoreRewardsSection(storeRewards)}
    ${renderReferralProgram({
      referral,
      metrics,
      programParameters,
      referralsTable,
      payoutTable,
    })}`;

  const account = `${renderChangeLedger(ledgerTable, ledgerEntries)}
    ${renderAgreementHistorySection(history)}
    ${renderSupportSection()}
    ${renderLeaveSection()}`;

  return `
    ${renderGettingStartedCard({ venues, insights, outreach, referral, storeRewards })}
    ${renderPortalSectionGroup("Performance", performance)}
    ${renderPortalSectionGroup("Community", community)}
    ${renderPortalSectionGroup("Earnings", earnings)}
    ${renderPortalSectionGroup("Account", account)}`;
}

export function renderPartnerVenuesTab({ venues, insights }) {
  const venueList = Array.isArray(venues) ? venues : [];
  const metricsByPlace = venueMetricsMap(insights);

  if (!venueList.length) {
    return `<section class="panel panel-primary">
      <h2>Your Venues</h2>
      <div class="empty-state">
        <h3>No venues linked yet</h3>
        <p>No venues have been linked to this partner account yet. Contact <a href="mailto:partners@kamisocial.com">partners@kamisocial.com</a> to get set up.</p>
      </div>
    </section>`;
  }

  const lede =
    venueList.length === 1
      ? "1 venue linked to your partner account."
      : `${venueList.length} venues linked to your partner account.`;

  return `<section class="panel panel-primary">
    <h2>Your Venues</h2>
    <p class="section-lede">${lede}</p>
    <div class="venue-card-stack">${venueList.map((venue) => renderConsolidatedVenueCard(venue, metricsByPlace)).join("")}</div>
  </section>`;
}

export function renderPartnerEventsTab({ events, insights }) {
  const eventList = Array.isArray(events) ? events : [];

  if (!eventList.length) {
    return `<section class="panel panel-primary">
      <h2>Your Events</h2>
      <div class="empty-state">
        <h3>No events linked yet</h3>
        <p>No events linked yet. Events linked by Kami will appear here.</p>
      </div>
    </section>`;
  }

  const lede =
    eventList.length === 1
      ? "1 event linked to your partner account."
      : `${eventList.length} events linked to your partner account.`;

  return `<section class="panel panel-primary">
    <h2>Your Events</h2>
    <p class="section-lede">${lede}</p>
    <div class="venue-card-stack">${eventList.map((event) => renderConsolidatedEventCard(event, insights)).join("")}</div>
  </section>`;
}

export function renderReferralProgram({
  referral,
  metrics,
  programParameters,
  referralsTable,
  payoutTable,
}) {
  const m = metrics || {};
  const referralLink = String(referral.link || "").trim();
  const referralLinkHtml = referralLink
    ? `<a class="copy-value copy-value-link" id="ref-link" href="${escapeHtml(referralLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(referralLink)}</a>`
    : `<p class="copy-value copy-value-link" id="ref-link">—</p>`;

  const metricsHtml = renderMetricStrip([
    ["Qualified referrals", String(m.current_month_qualified_referrals ?? 0)],
    ["Pending earnings", formatMoney(m.pending_earnings_cents)],
    ["Approved earnings", formatMoney(m.approved_earnings_cents)],
    ["Lifetime earnings", formatMoney(m.lifetime_earnings_cents)],
    ["Total paid lifetime", formatMoney(m.total_paid_lifetime_cents)],
  ]);

  return `<section class="panel panel-secondary panel-compact referral-compact" id="partner-referral">
    <h3 class="portal-card-title">Partner Referral Program</h3>
    <p class="section-lede">Share your partner referral link with customers, guests, and community members who would genuinely enjoy Kami.</p>

    <div class="referral-subsection referral-subsection--primary">
      <div class="copy-grid">
        <div>
          <label>Referral Code</label>
          <p class="copy-value" id="ref-code">${escapeHtml(referral.code || "—")}</p>
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
    </div>

    <div class="referral-subsection">
      <h4 class="subsection-title">Earnings snapshot</h4>
      ${metricsHtml}
    </div>

    <details class="portal-details">
      <summary class="portal-details-summary">View Program Terms</summary>
      ${renderProgramTermsCard(programParameters, { reminder: true })}
    </details>

    <details class="portal-details">
      <summary class="portal-details-summary">View Referrals</summary>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Name</th><th>Handle</th><th>Status</th><th>Rate/Tier</th><th>Earnings</th><th>Notes</th></tr></thead><tbody>${referralsTable}</tbody></table></div>
    </details>

    <details class="portal-details">
      <summary class="portal-details-summary">View Payout History</summary>
      <div class="table-wrap"><table><thead><tr><th>Period</th><th>Qualified</th><th>Gross</th><th>Adjustments</th><th>Approved</th><th>Paid</th><th>Paid Date</th><th>Status</th><th>Notes</th></tr></thead><tbody>${payoutTable}</tbody></table></div>
    </details>
  </section>`;
}

export function renderChangeLedger(ledgerTable, ledgerEntries = []) {
  const entries = Array.isArray(ledgerEntries) ? ledgerEntries : [];
  const latest = entries[0];
  const summaryHtml = latest
    ? `<div class="ledger-summary">
        <p class="ledger-summary-type"><strong>${escapeHtml(latest.change_type || "Update")}</strong> · ${formatDateTime(latest.date)}</p>
        <p class="muted ledger-summary-note">${escapeHtml(latest.notes || formatLedgerValue(latest.new_value) || "Program record updated.")}</p>
      </div>`
    : `<p class="muted ledger-summary-empty">No program updates recorded yet.</p>`;

  return `<section class="panel panel-compact panel-secondary">
    <h3 class="portal-card-title">Program Updates</h3>
    <p class="section-lede muted">Agreement acceptances and program setting changes for your partner account.</p>
    ${summaryHtml}
    <details class="portal-details">
      <summary class="portal-details-summary">View History</summary>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Change Type</th><th>Previous</th><th>New</th><th>Notes</th></tr></thead><tbody>${ledgerTable}</tbody></table></div>
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
    <h3 class="subsection-title">Current Agreement</h3>
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
    <p>Questions about your venues, events, insights, or program terms? Contact <a href="mailto:partners@kamisocial.com">partners@kamisocial.com</a>.</p>
    <div class="support-links">
      <a href="/terms">Terms of Service</a>
      <a href="/privacy">Privacy Policy</a>
    </div>
  </section>`;
}

export function renderLeaveSection() {
  return `<section class="panel danger-panel panel-compact">
    <h3 class="portal-card-title">Leave Partner Program</h3>
    <p class="muted">You will stop participating as a partner for future referrals and portal access. Previously approved earnings remain eligible for payout under the Program Agreement.</p>
    <button type="button" class="btn secondary btn-danger-outline" id="leave-open">Leave Partner Program</button>
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
        `${formatAgreementVersionLabel(item.version)} (Accepted Version)`,
        `<pre class="modal-pre">${escapeHtml(item.agreement_snapshot)}</pre>`
      )
    );
    document.querySelector(`[data-view-params="hist-${idx}"]`)?.addEventListener("click", () =>
      showModal(
        `Previous Program Terms · ${formatAgreementVersionLabel(item.version)}`,
        renderProgramParametersSnapshot(item.program_parameters_snapshot, {
          payout_threshold_display: item.payout_threshold_display,
          tier_cap_display: item.tier_cap_display,
        })
      )
    );
  });
}

function renderVenueDetailBody(venue, metricsByPlace) {
  const metrics = resolveVenueMetrics(venue, metricsByPlace);
  const photo = renderImageOrFallback({
    url: venue.photo_url,
    fallbackText: venue.name || "V",
    imgClass: "detail-modal-photo",
    fallbackClass: "detail-modal-photo detail-modal-photo-fallback",
  });
  const metricsBlock = venueHasActivity(metrics)
    ? `<ul class="detail-modal-list">
        <li><strong>${formatMetric(metrics.unique_visitors_30d, { emptyLabel: "0" })}</strong> unique visitors (30d)</li>
        <li><strong>${formatMetric(metrics.total_visits_30d, { emptyLabel: "0" })}</strong> total visits (30d)</li>
        <li><strong>${formatMetric(metrics.first_time_visitors_30d, { emptyLabel: "0" })}</strong> first-time visitors (30d)</li>
      </ul>`
    : `<p class="muted">Activity metrics will appear once Kami users visit this venue.</p>`;

  return `<div class="detail-modal">
    ${photo}
    <p><strong>Category:</strong> ${escapeHtml(formatCategory(venue))}</p>
    <p><strong>Location:</strong> ${escapeHtml(formatLocation(venue))}</p>
    <p><strong>Status:</strong> ${escapeHtml(venue.status || "—")}</p>
    <p><strong>Published on Kami:</strong> ${venue.is_published ? "Yes" : "No"}</p>
    <h4 class="detail-modal-subhead">Activity (aggregate)</h4>
    ${metricsBlock}
    <p class="muted detail-modal-foot">Need to update your venue profile? Contact <a href="mailto:partners@kamisocial.com">partners@kamisocial.com</a>.</p>
  </div>`;
}

function renderEventDetailBody(event) {
  const location = [event.place_name, event.place_neighborhood, event.place_city].filter(Boolean).join(" · ");
  const photo = renderImageOrFallback({
    url: event.display_image_url || event.image_url || event.place_photo_url,
    fallbackText: event.name || "E",
    imgClass: "detail-modal-photo",
    fallbackClass: "detail-modal-photo detail-modal-photo-fallback",
  });

  return `<div class="detail-modal">
    ${photo}
    <p><strong>When:</strong> ${escapeHtml(formatDateTime(event.starts_at))}${event.ends_at ? ` – ${escapeHtml(formatDateTime(event.ends_at))}` : ""}</p>
    <p><strong>Venue:</strong> ${escapeHtml(location || "Not listed")}</p>
    <p><strong>Status:</strong> ${escapeHtml(event.status || "—")}</p>
    ${event.category ? `<p><strong>Category:</strong> ${escapeHtml(event.category)}</p>` : ""}
    ${event.description ? `<p><strong>Description:</strong> ${escapeHtml(event.description)}</p>` : ""}
    <p class="muted detail-modal-foot">Questions about this event? Contact <a href="mailto:partners@kamisocial.com">partners@kamisocial.com</a>.</p>
  </div>`;
}

export function wireNetworkDetails({ venues, events, insights, showModal }) {
  const venueList = Array.isArray(venues) ? venues : [];
  const eventList = Array.isArray(events) ? events : [];
  const metricsByPlace = venueMetricsMap(insights);

  document.querySelectorAll("[data-venue-detail]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const placeId = btn.getAttribute("data-venue-detail");
      const venue = venueList.find((v) => v.place_id === placeId);
      if (!venue) return;
      showModal(venue.name || "Venue", renderVenueDetailBody(venue, metricsByPlace));
    });
  });

  document.querySelectorAll("[data-event-detail]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const eventId = btn.getAttribute("data-event-detail");
      const event = eventList.find((e) => e.event_id === eventId);
      if (!event) return;
      showModal(event.name || "Event", renderEventDetailBody(event));
    });
  });
}
