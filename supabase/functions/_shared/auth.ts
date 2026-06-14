import { json, requireEnv } from "./http.ts";
import { createServiceClient } from "./supabase.ts";

export const DUPLICATE_HANDLE_MESSAGE =
  "This Instagram handle is already on another Kami account. If that is a mistake, contact hello@kamisocial.com for help.";

type SupabaseClient = ReturnType<typeof createServiceClient>;

export type AuthContext = {
  authUser: {
    email?: string | null;
    id: string;
  };
  supabase: SupabaseClient;
};

export async function requireAuthContext(req: Request): Promise<
  | AuthContext
  | {
      response: Response;
    }
> {
  const token = bearerToken(req);

  if (!token || token === requireEnv("SUPABASE_ANON_KEY")) {
    return {
      response: json({ error: "Please sign in to continue." }, 401)
    };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return {
      response: json({ error: "Please sign in again." }, 401)
    };
  }

  return {
    authUser: {
      email: data.user.email,
      id: data.user.id
    },
    supabase
  };
}

export function normalizeInstagramHandle(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 30);
}

export async function findActiveUserByAuthUserId(
  supabase: SupabaseClient,
  authUserId: string
) {
  const { data, error } = await supabase
    .from("users")
    .select("id, ig_handle, auth_user_id, auth_email")
    .eq("auth_user_id", authUserId)
    .eq("is_removed", false)
    .maybeSingle();

  return { error, user: data };
}

export async function requireKamiUserAccess({
  authUserId,
  supabase,
  userId
}: {
  authUserId: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, auth_user_id, is_removed")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { error, response: null, user: null };
  }

  if (!user || user.is_removed) {
    return { error: null, response: json({ error: "User not found" }, 404), user: null };
  }

  if (user.auth_user_id && user.auth_user_id !== authUserId) {
    return {
      error: null,
      response: json({ error: "You can only access your own Kami account." }, 403),
      user: null
    };
  }

  return { error: null, response: null, user };
}

export async function ensureHandleAvailable({
  authUserId,
  handle,
  supabase,
  userId
}: {
  authUserId: string;
  handle: string;
  supabase: SupabaseClient;
  userId?: string | null;
}) {
  const normalizedHandle = normalizeInstagramHandle(handle);
  const { data, error } = await supabase
    .from("users")
    .select("id, auth_user_id")
    .eq("normalized_instagram_handle", normalizedHandle)
    .eq("is_removed", false)
    .maybeSingle();

  if (error) {
    return { error, ok: false };
  }

  if (
    data &&
    data.id !== userId &&
    data.auth_user_id !== authUserId
  ) {
    return { conflict: true, error: null, ok: false };
  }

  return { conflict: false, error: null, ok: true };
}

export async function logAccountEvent({
  authUserId,
  email,
  eventType,
  igHandle,
  metadata = {},
  supabase,
  userId
}: {
  authUserId?: string | null;
  email?: string | null;
  eventType: string;
  igHandle?: string | null;
  metadata?: Record<string, unknown>;
  supabase: SupabaseClient;
  userId?: string | null;
}) {
  await supabase
    .from("account_events")
    .insert({
      auth_email: email ?? null,
      auth_user_id: authUserId ?? null,
      event_type: eventType,
      ig_handle: igHandle ? normalizeInstagramHandle(igHandle) : null,
      metadata,
      user_id: userId ?? null
    })
    .throwOnError();
}

export async function upsertEmailIdentity({
  authUser,
  now,
  supabase,
  userId
}: {
  authUser: { email?: string | null; id: string };
  now: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const email = authUser.email?.trim().toLowerCase() ?? null;

  if (!email) {
    return null;
  }

  const rawIdentity = {
    source: "supabase_email_password"
  };

  const { error: identityError } = await supabase
    .from("user_identities")
    .upsert(
      {
        display_name: email,
        identity_role: "login",
        last_seen_at: now,
        provider: "email",
        provider_user_id: authUser.id,
        raw_identity: rawIdentity,
        status: "active",
        user_id: userId,
        username: email,
        verification_status: "verified"
      },
      { onConflict: "provider,provider_user_id" }
    );

  if (identityError) {
    return identityError;
  }

  const { error: accountError } = await supabase
    .from("user_connected_accounts")
    .upsert(
      {
        display_name: email,
        disconnected_at: null,
        provider: "email",
        provider_account_id: authUser.id,
        raw_account: rawIdentity,
        status: "active",
        user_id: userId,
        username: email,
        verification_status: "verified",
        verified_at: now
      },
      { onConflict: "provider,provider_account_id" }
    );

  return accountError;
}

/** Called when the app establishes an authenticated session (auth-session-profile). */
export async function touchUserSessionActivity({
  now,
  supabase,
  userId
}: {
  now: string;
  supabase: SupabaseClient;
  userId: string;
}) {
  const { error: userError } = await supabase
    .from("users")
    .update({
      last_login_at: now,
      last_seen_at: now,
      updated_at: now
    })
    .eq("id", userId)
    .eq("is_removed", false);

  if (userError) {
    throw userError;
  }

  const { error: identityError } = await supabase
    .from("user_identities")
    .update({ last_seen_at: now, updated_at: now })
    .eq("user_id", userId)
    .eq("status", "active");

  if (identityError) {
    throw identityError;
  }
}

function bearerToken(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}
