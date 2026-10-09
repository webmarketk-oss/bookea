const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const {
  applyBookingMessage,
  dbStatusWhenSlotPositioned,
  emptyBookingState,
  enforceOutgoingText,
  guardSlots,
  parseDateRequest,
} = require("./booking-state");
const { generateSeyaReply, applyAiDecision, pickSafeReply } = require("./ai");
const { startConversation, suggestAvailableSlots, pickSlotsForState } = require("./agent");

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
    now: extras.now || NOW,
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
  assert.equal(
    pickSafeReply(
      "Dites-moi si vous souhaiteriez prendre un rendez-vous pour bénéficier de l’offre.",
      "Souhaitez-vous que je vous propose un rendez-vous, ou préférez-vous en rester là ?",
      emptyBookingState(CENTER_ID),
    ),
    "Dites-moi si vous souhaiteriez prendre un rendez-vous pour bénéficier de l’offre.",
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

test("un RDV de 75 min à 15h bloque 16h, comme à la réservation", () => {
  const { isSlotBusy, pickSlotsForState, BILAN_DURATION_MINUTES } = require("./agent");
  const date = "2026-10-15";
  const appointments = [
    { date, start: "15:00:00", duration: 75, status: "confirmed" },
  ];
  assert.equal(isSlotBusy(appointments, date, "16:00", BILAN_DURATION_MINUTES), true);
  const slots = pickSlotsForState(
    appointments,
    hours(),
    {
      ...emptyBookingState(CENTER_ID),
      requestedDate: date,
      dayPart: "afternoon",
    },
    NOW,
  );
  assert.equal(slots.some((slot) => slot.time === "16:00"), false);
});

test("une pause occupe le planning : Seya ne propose pas ce créneau", () => {
  const { isSlotBusy, remainingOfferedSlots } = require("./agent");
  const date = "2026-10-05";
  assert.equal(
    isSlotBusy(
      [{ date, start: "16:00", duration: 60, kind: "Pause", status: "Confirmé" }],
      date,
      "16:00",
    ),
    true,
  );
  const offered = [
    { date, time: "15:00", label: "lun. 05/10 à 15h00" },
    { date, time: "15:30", label: "lun. 05/10 à 15h30" },
    { date, time: "16:00", label: "lun. 05/10 à 16h00" },
  ];
  const remaining = remainingOfferedSlots(offered, [], offered[2]);
  assert.deepEqual(
    remaining.map((slot) => slot.time),
    ["15:00", "15:30"],
  );
});

test("un créneau déjà refusé n’est pas reproposé", () => {
  const { pickSlotsForState } = require("./agent");
  const date = "2026-10-15";
  const slots = pickSlotsForState(
    [],
    hours(),
    {
      ...emptyBookingState(CENTER_ID),
      requestedDate: date,
      dayPart: "afternoon",
      rejectedSlots: [{ date, time: "16:00" }],
    },
    NOW,
  );
  assert.equal(slots.some((slot) => slot.time === "16:00"), false);
  assert.ok(slots.length > 0);
});

test("semaine d’après : cherche à partir du lundi suivant, pas le lendemain", () => {
  const now = new Date("2026-10-06T10:00:00");
  const next = applyBookingMessage(
    {
      ...emptyBookingState(CENTER_ID),
      lastOfferedSlots: [
        { date: "2026-10-13", time: "16:00" },
        { date: "2026-10-14", time: "17:30" },
        { date: "2026-10-15", time: "16:00" },
      ],
      requestedDate: "2026-10-14",
      preferredTimes: ["18:00", "13:00"],
    },
    "Aucun je travaille et la semaine d’après ?",
    { now, centerId: CENTER_ID },
  );
  assert.equal(next.searchFrom, "2026-10-19");
  assert.equal(next.requestedDate, null);

  const guarded = guardSlots(
    [
      { date: "2026-10-15", time: "13:00", label: "jeu. 15/10 à 13h00" },
      { date: "2026-10-19", time: "13:00", label: "lun. 19/10 à 13h00" },
    ],
    next,
  );
  assert.deepEqual(
    guarded.slots.map((slot) => slot.date),
    ["2026-10-19"],
  );
});

test("un créneau Seya à plus de 48h est confirmé, laser comme cryo", () => {
  const when = new Date();
  when.setDate(when.getDate() + 5);
  const date = [
    when.getFullYear(),
    String(when.getMonth() + 1).padStart(2, "0"),
    String(when.getDate()).padStart(2, "0"),
  ].join("-");

  assert.equal(dbStatusWhenSlotPositioned(date, "10:00"), "confirmed");

  const soon = new Date();
  soon.setHours(soon.getHours() + 12);
  const soonDate = [
    soon.getFullYear(),
    String(soon.getMonth() + 1).padStart(2, "0"),
    String(soon.getDate()).padStart(2, "0"),
  ].join("-");
  const soonTime = [
    String(soon.getHours()).padStart(2, "0"),
    String(soon.getMinutes()).padStart(2, "0"),
  ].join(":");

  assert.equal(dbStatusWhenSlotPositioned(soonDate, soonTime), "to_confirm");
});

test("pas ce lundi, jeudi 8 apm : elle lit le jeudi après-midi, pas le lundi", async () => {
  const friday = new Date("2026-10-03T14:00:00");
  const mondaySlots = [
    { date: "2026-10-05", time: "10:30", label: "lun. 05/10 à 10h30" },
    { date: "2026-10-05", time: "11:00", label: "lun. 05/10 à 11h00" },
    { date: "2026-10-05", time: "11:30", label: "lun. 05/10 à 11h30" },
  ];
  const state = applyBookingMessage(
    {
      ...emptyBookingState(CENTER_ID),
      requestedDate: "2026-10-05",
      requestedWeekday: 1,
      lastOfferedSlots: mondaySlots,
      appointmentStatus: "proposed",
    },
    "euh ! navrée pas ce Lundi jeudi 8 apm' c'est possible pr  vous ?",
    { centerId: CENTER_ID, now: friday },
  );

  assert.equal(state.requestedDate, "2026-10-08");
  assert.equal(state.requestedWeekday, 4);
  assert.equal(state.dayPart, "afternoon");
  assert.ok(state.rejectedWeekdays.includes(1));
  assert.ok(state.rejectedDates.includes("2026-10-05"));

  let conversation = startConversation(
    {
      leadId: "lead-apm",
      centerId: CENTER_ID,
      firstName: "Marine",
      lastName: "Test",
      phone: "0612345678",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation = {
    ...conversation,
    proposedSlots: mondaySlots,
    bookingState: {
      ...conversation.bookingState,
      requestedDate: "2026-10-05",
      requestedWeekday: 1,
      lastOfferedSlots: mondaySlots,
      appointmentStatus: "proposed",
    },
    messages: [
      ...conversation.messages,
      {
        author: "seya",
        text: "Pour le lundi 5 octobre, je peux vous proposer un rendez-vous à 10h30, 11h00 ou 11h30. Lequel vous conviendrait le mieux ?",
      },
    ],
  };
  conversation = await reply(
    conversation,
    "euh ! navrée pas ce Lundi jeudi 8 apm' c'est possible pr  vous ?",
    { now: friday },
  );
  assert.doesNotMatch(lastSeya(conversation), /lun\.|lundi|05\/10|10h30|11h00|11h30/i);
  assert.match(lastSeya(conversation), /jeu\.|jeudi|08\/10|14h|15h|16h|17h|18h/i);
  assert.ok(
    conversation.proposedSlots.every((slot) => slot.date === "2026-10-08"),
  );
  assert.ok(
    conversation.proposedSlots.every((slot) => Number(slot.time.slice(0, 2)) >= 14),
  );
});

const OCT9 = new Date("2026-10-09T07:00:00");

function dateRange(from, to) {
  const dates = [];
  let current = from;
  while (current <= to) {
    dates.push(current);
    const next = new Date(`${current}T12:00:00`);
    next.setDate(next.getDate() + 1);
    current = [
      next.getFullYear(),
      String(next.getMonth() + 1).padStart(2, "0"),
      String(next.getDate()).padStart(2, "0"),
    ].join("-");
  }
  return dates;
}

function qualifiedConversation() {
  const conversation = startConversation(
    {
      leadId: "lead-cynthia",
      centerId: CENTER_ID,
      firstName: "Cynthia",
      lastName: "Test",
      phone: "0612345678",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  return {
    ...conversation,
    qualification: {
      ...(conversation.qualification || {}),
      need: "Soin minceur",
      zone: "ventre",
    },
  };
}

test("le 20 et à partir du 20 sont des dates, pas 20 h", () => {
  assert.deepEqual(parseDateRequest("Je veux à partir du 20", OCT9), {
    date: "2026-10-20",
    from: true,
  });
  assert.deepEqual(parseDateRequest("Non je veux le 20", OCT9), {
    date: "2026-10-20",
    from: false,
  });
  assert.deepEqual(parseDateRequest("Le 20 au matin", OCT9), {
    date: "2026-10-20",
    from: false,
  });
  assert.deepEqual(parseDateRequest("le 20 à 18h", OCT9), {
    date: "2026-10-20",
    from: false,
  });

  const fromDate = applyBookingMessage(emptyBookingState(CENTER_ID), "Je veux à partir du 20", {
    centerId: CENTER_ID,
    now: OCT9,
  });
  assert.equal(fromDate.searchFrom, "2026-10-20");
  assert.equal(fromDate.requestedDate, null);
  assert.equal(fromDate.preferredTime, null);
  assert.equal(fromDate.dateFlexible, true);

  const exact = applyBookingMessage(fromDate, "Non je veux le 20", {
    centerId: CENTER_ID,
    now: OCT9,
  });
  assert.equal(exact.requestedDate, "2026-10-20");
  assert.equal(exact.searchFrom, "2026-10-20");
  assert.equal(exact.preferredTime, null);

  const morning = applyBookingMessage(exact, "Le 20 au matin", {
    centerId: CENTER_ID,
    now: OCT9,
  });
  assert.equal(morning.requestedDate, "2026-10-20");
  assert.equal(morning.dayPart, "morning");
  assert.equal(morning.preferredTime, null);

  const atSix = applyBookingMessage(emptyBookingState(CENTER_ID), "le 20 à 18h", {
    centerId: CENTER_ID,
    now: OCT9,
  });
  assert.equal(atSix.requestedDate, "2026-10-20");
  assert.equal(atSix.preferredTime, "18:00");
});

test("date précise disponible : elle propose le 20, pas le 9 octobre", async () => {
  let conversation = qualifiedConversation();
  conversation = await reply(conversation, "Je veux le 20", { now: OCT9 });
  assert.equal(conversation.bookingState.requestedDate, "2026-10-20");
  assert.ok(conversation.proposedSlots.length > 0);
  assert.ok(conversation.proposedSlots.every((slot) => slot.date === "2026-10-20"));
  assert.match(lastSeya(conversation), /20\/10|mar\./i);
  assert.doesNotMatch(lastSeya(conversation), /09\/10|10\/10|12\/10|ven\. 09|sam\. 10/i);
});

test("à partir du 20 : elle cherche à compter du 20, pas avant", async () => {
  let conversation = qualifiedConversation();
  conversation = await reply(conversation, "Je veux à partir du 20", { now: OCT9 });
  assert.equal(conversation.bookingState.searchFrom, "2026-10-20");
  assert.ok(conversation.proposedSlots.length > 0);
  assert.ok(conversation.proposedSlots.every((slot) => slot.date >= "2026-10-20"));
  assert.doesNotMatch(lastSeya(conversation), /09\/10|ven\. 09/i);
});

test("18 h pris le 20 : elle l’explique et propose le prochain 18 h", async () => {
  let conversation = qualifiedConversation();
  conversation = await reply(conversation, "le 20 à 18h", {
    now: OCT9,
    hours: hours().map((item) => ({ ...item, endTime: "20:00" })),
    appointments: [
      { date: "2026-10-20", start: "18:00", duration: 60, status: "confirmed" },
    ],
  });
  assert.ok(conversation.proposedSlots.length > 0);
  assert.ok(conversation.proposedSlots.every((slot) => slot.time === "18:00"));
  assert.ok(conversation.proposedSlots.every((slot) => slot.date > "2026-10-20"));
  assert.match(lastSeya(conversation), /20\/10/);
  assert.match(lastSeya(conversation), /18h/);
  assert.doesNotMatch(lastSeya(conversation), /09\/10|11h00/i);
});

test("18 h indisponible : elle propose le prochain 18 h, pas un autre horaire", () => {
  const slots = pickSlotsForState(
    [{ date: "2026-10-20", start: "18:00", duration: 60, status: "confirmed" }],
    hours().map((item) => ({ ...item, endTime: "20:00" })),
    {
      ...emptyBookingState(CENTER_ID),
      requestedDate: "2026-10-20",
      preferredTime: "18:00",
      preferredTimes: ["18:00"],
    },
    OCT9,
    60,
  );
  assert.ok(slots.length > 0);
  assert.ok(slots.every((slot) => slot.time === "18:00"));
  assert.ok(slots.every((slot) => slot.date > "2026-10-20"));
  assert.equal(slots[0].date, "2026-10-21");
});

test("uniquement le mercredi : elle reste sur les mercredis", () => {
  const state = applyBookingMessage(
    emptyBookingState(CENTER_ID),
    "uniquement le mercredi",
    { centerId: CENTER_ID, now: OCT9 },
  );
  assert.equal(state.requestedWeekday, 3);
  assert.equal(state.strictWeekday, true);
  assert.equal(state.requestedDate, "2026-10-14");

  const slots = pickSlotsForState([], hours(), state, OCT9, 60);
  assert.ok(slots.length > 0);
  assert.ok(slots.every((slot) => new Date(`${slot.date}T12:00:00`).getDay() === 3));
  assert.ok(slots.every((slot) => slot.date === "2026-10-14"));
});

test("uniquement le mercredi à 18 h : mercredi suivant à 18 h si le premier est pris", () => {
  const state = applyBookingMessage(
    emptyBookingState(CENTER_ID),
    "uniquement le mercredi à 18h",
    { centerId: CENTER_ID, now: OCT9 },
  );
  assert.equal(state.requestedWeekday, 3);
  assert.equal(state.preferredTime, "18:00");
  assert.equal(state.strictWeekday, true);

  const slots = pickSlotsForState(
    [{ date: "2026-10-14", start: "18:00", duration: 60, status: "confirmed" }],
    hours().map((item) => ({ ...item, endTime: "20:00" })),
    state,
    OCT9,
    60,
  );
  assert.ok(slots.length > 0);
  assert.ok(slots.every((slot) => slot.time === "18:00"));
  assert.ok(slots.every((slot) => new Date(`${slot.date}T12:00:00`).getDay() === 3));
  assert.equal(slots[0].date, "2026-10-21");
});

test("créneau refusé : il n’est jamais reproposé, même plus loin", () => {
  const refused = { date: "2026-10-20", time: "11:00" };
  const slots = pickSlotsForState(
    [],
    hours(),
    {
      ...emptyBookingState(CENTER_ID),
      requestedDate: "2026-10-20",
      dayPart: "morning",
      rejectedSlots: [refused],
    },
    OCT9,
    60,
  );
  assert.equal(slots.some((slot) => slot.date === refused.date && slot.time === refused.time), false);
  assert.ok(slots.length > 0);
  assert.ok(slots.every((slot) => slot.date === "2026-10-20"));
});

test("aucune place sous 15 jours : elle cherche jusqu’à deux mois", () => {
  const blocked = dateRange("2026-10-20", "2026-11-04");
  const slots = pickSlotsForState(
    [],
    hours(),
    {
      ...emptyBookingState(CENTER_ID),
      searchFrom: "2026-10-20",
      dateFlexible: true,
      rejectedDates: blocked,
    },
    OCT9,
    60,
  );
  assert.ok(slots.length > 0);
  assert.ok(slots.every((slot) => slot.date >= "2026-11-05"));
  assert.equal(slots[0].date, "2026-11-05");
});

test("Cynthia : le 20 au matin après un refus des mauvaises dates", async () => {
  let conversation = qualifiedConversation();
  conversation = {
    ...conversation,
    proposedSlots: [
      { date: "2026-10-09", time: "18:00", label: "ven. 09/10 à 18h00" },
    ],
    bookingState: {
      ...conversation.bookingState,
      lastOfferedSlots: [
        { date: "2026-10-09", time: "18:00", label: "ven. 09/10 à 18h00" },
      ],
      preferredTime: "20:00",
      preferredTimes: ["20:00"],
      appointmentStatus: "proposed",
    },
  };
  conversation = await reply(conversation, "Non je veux le 20", { now: OCT9 });
  assert.equal(conversation.bookingState.requestedDate, "2026-10-20");
  assert.ok(
    (conversation.bookingState.rejectedSlots || []).some(
      (slot) => slot.date === "2026-10-09" && slot.time === "18:00",
    ),
  );
  assert.ok(conversation.proposedSlots.every((slot) => slot.date === "2026-10-20"));
  assert.doesNotMatch(lastSeya(conversation), /09\/10|10\/10|12\/10|début ou en fin/i);

  conversation = await reply(conversation, "Le 20 au matin", { now: OCT9 });
  assert.equal(conversation.bookingState.requestedDate, "2026-10-20");
  assert.equal(conversation.bookingState.dayPart, "morning");
  assert.ok(conversation.proposedSlots.every((slot) => slot.date === "2026-10-20"));
  assert.ok(conversation.proposedSlots.every((slot) => Number(slot.time.slice(0, 2)) < 12));
  assert.match(lastSeya(conversation), /20\/10|mar\./i);
});

