// Une fiche de soin mélange des informations (soins, appareils, offres) et des consignes
// adressées à Seya (titres, « réponds… », phrases d’exemple). Seules les informations
// peuvent être reprises telles quelles dans un message envoyé au prospect.

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'");
}

const BULLET = /^\s*(?:[-–—•*▪·●]|\d{1,2}[.)])\s+/;
const QUOTED = /[«»“”"]/;
const INSTRUCTION_START =
  /^(reponds?|repondre|demande[rsz]?|propose[rsz]?|pose[rsz]?|dis|dire|dites|indique[rsz]?|precise[rsz]?|explique[rsz]?|mentionne[rsz]?|insiste[rsz]?|evite[rsz]?|n'invente|ne (dis|dites|propose|demande|pose|parle|mentionne|promets?|jamais|pas)|presente[rsz]?|oriente[rsz]?|relance[rsz]?|valorise[rsz]?|mets? en avant|mettre en avant|rassure[rsz]?|enchaine[rsz]?|termine[rsz]?|conclus|toujours|jamais|interdit|important|attention|objectif|il faut|si (la|le|elle|il|on) |quand (la|le|elle|il) |lorsque|une fois que|etape \d|question \d)\b/;
const INSTRUCTION_ANYWHERE =
  /(^|[\s(,])(tu|toi|ton|ta|tes)\b|(^|\s)t'|\bseya\b|\bconsignes?\b|\bexemples?\b|\bpar ex\b|\bprospect|\blead\b|\bla cliente\b|\ble client\b|\brepond deja\b|\ba la question\b|\bquestion suivante\b|\bscript\b/;

function isHeaderLine(line) {
  const letters = line.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (!letters) {
    return true;
  }
  if (/^#{1,6}\s/.test(line) || /^\*\*[^*]+\*\*:?$/.test(line)) {
    return true;
  }
  return letters === letters.toUpperCase() && letters.length >= 3;
}

function stripLeadingHeader(line) {
  let value = line.replace(/^\*\*([^*]+)\*\*\s*:?\s*/, (match, title) =>
    isHeaderLine(title) ? "" : `${title} `,
  );
  const colon = value.match(/^([^:]{2,60}):\s*(\S.*)$/);
  if (colon && isHeaderLine(colon[1])) {
    value = colon[2];
  }
  const caps = value.match(/^((?:[A-ZÀ-ÖØ-Þ0-9&'’/+-]{2,}\s+)+)(?=[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ])/);
  if (caps && caps[1].replace(/[^A-Za-zÀ-ÖØ-Þ]/g, "").length >= 5) {
    value = value.slice(caps[1].length);
  }
  return value.trim();
}

function isInstruction(sentence) {
  const value = normalize(sentence);
  return QUOTED.test(sentence) || INSTRUCTION_START.test(value) || INSTRUCTION_ANYWHERE.test(value);
}

function finishSentence(sentence) {
  const value = String(sentence || "")
    .replace(/\s+/g, " ")
    .replace(/\s*[:;,–—-]\s*$/, "")
    .trim();
  if (!value) {
    return "";
  }
  return /[.!?…)]$/.test(value) ? value : `${value}.`;
}

function listItem(item) {
  return /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]/.test(item) ? item.charAt(0).toLowerCase() + item.slice(1) : item;
}

function blocksOf(source) {
  const blocks = [];
  let current = null;
  for (const raw of String(source || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    if (BULLET.test(line)) {
      const item = stripLeadingHeader(line.replace(BULLET, "")).replace(/[.;,]\s*$/, "");
      if (!item) {
        continue;
      }
      if (!current) {
        current = { intro: "", items: [] };
        blocks.push(current);
      }
      current.items.push(item);
      continue;
    }
    if (isHeaderLine(line)) {
      current = null;
      continue;
    }
    current = { intro: stripLeadingHeader(line), items: [] };
    blocks.push(current);
  }
  return blocks;
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?…])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Phrases d’information de la fiche, sans titres, consignes ni exemples. */
function briefFacts(sources = []) {
  const facts = [];
  const push = (sentence) => {
    const fact = finishSentence(stripLeadingHeader(String(sentence || "").trim()));
    if (fact.length >= 12 && !isInstruction(fact) && !facts.includes(fact)) {
      facts.push(fact);
    }
  };
  for (const source of [].concat(sources)) {
    for (const block of blocksOf(source)) {
      const items = block.items.filter((item) => !isInstruction(item));
      if (!items.length) {
        splitSentences(block.intro).forEach(push);
        continue;
      }
      const sentences = splitSentences(block.intro);
      const lead = sentences.pop() || "";
      sentences.forEach(push);
      const intro = lead.replace(/\s*[:.]\s*$/, "");
      if (intro && !isInstruction(intro)) {
        push(`${intro} : ${items.map(listItem).join(", ")}`);
      } else if (!intro) {
        items.forEach(push);
      }
    }
  }
  return facts;
}

function findFacts(sources, pattern, limit = 3) {
  return briefFacts(sources)
    .filter((fact) => pattern.test(normalize(fact)))
    .slice(0, limit);
}

module.exports = {
  BULLET,
  briefFacts,
  findFacts,
  isHeaderLine,
  isInstruction,
};
