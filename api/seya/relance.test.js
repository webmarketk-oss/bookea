const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { relanceCopy } = require("./agent");
const { isRelanceQuietHours, pickRelanceRound, shouldSkipRelance } = require("./relance");

const NOW = new Date("2026-09-28T10:00:00Z");

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

test("relance 1 : à J+1, pas avant", () => {
  const early = conversation({
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(10) },
    ],
  });
  assert.equal(pickRelanceRound(early, NOW), 0);

  const due = conversation({
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(25) },
    ],
  });
  assert.equal(pickRelanceRound(due, NOW), 1);
});

test("relance 2 : à J+5, pas avant", () => {
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
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(5 * 24 + 2) },
      {
        id: "m2b",
        author: "seya",
        text: "Je reviens vers vous pour un horaire ?",
        at: hoursAgo(25),
      },
    ],
  };
  assert.equal(pickRelanceRound(due, NOW), 2);
});

test("relance 3 : à J+14, puis plus rien après 3 relances", () => {
  const tooEarly = conversation({
    relanceCount: 2,
    lastRelanceAt: hoursAgo(40),
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(80) }],
  });
  assert.equal(pickRelanceRound(tooEarly, NOW), 0);

  const dayFourteen = conversation({
    relanceCount: 2,
    lastRelanceAt: hoursAgo(80),
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(14 * 24 + 2) }],
  });
  assert.equal(pickRelanceRound(dayFourteen, NOW), 3);

  const stillDue = conversation({
    relanceCount: 2,
    lastRelanceAt: hoursAgo(80),
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(20 * 24) }],
  });
  assert.equal(pickRelanceRound(stillDue, NOW), 3);

  const noExtra = conversation({
    relanceCount: 3,
    lastRelanceAt: hoursAgo(10),
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(200) }],
  });
  assert.equal(pickRelanceRound(noExtra, NOW), 0);
});

test("J+ saisi par le centre : une seule relance à J+14", () => {
  const relances = [
    { afterDays: 14, message: "" },
    { afterDays: 21, message: "" },
    { afterDays: 30, message: "" },
  ];
  const early = conversation({
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(10 * 24) }],
  });
  assert.equal(pickRelanceRound(early, NOW, { relances }), 0);

  const due = conversation({
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(14 * 24 + 2) }],
  });
  assert.equal(pickRelanceRound(due, NOW, { relances }), 1);
});

test("pas de relance entre 20 h et 7 h, même si elle est due", () => {
  const due = conversation({
    messages: [{ id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(30) }],
  });
  const midnight = new Date("2026-09-29T00:30:00+02:00");
  const evening = new Date("2026-09-28T20:00:00+02:00");
  const morning = new Date("2026-09-28T06:59:00+02:00");
  const daytime = new Date("2026-09-28T12:00:00+02:00");
  assert.equal(isRelanceQuietHours(midnight), true);
  assert.equal(isRelanceQuietHours(evening), true);
  assert.equal(isRelanceQuietHours(morning), true);
  assert.equal(isRelanceQuietHours(daytime), false);
  assert.equal(pickRelanceRound(due, midnight), 0);
  assert.equal(pickRelanceRound(due, evening), 0);
  assert.equal(pickRelanceRound(due, morning), 0);
  assert.equal(pickRelanceRound(due, daytime), 1);
});

test("une réponse du lead remet le compteur à zéro", () => {
  const item = conversation({
    relanceCount: 1,
    lastRelanceAt: hoursAgo(30),
    messages: [
      { id: "m1", author: "seya", text: "Bonjour Léa", at: hoursAgo(40) },
      { id: "m2", author: "seya", text: "Je reviens vers vous", at: hoursAgo(30) },
      { id: "m3", author: "lead", text: "Je réfléchis encore", at: hoursAgo(25) },
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
  assert.equal(
    shouldSkipRelance(
      conversation({
        status: "Qualifié",
        messages: [
          {
            id: "m1",
            author: "lead",
            text: "Désolée je ne donne pas suite cordialement",
            at: hoursAgo(20),
          },
        ],
      }),
    ),
    true,
  );
  assert.equal(
    pickRelanceRound(
      conversation({
        status: "Qualifié",
        messages: [
          {
            id: "m1",
            author: "seya",
            text: "Bonjour, diagnostic de peau offert.",
            at: hoursAgo(26),
          },
          {
            id: "m2",
            author: "lead",
            text: "Désolée je ne donne pas suite cordialement",
            at: hoursAgo(25),
          },
          {
            id: "m3",
            author: "seya",
            text: "D’accord, je comprends. Je vous souhaite une belle journée.",
            at: hoursAgo(25),
          },
        ],
      }),
      NOW,
    ),
    0,
  );
  assert.equal(shouldSkipRelance(conversation({ status: "RDV confirmé" })), true);
  assert.equal(shouldSkipRelance(conversation({ status: "Pas intéressé" })), true);
  assert.equal(shouldSkipRelance(conversation({ status: "Hors zone" })), true);
  assert.equal(
    shouldSkipRelance(
      conversation({
        status: "Qualifié",
        messages: [
          {
            id: "m1",
            author: "lead",
            text: "j’habite dans le 01, j’ai peur que cela me fasse beaucoup de route",
            at: hoursAgo(20),
          },
        ],
      }),
    ),
    true,
  );
  assert.equal(
    shouldSkipRelance(conversation({ status: "Qualifié" }), {
      crmHold: new Set(["id:1"]),
    }),
    true,
  );
  assert.equal(
    shouldSkipRelance(
      conversation({
        status: "En cours",
        messages: [
          { id: "m1", author: "lead", text: "Plus rien sur la semaine qui arrive", at: hoursAgo(20) },
          { id: "m2", author: "centre", text: "Très bien, prenez le temps. À bientôt !", at: hoursAgo(19) },
        ],
      }),
    ),
    true,
  );
  assert.equal(
    shouldSkipRelance(
      conversation({
        status: "En cours",
        messages: [
          {
            id: "m1",
            author: "lead",
            text: "Plus rien sur la semaine qui arrive",
            at: hoursAgo(20),
          },
        ],
      }),
    ),
    true,
  );
  assert.equal(
    shouldSkipRelance(conversation({ status: "Reviendra vers nous" })),
    true,
  );
  assert.equal(
    shouldSkipRelance(conversation({ status: "En cours" }), {
      crmHold: new Set(["id:1"]),
    }),
    true,
  );
  assert.equal(
    pickRelanceRound(
      conversation({
        status: "En cours",
        phone: "0612345678",
        messages: [{ id: "m1", author: "seya", text: "Bonjour", at: hoursAgo(16) }],
      }),
      NOW,
      { crmHold: new Set(["phone:612345678"]) },
    ),
    0,
  );
  assert.equal(
    shouldSkipRelance(
      conversation({
        status: "En cours",
        messages: [
          {
            id: "m1",
            author: "lead",
            text: "Je pensais que c’était l’institut de Cournon d’Auvergne",
            at: hoursAgo(20),
          },
        ],
      }),
    ),
    true,
  );
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
  assert.equal(
    pickRelanceRound(
      conversation({
        status: "Qualifié",
        messages: [
          {
            id: "m1",
            author: "seya",
            text: "Parfait, votre rendez-vous est confirmé ✅ Lundi 5 octobre à 17h30",
            at: hoursAgo(16),
          },
          { id: "m2", author: "lead", text: "Merci à bientôt", at: hoursAgo(16) },
        ],
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

test("message de relance saisi par le centre", () => {
  const seya = {
    relances: [
      { afterDays: 1, message: "Bonjour {prenom}, on revient vers vous de {centre} pour {offre}." },
      { afterDays: 5, message: "" },
      { afterDays: 14, message: "" },
    ],
  };
  const copy = relanceCopy(conversation(), 1, "JFG Clinique Clermont", seya);
  assert.match(copy, /Bonjour Léa/);
  assert.match(copy, /JFG Clinique Clermont/);
  assert.match(copy, /votre bilan minceur/);
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
  assert.match(first, /je ne veux pas vous relancer inutilement/i);
  assert.match(first, /prendre un rendez-vous pour bénéficier de l’offre/i);
  assert.doesNotMatch(first, /en rester là|préférez-vous en rester/i);
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
  assert.match(mid, /^Léa,/);
  assert.match(mid, /je ne veux pas vous relancer inutilement/i);
  assert.match(mid, /rendez-vous/i);
  assert.match(mid, /votre bilan minceur/i);
  assert.doesNotMatch(mid, /notre offre votre bilan/i);
  assert.doesNotMatch(mid, /en rester là|clos le sujet/);

  const last = relanceCopy(conversation(), 3, "JFG Clinique Clermont");
  assert.match(last, /Bonjour Léa 😊/);
  assert.match(last, /votre bilan minceur/i);
  assert.match(last, /Quel jour seriez-vous disponible/i);
});

test("relance 2 et 3 : offre CRM {offre}, jamais l’intitulé campagne", () => {
  const seya = {
    offerMaps: [
      {
        match: "Soin minceur",
        label: "offre découverte minceur (bilan + séance découverte offerte)",
      },
      {
        match: "lift 4 149-copy",
        label: "diagnostic de votre peau détaillé offert",
      },
    ],
  };
  const paid = conversation({
    firstName: "Samantha",
    campaign: "lift 4 149-copy",
    offerLabel: "",
    treatment: "Soin visage",
    qualification: { need: "Soin visage" },
  });
  const minceur = conversation({
    firstName: "Aurore",
    campaign: "Soin minceur",
    offerLabel: "offre découverte minceur (bilan + séance découverte offerte)",
    treatment: "Soin minceur",
    qualification: { need: "Soin minceur" },
  });
  const firstMinceur = relanceCopy(minceur, 1, "JFG Clinique Clermont", seya);
  assert.match(firstMinceur, /au sujet de notre offre découverte minceur/i);
  assert.doesNotMatch(firstMinceur, /d['’]un offre|au sujet d['’]un offre/i);

  const second = relanceCopy(paid, 2, "JFG Clinique Clermont", seya);
  assert.match(second, /^Samantha,/);
  assert.match(second, /diagnostic de votre peau détaillé offert/i);
  assert.doesNotMatch(second, /lift 4 149-copy/i);

  const third = relanceCopy(paid, 3, "JFG Clinique Clermont", seya);
  assert.match(third, /Bonjour Samantha 😊/);
  assert.match(third, /diagnostic de votre peau détaillé offert/i);
  assert.match(third, /bénéficier/i);
  assert.doesNotMatch(third, /lift 4 149-copy/i);
});

test("relance bloquée après je reviendrai, plus rien, centre et plainte robot", () => {
  assert.equal(
    shouldSkipRelance(
      conversation({
        status: "En cours",
        proposedSlots: [{ date: "2026-10-08", time: "15:00", label: "jeu. 08/10 à 15h00" }],
        messages: [
          {
            id: "m1",
            author: "lead",
            text: "Aucun ce jour pas de souci je reviendrais vers vous à un autre moment",
            at: hoursAgo(30),
          },
          {
            id: "m2",
            author: "seya",
            text: "Dites-moi un jour qui vous arrange, je regarde tout de suite.",
            at: hoursAgo(29),
          },
          {
            id: "m3",
            author: "lead",
            text: "Plus rien sur la semaine qui arrive",
            at: hoursAgo(28),
          },
          {
            id: "m4",
            author: "centre",
            text: "Très bien, prenez le temps. À bientôt !",
            at: hoursAgo(27),
          },
        ],
      }),
    ),
    true,
  );
  assert.equal(
    shouldSkipRelance(
      conversation({
        status: "En cours",
        proposedSlots: [{ date: "2026-10-08", time: "15:00", label: "jeu. 08/10 à 15h00" }],
        messages: [
          {
            id: "m1",
            author: "lead",
            text: "Plus rien sur la semaine qui arrive",
            at: hoursAgo(26),
          },
          {
            id: "m2",
            author: "seya",
            text: "L’horaire évoqué vous convient-il toujours ?",
            at: hoursAgo(20),
          },
          {
            id: "m3",
            author: "lead",
            text: "c'est votre Robot qui beugue ? l'info message de 17h50 a été claire",
            at: hoursAgo(16),
          },
        ],
      }),
    ),
    true,
  );
});

test("relance J+15 : elle relit le fil et reprend le tarif demandé", () => {
  const thread = conversation({
    firstName: "Réseau",
    treatment: "Épilation laser",
    campaign: "offre laser (jusqu’à -40%)",
    offerLabel: "",
    qualification: { need: "Épilation laser", zone: "aisselles" },
    relanceCount: 2,
    lastRelanceAt: hoursAgo(120),
    messages: [
      {
        id: "m1",
        author: "lead",
        text: "Je voudrais savoir le prix pour 6 séances aisselles",
        at: hoursAgo(200),
      },
      {
        id: "m2",
        author: "seya",
        text: "Le bilan pilaire est offert.",
        at: hoursAgo(199),
      },
      {
        id: "m3",
        author: "lead",
        text: "Je voudrais le prix avant",
        at: hoursAgo(198),
      },
      {
        id: "m4",
        author: "seya",
        text: "Je peux vous proposer un premier rendez-vous.",
        at: hoursAgo(120),
      },
    ],
  });
  const copy = relanceCopy(thread, 3, "Dépil Tech Vichy");
  assert.match(copy, /tarif|prix/i);
  assert.match(copy, /épilation|laser/i);
  assert.doesNotMatch(copy, /minceur|en rester là|à bientôt/i);
});
