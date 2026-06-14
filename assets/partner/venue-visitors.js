import { escapeHtml, formatDateTime } from "./format.js";
import { renderImageOrFallback } from "./media.js";

const PAGE_SIZE = 5;

function formatRelativeTime(value) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 14) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return formatDateTime(value);
}

function formatStayMinutes(minutes) {
  const total = Number(minutes);
  if (Number.isNaN(total) || total <= 0) return "—";
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours < 48) {
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

function formatHandle(handle) {
  const raw = String(handle || "").trim();
  if (!raw) return "";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function visitorStatusBadge(visitor) {
  if (visitor?.is_active_now) {
    return `<span class="visit-status visit-status--active">Active Now</span>`;
  }
  if (visitor?.last_status === "demo") {
    return `<span class="visit-status visit-status--demo">Demo</span>`;
  }
  return `<span class="visit-status visit-status--expired">Expired</span>`;
}

function renderVisitorRow(visitor) {
  const name = visitor.display_name || "Kami user";
  const handle = formatHandle(visitor.ig_handle);
  const avatar = renderImageOrFallback({
    url: visitor.avatar_url,
    fallbackText: name,
    imgClass: "visit-user-avatar",
    fallbackClass: "visit-user-avatar visit-user-avatar-fallback",
  });

  return `<tr>
    <td class="visit-col-user">
      <span class="visit-user-cell">${avatar}<span class="visit-user-copy"><strong>${escapeHtml(name)}</strong>${handle ? `<span class="muted visit-user-handle">${escapeHtml(handle)}</span>` : ""}</span></span>
    </td>
    <td>${escapeHtml(String(visitor.visit_count ?? "—"))}</td>
    <td>${escapeHtml(formatStayMinutes(visitor.stay_minutes))}</td>
    <td>${escapeHtml(formatDateTime(visitor.first_seen_at))}</td>
    <td>${escapeHtml(formatRelativeTime(visitor.last_seen_at))}</td>
    <td>${visitorStatusBadge(visitor)}</td>
  </tr>`;
}

function renderVisitHistoryPanel({ placeId, visitors, total, offset, search, filter }) {
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + PAGE_SIZE, total);

  const rows =
    visitors.length > 0
      ? visitors.map(renderVisitorRow).join("")
      : `<tr><td colspan="6" class="empty-cell">No visitors match your search.</td></tr>`;

  return `<div class="visit-history" data-visit-history="${escapeHtml(placeId)}">
    <div class="visit-history-header">
      <div>
        <h4 class="visit-history-title">Recent Visitors</h4>
        <p class="muted visit-history-lede">Users with recorded venue presence at this location. Search by name or handle.</p>
      </div>
    </div>
    <div class="visit-history-controls">
      <input type="search" class="visit-history-search" placeholder="Search users" value="${escapeHtml(search || "")}" aria-label="Search visitors" />
      <select class="visit-history-filter" aria-label="Filter visits">
        <option value="all"${filter === "all" ? " selected" : ""}>All visits</option>
        <option value="active_now"${filter === "active_now" ? " selected" : ""}>Active now</option>
        <option value="demo"${filter === "demo" ? " selected" : ""}>Demo</option>
        <option value="expired"${filter === "expired" ? " selected" : ""}>Expired</option>
      </select>
    </div>
    <div class="visit-history-table-wrap">
      <table class="visit-history-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Visits</th>
            <th>Stay</th>
            <th>First seen</th>
            <th>Last seen</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="visit-history-footer">
      <p class="muted visit-history-range">Showing ${start}–${end} of ${total}</p>
      <div class="visit-history-pagination">
        <button type="button" class="btn secondary btn-sm visit-history-prev" ${offset <= 0 ? "disabled" : ""}>Previous</button>
        <span class="visit-history-page">Page ${page} of ${totalPages}</span>
        <button type="button" class="btn secondary btn-sm visit-history-next" ${offset + PAGE_SIZE >= total ? "disabled" : ""}>Next</button>
      </div>
    </div>
  </div>`;
}

async function loadVisitHistory(rpc, partnerId, placeId, { search = "", filter = "all", offset = 0 } = {}) {
  const payload = await rpc("get_my_partner_venue_visit_history", {
    p_partner_id: partnerId,
    p_place_id: placeId,
    p_search: search || null,
    p_visit_filter: filter,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });

  if (!payload?.ok) throw new Error(payload?.error || "visit_history_failed");
  return payload;
}

export async function mountVenueVisitHistory({ rpc, partnerId, placeId, container }) {
  if (!container || !placeId || !partnerId) return;

  const state = { search: "", filter: "all", offset: 0 };

  async function refresh() {
    container.innerHTML = `<p class="muted venue-card-empty">Loading visitors…</p>`;
    try {
      const payload = await loadVisitHistory(rpc, partnerId, placeId, state);
      container.innerHTML = renderVisitHistoryPanel({
        placeId,
        visitors: payload.visitors || [],
        total: Number(payload.total || 0),
        offset: state.offset,
        search: state.search,
        filter: state.filter,
      });
      wireVisitHistoryPanel(container, { rpc, partnerId, placeId, state, refresh });
    } catch (_e) {
      container.innerHTML = `<p class="muted venue-card-empty">Could not load visitor history.</p>`;
    }
  }

  await refresh();
}

function wireVisitHistoryPanel(root, { rpc, partnerId, placeId, state, refresh }) {
  const panel = root.querySelector(`[data-visit-history="${placeId}"]`);
  if (!panel) return;

  let searchTimer;
  const searchInput = panel.querySelector(".visit-history-search");
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      state.offset = 0;
      void refresh();
    }, 300);
  });

  panel.querySelector(".visit-history-filter")?.addEventListener("change", (ev) => {
    state.filter = ev.target.value || "all";
    state.offset = 0;
    void refresh();
  });

  panel.querySelector(".visit-history-prev")?.addEventListener("click", () => {
    if (state.offset <= 0) return;
    state.offset = Math.max(0, state.offset - PAGE_SIZE);
    void refresh();
  });

  panel.querySelector(".visit-history-next")?.addEventListener("click", () => {
    state.offset += PAGE_SIZE;
    void refresh();
  });
}

export function wireAllVenueVisitHistories({ rpc, partnerId, root }) {
  if (!root || !partnerId) return;
  root.querySelectorAll("[data-venue-visitors]").forEach((slot) => {
    const placeId = slot.getAttribute("data-venue-visitors");
    if (!placeId) return;
    void mountVenueVisitHistory({ rpc, partnerId, placeId, container: slot });
  });
}
