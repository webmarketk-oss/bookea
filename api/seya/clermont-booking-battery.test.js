/**
 * Batterie Clermont (prise de RDV) : transcript réel + ≥500 cas agenda / parsing.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const {
  applyBookingMessage,
  emptyBookingState,
} = require("./booking-state");
const {
  askedServiceName,
  isServiceAsk,
  wantsSlots,
} = require("./conversation");
const { serviceOfferReply } = require("./care-family");
const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");

const NOW = new Date("2026-10-28T10:00:00");
const CENTER_ID = "jfg-clinique-clermont";
const ADDRESS = "2 rue Eugène Gilbert, 63000 Clermont-Ferrand";

const seya = {
  seyaMission: "book",
  qualifyOnSignup: true,
  askForAppointment: true,
  bookAppointment: true,
  handoffToHuman: true,
  treatmentBriefs: [
    {
      name: "Soin minceur",
      pricing: {
        bilan: "offert",
        discovery: "offerte",
        session: "",
        package: "à partir de 500€",
        sessionPolicy: "after_bilan",
      },
      brief:
        "Parle comme une réceptionniste. Après le besoin, présente le bilan offert puis cherche un créneau.",
    },
  ],
};

const hours = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "19:00",
  closed: weekday === 0,
}));

function lastSeya(conversation) {
  return (
    [...(conversation.messages || [])].reverse().find((item) => item.author === "seya")?.text ||
    ""
  );
}

function open() {
  return startConversation(
    {
      leadId: "lead-clermont-battery",
      centerId: CENTER_ID,
      firstName: "Léa",
      phone: "0611223344",
      treatment: "Soin minceur",
      campaign: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
}

async function say(conversation, text, extras = {}) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya,
    appointments: extras.appointments || [],
    hours,
    centerName: "JFG Clinique Clermont",
    centerAddress: ADDRESS,
    centerId: CENTER_ID,
    now: extras.now || NOW,
    slots: extras.slots,
  });
  return result.conversation;
}

const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const AVAILABILITY_PHRASES = [
  "Vous avez des disponibilités quand ?",
  "Vous avez des disponibilités ?",
  "Avez-vous des disponibilités ?",
  "Vous avez un créneau quand ?",
  "Vous avez de la place cette semaine ?",
  "Quelles sont vos disponibilités ?",
  "Y a-t-il des disponibilités ?",
  "Des dispos bientôt ?",
  "Vous avez un horaire libre ?",
  "Vous avez des créneaux ?",
  "Avez-vous un créneau demain ?",
  "Vous avez de la place vendredi ?",
  "Dispo quand vous voulez de mon côté, vous avez quoi ?",
  "Je suis flexible, vous avez des dispos ?",
];

const REAL_SERVICE_ASKS = [
  "Faites-vous de la cryolipolyse ?",
  "Vous faites de l'épilation laser ?",
  "Proposez-vous des soins visage ?",
  "Vous avez de l'HydraFacial ?",
  "Est-ce que vous faites la lumière pulsée ?",
  "Vous proposez le LPG ?",
];

test("transcript Clermont : dispo ≠ prestation ; jeudi = 29/10 pas 12/11", async () => {
  let conversation = open();
  conversation = await say(conversation, "Bonjour les bras");
  conversation = await say(conversation, "Vous avez des disponibilités quand ?");
  assert.doesNotMatch(lastSeya(conversation), /ne faisons pas/i);
  assert.doesNotMatch(lastSeya(conversation), /disponibilites quand/i);
  // Elle avance sur l’agenda (créneaux ou question de dispo), jamais un refus de prestation.
  assert.match(lastSeya(conversation), /propos|disponib|creneau|jour|semaine|horaire|\d{1,2}h/i);

  // Créneaux déjà proposés (comme dans le fil réel mercredi 28 à 09h).
  const wedSlots = [
    { date: "2026-10-28", time: "09:00", label: "mercredi 28 octobre à 09h00" },
    { date: "2026-10-28", time: "09:30", label: "mercredi 28 octobre à 09h30" },
  ];
  conversation = {
    ...conversation,
    proposedSlots: wedSlots,
    bookingState: {
      ...conversation.bookingState,
      lastOfferedSlots: wedSlots,
      requestedDate: "2026-10-28",
      requestedWeekday: 3,
      appointmentStatus: "proposed",
    },
    messages: [
      ...(conversation.messages || []),
      {
        id: "seya-wed",
        author: "seya",
        text: "Je peux vous proposer le mercredi 28 octobre à 09h00 ou 09h30. Lequel vous conviendrait le mieux ?",
        at: "2026-10-28T09:00:00Z",
      },
    ],
  };

  conversation = await say(
    conversation,
    "Vous êtes situé où exactement ? Car demain matin j’ai également un rdv",
  );
  assert.match(lastSeya(conversation), /Eugène Gilbert|Clermont/i);
  assert.doesNotMatch(lastSeya(conversation), /ne faisons pas/i);
  // Ne bascule pas sur « demain » (RDV perso ailleurs).
  assert.notEqual(conversation.bookingState.requestedDate, "2026-10-29");

  conversation = await say(
    conversation,
    "Ça fera juste pour mon prochain rdv. Vous avez jeudi par hasard ?",
  );
  assert.equal(conversation.bookingState.requestedDate, "2026-10-29");
  assert.equal(conversation.bookingState.requestedWeekday, 4);
  assert.ok(conversation.bookingState.rejectedDates.includes("2026-10-28"));
  assert.match(lastSeya(conversation), /jeudi|29\/10|29 octobre/i);
  assert.doesNotMatch(lastSeya(conversation), /12 novembre|5 novembre|05\/11|12\/11/i);
  assert.doesNotMatch(lastSeya(conversation), /ne faisons pas/i);
});

test("parsing : ≥500 cas agenda Clermont sans faux « ne faisons pas »", () => {
  const failures = [];
  let checked = 0;

  for (const phrase of AVAILABILITY_PHRASES) {
    checked += 1;
    if (isServiceAsk(phrase) || askedServiceName(phrase)) {
      failures.push(`serviceAsk:${phrase}`);
    }
    if (!wantsSlots(phrase)) {
      failures.push(`wantsSlots:${phrase}`);
    }
    const reply = serviceOfferReply(phrase, seya, { messages: [] });
    if (/ne faisons pas/i.test(reply)) {
      failures.push(`serviceReply:${phrase}→${reply}`);
    }
  }

  for (const phrase of REAL_SERVICE_ASKS) {
    checked += 1;
    if (!isServiceAsk(phrase)) {
      failures.push(`missedService:${phrase}`);
    }
  }

  // Combinaisons jour × formulations (≈ 6 × 12 × 7 = 504)
  const templates = [
    "Vous avez {day} ?",
    "Vous avez {day} par hasard ?",
    "Plutôt {day}",
    "Et {day} ?",
    "Je peux venir {day}",
    "Ce serait possible {day} ?",
    "Dispo {day} matin",
    "Dispo {day} après-midi",
    "{day} matin si possible",
    "{day} en fin de journée",
    "Finalement {day}",
    "Sinon {day}",
  ];
  const prefixes = [
    "",
    "Ok ",
    "D'accord ",
    "Hmm ",
    "Alors ",
    "Du coup ",
    "Parfait ",
  ];

  for (const day of WEEKDAYS) {
    for (const template of templates) {
      for (const prefix of prefixes) {
        const phrase = `${prefix}${template.replace("{day}", day)}`.trim();
        checked += 1;
        if (isServiceAsk(phrase)) {
          failures.push(`dayAsService:${phrase}`);
        }
        const state = applyBookingMessage(emptyBookingState(CENTER_ID), phrase, {
          now: NOW,
          centerId: CENTER_ID,
        });
        const expectedWeekday = WEEKDAYS.indexOf(day) + 1; // lundi=1
        if (state.requestedWeekday !== expectedWeekday) {
          failures.push(
            `weekday:${phrase}→${state.requestedWeekday} want ${expectedWeekday}`,
          );
        }
        if (!state.requestedDate) {
          failures.push(`noDate:${phrase}`);
        }
      }
    }
  }

  // « mon prochain rdv » ne doit pas sauter une semaine
  const prochainTraps = [
    "Ça fera juste pour mon prochain rdv. Vous avez jeudi par hasard ?",
    "J'ai un prochain rendez-vous. Vous avez vendredi ?",
    "Mon prochain rdv est ailleurs. Plutôt mardi ?",
    "Pour mon prochain rdv ça sera juste. Mercredi ?",
  ];
  for (const phrase of prochainTraps) {
    checked += 1;
    let state = emptyBookingState(CENTER_ID);
    state.lastOfferedSlots = [
      { date: "2026-10-28", time: "09:00" },
      { date: "2026-10-28", time: "09:30" },
    ];
    state.requestedDate = "2026-10-28";
    state.requestedWeekday = 3;
    state = applyBookingMessage(state, phrase, { now: NOW, centerId: CENTER_ID });
    const day = WEEKDAYS.find((name) => normalizeHas(phrase, name));
    if (day === "jeudi" && state.requestedDate !== "2026-10-29") {
      failures.push(`prochainTrap:${phrase}→${state.requestedDate}`);
    }
    if (day === "vendredi" && state.requestedDate !== "2026-10-30") {
      failures.push(`prochainTrap:${phrase}→${state.requestedDate}`);
    }
    if (day === "mardi" && state.requestedDate !== "2026-11-03") {
      failures.push(`prochainTrap:${phrase}→${state.requestedDate}`);
    }
    if (day === "mercredi" && state.requestedDate !== "2026-11-04") {
      failures.push(`prochainTrap:${phrase}→${state.requestedDate}`);
    }
  }

  // « jeudi prochain » DOIT passer à la semaine d’après
  for (const phrase of ["jeudi prochain", "prochain jeudi", "le jeudi suivant"]) {
    checked += 1;
    let state = emptyBookingState(CENTER_ID);
    state.requestedDate = "2026-10-29";
    state.requestedWeekday = 4;
    state.lastOfferedSlots = [{ date: "2026-10-29", time: "09:00" }];
    state = applyBookingMessage(state, phrase, { now: NOW, centerId: CENTER_ID });
    if (state.requestedDate !== "2026-11-05") {
      failures.push(`nextWeekday:${phrase}→${state.requestedDate}`);
    }
  }

  // Flexible → wantsSlots, pas service
  const flexible = [
    "je suis disponible quand vous voulez",
    "je ne travaille pas je suis dispo",
    "n'importe quand",
    "dès que possible",
    "je m'adapte à vos horaires",
  ];
  for (const phrase of flexible) {
    checked += 1;
    if (isServiceAsk(phrase)) {
      failures.push(`flexService:${phrase}`);
    }
  }

  assert.ok(checked >= 500, `attendu ≥500 cas, got ${checked}`);
  assert.equal(
    failures.length,
    0,
    `${failures.length}/${checked} échecs:\n${failures.slice(0, 40).join("\n")}`,
  );
});

function normalizeHas(text, day) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .includes(day);
}

test("transcript Clermont : Cournon dans le rayon ; autre clinique ≠ ce fil ; pas de fuite brief", async () => {
  const gaillard = require("./gaillard");
  const { isInstruction } = require("./brief-facts");
  const {
    asksNearbyCatchment,
    asksOtherSite,
    nearbyCatchmentReply,
    otherSiteReply,
    resumesBooking,
  } = require("./lead-pause");

  // Secteur proche (rayon geo) ≠ demande d’autre clinique — tous centres.
  assert.equal(asksOtherSite("secteur cournon", "Clermont-Ferrand"), false);
  assert.ok(
    asksNearbyCatchment(
      "Je serais dispo demain mais sur secteur cournon",
      "Clermont-Ferrand",
      "2 rue Eugène Gilbert, 63000 Clermont-Ferrand",
    ),
  );
  assert.ok(
    asksNearbyCatchment(
      "Je suis dispo sur secteur Annemasse",
      "Gaillard",
      "12 rue de Genève, 74240 Gaillard",
    ),
  );
  assert.match(
    nearbyCatchmentReply(
      "Clermont-Ferrand",
      { label: "Cournon", km: 12 },
      "2 rue Eugène Gilbert, 63000 Clermont-Ferrand",
    ),
    /proximit|Clermont|Eugène Gilbert/i,
  );
  assert.equal(
    asksOtherSite(
      "vous aviez un centre sur Cournon c’est possible de faire la séance et le bilan la bas ?",
      "Clermont-Ferrand",
    ),
    true,
  );
  assert.match(
    otherSiteReply("Clermont-Ferrand", "Cournon", "2 rue Eugène Gilbert, 63000 Clermont-Ferrand"),
    /autre centre|offres différentes|tout près|Clermont/i,
  );
  assert.equal(resumesBooking("Normalement ya samedi"), true);
  assert.equal(
    isInstruction(
      "Rappelle que **le bilan complet et la séance découverte sont offerts et que le rendez-vous dure environ 1 h 15**.",
    ),
    true,
  );
  assert.equal(
    gaillard.leaksInternalBrief(
      "Oui, nous proposons des soins minceur. Rappelle que **le bilan complet et la séance découverte sont offerts**.",
    ),
    true,
  );

  let conversation = open();
  conversation = await say(conversation, "Bonjour le ventre");
  conversation = {
    ...conversation,
    leadPause: { at: "2026-10-28T08:00:00Z", reason: "autre_ville", text: "cournon" },
    messages: [
      ...(conversation.messages || []),
      {
        id: "seya-only",
        author: "seya",
        text: "Notre centre se situe uniquement à Clermont-Ferrand, au 2 rue Eugène Gilbert. Souhaitez-vous que je vous aide à trouver un créneau pour le bilan minceur à cet endroit ?",
        at: "2026-10-28T08:00:00Z",
      },
    ],
  };
  conversation = await say(conversation, "Normalement ya samedi");
  assert.doesNotMatch(lastSeya(conversation), /Je reste disponible si vous avez une question/i);
  assert.match(lastSeya(conversation), /sam|31\/10|samedi/i);

  conversation = await say(
    conversation,
    "Je serait dispo demain mais sur secteur cournon",
  );
  assert.match(lastSeya(conversation), /proximit|Cournon/i);
  assert.doesNotMatch(lastSeya(conversation), /offres différentes|autre centre/i);
  assert.match(lastSeya(conversation), /29\/10|demain|jeudi|09h/i);

  conversation = await say(
    conversation,
    "Bonjour oui j’ai vu que vous aviez un centre sur Cournon c’est possible de faire la séance et le bilan la bas ?",
  );
  assert.match(lastSeya(conversation), /Clermont|autre centre|offres différentes|tout près/i);
  assert.doesNotMatch(lastSeya(conversation), /Oui, nous proposons|Rappelle que|\*\*/i);
  assert.equal(conversation.locationCheck?.kind, "other_site");
});
