/**
 * Load per-venue analytics via Kami's kami_partner_venue_analytics RPC.
 */
export async function loadPartnerVenueAnalytics(rpc, partnerId, venues, { periodDays = 30 } = {}) {
  const list = Array.isArray(venues) ? venues : [];
  const byPlace = {};

  await Promise.all(
    list.map(async (venue) => {
      const placeId = venue?.place_id;
      if (!placeId) return;
      try {
        const data = await rpc("kami_partner_venue_analytics", {
          p_partner_id: partnerId,
          p_place_id: placeId,
          p_period_days: periodDays,
        });
        if (data && typeof data === "object") {
          byPlace[placeId] = data;
        }
      } catch (_e) {
        /* venue not linked or access denied — skip */
      }
    })
  );

  return byPlace;
}

export function aggregateVenueAnalytics(venueAnalytics) {
  const rows = Object.values(venueAnalytics || {});
  if (!rows.length) {
    return {
      unique_visitors_30d: 0,
      total_visits_30d: 0,
      first_time_visitors_30d: 0,
      has_activity: false,
    };
  }

  let unique = 0;
  let visits = 0;
  let firstTime = 0;

  for (const row of rows) {
    unique += Number(row.unique_visitors || 0);
    visits += Number(row.total_visits || 0);
    firstTime += Number(row.first_time_visitors || 0);
  }

  return {
    unique_visitors_30d: unique,
    total_visits_30d: visits,
    first_time_visitors_30d: firstTime,
    has_activity: visits > 0 || unique > 0,
  };
}

export function venueAnalyticsToMetricsMap(venueAnalytics) {
  const map = new Map();
  for (const [placeId, row] of Object.entries(venueAnalytics || {})) {
    map.set(placeId, {
      place_id: placeId,
      unique_visitors_30d: row.unique_visitors ?? 0,
      total_visits_30d: row.total_visits ?? 0,
      first_time_visitors_30d: row.first_time_visitors ?? 0,
      busiest_day: row.busiest_day ?? null,
      busiest_hour: row.busiest_hour ?? null,
      period_days: row.period_days ?? null,
    });
  }
  return map;
}

export function formatBusiestHour(hour) {
  if (hour == null || Number.isNaN(Number(hour))) return "—";
  const h = Number(hour);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${suffix}`;
}

/** Build insights from get_my_partner_dashboard payload (sync, first paint). */
export function buildInsightsFromDashboard(dashboard, insightsResult) {
  const fromInsights = insightsResult?.ok ? insightsResult : {};
  const venueMetricsRaw = dashboard?.venue_metrics ?? fromInsights.venue_metrics;
  const venueMetrics = Array.isArray(venueMetricsRaw) ? venueMetricsRaw : [];
  const venueList = Array.isArray(dashboard?.venues) ? dashboard.venues : [];
  const activity = dashboard?.venue_activity || fromInsights.activity || {};
  const hasActivity =
    dashboard?.has_venue_activity ??
    fromInsights.has_activity ??
    venueMetrics.some(
      (row) =>
        Number(row?.unique_visitors_30d) > 0 ||
        Number(row?.total_visits_30d) > 0 ||
        Number(row?.first_time_visitors_30d) > 0
    );

  const visitorsThisMonth = venueMetrics.reduce(
    (sum, row) => sum + Number(row?.visitors_this_month || 0),
    0
  );

  return {
    ...fromInsights,
    ok: true,
    has_linked_venues: venueList.length > 0 || Boolean(fromInsights.has_linked_venues),
    has_activity: Boolean(hasActivity),
    venue_metrics: venueMetrics,
    insights: {
      ...(fromInsights.insights || {}),
      visitors_this_month:
        visitorsThisMonth > 0
          ? visitorsThisMonth
          : fromInsights.insights?.visitors_this_month ?? null,
      unique_visitors_30d:
        activity.unique_visitors_30d ?? fromInsights.insights?.unique_visitors_30d ?? null,
      peak_day: activity.peak_day ?? fromInsights.insights?.peak_day ?? null,
      peak_hour: activity.peak_hour ?? fromInsights.insights?.peak_hour ?? null,
    },
    activity: {
      ...(fromInsights.activity || {}),
      users_seen_today: activity.users_seen_today ?? fromInsights.activity?.users_seen_today ?? null,
    },
  };
}

export function buildInsightsPayload(baseInsights, venueAnalytics, venues) {
  const venueList = Array.isArray(venues) ? venues : [];
  const metricsFromRpc = venueAnalyticsToMetricsMap(venueAnalytics);
  const baseMetrics = Array.isArray(baseInsights?.venue_metrics) ? baseInsights.venue_metrics : [];
  const pointsByPlace = new Map(
    baseMetrics.filter((row) => row?.place_id).map((row) => [row.place_id, row.points_earned_30d])
  );

  for (const [placeId, row] of metricsFromRpc.entries()) {
    if (row.points_earned_30d == null && pointsByPlace.has(placeId)) {
      row.points_earned_30d = pointsByPlace.get(placeId);
    }
  }

  const venueMetrics = Array.from(metricsFromRpc.values());
  const agg = aggregateVenueAnalytics(venueAnalytics);

  const base = baseInsights && typeof baseInsights === "object" ? baseInsights : {};
  const baseInsightsData = base.insights && typeof base.insights === "object" ? base.insights : {};
  const mergedVenueMetrics =
    venueMetrics.length > 0
      ? venueMetrics.map((row) => {
          if (row.points_earned_30d != null || !pointsByPlace.has(row.place_id)) return row;
          return { ...row, points_earned_30d: pointsByPlace.get(row.place_id) };
        })
      : baseMetrics;

  return {
    ...base,
    ok: true,
    has_linked_venues: venueList.length > 0 || Boolean(base.has_linked_venues),
    has_activity: Boolean(base.has_activity || agg.has_activity),
    venue_metrics: mergedVenueMetrics,
    insights: {
      ...baseInsightsData,
      unique_visitors_30d: agg.has_activity
        ? agg.unique_visitors_30d
        : baseInsightsData.unique_visitors_30d ?? null,
    },
    activity: base.activity || {},
  };
}
