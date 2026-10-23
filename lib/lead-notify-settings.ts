import { createClient } from "@/lib/supabase";

export type LeadNotifySettings = {
  available: boolean;
  enabled: boolean;
  emails: string[];
  suggestedEmails: string[];
};

async function authHeaders() {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

async function readJson(response: Response) {
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || json.ok === false) {
    const message = typeof json.error === "string" ? json.error : "";
    throw new Error(
      message === "forbidden"
        ? "Seul un membre du centre peut modifier ces notifications."
        : message || "Réglage indisponible pour le moment.",
    );
  }
  return json;
}

export async function loadLeadNotifySettings(centerId: string): Promise<LeadNotifySettings> {
  const response = await fetch(
    `/api/center/lead-notify?centerId=${encodeURIComponent(centerId)}`,
    { headers: await authHeaders() },
  );
  const json = await readJson(response);
  return {
    available: json.available === true,
    enabled: json.enabled === true,
    emails: Array.isArray(json.emails) ? json.emails.map(String) : [],
    suggestedEmails: Array.isArray(json.suggestedEmails) ? json.suggestedEmails.map(String) : [],
  };
}

export async function saveLeadNotifySettings(
  centerId: string,
  settings: { enabled: boolean; emails: string[] },
) {
  const response = await fetch("/api/center/lead-notify", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action: "save", centerId, ...settings }),
  });
  const json = await readJson(response);
  return {
    enabled: json.enabled === true,
    emails: Array.isArray(json.emails) ? json.emails.map(String) : [],
  };
}
