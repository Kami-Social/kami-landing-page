import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { findActiveUserByAuthUserId, requireAuthContext } from "../_shared/auth.ts";
import { json, optionsResponse, readJson } from "../_shared/http.ts";
import { notifyMessageReceived } from "../_shared/productionNotifications.ts";
import { createUserRpcClient } from "../_shared/supabase.ts";

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
  const threadId = typeof body?.thread_id === "string" ? body.thread_id : "";
  const messageBody = typeof body?.body === "string" ? body.body : "";

  if (!threadId || !messageBody.trim()) {
    return json({ error: "Missing thread_id or body" }, 400);
  }

  const auth = await requireAuthContext(req);

  if ("response" in auth) {
    return auth.response;
  }

  const token = bearerToken(req);

  if (!token) {
    return json({ error: "Please sign in to continue." }, 401);
  }

  const { user, error: userError } = await findActiveUserByAuthUserId(
    auth.supabase,
    auth.authUser.id
  );

  if (userError || !user) {
    return json({ error: "User not found" }, 404);
  }

  const rpcClient = createUserRpcClient(token);
  const { data: messageId, error: sendError } = await rpcClient.rpc("send_message", {
    p_body: messageBody,
    p_thread_id: threadId
  });

  if (sendError) {
    const message = sendError.message.toLowerCase();
    if (message.includes("not_authenticated")) {
      return json({ error: "Please sign in to continue." }, 401);
    }
    if (message.includes("thread_access_denied")) {
      return json({ error: "You do not have access to this conversation." }, 403);
    }
    if (message.includes("empty_message")) {
      return json({ error: "Message cannot be empty." }, 400);
    }
    if (message.includes("message_too_long")) {
      return json({ error: "Message is too long." }, 400);
    }
    if (message.includes("connection_required")) {
      return json(
        { error: "Reconnect with this person before sending messages." },
        400
      );
    }
    return json({ error: sendError.message }, 500);
  }

  if (typeof messageId !== "string" || !messageId) {
    return json({ error: "Message could not be sent." }, 500);
  }

  try {
    const pushResult = await notifyMessageReceived(auth.supabase, {
      messageId,
      senderUserId: user.id,
      threadId
    });
    console.log("[PUSH] send-message notification hook", {
      message_id: messageId,
      push_sent: pushResult.sent,
      reason: pushResult.reason ?? null,
      thread_id: threadId
    });
  } catch (error) {
    console.error("[PUSH][ERROR] send-message notification hook failed", {
      error: error instanceof Error ? error.message : String(error),
      message_id: messageId,
      thread_id: threadId
    });
  }

  return json({ message_id: messageId, ok: true });
});
