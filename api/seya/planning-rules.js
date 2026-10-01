const WEEKDAYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

function isPlanningProspectTone(text) {
  return /c['’]est seya|lequel vous irait|quelle zone|debut ou fin de semaine|je vous laisse revenir|écrivez-moi quand|vous recevrez la confirmation|bonjour \{?prenom/i.test(
    String(text || ""),
  );
}

function formatPlanningHours(hours) {
  return (hours || [])
    .filter((day) => !day.closed)
    .map(
      (day) =>
        `${day.label || WEEKDAYS[day.weekday] || ""} ${String(day.startTime || "").slice(0, 5)}-${String(day.endTime || "").slice(0, 5)}`.trim(),
    )
    .filter(Boolean)
    .join(", ");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .trim();
}

function planningMessage(author, text) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    text: String(text || "").trim(),
    at: new Date().toISOString(),
  };
}

function findTreatment(settings, hint) {
  const needle = normalize(hint);
  if (!needle) {
    return undefined;
  }
  const briefs = settings?.treatmentBriefs || [];
  return (
    briefs.find((item) => normalize(item.name) === needle) ||
    briefs.find((item) => {
      const name = normalize(item.name);
      return Boolean(name) && (needle.includes(name) || name.includes(needle));
    })
  );
}

function matchPlanningSlot(text, slots) {
  const value = normalize(text);
  if (!value || !slots?.length) {
    return null;
  }
  const exact = slots.find(
    (slot) => normalize(slot.label) && value.includes(normalize(slot.label)),
  );
  if (exact) {
    return exact;
  }
  const clock = value.match(/\b(\d{1,2})\s*h(?:\s*(\d{2}))?\b/);
  if (!clock) {
    return slots.length === 1 && /oui|ok|daccord|pose|bloque|valide/.test(value)
      ? slots[0]
      : null;
  }
  const time = `${String(Number(clock[1])).padStart(2, "0")}:${clock[2] || "00"}`;
  return slots.find((slot) => slot.time === time) || null;
}

function extractClientName(text) {
  const match = String(text || "").match(
    /\b(?:pour|de)\s+([A-ZÉÈÊÀÂÎÔÛÄËÏÖÜÇ][\p{L}'’-]+(?:\s+[A-ZÉÈÊÀÂÎÔÛÄËÏÖÜÇ][\p{L}'’-]+)?)/u,
  );
  return match?.[1]?.trim() || "";
}

function extractNeed(text) {
  const value = normalize(text);
  const matches = [
    ["hydrafacial", "Hydrafacial"],
    ["laser", "Épilation laser"],
    ["epilation", "Épilation laser"],
    ["definitive", "Épilation laser"],
    ["minceur", "Soin minceur"],
    ["cryolipolyse", "Cryolipolyse"],
    ["cryo", "Cryolipolyse"],
    ["visage", "Soin visage"],
    ["bilan", "Bilan"],
    ["massage", "Massage"],
  ];
  for (const [needle, label] of matches) {
    if (value.includes(needle)) {
      return label;
    }
  }
  return "";
}

function slotList(slots) {
  const labels = (slots || []).slice(0, 3).map((slot) => slot.label).filter(Boolean);
  if (!labels.length) {
    return "Aucun créneau libre sur les horaires et le planning actuels.";
  }
  if (labels.length === 1) {
    return `Créneau libre : ${labels[0]}.`;
  }
  return `Créneaux libres : ${labels.join(" · ")}.`;
}

function applyPlanningReply(conversation, text, settings, slots, extras) {
  const command = String(text || "").trim();
  const hours = extras?.hours || [];
  const need = extractNeed(command) || conversation.treatment || "";
  const hint = `${command} ${conversation.treatment || ""} ${conversation.qualification?.need || ""}`;
  const brief =
    findTreatment(settings, need) || findTreatment(settings, hint);
  const care = need || brief?.name || conversation.treatment || "";
  const clientName = extractClientName(command);
  const chosen = matchPlanningSlot(command, [
    ...(conversation.proposedSlots || []),
    ...(slots || []),
  ]);

  let reply = "";
  let shouldBook = null;

  if (/prix|tarif|combien|coute|coûte|\bcout\b/i.test(command)) {
    const price = String(brief?.price || "").trim();
    reply = price
      ? `Selon la fiche soin : ${price}.`
      : "Pas de tarif en fiche pour ce soin. Vérifiez le brief dans Seya CRM.";
    if (brief?.brief) {
      reply += ` ${brief.brief}`;
    }
  } else if (/horaire|ouvert|on ouvre|fermeture|jusqu['’]?a quelle heure|c['’]est ouvert/i.test(command)) {
    const open = formatPlanningHours(hours);
    reply = open
      ? `Horaires du centre : ${open}.`
      : "Aucun horaire renseigné pour ce centre.";
  } else if (
    chosen &&
    /pose|bloque|valide|confirme|oui|ok|daccord/.test(normalize(command))
  ) {
    shouldBook = chosen;
    reply = clientName
      ? `Je pose ${chosen.label} pour ${clientName}${care ? ` · ${care}` : ""}.`
      : `Je pose ${chosen.label}${care ? ` · ${care}` : ""}. Donnez-moi le nom si ce n’est pas déjà sur la fiche.`;
  } else if (
    /creneau|créneau|dispo|planning|libre|rendez-vous|\brdv\b|pose|bloque/i.test(command) ||
    ((slots || []).length > 0 &&
      /jeudi|lundi|mardi|mercredi|vendredi|samedi|demain|semaine/i.test(command))
  ) {
    reply = slotList(slots);
    if (brief?.brief) {
      reply += ` Brief ${brief.name} : ${brief.brief}`;
    }
  } else if (brief?.brief) {
    reply = `Brief ${brief.name} : ${brief.brief}${brief.price ? ` Tarif fiche : ${brief.price}.` : ""}`;
  } else if (String(settings?.brief || "").trim()) {
    reply = `Consignes du centre : ${String(settings.brief).trim()}`;
  } else {
    reply =
      "Seya Planning est là pour l’équipe : créneau libre, tarif fiche, brief soin, pause ou pose de RDV. Dites le soin et le jour.";
  }

  const [firstName, ...lastParts] = clientName.split(/\s+/);
  return {
    conversation: {
      ...conversation,
      firstName: firstName || conversation.firstName,
      lastName: lastParts.join(" ") || conversation.lastName,
      treatment: care || conversation.treatment,
      proposedSlots: slots?.length ? slots : conversation.proposedSlots,
      messages: [
        ...(conversation.messages || []),
        planningMessage("centre", command),
        planningMessage("seya", reply.trim()),
      ],
      updatedAt: new Date().toISOString(),
    },
    shouldBook,
  };
}

module.exports = {
  applyPlanningReply,
  formatPlanningHours,
  isPlanningProspectTone,
};
