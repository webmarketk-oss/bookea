import type { AdminInboxItem } from "@/lib/center-billing";
import { requestSubscriptionInvoice } from "@/lib/subscription-invoice-request";

export type SubscriptionInvoiceFulfillment = {
  invoice: { id: string; number: string };
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
  item: Pick<AdminInboxItem, "centerId" | "id">,
): Promise<SubscriptionInvoiceFulfillment> {
  const receipt = await requestSubscriptionInvoice(item.centerId, item.id);
  if (!receipt.invoice) {
    throw new Error(receipt.error || "Impossible de préparer la facture.");
  }
  return {
    invoice: receipt.invoice,
    emailedTo: receipt.emailedTo,
    emailedAt: receipt.emailedAt,
    mailError: receipt.mailError,
    created: receipt.created === true,
  };
}
