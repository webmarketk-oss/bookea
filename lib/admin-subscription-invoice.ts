import {
  ensureSubscriptionInvoice,
  type AgencyBillingState,
  type AgencyInvoice,
  type BillingCenterContact,
} from "@/lib/admin-agency-billing";
import {
  adminAuthHeaders,
  loadAgencyBilling,
  saveAgencyBilling,
} from "@/lib/admin-agency-store";
import { defaultInvoiceMailDraft } from "@/lib/billing-invoice-mail";
import { markCenterAdminAlertInvoiced } from "@/lib/center-billing";
import type { AdminInboxItem } from "@/lib/center-billing";

export type SubscriptionInvoiceFulfillment = {
  invoice: AgencyInvoice;
  emailedTo?: string;
  emailedAt?: string;
  mailError?: string;
  created: boolean;
};

export function subscriptionInvoiceHref(invoiceId: string, mailed: boolean) {
  const params = new URLSearchParams({
    company: "bookea",
    invoice: invoiceId,
  });
  params.set("mail", mailed ? "sent" : "pending");
  return `/dashboard/admin-gestion?${params.toString()}`;
}

export async function fulfillSubscriptionInvoice(
  item: AdminInboxItem,
  center: BillingCenterContact,
): Promise<SubscriptionInvoiceFulfillment> {
  const billing = await loadAgencyBilling("bookea");
  const prepared = ensureSubscriptionInvoice(billing, {
    center,
    alert: item,
  });
  let nextState: AgencyBillingState = prepared.state;
  let invoice = prepared.invoice;
  let mailedTo = invoice.emailedTo;
  let mailedAt = invoice.emailedAt;
  let mailError: string | undefined;

  if (center.email && !invoice.emailedAt) {
    try {
      const { agencyInvoicePdfDataUrl } = await import(
        "@/lib/admin-agency-invoice-pdf"
      );
      const pdf = await agencyInvoicePdfDataUrl(nextState, invoice);
      const copy = defaultInvoiceMailDraft({
        number: invoice.number,
        type: "Facture",
        client: center.name,
        email: center.email,
        centerName: "Bookea",
      });
      const response = await fetch("/api/admin/send-agency-invoice", {
        method: "POST",
        headers: await adminAuthHeaders(),
        body: JSON.stringify({
          number: invoice.number,
          to: center.email,
          client: center.name,
          subject: copy.subject,
          message: copy.message,
          pdf,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        emailedAt?: string;
        emailedTo?: string;
        error?: string;
      };
      if (!response.ok || result.ok === false) {
        mailError =
          result.error || "La facture est prête, mais l’e-mail n’a pas pu partir.";
      } else {
        mailedAt = result.emailedAt || new Date().toISOString();
        mailedTo = result.emailedTo || center.email;
        invoice = {
          ...invoice,
          emailedAt: mailedAt,
          emailedTo: mailedTo,
        };
        nextState = {
          ...nextState,
          invoices: nextState.invoices.map((current) =>
            current.id === invoice.id ? invoice : current,
          ),
        };
      }
    } catch (error) {
      mailError =
        error instanceof Error
          ? error.message
          : "La facture est prête, mais l’e-mail n’a pas pu partir.";
    }
  } else if (!center.email) {
    mailError = "Le centre n’a pas d’e-mail : la facture est prête, à envoyer à la main.";
  }

  await saveAgencyBilling(nextState);
  await markCenterAdminAlertInvoiced(item.centerId, item.id, {
    invoiceId: invoice.id,
    emailedAt: mailedAt,
    emailedTo: mailedTo,
  });

  return {
    invoice,
    emailedTo: mailedTo,
    emailedAt: mailedAt,
    mailError,
    created: prepared.created,
  };
}
