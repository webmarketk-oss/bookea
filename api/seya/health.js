const HEALTH_NAMES = [
  { keys: ["cryo", "cryolipolyse"], name: "Cryolipolyse", label: "la cryo" },
  { keys: ["hydrafacial"], name: "Hydrafacial", label: "l’Hydrafacial" },
  {
    keys: ["epilation", "laser", "definitive"],
    name: "Épilation définitive",
    label: "l’épilation",
  },
  { keys: ["visage"], name: "Soin visage", label: "le soin visage" },
  {
    keys: ["minceur", "ventre", "poids", "cellulite", "graisse", "bilan"],
    name: "Soin minceur",
    label: "le soin minceur",
  },
];

function emptyHealthReview() {
  return {
    status: "none",
    kind: null,
    note: "",
    transferTo: "",
    treatmentName: "",
    createdAt: null,
    reviewedAt: null,
    reviewedBy: null,
  };
}

function emptyHealthSheet() {
  return {
    validated: false,
    contraindications: "",
    precautions: "",
    professionalQuestions: "",
    transferTo: "",
  };
}

function normalizeHealthSheet(value) {
  const current = value && typeof value === "object" ? value : {};
  return {
    validated: current.validated === true,
    contraindications: String(current.contraindications || "").trim(),
    precautions: String(current.precautions || "").trim(),
    professionalQuestions: String(current.professionalQuestions || "").trim(),
    transferTo: String(current.transferTo || "").trim(),
  };
}

function classifyHealthMessage(text) {
  const value = normalize(text);
  const general = isGeneralHealthQuestion(value);
  const personal = isPersonalHealthSituation(value);
  return {
    general,
    personal,
    mixed: personal && asksPrice(text),
  };
}

function isGeneralHealthQuestion(value) {
  if (isPersonalHealthSituation(value)) {
    return false;
  }
  return /contre[- ]?indication|precaution|qui (ne )?(peut|peuvent) pas|est-ce (dangereux|risque)|y a t il des (risque|contre)|effets secondaires|c[' ]est pour tout le monde|des contre/.test(
    value,
  );
}

function isPersonalHealthSituation(value) {
  const ownSituation =
    /\bje (prends|suis|ai|fais)\b|\bj[' ]ai\b|\bmon (traitement|probleme|medecin|pacemaker)\b|\bavec mon\b|\bprobleme de sante\b|\bmes (traitements|medicaments)\b/.test(
      value,
    );
  const namedCondition =
    /pacemaker|stimulateur|enceinte|grossesse|cancer|chimio|roaccutane|accutane|implant|cardiaque|\bcoeur\b|maladie|traitement|medicament|diabete|insuline|thyroide|tension/.test(
      value,
    );
  const asksIfPossible =
    /je (peux|puis)|c[' ]est possible|est-ce possible|puis-je|je peux faire|pose (pas )?de probleme|pas de probleme/.test(
      value,
    );
  if (ownSituation && namedCondition) {
    return true;
  }
  if (ownSituation && (asksIfPossible || /cryo|seance|soin|bilan/.test(value))) {
    return true;
  }
  if (ownSituation && /sante|traitement|enceinte|grossesse/.test(value)) {
    return true;
  }
  if (namedCondition && asksIfPossible) {
    return true;
  }
  return false;
}

function asksPrice(text) {
  const raw = String(text || "");
  if (/combien de (temps|seance|seances|rdv|fois|jours)/i.test(raw)) {
    return false;
  }
  return /prix|tarif|co[uû]te|\bcout\b|donne le prix|c['’ ]?est combien|combien (coute|le bilan)/i.test(
    raw,
  );
}

function inferHealthTreatment(conversation, text) {
  const hay = normalize(
    `${text || ""} ${conversation?.qualification?.need || ""} ${conversation?.treatment || ""} ${conversation?.bookingState?.serviceIntent || ""}`,
  );
  const match = HEALTH_NAMES.find((item) =>
    item.keys.some((key) => hay.includes(key)),
  );
  return match || { name: "", label: "ce soin" };
}

function resolveHealthSheet(seya, conversation, text) {
  const inferred = inferHealthTreatment(conversation, text);
  const briefs = Array.isArray(seya?.treatmentBriefs)
    ? seya.treatmentBriefs
    : [];
  if (!inferred.name) {
    return { name: "", label: "ce soin", sheet: null, brief: null };
  }
  const brief = briefs.find(
    (item) => normalize(item?.name) === normalize(inferred.name),
  );
  const sheet = normalizeHealthSheet(brief?.health);
  const usable = Boolean(
    brief &&
      sheet.validated &&
      (sheet.contraindications || sheet.precautions || sheet.professionalQuestions),
  );
  return {
    name: inferred.name,
    label: inferred.label,
    brief: brief || null,
    sheet: usable ? sheet : null,
  };
}

function generalHealthReply(resolved) {
  const sheet = resolved.sheet;
  if (!sheet) {
    return "Je n’ai pas de liste validée par le centre pour cette prestation. Je peux demander à l’équipe de vous confirmer ça.";
  }
  const parts = [];
  if (sheet.contraindications) {
    parts.push(sheet.contraindications);
  }
  if (sheet.precautions) {
    parts.push(`Avant la séance : ${sheet.precautions}`);
  }
  return `${parts.join(" ")} Si votre cas est particulier, une personne du centre doit vérifier avant une séance.`;
}

function personalHealthReply(resolved) {
  const team =
    resolved.sheet?.transferTo || "la personne qui réalise le soin";
  const label = resolved.label || "ce soin";
  return `Merci de me l’avoir précisé. Pour vous répondre correctement, il faut que ${team} vérifie votre situation avant de confirmer si ${label} vous convient. Je peux lui transmettre votre question et vous faire rappeler.`;
}

function awaitingHealthReply() {
  return "L’équipe doit encore vérifier votre situation avant de confirmer une séance. En attendant je peux vous répondre sur le prix, l’adresse ou un horaire, sans réserver.";
}

function buildHealthTask(conversation, text, resolved, kind) {
  const transferTo = resolved.sheet?.transferTo || "l’équipe soignante du centre";
  const date = conversation?.bookingState?.requestedDate || "";
  const context = [
    `Centre : ${conversation?.centerId || "centre courant"}`,
    `Prestation : ${resolved.name || conversation?.treatment || "à préciser"}`,
    conversation?.firstName
      ? `Cliente : ${conversation.firstName} ${conversation.lastName || ""}`.trim()
      : "",
    date ? `Date demandée : ${date}` : "",
    `Message : ${String(text || "").trim()}`,
    `Transférer à : ${transferTo}`,
    "Ne pas redemander de détails médicaux sur WhatsApp.",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    id: `health-${Date.now()}`,
    title: "Vérification santé avant séance",
    context,
    transferTo,
    status: "open",
    createdAt: new Date().toISOString(),
    kind,
  };
}

function startHealthReview(conversation, text, resolved, kind) {
  const task = buildHealthTask(conversation, text, resolved, kind);
  return {
    healthReview: {
      status: "awaiting_human_health_review",
      kind,
      note: String(text || "").trim(),
      transferTo: task.transferTo,
      treatmentName: resolved.name || conversation?.treatment || "",
      createdAt: task.createdAt,
      reviewedAt: null,
      reviewedBy: null,
    },
    healthTask: task,
  };
}

function markHealthReviewed(conversation, reviewedBy) {
  const current = conversation.healthReview || emptyHealthReview();
  return {
    ...conversation,
    status: conversation.qualification?.need ? "Qualifié" : "En cours",
    healthReview: {
      ...current,
      status: "reviewed",
      reviewedAt: new Date().toISOString(),
      reviewedBy: String(reviewedBy || "équipe du centre").trim(),
    },
    healthTask: conversation.healthTask
      ? { ...conversation.healthTask, status: "done" }
      : conversation.healthTask,
    messages: [
      ...(conversation.messages || []),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author: "centre",
        text: "Vérification santé faite. Seya peut reprendre la conversation.",
        at: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

function isAwaitingHealthReview(conversation) {
  return (
    conversation?.healthReview?.status === "awaiting_human_health_review" ||
    conversation?.status === "Revue santé"
  );
}

function stripBookingCta(text) {
  return String(text || "")
    .replace(/\s*(Quand seriez-vous disponible \??|Quel jour vous irait \??)\s*$/i, "")
    .trim();
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

module.exports = {
  awaitingHealthReply,
  classifyHealthMessage,
  emptyHealthReview,
  emptyHealthSheet,
  generalHealthReply,
  inferHealthTreatment,
  isAwaitingHealthReview,
  markHealthReviewed,
  normalizeHealthSheet,
  personalHealthReply,
  resolveHealthSheet,
  startHealthReview,
  stripBookingCta,
};
