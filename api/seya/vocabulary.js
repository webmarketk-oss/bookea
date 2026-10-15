// Vocabulaire imposé dans tout message envoyé à un prospect, quel que soit le centre et la
// source du texte (fiche, réponse automatique, rédaction IA, message de secours).

const FORBIDDEN_TERMS = [
  { pattern: /cryo[\s-]*lipolyses?/gi, replacement: "cryo" },
];

function matchCase(found, replacement) {
  if (found === found.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (found.charAt(0) === found.charAt(0).toUpperCase()) {
    return `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`;
  }
  return replacement;
}

/** Texte prêt à partir chez le prospect : les termes interdits sont remplacés. */
function prospectText(text) {
  let value = String(text ?? "");
  for (const { pattern, replacement } of FORBIDDEN_TERMS) {
    value = value.replace(pattern, (found) => matchCase(found, replacement));
  }
  return value;
}

function hasForbiddenTerm(text) {
  return FORBIDDEN_TERMS.some(({ pattern }) => new RegExp(pattern.source, "i").test(String(text ?? "")));
}

module.exports = {
  hasForbiddenTerm,
  prospectText,
};
