import type { Lead } from "@/types/lead";

export type WhatsAppDelivery = "sent" | "failed" | "pending" | "received";

export type LeadWhatsAppMessage = {
  id: string;
  from: "seya" | "equipe" | "prospect";
  text: string;
  at: string;
  delivery: WhatsAppDelivery;
};

export type WhatsAppThread = {
  leadId?: string | null;
  phone?: string | null;
  status?: string | null;
  sendError?: string | null;
  messages?: Array<{
    id?: string;
    author?: string;
    text?: string;
    at?: string;
    delivery?: string;
  }> | null;
};

export type LeadWhatsAppSummary = {
  messages: LeadWhatsAppMessage[];
  lastSent: LeadWhatsAppMessage | null;
  lastAttempt: LeadWhatsAppMessage | null;
};

const INTERNAL_CENTRE_NOTE =
  /^Vérification santé faite\. Seya peut reprendre la conversation\.$/;

function last9Digits(phone?: string | null) {
  return String(phone || "").replace(/\D/g, "").slice(-9);
}

// Les anciens messages n’ont pas de statut par message : l’échec n’est connu qu’au niveau du fil.
export function threadWhatsAppMessages(thread: WhatsAppThread): LeadWhatsAppMessage[] {
  const raw = (thread.messages || []).filter(
    (item) =>
      item &&
      String(item.text || "").trim() &&
      ["seya", "centre", "lead"].includes(String(item.author)) &&
      !(item.author === "centre" && INTERNAL_CENTRE_NOTE.test(String(item.text).trim())),
  );
  const lastLeadIndex = raw.map((item) => item.author).lastIndexOf("lead");
  let lastUnflaggedReply = -1;
  raw.forEach((item, index) => {
    if (item.author !== "lead" && !item.delivery && index > lastLeadIndex) {
      lastUnflaggedReply = index;
    }
  });
  const waitingWelcome = thread.status === "À envoyer";

  return raw.map((item, index) => {
    const outgoing = item.author !== "lead";
    let delivery: WhatsAppDelivery = "received";
    if (outgoing) {
      if (item.delivery === "failed") {
        delivery = "failed";
      } else if (item.delivery === "sent") {
        delivery = "sent";
      } else if (thread.sendError && index === lastUnflaggedReply) {
        delivery = "failed";
      } else if (waitingWelcome && index > lastLeadIndex) {
        delivery = "pending";
      } else {
        delivery = "sent";
      }
    }
    return {
      id: String(item.id || `${item.at}-${index}`),
      from: item.author === "seya" ? "seya" : item.author === "centre" ? "equipe" : "prospect",
      text: String(item.text).trim(),
      at: String(item.at || ""),
      delivery,
    };
  });
}

// Un fil rattaché à une fiche du centre ne va qu’à elle ; sinon il est retrouvé par le téléphone.
export function leadWhatsAppSummaries(
  leads: Array<Pick<Lead, "id" | "phone">>,
  threads: WhatsAppThread[],
): Map<string, LeadWhatsAppSummary> {
  const leadIds = new Set(leads.map((lead) => lead.id));
  const byLeadId = new Map<string, WhatsAppThread[]>();
  const byPhone = new Map<string, WhatsAppThread[]>();
  for (const thread of threads) {
    if (!thread) {
      continue;
    }
    const leadId = thread.leadId ? String(thread.leadId) : "";
    if (leadId && leadIds.has(leadId)) {
      byLeadId.set(leadId, [...(byLeadId.get(leadId) ?? []), thread]);
      continue;
    }
    const phone = last9Digits(thread.phone);
    if (phone.length === 9) {
      byPhone.set(phone, [...(byPhone.get(phone) ?? []), thread]);
    }
  }

  const summaries = new Map<string, LeadWhatsAppSummary>();
  for (const lead of leads) {
    const phone = last9Digits(lead.phone);
    const matched =
      byLeadId.get(lead.id) ?? (phone.length === 9 ? byPhone.get(phone) : undefined);
    if (!matched?.length) {
      continue;
    }
    const messages = matched
      .flatMap(threadWhatsAppMessages)
      .sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
    const outgoing = messages.filter((item) => item.delivery !== "received");
    summaries.set(lead.id, {
      messages,
      lastSent: [...outgoing].reverse().find((item) => item.delivery === "sent") ?? null,
      lastAttempt: outgoing.at(-1) ?? null,
    });
  }
  return summaries;
}

export function formatWhatsAppDate(at: string) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
