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
  requireMailbox?: boolean;
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
      mailboxConnected?: boolean;
      mailboxPending?: boolean;
      mailboxEmail?: string;
      senderEmail?: string;
      senderName?: string;
    };

    return {
      configured: Boolean(result.configured),
      mailboxConnected: Boolean(result.mailboxConnected),
      mailboxPending: Boolean(result.mailboxPending),
      mailboxEmail: result.mailboxEmail || "",
      senderEmail: result.senderEmail || "",
      senderName: result.senderName || "",
    };
  } catch {
    return {
      configured: false,
      mailboxConnected: false,
      mailboxPending: false,
      mailboxEmail: "",
      senderEmail: "",
      senderName: "",
    };
  }
}

export type MailingMailboxStatus = {
  brevoReady: boolean;
  connected: boolean;
  email: string;
  error?: string;
  notice?: string;
  pending: boolean;
};

export async function loadMailingMailbox(
  centerId: string,
): Promise<MailingMailboxStatus> {
  try {
    const response = await fetch(
      `/api/mailing/mailbox?centerId=${encodeURIComponent(centerId)}`,
    );
    const result = (await response.json().catch(() => ({}))) as MailingMailboxStatus & {
      ok?: boolean;
    };
    return {
      brevoReady: Boolean(result.brevoReady),
      connected: Boolean(result.connected),
      pending: Boolean(result.pending),
      email: result.email || "",
      error: result.error,
    };
  } catch {
    return {
      brevoReady: false,
      connected: false,
      pending: false,
      email: "",
      error: "Impossible de lire la boîte mail.",
    };
  }
}

export async function postMailingMailbox(input: {
  action: "connect" | "validate" | "refresh" | "disconnect";
  centerId: string;
  email?: string;
  name?: string;
  otp?: string;
}): Promise<MailingMailboxStatus> {
  const response = await fetch("/api/mailing/mailbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = (await response.json().catch(() => ({}))) as MailingMailboxStatus & {
    ok?: boolean;
  };
  if (!response.ok || result.ok === false) {
    return {
      brevoReady: Boolean(result.brevoReady),
      connected: Boolean(result.connected),
      pending: Boolean(result.pending),
      email: result.email || input.email || "",
      error: result.error || "Impossible de connecter la boîte mail.",
    };
  }
  return {
    brevoReady: Boolean(result.brevoReady),
    connected: Boolean(result.connected),
    pending: Boolean(result.pending),
    email: result.email || "",
    notice: result.notice,
  };
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
      requireMailbox: input.requireMailbox === true,
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
