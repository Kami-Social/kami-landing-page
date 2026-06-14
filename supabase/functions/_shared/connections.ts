import { createUserRpcClient } from "./supabase.ts";

export type ConnectionStatus =
  | "none"
  | "outgoing_pending"
  | "incoming_pending"
  | "accepted"
  | "declined"
  | "blocked";

type ConnectionStatusPayload = {
  connection_id: string | null;
  status: ConnectionStatus;
};

type SendConnectionResult = {
  auto_accepted?: boolean;
  connection_id?: string | null;
  status: ConnectionStatus | "unavailable";
};

type RespondConnectionResult = {
  connection_id: string;
  status: "accepted" | "declined";
};

function mapRpcError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authenticated")) {
    return { message: "Please sign in to continue.", status: 401 };
  }

  if (normalized.includes("user_not_found")) {
    return { message: "User not found", status: 404 };
  }

  if (normalized.includes("cannot_connect_to_self")) {
    return { message: "You cannot connect with yourself.", status: 400 };
  }

  if (normalized.includes("connection_not_found")) {
    return { message: "Connection request not found.", status: 404 };
  }

  if (
    normalized.includes("not_recipient") ||
    normalized.includes("connection_not_pending") ||
    normalized.includes("connection_not_accepted") ||
    normalized.includes("not_participant") ||
    normalized.includes("invalid_response")
  ) {
    return { message: "This connection request can no longer be updated.", status: 400 };
  }

  return { message: "Something went wrong. Please try again.", status: 500 };
}

export async function rpcGetConnectionStatus(
  accessToken: string,
  targetUserId: string
): Promise<
  | { data: ConnectionStatusPayload; error: null }
  | { data: null; error: { message: string; status: number } }
> {
  const supabase = createUserRpcClient(accessToken);
  const { data, error } = await supabase.rpc("get_connection_status", {
    target_user_id: targetUserId
  });

  if (error) {
    return { data: null, error: mapRpcError(error.message) };
  }

  const payload = (data ?? {}) as ConnectionStatusPayload;
  return {
    data: {
      connection_id: payload.connection_id ?? null,
      status: (payload.status ?? "none") as ConnectionStatus
    },
    error: null
  };
}

export async function rpcSendConnectionRequest(
  accessToken: string,
  targetUserId: string
): Promise<
  | { data: SendConnectionResult; error: null }
  | { data: null; error: { message: string; status: number } }
> {
  const supabase = createUserRpcClient(accessToken);
  const { data, error } = await supabase.rpc("send_connection_request", {
    target_user_id: targetUserId
  });

  if (error) {
    return { data: null, error: mapRpcError(error.message) };
  }

  const payload = (data ?? {}) as SendConnectionResult;
  return { data: payload, error: null };
}

export async function rpcRespondConnectionRequest(
  accessToken: string,
  connectionId: string,
  response: "accepted" | "declined"
): Promise<
  | { data: RespondConnectionResult; error: null }
  | { data: null; error: { message: string; status: number } }
> {
  const supabase = createUserRpcClient(accessToken);
  const { data, error } = await supabase.rpc("respond_connection_request", {
    connection_id: connectionId,
    response
  });

  if (error) {
    return { data: null, error: mapRpcError(error.message) };
  }

  const payload = (data ?? {}) as RespondConnectionResult;
  return { data: payload, error: null };
}

export async function rpcRemoveConnection(
  accessToken: string,
  connectionId: string
): Promise<
  | { data: { status: "none" }; error: null }
  | { data: null; error: { message: string; status: number } }
> {
  const supabase = createUserRpcClient(accessToken);
  const { data, error } = await supabase.rpc("remove_connection", {
    connection_id: connectionId
  });

  if (error) {
    return { data: null, error: mapRpcError(error.message) };
  }

  const payload = (data ?? {}) as { status?: string };
  return { data: { status: "none" }, error: null };
}
