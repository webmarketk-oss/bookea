export type ClientNotifyPref = {
  sms: boolean;
  email: boolean;
};

export const defaultClientNotifyPref: ClientNotifyPref = {
  sms: true,
  email: true,
};

export function normalizeClientNotifyPref(
  value?: Partial<ClientNotifyPref> | null,
): ClientNotifyPref {
  return {
    sms: value?.sms !== false,
    email: value?.email !== false,
  };
}

export function parseClientNotifyMap(value: unknown) {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const next: Record<string, ClientNotifyPref> = {};

  for (const [clientId, pref] of Object.entries(record)) {
    const id = String(clientId || "").trim();
    if (!id) {
      continue;
    }
    next[id] = normalizeClientNotifyPref(
      pref && typeof pref === "object"
        ? (pref as Partial<ClientNotifyPref>)
        : null,
    );
  }

  return next;
}

export function clientNotifyFromMap(
  map: unknown,
  clientId?: string | null,
): ClientNotifyPref {
  const id = String(clientId || "").trim();
  if (!id) {
    return defaultClientNotifyPref;
  }

  return parseClientNotifyMap(map)[id] ?? defaultClientNotifyPref;
}

export async function loadClientNotifyPref(
  clientId?: string | null,
): Promise<ClientNotifyPref> {
  const id = String(clientId || "").trim();
  if (!id) {
    return defaultClientNotifyPref;
  }

  const response = await fetch(
    `/api/sms/client-notify?clientId=${encodeURIComponent(id)}`,
  );
  const result = (await response.json().catch(() => ({}))) as Partial<ClientNotifyPref>;

  if (!response.ok) {
    return defaultClientNotifyPref;
  }

  return normalizeClientNotifyPref(result);
}

export async function saveClientNotifyPref(
  clientId: string,
  pref: Partial<ClientNotifyPref>,
): Promise<ClientNotifyPref> {
  const response = await fetch("/api/sms/client-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      clientId,
      sms: pref.sms,
      email: pref.email,
    }),
  });
  const result = (await response.json().catch(() => ({}))) as Partial<ClientNotifyPref> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(result.error || "Les préférences d’envoi n’ont pas pu être enregistrées.");
  }

  return normalizeClientNotifyPref(result);
}
