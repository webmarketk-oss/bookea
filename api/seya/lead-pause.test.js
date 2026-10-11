const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const whatsapp = require("./whatsapp");
const sentWhatsApp = [];
whatsapp.sendSharedWhatsApp = async (phone, text) => {
  sentWhatsApp.push({ phone, text });
  return { sent: true, via: "whatsapp" };
};

const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");
const { activeLeadPause, isPauseRequest } = require("./lead-pause");
const { pickRelanceRound, relanceCenter, shouldSkipRelance } = require("./relance");

const VICHY = "DEPIL TECH VICHY";
const VICHY_ADDRESS = "5 rue Lucas, 03200 Vichy";
const BOOKING_PUSH =
  /disponibilités|êtes disponible|créneau|quel jour|dites-moi un|lequel vous irait|je regarde|début ou fin de semaine|\d{1,2}h\d{2}/i;

const seya = {
  qualifyOnSignup: true,
  askForAppointment: true,
  bookAppointment: true,
  handoffToHuman: true,
  treatmentBriefs: [
    {
      name: "Épilation laser",
      brief: "Réceptionniste.",
      pricing: { bilan: "offert", discovery: "offerte", session: "", package: "", sessionPolicy: "after_bilan" },
    },
  ],
};

function hours() {
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    startTime: "09:00",
    endTime: "19:00",
    closed: weekday === 0,
  }));
}

function lastSeya(conversation) {
  return [...conversation.messages].reverse().find((item) => item.author === "seya")?.text || "";
}

async function say(conversation, text, now = new Date("2026-10-10T10:00:00")) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya,
    appointments: [],
    hours: hours(),
    centerName: VICHY,
    centerAddress: VICHY_ADDRESS,
    centerId: "depil-tech-vichy",
    now,
  });
  assert.equal(result.shouldBook, null);
  return result.conversation;
}

async function emmaUntilClermont() {
  let conversation = startConversation(
    {
      leadId: "emma",
      centerId: "depil-tech-vichy",
      firstName: "Emma",
      lastName: "",
      phone: "0611223344",
      treatment: "Épilation laser",
    },
    VICHY,
    seya,
  );
  conversation = await say(conversation, "Bonjour, c'est pour les jambes");
  conversation = await say(conversation, "Je suis à Clermont-Ferrand");
  return conversation;
}

test("Emma (Dépil Tech Vichy) : la ville d’abord, puis la pause respectée", async () => {
  let conversation = await emmaUntilClermont();
  assert.equal(
    lastSeya(conversation),
    "Notre centre est situé à Vichy 😊 Est-ce que vous souhaitiez un centre à Clermont-Ferrand ?",
  );
  assert.deepEqual(conversation.proposedSlots, []);

  conversation = await say(conversation, "Pour l’instant je souhaite réfléchir de mon côté merci");
  assert.equal(
    lastSeya(conversation),
    "Bien sûr Emma, prenez le temps de réfléchir 😊 Nous restons disponibles si vous avez des questions.",
  );
  assert.equal(conversation.leadPause.reason, "reflexion");
  assert.equal(conversation.bookingState.pendingQuestion, "no_slots");
  assert.doesNotMatch(String(conversation.status), /pas int[eé]ress/i);
  assert.equal(shouldSkipRelance(conversation), true);
});

for (const pause of ["Je reviens vers vous", "Pas pour le moment", "Je vous recontacterai"]) {
  test(`« ${pause} » : pas de dispo demandée, pas de relance, pas de refus définitif`, async () => {
    let conversation = await emmaUntilClermont();
    conversation = await say(conversation, pause);
    assert.doesNotMatch(lastSeya(conversation), BOOKING_PUSH);
    assert.ok(conversation.leadPause, "pause enregistrée");
    assert.doesNotMatch(String(conversation.status), /pas int[eé]ress/i);
    assert.equal(
      pickRelanceRound(conversation, new Date("2026-10-12T10:00:00Z")),
      0,
    );
  });
}

test("après la pause, un simple message ne relance ni les créneaux ni les relances", async () => {
  let conversation = await emmaUntilClermont();
  conversation = await say(conversation, "Pour l’instant je souhaite réfléchir de mon côté merci");
  conversation = await say(conversation, "Merci");
  assert.doesNotMatch(lastSeya(conversation), BOOKING_PUSH);
  conversation = await say(conversation, "Vous êtes ouverts le samedi ?");
  assert.match(lastSeya(conversation), /samedi/i);
  assert.doesNotMatch(lastSeya(conversation), BOOKING_PUSH);
  assert.ok(conversation.leadPause);
  assert.equal(shouldSkipRelance(conversation), true);

  conversation = await say(conversation, "C’est bon j’ai réfléchi, je voudrais un rendez-vous mardi");
  assert.equal(conversation.leadPause, null);
  assert.equal(activeLeadPause(conversation), null);
});

test("une pause avec une question : elle répond à la question, sans pousser le rendez-vous", async () => {
  let conversation = await emmaUntilClermont();
  conversation = await say(conversation, "Je réfléchis encore, c’est combien les jambes ?");
  assert.doesNotMatch(lastSeya(conversation), /dites-moi un|quel jour|lequel vous irait/i);
  assert.ok(conversation.leadPause);
});

test("détection : pause oui, demande de créneau non", () => {
  for (const text of [
    "Pour l’instant je souhaite réfléchir de mon côté merci",
    "Je reviens vers vous",
    "Je vous recontacterai",
    "Pas pour le moment",
    "pas pour l'instant merci",
    "Laissez-moi réfléchir",
  ]) {
    assert.equal(isPauseRequest(text), true, text);
  }
  for (const text of [
    "J’ai réfléchi, je veux un rendez-vous",
    "Je peux venir plus tard dans l’après-midi ?",
    "Stop",
    "Je suis à Clermont-Ferrand",
    "Mardi 14h",
  ]) {
    assert.equal(isPauseRequest(text), false, text);
  }
});

test("conversation déjà en base (sans état pause) : la relance programmée est bloquée", () => {
  const conversation = {
    leadId: "emma",
    firstName: "Emma",
    phone: "0611223344",
    status: "Qualifié",
    bookingState: { pendingQuestion: "offer_slots" },
    relanceCount: 0,
    messages: [
      { id: "1", author: "seya", text: "Bonjour Emma", at: "2026-10-08T09:00:00Z" },
      { id: "2", author: "lead", text: "Je suis à Clermont-Ferrand", at: "2026-10-08T09:05:00Z" },
      { id: "3", author: "seya", text: "Je peux vous proposer jeudi à 10h00", at: "2026-10-08T09:06:00Z" },
      { id: "4", author: "lead", text: "Pour l’instant je souhaite réfléchir de mon côté merci", at: "2026-10-08T09:10:00Z" },
      { id: "5", author: "seya", text: "Quelles sont vos disponibilités ?", at: "2026-10-08T09:11:00Z" },
    ],
  };
  assert.equal(pickRelanceRound(conversation, new Date("2026-10-11T10:00:00Z")), 0);
});

function fakeSupabase(settings, { onSecondRead } = {}) {
  const center = { id: "depil-tech-vichy", name: VICHY, settings };
  let reads = 0;
  const builder = (table) => {
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      gte: () => query,
      lte: () => query,
      neq: () => query,
      not: () => query,
      is: () => query,
      or: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => {
        if (table !== "centers") return { data: null, error: null };
        reads += 1;
        if (reads === 2 && onSecondRead) onSecondRead(center);
        return { data: structuredClone({ settings: center.settings }), error: null };
      },
      update: (values) => ({
        eq: async () => {
          if (table === "centers" && values.settings) center.settings = structuredClone(values.settings);
          return { error: null };
        },
        in: async () => ({ error: null }),
      }),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return query;
  };
  return { center, from: builder };
}

test("relance déjà due : bloquée si la pause arrive juste avant l’envoi", async () => {
  sentWhatsApp.length = 0;
  const due = {
    leadId: "emma",
    centerId: "depil-tech-vichy",
    firstName: "Emma",
    phone: "0611223344",
    status: "Qualifié",
    relanceCount: 0,
    messages: [
      { id: "1", author: "seya", text: "Bonjour Emma, c’est Seya.", at: "2026-10-08T09:00:00Z" },
      { id: "2", author: "lead", text: "C’est pour les jambes", at: "2026-10-08T09:05:00Z" },
      { id: "3", author: "seya", text: "Vous êtes à quelle distance de Vichy ?", at: "2026-10-08T09:06:00Z" },
    ],
  };
  const now = new Date("2026-10-10T10:00:00Z");
  assert.equal(pickRelanceRound(due, now), 1, "la relance est bien programmée au départ");

  const supabase = fakeSupabase(
    { seya: { relanceEnabled: true, conversations: [due] } },
    {
      onSecondRead(center) {
        const [conversation] = center.settings.seya.conversations;
        conversation.messages.push({
          id: "4",
          author: "lead",
          text: "Pour l’instant je souhaite réfléchir de mon côté merci",
          at: "2026-10-10T09:59:00Z",
        });
      },
    },
  );
  const sent = await relanceCenter(supabase, supabase.center, now);
  assert.deepEqual(sent, []);
  assert.equal(sentWhatsApp.length, 0);
});

test("pause déjà en base : aucune relance envoyée, l’état pause est enregistré sans message", async () => {
  sentWhatsApp.length = 0;
  const paused = {
    leadId: "emma",
    centerId: "depil-tech-vichy",
    firstName: "Emma",
    phone: "0611223344",
    status: "Qualifié",
    relanceCount: 1,
    lastRelanceAt: "2026-10-09T09:00:00Z",
    bookingState: { pendingQuestion: "offer_slots" },
    messages: [
      { id: "1", author: "seya", text: "Bonjour Emma", at: "2026-10-01T09:00:00Z" },
      { id: "2", author: "lead", text: "Pour l’instant je souhaite réfléchir de mon côté merci", at: "2026-10-01T09:10:00Z" },
      { id: "3", author: "seya", text: "Quelles sont vos disponibilités ?", at: "2026-10-01T09:11:00Z" },
      { id: "4", author: "seya", text: "Bonjour Emma, petit message de suivi", at: "2026-10-09T09:00:00Z" },
    ],
  };
  const supabase = fakeSupabase({ seya: { relanceEnabled: true, conversations: [paused] } });
  const sent = await relanceCenter(supabase, supabase.center, new Date("2026-10-20T10:00:00Z"));
  assert.deepEqual(sent, []);
  assert.equal(sentWhatsApp.length, 0);
  const [saved] = supabase.center.settings.seya.conversations;
  assert.equal(saved.leadPause.reason, "reflexion");
  assert.equal(saved.bookingState.pendingQuestion, "no_slots");
  assert.equal(saved.messages.length, 4);
});

test("message en attente : une réponse qui pousse le RDV est retenue si la pause arrive entre-temps", () => {
  const answered = { messages: [{ author: "lead", text: "Je suis à Clermont-Ferrand" }] };
  const fresh = {
    messages: [
      ...answered.messages,
      { author: "lead", text: "Pour l’instant je souhaite réfléchir de mon côté merci" },
    ],
  };
  const held = whatsapp.holdOutgoingAfterPause(fresh, answered, [
    "C’est noté. Dites-moi un ou deux jours où vous êtes disponible, je regarde un créneau.",
  ]);
  assert.deepEqual(held, ["C’est noté."]);
  const untouched = ["Je peux vous proposer jeudi à 10h00."];
  assert.equal(whatsapp.holdOutgoingAfterPause(answered, answered, untouched), untouched);
});

test("autre centre, autre axe (JFG Clermont, minceur) : même ville = pas de question, pause respectée", async () => {
  const minceur = {
    ...seya,
    treatmentBriefs: [
      {
        name: "Soin minceur",
        brief: "Réceptionniste.",
        pricing: { bilan: "offert", discovery: "offerte", session: "", package: "", sessionPolicy: "after_bilan" },
      },
    ],
  };
  const replyAt = async (conversation, text) =>
    (
      await generateSeyaReply({
        conversation,
        text,
        seya: minceur,
        appointments: [],
        hours: hours(),
        centerName: "JFG Clinique Clermont",
        centerAddress: "12 rue de la République, 63000 Clermont-Ferrand",
        centerId: "jfg-clinique-clermont",
        now: new Date("2026-10-10T10:00:00"),
      })
    ).conversation;
  let conversation = startConversation(
    { leadId: "lea", centerId: "jfg-clinique-clermont", firstName: "Léa", lastName: "", phone: "0611223399", treatment: "Soin minceur" },
    "JFG Clinique Clermont",
    minceur,
  );
  conversation = await replyAt(conversation, "Je veux mincir du ventre");
  conversation = await replyAt(conversation, "Je suis à Clermont-Ferrand");
  assert.doesNotMatch(lastSeya(conversation), /souhaitiez un centre/i);
  assert.doesNotMatch(lastSeya(conversation), /vichy|laser|épilation/i);
  conversation = await replyAt(conversation, "Pas pour le moment");
  assert.equal(
    lastSeya(conversation),
    "Bien sûr Léa, prenez votre temps 😊 Nous restons disponibles si vous avez des questions.",
  );
  assert.equal(shouldSkipRelance(conversation), true);
});
