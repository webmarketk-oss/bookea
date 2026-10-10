export const CLIENT_AUTO_CONFIRM_HOURS = 48;

type PositionedKind = "Rendez-vous" | "Pause" | "Formation" | "Indisponible";
type PositionedStatus = "Confirmé" | "À confirmer" | string;

const BLOCK_KINDS = new Set(["Pause", "Formation", "Indisponible"]);
const AGENDA_KIND_NOTE = /\[kind:(Pause|Formation|Indisponible)\]/;

export function agendaKindFromTreatment(
  treatment?: string | null,
): PositionedKind | undefined {
  const value = String(treatment || "").trim();
  return BLOCK_KINDS.has(value) ? (value as PositionedKind) : undefined;
}

export function agendaKindFromNotes(notes?: string | null) {
  const match = String(notes || "").match(AGENDA_KIND_NOTE);
  return match ? (match[1] as PositionedKind) : undefined;
}

export function stripAgendaKindNote(notes?: string | null) {
  return String(notes || "")
    .replace(/^\s*\[kind:(?:Pause|Formation|Indisponible)\]\s*/i, "")
    .trim();
}

export function withAgendaKindNote(
  notes: string | undefined,
  kind?: string | null,
) {
  const blockKind = agendaKindFromTreatment(kind);
  const cleaned = stripAgendaKindNote(notes);
  if (!blockKind) {
    return cleaned || undefined;
  }
  return cleaned ? `[kind:${blockKind}]\n${cleaned}` : `[kind:${blockKind}]`;
}

export function resolveAgendaBlockKind(
  kind?: string | null,
  treatment?: string | null,
  personName?: string | null,
  notes?: string | null,
): PositionedKind | undefined {
  const firstWord = String(personName || "").trim().split(/\s+/)[0] || "";
  return (
    agendaKindFromTreatment(kind) ||
    agendaKindFromNotes(notes) ||
    agendaKindFromTreatment(firstWord) ||
    agendaKindFromTreatment(treatment)
  );
}

export function isAgendaBlockKind(
  kind?: string | null,
  treatment?: string | null,
  personName?: string | null,
  notes?: string | null,
) {
  return Boolean(resolveAgendaBlockKind(kind, treatment, personName, notes));
}

export const AGENDA_BLOCK_CLIENT_MARKER = "[agenda-block]";

const HIDDEN_AGENDA_BLOCK_FIRST_NAMES = new Set([
  "Pause",
  "Formation",
  "Indisponible",
  "Fermeture",
  "Agenda",
]);

export function belongsOnClientFiche(appointment: {
  kind?: string | null;
  treatment?: string | null;
  personName?: string | null;
  notes?: string | null;
}) {
  return !isAgendaBlockKind(
    appointment.kind,
    appointment.treatment,
    appointment.personName,
    appointment.notes,
  );
}

export function isHiddenAgendaBlockClient(row: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  privateNote?: string | null;
}) {
  if (String(row.privateNote || "").includes(AGENDA_BLOCK_CLIENT_MARKER)) {
    return true;
  }

  const firstName = String(row.firstName || "").trim();
  const lastName = String(row.lastName || "").trim();
  const phone = String(row.phone || "").replace(/[^\d]/g, "");
  const email = String(row.email || "").trim().toLowerCase();

  if (phone || (email && !email.endsWith("@internal.bookea"))) {
    return false;
  }

  if (firstName === "Agenda" && (!lastName || lastName === "Interne")) {
    return true;
  }

  return HIDDEN_AGENDA_BLOCK_FIRST_NAMES.has(firstName) && !lastName;
}

export function stripAgendaBlockClientIdentity<
  T extends {
    kind?: string | null;
    treatment?: string | null;
    personName?: string | null;
    notes?: string | null;
    clientId?: string;
    phone?: string;
    email?: string;
    birthDate?: string;
  },
>(appointment: T): T {
  if (
    !isAgendaBlockKind(
      appointment.kind,
      appointment.treatment,
      appointment.personName,
      appointment.notes,
    )
  ) {
    return appointment;
  }

  return {
    ...appointment,
    clientId: undefined,
    phone: "",
    email: undefined,
    birthDate: undefined,
  };
}

export function agendaBlockTitle(
  kind?: string | null,
  treatment?: string | null,
  personName?: string | null,
  notes?: string | null,
) {
  return (
    resolveAgendaBlockKind(kind, treatment, personName, notes) || "Pause"
  );
}

export function withAgendaBlockIdentity<
  T extends {
    kind?: PositionedKind;
    treatment?: string;
    personName?: string;
    notes?: string;
  },
>(item: T): T {
  const blockKind = resolveAgendaBlockKind(
    item.kind,
    item.treatment,
    item.personName,
    item.notes,
  );
  if (!blockKind) {
    return item;
  }

  const currentName = String(item.personName || "").trim();
  const firstWord = currentName.split(/\s+/)[0] || "";
  const keepCustomName =
    Boolean(currentName) &&
    !agendaKindFromTreatment(firstWord) &&
    firstWord.toLowerCase() !== "bookea";

  return {
    ...item,
    kind: blockKind,
    treatment: blockKind,
    personName: keepCustomName ? currentName : blockKind,
  };
}

export function appointmentLocalDate(date: string, start: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = (start || "00:00").split(":").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const when = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
  return Number.isNaN(when.getTime()) ? null : when;
}

export function isAppointmentMoreThanHoursAhead(
  date: string,
  start: string,
  hours: number,
) {
  const when = appointmentLocalDate(date, start);
  if (!when) {
    return false;
  }

  return when.getTime() - Date.now() > hours * 60 * 60 * 1000;
}

export function isAppointmentWithinHoursAhead(
  date: string,
  start: string,
  hours: number,
) {
  const when = appointmentLocalDate(date, start);
  if (!when) {
    return false;
  }

  const delta = when.getTime() - Date.now();
  return delta >= 0 && delta <= hours * 60 * 60 * 1000;
}

export function statusWhenAppointmentPositioned(
  date: string,
  start: string,
): "Confirmé" | "À confirmer" {
  return isAppointmentMoreThanHoursAhead(
    date,
    start,
    CLIENT_AUTO_CONFIRM_HOURS,
  )
    ? "Confirmé"
    : "À confirmer";
}

export function dbStatusWhenSlotPositioned(date: string, start: string) {
  return statusWhenAppointmentPositioned(date, start) === "Confirmé"
    ? "confirmed"
    : "to_confirm";
}

export function applyPositionedAppointmentStatus<
  T extends {
    kind?: PositionedKind;
    treatment?: string;
    personName?: string;
    notes?: string;
    date: string;
    start: string;
    status: PositionedStatus;
  },
>(item: T): T {
  const inferred = resolveAgendaBlockKind(
    item.kind,
    item.treatment,
    item.personName,
    item.notes,
  );
  const kind =
    item.kind && item.kind !== "Rendez-vous"
      ? item.kind
      : inferred ?? item.kind ?? "Rendez-vous";

  if (kind !== "Rendez-vous") {
    if (item.kind === kind && item.status !== "À confirmer") {
      return item;
    }

    return {
      ...item,
      kind,
      status: item.status === "À confirmer" ? "Confirmé" : item.status,
    };
  }

  if (item.status !== "Confirmé" && item.status !== "À confirmer") {
    return item;
  }

  return {
    ...item,
    status: statusWhenAppointmentPositioned(item.date, item.start),
  };
}
