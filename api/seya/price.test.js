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

test("aisselles / forfait laser : bilan pilaire, jamais d’analyse corporelle", () => {
  const { buildPriceReply } = require("./price");
  const laser = {
    treatmentBriefs: [
      {
        name: "Soin minceur",
        pricing: {
          bilan: "offert",
          discovery: "offerte",
          session: "",
          package: "",
          sessionPolicy: "after_bilan",
        },
      },
      {
        name: "Épilation laser",
        pricing: {
          bilan: "offert",
          discovery: "offert",
          session: "",
          package: "",
          sessionPolicy: "after_bilan",
        },
      },
    ],
  };
  const conversation = {
    treatment: "Épilation laser",
    campaign: "Bilan laser offert + test offert",
    qualification: { need: "Épilation laser", zone: "aisselles" },
    messages: [{ author: "lead", text: "C’est combien pour les aisselles" }],
  };
  const first = buildPriceReply("C’est combien pour les aisselles", laser, conversation);
  assert.match(first, /bilan pilaire/i);
  assert.doesNotMatch(first, /corporelle|séance découverte/i);

  const pack = buildPriceReply(
    "Non les aisselles combien coûte le forfait",
    laser,
    {
      ...conversation,
      messages: [
        ...conversation.messages,
        { author: "seya", text: first },
        { author: "lead", text: "Non les aisselles combien coûte le forfait" },
      ],
    },
  );
  assert.match(pack, /forfait|fourchette|bilan pilaire/i);
  assert.doesNotMatch(pack, /corporelle|séance découverte/i);
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

test("Vichy laser : les briefs minceur 500€ ne fuient pas sur les aisselles", () => {
  const { buildPriceReply } = require("./price");
  const seya = {
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
      },
      {
        name: "Épilation laser",
        pricing: {
          bilan: "offert",
          discovery: "offert",
          session: "",
          package: "",
          sessionPolicy: "after_bilan",
        },
      },
    ],
  };
  const conversation = {
    centerId: "depil-tech-vichy",
    centerName: "Dépil Tech Vichy",
    treatment: "Épilation laser",
    campaign: "offre laser (jusqu’à -40%)",
    qualification: { need: "Épilation laser", zone: "aisselles" },
    messages: [
      { author: "lead", text: "Je voudrais savoir le prix pour 6 séances aisselles" },
    ],
  };
  const first = buildPriceReply(
    "Je voudrais savoir le prix pour 6 séances aisselles",
    seya,
    conversation,
  );
  assert.doesNotMatch(first, /500|cures|analyse corporelle|séance découverte sont offerts/i);
  const before = buildPriceReply("Je voudrais le prix avant", seya, {
    ...conversation,
    messages: [
      ...conversation.messages,
      { author: "seya", text: first },
      { author: "lead", text: "Je voudrais le prix avant" },
    ],
  });
  assert.doesNotMatch(before, /500|cures|analyse corporelle|minceur/i);
  assert.match(before, /fourchette|avant de venir|rappeler|bilan pilaire/i);
});

test("une consigne collée dans le forfait n'est pas récitée au prospect", () => {
  const { buildPriceReply } = require("./price");
  const { checkAgainstCenter } = require("./center-knowledge");
  const brief =
    "a mission est uniquement de qualifier le prospect pour l’épilation laser. RÈGLES DE RÉPONSE : Ne pas envoyer toute la grille. Ne pas inventer de conditions. TARIFS ÉPILATION LASER Aisselles : 296 €. Ne filtre pas les contre-indications.";
  const settings = {
    treatmentBriefs: [
      {
        name: "Épilation laser",
        brief,
        pricing: {
          bilan: "Offert et sans engagement",
          discovery: "Test laser offert et sans engagement",
          sessionPolicy: "after_bilan",
          package: brief,
        },
      },
    ],
  };
  const text = buildPriceReply("Excusez-moi, combien ça coute ?", settings, {
    treatment: "Épilation laser",
    qualification: { need: "Épilation laser" },
    messages: [],
  });
  assert.match(text, /bilan pilaire/i);
  assert.doesNotMatch(text, /mission est|règles de réponse|ne pas inventer|296/i);
  const leaked = checkAgainstCenter(brief, { allowedFamilies: ["epilation"] });
  assert.doesNotMatch(leaked.text, /mission est|ne pas inventer|296/i);
  assert.equal(leaked.removed[0], "internal");
});

const GAILLARD_GRID =
  "Tous les prix ci-dessous correspondent au programme complet de 8 séances : 6 séances + 2 séances d’entretien. Ce ne sont pas des prix à la séance.FEMME :Aisselles : 296 € ; maillot normal : 315 € ; maillot brésilien : 480 € ; maillot intégral : 630 € ; sillon inter-fessiers : 230 € ; demi-jambes : 790 € ; trois quarts des jambes : 1 190 € ; jambes entières : 1 490 € ; demi-cuisses : 590 € ; cuisses : 790 € ; pieds : 270 € ; demi-bras : 490 € ; bras entiers : 810 € ; mains : 230 € ; bande du ventre : 230 € ; inter-sourcilier : 135 € ; lèvres : 160 € ; menton : 190 €.HOMME :Aisselles : 296 € ; sillon inter-fessiers : 230 € ; jambes entières : 1 490 € ; demi-jambes : 790 € ; trois quarts des jambes : 1 190 € ; cuisses : 790 € ; demi-cuisses : 590 € ; pieds : 270 € ; demi-bras : 490 € ; bras entiers : 810 € ; mains : 230 € ; barbe : sur devis ; torse : 1 090 € ; demi-torse : 690 € ; ventre : 690 € ; col de chemise : 315 € ; dos : 1 090 € ; demi-dos : 690 € ; épaules : 490 €.REMISES MULTIZONES :Pour 2 zones achetées : réduction de 20 % sur la zone la plus chère.Pour 3 zones achetées : réduction de 30 % sur la zone la plus chère.Pour 4 zones achetées : réduction de 40 % sur la zone la plus chère.Pour calculer le total, additionner les zones achetées puis déduire la remise uniquement sur la zone la plus chère. Ne pas compter les aisselles offertes comme une zone achetée. Ne pas inventer de conditions pour plus de 4 zones ni de cumul avec d’autres promotions.OFFRE DU MOMENT :Les aisselles sont offertes pour toute zone du corps achetée. Lors d’une demande de tarif pour une zone du corps, ajouter naturellement : « Et en ce moment, les aisselles sont offertes pour toute zone du corps achetée 😊 »RÈGLES DE RÉPONSE :Donner le prix de la zone demandée en précisant qu’il comprend les 8 séances : 6 séances + 2 séances d’entretien. Ne pas envoyer toute la grille.Si la personne demande plusieurs zones, communiquer le total avec la remise applicable et une courte explication. Clarifier la zone ou la grille femme/homme uniquement si nécessaire.Préciser que des promotions sont régulièrement proposées, à voir directement au centre. Ne pas annoncer de promotion supplémentaire non renseignée.Le bilan pilaire et le test laser sont gratuits et sans engagement.Répondre directement à la question, sans répéter toutes les informations commerciales à chaque message ni redemander une information déjà donnée.ACCOMPAGNEMENT :Diagnostic pilaire avant le programme, technologie Triwave (Alexandrite/Diode/Nd-YAG), adaptation au phototype et suivi en centre. La compatibilité et le protocole sont évalués lors du bilan.";

function gaillardGridPrice(text, qualification = {}) {
  const { buildPriceReply } = require("./price");
  const settings = {
    treatmentBriefs: [
      {
        name: "Épilation laser",
        pricing: {
          bilan: "Offert et sans engagement",
          discovery: "Test laser offert et sans engagement",
          sessionPolicy: "after_bilan",
          package: GAILLARD_GRID,
        },
      },
    ],
  };
  return buildPriceReply(text, settings, {
    treatment: "Épilation laser",
    qualification: { need: "Épilation laser", ...qualification },
    messages: [],
  });
}

const GRID_LEAK = /règles de réponse|ne pas envoyer|ne pas inventer|accompagnement|triwave|mission/i;

test("Gaillard laser : une zone demandée, son prix seul, sans grille ni consignes", () => {
  const text = gaillardGridPrice("C’est combien les aisselles ?");
  assert.match(text, /aisselles/i);
  assert.match(text, /296 €/);
  assert.match(text, /8 séances : 6 séances \+ 2 séances d’entretien/);
  assert.doesNotMatch(text, /315|480|630|1 490/);
  assert.doesNotMatch(text, GRID_LEAK);

  const half = gaillardGridPrice("Et pour les demi-jambes ça coûte combien ?");
  assert.match(half, /demi-jambes.*790 €/);
  assert.match(half, /aisselles sont offertes pour toute zone du corps achetée/);
  assert.doesNotMatch(half, /1 490|1 190/);
});

test("Gaillard laser : aisselles + maillot intégral + demi-jambes, total remisé, aisselles offertes", () => {
  const text = gaillardGridPrice(
    "Combien pour les aisselles, le maillot intégral et les demi-jambes ?",
  );
  // 630 + 790 = 1 420 ; 20 % sur 790 = 158 ; aisselles offertes, non comptées.
  assert.match(text, /^Maillot intégral \(630 €\) \+ demi-jambes \(790 €\) : total de 1 262 €/);
  assert.match(text, /remise de 20 % sur la zone la plus chère \(demi-jambes\)/);
  assert.match(text, /aisselles sont offertes avec ces zones/);
  assert.doesNotMatch(text, /296/);
  assert.doesNotMatch(text, GRID_LEAK);
});

test("Gaillard laser : trois zones, remise de 30 %", () => {
  const text = gaillardGridPrice("Prix maillot brésilien, demi-jambes et lèvres ?");
  // 480 + 790 + 160 = 1 430 ; 30 % sur 790 = 237 → 1 193 €.
  assert.match(text, /total de 1 193 €/);
  assert.match(text, /30 %/);
});

test("Gaillard laser : zone imprécise ou sans zone, Seya demande laquelle", () => {
  const maillot = gaillardGridPrice("C’est combien le maillot ?");
  assert.match(maillot, /maillot normal 315 €, maillot brésilien 480 €, maillot intégral 630 €/);
  assert.match(maillot, /Laquelle vous intéresse \?/);
  assert.doesNotMatch(maillot, GRID_LEAK);

  const none = gaillardGridPrice("Excusez-moi, combien ça coute ?");
  assert.match(none, /Quelle zone souhaitez-vous traiter \?/);
  assert.match(none, /bilan pilaire et le test laser sont offerts/);
  assert.doesNotMatch(none, /\d+ €/);
  assert.doesNotMatch(none, GRID_LEAK);

  const known = gaillardGridPrice("Excusez-moi, combien ça coute ?", {
    detail: "Je voudrais une épilation laser intégrale du maillot, en incluant le pubis et les grandes lèvres",
  });
  assert.match(known, /maillot intégral.*630 €/);
  assert.doesNotMatch(known, /160/);
});

test("Gaillard laser : prix + combien de séances + à vie, jambe complète déjà dite", () => {
  const { buildPriceReply } = require("./price");
  const settings = {
    treatmentBriefs: [
      {
        name: "Épilation laser",
        pricing: {
          bilan: "Offert et sans engagement",
          discovery: "Test laser offert et sans engagement",
          sessionPolicy: "after_bilan",
          package: GAILLARD_GRID,
        },
      },
    ],
  };
  const text = buildPriceReply(
    "Quel sont les prix svp\nEt combien de seances faut til ?\nCest a vie ou bien ?",
    settings,
    {
      treatment: "Épilation laser",
      qualification: { need: "Épilation laser", zone: "jambes complètes" },
      messages: [{ author: "lead", text: "Seulement les jambes complète" }],
    },
  );
  assert.match(text, /1 490 €/);
  assert.match(text, /8 séances/);
  assert.doesNotMatch(text, /Je n’ai pas cette information/i);
  assert.doesNotMatch(text, GRID_LEAK);
});

test("Gaillard laser : barbe sur devis, ventre homme/femme précisé", () => {
  assert.match(gaillardGridPrice("combien pour la barbe ?"), /barbe.*sur devis/);
  const ventre = gaillardGridPrice("c'est combien le ventre en laser ?");
  assert.match(ventre, /bande du ventre \(femme\) 230 €, ventre \(homme\) 690 €/);
});

test("tarifs visage (Gaillard) : diagnostic offert, jamais « pas le bilan minceur »", async () => {
  const seyaVisage = {
    seyaMission: "qualify_callback",
    bookAppointment: false,
    treatmentBriefs: [
      { name: "Soin minceur", brief: "Bilan offert.", pricing: { bilan: "offert", discovery: "offerte" } },
      { name: "Soin visage", brief: "Diagnostic de peau offert.", pricing: { bilan: "offert" } },
    ],
  };
  const conversation = startConversation(
    { leadId: "lead-visage-prix", centerId: "gaillard", firstName: "Léa", phone: "0611223344", treatment: "Soin visage" },
    "JFG Clinic Gaillard",
    seyaVisage,
  );
  const result = await generateSeyaReply({
    conversation,
    text: "Quels sont vos tarifs ?",
    seya: seyaVisage,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinic Gaillard",
    centerAddress: "58 rue de la Libération, 74240 Gaillard",
    centerId: "gaillard",
    now: NOW,
  });
  const said = lastSeya(result.conversation);
  assert.doesNotMatch(said, /minceur|n’est pas le bilan/i);
  assert.match(said, /diagnostic.*offert|offert.*diagnostic/i);
});
