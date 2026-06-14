type PushPayload = {
  body: string;
  data?: Record<string, unknown>;
  title: string;
  to: string;
};

type BackgroundPushPayload = {
  data?: Record<string, unknown>;
  to: string;
};

/** FCM/Expo Android delivery requires string values in the data payload. */
export function stringifyPushData(data: Record<string, unknown> = {}) {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "string") {
      out[key] = value;
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = String(value);
      continue;
    }

    out[key] = JSON.stringify(value);
  }

  return out;
}

export async function sendExpoPushNotification(payload: PushPayload) {
  return sendExpoPushRequest({
    to: payload.to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: stringifyPushData(payload.data ?? {}),
    channelId: "nearby",
    priority: "high"
  });
}

export async function sendExpoBackgroundPushNotification(
  payload: BackgroundPushPayload
) {
  return sendExpoPushRequest({
    to: payload.to,
    data: stringifyPushData(payload.data ?? {}),
    priority: "high",
    ttl: 600,
    _contentAvailable: true
  });
}

async function sendExpoPushRequest(body: Record<string, unknown>) {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const result = await response.json().catch(() => null);
  const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;

  return {
    ok: response.ok && ticket?.status !== "error",
    status: response.status,
    result
  };
}
