export type PushTokenKind = "expo" | "native_fcm" | "unknown";

export function classifyPushToken(token: string): PushTokenKind {
  const trimmed = token.trim();

  if (!trimmed) {
    return "unknown";
  }

  if (isExpoPushToken(trimmed)) {
    return "expo";
  }

  if (isLikelyNativeFcmToken(trimmed)) {
    return "native_fcm";
  }

  return "unknown";
}

export function isExpoPushToken(token: string | null | undefined) {
  if (!token) {
    return false;
  }

  const trimmed = token.trim();
  return (
    trimmed.startsWith("ExponentPushToken[") && trimmed.endsWith("]") && trimmed.length > 20
  );
}

/** Native Android FCM tokens are long opaque strings and must not be sent to Expo Push API. */
export function isLikelyNativeFcmToken(token: string | null | undefined) {
  if (!token || isExpoPushToken(token)) {
    return false;
  }

  const trimmed = token.trim();
  return trimmed.length >= 80 && /^[A-Za-z0-9_:-]+$/.test(trimmed);
}

export function truncatePushTokenPreview(token: string | null | undefined, length = 18) {
  if (!token) {
    return null;
  }

  const trimmed = token.trim();
  if (trimmed.length <= length) {
    return trimmed;
  }

  return `${trimmed.slice(0, length)}…`;
}

type UserPushTokenRow = {
  push_token: string;
  token_kind?: string | null;
};

type UserTokenFields = {
  expo_push_token?: string | null;
  fcm_token?: string | null;
  native_device_push_token?: string | null;
};

export function resolveExpoPushToken(
  user: UserTokenFields,
  activeRows: UserPushTokenRow[] = []
) {
  if (user.expo_push_token && isExpoPushToken(user.expo_push_token)) {
    return user.expo_push_token.trim();
  }

  const expoRow = activeRows.find(
    (row) => row.token_kind === "expo" && isExpoPushToken(row.push_token)
  );
  if (expoRow) {
    return expoRow.push_token.trim();
  }

  if (user.fcm_token && isExpoPushToken(user.fcm_token)) {
    return user.fcm_token.trim();
  }

  return null;
}

export function resolveNativeFcmToken(
  user: UserTokenFields,
  activeRows: UserPushTokenRow[] = []
) {
  if (user.native_device_push_token && isLikelyNativeFcmToken(user.native_device_push_token)) {
    return user.native_device_push_token.trim();
  }

  const nativeRow = activeRows.find(
    (row) => row.token_kind === "native_fcm" && isLikelyNativeFcmToken(row.push_token)
  );
  if (nativeRow) {
    return nativeRow.push_token.trim();
  }

  if (user.fcm_token && isLikelyNativeFcmToken(user.fcm_token)) {
    return user.fcm_token.trim();
  }

  return null;
}
