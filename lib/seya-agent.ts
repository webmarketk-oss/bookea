import { addDaysIso, todayIso } from "@/lib/crm-stats";
import type { CenterDayHours } from "@/lib/center-hours";
import {
  resolveTreatmentBrief,
  type SeyaAgentMessage,
  type SeyaAgentSettings,
  type SeyaConversation,
  type SeyaConversationStatus,
  type SeyaProposedSlot,
  type SeyaQualification,
} from "@/lib/seya-settings";
import type { Appointment } from "@/types/agenda";
import type { Lead } from "@/types/lead";

const weekdayNames = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

const weekdayShort = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export function emptyQualification(): SeyaQualification {
  return { need: "", zone: "", delay: "", availability: "" };
}

export function createSeyaMessage(
  author: SeyaAgentMessage["author"],
  text: string,
): SeyaAgentMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    text: text.trim(),
    at: new Date().toISOString(),
  };
}

export function buildOpeningMessage(
  lead: Pick<Lead, "firstName" | "treatment">,
  centerName: string,
  settings: SeyaAgentSettings,
) {
  const firstName = lead.firstName.trim() || "bonjour";
  const treatment = lead.treatment.trim();
  const center = centerName.trim() || "le centre";

  const treatmentHint = resolveTreatmentBrief(settings, treatment);

  if (settings.qualifyOnSignup && settings.bookAppointment) {
    if (treatment && !/soin à préciser|lead meta|à préciser/i.test(treatment)) {
      return `Bonjour ${firstName}, merci pour votre inscription chez ${center}. Je suis Seya. Vous avez indiqué « ${treatment} ». ${treatmentHint || "Dites-moi la zone ou l’objectif, et quels jours vous iraient cette semaine."} Je vous propose ensuite un vrai créneau.`;
    }

    return `Bonjour ${firstName}, merci pour votre inscription chez ${center}. Je suis Seya, l’assistante du centre. Quel soin souhaitez-vous, et avez-vous déjà une idée de jour cette semaine ? Je vous propose ensuite un créneau réel.`;
  }

  if (settings.qualifyOnSignup) {
    return `Bonjour ${firstName}, merci pour votre message chez ${center}. Je suis Seya. Quel soin vous intéresse, et sur quelle zone ?`;
  }

  return `Bonjour ${firstName}, merci pour votre inscription chez ${center}. Je suis Seya. Souhaitez-vous que je vous propose un créneau dès maintenant ?`;
}

export function startSeyaConversation({
  lead,
  centerName,
  settings,
}: {
  lead: Lead;
  centerName: string;
  settings: SeyaAgentSettings;
}): SeyaConversation {
  const opening = buildOpeningMessage(lead, centerName, settings);
  const treatment = lead.treatment.trim();

  return {
    id: lead.id,
    leadId: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    phone: lead.phone,
    treatment,
    status: "À envoyer",
    qualification: {
      ...emptyQualification(),
      need:
        treatment && !/soin à préciser|lead meta|à préciser/i.test(treatment)
          ? treatment
          : "",
    },
    proposedSlots: [],
    messages: [createSeyaMessage("seya", opening)],
    updatedAt: new Date().toISOString(),
  };
}

export function suggestAvailableSlots({
  appointments,
  hours,
  days = 10,
  count = 3,
  duration = 60,
}: {
  appointments: Appointment[];
  hours: CenterDayHours[];
  days?: number;
  count?: number;
  duration?: number;
}): SeyaProposedSlot[] {
  const slots: SeyaProposedSlot[] = [];
  const today = todayIso();
  const nowMinutes = currentMinutes();

  for (let offset = 0; offset < days && slots.length < count; offset += 1) {
    const date = addDaysIso(today, offset);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const dayHours = hours.find((item) => item.weekday === weekday);

    if (!dayHours || dayHours.closed) {
      continue;
    }

    const start = timeToMinutes(dayHours.startTime);
    const end = timeToMinutes(dayHours.endTime);

    for (let minutes = start; minutes + duration <= end; minutes += 30) {
      if (date === today && minutes < nowMinutes + 60) {
        continue;
      }

      const time = minutesToTime(minutes);
      const busy = appointments.some(
        (appointment) =>
          appointment.date === date &&
          appointment.kind !== "Pause" &&
          appointment.status !== "Annulation" &&
          rangesOverlap(
            minutes,
            minutes + duration,
            timeToMinutes(appointment.start),
            timeToMinutes(appointment.start) + (appointment.duration || 60),
          ),
      );

      if (busy) {
        continue;
      }

      slots.push({
        date,
        time,
        label: formatSlotLabel(date, time),
      });

      if (slots.length >= count) {
        break;
      }
    }
  }

  return slots;
}

export function applyLeadReply(
  conversation: SeyaConversation,
  reply: string,
  settings: SeyaAgentSettings,
  slots: SeyaProposedSlot[],
): { conversation: SeyaConversation; shouldBook: SeyaProposedSlot | null } {
  const text = reply.trim();
  const qualification = mergeQualification(conversation.qualification, text);
  const chosenSlot =
    matchProposedSlot(text, conversation.proposedSlots) ??
    matchProposedSlot(text, slots);

  if (chosenSlot && settings.bookAppointment) {
    return {
      conversation: {
        ...conversation,
        qualification,
        proposedSlots: conversation.proposedSlots,
        bookedSlot: chosenSlot,
        status: "RDV pris" as const,
        messages: [
          ...conversation.messages,
          createSeyaMessage("lead", text),
          createSeyaMessage(
            "seya",
            `Parfait, je bloque ${chosenSlot.label} pour ${qualification.need || conversation.treatment || "votre soin"}. Vous recevrez la confirmation du centre.`,
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: chosenSlot,
    };
  }

  const readyToPropose =
    settings.bookAppointment &&
    Boolean(qualification.need || conversation.treatment) &&
    (qualification.delay ||
      qualification.availability ||
      /rdv|créneau|creneau|dispo|semaine|lundi|mardi|mercredi|jeudi|vendredi|samedi|demain|aujourd/i.test(
        text,
      ) ||
      conversation.status === "Qualifié");

  if (readyToPropose && slots.length > 0) {
    const list = slots.map((slot, index) => `${index + 1}) ${slot.label}`).join("\n");
    return {
      conversation: {
        ...conversation,
        qualification,
        proposedSlots: slots,
        status: "RDV proposé" as const,
        messages: [
          ...conversation.messages,
          createSeyaMessage("lead", text),
          createSeyaMessage(
            "seya",
            `Merci. Pour ${qualification.need || conversation.treatment || "votre soin"}, voici les prochains créneaux libres :\n${list}\nRépondez 1, 2 ou 3, ou dites-moi un autre jour.`,
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  const nextQuestion = nextQualificationQuestion(qualification, settings, conversation.treatment);
  return {
    conversation: {
      ...conversation,
      qualification,
      status: (qualification.need ? "Qualifié" : "En cours") as SeyaConversationStatus,
      messages: [
        ...conversation.messages,
        createSeyaMessage("lead", text),
        createSeyaMessage("seya", nextQuestion),
      ],
      updatedAt: new Date().toISOString(),
    },
    shouldBook: null,
  };
}

function nextQualificationQuestion(
  qualification: SeyaQualification,
  settings: SeyaAgentSettings,
  fallbackTreatment?: string,
) {
  const treatmentBrief = resolveTreatmentBrief(
    settings,
    qualification.need || fallbackTreatment,
  );

  if (settings.qualifyOnSignup && !qualification.need) {
    return "Merci. Quel soin souhaitez-vous (laser, hydrafacial, minceur, bilan…) ?";
  }

  if (treatmentBrief && !qualification.zone && !qualification.availability) {
    return treatmentBrief;
  }

  if (settings.qualifyOnSignup && !qualification.zone && isBodyTreatment(qualification.need)) {
    return `Pour ${qualification.need}, quelle zone voulez-vous traiter ?`;
  }

  if (settings.bookAppointment && !qualification.availability && !qualification.delay) {
    return "Très bien. Quels jours ou créneaux vous iraient le mieux cette semaine ?";
  }

  if (settings.bookAppointment) {
    return "Parfait, je regarde le planning du centre et je vous propose des créneaux réels.";
  }

  return "Merci, je transmets ces informations à l’équipe du centre.";
}

function mergeQualification(current: SeyaQualification, text: string) {
  const next = { ...current };
  const need = extractNeed(text);
  const zone = extractZone(text);
  const delay = extractDelay(text);
  const availability = extractAvailability(text);

  if (need) next.need = need;
  if (zone) next.zone = zone;
  if (delay) next.delay = delay;
  if (availability) next.availability = availability;

  return next;
}

function extractNeed(text: string) {
  const value = text.toLowerCase();
  const matches = [
    ["hydrafacial", "Hydrafacial"],
    ["laser", "Épilation laser"],
    ["épilation", "Épilation laser"],
    ["epilation", "Épilation laser"],
    ["minceur", "Soin minceur"],
    ["cryo", "Cryolipolyse"],
    ["cryolipolyse", "Cryolipolyse"],
    ["visage", "Soin visage"],
    ["bilan", "Bilan"],
    ["massage", "Massage"],
    ["ongle", "Beauté des ongles"],
    ["regard", "Beauté du regard"],
  ] as const;

  for (const [needle, label] of matches) {
    if (value.includes(needle)) {
      return label;
    }
  }

  return "";
}

function extractZone(text: string) {
  const value = text.toLowerCase();
  const zones = [
    "jambes",
    "maillot",
    "aisselles",
    "bras",
    "visage",
    "ventre",
    "dos",
    "cuisses",
    "menton",
    "lèvre",
    "levre",
  ];
  const found = zones.filter((zone) => value.includes(zone));
  return found.join(", ");
}

function extractDelay(text: string) {
  const value = text.toLowerCase();
  if (/urgent|asap|tout de suite|cette semaine/.test(value)) return "cette semaine";
  if (/semaine prochaine|prochaine semaine/.test(value)) return "semaine prochaine";
  if (/ce mois|dans le mois/.test(value)) return "ce mois";
  return "";
}

function extractAvailability(text: string) {
  const value = text.toLowerCase();
  const days = weekdayNames.filter((day) => value.includes(day));
  const time = value.match(/\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b/);
  const parts = [
    ...days,
    time
      ? `${time[1]}h${time[2] ?? ""}`.replace(/h$/, "h")
      : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function isBodyTreatment(need: string) {
  return /laser|minceur|cryo|épilation|epilation/i.test(need);
}

function matchProposedSlot(text: string, slots: SeyaProposedSlot[]) {
  const value = text.toLowerCase().trim();

  if (!value || slots.length === 0) {
    return null;
  }

  const indexMatch = value.match(/\b([123])\b/);
  if (indexMatch) {
    return slots[Number(indexMatch[1]) - 1] ?? null;
  }

  if (/^(oui|ok|d['’]?accord|le premier|premier)$/i.test(value)) {
    return slots[0];
  }

  return (
    slots.find((slot) => {
      const label = slot.label.toLowerCase();
      return (
        value.includes(slot.time.replace(":", "h")) ||
        value.includes(slot.time) ||
        value.includes(label) ||
        (value.includes(weekdayNames[new Date(`${slot.date}T12:00:00`).getDay()]) &&
          value.includes(slot.time.slice(0, 2)))
      );
    }) ?? null
  );
}

export function whatsappHref(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const intl =
    digits.startsWith("0") && digits.length === 10
      ? `33${digits.slice(1)}`
      : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

export function lastSeyaMessage(conversation: SeyaConversation) {
  return [...conversation.messages]
    .reverse()
    .find((message) => message.author === "seya");
}

function formatSlotLabel(date: string, time: string) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const [, month, day] = date.split("-");
  return `${weekdayShort[weekday]} ${day}/${month} à ${time.replace(":", "h")}`;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}
