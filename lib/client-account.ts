import { createClient } from "@/lib/supabase";

export type ClientAppointmentCard = {
  id: string;
  centerId: string;
  center: string;
  service: string;
  date: string;
  time: string;
  isoDate: string;
  detail: string;
  status: string;
};

export type ClientThreadMessage = {
  id: string;
  side: "center" | "client";
  author: string;
  text: string;
  at: string;
};

export type ClientThread = {
  id: string;
  centerId: string;
  centerName: string;
  messages: ClientThreadMessage[];
};

export type ClientAccount = {
  firstName: string;
  lastName: string;
  email: string;
  displayName: string;
  upcoming: ClientAppointmentCard[];
  past: ClientAppointmentCard[];
  centers: Array<{ id: string; name: string; clientId: string }>;
  threads: ClientThread[];
  loyalty: { points: number; notes: string[] };
};

export const emptyClientAccount = (): ClientAccount => ({
  firstName: "",
  lastName: "",
  email: "",
  displayName: "Mon compte",
  upcoming: [],
  past: [],
  centers: [],
  threads: [],
  loyalty: { points: 0, notes: [] },
});

async function authHeaders() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return null;
  }
  return { Authorization: `Bearer ${token}` };
}

export async function loadClientAccount(): Promise<ClientAccount | null> {
  const headers = await authHeaders();
  if (!headers) {
    return null;
  }
  const response = await fetch("/api/client/account", { headers });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("account_failed");
  }
  return (await response.json()) as ClientAccount;
}

export async function sendClientMessage(centerId: string, text: string) {
  const headers = await authHeaders();
  if (!headers) {
    throw new Error("unauthorized");
  }
  const response = await fetch("/api/client/messages", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ centerId, text }),
  });
  if (!response.ok) {
    throw new Error("message_failed");
  }
  return (await response.json()) as { message: ClientThreadMessage };
}
