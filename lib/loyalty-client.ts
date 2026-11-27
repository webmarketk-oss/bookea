import { createClient } from "@/lib/supabase";

export type LoyaltyReward = {
  id: string;
  points: number;
  discountEur: number;
  minServiceEur: number;
  affordable?: boolean;
};

export type LoyaltyHistoryEntry = {
  id: string;
  at: string;
  points: number;
  label: string;
};

export type LoyaltyAppointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  service: string;
  price: number;
  pending: number;
  request: {
    id: string;
    status: string;
    points: number;
    discountEur: number;
  } | null;
};

export type LoyaltyCard = {
  centerId: string;
  centerName: string;
  clientId: string;
  enabled: boolean;
  balance: number;
  pending: number;
  progress: string;
  noShowRule: string;
  rewards: LoyaltyReward[];
  history: LoyaltyHistoryEntry[];
  appointments: LoyaltyAppointment[];
};

export type LoyaltyProgram = {
  enabled: boolean;
  visitPoints: number;
  depositBonus: number;
  noShowPenalty: number;
  noShowEnabled: boolean;
  rewards: LoyaltyReward[];
};

async function authHeaders() {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return null;
  }
  return { Authorization: `Bearer ${token}` };
}

export async function loadClientLoyalty() {
  const headers = await authHeaders();
  if (!headers) {
    return [];
  }
  const response = await fetch("/api/client/loyalty", { headers });
  if (!response.ok) {
    throw new Error("loyalty_failed");
  }
  const payload = (await response.json()) as { cards?: LoyaltyCard[] };
  return payload.cards || [];
}

export async function requestClientReward(appointmentId: string, rewardId: string) {
  const headers = await authHeaders();
  if (!headers) {
    throw new Error("unauthorized");
  }
  const response = await fetch("/api/client/loyalty", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ appointmentId, rewardId }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "loyalty_failed");
  }
  return payload;
}

export async function syncAppointmentLoyalty(input: {
  centerId: string;
  appointmentId: string;
  previousStatus: string;
  status: string;
}) {
  const headers = await authHeaders();
  if (!headers || !input.centerId) {
    return null;
  }
  const response = await fetch("/api/center/loyalty", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync", ...input }),
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as {
    manualReview?: string;
    balance?: number;
    pending?: number;
  };
}

export async function redeemCenterReward(
  centerId: string,
  requestId: string,
  servicePrice: number,
) {
  const headers = await authHeaders();
  if (!headers) {
    throw new Error("unauthorized");
  }
  const response = await fetch("/api/center/loyalty", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "redeem",
      centerId,
      requestId,
      servicePrice,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    due?: number;
    discountEur?: number;
    message?: string;
  };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.message || "loyalty_failed");
  }
  return payload;
}

export async function loadCenterLoyalty(centerId: string) {
  const headers = await authHeaders();
  if (!headers) {
    throw new Error("unauthorized");
  }
  const response = await fetch(
    `/api/center/loyalty?centerId=${encodeURIComponent(centerId)}`,
    { headers },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    program?: LoyaltyProgram;
    error?: string;
  };
  if (!response.ok || !payload.program) {
    throw new Error(payload.error || "loyalty_failed");
  }
  return payload.program;
}

export async function saveCenterLoyalty(centerId: string, program: LoyaltyProgram) {
  const headers = await authHeaders();
  if (!headers) {
    throw new Error("unauthorized");
  }
  const response = await fetch("/api/center/loyalty", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save", centerId, program }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    program?: LoyaltyProgram;
    error?: string;
    message?: string;
  };
  if (!response.ok || !payload.program) {
    throw new Error(payload.message || payload.error || "loyalty_failed");
  }
  return payload.program;
}

export async function searchLoyaltyClients(centerId: string, query: string) {
  const headers = await authHeaders();
  if (!headers) {
    return [];
  }
  const response = await fetch(
    `/api/center/loyalty?centerId=${encodeURIComponent(centerId)}&q=${encodeURIComponent(query)}`,
    { headers },
  );
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as {
    clients?: Array<{ id: string; first_name?: string; last_name?: string; phone?: string }>;
  };
  return payload.clients || [];
}

export async function loadLoyaltyHistory(centerId: string, clientId: string) {
  const headers = await authHeaders();
  if (!headers) {
    return [];
  }
  const response = await fetch(
    `/api/center/loyalty?centerId=${encodeURIComponent(centerId)}&clientId=${encodeURIComponent(clientId)}`,
    { headers },
  );
  if (!response.ok) {
    return [];
  }
  const payload = (await response.json()) as { history?: LoyaltyHistoryEntry[] };
  return payload.history || [];
}
