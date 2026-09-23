import { getActiveCenterContext } from "@/lib/center-access";
import type { MailContact } from "@/lib/mailing-settings";

export type SendMailingInput = {
  centerId?: string;
  imageDataUrl?: string;
  message: string;
  recipients: MailContact[];
  subject: string;
};

export type SendMailingResult = {
  error?: string;
  failed: number;
  ok: boolean;
  senderEmail?: string;
  sent: number;
};

export async function loadMailingProvider(centerId?: string) {
  try {
    const query = centerId ? `?centerId=${encodeURIComponent(centerId)}` : "";
    const response = await fetch(`/api/mailing/send${query}`);
    const result = (await response.json().catch(() => ({}))) as {
      configured?: boolean;
      senderEmail?: string;
      senderName?: string;
    };

    return {
      configured: Boolean(result.configured),
      senderEmail: result.senderEmail || "",
      senderName: result.senderName || "",
    };
  } catch {
    return {
      configured: false,
      senderEmail: "",
      senderName: "",
    };
  }
}

export async function sendBookeaMailing(
  input: SendMailingInput,
): Promise<SendMailingResult> {
  let centerId = input.centerId || "";

  if (!centerId) {
    try {
      const context = await getActiveCenterContext();
      centerId = context.centerId;
    } catch {
      centerId = "";
    }
  }

  const response = await fetch("/api/mailing/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      centerId,
      subject: input.subject,
      message: input.message,
      imageDataUrl: input.imageDataUrl || "",
      recipients: input.recipients.map((contact) => ({
        id: contact.id,
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
      })),
    }),
  });

  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
    failed?: number;
    ok?: boolean;
    senderEmail?: string;
    sent?: number;
  };

  if (!response.ok || !result.ok) {
    return {
      ok: false,
      sent: result.sent ?? 0,
      failed: result.failed ?? input.recipients.length,
      senderEmail: result.senderEmail,
      error: result.error || "Impossible d’envoyer le mailing.",
    };
  }

  return {
    ok: true,
    sent: result.sent ?? input.recipients.length,
    failed: result.failed ?? 0,
    senderEmail: result.senderEmail,
  };
}
