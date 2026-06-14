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
  const total = Math.max(1, Math.round(Number(minutes)));
  if (Number.isNaN(total)) return "—";
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
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

function renderVisitorAction(visitor, { connectDisabled = false } = {}) {
  const userId = visitor?.user_id;
  if (!userId) return `<span class="muted">—</span>`;

  const status = String(visitor.connection_status || "none");
  const name = escapeHtml(visitor.display_name || "Kami user");

  if (status === "accepted") {
    return `<button type="button" class="btn secondary btn-sm visit-action-btn" data-visit-action="message" data-user-id="${escapeHtml(userId)}" data-user-name="${name}">Message</button>`;
  }
  if (status === "outgoing_pending") {
    return `<button type="button" class="btn secondary btn-sm" disabled title="Connection request pending">Pending</button>`;
  }
  if (status === "incoming_pending") {
    return `<button type="button" class="btn btn-sm visit-action-btn" data-visit-action="accept" data-user-id="${escapeHtml(userId)}" data-user-name="${name}">Accept</button>`;
  }
  if (status === "blocked") {
    return `<span class="muted">—</span>`;
  }

  const disabled = connectDisabled ? " disabled" : "";
  const title = connectDisabled ? ' title="Daily partner portal limit reached (5 per day)"' : "";
  return `<button type="button" class="btn btn-sm visit-action-btn" data-visit-action="connect" data-user-id="${escapeHtml(userId)}" data-user-name="${name}"${disabled}${title}>Connect</button>`;
}

function renderVisitorRow(visitor, outreachDaily) {
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
    <td class="visit-col-action">${renderVisitorAction(visitor, { connectDisabled: Number(outreachDaily?.remaining_today ?? 1) <= 0 })}</td>
  </tr>`;
}

function renderOutreachCapNote(daily) {
  const limit = Number(daily?.limit ?? 5);
  const used = Number(daily?.used_today ?? 0);
  const remaining = Number.isFinite(Number(daily?.remaining_today))
    ? Number(daily.remaining_today)
    : Math.max(limit - used, 0);
  return `Partner portal connection requests: ${used} of ${limit} used today (${remaining} remaining). Unlimited connection requests are still available in the Kami app.`;
}

function renderVisitHistoryPanel({ placeId, visitors, total, offset, search, filter, connectionFilter, outreachDaily }) {
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + PAGE_SIZE, total);

  const rows =
    visitors.length > 0
      ? visitors.map((visitor) => renderVisitorRow(visitor, outreachDaily)).join("")
      : `<tr><td colspan="7" class="empty-cell">No visitors match your search.</td></tr>`;

  return `<div class="visit-history" data-visit-history="${escapeHtml(placeId)}">
    <div class="visit-history-header">
      <div>
        <h4 class="visit-history-title">Recent Visitors</h4>
        <p class="muted visit-history-lede">Users with recorded venue presence at this location. Search by name or handle.</p>
        <p class="muted outreach-cap-note">${escapeHtml(renderOutreachCapNote(outreachDaily))}</p>
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
      <select class="visit-history-filter visit-history-connection-filter" aria-label="Filter connection status">
        <option value="all"${connectionFilter === "all" ? " selected" : ""}>All Users</option>
        <option value="connected"${connectionFilter === "connected" ? " selected" : ""}>Connected</option>
        <option value="pending"${connectionFilter === "pending" ? " selected" : ""}>Pending</option>
        <option value="not_connected"${connectionFilter === "not_connected" ? " selected" : ""}>Not connected</option>
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
            <th>Action</th>
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

async function loadVisitHistory(rpc, partnerId, placeId, { search = "", filter = "all", connectionFilter = "all", offset = 0 } = {}) {
  const payload = await rpc("get_my_partner_venue_visit_history", {
    p_partner_id: partnerId,
    p_place_id: placeId,
    p_search: search || null,
    p_visit_filter: filter,
    p_connection_filter: connectionFilter,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });

  if (!payload?.ok) throw new Error(payload?.error || "visit_history_failed");
  return payload;
}

function connectionErrorMessage(error) {
  const code = String(error || "").toLowerCase();
  if (code.includes("daily_outreach_limit")) {
    return "Daily partner portal limit reached (5 connection requests per partner per day).";
  }
  if (code.includes("target_not_a_venue_visitor")) return "This user does not have visit history at this venue.";
  if (code.includes("partner_outreach_disabled")) return "Partner outreach is not enabled for this account.";
  if (code.includes("partner_access_denied")) return "You do not have access to this partner account.";
  return "Could not send connection request.";
}

async function loadOutreachDaily(rpc, partnerId) {
  try {
    const payload = await rpc("get_my_partner_outreach_recent", {
      p_partner_id: partnerId,
      p_limit: 1,
    });
    if (!payload?.ok) return { limit: 5, used_today: 0, remaining_today: 5 };
    return payload.daily_dashboard || payload.daily || { limit: 5, used_today: 0, remaining_today: 5 };
  } catch (_e) {
    return { limit: 5, used_today: 0, remaining_today: 5 };
  }
}

async function sendConnectRequest({ rpc, partnerId, placeId, userId }) {
  const outreach = await rpc("kami_partner_send_dashboard_outreach_request", {
    p_partner_id: partnerId,
    p_place_id: placeId,
    p_target_user_id: userId,
  });
  if (outreach?.ok) return outreach;
  throw new Error(connectionErrorMessage(outreach?.error || "connect_failed"));
}

async function acceptConnectionRequest({ rpc, userId }) {
  const status = await rpc("get_connection_status", { target_user_id: userId });
  const connectionId = status?.connection_id;
  if (!connectionId || status?.status !== "incoming_pending") {
    throw new Error("no_pending_request");
  }
  const result = await rpc("respond_connection_request", {
    connection_id: connectionId,
    response: "accepted",
  });
  if (result?.status === "accepted") return result;
  throw new Error("accept_failed");
}

function renderMessageModalBody({ messages, error }) {
  const list =
    messages.length > 0
      ? messages
          .map(
            (msg) => `<article class="visitor-message-row">
              <p class="visitor-message-meta"><strong>${escapeHtml(msg.sender_display_name || "User")}</strong> · ${escapeHtml(formatDateTime(msg.created_at))}</p>
              <p class="visitor-message-body">${escapeHtml(msg.body || "")}</p>
            </article>`
          )
          .join("")
      : `<p class="muted visitor-message-empty">No messages yet. Say hello.</p>`;

  return `<div class="visitor-message-panel">
    ${error ? `<p class="msg err" role="alert">${escapeHtml(error)}</p>` : ""}
    <div class="visitor-message-thread" id="visitor-message-thread">${list}</div>
    <label class="visitor-message-compose-label" for="visitor-message-input">Message</label>
    <textarea id="visitor-message-input" class="visitor-message-input" rows="3" placeholder="Write a message…"></textarea>
    <div id="visitor-message-send-error" class="msg err" hidden role="alert"></div>
    <button type="button" class="btn" id="visitor-message-send">Send</button>
  </div>`;
}

async function openMessageModal({ rpc, showModal, userId, userName }) {
  let threadId = null;
  let messages = [];
  let loadError = "";

  try {
    threadId = await rpc("get_or_create_dm_thread", { target_user_id: userId });
    const rows = await rpc("get_thread_messages", { p_thread_id: threadId });
    messages = Array.isArray(rows) ? rows : [];
  } catch (e) {
    loadError = e?.message || "Could not load conversation.";
  }

  showModal(`Message ${userName}`, renderMessageModalBody({ messages, error: loadError }));

  const thread = document.getElementById("visitor-message-thread");
  if (thread) thread.scrollTop = thread.scrollHeight;

  const input = document.getElementById("visitor-message-input");
  const sendBtn = document.getElementById("visitor-message-send");
  const sendErr = document.getElementById("visitor-message-send-error");

  sendBtn?.addEventListener("click", async () => {
    const body = input?.value?.trim() || "";
    if (!body || !threadId) return;
    if (sendBtn) sendBtn.disabled = true;
    if (sendErr) sendErr.hidden = true;

    try {
      await rpc("send_message", { p_thread_id: threadId, p_body: body });
      const rows = await rpc("get_thread_messages", { p_thread_id: threadId });
      messages = Array.isArray(rows) ? rows : [];
      if (thread) {
        thread.innerHTML =
          messages.length > 0
            ? messages
                .map(
                  (msg) => `<article class="visitor-message-row">
                    <p class="visitor-message-meta"><strong>${escapeHtml(msg.sender_display_name || "User")}</strong> · ${escapeHtml(formatDateTime(msg.created_at))}</p>
                    <p class="visitor-message-body">${escapeHtml(msg.body || "")}</p>
                  </article>`
                )
                .join("")
            : `<p class="muted visitor-message-empty">No messages yet. Say hello.</p>`;
        thread.scrollTop = thread.scrollHeight;
      }
      if (input) input.value = "";
    } catch (e) {
      if (sendErr) {
        sendErr.textContent = e?.message || "Could not send message.";
        sendErr.hidden = false;
      }
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  });
}

export async function mountVenueVisitHistory({ rpc, partnerId, placeId, container, showModal }) {
  if (!container || !placeId || !partnerId) return;

  const state = { search: "", filter: "all", connectionFilter: "all", offset: 0 };

  async function refresh() {
    container.innerHTML = `<p class="muted venue-card-empty">Loading visitors…</p>`;
    try {
      const [payload, outreachDaily] = await Promise.all([
        loadVisitHistory(rpc, partnerId, placeId, state),
        loadOutreachDaily(rpc, partnerId),
      ]);
      container.innerHTML = renderVisitHistoryPanel({
        placeId,
        visitors: payload.visitors || [],
        total: Number(payload.total || 0),
        offset: state.offset,
        search: state.search,
        filter: state.filter,
        connectionFilter: state.connectionFilter,
        outreachDaily,
      });
      wireVisitHistoryPanel(container, { rpc, partnerId, placeId, state, refresh, showModal });
    } catch (_e) {
      container.innerHTML = `<p class="muted venue-card-empty">Could not load visitor history.</p>`;
    }
  }

  await refresh();
}

function wireVisitHistoryPanel(root, { rpc, partnerId, placeId, state, refresh, showModal }) {
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

  panel.querySelector(".visit-history-filter:not(.visit-history-connection-filter)")?.addEventListener("change", (ev) => {
    state.filter = ev.target.value || "all";
    state.offset = 0;
    void refresh();
  });

  panel.querySelector(".visit-history-connection-filter")?.addEventListener("change", (ev) => {
    state.connectionFilter = ev.target.value || "all";
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

  panel.querySelectorAll("[data-visit-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-visit-action");
      const userId = btn.getAttribute("data-user-id");
      const userName = btn.getAttribute("data-user-name") || "Kami user";
      if (!userId || btn.disabled) return;

      btn.disabled = true;
      try {
        if (action === "connect") {
          await sendConnectRequest({ rpc, partnerId, placeId, userId });
          await refresh();
          return;
        }
        if (action === "accept") {
          await acceptConnectionRequest({ rpc, userId });
          await refresh();
          return;
        }
        if (action === "message" && showModal) {
          btn.disabled = false;
          await openMessageModal({ rpc, showModal, userId, userName });
          return;
        }
      } catch (e) {
        if (showModal) {
          showModal(
            action === "connect" ? "Could not connect" : "Something went wrong",
            `<p class="muted">${escapeHtml(e?.message || connectionErrorMessage())}</p>`
          );
        }
      } finally {
        if (action !== "message") btn.disabled = false;
      }
    });
  });
}

export function wireAllVenueVisitHistories({ rpc, partnerId, root, showModal }) {
  if (!root || !partnerId) return;
  root.querySelectorAll("[data-venue-visitors]").forEach((slot) => {
    const placeId = slot.getAttribute("data-venue-visitors");
    if (!placeId) return;
    void mountVenueVisitHistory({ rpc, partnerId, placeId, container: slot, showModal });
  });
}
