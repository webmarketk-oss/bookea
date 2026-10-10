import { createClient } from "@/lib/supabase";

export type SubscriptionInvoiceReceipt = {
  invoice?: { id: string; number: string };
  emailedAt?: string;
  emailedTo?: string;
  mailError?: string;
  created?: boolean;
  error?: string;
};

export async function requestSubscriptionInvoice(
  centerId: string,
  alertId: string,
): Promise<SubscriptionInvoiceReceipt> {
  try {
    const {
      data: { session },
    } = await createClient().auth.getSession();
    const response = await fetch("/api/billing/subscription-invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({ centerId, alertId }),
    });
    const result = (await response.json().catch(() => ({}))) as SubscriptionInvoiceReceipt & {
      ok?: boolean;
    };
    if (!response.ok || result.ok === false || !result.invoice) {
      return { error: result.error || "La facture n’a pas pu être préparée." };
    }
    return result;
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "La facture n’a pas pu être préparée.",
    };
  }
}

export function subscriptionInvoiceNotice(receipt?: SubscriptionInvoiceReceipt) {
  if (receipt?.invoice && receipt.emailedTo) {
    return `La facture ${receipt.invoice.number} a été envoyée à ${receipt.emailedTo}.`;
  }
  return "Bookea vous enverra la facture par e-mail.";
}
