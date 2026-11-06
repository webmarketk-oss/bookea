const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");
const { announcesVisitAbsence } = require("./conversation");

const NOW = new Date("2026-11-06T07:40:00");
const hours = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "19:00",
  closed: weekday === 0,
}));

function lastSeya(conversation) {
  return [...(conversation.messages || [])].reverse().find((item) => item.author === "seya")?.text || "";
}

async function say(center, conversation, text) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya: center.seya,
    appointments: [],
    hours,
    centerName: center.name,
    centerAddress: center.address,
    centerId: center.id,
    now: NOW,
  });
  return result;
}

const centers = [
  {
    name: "JFG Clinic Gaillard",
    id: "gaillard",
    address: "58 rue de la Libération, 74240 Gaillard",
    seya: { seyaMission: "qualify_callback", bookAppointment: false, treatmentBriefs: [] },
  },
  {
    name: "JFG Clinic Sallanches",
    id: "sallanches",
    address: "1 place du Centre, 74700 Sallanches",
    seya: { seyaMission: "welcome_relance", bookAppointment: false, handoffToHuman: true, treatmentBriefs: [] },
  },
];

test("maladie et annulation sont une absence, un déplacement de jour ne l’est pas", () => {
  assert.equal(announcesVisitAbsence("Bonjour je suis vraiment désolé je suis malade"), true);
  assert.equal(announcesVisitAbsence("Je souhaite annuler mon rendez-vous"), true);
  assert.equal(announcesVisitAbsence("Je ne pourrai pas venir demain"), true);
  assert.equal(announcesVisitAbsence("Ah mince en fait je peux pas vendredi, plutôt lundi ?"), false);
  assert.equal(announcesVisitAbsence("Est-ce que je peux faire la cryo si je suis malade ?"), false);
});

for (const center of centers) {
  test(`${center.name} : « je suis malade » prévient l’équipe, sans parler de l’échange`, async () => {
    let conversation = startConversation(
      { leadId: `abs-${center.id}`, centerId: center.id, firstName: "Camille", phone: "0611111111", treatment: "Soin minceur" },
      center.name,
      center.seya,
    );
    conversation = {
      ...conversation,
      status: "À recontacter",
      teamNotes: { handedOffAt: "2026-11-02T10:00:00.000Z", family: "minceur", need: "ventre" },
      messages: [
        ...(conversation.messages || []),
        { author: "lead", text: "Vous m’avez pas envoyé la confirmation de notre rendez-vous de demain et l’adresse aussi", at: NOW.toISOString() },
        { author: "seya", text: "Nous sommes au 58 rue de la Libération.", at: NOW.toISOString() },
      ],
    };
    const turn = await say(center, conversation, "Bonjour je suis vraiment désolé je suis malade");
    const reply = lastSeya(turn.conversation);
    assert.match(reply, /ne pourrez pas venir à votre rendez-vous/);
    assert.match(reply, /Je préviens l’équipe/);
    assert.match(reply, /Prenez soin de vous/);
    assert.doesNotMatch(reply, /lors de votre échange|tiendra compte/i);
    assert.equal(turn.conversation.teamNotes.absence.status, "pending");
    assert.match(turn.conversation.teamNotes.absence.text, /malade/);
    assert.equal(turn.via, "rules");
  });
}
