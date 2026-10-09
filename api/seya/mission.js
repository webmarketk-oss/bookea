const SEYA_MISSIONS = [
  "book",
  "welcome_relance",
  "welcome_relance_book",
  "qualify_callback",
];

const DEFAULT_RELANCE_DAYS = [1, 5, 14];

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function resolveSeyaMission(value) {
  if (typeof value === "string") {
    return SEYA_MISSIONS.includes(value) ? value : "qualify_callback";
  }
  const record = asRecord(value);
  const raw = String(record.seyaMission || "").trim();
  if (SEYA_MISSIONS.includes(raw)) {
    return raw;
  }
  return record.bookAppointment === true ? "book" : "qualify_callback";
}

function canBookSeya(value) {
  const mission = resolveSeyaMission(value);
  return mission === "book" || mission === "welcome_relance_book";
}

function isWelcomeRelanceOnly(value) {
  return resolveSeyaMission(value) === "welcome_relance";
}

function isQualifyCallback(value) {
  return resolveSeyaMission(value) === "qualify_callback";
}

function hasExplicitMission(value) {
  if (typeof value === "string") {
    return SEYA_MISSIONS.includes(value);
  }
  return SEYA_MISSIONS.includes(String(asRecord(value).seyaMission || "").trim());
}

function missionForcesWelcome(value) {
  if (!hasExplicitMission(value)) {
    return false;
  }
  const mission = resolveSeyaMission(value);
  return (
    mission === "welcome_relance" ||
    mission === "welcome_relance_book" ||
    mission === "qualify_callback"
  );
}

function missionForcesRelance(value) {
  if (!hasExplicitMission(value)) {
    return false;
  }
  const mission = resolveSeyaMission(value);
  return mission === "welcome_relance" || mission === "welcome_relance_book";
}

function clampRelanceDay(value, fallback) {
  const day = Math.floor(Number(value));
  if (!Number.isFinite(day) || day < 1) {
    return fallback;
  }
  return Math.min(365, day);
}

function normalizeSeyaRelances(value) {
  const record = asRecord(value);
  const incoming = Array.isArray(record.relances) ? record.relances : null;
  const legacy = Array.isArray(record.relanceDays)
    ? record.relanceDays.map(Number).filter((item) => item > 0)
    : [];
  return [0, 1, 2].map((index) => {
    const fallback = DEFAULT_RELANCE_DAYS[index];
    const row = incoming?.[index] && typeof incoming[index] === "object"
      ? incoming[index]
      : {};
    const fromLegacy = legacy[index];
    return {
      afterDays: clampRelanceDay(
        row.afterDays != null ? row.afterDays : fromLegacy,
        fallback,
      ),
      message: String(row.message || "").trim(),
    };
  });
}

function applySeyaMissionFlags(value) {
  const record = asRecord(value);
  const mission = resolveSeyaMission(record);
  const relances = normalizeSeyaRelances(record);
  const book = canBookSeya(mission);
  const welcomeOnly = mission === "welcome_relance";
  return {
    seyaMission: mission,
    qualifyOnSignup: !welcomeOnly,
    askForAppointment: !welcomeOnly,
    bookAppointment: book,
    autoMessageOnNewLead: missionForcesWelcome(mission)
      ? true
      : record.autoMessageOnNewLead !== false,
    relanceEnabled: missionForcesRelance(mission)
      ? true
      : record.relanceEnabled !== false,
    relances,
    relanceDays: relances.map((item) => item.afterDays),
  };
}

function formatCallbackWhen(date, time) {
  const iso = String(date || "").slice(0, 10);
  const parsed = new Date(`${iso}T12:00:00`);
  const weekdays = [
    "dimanche",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
  ];
  const clock = String(time || "")
    .slice(0, 5)
    .replace(":", "h");
  if (Number.isNaN(parsed.getTime())) {
    return clock ? `${iso || "ce jour"} à ${clock}` : iso || "ce jour";
  }
  const day = weekdays[parsed.getDay()];
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${day} ${dd}/${mm} à ${clock}`;
}

function operatorCallbackReply(slot) {
  const when = formatCallbackWhen(slot?.date, slot?.time);
  return `Parfait, c’est noté. Une opératrice vous rappellera ${when}.`;
}

function welcomeRelanceHandoffReply() {
  return "Je transmets votre demande à l’équipe. Une conseillère reprendra avec vous.";
}

function fillRelanceTemplate(template, vars) {
  return String(template || "")
    .replace(/\{prenom\}/gi, vars.prenom || "")
    .replace(/\{firstName\}/gi, vars.prenom || "")
    .replace(/\{centre\}/gi, vars.centre || "")
    .replace(/\{center\}/gi, vars.centre || "")
    .replace(/\{offre\}/gi, vars.offre || "")
    .replace(/\{offer\}/gi, vars.offre || "")
    .replace(/Bonjour\s+,/g, "Bonjour,")
    .replace(/  +/g, " ")
    .trim();
}

function seyaMissionPrompt(value) {
  const mission = resolveSeyaMission(value);
  if (mission === "welcome_relance") {
    return [
      "Mission de CE centre : message d’accueil puis relances seulement.",
      "Interdit de proposer un créneau, de poser un rendez-vous, de demander un jour pour venir, de qualifier vers un RDV.",
      "Si elle veut un rendez-vous, tu transmets à l’équipe. Tu ne dis jamais qu’une opératrice rappellera à une heure précise.",
    ].join(" ");
  }
  if (mission === "qualify_callback") {
    return [
      "Mission de CE centre : accueil + qualification, puis rappel opératrice.",
      "Tu mènes comme une prise de rendez-vous (soin, zone, jour, heure).",
      "Quand elle a donné un jour ET une heure, tu ne poses PAS le rendez-vous dans l’agenda.",
      "Tu dis uniquement qu’une opératrice la rappellera à CETTE date et CETTE heure.",
      "Interdit de bloquer un créneau, d’inventer un horaire, ou de proposer des disponibilités agenda.",
    ].join(" ");
  }
  if (mission === "welcome_relance_book") {
    return "Mission de CE centre : accueil, relances, et prise de rendez-vous. Tu peux proposer et confirmer un créneau autorisé.";
  }
  return "Mission de CE centre : prise de rendez-vous. Tu peux proposer et confirmer un créneau autorisé.";
}

module.exports = {
  DEFAULT_RELANCE_DAYS,
  SEYA_MISSIONS,
  applySeyaMissionFlags,
  canBookSeya,
  fillRelanceTemplate,
  formatCallbackWhen,
  isQualifyCallback,
  isWelcomeRelanceOnly,
  missionForcesRelance,
  missionForcesWelcome,
  normalizeSeyaRelances,
  operatorCallbackReply,
  resolveSeyaMission,
  seyaMissionPrompt,
  welcomeRelanceHandoffReply,
};
