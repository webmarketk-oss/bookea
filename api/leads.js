const saveleads = require("./meta/saveleads");

const PUBLIC_BASE = "https://www.bookeai.fr";
const LEAD_BODY = {
  first_name: "Marie",
  last_name: "Dupont",
  email: "marie@cliente.fr",
  phone: "0612345678",
  offre: "Soin minceur",
};

const SOURCE_ALIASES = {
  "systeme.io": "systeme.io",
  systeme: "systeme.io",
  bookea: "bookea",
  vercel: "bookea",
  site: "bookea",
  savemyleads: "savemyleads",
  facebook: "facebook",
  meta: "facebook",
};

function canonicalLeadSource(query) {
  const raw = String(query?.source || query?.origin || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return SOURCE_ALIASES[raw] || "";
}

function leadUrls(center) {
  const slug = encodeURIComponent(String(center || "SLUG_DU_CENTRE").trim() || "SLUG_DU_CENTRE");
  return {
    facebook: `${PUBLIC_BASE}/api/meta/leads`,
    systeme_io: `${PUBLIC_BASE}/api/leads?center=${slug}&source=systeme.io`,
    bookea: `${PUBLIC_BASE}/api/leads?center=${slug}&source=bookea`,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const urls = leadUrls(req.query?.center);
    return res.status(200).json({
      ok: true,
      endpoint: "leads",
      method: "POST",
      fields: ["first_name", "last_name", "email", "phone", "offre"],
      body: LEAD_BODY,
      facebook: {
        url: urls.facebook,
        source: "Facebook",
        notes: [
          "Brancher la Page Facebook dans Admin centres (ID de page → Connecter).",
          "Bookea lit le formulaire chez Meta. Ne pas passer par SaveMyLeads une fois la page connectée.",
        ],
      },
      systeme_io: {
        url: urls.systeme_io,
        source: "Systeme.io",
        notes: [
          "Dans Systeme.io : webhook / HTTP POST json vers cette URL.",
          "Mapper prénom, nom, email, téléphone, offre du contact — jamais l’affilié ni payload_member_email.",
        ],
      },
      bookea: {
        url: urls.bookea,
        source: "Bookea",
        notes: ["Formulaire ou outil Bookea hébergé sur Vercel."],
      },
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const source = canonicalLeadSource(req.query);
  if (!source) {
    return res.status(400).json({
      ok: false,
      error: "missing_source",
      hint: "Ajoute ?center=SLUG&source=systeme.io ou source=bookea",
    });
  }

  req.query = { ...(req.query || {}), source };
  return saveleads(req, res);
};

module.exports.canonicalLeadSource = canonicalLeadSource;
module.exports.leadUrls = leadUrls;
