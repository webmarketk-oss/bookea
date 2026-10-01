import type { BillingInvoice } from "./billing-supabase";
import type { Lead, LeadActivity } from "../types/lead";

export type SeyaKpiConversation = {
  id?: string;
  leadId?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  qualification?: { need?: string; zone?: string };
  proposedSlots?: Array<{ label?: string }>;
  bookedSlot?: { date?: string; time?: string; label?: string } | null;
  bookingState?: {
    lastOfferedSlots?: unknown[];
    appointmentStatus?: string;
  };
  healthReview?: { status?: string };
  messages?: Array<{ author?: string; text?: string; at?: string }>;
  updatedAt?: string;
  lastRelanceAt?: string | null;
  relanceCount?: number;
};

export type SeyaKpiResult = {
  contacted: number;
  replied: number;
  replyRate: number;
  qualified: number;
  proposed: number;
  booked: number;
  proposalToBookRate: number;
  devis: number;
  invoices: number;
  revenue: number;
  notInterested: number;
  willComeBack: number;
  outOfZoneOrWrongCenter: number;
  relanced: number;
  repliedAfterRelance: number;
  bookedAfterRelance: number;
  healthHandoff: number;
  humanHandoff: number;
  averageHoursToFirstRdv: number | null;
};

const SOLD = new Set(["Vendu", "Client", "Client converti"]);

function compactIdentity(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function last9Phone(value?: string | null) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

function isJunkNeed(value?: string | null) {
  const needle = compactIdentity(value);
  return (
    !needle ||
    /lead meta|soin a preciser|a preciser/.test(needle)
  );
}

function isDeskConversation(conversation: SeyaKpiConversation) {
  const id = String(conversation.id || conversation.leadId || "");
  return id === "agenda-desk" || id.startsWith("agenda-desk");
}

function seyaMessages(conversation: SeyaKpiConversation) {
  return (conversation.messages || []).filter(
    (item) => item.author === "seya" && String(item.text || "").trim(),
  );
}

function leadMessages(conversation: SeyaKpiConversation) {
  return (conversation.messages || []).filter(
    (item) => item.author === "lead" && String(item.text || "").trim(),
  );
}

export function isSeyaContacted(conversation: SeyaKpiConversation) {
  return !isDeskConversation(conversation) && seyaMessages(conversation).length > 0;
}

export function isSeyaReplied(conversation: SeyaKpiConversation) {
  return isSeyaContacted(conversation) && leadMessages(conversation).length > 0;
}

export function isSeyaQualified(conversation: SeyaKpiConversation) {
  if (!isSeyaReplied(conversation)) {
    return false;
  }
  const need = conversation.qualification?.need;
  const zone = String(conversation.qualification?.zone || "").trim();
  if (isJunkNeed(need) && !zone) {
    return false;
  }
  if (zone) {
    return true;
  }
  if (!isJunkNeed(need)) {
    return true;
  }
  return /qualifi|rdv propos|rdv pris|rdv confirm/i.test(
    String(conversation.status || ""),
  );
}

export function isSeyaProposed(conversation: SeyaKpiConversation) {
  if (!isSeyaReplied(conversation)) {
    return false;
  }
  return (
    (conversation.proposedSlots || []).length > 0 ||
    (conversation.bookingState?.lastOfferedSlots || []).length > 0 ||
    conversation.bookingState?.appointmentStatus === "proposed" ||
    conversation.bookingState?.appointmentStatus === "confirmed" ||
    Boolean(conversation.bookedSlot)
  );
}

export function isSeyaBooked(conversation: SeyaKpiConversation) {
  if (!isSeyaReplied(conversation)) {
    return false;
  }
  return (
    Boolean(conversation.bookedSlot) ||
    conversation.bookingState?.appointmentStatus === "confirmed"
  );
}

function compactText(value?: string | null) {
  return compactIdentity(value)
    .replace(/['’]/g, " ")
    .replace(/[.!,;:?…]+/g, " ");
}

function isWrongCenterText(text: string) {
  const value = compactText(text);
  return (
    /je pensais (que )?(c etait)/.test(value) ||
    /trompe de (centre|institut|ville|adresse|numero)/.test(value) ||
    /pas le bon (centre|institut|etablissement|numero)/.test(value) ||
    /mauvais (centre|institut|numero)/.test(value)
  );
}

function isOutOfZoneText(text: string) {
  const value = compactText(text);
  return /hors[- ]?zone|trop loin|pas (dans )?(le |votre )?secteur|pas de votre cote|j habite (trop )?loin/.test(
    value,
  );
}

function isWillComeBackText(text: string) {
  const value = compactText(text);
  return /je (vous |te )?(reviendrai|reviens) vers (vous|toi|nous)|reviendrai vers (vous|nous)|je (vous|te) (re)?contacterai|c est moi qui (vous |te )?(re)?contacte/.test(
    value,
  );
}

function isAskToWriteBackText(text: string) {
  const value = compactText(text);
  return /renvoy(ez|e) moi|rappelez moi|recontactez moi|un message (lundi|mardi|mercredi|jeudi|vendredi|samedi)|ecrivez moi (lundi|mardi|mercredi|jeudi|vendredi|samedi)/.test(
    value,
  );
}

function bookedCrmStatus(status?: string | null) {
  return /rdv pris|rdv confirm|vendu|client|acompte|devis/i.test(String(status || ""));
}

function messageTime(value?: string | null) {
  if (!value) {
    return 0;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function firstSeyaAt(conversation: SeyaKpiConversation) {
  const first = seyaMessages(conversation)[0]?.at;
  return messageTime(first);
}

function lastLeadAt(conversation: SeyaKpiConversation) {
  const messages = leadMessages(conversation);
  return messageTime(messages[messages.length - 1]?.at);
}

function wasRelanced(conversation: SeyaKpiConversation) {
  return (
    Boolean(conversation.lastRelanceAt) ||
    Number(conversation.relanceCount || 0) > 0
  );
}

function matchLead(
  conversation: SeyaKpiConversation,
  leads: Lead[],
): Lead | undefined {
  const byId = leads.find((lead) => lead.id && lead.id === conversation.leadId);
  if (byId) {
    return byId;
  }
  const phone = last9Phone(conversation.phone);
  if (phone.length >= 9) {
    const byPhone = leads.find((lead) => last9Phone(lead.phone) === phone);
    if (byPhone) {
      return byPhone;
    }
  }
  const name = compactIdentity(
    `${conversation.firstName || ""} ${conversation.lastName || ""}`,
  );
  if (!name || /equipe/.test(name)) {
    return undefined;
  }
  return leads.find(
    (lead) => compactIdentity(`${lead.firstName} ${lead.lastName}`) === name,
  );
}

function matchLeadForInvoice(invoice: BillingInvoice, leads: Lead[]) {
  const email = compactIdentity(invoice.email);
  if (email) {
    const byEmail = leads.find((lead) => compactIdentity(lead.email) === email);
    if (byEmail) {
      return byEmail;
    }
  }
  const phone = last9Phone(invoice.phone);
  if (phone.length >= 9) {
    const byPhone = leads.find((lead) => last9Phone(lead.phone) === phone);
    if (byPhone) {
      return byPhone;
    }
  }
  const name = compactIdentity(invoice.client);
  if (!name) {
    return undefined;
  }
  return leads.find(
    (lead) => compactIdentity(`${lead.firstName} ${lead.lastName}`) === name,
  );
}

function activityTime(activity: LeadActivity) {
  if (activity.occurredAt) {
    return messageTime(activity.occurredAt);
  }
  return 0;
}

function firstRdvActivityTime(lead?: Lead) {
  if (!lead) {
    return 0;
  }
  for (const activity of lead.activityLog || []) {
    if (activity.type === "comment") {
      continue;
    }
    if (/rdv pris|rdv confirm|acompte (envoy|recu|valid)/i.test(activity.text)) {
      const time = activityTime(activity);
      if (time) {
        return time;
      }
    }
  }
  return 0;
}

function ratio(value: number, total: number) {
  if (!total) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

export function buildSeyaKpi(
  conversations: SeyaKpiConversation[],
  leads: Lead[] = [],
  invoices: BillingInvoice[] = [],
): SeyaKpiResult {
  const threads = conversations.filter(isSeyaContacted);
  const contacted = threads.length;
  const replied = threads.filter(isSeyaReplied).length;
  const qualified = threads.filter(isSeyaQualified).length;
  const proposed = threads.filter(isSeyaProposed).length;
  const booked = threads.filter(isSeyaBooked).length;

  const seyaLeads: Lead[] = [];
  const seenLeadIds = new Set<string>();
  for (const conversation of threads) {
    const lead = matchLead(conversation, leads);
    if (lead && !seenLeadIds.has(lead.id)) {
      seenLeadIds.add(lead.id);
      seyaLeads.push(lead);
    }
  }

  const devisLeadIds = new Set<string>();
  let devis = 0;
  let invoicesCount = 0;
  let invoiceRevenue = 0;
  const invoicedLeadIds = new Set<string>();

  for (const lead of seyaLeads) {
    if (lead.status === "Devis") {
      devis += 1;
      devisLeadIds.add(lead.id);
    }
  }

  for (const invoice of invoices) {
    if (invoice.status === "Annulée") {
      continue;
    }
    const lead = matchLeadForInvoice(invoice, seyaLeads);
    if (!lead) {
      continue;
    }
    if (invoice.type === "Devis" && !devisLeadIds.has(lead.id)) {
      devis += 1;
      devisLeadIds.add(lead.id);
    }
    if (invoice.type === "Facture finale") {
      invoicesCount += 1;
      invoiceRevenue += Math.max(0, Number(invoice.total) || 0);
      invoicedLeadIds.add(lead.id);
    }
    if (invoice.type === "Avoir") {
      invoiceRevenue -= Math.abs(Number(invoice.total) || 0);
    }
  }

  let soldRevenue = 0;
  for (const lead of seyaLeads) {
    if (SOLD.has(lead.status) && !invoicedLeadIds.has(lead.id)) {
      soldRevenue += Number(lead.dealAmount) || 0;
    }
  }
  const revenue = invoiceRevenue + soldRevenue;

  let notInterested = 0;
  let willComeBack = 0;
  let outOfZoneOrWrongCenter = 0;
  let relanced = 0;
  let repliedAfterRelance = 0;
  let bookedAfterRelance = 0;
  let healthHandoff = 0;
  let humanHandoff = 0;
  const delays: number[] = [];

  for (const conversation of threads) {
    const lead = matchLead(conversation, leads);
    const lastLeadText = leadMessages(conversation).at(-1)?.text || "";
    const leadTexts = leadMessages(conversation).map((item) =>
      String(item.text || ""),
    );
    const booked = isSeyaBooked(conversation) || bookedCrmStatus(lead?.status);
    const wrongCenter = leadTexts.some((item) => isWrongCenterText(item));
    const outOfZone =
      lead?.status === "Hors zone" ||
      isOutOfZoneText(lastLeadText) ||
      leadTexts.some((item) => isOutOfZoneText(item));
    const comesBack =
      lead?.status === "Reviendra vers nous" ||
      isWillComeBackText(lastLeadText) ||
      leadTexts.some((item) => isWillComeBackText(item));
    const askWriteBack =
      conversation.status === "À recontacter" ||
      isAskToWriteBackText(lastLeadText);

    if (!booked) {
      if (outOfZone || wrongCenter) {
        outOfZoneOrWrongCenter += 1;
      } else if (comesBack) {
        willComeBack += 1;
      } else if (
        conversation.status === "Pas intéressé" ||
        lead?.status === "Pas intéressé"
      ) {
        notInterested += 1;
      }
    }

    if (conversation.healthReview?.status === "awaiting_human_health_review") {
      healthHandoff += 1;
    } else if (conversation.status === "Revue santé") {
      healthHandoff += 1;
    }
    if (askWriteBack && !booked) {
      humanHandoff += 1;
    }

    if (wasRelanced(conversation)) {
      relanced += 1;
      const relanceAt = messageTime(conversation.lastRelanceAt);
      if (relanceAt && lastLeadAt(conversation) > relanceAt) {
        repliedAfterRelance += 1;
        if (isSeyaBooked(conversation)) {
          bookedAfterRelance += 1;
        }
      } else if (!relanceAt && isSeyaReplied(conversation) && isSeyaBooked(conversation)) {
        bookedAfterRelance += 1;
      }
    }

    if (isSeyaBooked(conversation)) {
      const start = firstSeyaAt(conversation);
      const rdvAt =
        firstRdvActivityTime(lead) ||
        messageTime(conversation.updatedAt) ||
        lastLeadAt(conversation);
      if (start && rdvAt && rdvAt >= start) {
        delays.push((rdvAt - start) / 3600000);
      }
    }
  }

  const averageHoursToFirstRdv =
    delays.length === 0
      ? null
      : Math.round((delays.reduce((sum, item) => sum + item, 0) / delays.length) * 10) /
        10;

  return {
    contacted,
    replied,
    replyRate: ratio(replied, contacted),
    qualified,
    proposed,
    booked,
    proposalToBookRate: ratio(booked, proposed),
    devis,
    invoices: invoicesCount,
    revenue: Math.round(revenue),
    notInterested,
    willComeBack,
    outOfZoneOrWrongCenter,
    relanced,
    repliedAfterRelance,
    bookedAfterRelance,
    healthHandoff,
    humanHandoff,
    averageHoursToFirstRdv,
  };
}

export function formatSeyaKpiDelay(hours: number | null) {
  if (hours == null) {
    return "—";
  }
  if (hours < 24) {
    return `${hours.toString().replace(".", ",")} h`;
  }
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days.toString().replace(".", ",")} j`;
}
