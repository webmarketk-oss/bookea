const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const {
  classifyHealthMessage,
  markHealthReviewed,
  resolveHealthSheet,
} = require("./health");
const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");
const { shouldSkipRelance } = require("./relance");

const NOW = new Date("2026-09-27T12:00:00");
const ADDRESS = "12 rue de la République, 63000 Clermont-Ferrand";

const cryoSheet = {
  validated: true,
  contraindications: "Pacemaker, grossesse, maladie du froid.",
  precautions: "Venir hydratée, sans crème sur la zone.",
  professionalQuestions: "Traitement en cours, antécédent médical.",
  transferTo: "l’esthéticienne cryolipolyse",
};

const laserSheet = {
  validated: true,
  contraindications: "Grossesse, peau lésée, photosensibilité.",
  precautions: "Pas de soleil 15 jours avant.",
  professionalQuestions: "Médicament photosensibilisant.",
  transferTo: "la praticienne laser",
};

const seya = {
  qualifyOnSignup: true,
  askForAppointment: true,
  bookAppointment: true,
  handoffToHuman: true,
  treatmentBriefs: [
    {
      name: "Cryolipolyse",
      price:
        "Le bilan et la séance découverte sont offerts, c’est gratuit. On y fait une analyse corporelle pour établir un devis personnalisé. Quand seriez-vous disponible ?",
      brief: "Cryo uniquement.",
      health: cryoSheet,
    },
    {
      name: "Épilation définitive",
      price: "",
      brief: "Laser uniquement.",
      health: laserSheet,
    },
    {
      name: "Soin minceur",
      price:
        "Le bilan et la séance découverte sont offerts, c’est gratuit. On y fait une analyse corporelle pour établir un devis personnalisé. Quand seriez-vous disponible ?",
      brief: "Minceur.",
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
  return (
    [...(conversation.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || ""
  );
}

function startCryo() {
  return startConversation(
    {
      leadId: "lead-health",
      centerId: "jfg-clinique-clermont",
      firstName: "Cynthia",
      lastName: "Test",
      phone: "0612345678",
      treatment: "Cryolipolyse",
    },
    "JFG Clinique Clermont",
    seya,
  );
}

async function reply(conversation, text) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: ADDRESS,
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  return result;
}

test("question générale : fiche validée, sans inventer une autre techno", async () => {
  const kind = classifyHealthMessage("Quelles sont les contre-indications ?");
  assert.equal(kind.general, true);
  assert.equal(kind.personal, false);

  const result = await reply(startCryo(), "Quelles sont les contre-indications ?");
  const text = lastSeya(result.conversation);
  assert.match(text, /Pacemaker|grossesse|maladie du froid/i);
  assert.match(text, /hydrat/i);
  assert.doesNotMatch(text, /photosensibilité|praticienne laser/i);
  assert.notEqual(
    result.conversation.healthReview?.status,
    "awaiting_human_health_review",
  );
  assert.equal(result.shouldBook, null);
});

test("question générale sans fiche : pas de liste inventée", async () => {
  const bare = {
    ...seya,
    treatmentBriefs: seya.treatmentBriefs.map((item) =>
      item.name === "Cryolipolyse" ? { ...item, health: undefined } : item,
    ),
  };
  const conversation = startConversation(
    {
      leadId: "lead-empty-sheet",
      centerId: "jfg-clinique-clermont",
      firstName: "Alix",
      lastName: "Test",
      phone: "0699999999",
      treatment: "Cryolipolyse",
    },
    "JFG Clinique Clermont",
    bare,
  );
  const result = await generateSeyaReply({
    conversation,
    text: "Quelles sont les contre-indications ?",
    seya: bare,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: ADDRESS,
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  const text = lastSeya(result.conversation);
  assert.match(text, /pas de liste validée/i);
  assert.doesNotMatch(text, /Pacemaker|photosensibilité/i);
});

test("situation personnelle : transfert, pas de verdict médical", async () => {
  const result = await reply(
    startCryo(),
    "Je prends un traitement, je peux faire la cryo ?",
  );
  const text = lastSeya(result.conversation);
  assert.match(text, /Merci de me l’avoir précisé/);
  assert.match(text, /esthéticienne cryolipolyse|personne qui réalise/);
  assert.match(text, /vous faire rappeler/);
  assert.doesNotMatch(text, /vous pouvez|c’est possible|c’est impossible|contre-indiqué/i);
  assert.equal(
    result.conversation.healthReview.status,
    "awaiting_human_health_review",
  );
  assert.equal(result.conversation.status, "Revue santé");
  assert.equal(result.conversation.healthTask.status, "open");
  assert.match(result.conversation.healthTask.context, /Je prends un traitement/);
  assert.equal(result.shouldBook, null);
  assert.ok(shouldSkipRelance(result.conversation));
});

test("message mixte : prix + santé, date retenue, pas de créneau confirmé", async () => {
  const result = await reply(
    startCryo(),
    "Jeudi 1er octobre, c’est combien, et avec mon problème de santé est-ce possible ?",
  );
  const text = lastSeya(result.conversation);
  assert.match(text, /gratuit|offert/i);
  assert.match(text, /vérifie votre situation/i);
  assert.doesNotMatch(text, /jeu\. 01\/10 à 09h00|vous pouvez faire/i);
  assert.equal(result.conversation.bookingState.requestedDate, "2026-10-01");
  assert.equal(result.conversation.healthReview.status, "awaiting_human_health_review");
  assert.equal(result.conversation.healthReview.kind, "mixed");
  assert.equal(result.shouldBook, null);
  assert.equal((result.conversation.proposedSlots || []).length, 0);
});

test("en attente : questions admin OK, pas de réservation ni relance", async () => {
  const first = await reply(
    startCryo(),
    "J’ai un problème de santé, je peux faire la cryo ?",
  );
  assert.equal(
    first.conversation.healthReview.status,
    "awaiting_human_health_review",
  );
  const admin = await reply(first.conversation, "Tu es situé où ?");
  assert.match(lastSeya(admin.conversation), /12 rue de la République/);
  assert.equal(
    admin.conversation.healthReview.status,
    "awaiting_human_health_review",
  );

  const book = await reply(admin.conversation, "Jeudi 1er octobre à 09h00");
  assert.match(lastSeya(book.conversation), /vérifier votre situation/i);
  assert.equal(book.shouldBook, null);
  assert.ok(shouldSkipRelance(book.conversation));

  const reviewed = markHealthReviewed(book.conversation, "Samantha");
  assert.equal(reviewed.healthReview.status, "reviewed");
  assert.equal(reviewed.healthTask.status, "done");
  assert.notEqual(reviewed.status, "Revue santé");
  assert.equal(shouldSkipRelance(reviewed), false);
});

test("ne jamais réutiliser la fiche d’une autre technologie", () => {
  const resolved = resolveHealthSheet(
    seya,
    { treatment: "Cryolipolyse", qualification: { need: "Cryolipolyse" } },
    "Quelles sont les contre-indications de la cryo ?",
  );
  assert.equal(resolved.name, "Cryolipolyse");
  assert.match(resolved.sheet.contraindications, /maladie du froid/);
  assert.doesNotMatch(resolved.sheet.contraindications, /photosensibilité/);
});
