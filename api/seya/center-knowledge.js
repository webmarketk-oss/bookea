// La fiche du centre est une base de connaissances : Seya y choisit les informations utiles
// à la question posée et les reformule, sans réciter la fiche ni mélanger les soins.

const { BULLET, briefFacts, isHeaderLine, isInstruction } = require("./brief-facts");
const { prospectText } = require("./vocabulary");

/** Lignes d’information de la fiche (sigles comme « EMS : … » conservés), sans titres ni consignes. */
function knowledgeLines(sources) {
  const lines = [];
  for (const source of [].concat(sources).filter(Boolean)) {
    for (const raw of String(source).split(/\r?\n/)) {
      const line = raw.replace(BULLET, "").trim();
      if (!line || isHeaderLine(line)) {
        continue;
      }
      for (const sentence of line.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ö])/)) {
        if (sentence.trim() && !isInstruction(sentence) && !lines.includes(sentence.trim())) {
          lines.push(sentence.trim());
        }
      }
    }
  }
  return lines;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

// `role` sert seulement quand la fiche cite l’appareil sans dire à quoi il sert.
const TECHNOLOGIES = [
  {
    key: "cryo",
    family: "minceur",
    pattern: /cryo[\s-]*lipolyse|\bcryo\b/,
    name: "la cryo",
    role: "qui utilise le froid pour cibler les graisses localisées",
    zones: /ventre|poignee|hanche|cuisse|bras|dos|menton|culotte|graisse|gras/,
  },
  {
    key: "radiofrequence",
    family: "minceur",
    pattern: /radio ?frequence/,
    name: "la radiofréquence",
    role: "qui agit par la chaleur pour raffermir la peau",
    zones: /fermete|relachement|ferme|cellulite|peau|ventre|cuisse|bras|fesse/,
  },
  {
    key: "pressotherapie",
    family: "minceur",
    pattern: /presso ?therapie/,
    name: "la pressothérapie",
    role: "un drainage par pression, pour les jambes lourdes et la rétention d’eau",
    zones: /jambe|retention|drain|cuisse|cheville|lourd/,
  },
  {
    key: "palper",
    family: "minceur",
    pattern: /cellu ?m ?6|\blpg\b|endermologie|palper[- ]rouler/,
    name: "le palper-rouler mécanique",
    role: "qui travaille la cellulite",
    zones: /cellulite|peau d'orange|cuisse|fesse|jambe|capitons/,
  },
  {
    key: "ems",
    family: "minceur",
    pattern: /\bems\b|emsculpt|electro ?stimulation/,
    name: "l’électrostimulation",
    role: "qui fait travailler les muscles",
    zones: /muscle|tonif|ventre|abdo|fesse|fessier/,
  },
  {
    key: "cavitation",
    family: "minceur",
    pattern: /cavitation|ultra ?sons?/,
    name: "la cavitation",
    role: "qui agit par ultrasons sur les amas graisseux",
    zones: /ventre|cuisse|hanche|graisse|gras|poignee|bras/,
  },
  {
    key: "lipolaser",
    family: "minceur",
    pattern: /lipo ?laser/,
    name: "le lipolaser",
    role: "un laser froid qui agit sur les amas graisseux",
    zones: /ventre|cuisse|hanche|graisse|gras|poignee|bras/,
  },
  {
    key: "laser-diode",
    family: "epilation",
    pattern: /laser (a )?diode|diode laser/,
    name: "le laser diode",
    role: "qui cible le poil jusqu’à la racine",
    zones: /poil|aisselle|maillot|jambe|visage|levre|menton|dos|bras|torse/,
  },
  {
    key: "laser-alexandrite",
    family: "epilation",
    pattern: /alexandrite/,
    name: "le laser alexandrite",
    role: "qui cible le poil jusqu’à la racine",
    zones: /poil|aisselle|maillot|jambe|visage|levre|menton|dos|bras|torse/,
  },
  {
    key: "laser-yag",
    family: "epilation",
    pattern: /nd ?:? ?yag/,
    name: "le laser Nd:YAG",
    role: "adapté aux peaux mates et foncées",
    zones: /poil|aisselle|maillot|jambe|visage|dos|bras|torse|peau mate|peau foncee/,
  },
  {
    key: "hydrafacial",
    family: "visage",
    pattern: /hydra ?facial/,
    name: "l’HydraFacial",
    role: "qui nettoie, exfolie et hydrate la peau en profondeur",
    zones: /peau|pore|eclat|hydrat|terne|imperfection|visage|acne|point/,
  },
  {
    key: "microneedling",
    family: "visage",
    pattern: /micro ?needling|dermapen/,
    name: "le microneedling",
    role: "qui stimule le renouvellement de la peau",
    zones: /cicatrice|ride|texture|pore|eclat|fermete|visage|tache/,
  },
  {
    key: "led",
    family: "visage",
    pattern: /\bled\b|luminotherapie/,
    name: "la LED",
    role: "une lumière qui apaise et stimule la peau",
    zones: /peau|acne|eclat|rougeur|ride|visage/,
  },
  {
    key: "peeling",
    family: "visage",
    pattern: /peeling/,
    name: "le peeling",
    role: "qui renouvelle la surface de la peau",
    zones: /tache|eclat|texture|teint|ride|acne|visage/,
  },
];

const ZONE_WORDS = [
  [/\bventre\b|abdo/, "le ventre"],
  [/poignees? d'?\s?amour/, "les poignées d’amour"],
  [/hanches?/, "les hanches"],
  [/cuisses?/, "les cuisses"],
  [/culotte de cheval/, "la culotte de cheval"],
  [/fesses?|fessiers?/, "les fesses"],
  [/\bbras\b/, "les bras"],
  [/jambes? lourdes?/, "les jambes lourdes"],
  [/jambes?/, "les jambes"],
  [/\bdos\b/, "le dos"],
  [/menton|double menton/, "le menton"],
  [/cellulite|peau d'orange/, "la cellulite"],
  [/aisselles?/, "les aisselles"],
  [/maillot/, "le maillot"],
  [/taches?/, "les taches"],
  [/rides?/, "les rides"],
  [/pores?/, "les pores"],
  [/acne/, "l’acné"],
];

// Une description de la fiche n’est reprise que si elle reste sobre : sinon, rôle neutre du catalogue.
const PROMISE =
  /elimin|detrui|supprim|fait (fondre|disparaitre)|disparai|garanti|definiti|miracle|100 ?%|radical|sans effort|immediat|des la premiere|perte de \d|perdre \d/;

const ROLE_VERB =
  /^(elimine|raffermit|lisse|draine|soulage|cible|agit|stimule|tonifie|renforce|reduit|detruit|nettoie|hydrate|exfolie|traite|travaille|aide|permet|favorise|ameliore|attenue|resserre|redessine|sculpte|affine|active|relance|regenere|unifie|apaise|diminue|lutte|fait|retend)\b/;

function asksTechnology(text) {
  const value = normalize(text);
  if (/(vous )?utilise[sz]?(-vous)? quoi|qu'est-ce que vous utilisez|avec quoi (vous )?(travaillez|traitez)/.test(value)) {
    return true;
  }
  return (
    /technologies?|machines?|appareils?|materiel|equipements?/.test(value) &&
    (/\?|quoi|quel|avez|utilisez|presentes?|faites|vous servez/.test(value) || /c'?est (du |de la )?/.test(value))
  );
}

function zonesOfText(text) {
  let value = normalize(text);
  const hits = [];
  for (const [pattern, label] of ZONE_WORDS) {
    if (pattern.test(value)) {
      hits.push({ pattern, label });
      value = value.replace(pattern, " ");
    }
  }
  return hits;
}

function zoneOfText(text) {
  return zonesOfText(text)[0] || null;
}

function targetLabel(targets) {
  const concern = targets.find((item) => item.label === "la cellulite");
  const place = targets.find((item) => item.label !== "la cellulite");
  return concern && place ? `la cellulite sur ${place.label}` : targets[0].label;
}

/** Description donnée par le centre pour cet appareil (« Cryolipolyse : élimine… »), sinon "". */
function centerDescription(fact, tech) {
  const value = String(fact || "");
  const match = value.match(/^[^:–—]{1,60}?\s*(?::|–|—|\s-\s)\s*(.+)$/);
  if (!match || !tech.pattern.test(normalize(match[0].split(/:|–|—|\s-\s/)[0]))) {
    return "";
  }
  const description = match[1]
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[.;]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!description || !ROLE_VERB.test(normalize(description)) || PROMISE.test(normalize(description))) {
    return "";
  }
  return prospectText(`qui ${description.charAt(0).toLowerCase()}${description.slice(1)}`);
}

/** Appareils réellement cités par le centre pour ce soin, avec ce que la fiche en dit. */
function centerTechnologies(sources, family) {
  const facts = knowledgeLines(sources);
  const found = [];
  for (const tech of TECHNOLOGIES) {
    if (family && tech.family !== family) {
      continue;
    }
    const related = facts.filter((fact) => tech.pattern.test(normalize(fact)));
    if (!related.length) {
      continue;
    }
    const own = related.map((fact) => centerDescription(fact, tech)).find(Boolean);
    found.push({
      ...tech,
      role: own || tech.role,
      facts: related,
    });
  }
  return found;
}

function joinFrench(items) {
  if (items.length <= 1) {
    return items[0] || "";
  }
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

function capitalize(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

const VISIT_BY_FAMILY = { minceur: "bilan", epilation: "bilan", visage: "diagnostic" };

/**
 * Réponse à « quels appareils… ? » : seulement les technologies du centre utiles à la
 * zone ou au besoin évoqué, expliquées simplement. "" si la fiche n’en cite aucune.
 */
function technologyReply({ text, family, zone, sources }) {
  const techs = centerTechnologies(sources, family);
  if (!techs.length) {
    return "";
  }
  const value = normalize(text);
  const visit = VISIT_BY_FAMILY[family] || "bilan";
  const suits = ` Le ${visit} permet d’évaluer si cette technique est adaptée à votre besoin.`;
  const named = techs.filter((tech) => tech.pattern.test(value));
  if (named.length === 1 && !asksTechnology(text)) {
    const role = named[0].role.startsWith("qui ") ? named[0].role.slice(4) : `est ${named[0].role}`;
    return `${capitalize(named[0].name)} ${role}.${suits}`;
  }
  const asked = zonesOfText(text);
  const targets = asked.length ? asked : zonesOfText(zone).slice(0, 1);
  // Appareil que la fiche rattache elle-même à la zone : 2 points ; zone d’usage habituelle : 1 point.
  const score = (tech) =>
    targets.reduce((total, target) => {
      if (tech.facts.some((fact) => target.pattern.test(normalize(fact)))) return total + 2;
      return total + (tech.zones.test(normalize(target.label)) ? 1 : 0);
    }, 0);
  const scored = targets.length
    ? techs.map((tech) => ({ tech, points: score(tech) })).filter((item) => item.points > 0)
    : [];
  const best = Math.max(0, ...scored.map((item) => item.points));
  const relevant = scored
    .filter((item) => item.points >= (targets.length > 1 ? best - 1 : 1))
    .sort((a, b) => b.points - a.points)
    .map((item) => item.tech);
  const chosen = (relevant.length ? relevant : techs).slice(0, 3);
  const partial = (relevant.length ? relevant : techs).length > chosen.length;
  const prefix = `${relevant.length ? `Pour ${targetLabel(targets)}, le centre utilise` : "Le centre utilise"}${partial ? " notamment" : ""}`;
  const parts = chosen.map((tech) => `${tech.name}, ${tech.role}`);
  const listed = chosen.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}, et ${parts.at(-1)}`;
  const choice = chosen.length > 1 || partial
    ? ` Le ${visit} permet de choisir ce qui convient à votre cas.`
    : suits;
  return `${prefix} ${listed}.${choice}`;
}

/** « Et pour les cuisses ? » juste après une réponse sur les appareils : même sujet, autre zone. */
function isTechnologyFollowUp(text, previousSeyaText) {
  const value = normalize(text);
  return (
    /le centre utilise/.test(normalize(previousSeyaText)) &&
    zonesOfText(text).length > 0 &&
    value.split(/\s+/).length <= 10 &&
    !/lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|semaine|matin|midi|soir|\d{1,2}\s*h|combien|prix|tarif|ou etes|adresse|rappel|rdv|rendez/.test(value)
  );
}

/** Noms des appareils d’un soin, pour une réponse courte sur un autre soin du centre. */
function technologyNames(sources, family) {
  return joinFrench(centerTechnologies(sources, family).slice(0, 2).map((tech) => tech.name));
}

const FAMILY_MARKERS = {
  minceur: /analyse corporelle|bilan minceur|cryo ?lipolyse|presso ?therapie|cellu ?m ?6|palper[- ]rouler|cavitation|lipo ?laser|amas graisseux/,
  epilation: /bilan pilaire|laser (a )?diode|alexandrite|epilation/,
  visage: /diagnostic (de peau|visage)|hydra ?facial|soins? (du )?visage|microneedling/,
};

function technologiesIn(text) {
  const value = normalize(text);
  return TECHNOLOGIES.filter((tech) => tech.pattern.test(value)).map((tech) => tech.key);
}

function sentencesOf(text) {
  return String(text || "")
    .split(/(?<=[.!?…])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function familiesIn(text) {
  const value = normalize(text);
  return Object.keys(FAMILY_MARKERS).filter((family) => FAMILY_MARKERS[family].test(value));
}

const INTERNAL_LEAK =
  /\b((mes|ses|tes|selon les) consignes|consignes? (internes?|de seya|du brief)|consignes? ?:|brief|treatment ?briefs?|center ?profile|seya ?mission|pricing|session ?policy|prompt|termine par|tu dois|reponds? (toujours|jamais|uniquement)|ne (dis|parle|propose) jamais|fiche (du |de )?(centre|soin|prestation))\b/;

/**
 * Vérification avant envoi : pas de consigne interne ni de nom de champ, et pas de phrase
 * sur un autre soin que celui du parcours ou de la question posée.
 */
function checkAgainstCenter(reply, { allowedFamilies = [] } = {}) {
  const sentences = sentencesOf(reply);
  if (!sentences.length) {
    return { text: reply, removed: [] };
  }
  const allowed = new Set(allowedFamilies.filter(Boolean));
  const removed = [];
  const kept = sentences.filter((sentence) => {
    const value = normalize(sentence);
    if (INTERNAL_LEAK.test(value)) {
      removed.push("internal");
      return false;
    }
    if (allowed.size) {
      const foreign = familiesIn(sentence).filter((family) => !allowed.has(family));
      if (foreign.length && !familiesIn(sentence).some((family) => allowed.has(family))) {
        removed.push(`family:${foreign.join(",")}`);
        return false;
      }
    }
    return true;
  });
  if (!kept.length) {
    return { text: reply, removed: [] };
  }
  return { text: kept.join(" "), removed };
}

function durationMinutesOf(text) {
  const value = normalize(text);
  const hours = value.match(/\b(\d{1,2})\s*h(?:eures?)?\s*(\d{2})?\b/);
  if (hours && !/\d{1,2}\s*h\d{2}\s*(et|ou|a)\b/.test(value)) {
    return Number(hours[1]) * 60 + Number(hours[2] || 0);
  }
  const minutes = value.match(/\b(\d{2,3})\s*(?:min|minutes)\b/);
  return minutes ? Number(minutes[1]) : null;
}

/** Durées du bilan annoncées par la fiche ; plusieurs valeurs = information contradictoire. */
function visitDurationsInFacts(sources) {
  const values = new Set();
  for (const fact of briefFacts([].concat(sources).filter(Boolean))) {
    const value = normalize(fact);
    if (!/(bilan|diagnostic|rendez-vous|premier rdv|consultation)/.test(value) || !/dure|duree|environ|minutes|\d\s*h\b/.test(value)) {
      continue;
    }
    const minutes = durationMinutesOf(fact);
    if (minutes) {
      values.add(minutes);
    }
  }
  return [...values];
}

/** Le tarif du bilan réglé dans Bookea et celui écrit dans la fiche se contredisent. */
function bilanPriceConflict(policyBilan, sources) {
  const policy = normalize(policyBilan);
  if (!policy) {
    return false;
  }
  const policyFree = /offert|gratuit|^0\s*(€|euros?)?$/.test(policy);
  const policyAmount = policy.match(/(\d+(?:[.,]\d+)?)\s*(€|euros?)/)?.[1];
  for (const fact of briefFacts([].concat(sources).filter(Boolean))) {
    const value = normalize(fact);
    if (!/\b(bilan|diagnostic)\b/.test(value)) {
      continue;
    }
    const amount = value.match(/\b(bilan|diagnostic)[^.]*?(\d+(?:[.,]\d+)?)\s*(€|euros?)/)?.[2];
    const valued = /valeur|au lieu|habituellement|deduit|rembourse/.test(value);
    if (policyFree && amount && !valued && !/offert|gratuit/.test(value)) {
      return true;
    }
    if (policyAmount && /\b(bilan|diagnostic)\b[^.]*\b(offert|gratuit)/.test(value) && !valued) {
      return true;
    }
    if (policyAmount && amount && amount !== policyAmount && !valued) {
      return true;
    }
  }
  return false;
}

// La phrase n’est envoyée telle quelle que si le mail au centre part (cf. whatsapp.js).
const TEAM_QUESTION_MARK = "Je transmets votre question à l’équipe du centre";
const TEAM_QUESTION_REPLY = `Je n’ai pas cette information. ${TEAM_QUESTION_MARK}, qui vous répondra directement.`;
const TEAM_QUESTION_UNSURE_REPLY = `Je préfère ne pas vous donner une information inexacte. ${TEAM_QUESTION_MARK}, qui vous répondra directement.`;
const TEAM_QUESTION_FAILED_REPLY = "Je n’ai pas cette information pour le moment, et je préfère ne pas vous répondre au hasard.";

function withoutTeamQuestion(reply) {
  return String(reply || "")
    .replace(/Je n’ai pas cette information\. Je transmets votre question à l’équipe du centre, qui vous répondra directement\./, TEAM_QUESTION_FAILED_REPLY)
    .replace(/Je préfère ne pas vous donner une information inexacte\. Je transmets votre question à l’équipe du centre, qui vous répondra directement\./, TEAM_QUESTION_FAILED_REPLY);
}

module.exports = {
  TEAM_QUESTION_FAILED_REPLY,
  TEAM_QUESTION_MARK,
  TEAM_QUESTION_REPLY,
  TEAM_QUESTION_UNSURE_REPLY,
  withoutTeamQuestion,
  asksTechnology,
  bilanPriceConflict,
  centerTechnologies,
  checkAgainstCenter,
  familiesIn,
  isTechnologyFollowUp,
  technologiesIn,
  technologyNames,
  technologyReply,
  visitDurationsInFacts,
  zoneOfText,
};
