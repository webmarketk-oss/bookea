const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { classifyPriceQuestion, enforcePriceReply, isNearDuplicate } = require("./price");
const { generateSeyaReply } = require("./ai");
const { message, startConversation } = require("./agent");

const NOW = new Date("2026-09-27T12:00:00");

function hours() {
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    startTime: "09:00",
    endTime: "19:00",
    closed: weekday === 0,
  }));
}

function lastSeya(conversation) {
  return (
    [...(conversation.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || ""
  );
}

function seyaWith(pricing) {
  return {
    qualifyOnSignup: true,
    askForAppointment: true,
    bookAppointment: true,
    handoffToHuman: true,
    treatmentBriefs: [
      {
        name: "Soin minceur",
        brief: "Prix seulement si on demande.",
        pricing,
        price:
          "Le bilan et la séance découverte sont offerts, c’est gratuit. On y fait une analyse corporelle pour établir un devis personnalisé. Quand seriez-vous disponible ?",
      },
    ],
  };
}

async function reply(conversation, text, seya) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "12 rue de la République, 63000 Clermont-Ferrand",
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  return result.conversation;
}

function startAfterBilan(seya) {
  const conversation = startConversation(
    {
      leadId: "lead-price",
      centerId: "jfg-clinique-clermont",
      firstName: "Cynthia",
      lastName: "Test",
      phone: "0612345678",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.messages.push(
    message(
      "seya",
      "Le bilan et la séance découverte sont offerts, c’est gratuit. On y fait une analyse corporelle pour établir un devis personnalisé. Quand seriez-vous disponible ?",
    ),
  );
  return conversation;
}

test("« continuer ensuite les séances » n’est pas le prix du bilan", () => {
  assert.equal(
    classifyPriceQuestion("Si je veux continuer ensuite, les séances coûtent combien ?"),
    "next_session",
  );
  assert.equal(classifyPriceQuestion("C’est combien ?"), "generic");
  assert.equal(
    classifyPriceQuestion("Je voudrais savoir le prix pour 6 séances aisselles"),
    "next_session",
  );
  assert.equal(classifyPriceQuestion("Je voudrais le prix avant"), "next_session");
  assert.equal(classifyPriceQuestion("Pourquoi tu répètes la même chose ?"), "repeat_complaint");
});

test("après le bilan gratuit, les séances suivantes n’ont pas la même réponse", async () => {
  const seya = seyaWith({
    bilan: "offert",
    discovery: "offerte",
    session: "",
    package: "",
    sessionPolicy: "after_bilan",
  });
  let conversation = startAfterBilan(seya);
  conversation = await reply(
    conversation,
    "Si je veux continuer ensuite, les séances coûtent combien ?",
    seya,
  );
  const text = lastSeya(conversation);
  assert.match(text, /séances après la découverte|prix fiable|fourchette/i);
  assert.doesNotMatch(text, /Le bilan et la séance découverte sont offerts/i);
  assert.doesNotMatch(text, /lun\.|09h00|quand seriez-vous disponible/i);
  assert.equal((conversation.proposedSlots || []).length, 0);

  conversation = await reply(conversation, "Pourquoi tu répètes la même chose ?", seya);
  const retry = lastSeya(conversation);
  assert.match(retry, /Vous avez raison/i);
  assert.match(retry, /séances suivantes|fourchette/i);
  assert.doesNotMatch(retry, /Le bilan et la séance découverte sont offerts/i);
  assert.doesNotMatch(retry, /lun\. 28\/09|lundi/i);
});

test("tarif de séance renseigné : il est donné directement", async () => {
  const seya = seyaWith({
    bilan: "offert",
    discovery: "offerte",
    session: "à partir de 90€",
    package: "à partir de 500€, payable jusqu’en 10 fois",
    sessionPolicy: "from",
  });
  const conversation = await reply(
    startAfterBilan(seya),
    "Si je veux continuer ensuite, les séances coûtent combien ?",
    seya,
  );
  const text = lastSeya(conversation);
  assert.match(text, /90€/);
  assert.doesNotMatch(text, /Le bilan et la séance découverte sont offerts/i);
});

test("Gap 99€ : l’offre du centre gagne, pas le bilan offert de Clermont", () => {
  const { buildPriceReply } = require("./price");
  const gap = {
    treatmentBriefs: [
      {
        name: "Soin minceur",
        pricing: {
          bilan: "offert",
          discovery: "offerte",
          session: "",
          package: "à partir de 500€, payable jusqu’en 10 fois",
          sessionPolicy: "after_bilan",
        },
        price: "Le bilan et la séance découverte sont offerts.",
      },
    ],
    offerMaps: [
      { match: "offre 99", label: "une séance découverte / bilan à 99€" },
      { match: "offre 49", label: "une séance découverte / bilan à 49€" },
    ],
  };
  const for99 = buildPriceReply("C’est combien ?", gap, {
    campaign: "offre 99",
    treatment: "Soin minceur",
    qualification: { need: "Soin minceur" },
  });
  assert.match(for99, /99€/);
  assert.doesNotMatch(for99, /offert|gratuit/i);

  const for49 = buildPriceReply("C’est combien ?", gap, {
    campaign: "offre 49",
    treatment: "Soin minceur",
    qualification: { need: "Soin minceur" },
  });
  assert.match(for49, /49€/);
  assert.doesNotMatch(for49, /offert|gratuit/i);
});

test("sans tarif renseigné pour ce centre : elle n’invente pas que c’est offert", () => {
  const { buildPriceReply } = require("./price");
  const text = buildPriceReply("C’est combien ?", { treatmentBriefs: [], offerMaps: [] }, {
    treatment: "Soin minceur",
    qualification: { need: "Soin minceur" },
  });
  assert.match(text, /pas ce tarif|équipe/i);
  assert.doesNotMatch(text, /offert|gratuit/i);
});

test("Clermont avec bilan offert en fiche : elle le dit encore", () => {
  const { buildPriceReply } = require("./price");
  const text = buildPriceReply(
    "Le bilan est-il gratuit ?",
    seyaWith({
      bilan: "offert",
      discovery: "offerte",
      session: "",
      package: "",
      sessionPolicy: "after_bilan",
    }),
    { treatment: "Soin minceur", qualification: { need: "Soin minceur" } },
  );
  assert.match(text, /offert/i);
});

test("le contrôle rejette une copie de la dernière réponse", () => {
  const previous =
    "Le bilan et la séance découverte sont offerts, c’est gratuit. On y fait une analyse corporelle pour établir un devis personnalisé. Quand seriez-vous disponible ?";
  const conversation = {
    messages: [{ author: "seya", text: previous }],
    bookingState: { lastPriceIntent: "next_session", unansweredPriceIntent: "next_session" },
    qualification: { need: "Soin minceur" },
    treatment: "Soin minceur",
  };
  assert.equal(isNearDuplicate(previous, previous), true);
  const checked = enforcePriceReply(
    previous,
    "Si je veux continuer ensuite, les séances coûtent combien ?",
    seyaWith({
      bilan: "offert",
      discovery: "offerte",
      session: "",
      package: "",
      sessionPolicy: "after_bilan",
    }),
    conversation,
  );
  assert.equal(checked.replaced, true);
  assert.doesNotMatch(checked.text, /Le bilan et la séance découverte sont offerts/i);
  assert.match(checked.text, /prix fiable|fourchette|après la découverte/i);
});

test("après « non pour le visage », le prix ne revient pas au bilan minceur", async () => {
  const seya = {
    qualifyOnSignup: true,
    askForAppointment: true,
    bookAppointment: true,
    handoffToHuman: true,
    treatmentBriefs: [
      {
        name: "Soin minceur",
        brief: "Prix seulement si on demande.",
        pricing: {
          bilan: "offert",
          discovery: "offerte",
          session: "",
          package: "",
          sessionPolicy: "after_bilan",
        },
      },
      {
        name: "Soin visage",
        brief: "Diagnostic peau.",
        pricing: {
          bilan: "149€",
          discovery: "149€",
          session: "",
          package: "",
          sessionPolicy: "after_bilan",
        },
      },
    ],
    offerMaps: [
      { match: "minceur", label: "bilan + séance découverte offerte" },
      { match: "visage", label: "diagnostic et soin à partir de 149 €" },
    ],
  };
  let conversation = startConversation(
    {
      leadId: "lead-switch-visage",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0612345678",
      campaign: "lift 4 149-copy",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );

  conversation = await reply(conversation, "C’est gratuit", seya);
  conversation = await reply(conversation, "Non pour le visage", seya);
  assert.match(String(conversation.qualification?.need || ""), /visage/i);

  conversation = await reply(conversation, "Ok c’est quoi le prix déjà", seya);
  const answer = lastSeya(conversation);
  assert.match(answer, /149|visage|peau/i);
  assert.doesNotMatch(answer, /corporelle/i);
  assert.doesNotMatch(answer, /offerts, c’est gratuit/i);
});
