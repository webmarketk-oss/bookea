/**
 * Tarifs laser par zone, lus dans la grille « Zone : 296 € » des réglages du centre.
 * Seules les zones demandées sont annoncées : jamais la grille complète ni les consignes.
 */

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

const NOT_A_ZONE =
  /mission|regle|consigne|prospect|ne pas|phototype|remise|reduction|\bpour\b|tarif|prix|offre|total/;

const GENERIC_ZONES = [
  { word: "maillot", pattern: /(?:^|[^a-z])maillots?(?=$|[^a-z])/, member: (key) => /maillot/.test(key) },
  { word: "jambes", pattern: /(?:^|[^a-z])jambes?(?=$|[^a-z])/, member: (key) => /jambe/.test(key) },
  { word: "bras", pattern: /(?:^|[^a-z])bras(?=$|[^a-z])/, member: (key) => /bras/.test(key) },
  { word: "ventre", pattern: /(?:^|[^a-z])ventre(?=$|[^a-z])/, member: (key) => /ventre/.test(key) },
];

const ALIASES = [
  [/^aisselles?$/, ["aisselles?", "dessous de bras"]],
  [/^maillot integral$/, ["maillot[- ]+integral", "integrale? (du |de mon |le )?maillot", "maillot (complet|total)"]],
  [/^maillot bresilien$/, ["maillot[- ]+bresilien", "bresilien"]],
  [/^maillot normal$/, ["maillot[- ]+(normal|classique|simple)"]],
  [/^trois quarts des jambes$/, ["trois[- ]quarts? (des |de )?jambes?", "3 ?/ ?4 (des |de )?jambes?"]],
  [/^jambes entieres$/, ["jambes? entieres?", "jambes? completes?", "jambes en entier"]],
  [/^inter-sourcilier$/, ["inter[- ]?sourcili?ers?", "entre les sourcils", "sourcils?"]],
  [/^sillon inter-fessiers$/, ["sillon( inter[- ]?fessiers?)?", "inter[- ]?fessiers?"]],
  [/^levres$/, ["levres?", "moustache"]],
];

function parseZoneGrid(source) {
  const text = String(source || "");
  if (!text) {
    return [];
  }
  const markers = [...text.matchAll(/\b(femme|homme)s?\s*:/gi)].map((match) => ({
    index: match.index,
    gender: normalize(match[1]),
  }));
  const entries = [];
  const pattern =
    /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’ \-]{1,42}?)\s*:\s*(?:(\d[\d\s]*?)\s*€|(sur devis))/g;
  for (const match of text.matchAll(pattern)) {
    const label = match[1].trim();
    const key = normalize(label);
    if (!key || NOT_A_ZONE.test(key)) {
      continue;
    }
    const amount = match[2] ? Number(match[2].replace(/\D/g, "")) : null;
    if (entries.some((entry) => entry.key === key && entry.amount === amount)) {
      continue;
    }
    const gender =
      [...markers].reverse().find((marker) => marker.index < match.index)?.gender || "";
    entries.push({ key, label, amount, gender });
  }
  return entries;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function entryPatterns(entry) {
  const alias = ALIASES.find(([test]) => test.test(entry.key));
  if (alias) {
    return alias[1];
  }
  return [
    entry.key
      .split(/[- ]+/)
      .filter(Boolean)
      .map((word) => `${escapeRegex(word).replace(/s$/, "")}s?`)
      .join("[- ]+"),
  ];
}

function matchZones(entries, askedText) {
  let remaining = ` ${normalize(askedText).replace(/(grandes?|petites?) levres?/g, " ")} `;
  const generics = new Set(GENERIC_ZONES.map((item) => item.word));
  const candidates = entries
    .filter((entry) => !generics.has(entry.key))
    .flatMap((entry) =>
      entryPatterns(entry).map((source) => ({
        entry,
        source,
        regex: new RegExp(`(^|[^a-z])(${source})(?=$|[^a-z])`, "g"),
      })),
    )
    .sort((a, b) => b.source.length - a.source.length);
  const specific = [];
  for (const candidate of candidates) {
    if (!candidate.regex.test(remaining)) {
      continue;
    }
    candidate.regex.lastIndex = 0;
    remaining = remaining.replace(candidate.regex, (_, lead, hit) => `${lead}${" ".repeat(hit.length)}`);
    if (!specific.includes(candidate.entry)) {
      specific.push(candidate.entry);
    }
  }
  const generic = [];
  for (const group of GENERIC_ZONES) {
    if (!group.pattern.test(remaining)) {
      continue;
    }
    const options = entries.filter((entry) => group.member(entry.key));
    if (options.length === 1) {
      if (!specific.includes(options[0])) {
        specific.push(options[0]);
      }
    } else if (options.length > 1) {
      generic.push({ word: group.word, options });
    }
  }
  return { specific, generic };
}

function formatEuro(value) {
  const rounded = Math.round(value * 100) / 100;
  const [whole, decimals] = String(rounded).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped}${decimals ? `,${decimals.padEnd(2, "0")}` : ""} €`;
}

function zoneName(entry) {
  return entry.label.charAt(0).toLowerCase() + entry.label.slice(1);
}

function programSentence(source, plural) {
  const value = normalize(source);
  if (/8 seances/.test(value) && /2 seances d'entretien/.test(value)) {
    return plural
      ? "Chaque forfait comprend 8 séances : 6 séances + 2 séances d’entretien."
      : "Le forfait comprend 8 séances : 6 séances + 2 séances d’entretien.";
  }
  return "Ce sont des prix au forfait, pas à la séance.";
}

function discountTable(source) {
  const table = new Map();
  const value = normalize(source);
  for (const match of value.matchAll(/pour (\d+) zones? achetees?\s*:?\s*reduction de (\d+)\s*%/g)) {
    table.set(Number(match[1]), Number(match[2]));
  }
  return table;
}

function hasAissellesOffer(source) {
  return /aisselles (sont )?offertes/.test(normalize(source));
}

function isAisselles(entry) {
  return /^aisselles?$/.test(entry.key);
}

function genericQuestion(groups) {
  const parts = groups.map(({ word, options }) => {
    const genders = new Set(options.map((option) => option.gender).filter(Boolean));
    const list = options
      .filter((option) => option.amount !== null)
      .map(
        (option) =>
          `${zoneName(option)}${genders.size > 1 && option.gender ? ` (${option.gender})` : ""} ${formatEuro(option.amount)}`,
      )
      .join(", ");
    return `Pour ${word === "jambes" || word === "bras" ? "les" : "le"} ${word}, cela dépend de la zone : ${list}.`;
  });
  return `${parts.join(" ")} ${groups.length > 1 ? "Lesquelles vous intéressent ?" : "Laquelle vous intéresse ?"}`;
}

function laserZonePriceReply(source, askedText) {
  const entries = parseZoneGrid(source);
  if (entries.length < 2) {
    return "";
  }
  const { specific, generic } = matchZones(entries, askedText);
  if (!specific.length && !generic.length) {
    return "";
  }
  const parts = [];
  const priced = specific.filter((entry) => entry.amount !== null);
  const onQuote = specific.filter((entry) => entry.amount === null);
  const offer = hasAissellesOffer(source);
  const aissellesFree = offer && priced.length > 1 && priced.some(isAisselles);
  const bought = aissellesFree ? priced.filter((entry) => !isAisselles(entry)) : priced;

  if (bought.length === 1) {
    parts.push(`Pour la zone « ${zoneName(bought[0])} », le forfait est à ${formatEuro(bought[0].amount)}.`);
    parts.push(programSentence(source, false));
  } else if (bought.length > 1) {
    const sum = bought.reduce((total, entry) => total + entry.amount, 0);
    const table = discountTable(source);
    const percent = table.get(bought.length);
    const listed = bought.map((entry) => `${zoneName(entry)} (${formatEuro(entry.amount)})`).join(" + ");
    if (percent) {
      const top = bought.reduce((best, entry) => (entry.amount > best.amount ? entry : best));
      const total = sum - (top.amount * percent) / 100;
      parts.push(
        `${listed} : total de ${formatEuro(total)}, avec la remise de ${percent} % sur la zone la plus chère (${zoneName(top)}).`,
      );
    } else {
      parts.push(`${listed} : total de ${formatEuro(sum)}.`);
      const maxZones = Math.max(0, ...table.keys());
      if (maxZones && bought.length > maxZones) {
        parts.push(`Au-delà de ${maxZones} zones, l’équipe vous précisera les conditions au centre.`);
      }
    }
    parts.push(programSentence(source, true));
  }
  for (const entry of onQuote) {
    parts.push(`Pour la zone « ${zoneName(entry)} », le tarif est sur devis : l’équipe vous le précisera lors du bilan.`);
  }
  if (aissellesFree) {
    parts.push("Les aisselles sont offertes avec ces zones 😊");
  } else if (offer && priced.length) {
    parts.push("Et en ce moment, les aisselles sont offertes pour toute zone du corps achetée 😊");
  }
  if (generic.length) {
    parts.push(genericQuestion(generic));
  }
  const reply = parts.join(" ").replace(/\s+/g, " ").trim();
  return reply.charAt(0).toUpperCase() + reply.slice(1);
}

function hasZoneGrid(source) {
  return parseZoneGrid(source).length >= 2;
}

function askZoneReply(source, policyFree) {
  return [
    `Les tarifs sont au forfait et dépendent de la zone. ${programSentence(source, false)}`,
    policyFree ? "Le bilan pilaire et le test laser sont offerts et sans engagement." : "",
    "Quelle zone souhaitez-vous traiter ?",
  ]
    .filter(Boolean)
    .join(" ");
}

module.exports = {
  askZoneReply,
  hasZoneGrid,
  laserZonePriceReply,
  parseZoneGrid,
};
