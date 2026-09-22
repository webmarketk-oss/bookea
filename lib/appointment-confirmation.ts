export type AppointmentConfirmationState =
  | "pending"
  | "confirmed"
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
};

export type AppointmentConfirmationResponse = {
  ok: boolean;
  state: AppointmentConfirmationState;
  message: string;
  appointment: PublicAppointmentView | null;
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

async function parseConfirmationResponse(
  response: Response,
): Promise<AppointmentConfirmationResponse> {
  const result = (await response.json().catch(() => ({}))) as Partial<AppointmentConfirmationResponse>;

  return {
    ok: Boolean(result.ok),
    state: (result.state as AppointmentConfirmationState) || "error",
    message:
      result.message ||
      "Une erreur technique a eu lieu. Réessayez dans un instant ou contactez le centre.",
    appointment: result.appointment ?? null,
  };
}

export async function loadAppointmentConfirmation(token = readTokenFromLocation()) {
  if (!token) {
    return {
      ok: false,
      state: "invalid" as const,
      message: "Ce lien n’est pas valide. Vérifiez le SMS reçu ou contactez le centre.",
      appointment: null,
    };
  }

  const response = await fetch(
    `/api/appointments/confirm?token=${encodeURIComponent(token)}`,
  );

  return parseConfirmationResponse(response);
}

export async function submitAppointmentConfirmation(
  action: "confirm" | "cancel",
  token = readTokenFromLocation(),
) {
  const response = await fetch("/api/appointments/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, action }),
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
