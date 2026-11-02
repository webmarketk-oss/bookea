/**
 * Fils réels JFG Clinic Sallanches (mission rappel) : message long poli, report saisonnier,
 * retour à une date précise.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");
const { crmUpdateFromLeadMessage } = require("./conversation");

const CENTER = "JFG Clinic Sallanches";
const NOW = new Date("2026-10-31T13:00:00");
const seya = {
  seyaMission: "qualify_callback",
  bookAppointment: false,
  handoffToHuman: true,
  treatmentBriefs: [
    { name: "Soin minceur", brief: "", pricing: { bilan: "offert" } },
    { name: "Soin visage", brief: "", pricing: { bilan: "offert" } },
  ],
};
const hours = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "19:00",
  closed: weekday === 0,
}));

function lastSeya(conversation) {
  return [...conversation.messages].reverse().find((item) => item.author === "seya")?.text || "";
}

async function thread(firstName, treatment, lines) {
  let conversation = startConversation(
    { leadId: `lead-${firstName}`, centerId: "sallanches", firstName, phone: "0611223344", treatment },
    CENTER,
    seya,
  );
  for (const text of lines) {
    const result = await generateSeyaReply({
      conversation,
      text,
      seya,
      appointments: [],
      hours,
      centerName: CENTER,
      centerAddress: "10 rue du Mont-Blanc, 74700 Sallanches",
      centerId: "sallanches",
      now: NOW,
    });
    conversation = result.conversation;
  }
  return conversation;
}

test("Mailliet : un long message qui finit par « merci à bientôt » reçoit une vraie réponse", async () => {
  const text =
    "Bonjour seya.\nJ'aimerais diminuer le petit ventre que je n'arrive pas faire partir malgré le sport et une alimentation équilibrée et la banane niveau fessiers il y a un surplus que je n'aime pas du tout, j'aimerais voir si votre solution en est une pour moi, je suis disponible les mardi jeudi et peut être dispo le vendredi en après-midi car je travail de nuit merci d'avance a bientôt \nMme Mailliet Sandrine";
  const conversation = await thread("Mailliet", "Soin minceur", [text]);
  const reply = lastSeya(conversation);
  assert.notEqual(reply.trim(), "Avec plaisir.");
  assert.match(reply, /ventre/);
  assert.match(reply, /fesses/);
  assert.match(reply, /mardi, jeudi ou vendredi après-midi/);
  assert.match(reply, /rappelle/);
  const note = conversation.teamNotes?.preferences?.[0]?.text || "";
  assert.match(note, /^je suis disponible les mardi jeudi/);
});

test("Marie-ange : « Pas avant le printemps » → relance au printemps, pas la même question", async () => {
  const conversation = await thread("Marie-ange", "Soin visage", [
    "Relachement bas du visage",
    "Pas avant le printemps",
  ]);
  const reply = lastSeya(conversation);
  assert.doesNotMatch(reply, /Souhaitez-vous qu’un expert/);
  assert.match(reply, /au printemps/);
  assert.deepEqual(crmUpdateFromLeadMessage("Pas avant le printemps", NOW), {
    status: "À relancer",
    conversationStatus: "À recontacter",
    reminderDate: "2027-03-20",
  });
});

test("Rioual : « de retour à partir du 9 novembre » → recontact à cette date", async () => {
  const text = "Je suis de retour à partir du 9 novembre pourrions-nous voir ça à se moment là ?";
  const conversation = await thread("Rioual", "Soin minceur", [
    "Bonjour j’aimerais bien amincir la zone du ventre svp",
    text,
  ]);
  assert.match(lastSeya(conversation), /à partir du 9 novembre/);
  assert.equal(crmUpdateFromLeadMessage(text, NOW)?.reminderDate, "2026-11-09");
});

test("« dispo à partir du 9 novembre » : pas une ville, la date part avec la demande de rappel", async () => {
  const conversation = await thread("Date", "Soin minceur", [
    "Le ventre",
    "je suis dispo à partir du 9 novembre",
  ]);
  const reply = lastSeya(conversation);
  assert.doesNotMatch(reply, /Partir est à proximité/i);
  assert.match(reply, /à partir du 9 novembre/);
});

test("centre qui prend les RDV : mardi, jeudi ou vendredi après-midi → créneau un de ces jours", async () => {
  const booking = { ...seya, seyaMission: "book", bookAppointment: true, askForAppointment: true };
  let conversation = startConversation(
    { leadId: "lead-book", centerId: "sallanches", firstName: "Mailliet", phone: "0611223344", treatment: "Soin minceur" },
    CENTER,
    booking,
  );
  const result = await generateSeyaReply({
    conversation,
    text: "J'aimerais diminuer le petit ventre et la banane niveau fessiers, je suis disponible les mardi jeudi et peut être dispo le vendredi en après-midi",
    seya: booking,
    appointments: [],
    hours,
    centerName: CENTER,
    centerAddress: "10 rue du Mont-Blanc, 74700 Sallanches",
    centerId: "sallanches",
    now: NOW,
  });
  conversation = result.conversation;
  const reply = lastSeya(conversation);
  assert.match(reply, /ventre/);
  for (const slot of conversation.proposedSlots) {
    assert.ok([2, 4, 5].includes(new Date(`${slot.date}T12:00:00`).getDay()), slot.date);
    assert.ok(slot.time >= "14:00", slot.time);
  }
  assert.ok(conversation.proposedSlots.length > 0);
});

test("une simple disponibilité datée reste une disponibilité, pas un report", () => {
  assert.equal(crmUpdateFromLeadMessage("je suis dispo à partir du 9 novembre", NOW), null);
  assert.equal(crmUpdateFromLeadMessage("plutôt en début de semaine", NOW), null);
  assert.equal(crmUpdateFromLeadMessage("plutôt l’après-midi", NOW), null);
});
