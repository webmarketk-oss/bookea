const saveleads = require("../meta/saveleads");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      endpoint: "make/leads",
      method: "POST",
      url: "https://www.bookeai.fr/api/make/leads?center=SLUG_DU_CENTRE&source=systeme.io",
      body: {
        first_name: "Marie",
        last_name: "Dupont",
        email: "marie@cliente.fr",
        phone: "0612345678",
        offre: "Soin minceur",
      },
      notes: [
        "Dans Make : Systeme.io (nouveau contact / tag) → HTTP POST vers cette URL.",
        "Le centre se choisit dans l’URL, pas dans Systeme.io.",
        "Mapper le contact (prénom, nom, email, téléphone) et le titre d’offre, jamais l’affilié.",
      ],
    });
  }

  req.query = {
    ...(req.query || {}),
    source: req.query?.source || req.query?.origin || "facebook",
  };
  return saveleads(req, res);
};
