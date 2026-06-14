import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { findActiveUserByAuthUserId, requireAuthContext } from "../_shared/auth.ts";
import { rpcRespondConnectionRequest } from "../_shared/connections.ts";
import { json, optionsResponse, readJson } from "../_shared/http.ts";
import { notifyConnectionAccepted } from "../_shared/productionNotifications.ts";

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
  const connectionId =
    typeof body?.connection_id === "string" ? body.connection_id : "";
  const response = body?.response === "declined" ? "declined" : "accepted";

  if (!connectionId) {
    return json({ error: "Missing connection_id" }, 400);
  }

  const auth = await requireAuthContext(req);

  if ("response" in auth) {
    return auth.response;
  }

  const token = bearerToken(req);

  if (!token) {
    return json({ error: "Please sign in to continue." }, 401);
  }

  const result = await rpcRespondConnectionRequest(token, connectionId, response);

  if (result.error) {
    return json({ error: result.error.message }, result.error.status);
  }

  if (response === "accepted" && result.data?.connection_id) {
    const { user, error: userError } = await findActiveUserByAuthUserId(
      auth.supabase,
      auth.authUser.id
    );

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
        console.log("[PUSH] respond-connection-request notification hook", {
          connection_id: result.data.connection_id,
          push_sent: pushResult.sent,
          reason: pushResult.reason ?? null
        });
      } catch (error) {
        console.error("[PUSH][ERROR] respond-connection-request notification hook failed", {
          connection_id: result.data.connection_id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  return json(result.data);
});
