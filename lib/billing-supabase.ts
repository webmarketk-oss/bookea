import { createClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createClient>;

export type BillingDiscountType = "Aucune" | "€" | "%";
export type BillingInvoiceType = "Devis" | "Acompte" | "Facture finale" | "Avoir";
export type BillingInvoiceStatus =
  | "Payée"
  | "En attente de paiement"
  | "Envoyée"
  | "Annulée";
export type BillingPaymentMethod = "Stripe" | "CB centre" | "Espèces" | "Virement";

export type BillingInvoiceLine = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discountType?: BillingDiscountType;
  discountValue?: number;
};

export type BillingInvoice = {
  id: string;
  number: string;
  date: string;
  client: string;
  email: string;
  care: string;
  type: BillingInvoiceType;
  status: BillingInvoiceStatus;
  total: number;
  paid: number;
  lines?: BillingInvoiceLine[];
  discountType?: BillingDiscountType;
  discountValue?: number;
  paymentMethod: BillingPaymentMethod;
};

type InvoiceRow = {
  id: string;
  center_id: string;
  client_id: string;
  number: string;
  type: string;
  status: string;
  total_ht: number | string | null;
  total_tva: number | string | null;
  total_ttc: number | string | null;
  discount_amount: number | string | null;
  paid_amount: number | string | null;
  balance_due: number | string | null;
  payment_method: string | null;
  issued_on: string;
  clients: Relation<{
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  }>;
  invoice_lines:
    | Array<{
        id: string;
        description: string;
        quantity: number | string | null;
        unit_price_ttc: number | string | null;
        vat_rate: number | string | null;
        discount_amount: number | string | null;
        line_total_ttc: number | string | null;
      }>
    | null;
};

type Relation<T> = T | T[] | null;

export async function loadBillingInvoices() {
  const supabase = createClient();
  const centerId = await getBillingCenterId(supabase);

  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
        id,
        center_id,
        client_id,
        number,
        type,
        status,
        total_ht,
        total_tva,
        total_ttc,
        discount_amount,
        paid_amount,
        balance_due,
        payment_method,
        issued_on,
        clients(first_name,last_name,email,phone),
        invoice_lines(id,description,quantity,unit_price_ttc,vat_rate,discount_amount,line_total_ttc)
      `,
    )
    .eq("center_id", centerId)
    .order("issued_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as InvoiceRow[]).map(toBillingInvoice);
}

export async function createBillingInvoice(invoice: BillingInvoice) {
  const supabase = createClient();
  const centerId = await getBillingCenterId(supabase);
  const clientId = await ensureBillingClient(supabase, centerId, invoice);
  const amounts = calculateAmounts(invoice);

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      center_id: centerId,
      client_id: clientId,
      number: invoice.number,
      type: toInvoiceTypeValue(invoice.type),
      status: toInvoiceStatusValue(invoice.status, invoice.type),
      total_ht: amounts.ht,
      total_tva: amounts.vat,
      total_ttc: invoice.total,
      discount_amount: amounts.discount,
      paid_amount: invoice.paid,
      balance_due: Math.max(invoice.total - invoice.paid, 0),
      payment_method: invoice.paymentMethod,
      issued_on: toIsoDate(invoice.date),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await replaceInvoiceLines(supabase, centerId, data.id as string, invoice.lines ?? []);

  return {
    ...invoice,
    id: data.id as string,
  };
}

export async function updateBillingInvoice(invoice: BillingInvoice) {
  const supabase = createClient();
  const centerId = await getInvoiceCenterId(supabase, invoice.id);
  const clientId = await ensureBillingClient(supabase, centerId, invoice);
  const amounts = calculateAmounts(invoice);

  const { error } = await supabase
    .from("invoices")
    .update({
      client_id: clientId,
      number: invoice.number,
      type: toInvoiceTypeValue(invoice.type),
      status: toInvoiceStatusValue(invoice.status, invoice.type),
      total_ht: amounts.ht,
      total_tva: amounts.vat,
      total_ttc: invoice.total,
      discount_amount: amounts.discount,
      paid_amount: invoice.paid,
      balance_due: Math.max(invoice.total - invoice.paid, 0),
      payment_method: invoice.paymentMethod,
      issued_on: toIsoDate(invoice.date),
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id);

  if (error) {
    throw new Error(error.message);
  }

  await replaceInvoiceLines(supabase, centerId, invoice.id, invoice.lines ?? []);
}

export async function deleteBillingInvoice(invoiceId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function registerBillingPayment(
  invoice: BillingInvoice,
  amount: number,
  paymentMethod: BillingPaymentMethod,
) {
  const supabase = createClient();
  const centerId = await getInvoiceCenterId(supabase, invoice.id);
  const payment = Math.max(Number(amount) || 0, 0);

  if (payment <= 0) {
    return invoice;
  }

  const nextPaid = Math.min(invoice.total, invoice.paid + payment);
  const nextStatus: BillingInvoiceStatus =
    nextPaid >= invoice.total ? "Payée" : "En attente de paiement";

  const { error: paymentError } = await supabase.from("payments").insert({
    center_id: centerId,
    invoice_id: invoice.id,
    amount: payment,
    payment_method: paymentMethod,
  });

  if (paymentError) {
    throw new Error(paymentError.message);
  }

  const { error: invoiceError } = await supabase
    .from("invoices")
    .update({
      paid_amount: nextPaid,
      balance_due: Math.max(invoice.total - nextPaid, 0),
      status: toInvoiceStatusValue(nextStatus, invoice.type),
      payment_method: paymentMethod,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id);

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  return {
    ...invoice,
    paid: nextPaid,
    status: nextStatus,
    paymentMethod,
  };
}

async function getBillingCenterId(supabase: SupabaseClient) {
  const { data: member, error: memberError } = await supabase
    .from("center_members")
    .select("center_id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw new Error(memberError.message);
  }

  if (member?.center_id) {
    return member.center_id as string;
  }

  const slug = process.env.NEXT_PUBLIC_DEFAULT_CENTER_SLUG ?? "jfg-clinique-clermont";
  const { data: center, error: centerError } = await supabase
    .from("centers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (centerError) {
    throw new Error(centerError.message);
  }

  if (!center?.id) {
    throw new Error("Aucun centre facturation accessible pour ce compte.");
  }

  return center.id as string;
}

async function getInvoiceCenterId(supabase: SupabaseClient, invoiceId: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select("center_id")
    .eq("id", invoiceId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.center_id as string;
}

async function ensureBillingClient(
  supabase: SupabaseClient,
  centerId: string,
  invoice: BillingInvoice,
) {
  const email = invoice.email.trim();

  if (email) {
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .eq("center_id", centerId)
      .ilike("email", email)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data?.id) return data.id as string;
  }

  const [firstName, ...lastNameParts] = invoice.client.trim().split(/\s+/);
  const { data, error } = await supabase
    .from("clients")
    .insert({
      center_id: centerId,
      first_name: firstName || "Cliente",
      last_name: lastNameParts.join(" ") || "Bookea",
      email: email || null,
      status: "active",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return data.id as string;
}

async function replaceInvoiceLines(
  supabase: SupabaseClient,
  centerId: string,
  invoiceId: string,
  lines: BillingInvoiceLine[],
) {
  const { error: deleteError } = await supabase
    .from("invoice_lines")
    .delete()
    .eq("invoice_id", invoiceId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (lines.length === 0) {
    return;
  }

  const { error } = await supabase.from("invoice_lines").insert(
    lines.map((line) => {
      const discount = calculateLineDiscount(line);

      return {
        center_id: centerId,
        invoice_id: invoiceId,
        description: line.label,
        quantity: line.quantity,
        unit_price_ttc: line.unitPrice,
        vat_rate: line.vatRate,
        discount_amount: discount,
        line_total_ttc: Math.max(line.quantity * line.unitPrice - discount, 0),
      };
    }),
  );

  if (error) {
    throw new Error(error.message);
  }
}

function toBillingInvoice(row: InvoiceRow): BillingInvoice {
  const client = relationObject(row.clients);
  const lines = (row.invoice_lines ?? []).map((line) => ({
    id: line.id,
    label: line.description,
    quantity: Number(line.quantity ?? 1),
    unitPrice: Number(line.unit_price_ttc ?? 0),
    vatRate: Number(line.vat_rate ?? 20),
    discountType: "€" as const,
    discountValue: Number(line.discount_amount ?? 0),
  }));

  return {
    id: row.id,
    number: row.number,
    date: formatDisplayDate(row.issued_on),
    client:
      [client?.first_name, client?.last_name].filter(Boolean).join(" ") ||
      "Cliente Bookea",
    email: client?.email ?? "",
    care: lines.length === 1 ? lines[0].label : `${lines.length} prestations`,
    type: fromInvoiceTypeValue(row.type),
    status: fromInvoiceStatusValue(row.status),
    total: Number(row.total_ttc ?? 0),
    paid: Number(row.paid_amount ?? 0),
    lines,
    discountType: "€",
    discountValue: Number(row.discount_amount ?? 0),
    paymentMethod: normalizePaymentMethod(row.payment_method),
  };
}

function calculateAmounts(invoice: BillingInvoice) {
  const lines = invoice.lines ?? [];
  const subtotal = lines.reduce(
    (total, line) => total + line.quantity * line.unitPrice,
    0,
  );
  const discount = Number(invoice.discountValue ?? 0);
  const vat = lines.reduce((total, line) => {
    const lineTotal = line.quantity * line.unitPrice - calculateLineDiscount(line);
    return total + lineTotal - lineTotal / (1 + line.vatRate / 100);
  }, 0);

  return {
    ht: invoice.total - vat,
    vat,
    discount,
    subtotal,
  };
}

function calculateLineDiscount(line: BillingInvoiceLine) {
  const base = line.quantity * line.unitPrice;

  if (line.discountType === "%") {
    return base * (Number(line.discountValue ?? 0) / 100);
  }

  if (line.discountType === "€") {
    return Number(line.discountValue ?? 0);
  }

  return 0;
}

function toInvoiceTypeValue(type: BillingInvoiceType) {
  if (type === "Devis") return "devis";
  if (type === "Acompte") return "acompte";
  if (type === "Avoir") return "avoir";
  return "finale";
}

function fromInvoiceTypeValue(type: string): BillingInvoiceType {
  if (type === "devis") return "Devis";
  if (type === "acompte") return "Acompte";
  if (type === "avoir") return "Avoir";
  return "Facture finale";
}

function toInvoiceStatusValue(status: BillingInvoiceStatus, type: BillingInvoiceType) {
  if (type === "Avoir") return "credit_note";
  if (status === "Payée") return "paid";
  if (status === "En attente de paiement") return "pending_payment";
  if (status === "Annulée") return "cancelled";
  return "sent";
}

function fromInvoiceStatusValue(status: string): BillingInvoiceStatus {
  if (status === "paid" || status === "credit_note") return "Payée";
  if (status === "pending_payment") return "En attente de paiement";
  if (status === "cancelled") return "Annulée";
  return "Envoyée";
}

function normalizePaymentMethod(value?: string | null): BillingPaymentMethod {
  if (value === "Stripe") return "Stripe";
  if (value === "Espèces") return "Espèces";
  if (value === "Virement") return "Virement";
  return "CB centre";
}

function toIsoDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [day, month, year] = value.split("/");
  if (!day || !month || !year) return new Date().toISOString().slice(0, 10);
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function relationObject<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}
