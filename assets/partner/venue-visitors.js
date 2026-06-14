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

export function renderConnectionAction(
  user,
  { connectDisabled = false, allowConnect = true, allowAccept = true } = {}
) {
  const userId = user?.user_id;
  if (!userId) return `<span class="muted">—</span>`;

  const status = String(user.connection_status || "none");
  const name = escapeHtml(user.display_name || "Kami user");

  if (status === "accepted") {
    const handle = formatHandle(user.ig_handle);
    return `<button type="button" class="btn secondary btn-sm visit-action-btn" data-visit-action="message" data-user-id="${escapeHtml(userId)}" data-user-name="${name}" data-user-avatar="${escapeHtml(user.avatar_url || "")}" data-user-handle="${escapeHtml(handle)}">Message</button>`;
  }
  if (status === "outgoing_pending") {
    return `<button type="button" class="btn secondary btn-sm" disabled title="Connection request pending">Pending</button>`;
  }
  if (status === "incoming_pending" && allowAccept) {
    return `<button type="button" class="btn btn-sm visit-action-btn" data-visit-action="accept" data-user-id="${escapeHtml(userId)}" data-user-name="${name}">Accept</button>`;
  }
  if (status === "blocked") {
    return `<span class="muted">—</span>`;
  }
  if (!allowConnect) {
    return `<span class="muted">—</span>`;
  }

  const disabled = connectDisabled ? " disabled" : "";
  const title = connectDisabled ? ' title="Daily partner portal limit reached (5 per day)"' : "";
  return `<button type="button" class="btn btn-sm visit-action-btn" data-visit-action="connect" data-user-id="${escapeHtml(userId)}" data-user-name="${name}"${disabled}${title}>Connect</button>`;
}

function renderVisitorAction(visitor, options = {}) {
  return renderConnectionAction(visitor, options);
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

export function renderUserIdentityCell(user) {
  const name = user.display_name || "Kami user";
  const handle = formatHandle(user.ig_handle);
  const avatar = renderImageOrFallback({
    url: user.avatar_url,
    fallbackText: name,
    imgClass: "visit-user-avatar",
    fallbackClass: "visit-user-avatar visit-user-avatar-fallback",
  });

  return `<span class="visit-user-cell">${avatar}<span class="visit-user-copy"><strong>${escapeHtml(name)}</strong>${handle ? `<span class="muted visit-user-handle">${escapeHtml(handle)}</span>` : ""}</span></span>`;
}

function renderVisitorRow(visitor, outreachDaily) {
  return `<tr>
    <td class="visit-col-user">${renderUserIdentityCell(visitor)}</td>
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

async function invokePartnerFunction(supabase, functionName, body) {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    throw new Error(error.message || `Could not reach ${functionName}.`);
  }
  if (data?.error) {
    throw new Error(typeof data.error === "string" ? data.error : "Request failed.");
  }
  return data;
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

async function sendConnectRequest({ rpc, supabase, partnerId, placeId, userId }) {
  const outreach = await rpc("kami_partner_send_dashboard_outreach_request", {
    p_partner_id: partnerId,
    p_place_id: placeId,
    p_target_user_id: userId,
  });
  if (!outreach?.ok) {
    throw new Error(connectionErrorMessage(outreach?.error || "connect_failed"));
  }

  const connection = outreach.connection || {};
  const connectionId = connection.connection_id;
  const status = String(connection.status || "");
  if (supabase && connectionId && (status === "outgoing_pending" || status === "pending")) {
    try {
      await invokePartnerFunction(supabase, "send-connection-request", {
        connection_id: connectionId,
        target_user_id: userId,
        notify_only: true,
      });
    } catch (_e) {
      /* connection saved; push is best-effort */
    }
  }

  return outreach;
}

async function acceptConnectionRequest({ rpc, supabase, userId }) {
  const status = await rpc("get_connection_status", { target_user_id: userId });
  const connectionId = status?.connection_id;
  if (!connectionId || status?.status !== "incoming_pending") {
    throw new Error("no_pending_request");
  }

  if (supabase) {
    const result = await invokePartnerFunction(supabase, "respond-connection-request", {
      connection_id: connectionId,
      response: "accepted",
    });
    if (result?.status === "accepted") return result;
    throw new Error("accept_failed");
  }

  const result = await rpc("respond_connection_request", {
    connection_id: connectionId,
    response: "accepted",
  });
  if (result?.status === "accepted") return result;
  throw new Error("accept_failed");
}

function formatChatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function resolveChatPeer(messages, { userId, userName, peerAvatar, peerHandle }) {
  const incoming = (messages || []).find((msg) => msg.sender_id === userId);
  return {
    userId,
    name: incoming?.sender_display_name || userName || "Kami user",
    avatarUrl: peerAvatar || incoming?.sender_avatar_url || "",
    handle: peerHandle || formatHandle(incoming?.sender_username || ""),
  };
}

function renderChatPeerHeader(peer) {
  const avatar = renderImageOrFallback({
    url: peer.avatarUrl,
    fallbackText: peer.name,
    imgClass: "partner-chat-peer-avatar",
    fallbackClass: "partner-chat-peer-avatar partner-chat-peer-avatar-fallback",
  });
  const handle = peer.handle ? `<span class="muted partner-chat-peer-handle">${escapeHtml(peer.handle)}</span>` : "";

  return `<header class="partner-chat-header">
    ${avatar}
    <div class="partner-chat-peer-copy">
      <strong class="partner-chat-peer-name">${escapeHtml(peer.name)}</strong>
      ${handle}
    </div>
  </header>`;
}

function renderChatMessage(msg, currentUserId) {
  const isMine = msg.sender_id === currentUserId;
  const tone = isMine ? "outgoing" : "incoming";
  const avatar =
    isMine
      ? ""
      : renderImageOrFallback({
          url: msg.sender_avatar_url,
          fallbackText: msg.sender_display_name || "?",
          imgClass: "partner-chat-message-avatar",
          fallbackClass: "partner-chat-message-avatar partner-chat-message-avatar-fallback",
        });

  return `<article class="partner-chat-message partner-chat-message--${tone}">
    ${avatar}
    <div class="partner-chat-bubble">
      <p class="partner-chat-text">${escapeHtml(msg.body || "")}</p>
      <time class="partner-chat-time" datetime="${escapeHtml(msg.created_at || "")}">${escapeHtml(formatChatTime(msg.created_at))}</time>
    </div>
  </article>`;
}

function renderChatThread(messages, currentUserId) {
  if (!messages.length) {
    return `<p class="muted partner-chat-empty">No messages yet. Say hello.</p>`;
  }
  return messages.map((msg) => renderChatMessage(msg, currentUserId)).join("");
}

function renderMessageModalBody({ messages, currentUserId, peer, error }) {
  return `<div class="partner-chat-modal">
    ${renderChatPeerHeader(peer)}
    ${error ? `<p class="msg err partner-chat-error" role="alert">${escapeHtml(error)}</p>` : ""}
    <div class="partner-chat-thread" id="visitor-message-thread">${renderChatThread(messages, currentUserId)}</div>
    <footer class="partner-chat-compose">
      <textarea id="visitor-message-input" class="partner-chat-input" rows="1" placeholder="Message…" aria-label="Message"></textarea>
      <button type="button" class="partner-chat-send" id="visitor-message-send" aria-label="Send message">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </footer>
    <p id="visitor-message-send-error" class="msg err partner-chat-send-error" hidden role="alert"></p>
  </div>`;
}

function scrollChatThreadToBottom(thread) {
  if (!thread) return;
  thread.scrollTop = thread.scrollHeight;
}

function resizeChatInput(input) {
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
}

let activeChatRealtimeTeardown = null;

async function ensureRealtimeAuth(supabase) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token && supabase.realtime) {
    supabase.realtime.setAuth(token);
  }
  return token;
}

export function teardownPartnerChatRealtime() {
  if (activeChatRealtimeTeardown) {
    activeChatRealtimeTeardown();
    activeChatRealtimeTeardown = null;
  }
}

async function subscribeToThreadMessages(supabase, threadId, onRefresh) {
  if (!supabase || !threadId) return () => {};

  await ensureRealtimeAuth(supabase);

  const channel = supabase
    .channel(`partner-dm:${threadId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `thread_id=eq.${threadId}`,
      },
      () => {
        void onRefresh();
      }
    )
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[partner-chat] realtime subscribe issue", status, err?.message || err || "");
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

async function wireChatRealtime(supabase, threadId, refreshThread) {
  teardownPartnerChatRealtime();
  if (!supabase || !threadId) return;

  await ensureRealtimeAuth(supabase);

  const unsubscribeChannel = await subscribeToThreadMessages(supabase, threadId, refreshThread);
  const pollTimer = window.setInterval(() => {
    void refreshThread();
  }, 4000);

  const onAuthStateChange = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token && supabase.realtime) {
      supabase.realtime.setAuth(session.access_token);
    }
  });

  const onModalClose = () => {
    teardownPartnerChatRealtime();
  };
  document.addEventListener("partner-modal-close", onModalClose);

  activeChatRealtimeTeardown = () => {
    document.removeEventListener("partner-modal-close", onModalClose);
    window.clearInterval(pollTimer);
    onAuthStateChange.data.subscription.unsubscribe();
    unsubscribeChannel();
  };
}

function wireMessageComposer({ rpc, supabase, threadId, currentUserId }) {
  const thread = document.getElementById("visitor-message-thread");
  const input = document.getElementById("visitor-message-input");
  const sendBtn = document.getElementById("visitor-message-send");
  const sendErr = document.getElementById("visitor-message-send-error");

  scrollChatThreadToBottom(thread);
  resizeChatInput(input);
  input?.focus();

  async function refreshThread() {
    const rows = await rpc("get_thread_messages", { p_thread_id: threadId });
    const messages = Array.isArray(rows) ? rows : [];
    if (thread) {
      thread.innerHTML = renderChatThread(messages, currentUserId);
      scrollChatThreadToBottom(thread);
    }
    return messages;
  }

  async function sendCurrentMessage() {
    const body = input?.value?.trim() || "";
    if (!body || !threadId) return;
    if (sendBtn) sendBtn.disabled = true;
    if (sendErr) sendErr.hidden = true;

    try {
      await invokePartnerFunction(supabase, "send-message", {
        thread_id: threadId,
        body,
      });
      await refreshThread();
      if (input) {
        input.value = "";
        resizeChatInput(input);
      }
    } catch (e) {
      if (sendErr) {
        sendErr.textContent = e?.message || "Could not send message.";
        sendErr.hidden = false;
      }
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      input?.focus();
    }
  }

  input?.addEventListener("input", () => resizeChatInput(input));
  input?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      void sendCurrentMessage();
    }
  });
  sendBtn?.addEventListener("click", () => void sendCurrentMessage());

  void wireChatRealtime(supabase, threadId, refreshThread);

  return { refreshThread };
}

export async function openMessageModal({
  rpc,
  supabase,
  showModal,
  userId,
  userName,
  peerAvatar = "",
  peerHandle = "",
}) {
  let threadId = null;
  let messages = [];
  let loadError = "";
  let currentUserId = null;

  try {
    currentUserId = await rpc("kami_resolve_auth_app_user_id");
    threadId = await rpc("get_or_create_dm_thread", { target_user_id: userId });
    const rows = await rpc("get_thread_messages", { p_thread_id: threadId });
    messages = Array.isArray(rows) ? rows : [];
  } catch (e) {
    loadError = e?.message || "Could not load conversation.";
  }

  const peer = resolveChatPeer(messages, { userId, userName, peerAvatar, peerHandle });
  showModal("", renderMessageModalBody({ messages, currentUserId, peer, error: loadError }));
  wireMessageComposer({ rpc, supabase, threadId, currentUserId });
}

export async function mountVenueVisitHistory({ rpc, supabase, partnerId, placeId, container, showModal }) {
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
      wireVisitHistoryPanel(container, { rpc, supabase, partnerId, placeId, state, refresh, showModal });
    } catch (_e) {
      container.innerHTML = `<p class="muted venue-card-empty">Could not load visitor history.</p>`;
    }
  }

  await refresh();
}

export function wireUserConnectionActions(
  root,
  { rpc, supabase, partnerId, placeId = null, showModal, onActionComplete = null }
) {
  if (!root) return;

  root.querySelectorAll("[data-visit-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-visit-action");
      const userId = btn.getAttribute("data-user-id");
      const userName = btn.getAttribute("data-user-name") || "Kami user";
      if (!userId || btn.disabled) return;

      btn.disabled = true;
      try {
        if (action === "connect") {
          if (!placeId) throw new Error("venue_required");
          await sendConnectRequest({ rpc, supabase, partnerId, placeId, userId });
          if (onActionComplete) await onActionComplete();
          return;
        }
        if (action === "accept") {
          await acceptConnectionRequest({ rpc, supabase, userId });
          if (onActionComplete) await onActionComplete();
          return;
        }
        if (action === "message" && showModal) {
          btn.disabled = false;
          await openMessageModal({
            rpc,
            supabase,
            showModal,
            userId,
            userName,
            peerAvatar: btn.getAttribute("data-user-avatar") || "",
            peerHandle: btn.getAttribute("data-user-handle") || "",
          });
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

function wireVisitHistoryPanel(root, { rpc, supabase, partnerId, placeId, state, refresh, showModal }) {
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

  wireUserConnectionActions(panel, {
    rpc,
    supabase,
    partnerId,
    placeId,
    showModal,
    onActionComplete: refresh,
  });
}

export function wireAllVenueVisitHistories({ rpc, supabase, partnerId, root, showModal }) {
  if (!root || !partnerId) return;
  root.querySelectorAll("[data-venue-visitors]").forEach((slot) => {
    const placeId = slot.getAttribute("data-venue-visitors");
    if (!placeId) return;
    void mountVenueVisitHistory({ rpc, supabase, partnerId, placeId, container: slot, showModal });
  });
}
