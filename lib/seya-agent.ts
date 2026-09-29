import { naturalOfferPhrase } from "@/api/seya/care-family";
import { addDaysIso, todayIso } from "@/lib/crm-stats";
import type { CenterDayHours } from "@/lib/center-hours";
import { sanitizePersonName } from "@/lib/seya-person-name";
import {
  asksSeyaPrice,
  isJunkTreatmentName,
  isSeyaOptOut,
  inferFamilyFromSettings,
  resolveOfferLabel,
  resolveSeyaOpening,
  resolveTreatmentBrief,
  resolveTreatmentPrice,
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
  lead: Pick<Lead, "firstName" | "treatment" | "campaign">,
  centerName: string,
  settings: SeyaAgentSettings,
) {
  return resolveSeyaOpening(settings, {
    firstName: lead.firstName,
    centerName,
    campaign: lead.campaign,
    treatment: lead.treatment,
  });
}

export function startSeyaConversation({
  lead,
  centerName,
  settings,
  centerId,
}: {
  lead: Lead;
  centerName: string;
  settings: SeyaAgentSettings;
  centerId?: string;
}): SeyaConversation {
  const opening = buildOpeningMessage(lead, centerName, settings);
  const rawTreatment = lead.treatment.trim();
  const family = inferFamilyFromSettings(settings, lead.campaign, rawTreatment);
  const treatment =
    rawTreatment && !/soin à préciser|lead meta|à préciser/i.test(rawTreatment)
      ? rawTreatment
      : family === "minceur"
        ? "Soin minceur"
        : family === "visage"
          ? "Soin visage"
          : family === "epilation"
            ? "Épilation définitive"
            : "";
  const offer = naturalOfferPhrase(
    family,
    resolveOfferLabel(settings, lead.campaign, rawTreatment) ||
      lead.campaign ||
      rawTreatment,
  );

  const person = sanitizePersonName(lead.firstName, lead.lastName);
  return {
    id: lead.id,
    leadId: lead.id,
    firstName: person.firstName,
    lastName: person.lastName,
    phone: lead.phone,
    treatment,
    campaign: lead.campaign,
    offerLabel: offer,
    centerId,
    status: "À envoyer",
    qualification: {
      ...emptyQualification(),
      need: treatment,
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

  const wantsHuman =
    settings.handoffToHuman &&
    /conseill|parler (a|à) (un |une )?(humain|quelqu|personne)/i.test(text) &&
    !/rendez-vous|\brdv\b|creneau|dispo/i.test(text);
  const refuses = isSeyaOptOut(text);
  const asksRdv = /rendez-vous|\brdv\b|prendre rendez|un creneau/i.test(text);

  if (refuses) {
    return {
      conversation: {
        ...conversation,
        qualification,
        status: "Pas intéressé",
        messages: [
          ...conversation.messages,
          createSeyaMessage("lead", text),
          createSeyaMessage(
            "seya",
            "Très bien, j’arrête ici. Si vous changez d’avis, écrivez-nous.",
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (hasMedicalFlag(text) || threadHasMedical(conversation, text)) {
    const personal = /je (prends|suis|ai)|j['’]ai|avec mon|probleme de sante/i.test(
      text,
    );
    return {
      conversation: {
        ...conversation,
        qualification,
        status: (personal ? "Revue santé" : conversation.status) as SeyaConversationStatus,
        healthReview: personal
          ? {
              status: "awaiting_human_health_review",
              kind: "personal",
              note: text,
              transferTo: "l’équipe soignante du centre",
              treatmentName: qualification.need || conversation.treatment || "",
              createdAt: new Date().toISOString(),
              reviewedAt: null,
              reviewedBy: null,
            }
          : conversation.healthReview,
        messages: [
          ...conversation.messages,
          createSeyaMessage("lead", text),
          createSeyaMessage(
            "seya",
            personal
              ? "Merci de me l’avoir précisé. Pour vous répondre correctement, il faut que la personne qui réalise le soin vérifie votre situation avant de confirmer si ce soin vous convient. Je peux lui transmettre votre question et vous faire rappeler."
              : "Je n’ai pas de liste validée par le centre pour cette prestation. Je peux demander à l’équipe de vous confirmer ça.",
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (asksSeyaPrice(text)) {
    return {
      conversation: {
        ...conversation,
        qualification,
        status: (qualification.need ? "Qualifié" : "En cours") as SeyaConversationStatus,
        messages: [
          ...conversation.messages,
          createSeyaMessage("lead", text),
          createSeyaMessage("seya", priceReply(settings, qualification, conversation)),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (wantsHuman) {
    return {
      conversation: {
        ...conversation,
        qualification,
        status: "À recontacter",
        messages: [
          ...conversation.messages,
          createSeyaMessage("lead", text),
          createSeyaMessage(
            "seya",
            "Bien sûr, je transmets à une conseillère du centre. Elle reprendra avec vous.",
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (asksRdv && !settings.bookAppointment) {
    return {
      conversation: {
        ...conversation,
        qualification,
        status: (qualification.need ? "Qualifié" : "En cours") as SeyaConversationStatus,
        messages: [
          ...conversation.messages,
          createSeyaMessage("lead", text),
          createSeyaMessage(
            "seya",
            "Parfait. Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?",
          ),
        ],
        updatedAt: new Date().toISOString(),
      },
      shouldBook: null,
    };
  }

  if (chosenSlot && settings.bookAppointment && !threadHasMedical(conversation, text)) {
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
    !asksSeyaPrice(text) &&
    !threadHasMedical(conversation, text) &&
    Boolean(qualification.need || conversation.treatment) &&
    !isJunkTreatmentName(qualification.need || conversation.treatment) &&
    (qualification.delay ||
      qualification.availability ||
      /rdv|créneau|creneau|dispo|semaine|lundi|mardi|mercredi|jeudi|vendredi|samedi|demain|aujourd/i.test(
        text,
      ));

  if (readyToPropose && slots.length > 0) {
    return {
      conversation: {
        ...conversation,
        qualification,
        proposedSlots: slots,
        status: "RDV proposé" as const,
        messages: [
          ...conversation.messages,
          createSeyaMessage("lead", text),
          createSeyaMessage("seya", humanSlotReply(slots)),
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

  if (settings.qualifyOnSignup && (!qualification.need || isJunkTreatmentName(qualification.need))) {
    return "C’est pour un soin minceur, un soin visage ou une épilation ?";
  }

  if (treatmentBrief && !qualification.zone && !qualification.availability) {
    return /pacemaker|prix|tarif|créneau|receptionniste|réceptionniste/i.test(treatmentBrief)
      ? "C’est plutôt quelle zone ?"
      : treatmentBrief;
  }

  if (settings.qualifyOnSignup && !qualification.zone && isBodyTreatment(qualification.need)) {
    return "C’est plutôt quelle zone ?";
  }

  if (settings.bookAppointment && !qualification.availability && !qualification.delay) {
    return "Vous êtes plutôt dispo en début ou fin de semaine ?";
  }

  if (settings.bookAppointment) {
    return "Je regarde le planning et je vous propose ce qui est vraiment libre.";
  }

  if (settings.askForAppointment) {
    return "Vous voulez que je fasse passer ça à une conseillère pour caler un créneau ?";
  }

  return "Je transmets ça à l’équipe du centre.";
}

function hasMedicalFlag(text: string) {
  return /pacemaker|stimulateur|enceinte|grossesse|cancer|chimio|roaccutane|accutane|implant|photo.?sensib|cardiaque|coeur/i.test(
    text,
  );
}

function threadHasMedical(conversation: SeyaConversation, text: string) {
  return (
    hasMedicalFlag(text) ||
    conversation.messages.some((item) => hasMedicalFlag(item.text))
  );
}

function humanSlotReply(slots: SeyaProposedSlot[]) {
  const labels = slots.slice(0, 3).map((slot) => slot.label);
  const options =
    labels.length <= 1
      ? labels[0] || ""
      : labels.length === 2
        ? `${labels[0]} ou ${labels[1]}`
        : `${labels[0]}, ${labels[1]} ou ${labels[2]}`;
  return `Je peux vous proposer ${options} — lequel vous irait le mieux ?`;
}

function displayCareLabel(
  qualification: SeyaQualification,
  conversation: SeyaConversation,
) {
  const zone = qualification.zone.trim();
  const need = qualification.need.trim();
  if (need && !isJunkTreatmentName(need) && zone) {
    return `${need} (${zone})`;
  }
  if (zone) {
    return zone;
  }
  if (need && !isJunkTreatmentName(need)) {
    return need;
  }
  return "votre soin";
}

function priceReply(
  settings: SeyaAgentSettings,
  qualification: SeyaQualification,
  conversation: SeyaConversation,
  text = "",
) {
  const needle = `${text} ${conversation.bookingState?.lastLeadPriceText || ""}`.toLowerCase();
  if (/continuer|ensuite|les séances|seances suivantes/i.test(needle)) {
    const session = settings.treatmentBriefs.find((item) =>
      /minceur|cryo/i.test(`${item.name} ${qualification.need} ${conversation.treatment}`),
    )?.pricing;
    if (session?.session) {
      return `Les séances suivantes sont ${session.session}. Le protocole exact se précise après l’analyse corporelle.`;
    }
    return "Je comprends, vous souhaitez connaître le prix des séances si vous poursuivez après la découverte. Je n’ai pas de tarif fixe à vous annoncer : il dépend du protocole proposé après l’analyse corporelle. Je peux demander au centre s’il peut déjà vous donner une fourchette.";
  }
  if (/cure|forfait/i.test(needle)) {
    const pack = settings.treatmentBriefs.find((item) => item.pricing?.package)?.pricing?.package;
    if (pack) {
      return `Nos cures commencent ${pack}. Le devis précis se fait après le bilan.`;
    }
  }
  const offer = resolveOfferLabel(
    settings,
    conversation.campaign,
    conversation.treatment,
  );
  const euro = offer.match(/(\d+)\s*€/);
  if (euro) {
    return `Cette offre est à ${euro[1]}€.`;
  }
  const price = resolveTreatmentPrice(
    settings,
    `${qualification.need} ${qualification.zone} ${conversation.treatment}`,
  );
  if (price && /offerts|offert|gratuit/i.test(price) && settings.offerMaps.some((item) => /\d+\s*€/.test(item.label))) {
    return "Je n’ai pas ce tarif en fiche pour ce centre. Je peux demander à l’équipe.";
  }
  if (price) {
    return price;
  }
  return "Je n’ai pas ce tarif en fiche pour ce centre. Je peux demander à l’équipe.";
}

function mergeQualification(current: SeyaQualification, text: string) {
  const next = {
    ...current,
    need: isJunkTreatmentName(current.need) ? "" : current.need,
  };
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
    ["définitive", "Épilation laser"],
    ["definitive", "Épilation laser"],
    ["minceur", "Soin minceur"],
    ["cryo", "Cryolipolyse"],
    ["cryolipolyse", "Cryolipolyse"],
    ["ventre", "Soin minceur"],
    ["poids", "Soin minceur"],
    ["graisse", "Soin minceur"],
    ["cellulite", "Soin minceur"],
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

  if (/1er|octobre|novembre|décembre|janvier|février|mars|avril|juin|juillet|août|septembre|mai\b/i.test(value)) {
    return null;
  }

  if (/^([123])$/.test(value)) {
    return slots[Number(value) - 1] ?? null;
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
