export type AppointmentConfirmationState =
  | "pending"
  | "confirmed"
  | "rescheduled"
  | "cancelled"
  | "expired"
  | "moved"
  | "invalid"
  | "error";

export type PublicAppointmentView = {
  centerName: string;
  date: string;
  time: string;
  treatment: string;
  durationMinutes?: number;
};

export type AppointmentSlotDay = {
  date: string;
  label: string;
  times: string[];
};

export type AppointmentConfirmationResponse = {
  ok: boolean;
  state: AppointmentConfirmationState;
  message: string;
  appointment: PublicAppointmentView | null;
  canReschedule?: boolean;
  days?: AppointmentSlotDay[];
};

function readTokenFromLocation() {
  if (typeof window === "undefined") {
    return "";
  }

  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const match = path.match(/^\/r\/([^/]+)$/);

  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  return new URLSearchParams(window.location.search).get("token") || "";
}

function errorConfirmation(
  message =
    "Une erreur technique a eu lieu. Réessayez dans un instant ou contactez le centre.",
): AppointmentConfirmationResponse {
  return {
    ok: false,
    state: "error",
    message,
    appointment: null,
    canReschedule: false,
    days: [],
  };
}

async function fetchConfirmation(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(8000),
  });
}

async function parseConfirmationResponse(
  response: Response,
): Promise<AppointmentConfirmationResponse> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return errorConfirmation();
  }

  const result = (await response.json().catch(() => ({}))) as Partial<AppointmentConfirmationResponse>;

  return {
    ok: Boolean(result.ok),
    state: (result.state as AppointmentConfirmationState) || "error",
    message:
      result.message ||
      "Une erreur technique a eu lieu. Réessayez dans un instant ou contactez le centre.",
    appointment: result.appointment ?? null,
    canReschedule: Boolean(result.canReschedule),
    days: Array.isArray(result.days) ? (result.days as AppointmentSlotDay[]) : [],
  };
}

export async function loadAppointmentConfirmation(token = readTokenFromLocation()) {
  if (!token) {
    return {
      ok: false,
      state: "invalid" as const,
      message: "Ce lien n’est pas valide. Vérifiez le SMS reçu ou contactez le centre.",
      appointment: null,
      canReschedule: false,
      days: [],
    };
  }

  const response = await fetchConfirmation(
    `/api/appointments/confirm?token=${encodeURIComponent(token)}`,
  );

  return parseConfirmationResponse(response);
}

export async function submitAppointmentConfirmation(
  action: "confirm" | "cancel",
  token = readTokenFromLocation(),
) {
  const response = await fetchConfirmation("/api/appointments/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, action }),
  });

  return parseConfirmationResponse(response);
}

export async function loadAppointmentRescheduleSlots(
  token = readTokenFromLocation(),
) {
  if (!token) {
    return {
      ok: false,
      state: "invalid" as const,
      message: "Ce lien n’est pas valide. Vérifiez le SMS reçu ou contactez le centre.",
      appointment: null,
      canReschedule: false,
      days: [],
    };
  }

  const response = await fetchConfirmation(
    `/api/appointments/reschedule?token=${encodeURIComponent(token)}`,
  );

  return parseConfirmationResponse(response);
}

export async function submitAppointmentReschedule(
  date: string,
  time: string,
  token = readTokenFromLocation(),
) {
  const response = await fetchConfirmation("/api/appointments/reschedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, date, time }),
  });

  return parseConfirmationResponse(response);
}

export async function issueAppointmentConfirmationUrl(appointmentId: string) {
  const response = await fetch("/api/appointments/confirmation-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appointmentId }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    error?: string;
  };

  if (!response.ok || !result.ok || !result.url) {
    throw new Error(result.error || "Impossible de générer le lien de confirmation.");
  }

  return result.url;
}

export { readTokenFromLocation };
