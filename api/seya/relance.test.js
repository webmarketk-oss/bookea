const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { relanceCopy } = require("./agent");
const { pickRelanceRound, shouldSkipRelance } = require("./relance");

const NOW = new Date("2026-09-28T18:00:00Z");

function hoursAgo(hours) {
  return new Date(NOW.getTime() - hours * 3600000).toISOString();
}

function conversation(overrides = {}) {
  return {
    leadId: "1",
    firstName: "Léa",
    phone: "0612345678",
    treatment: "Soin minceur",
    offerLabel: "votre bilan minceur",
    status: "En cours",
    qualification: { need: "Soin minceur", zone: "ventre" },
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa, c’est Seya.", at: hoursAgo(20) },
    ],
    relanceCount: 0,
    lastRelanceAt: null,
    ...overrides,
  };
}

test("relance 1 : 15 h après le dernier message, pas avant", () => {
  const early = conversation({
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(10) },
    ],
  });
  assert.equal(pickRelanceRound(early, NOW), 0);

  const due = conversation({
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(16) },
    ],
  });
  assert.equal(pickRelanceRound(due, NOW), 1);
});

test("relance 2 : 24 h après la première, uniquement dans cette fenêtre", () => {
  const waiting = conversation({
    relanceCount: 1,
    lastRelanceAt: hoursAgo(10),
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(40) },
      { id: "m2", author: "seya", text: "Je reviens vers vous", at: hoursAgo(10) },
    ],
  });
  assert.equal(pickRelanceRound(waiting, NOW), 0);

  const due = {
    ...waiting,
    lastRelanceAt: hoursAgo(25),
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(40) },
      {
        id: "m2b",
        author: "seya",
        text: "Je reviens vers vous pour un horaire ?",
        at: hoursAgo(25),
      },
    ],
  };
  assert.equal(pickRelanceRound(due, NOW), 2);

  const missed = {
    ...waiting,
    lastRelanceAt: hoursAgo(48),
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(80) },
      { id: "m2", author: "seya", text: "Je reviens vers vous", at: hoursAgo(48) },
    ],
  };
  assert.equal(pickRelanceRound(missed, NOW), 0);
});

test("relance 3 : à 5 jours, puis plus rien hors 15 h / 24 h / 5 j", () => {
  const tooEarly = conversation({
    relanceCount: 2,
    lastRelanceAt: hoursAgo(40),
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(80) }],
  });
  assert.equal(pickRelanceRound(tooEarly, NOW), 0);

  const dayFive = conversation({
    relanceCount: 2,
    lastRelanceAt: hoursAgo(80),
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(125) }],
  });
  assert.equal(pickRelanceRound(dayFive, NOW), 3);

  const tooLate = conversation({
    relanceCount: 2,
    lastRelanceAt: hoursAgo(80),
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(200) }],
  });
  assert.equal(pickRelanceRound(tooLate, NOW), 0);

  const noExtra = conversation({
    relanceCount: 3,
    lastRelanceAt: hoursAgo(10),
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(200) }],
  });
  assert.equal(pickRelanceRound(noExtra, NOW), 0);
});

test("pas de relance 15 h si on a dépassé la fenêtre", () => {
  const late = conversation({
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(40) }],
  });
  assert.equal(pickRelanceRound(late, NOW), 0);
});

test("une réponse du lead remet le compteur à zéro", () => {
  const item = conversation({
    relanceCount: 1,
    lastRelanceAt: hoursAgo(30),
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(40) },
      { id: "m2", author: "seya", text: "Je reviens vers vous", at: hoursAgo(30) },
      { id: "m3", author: "lead", text: "Je réfléchis encore", at: hoursAgo(16) },
    ],
  });
  assert.equal(pickRelanceRound(item, NOW), 1);
});

test("pas de relance si stop, refus ou RDV confirmé", () => {
  assert.equal(
    shouldSkipRelance(
      conversation({
        messages: [{ id: "m1", author: "lead", text: "stop", at: hoursAgo(20) }],
      }),
    ),
    true,
  );
  assert.equal(shouldSkipRelance(conversation({ status: "RDV confirmé" })), true);
  assert.equal(shouldSkipRelance(conversation({ status: "Pas intéressé" })), true);
  assert.equal(pickRelanceRound(conversation({ status: "RDV pris" }), NOW), 0);
  assert.equal(
    shouldSkipRelance(
      conversation({
        status: "En cours",
        bookedSlot: { date: "2026-10-05", time: "17:30", label: "dim. 17h30" },
      }),
    ),
    true,
  );
  assert.equal(
    pickRelanceRound(
      conversation({
        status: "En cours",
        bookingState: { appointmentStatus: "confirmed" },
        messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(16) }],
      }),
      NOW,
    ),
    0,
  );
});

test("pas de deuxième relance identique, ni avant 20 h", () => {
  const copy =
    "Bonjour Léa, je reviens vers vous pour Soin minceur chez JFG 😊 L’horaire vu ensemble vous convient toujours, ou je regarde autre chose ?";
  const doubled = conversation({
    relanceCount: 1,
    lastRelanceAt: hoursAgo(9),
    proposedSlots: [{ date: "2026-10-08", time: "09:00", label: "jeu. 08/10 à 09h00" }],
    messages: [
      { id: "m1", author: "seya", text: copy, at: hoursAgo(9) },
      { id: "m2", author: "seya", text: copy, at: hoursAgo(1) },
    ],
  });
  assert.equal(shouldSkipRelance(doubled), true);
  assert.equal(pickRelanceRound(doubled, NOW), 0);

  const tooSoon = conversation({
    relanceCount: 1,
    lastRelanceAt: hoursAgo(9),
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(40) },
      { id: "m2", author: "seya", text: "Je reviens vers vous pour un horaire ?", at: hoursAgo(9) },
    ],
  });
  assert.equal(pickRelanceRound(tooSoon, NOW), 0);
});

test("le texte de relance s’adapte et ne recopie pas un message déjà envoyé", () => {
  const first = relanceCopy(
    conversation(),
    1,
    "JFG Clinique Clermont",
  );
  assert.match(first, /Léa/);
  assert.match(first, /Clermont/);
  assert.match(first, /rendez-vous|créneau|horaire/i);
  assert.doesNotMatch(first, /Je ne veux pas vous relancer/);
  assert.doesNotMatch(first, /pour Soin minceur chez/i);
  assert.doesNotMatch(first, /😊/);

  const already = conversation({
    messages: [
      {
        id: "m1",
        author: "seya",
        text: first,
        at: hoursAgo(20),
      },
    ],
  });
  const secondTry = relanceCopy(already, 1, "JFG Clinique Clermont");
  assert.notEqual(secondTry, first);

  const mid = relanceCopy(conversation(), 2, "JFG Clinique Clermont");
  assert.match(mid, /rendez-vous|horaire|créneau/i);
  const last = relanceCopy(conversation(), 3, "JFG Clinique Clermont");
  assert.match(last, /dernière fois|clos le sujet/);
});
