import { sendExpoPushNotification } from "./push.ts";
import {
  isExpoPushToken,
  resolveExpoPushToken,
  truncatePushTokenPreview
} from "./pushTokens.ts";
import type { createServiceClient } from "./supabase.ts";

type ServiceClient = ReturnType<typeof createServiceClient>;

const VIEWING_THREAD_MAX_AGE_MS = 2 * 60 * 1000;

export function buildConnectionAcceptedBody(
  accepterDisplayName: string,
  pointsEarned?: number | null
) {
  const base = `${accepterDisplayName} accepted your connection request`;
  if (typeof pointsEarned === "number" && pointsEarned > 0) {
    return `${base}. You earned ${pointsEarned} points for a new connection`;
  }
  return base;
}

export function buildMessageReceivedBody(senderDisplayName: string) {
  return `${senderDisplayName} sent you a message`;
}

export function buildConnectionRequestBody(requesterDisplayName: string) {
  return `${requesterDisplayName} sent you a connection request`;
}

export function buildPlacePointsEarnedBody(points: number, placeName: string) {
  return `You earned ${points} points at ${placeName}`;
}

export function buildEventPointsEarnedTitle(points: number, eventName: string) {
  return `You earned ${points} points for ${eventName}`;
}

export function buildEventPointsEarnedBody() {
  return "Nice, you showed up.";
}

export function buildCombinedPointsEarnedTitle(totalPoints: number, placeName: string) {
  return `You earned ${totalPoints} points at ${placeName}`;
}

export function buildCombinedPointsEarnedBody(placePoints: number, eventPoints: number) {
  return `Includes ${placePoints} place points + ${eventPoints} event points.`;
}

export function isUserPushSuppressed(user: {
  ghost_until?: string | null;
  paused_until?: string | null;
}) {
  const now = Date.now();
  if (user.paused_until && new Date(user.paused_until).getTime() > now) {
    return true;
  }
  if (user.ghost_until && new Date(user.ghost_until).getTime() > now) {
    return true;
  }
  return false;
}

/** Points pushes: Ghost may receive; Pause suppresses (matches social push rules). */
export function isUserPausedForProductionPush(user: {
  paused_until?: string | null;
}) {
  if (user.paused_until && new Date(user.paused_until).getTime() > Date.now()) {
    return true;
  }
  return false;
}

export type LocationPingPlaceAward = {
  entry_id: string;
  local_date?: string;
  place_id: string;
  points: number;
};

export type LocationPingEventAward = {
  entry_id: string;
  event_id: string;
  points: number;
};

export type LocationPingPointsResult = {
  event_awards?: LocationPingEventAward[];
  place_awards?: LocationPingPlaceAward[];
};

function coercePositiveInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function coerceId(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
}

/** Unwrap admin / RPC wrappers so award arrays are found reliably. */
export function unwrapLocationPingPointsResult(
  input: unknown,
  depth = 0
): LocationPingPointsResult | null {
  if (!input || typeof input !== "object" || depth > 6) {
    return null;
  }

  const obj = input as Record<string, unknown>;

  if (obj.mode === "repeat_test_award") {
    const placeAwards = Array.isArray(obj.place_awards) ? obj.place_awards : [];
    const eventAwards = Array.isArray(obj.event_awards) ? obj.event_awards : [];

    if (placeAwards.length > 0 || eventAwards.length > 0) {
      return {
        event_awards: eventAwards,
        place_awards: placeAwards
      };
    }

    const entryId = coerceId(obj.entry_id);
    const placeId = coerceId(obj.place_id);
    const points = coercePositiveInt(obj.awarded_points);

    if (!entryId || !placeId || !points || points <= 0) {
      return null;
    }

    return {
      place_awards: [{ entry_id: entryId, place_id: placeId, points }]
    };
  }

  if (Array.isArray(obj.place_awards) || Array.isArray(obj.event_awards)) {
    return {
      event_awards: Array.isArray(obj.event_awards) ? obj.event_awards : [],
      place_awards: Array.isArray(obj.place_awards) ? obj.place_awards : []
    };
  }

  if (obj.mode === "real_pipeline" && obj.result) {
    return unwrapLocationPingPointsResult(obj.result, depth + 1);
  }

  if (obj.result) {
    return unwrapLocationPingPointsResult(obj.result, depth + 1);
  }

  return null;
}

function parsePlaceAwards(result: unknown): LocationPingPlaceAward[] {
  const unwrapped = unwrapLocationPingPointsResult(result) ?? result;
  if (!unwrapped || typeof unwrapped !== "object") {
    return [];
  }

  const awards = (unwrapped as LocationPingPointsResult).place_awards;
  if (!Array.isArray(awards)) {
    return [];
  }

  const parsed: LocationPingPlaceAward[] = [];

  for (const row of awards) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const entryId = coerceId((row as LocationPingPlaceAward).entry_id);
    const placeId = coerceId((row as LocationPingPlaceAward).place_id);
    const points = coercePositiveInt((row as LocationPingPlaceAward).points);
    const localDate =
      typeof (row as LocationPingPlaceAward).local_date === "string"
        ? (row as LocationPingPlaceAward).local_date
        : undefined;

    if (!entryId || !placeId || !points || points <= 0) {
      continue;
    }

    parsed.push({
      entry_id: entryId,
      local_date: localDate,
      place_id: placeId,
      points
    });
  }

  return parsed;
}

function parseEventAwards(result: unknown): LocationPingEventAward[] {
  const unwrapped = unwrapLocationPingPointsResult(result) ?? result;
  if (!unwrapped || typeof unwrapped !== "object") {
    return [];
  }

  const awards = (unwrapped as LocationPingPointsResult).event_awards;
  if (!Array.isArray(awards)) {
    return [];
  }

  const parsed: LocationPingEventAward[] = [];

  for (const row of awards) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const entryId = coerceId((row as LocationPingEventAward).entry_id);
    const eventId = coerceId((row as LocationPingEventAward).event_id);
    const points = coercePositiveInt((row as LocationPingEventAward).points);

    if (!entryId || !eventId || !points || points <= 0) {
      continue;
    }

    parsed.push({ entry_id: entryId, event_id: eventId, points });
  }

  return parsed;
}

async function loadActiveExpoTokenRows(supabase: ServiceClient, userId: string) {
  const { data } = await supabase
    .from("user_push_tokens")
    .select("push_token, token_kind")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  return data ?? [];
}

async function resolveUserExpoToken(supabase: ServiceClient, userId: string) {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, expo_push_token, fcm_token, native_device_push_token, is_removed")
    .eq("id", userId)
    .maybeSingle();

  if (error || !user || user.is_removed) {
    return null;
  }

  const activeRows = await loadActiveExpoTokenRows(supabase, userId);
  return resolveExpoPushToken(user, activeRows);
}

async function hasSentNotificationWithDedupeKey(
  supabase: ServiceClient,
  userId: string,
  type: string,
  dedupeKey: string
) {
  const { data, error } = await supabase
    .from("notification_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type)
    .eq("status", "sent")
    .filter("metadata->>dedupe_key", "eq", dedupeKey)
    .limit(1);

  if (error) {
    console.error("[PUSH][ERROR] notification dedupe lookup failed", {
      message: error.message,
      type,
      user_id: userId
    });
    return false;
  }

  return Boolean(data && data.length > 0);
}

async function logProductionNotification(
  supabase: ServiceClient,
  {
    body,
    errorMessage,
    metadata,
    mutatesState,
    previewOnly,
    status,
    title,
    type,
    userId
  }: {
    body: string;
    errorMessage?: string | null;
    metadata: Record<string, unknown>;
    mutatesState: boolean;
    previewOnly: boolean;
    status: "failed" | "sent";
    title: string;
    type: string;
    userId: string;
  }
) {
  try {
    await supabase.from("notification_logs").insert({
      body,
      error_message: errorMessage ?? null,
      metadata: {
        ...metadata,
        mutates_state: mutatesState,
        preview_only: previewOnly
      },
      sent_at: new Date().toISOString(),
      status,
      title,
      type,
      user_id: userId
    });
  } catch (error) {
    console.error("[PUSH][ERROR] notification_logs insert failed", {
      message: error instanceof Error ? error.message : String(error),
      type,
      user_id: userId
    });
  }
}

async function sendProductionPushToUser(
  supabase: ServiceClient,
  {
    body,
    data,
    dedupeKey,
    metadata,
    mutatesState,
    previewOnly,
    title,
    type,
    userId
  }: {
    body: string;
    data: Record<string, unknown>;
    dedupeKey?: string;
    metadata: Record<string, unknown>;
    mutatesState: boolean;
    previewOnly: boolean;
    title: string;
    type: string;
    userId: string;
  }
): Promise<{ sent: boolean; reason?: string }> {
  if (dedupeKey) {
    const alreadySent = await hasSentNotificationWithDedupeKey(
      supabase,
      userId,
      type,
      dedupeKey
    );
    if (alreadySent) {
      console.log("[PUSH] production notification deduped", { dedupe_key: dedupeKey, type, userId });
      return { sent: false, reason: "deduped" };
    }
  }

  const expoToken = await resolveUserExpoToken(supabase, userId);
  if (!expoToken || !isExpoPushToken(expoToken)) {
    console.log("[PUSH] production notification skipped: no Expo token", { type, userId });
    await logProductionNotification(supabase, {
      body,
      errorMessage: "No Expo push token available",
      metadata: { ...metadata, dedupe_key: dedupeKey ?? null },
      mutatesState,
      previewOnly,
      status: "failed",
      title,
      type,
      userId
    });
    return { sent: false, reason: "no_expo_token" };
  }

  const push = await sendExpoPushNotification({
    to: expoToken,
    title,
    body,
    data
  });

  const ticket = Array.isArray((push.result as { data?: unknown[] })?.data)
    ? (push.result as { data?: Array<Record<string, unknown>> }).data?.[0]
    : (push.result as { data?: Record<string, unknown> | null })?.data;

  const ok = push.ok;
  await logProductionNotification(supabase, {
    body,
    errorMessage: ok
      ? null
      : typeof ticket?.message === "string"
        ? ticket.message
        : "Expo push service rejected notification",
    metadata: {
      ...metadata,
      dedupe_key: dedupeKey ?? null,
      expo_response: push.result,
      provider_status: push.status,
      push_token_kind: "expo",
      push_token_preview: truncatePushTokenPreview(expoToken)
    },
    mutatesState,
    previewOnly,
    status: ok ? "sent" : "failed",
    title,
    type,
    userId
  });

  console.log("[PUSH] production notification result", {
    ok,
    reason: ok ? "sent" : "expo_rejected",
    type,
    userId
  });

  return { sent: ok, reason: ok ? undefined : "expo_rejected" };
}

async function loadDisplayName(supabase: ServiceClient, userId: string) {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, username")
    .eq("user_id", userId)
    .maybeSingle();

  const display = profile?.display_name?.trim();
  if (display) {
    return display;
  }

  const username = profile?.username?.trim();
  if (username) {
    return username.startsWith("@") ? username : `@${username}`;
  }

  const { data: user } = await supabase
    .from("users")
    .select("ig_handle")
    .eq("id", userId)
    .maybeSingle();

  return user?.ig_handle ? `@${user.ig_handle.replace(/^@/, "")}` : "Someone";
}

async function loadConnectionAcceptedPointsForUser(
  supabase: ServiceClient,
  userId: string,
  connectionId: string
) {
  const { data } = await supabase
    .from("point_ledger_entries")
    .select("points, created_at")
    .eq("user_id", userId)
    .eq("source_type", "connection_accepted")
    .filter("metadata->>connection_id", "eq", connectionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return typeof data?.points === "number" ? data.points : 0;
}

export async function notifyConnectionRequest(
  supabase: ServiceClient,
  {
    connectionId,
    recipientUserId,
    requesterUserId
  }: {
    connectionId: string;
    recipientUserId: string;
    requesterUserId: string;
  }
) {
  if (recipientUserId === requesterUserId) {
    return { sent: false, reason: "no_recipient" };
  }

  const { data: connection, error } = await supabase
    .from("user_connections")
    .select("id, requester_id, recipient_id, status")
    .eq("id", connectionId)
    .maybeSingle();

  if (
    error ||
    !connection ||
    connection.status !== "pending" ||
    connection.requester_id !== requesterUserId ||
    connection.recipient_id !== recipientUserId
  ) {
    console.log("[PUSH] connection request notification skipped: not a pending outgoing request", {
      connection_id: connectionId
    });
    return { sent: false, reason: "invalid_connection" };
  }

  const { data: recipientUser } = await supabase
    .from("users")
    .select("id, ghost_until, paused_until, is_removed")
    .eq("id", recipientUserId)
    .maybeSingle();

  if (!recipientUser || recipientUser.is_removed || isUserPushSuppressed(recipientUser)) {
    return { sent: false, reason: "recipient_suppressed" };
  }

  const requesterName = await loadDisplayName(supabase, requesterUserId);
  const body = buildConnectionRequestBody(requesterName);

  return sendProductionPushToUser(supabase, {
    body,
    data: {
      connection_id: connectionId,
      deep_link: "kami://inbox",
      peer_display_name: requesterName,
      peer_user_id: requesterUserId,
      screen: "inbox"
    },
    metadata: {
      connection_id: connectionId,
      notify_user_id: recipientUserId,
      requester_user_id: requesterUserId
    },
    mutatesState: true,
    previewOnly: false,
    title: "Connection request",
    type: "connection_request",
    userId: recipientUserId
  });
}

export async function notifyConnectionAccepted(
  supabase: ServiceClient,
  {
    accepterUserId,
    connectionId
  }: {
    accepterUserId: string;
    connectionId: string;
  }
) {
  const { data: connection, error } = await supabase
    .from("user_connections")
    .select("id, requester_id, recipient_id, status, accepted_at")
    .eq("id", connectionId)
    .maybeSingle();

  if (error || !connection || connection.status !== "accepted") {
    console.log("[PUSH] connection accepted notification skipped: invalid connection", {
      connection_id: connectionId
    });
    return { sent: false, reason: "invalid_connection" };
  }

  const notifyUserId =
    accepterUserId === connection.recipient_id
      ? connection.requester_id
      : accepterUserId === connection.requester_id
        ? connection.recipient_id
        : null;

  if (!notifyUserId || notifyUserId === accepterUserId) {
    return { sent: false, reason: "no_recipient" };
  }

  const { data: notifyUser } = await supabase
    .from("users")
    .select("id, ghost_until, paused_until, is_removed")
    .eq("id", notifyUserId)
    .maybeSingle();

  if (!notifyUser || notifyUser.is_removed || isUserPushSuppressed(notifyUser)) {
    return { sent: false, reason: "recipient_suppressed" };
  }

  const { data: blocked } = await supabase
    .from("user_connections")
    .select("status")
    .or(
      `and(requester_id.eq.${notifyUserId},recipient_id.eq.${accepterUserId}),and(requester_id.eq.${accepterUserId},recipient_id.eq.${notifyUserId})`
    )
    .eq("status", "blocked")
    .limit(1);

  if (blocked && blocked.length > 0) {
    return { sent: false, reason: "blocked" };
  }

  const accepterName = await loadDisplayName(supabase, accepterUserId);
  const pointsEarned = await loadConnectionAcceptedPointsForUser(
    supabase,
    notifyUserId,
    connectionId
  );
  const body = buildConnectionAcceptedBody(accepterName, pointsEarned);
  const dedupeKey = `connection_accepted:${connectionId}`;

  return sendProductionPushToUser(supabase, {
    body,
    data: {
      connection_id: connectionId,
      deep_link: `kami://profile/${accepterUserId}`,
      peer_display_name: accepterName,
      peer_ig_handle: null,
      peer_user_id: accepterUserId,
      screen: "profile",
      user_id: accepterUserId
    },
    dedupeKey,
    metadata: {
      accepter_user_id: accepterUserId,
      connection_id: connectionId,
      notify_user_id: notifyUserId,
      points_earned_by_notify_user: pointsEarned
    },
    mutatesState: true,
    previewOnly: false,
    title: "Connection accepted",
    type: "connection_accepted",
    userId: notifyUserId
  });
}

async function isRecipientViewingThread(
  supabase: ServiceClient,
  recipientUserId: string,
  threadId: string
) {
  const { data } = await supabase
    .from("conversation_participants")
    .select("viewing_thread_id, viewing_thread_at")
    .eq("user_id", recipientUserId)
    .eq("thread_id", threadId)
    .maybeSingle();

  if (!data?.viewing_thread_id || data.viewing_thread_id !== threadId || !data.viewing_thread_at) {
    return false;
  }

  const viewedAt = new Date(data.viewing_thread_at).getTime();
  return Date.now() - viewedAt <= VIEWING_THREAD_MAX_AGE_MS;
}

export async function notifyMessageReceived(
  supabase: ServiceClient,
  {
    messageId,
    senderUserId,
    threadId
  }: {
    messageId: string;
    senderUserId: string;
    threadId: string;
  }
) {
  const { data: participants, error } = await supabase
    .from("conversation_participants")
    .select("user_id, thread_id")
    .eq("thread_id", threadId);

  if (error || !participants?.length) {
    return { sent: false, reason: "thread_not_found" };
  }

  const recipient = participants.find((row) => row.user_id !== senderUserId);
  if (!recipient) {
    return { sent: false, reason: "no_recipient" };
  }

  const recipientUserId = recipient.user_id;

  if (await isRecipientViewingThread(supabase, recipientUserId, threadId)) {
    console.log("[PUSH] message notification suppressed: recipient viewing thread", {
      recipient_user_id: recipientUserId,
      thread_id: threadId
    });
    return { sent: false, reason: "recipient_viewing_thread" };
  }

  const { data: recipientUser } = await supabase
    .from("users")
    .select("id, ghost_until, paused_until, is_removed")
    .eq("id", recipientUserId)
    .maybeSingle();

  if (!recipientUser || recipientUser.is_removed || isUserPushSuppressed(recipientUser)) {
    return { sent: false, reason: "recipient_suppressed" };
  }

  const { data: connection } = await supabase
    .from("user_connections")
    .select("status")
    .or(
      `and(requester_id.eq.${senderUserId},recipient_id.eq.${recipientUserId}),and(requester_id.eq.${recipientUserId},recipient_id.eq.${senderUserId})`
    )
    .maybeSingle();

  if (!connection || connection.status === "blocked" || connection.status !== "accepted") {
    return { sent: false, reason: "blocked_or_not_connected" };
  }

  const senderName = await loadDisplayName(supabase, senderUserId);
  const { data: senderProfile } = await supabase
    .from("user_profiles")
    .select("username, avatar_url")
    .eq("user_id", senderUserId)
    .maybeSingle();

  const body = buildMessageReceivedBody(senderName);
  const dedupeKey = `message_received:${messageId}`;

  return sendProductionPushToUser(supabase, {
    body,
    data: {
      deep_link: `kami://inbox/thread/${threadId}`,
      message_id: messageId,
      peer_display_name: senderName,
      peer_ig_handle: senderProfile?.username ?? null,
      peer_user_id: senderUserId,
      screen: "inbox",
      thread_id: threadId
    },
    dedupeKey,
    metadata: {
      message_id: messageId,
      sender_user_id: senderUserId,
      thread_id: threadId
    },
    mutatesState: true,
    previewOnly: false,
    title: "New message",
    type: "message_received",
    userId: recipientUserId
  });
}

async function loadPlaceName(supabase: ServiceClient, placeId: string) {
  const { data } = await supabase
    .from("places")
    .select("name, status")
    .eq("id", placeId)
    .maybeSingle();

  const name = data?.name?.trim();
  if (!name) {
    return null;
  }

  return name;
}

async function loadActiveEventForPoints(
  supabase: ServiceClient,
  eventId: string,
  now = new Date()
) {
  const { data } = await supabase
    .from("events")
    .select("id, name, status, starts_at, ends_at, points_value")
    .eq("id", eventId)
    .maybeSingle();

  if (!data || data.status !== "published" || !(data.points_value > 0)) {
    return null;
  }

  const startsAt = new Date(data.starts_at);
  const endsAt = data.ends_at
    ? new Date(data.ends_at)
    : new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const windowStart = new Date(startsAt.getTime() - 15 * 60 * 1000);
  const windowEnd = new Date(endsAt.getTime() + 15 * 60 * 1000);

  if (now < windowStart || now > windowEnd) {
    return null;
  }

  const name = data.name?.trim();
  return name ? { id: data.id, name } : null;
}

export async function notifyPlacePointsEarned(
  supabase: ServiceClient,
  {
    award,
    userId
  }: {
    award: LocationPingPlaceAward;
    userId: string;
  }
) {
  const { data: user } = await supabase
    .from("users")
    .select("id, paused_until, is_removed")
    .eq("id", userId)
    .maybeSingle();

  if (!user || user.is_removed || isUserPausedForProductionPush(user)) {
    return { sent: false, reason: "recipient_suppressed" };
  }

  const placeName = await loadPlaceName(supabase, award.place_id);
  if (!placeName) {
    return { sent: false, reason: "invalid_place" };
  }

  const points = Math.floor(award.points);
  const body = buildPlacePointsEarnedBody(points, placeName);
  const dedupeKey = `place_points_earned:${award.entry_id}`;

  return sendProductionPushToUser(supabase, {
    body,
    data: {
      deep_link: `kami://place/${award.place_id}`,
      entry_id: award.entry_id,
      place_id: award.place_id,
      place_name: placeName,
      points,
      screen: "place"
    },
    dedupeKey,
    metadata: {
      dedupe_key: dedupeKey,
      entry_id: award.entry_id,
      local_date: award.local_date ?? null,
      place_id: award.place_id,
      place_name: placeName,
      points_awarded: points
    },
    mutatesState: true,
    previewOnly: false,
    title: "Points earned",
    type: "place_points_earned",
    userId
  });
}

export async function notifyEventPointsEarned(
  supabase: ServiceClient,
  {
    award,
    userId
  }: {
    award: LocationPingEventAward;
    userId: string;
  }
) {
  const { data: user } = await supabase
    .from("users")
    .select("id, paused_until, is_removed")
    .eq("id", userId)
    .maybeSingle();

  if (!user || user.is_removed || isUserPausedForProductionPush(user)) {
    return { sent: false, reason: "recipient_suppressed" };
  }

  const event = await loadActiveEventForPoints(supabase, award.event_id);
  if (!event) {
    return { sent: false, reason: "invalid_or_inactive_event" };
  }

  const points = Math.floor(award.points);
  const title = buildEventPointsEarnedTitle(points, event.name);
  const body = buildEventPointsEarnedBody();
  const dedupeKey = `event_points_earned:${award.entry_id}`;

  return sendProductionPushToUser(supabase, {
    body,
    data: {
      deep_link: `kami://event/${award.event_id}`,
      entry_id: award.entry_id,
      event_id: award.event_id,
      event_name: event.name,
      points,
      screen: "event"
    },
    dedupeKey,
    metadata: {
      dedupe_key: dedupeKey,
      entry_id: award.entry_id,
      event_id: award.event_id,
      event_name: event.name,
      points_awarded: points
    },
    mutatesState: true,
    previewOnly: false,
    title,
    type: "event_points_earned",
    userId
  });
}

export async function notifyCombinedPointsEarned(
  supabase: ServiceClient,
  {
    eventAwards,
    placeAwards,
    userId
  }: {
    eventAwards: LocationPingEventAward[];
    placeAwards: LocationPingPlaceAward[];
    userId: string;
  }
) {
  const { data: user } = await supabase
    .from("users")
    .select("id, paused_until, is_removed")
    .eq("id", userId)
    .maybeSingle();

  if (!user || user.is_removed || isUserPausedForProductionPush(user)) {
    return { sent: false, reason: "recipient_suppressed" };
  }

  const primaryPlace = placeAwards[0];
  if (!primaryPlace) {
    return { sent: false, reason: "missing_place_award" };
  }

  const placeName = await loadPlaceName(supabase, primaryPlace.place_id);
  if (!placeName) {
    return { sent: false, reason: "invalid_place" };
  }

  const placePoints = placeAwards.reduce((sum, award) => sum + Math.floor(award.points), 0);
  const eventPoints = eventAwards.reduce((sum, award) => sum + Math.floor(award.points), 0);
  const totalPoints = placePoints + eventPoints;

  if (totalPoints <= 0) {
    return { sent: false, reason: "no_points" };
  }

  const entryIds = [
    ...placeAwards.map((award) => award.entry_id),
    ...eventAwards.map((award) => award.entry_id)
  ].sort();
  const dedupeKey = `combined_points_earned:${entryIds.join(":")}`;
  const title = buildCombinedPointsEarnedTitle(totalPoints, placeName);
  const body = buildCombinedPointsEarnedBody(placePoints, eventPoints);
  const primaryEvent = eventAwards[0] ?? null;

  return sendProductionPushToUser(supabase, {
    body,
    data: {
      deep_link: primaryEvent
        ? `kami://event/${primaryEvent.event_id}`
        : `kami://place/${primaryPlace.place_id}`,
      entry_ids: entryIds,
      event_points: eventPoints,
      place_id: primaryPlace.place_id,
      place_name: placeName,
      place_points: placePoints,
      points: totalPoints,
      screen: primaryEvent ? "event" : "place",
      ...(primaryEvent
        ? { event_id: primaryEvent.event_id, entry_id: primaryEvent.entry_id }
        : { entry_id: primaryPlace.entry_id })
    },
    dedupeKey,
    metadata: {
      dedupe_key: dedupeKey,
      entry_ids: entryIds,
      event_awards: eventAwards,
      event_points: eventPoints,
      place_awards: placeAwards,
      place_id: primaryPlace.place_id,
      place_name: placeName,
      place_points: placePoints,
      points_awarded: totalPoints
    },
    mutatesState: true,
    previewOnly: false,
    title,
    type: "combined_points_earned",
    userId
  });
}

export async function notifyLocationPingPointsAwards(
  supabase: ServiceClient,
  userId: string,
  pointsResult: unknown
) {
  const placeAwards = parsePlaceAwards(pointsResult);
  const eventAwards = parseEventAwards(pointsResult);

  if (placeAwards.length === 0 && eventAwards.length === 0) {
    console.log("[PUSH] location ping points notification skipped: no awards in payload", {
      has_place_awards_key:
        Boolean(pointsResult) &&
        typeof pointsResult === "object" &&
        "place_awards" in (pointsResult as Record<string, unknown>),
      user_id: userId
    });
    return { combined: null, place: [], event: [] };
  }

  if (placeAwards.length > 0 && eventAwards.length > 0) {
    try {
      const combined = await notifyCombinedPointsEarned(supabase, {
        eventAwards,
        placeAwards,
        userId
      });
      console.log("[PUSH] combined points notification hook", {
        entry_ids: [
          ...placeAwards.map((award) => award.entry_id),
          ...eventAwards.map((award) => award.entry_id)
        ],
        push_sent: combined.sent,
        reason: combined.reason ?? null
      });
      return {
        combined: { awards: { eventAwards, placeAwards }, ...combined },
        event: [],
        place: []
      };
    } catch (error) {
      console.error("[PUSH][ERROR] combined points notification hook failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        combined: { awards: { eventAwards, placeAwards }, sent: false, reason: "hook_error" },
        event: [],
        place: []
      };
    }
  }

  const placeResults = [];
  for (const award of placeAwards) {
    try {
      const result = await notifyPlacePointsEarned(supabase, { award, userId });
      placeResults.push({ award, ...result });
      console.log("[PUSH] place points notification hook", {
        entry_id: award.entry_id,
        place_id: award.place_id,
        push_sent: result.sent,
        reason: result.reason ?? null
      });
    } catch (error) {
      console.error("[PUSH][ERROR] place points notification hook failed", {
        entry_id: award.entry_id,
        error: error instanceof Error ? error.message : String(error)
      });
      placeResults.push({ award, sent: false, reason: "hook_error" });
    }
  }

  const eventResults = [];
  for (const award of eventAwards) {
    try {
      const result = await notifyEventPointsEarned(supabase, { award, userId });
      eventResults.push({ award, ...result });
      console.log("[PUSH] event points notification hook", {
        entry_id: award.entry_id,
        event_id: award.event_id,
        push_sent: result.sent,
        reason: result.reason ?? null
      });
    } catch (error) {
      console.error("[PUSH][ERROR] event points notification hook failed", {
        entry_id: award.entry_id,
        error: error instanceof Error ? error.message : String(error)
      });
      eventResults.push({ award, sent: false, reason: "hook_error" });
    }
  }

  return { combined: null, place: placeResults, event: eventResults };
}
