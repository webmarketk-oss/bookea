import { getActiveCenterContext } from "@/lib/center-access";
import type { MailContact } from "@/lib/mailing-settings";
import {
  getSmsTemplate,
  loadCenterSmsSettings,
} from "@/lib/sms-settings";

export type MailingRecipient = Pick<
  MailContact,
  "id" | "email" | "firstName" | "lastName"
> & {
  confirmationLink?: string;
  date?: string;
  time?: string;
  treatment?: string;
};

export type SendMailingInput = {
  centerId?: string;
  imageDataUrl?: string;
  message: string;
  recipients: MailingRecipient[];
  subject: string;
};

export type AppointmentConfirmationEmailInput = {
  centerId?: string;
  clientId?: string;
  confirmationLink?: string;
  date?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  time?: string;
  treatment?: string;
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
        date: contact.date || "",
        time: contact.time || "",
        treatment: contact.treatment || "",
        confirmationLink: contact.confirmationLink || "",
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

export async function sendAppointmentConfirmationEmail(
  input: AppointmentConfirmationEmailInput,
): Promise<SendMailingResult> {
  const email = String(input.email || "").trim();

  if (!email) {
    return {
      ok: false,
      sent: 0,
      failed: 1,
      error: "Aucun email client.",
    };
  }

  const { settings, centerId } = await loadCenterSmsSettings();
  const template = getSmsTemplate(settings, settings.confirmationTemplateId);

  return sendBookeaMailing({
    centerId: input.centerId || centerId,
    subject: "Confirmation de votre RDV chez {{centre}}",
    message: template.body,
    recipients: [
      {
        id: input.clientId ? `client:${input.clientId}` : "",
        email,
        firstName: input.firstName || "vous",
        lastName: input.lastName || "",
        date: input.date || "",
        time: input.time || "",
        treatment: input.treatment || "",
        confirmationLink: input.confirmationLink || "",
      },
    ],
  });
}
