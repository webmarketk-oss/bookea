const TEMPLATE_ROLE_ORDER = ["firstName", "centerName", "treatment"];

/**
 * Rôle de chaque {{n}} d'après les mots qui le précèdent :
 * « Bonjour {{1}} » = prénom, « du centre {{1}} » = centre,
 * « demande pour notre {{2}} » / « offre {{3}} » = offre.
 */
function templateSlotRolesFromText(text) {
  const source = String(text || "");
  const roles = new Map();
  const pattern = /\{\{(\d+)\}\}/g;
  let match = pattern.exec(source);
  while (match) {
    const index = Number(match[1]);
    const before = source
      .slice(Math.max(0, match.index - 40), match.index)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['’]/g, "'")
      .trimEnd();
    let role = "";
    if (/(bonjour|bonsoir|hello|salut|coucou|cher|chere)[\s,]*$/.test(before)) {
      role = "firstName";
    } else if (
      /(centre|clinique|clinic|institut|cabinet|salon|equipe|chez|seya du|seya de)(\s+(de|du|d'|des))?\s*$/.test(
        before,
      )
    ) {
      role = "centerName";
    } else if (
      /(offre|soin|demande pour( notre| votre| l'| le| la| les)?|pour notre|pour votre|indique|concernant|interesse(e)? par)\s*$/.test(
        before,
      )
    ) {
      role = "treatment";
    }
    if (role && !roles.has(index)) {
      roles.set(index, role);
    }
    match = pattern.exec(source);
  }
  return roles;
}

function templateSlotRoles(template) {
  const body = (template?.components || []).find(
    (item) => String(item.type || "").toUpperCase() === "BODY",
  );
  return templateSlotRolesFromText(String(body?.text || ""));
}

function previewTemplateBody(text, offerLabel) {
  const source = String(text || "");
  if (!source.trim()) {
    return "";
  }
  const roles = templateSlotRolesFromText(source);
  const labels = {
    firstName: "[prénom]",
    centerName: "[centre]",
    treatment: String(offerLabel || "").trim() || "[offre]",
  };
  const indexes = [...source.matchAll(/\{\{(\d+)\}\}/g)].map((item) => Number(item[1]));
  const count = indexes.length ? Math.max(...indexes) : 0;
  const used = new Set(roles.values());
  const remaining = TEMPLATE_ROLE_ORDER.filter((role) => !used.has(role));
  const values = [];
  for (let index = 1; index <= count; index += 1) {
    const role =
      roles.get(index) || remaining.shift() || TEMPLATE_ROLE_ORDER[index - 1] || "treatment";
    values.push(labels[role] || "[offre]");
  }
  return source.replace(
    /\{\{(\d+)\}\}/g,
    (match, index) => values[Number(index) - 1] ?? match,
  );
}

module.exports = {
  TEMPLATE_ROLE_ORDER,
  templateSlotRoles,
  templateSlotRolesFromText,
  previewTemplateBody,
};
