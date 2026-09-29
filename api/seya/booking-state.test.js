const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const {
  applyBookingMessage,
  emptyBookingState,
  enforceOutgoingText,
  guardSlots,
} = require("./booking-state");
const { generateSeyaReply, applyAiDecision, pickSafeReply } = require("./ai");
const { startConversation, suggestAvailableSlots } = require("./agent");

const NOW = new Date("2026-09-27T12:00:00");
const CENTER_ID = "jfg-clinique-clermont";
const ADDRESS = "12 rue de la République, 63000 Clermont-Ferrand";
const MONDAY_SLOTS = [
  { date: "2026-09-28", time: "09:00", label: "lun. 28/09 à 09h00" },
  { date: "2026-09-28", time: "09:30", label: "lun. 28/09 à 09h30" },
  { date: "2026-09-28", time: "10:00", label: "lun. 28/09 à 10h00" },
];

const seya = {
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
        package: "à partir de 500€, payable jusqu’en 10 fois",
        sessionPolicy: "after_bilan",
      },
      price:
        "Le bilan et la séance découverte sont offerts, c’est gratuit. On y fait une analyse corporelle pour établir un devis personnalisé. Quand seriez-vous disponible ?",
      brief:
        "Parle comme une réceptionniste. Demande la zone. Ne parle de prix que si on te le demande.",
    },
  ],
};

function lastSeya(conversation) {
  return [...(conversation.messages || [])].reverse().find((item) => item.author === "seya")
    ?.text || "";
}

function hours() {
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    startTime: "09:00",
    endTime: "19:00",
    closed: weekday === 0,
  }));
}

async function reply(conversation, text, extras = {}) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya,
    appointments: extras.appointments || [],
    hours: extras.hours || hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: extras.centerAddress ?? ADDRESS,
    centerId: CENTER_ID,
    now: NOW,
    slots: extras.slots,
  });
  return result.conversation;
}

test("replay JFG : ventre, jeudi, prix, 1er octobre, pas lundi, adresse", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-jfg",
      centerId: CENTER_ID,
      firstName: "Samantha",
      lastName: "Test",
      phone: "0612345678",
      treatment: "",
      campaign: "",
    },
    "JFG Clinique Clermont",
    seya,
  );

  conversation = await reply(conversation, "Bonjour perdre du poids sur le ventre");
  assert.match(conversation.qualification.need, /minceur/i);
  assert.match(conversation.qualification.zone, /ventre/i);
  assert.equal(conversation.bookingState.serviceIntent, "minceur_ventre");
  assert.doesNotMatch(lastSeya(conversation), /lun\.|lundi 28/i);
  assert.doesNotMatch(lastSeya(conversation), /Je ne veux pas vous relancer inutilement/);

  conversation = await reply(conversation, "Jeudi");
  assert.equal(conversation.bookingState.requestedWeekday, 4);
  assert.equal(conversation.bookingState.requestedDate, "2026-10-01");
  assert.ok(conversation.proposedSlots.length > 0);
  assert.ok(conversation.proposedSlots.every((slot) => slot.date === "2026-10-01"));
  assert.match(lastSeya(conversation), /jeu\.|jeudi|01\/10/i);
  assert.doesNotMatch(lastSeya(conversation), /lun\.|lundi/i);

  conversation = {
    ...conversation,
    proposedSlots: MONDAY_SLOTS,
    bookingState: {
      ...conversation.bookingState,
      lastOfferedSlots: MONDAY_SLOTS,
      appointmentStatus: "proposed",
    },
  };
  conversation = await reply(conversation, "Non jeudi");
  assert.ok(conversation.bookingState.rejectedDates.includes("2026-09-28"));
  assert.equal(conversation.bookingState.requestedWeekday, 4);
  assert.doesNotMatch(lastSeya(conversation), /lun\. 28\/09|lundi 28/i);
  if (conversation.proposedSlots.length) {
    assert.ok(conversation.proposedSlots.every((slot) => slot.date !== "2026-09-28"));
  }

  conversation = await reply(conversation, "C’est combien ?");
  assert.equal(conversation.bookingState.lastPriceIntent, "generic");
  assert.equal(conversation.bookingState.priceAskCount, 1);
  assert.match(lastSeya(conversation), /gratuit|offert/i);
  assert.match(lastSeya(conversation), /devis personnalisé/i);
  assert.doesNotMatch(lastSeya(conversation), /lun\.|09h00, 09h30/i);

  conversation = await reply(conversation, "Oui mais c’est combien la cure ?");
  assert.match(lastSeya(conversation), /500/);
  assert.match(lastSeya(conversation), /10/i);
  assert.doesNotMatch(lastSeya(conversation), /lun\./i);

  conversation = await reply(conversation, "Jeudi 1er octobre");
  assert.equal(conversation.bookingState.requestedDate, "2026-10-01");
  assert.ok(conversation.proposedSlots.every((slot) => slot.date === "2026-10-01"));
  assert.match(lastSeya(conversation), /01\/10|1er octobre|jeu\./i);
  assert.doesNotMatch(lastSeya(conversation), /lun\./i);

  conversation = await reply(conversation, "Je ne suis pas disponible le lundi");
  assert.ok(conversation.bookingState.rejectedWeekdays.includes(1));
  assert.doesNotMatch(lastSeya(conversation), /lun\. 28\/09|lundi 28/i);
  if (conversation.proposedSlots.length) {
    assert.ok(conversation.proposedSlots.every((slot) => slot.date !== "2026-09-28"));
  }

  conversation = await reply(conversation, "Tu es situé où ?");
  assert.equal(conversation.bookingState.pendingQuestion, "address");
  assert.match(lastSeya(conversation), /12 rue de la République/);
  assert.doesNotMatch(lastSeya(conversation), /lun\.|jeu\.|09h00/i);
});

test("aucun créneau le jeudi : fallback, jamais le lundi", async () => {
  const closedThursday = hours().map((item) =>
    item.weekday === 4 ? { ...item, closed: true } : item,
  );
  let conversation = startConversation(
    {
      leadId: "lead-empty",
      centerId: CENTER_ID,
      firstName: "Alix",
      lastName: "Test",
      phone: "0611111111",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation = await reply(conversation, "Jeudi 1er octobre", {
    hours: closedThursday,
  });
  assert.equal(conversation.bookingState.requestedDate, "2026-10-01");
  assert.equal(conversation.proposedSlots.length, 0);
  assert.match(lastSeya(conversation), /pas de disponibilité/i);
  assert.match(lastSeya(conversation), /01\/10|jeudi/i);
  assert.doesNotMatch(lastSeya(conversation), /lun\. 28\/09|09h00, 09h30 ou 10h00/i);
});

test("l’agenda renvoie des lundis pour un jeudi : le serveur bloque", () => {
  const state = applyBookingMessage(emptyBookingState(CENTER_ID), "Jeudi 1er octobre", {
    centerId: CENTER_ID,
    now: NOW,
  });
  assert.equal(state.requestedDate, "2026-10-01");
  const guarded = guardSlots(MONDAY_SLOTS, state, { centerId: CENTER_ID, allowRepeat: true });
  assert.equal(guarded.slots.length, 0);
  assert.equal(guarded.blocked, true);
  assert.match(guarded.fallback, /pas de disponibilité/i);
  assert.doesNotMatch(guarded.fallback, /lun\./i);

  const leakedReply = enforceOutgoingText(
    "Je peux vous proposer lun. 28/09 à 09h00, 09h30 ou 10h00 — lequel vous irait le mieux ?",
    state,
  );
  assert.doesNotMatch(leakedReply, /lun\. 28\/09/i);
  assert.match(leakedReply, /pas de disponibilité/i);
});

test("même si l’IA propose le lundi, Bookea n’envoie pas ces créneaux", () => {
  const conversation = {
    ...startConversation(
      {
        leadId: "lead-ai",
        centerId: CENTER_ID,
        firstName: "Cynthia",
        lastName: "Test",
        phone: "0622222222",
        treatment: "Soin minceur",
      },
      "JFG Clinique Clermont",
      seya,
    ),
    bookingState: applyBookingMessage(emptyBookingState(CENTER_ID), "Jeudi 1er octobre", {
      centerId: CENTER_ID,
      now: NOW,
    }),
  };
  const result = applyAiDecision(
    conversation,
    "Jeudi 1er octobre",
    seya,
    MONDAY_SLOTS,
    {
      reply: "Je peux vous proposer lun. 28/09 à 09h00, 09h30 ou 10h00",
      action: "propose_slots",
      need: "Soin minceur",
      zone: "ventre",
      delay: "",
      availability: "jeudi",
      slotIndex: null,
    },
    {
      centerId: CENTER_ID,
      now: NOW,
      bookingState: conversation.bookingState,
    },
  );
  assert.equal(result.conversation.proposedSlots.length, 0);
  assert.doesNotMatch(lastSeya(result.conversation), /lun\. 28\/09/i);
  assert.match(lastSeya(result.conversation), /pas de disponibilité/i);
});

test("gpt-4o peut reformuler, mais un lundi fuité est jeté au profit du brouillon Bookea", () => {
  const state = applyBookingMessage(emptyBookingState(CENTER_ID), "Jeudi 1er octobre", {
    centerId: CENTER_ID,
    now: NOW,
  });
  const draft = "Je peux vous proposer jeu. 01/10 à 09h00 ou 09h30.";
  assert.equal(
    pickSafeReply(draft, "Je peux aussi lundi 28/09 à 09h00 si vous préférez.", state),
    draft,
  );
  assert.match(
    pickSafeReply(draft, "Je vous propose jeu. 01/10 à 09h00, ça vous irait ?", state),
    /jeu\. 01\/10 à 09h00/i,
  );
  assert.equal(
    pickSafeReply(
      "Oui, on peut regarder un rendez-vous. Quel jour vous irait le mieux ?",
      "D’accord, dans ce cas je reviendrai vers vous.",
      state,
    ),
    "Oui, on peut regarder un rendez-vous. Quel jour vous irait le mieux ?",
  );
  assert.equal(
    pickSafeReply(
      "Le lun. 28/09 je peux vous proposer 09h00, 09h30 ou 10h00 — lequel vous irait le mieux ?",
      "Je vous prie, Audreey. Je suis ici pour vous aider. Écrivez-moi quand vous souhaitez reprendre la conversation pour fixer un rendez-vous.",
      emptyBookingState(CENTER_ID),
    ),
    "Le lun. 28/09 je peux vous proposer 09h00, 09h30 ou 10h00 — lequel vous irait le mieux ?",
  );
  assert.equal(
    pickSafeReply(
      "Parfait, je vérifie le créneau dont nous avions parlé et je reviens vers vous tout de suite 😊",
      "Je suis ravie que cela vous convienne ! Je reste disponible si vous avez d'autres questions ou si vous souhaitez reprendre contact pour un rendez-vous.",
      emptyBookingState(CENTER_ID),
    ),
    "Parfait, je vérifie le créneau dont nous avions parlé et je reviens vers vous tout de suite 😊",
  );
});

test("la reformulation ne recolle pas le dernier message Seya", () => {
  const state = emptyBookingState(CENTER_ID);
  const previous = "Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?";
  const draft = "Je peux vous proposer jeu. 01/10 à 14h00, 14h30 ou 15h00 — lequel vous irait le mieux ?";
  const conversation = {
    messages: [
      { author: "seya", text: previous },
      { author: "lead", text: "fin de semaine" },
      { author: "seya", text: draft },
    ],
  };
  assert.equal(
    pickSafeReply(draft, previous, state, conversation),
    draft,
  );
});

test("suggestAvailableSlots sans filtre propose encore le lundi : le garde-fou reste obligatoire", () => {
  const unfiltered = suggestAvailableSlots([], hours(), { count: 3, days: 7, now: NOW });
  assert.equal(unfiltered[0]?.date, "2026-09-28");
  const state = applyBookingMessage(emptyBookingState(CENTER_ID), "Jeudi", {
    centerId: CENTER_ID,
    now: NOW,
  });
  const guarded = guardSlots(unfiltered, state);
  assert.equal(guarded.blocked, true);
  assert.equal(guarded.slots.length, 0);
  assert.doesNotMatch(guarded.fallback, /lun\./);
});
