import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { findActiveUserByAuthUserId, requireAuthContext } from "../_shared/auth.ts";
import { rpcSendConnectionRequest } from "../_shared/connections.ts";
import { json, optionsResponse, readJson } from "../_shared/http.ts";
import {
  notifyConnectionAccepted,
  notifyConnectionRequest
} from "../_shared/productionNotifications.ts";

function bearerToken(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await readJson(req);
  const notifyOnly = body?.notify_only === true;
  const connectionId =
    typeof body?.connection_id === "string" ? body.connection_id : "";
  const targetUserId =
    typeof body?.target_user_id === "string" ? body.target_user_id : "";

  const auth = await requireAuthContext(req);

  if ("response" in auth) {
    return auth.response;
  }

  const token = bearerToken(req);

  if (!token) {
    return json({ error: "Please sign in to continue." }, 401);
  }

  if (notifyOnly) {
    if (!connectionId || !targetUserId) {
      return json({ error: "Missing connection_id or target_user_id" }, 400);
    }

    const { user, error: userError } = await findActiveUserByAuthUserId(
      auth.supabase,
      auth.authUser.id
    );

    if (userError || !user) {
      return json({ error: "User not found" }, 404);
    }

    const { data: connection } = await auth.supabase
      .from("user_connections")
      .select("id, requester_id, recipient_id, status")
      .eq("id", connectionId)
      .maybeSingle();

    if (
      !connection ||
      connection.requester_id !== user.id ||
      connection.recipient_id !== targetUserId
    ) {
      return json({ error: "Invalid connection request" }, 403);
    }

    if (connection.status !== "pending") {
      return json({ ok: true, skipped: true, reason: "not_pending" });
    }

    try {
      const pushResult = await notifyConnectionRequest(auth.supabase, {
        connectionId,
        recipientUserId: targetUserId,
        requesterUserId: user.id
      });
      console.log("[PUSH] send-connection-request notify-only hook", {
        connection_id: connectionId,
        push_sent: pushResult.sent,
        reason: pushResult.reason ?? null
      });
      return json({ ok: true, notification: pushResult });
    } catch (error) {
      console.error("[PUSH][ERROR] send-connection-request notify-only hook failed", {
        connection_id: connectionId,
        error: error instanceof Error ? error.message : String(error)
      });
      return json({ ok: true, notification: { sent: false, reason: "hook_error" } });
    }
  }

  if (!targetUserId) {
    return json({ error: "Missing target_user_id" }, 400);
  }

  const result = await rpcSendConnectionRequest(token, targetUserId);

  if (result.error) {
    return json({ error: result.error.message }, result.error.status);
  }

  const { user, error: userError } = await findActiveUserByAuthUserId(
    auth.supabase,
    auth.authUser.id
  );

  if (!userError && user && result.data?.connection_id) {
    if (result.data.status === "outgoing_pending") {
      try {
        const pushResult = await notifyConnectionRequest(auth.supabase, {
          connectionId: result.data.connection_id,
          recipientUserId: targetUserId,
          requesterUserId: user.id
        });
        console.log("[PUSH] send-connection-request notification hook", {
          connection_id: result.data.connection_id,
          push_sent: pushResult.sent,
          reason: pushResult.reason ?? null
        });
      } catch (error) {
        console.error("[PUSH][ERROR] send-connection-request notification hook failed", {
          connection_id: result.data.connection_id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  if (
    result.data?.status === "accepted" &&
    result.data.auto_accepted &&
    result.data.connection_id
  ) {
    if (!userError && user) {
      try {
        const { data: connection } = await auth.supabase
          .from("user_connections")
          .select("recipient_id")
          .eq("id", result.data.connection_id)
          .maybeSingle();

        const accepterUserId = connection?.recipient_id ?? user.id;
        const pushResult = await notifyConnectionAccepted(auth.supabase, {
          accepterUserId,
          connectionId: result.data.connection_id
        });
        console.log("[PUSH] send-connection-request auto-accept notification hook", {
          connection_id: result.data.connection_id,
          push_sent: pushResult.sent,
          reason: pushResult.reason ?? null
        });
      } catch (error) {
        console.error("[PUSH][ERROR] send-connection-request notification hook failed", {
          connection_id: result.data.connection_id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  return json(result.data);
});
