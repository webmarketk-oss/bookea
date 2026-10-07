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
      url: "https://www.bookeai.fr/api/leads?center=SLUG_DU_CENTRE&source=systeme.io",
      body: {
        first_name: "Marie",
        last_name: "Dupont",
        email: "marie@cliente.fr",
        phone: "0612345678",
        offre: "Soin minceur",
      },
      notes: [
        "Systeme.io : webhook / HTTP POST json vers /api/leads?center=SLUG&source=systeme.io",
        "Le centre se choisit dans l’URL. Mapper le contact, jamais l’affilié.",
      ],
    });
  }

  if (!req.query?.source && !req.query?.origin) {
    req.query = { ...(req.query || {}), source: "systeme.io" };
  } else if (req.query?.origin && !req.query?.source) {
    req.query = { ...(req.query || {}), source: req.query.origin };
  }
  return saveleads(req, res);
};
