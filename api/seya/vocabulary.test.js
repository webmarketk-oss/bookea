const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

let aiReply = "";
const openaiPath = require.resolve("openai");
require.cache[openaiPath] = {
  id: openaiPath,
  filename: openaiPath,
  loaded: true,
  exports: class {
    constructor() {
      this.chat = {
        completions: { create: async () => ({ choices: [{ message: { content: aiReply } }] }) },
      };
    }
  },
};

const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");
const whatsapp = require("./whatsapp");
const { hasForbiddenTerm, prospectText } = require("./vocabulary");

const FORBIDDEN = /cryo[\s-]*lipolys/i;
const NOW = new Date("2026-10-15T10:00:00");
const hours = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "19:00",
  closed: weekday === 0,
}));

const BRIEF = `CRYOLIPOLYSE : élimine les amas graisseux par le froid (ventre, cuisses).
Cryolipolyse : séance de 1 heure, bilan offert.
- Cryo-lipolyse et radiofréquence.
Le bilan minceur est offert avant toute séance de cryolipolyse.`;

function centerSeya(mission) {
  return {
    seyaMission: mission,
    bookAppointment: mission === "book",
    handoffToHuman: true,
    brief: "Centre spécialisé en Cryolipolyse.",
    treatmentBriefs: [
      { name: "Cryolipolyse", brief: BRIEF, pricing: { bilan: "offert", package: "cures de cryolipolyse à partir de 400 €" } },
    ],
    centerProfile: { activity: "Cryolipolyse et minceur", extras: "" },
  };
}

const CENTERS = [
  { name: "Centre RDV", seya: centerSeya("book") },
  { name: "Centre Rappel", seya: centerSeya("qualify_callback") },
  { name: "Centre Accueil", seya: centerSeya("welcome_relance") },
  { name: "JFG Clinic Gaillard", seya: centerSeya("qualify_callback") },
];

const LEAD_TEXTS = [
  "Bonjour, je suis intéressée par la CRYOLIPOLYSE pour le ventre",
  "C'est quoi la cryolipolyse ?",
  "Quels appareils utilisez-vous pour le ventre ?",
  "Vous faites la cryo-lipolyse ?",
  "Ça coûte combien une séance de Cryolipolyse ?",
  "Combien de temps dure le bilan ?",
  "Ça fait mal la cryolipolyse ?",
  "J'ai eu un cancer, je peux faire la cryolipolyse ?",
  "Je réfléchis",
  "Et après c'est quoi vos prix pour les cures de cryolipolyse ?",
  "Vendredi matin",
  "le premier",
  "merci",
];

async function converse(center, extras = {}) {
  let conversation = startConversation(
    { leadId: `lead-${center.name}`, centerId: center.name, firstName: "Léa", phone: "0611223344", treatment: "Cryolipolyse ventre", campaign: "Offre Cryolipolyse" },
    center.name,
    center.seya,
  );
  for (const text of LEAD_TEXTS) {
    const result = await generateSeyaReply({
      conversation,
      text,
      seya: center.seya,
      appointments: [],
      hours,
      centerName: center.name,
      centerAddress: "12 rue de la République, 63000 Clermont-Ferrand",
      centerId: center.name,
      now: NOW,
      ...extras,
    });
    conversation = result.conversation;
  }
  return conversation.messages.filter((item) => item.author === "seya").map((item) => item.text);
}

test("vocabulaire : « cryolipolyse » devient « cryo », quelle que soit la casse ou l’écriture", () => {
  assert.equal(prospectText("La cryolipolyse cible le ventre."), "La cryo cible le ventre.");
  assert.equal(prospectText("Cryolipolyse : séance."), "Cryo : séance.");
  assert.equal(prospectText("Offre CRYOLIPOLYSE"), "Offre CRYO");
  assert.equal(prospectText("la Cryo-lipolyse et la cryo lipolyse"), "la Cryo et la cryo");
  assert.equal(prospectText("deux cryolipolyses"), "deux cryo");
  assert.equal(prospectText("La cryo reste la cryo."), "La cryo reste la cryo.");
  assert.equal(hasForbiddenTerm("CryoLipolyse"), true);
  assert.equal(hasForbiddenTerm("la cryo"), false);
});

for (const center of CENTERS) {
  test(`${center.name} : aucun message Seya ne contient « cryolipolyse » (fiche, offre, questions du prospect)`, async () => {
    const said = await converse(center);
    assert.ok(said.length > LEAD_TEXTS.length / 2);
    for (const text of said) {
      assert.doesNotMatch(text, FORBIDDEN, text);
    }
  });
}

test("reformulation IA : le terme complet produit par le modèle est corrigé avant envoi", async () => {
  process.env.OPENAI_API_KEY = "test";
  try {
    aiReply = "Avec plaisir ! La CRYOLIPOLYSE utilise le froid, et la Cryo-lipolyse se discute au bilan.";
    const said = await converse(CENTERS[0]);
    for (const text of said) {
      assert.doesNotMatch(text, FORBIDDEN, text);
    }
  } finally {
    delete process.env.OPENAI_API_KEY;
    aiReply = "";
  }
});

test("envoi WhatsApp : contrôle final sur le texte et sur les variables du modèle", async () => {
  const previous = { token: process.env.WHATSAPP_TOKEN, phone: process.env.WHATSAPP_PHONE_NUMBER_ID, fetch: global.fetch };
  process.env.WHATSAPP_TOKEN = "test";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  const bodies = [];
  global.fetch = async (url, init = {}) => {
    if (String(url).endsWith("/messages")) {
      bodies.push(JSON.parse(init.body || "{}"));
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };
  try {
    const sent = await whatsapp.sendSharedWhatsApp("0611223344", "Bonjour, votre bilan Cryolipolyse est offert.", {
      firstName: "Léa",
      centerName: "Centre",
      treatment: "CRYOLIPOLYSE ventre",
    });
    assert.equal(sent.sent, true);
    assert.equal(bodies[0].text.body, "Bonjour, votre bilan Cryo est offert.");
    assert.doesNotMatch(JSON.stringify(bodies), FORBIDDEN);
  } finally {
    process.env.WHATSAPP_TOKEN = previous.token;
    process.env.WHATSAPP_PHONE_NUMBER_ID = previous.phone;
    if (previous.token === undefined) delete process.env.WHATSAPP_TOKEN;
    if (previous.phone === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    global.fetch = previous.fetch;
  }
});
