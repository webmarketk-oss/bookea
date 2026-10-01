import type { BillingInvoice } from "@/lib/billing-supabase";

export type YearlyTtcSeries = {
  year: number;
  months: number[];
};

function parseInvoiceDate(value: string) {
  const slash = value.split("/");
  if (slash.length === 3) {
    const [day, month, year] = slash.map(Number);
    if (year && month && day) {
      return { year, month: month - 1 };
    }
  }

  const iso = value.slice(0, 10).split("-").map(Number);
  if (iso.length === 3 && iso[0] && iso[1]) {
    return { year: iso[0], month: iso[1] - 1 };
  }

  return null;
}

export function invoiceTtcDelta(invoice: Pick<BillingInvoice, "type" | "status" | "total">) {
  if (invoice.status === "Annulée") {
    return 0;
  }
  if (invoice.type === "Avoir") {
    return -Math.abs(Number(invoice.total) || 0);
  }
  if (invoice.type === "Facture finale") {
    return Math.max(0, Number(invoice.total) || 0);
  }
  return 0;
}

export function buildYearlyTtcSeries(
  invoices: Array<Pick<BillingInvoice, "date" | "type" | "status" | "total">>,
): YearlyTtcSeries[] {
  const byYear = new Map<number, number[]>();

  function emptyMonths() {
    return Array.from({ length: 12 }, () => 0);
  }

  function ensure(year: number) {
    const current = byYear.get(year);
    if (current) {
      return current;
    }
    const next = emptyMonths();
    byYear.set(year, next);
    return next;
  }

  ensure(new Date().getFullYear());

  for (const invoice of invoices) {
    const delta = invoiceTtcDelta(invoice);
    if (!delta) {
      continue;
    }
    const parsed = parseInvoiceDate(invoice.date);
    if (!parsed || parsed.month < 0 || parsed.month > 11) {
      continue;
    }
    ensure(parsed.year)[parsed.month] += delta;
  }

  return [...byYear.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([year, months]) => ({ year, months }));
}
