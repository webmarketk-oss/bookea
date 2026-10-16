import type { Lead, LeadStatus } from "@/types/lead";

export const ACOMPTE_RELANCE_EVENT = "acompte_relance";
export const ACOMPTE_SUIVI_EVENT = "acompte_suivi";

export type DepositReminderIndex = 1 | 2 | 3 | 4;

export type DepositPhaseFilter = "Tous" | "En attente" | "Reçus";

export const DEPOSIT_REMINDER_INDEXES: DepositReminderIndex[] = [1, 2, 3, 4];

export const DEPOSIT_STATUSES: LeadStatus[] = [
  "Acompte envoyé",
  "Acompte en attente",
  "Acompte reçu",
];

export const DEPOSIT_PENDING_STATUSES: LeadStatus[] = [
  "Acompte envoyé",
  "Acompte en attente",
];

export const DEPOSIT_RECEIVED_STATUSES: LeadStatus[] = ["Acompte reçu"];

export const DEPOSIT_REMINDER_LABELS: Record<DepositReminderIndex, string> = {
  1: "Relance acompte 1",
  2: "Relance acompte 2",
  3: "Relance acompte 3",
  4: "Relance acompte 4",
};

export function emptyDepositReminders(): NonNullable<Lead["depositReminders"]> {
  return { 1: "", 2: "", 3: "", 4: "" };
}

export function emptyDepositReminderNotes(): NonNullable<Lead["depositReminderNotes"]> {
  return { 1: "", 2: "", 3: "", 4: "" };
}

/** Les anciennes notes automatiques ne sont pas des commentaires saisis. */
export function depositReminderComment(note?: string | null): string {
  const text = (note || "").trim();
  if (!text || /^Relance acompte [1-4]\b/i.test(text)) {
    return "";
  }
  return text.slice(0, 500);
}

export function isDepositManagedLead(lead: Lead): boolean {
  return (
    Boolean(lead.depositTracked) ||
    DEPOSIT_STATUSES.includes(lead.status)
  );
}

export function matchesDepositPhaseFilter(
  lead: Lead,
  phase: DepositPhaseFilter,
): boolean {
  if (phase === "Tous") {
    return true;
  }
  if (phase === "En attente") {
    return DEPOSIT_PENDING_STATUSES.includes(lead.status);
  }
  return DEPOSIT_RECEIVED_STATUSES.includes(lead.status);
}

type DepositEventLike = {
  event_type: string;
  from_value?: string | null;
  to_value?: string | null;
  note?: string | null;
  created_at: string;
};

export function parseDepositTracked(events: DepositEventLike[]): boolean {
  return events.some((event) => event.event_type === ACOMPTE_SUIVI_EVENT);
}

type DepositFollowUp = { at: number; value: string; comment: string };

function latestDepositFollowUps(events: DepositEventLike[]) {
  const latestByIndex = new Map<DepositReminderIndex, DepositFollowUp>();

  for (const event of events) {
    if (event.event_type !== ACOMPTE_RELANCE_EVENT) {
      continue;
    }
    const index = Number(event.from_value) as DepositReminderIndex;
    if (![1, 2, 3, 4].includes(index)) {
      continue;
    }
    const at = Date.parse(event.created_at);
    const previous = latestByIndex.get(index);
    const stamp = Number.isNaN(at) ? 0 : at;
    if (previous && previous.at >= stamp) {
      continue;
    }
    latestByIndex.set(index, {
      at: stamp,
      value: (event.to_value || "").trim(),
      comment: depositReminderComment(event.note),
    });
  }

  return latestByIndex;
}

export function parseDepositReminders(
  events: DepositEventLike[],
): NonNullable<Lead["depositReminders"]> {
  const reminders = emptyDepositReminders();
  for (const [index, entry] of latestDepositFollowUps(events)) {
    reminders[index] = entry.value;
  }
  return reminders;
}

export function parseDepositReminderNotes(
  events: DepositEventLike[],
): NonNullable<Lead["depositReminderNotes"]> {
  const notes = emptyDepositReminderNotes();
  for (const [index, entry] of latestDepositFollowUps(events)) {
    notes[index] = entry.comment;
  }
  return notes;
}

/** Valeur pour `<input type="datetime-local">` (fuseau local). */
export function toDatetimeLocalValue(iso?: string | null): string {
  const raw = (iso || "").trim();
  if (!raw) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Stockage ISO UTC à partir d’une valeur datetime-local. */
export function fromDatetimeLocalValue(local: string): string {
  const raw = local.trim();
  if (!raw) {
    return "";
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

export function formatDepositReminderDisplay(iso?: string | null): string {
  const local = toDatetimeLocalValue(iso);
  if (!local) {
    return "";
  }
  const [day, time] = local.split("T");
  if (!day || !time) {
    return local;
  }
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year} ${time}`;
}

export function isAcompteDepositEvent(eventType: string): boolean {
  return (
    eventType === ACOMPTE_RELANCE_EVENT || eventType === ACOMPTE_SUIVI_EVENT
  );
}
