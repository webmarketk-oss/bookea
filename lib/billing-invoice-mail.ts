import { getActiveCenterContext } from "@/lib/center-access";
import {
  loadMailingMailbox,
  postMailingMailbox,
  type MailingMailboxStatus,
} from "@/lib/send-mailing";

export type InvoiceMailDraft = {
  to: string;
  subject: string;
  message: string;
};

export type InvoiceMailResult = {
  ok: boolean;
  emailedAt?: string;
  emailedTo?: string;
  error?: string;
};

export function defaultInvoiceMailDraft(input: {
  number: string;
  type: string;
  client: string;
  email: string;
  centerName?: string;
}): InvoiceMailDraft {
  const kind = /devis/i.test(input.type) ? "devis" : "facture";
  const centre = input.centerName?.trim() || "votre centre";
  return {
    to: input.email.trim(),
    subject: `Votre ${kind} ${input.number}`,
    message: [
      `Bonjour ${input.client.trim() || "bonjour"},`,
      "",
      `Veuillez trouver ci-joint votre ${kind} ${input.number}.`,
      "",
      "Cordialement,",
      centre,
    ].join("\n"),
  };
}

export async function sendBillingInvoiceMail(input: {
  invoiceId: string;
  to: string;
  subject: string;
  message: string;
  pdf: string;
  centerId?: string;
}): Promise<InvoiceMailResult> {
  let centerId = input.centerId || "";
  if (!centerId) {
    try {
      centerId = (await getActiveCenterContext()).centerId;
    } catch {
      centerId = "";
    }
  }

  const response = await fetch("/api/billing/send-invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      centerId,
      invoiceId: input.invoiceId,
      to: input.to,
      subject: input.subject,
      message: input.message,
      pdf: input.pdf,
    }),
  });
  const result = (await response.json().catch(() => ({}))) as InvoiceMailResult & {
    error?: string;
  };
  if (!response.ok || result.ok === false) {
    return {
      ok: false,
      error: result.error || "L’envoi de la facture a échoué.",
    };
  }
  return {
    ok: true,
    emailedAt: result.emailedAt,
    emailedTo: result.emailedTo,
  };
}

export async function loadBillingMailbox(centerId?: string): Promise<
  MailingMailboxStatus & { centerId: string }
> {
  let id = centerId || "";
  if (!id) {
    try {
      id = (await getActiveCenterContext()).centerId;
    } catch {
      id = "";
    }
  }
  if (!id) {
    return {
      centerId: "",
      brevoReady: false,
      connected: false,
      pending: false,
      email: "",
      error: "Centre introuvable.",
    };
  }
  const box = await loadMailingMailbox(id);
  return { ...box, centerId: id };
}

export async function postBillingMailbox(input: {
  action: "connect" | "validate" | "refresh" | "disconnect";
  centerId: string;
  email?: string;
  otp?: string;
}) {
  return postMailingMailbox(input);
}
