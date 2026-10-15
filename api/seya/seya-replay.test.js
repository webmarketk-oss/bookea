const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");
const { applyBookingMessage } = require("./booking-state");
const { centerNotifyCopy } = require("./center-notify");
const { mergeSeyaConversationLists } = require("./conversation-key");
const { isThanks } = require("./conversation");

const AFTERNOON = new Date("2026-10-15T16:45:00");
const hours = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "19:00",
  closed: weekday === 0,
}));

const briefs = [
  {
    name: "Soin minceur",
    brief: "Bilan minceur offert avec analyse corporelle, environ 45 minutes.\nAppareils minceur : cryolipolyse et radiofréquence.",
    pricing: { bilan: "offert", discovery: "offerte", sessionPolicy: "after_bilan" },
  },
  {
    name: "Épilation laser",
    brief: "Épilation au laser diode.\nBilan pilaire offert.",
    pricing: { bilan: "offert" },
  },
  {
    name: "Soin visage",
    brief: "Diagnostic de peau offert.\nAppareil visage : HydraFacial.",
    pricing: { bilan: "offert" },
  },
];

const BOOK = {
  name: "Centre Replay Rdv",
  seya: { seyaMission: "book", bookAppointment: true, handoffToHuman: true, treatmentBriefs: briefs },
};
const CALLBACK = {
  name: "Centre Replay Rappel",
  seya: { seyaMission: "qualify_callback", bookAppointment: false, handoffToHuman: true, treatmentBriefs: briefs },
};

function lastSeya(conversation) {
  return [...(conversation.messages || [])].reverse().find((m) => m.author === "seya")?.text || "";
}

function open(center) {
  return startConversation(
    { leadId: `lead-${center.name}`, centerId: center.name, firstName: "Léa", phone: "0611223344", treatment: "Soin minceur" },
    center.name,
    center.seya,
  );
}

async function say(center, conversation, text, appointments = []) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya: center.seya,
    appointments,
    hours,
    centerName: center.name,
    centerAddress: "12 rue de la République, 69002 Lyon",
    centerId: center.name,
    now: AFTERNOON,
  });
  return { ...result, said: lastSeya(result.conversation) };
}

test("rappel transmis : questions sur d’autres soins sans changer de parcours, prix et durée du minceur", async () => {
  let turn = await say(CALLBACK, open(CALLBACK), "le ventre et les poignées d amour");
  assert.match(turn.said, /le ventre et les poignées d’amour/);
  turn = await say(CALLBACK, turn.conversation, "oui");
  assert.match(turn.said, /demande a été transmise/);

  turn = await say(CALLBACK, turn.conversation, "Je peux pas prendre rdv tout de suite ?");
  assert.match(turn.said, /déjà transmise.*expert ou une experte minceur/);

  turn = await say(CALLBACK, turn.conversation, "J ai vu que vous faisiez l épilation c est de la lumière pulsée ?");
  assert.equal(turn.said, "Non, le centre n’utilise pas la lumière pulsée : il travaille avec le laser diode. Le bilan pilaire est offert.");
  assert.doesNotMatch(turn.said, /créneau|je peux regarder/i);

  turn = await say(CALLBACK, turn.conversation, "Et les soins visage vous faites ?");
  assert.equal(turn.said, "Oui, nous proposons des soins visage, avec l’HydraFacial. Le diagnostic de peau est offert.");

  turn = await say(CALLBACK, turn.conversation, "Tu es pas un humain ?");
  assert.match(turn.said, /assistante virtuelle/);
  assert.match(turn.said, /expert ou une experte du centre peut vous rappeler/);

  turn = await say(CALLBACK, turn.conversation, "Le prix c est quoi ?");
  assert.match(turn.said, /offert/);
  assert.doesNotMatch(turn.said, /visage|peau/i);

  turn = await say(CALLBACK, turn.conversation, "Combien de temps dure le bilan minceur ?");
  assert.equal(turn.said, "Le bilan dure environ 45 minutes.");

  turn = await say(CALLBACK, turn.conversation, "Vous êtes situés où ?");
  assert.equal(turn.conversation.bookingState.pendingQuestion, "callback");
  assert.equal(turn.conversation.status, "À recontacter");
});

test("rappel : « c’est quoi le bilan ? » reçoit la fiche du centre, l’hésitation n’est pas relancée", async () => {
  let turn = await say(CALLBACK, open(CALLBACK), "perdre 5 kilos");
  turn = await say(CALLBACK, turn.conversation, "c’est quoi le bilan exactement ?");
  assert.match(turn.said, /analyse corporelle/);
  assert.doesNotMatch(turn.said, /je vous écoute/i);

  turn = await say(CALLBACK, turn.conversation, "hmm je sais pas");
  assert.doesNotMatch(turn.said, /\?/);
  assert.ok(!turn.conversation.teamNotes?.handedOffAt);

  turn = await say(CALLBACK, turn.conversation, "bon ok rappelez-moi, mardi après-midi");
  assert.match(turn.said, /transmise.*mardi 20\/10 après-midi/);

  turn = await say(CALLBACK, turn.conversation, "finalement plutôt jeudi vers 10h");
  assert.match(turn.said, /jeudi 22\/10 vers 10h/);
  assert.doesNotMatch(turn.said, /après-midi/);
  assert.equal(turn.conversation.teamNotes.preferences.at(-1).context, "pour être rappelé(e)");
});

test("« jeudi matin » dit un jeudi après-midi : la semaine suivante, pas un jour passé", () => {
  const state = applyBookingMessage({}, "plutôt jeudi matin", { now: AFTERNOON });
  assert.equal(state.requestedDate, "2026-10-22");
  const later = applyBookingMessage({}, "jeudi en fin de journée", { now: AFTERNOON });
  assert.equal(later.requestedDate, "2026-10-15");
});

test("un seul créneau : « Je vous le réserve ? » puis « oui » réserve", async () => {
  let turn = await say(BOOK, open(BOOK), "le ventre");
  turn = await say(BOOK, turn.conversation, "je vais réfléchir");
  turn = await say(BOOK, turn.conversation, "Bonjour finalement je voudrais un rendez-vous vendredi");
  assert.match(turn.said, /ven\. 16\/10/);
  turn = await say(BOOK, turn.conversation, "à 10h");
  assert.match(turn.said, /ven\. 16\/10 à 10h00 est disponible\. Je vous le réserve \?$/);
  turn = await say(BOOK, turn.conversation, "oui");
  assert.equal(turn.shouldBook?.date, "2026-10-16");
  assert.equal(turn.shouldBook?.time, "10:00");
});

test("RDV confirmé : pas de reprise d’étape, « super merci bonne journée » clôt", async () => {
  const booked = {
    ...open(BOOK),
    status: "RDV confirmé",
    bookedSlot: { date: "2026-10-17", time: "09:00", label: "sam. 17/10 à 09h00" },
    bookingState: { appointmentStatus: "confirmed", pendingQuestion: null, lastOfferedSlots: [] },
  };
  let turn = await say(BOOK, booked, "Je peux venir avec ma fille ?");
  assert.doesNotMatch(turn.said, /Quand seriez-vous disponible/);
  turn = await say(BOOK, turn.conversation, "Super merci bonne journée");
  assert.equal(turn.said, "Avec plaisir, à bientôt.");
  assert.equal(isThanks("Super merci bonne journée", {}), true);
});

test("RDV confirmé puis « je peux pas vendredi, plutôt lundi » : nouveau créneau le lundi, déplacement", async () => {
  const booked = {
    ...open(BOOK),
    status: "RDV confirmé",
    bookedSlot: { date: "2026-10-16", time: "10:00", label: "ven. 16/10 à 10h00" },
    bookingState: { appointmentStatus: "confirmed", pendingQuestion: null, lastOfferedSlots: [] },
  };
  let turn = await say(BOOK, booked, "Ah mince en fait je peux pas vendredi, plutôt lundi ?");
  assert.match(turn.said, /lun\. 19\/10/);
  turn = await say(BOOK, turn.conversation, "le premier");
  assert.equal(turn.shouldBook?.date, "2026-10-19");
});

test("santé en attente : un refus est entendu, sans relancer", async () => {
  let turn = await say(BOOK, open(BOOK), "le ventre");
  turn = await say(BOOK, turn.conversation, "J’ai eu un cancer il y a 2 ans je peux faire vos machines ?");
  assert.equal((turn.said.match(/\?/g) || []).length, 0);
  turn = await say(BOOK, turn.conversation, "Non merci ça ira");
  assert.match(turn.said, /je n’insiste pas/);
});

test("sauvegarde : une étape remise à zéro n’est pas écrasée par l’ancienne", () => {
  const older = {
    leadId: "l1",
    phone: "0611223344",
    messages: [{ author: "lead", text: "a", at: "2026-10-15T10:00:00Z" }],
    bookingState: { pendingQuestion: "no_slots" },
  };
  const newer = {
    ...older,
    messages: [...older.messages, { author: "seya", text: "b", at: "2026-10-15T10:01:00Z" }],
    bookingState: { pendingQuestion: null, lastOfferedSlots: [{ date: "2026-10-16", time: "10:00" }] },
  };
  const merged = (next) => mergeSeyaConversationLists([older], [next])[0];
  assert.equal(merged(newer).bookingState.pendingQuestion, null);
  assert.equal(merged({ ...newer, bookingState: {} }).bookingState.pendingQuestion, "no_slots");
});

test("mails centre : déplacement et préférence ajoutée après transmission", () => {
  const conversation = {
    firstName: "Léa",
    phone: "0611223344",
    treatment: "Soin minceur",
    teamNotes: { handedOffAt: "x", preferences: [{ text: "plutôt jeudi vers 10h", context: "pour être rappelé(e)" }] },
  };
  const moved = centerNotifyCopy({
    kind: "booked",
    centerName: "Centre",
    conversation,
    slot: { label: "lun. 19/10 à 10h00" },
    previousSlot: { label: "ven. 16/10 à 10h00" },
  });
  assert.match(moved.subject, /RDV déplacé/);
  assert.match(moved.text, /Ancien créneau : ven\. 16\/10 à 10h00 \(libéré\)/);
  const update = centerNotifyCopy({ kind: "callback_update", centerName: "Centre", conversation });
  assert.match(update.text, /Nouvelle préférence : « plutôt jeudi vers 10h » \(pour être rappelé\(e\)\)/);
  assert.match(update.text, /Aucun rappel ni rendez-vous n’a été promis/);
});
