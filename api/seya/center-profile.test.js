const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { generateSeyaReply } = require("./ai");
const {
  applyLeadReply,
  formatCenterProfilePrompt,
  normalizeCenterProfile,
} = require("./agent");

const NOW = new Date("2026-09-30T12:00:00");

function lastSeya(conversation) {
  return (
    [...(conversation.messages || [])]
      .reverse()
      .find((item) => item.author === "seya")?.text || ""
  );
}

const gapProfile = {
  activity: "Institut minceur et épilation à Gap",
  extras:
    "Parking devant l’établissement, bâtiment au 1er étage avec ascenseur.",
  audience: "Femmes et hommes à Gap",
  supportPhone: "04 92 00 00 00",
};

test("une fiche vide n’invente pas JFG Clinic", () => {
  const profile = normalizeCenterProfile(null);
  assert.equal(profile.activity, "");
  assert.equal(formatCenterProfilePrompt(profile), "");
  assert.doesNotMatch(JSON.stringify(profile), /JFG/i);
});

test("la fiche formatée ne parle que du centre saisi", () => {
  const text = formatCenterProfilePrompt(gapProfile);
  assert.match(text, /Institut minceur et épilation à Gap/);
  assert.match(text, /Parking devant/);
  assert.match(text, /04 92 00 00 00/);
  assert.doesNotMatch(text, /JFG|Clermont/i);
});

test("une question parking utilise les infos de CE centre", () => {
  const conversation = {
    id: "lead-gap-park",
    leadId: "lead-gap-park",
    firstName: "Léa",
    lastName: "Test",
    phone: "0612345678",
    treatment: "Soin minceur",
    qualification: { need: "Soin minceur" },
    messages: [],
    status: "En cours",
  };
  const result = applyLeadReply(
    conversation,
    "Il y a un parking ?",
    {
      bookAppointment: true,
      centerProfile: gapProfile,
      treatmentBriefs: [{ name: "Soin minceur", brief: "" }],
    },
    [],
    {
      centerName: "Institut Gap",
      centerAddress: "12 avenue des Alpes, Gap",
      centerId: "center-gap",
      now: NOW,
    },
  );
  assert.match(lastSeya(result.conversation), /Parking devant l’établissement/);
  assert.doesNotMatch(lastSeya(result.conversation), /JFG|Clermont/i);
});

test("Gap ne répond pas avec la fiche Clermont", async () => {
  const conversation = {
    id: "lead-gap-who",
    leadId: "lead-gap-who",
    firstName: "Léa",
    lastName: "Test",
    phone: "0612345678",
    treatment: "Soin minceur",
    qualification: { need: "Soin minceur" },
    messages: [],
    status: "En cours",
    centerId: "center-gap",
  };
  const result = await generateSeyaReply({
    conversation,
    text: "Il y a un parking ?",
    seya: {
      bookAppointment: true,
      centerProfile: gapProfile,
      treatmentBriefs: [{ name: "Soin minceur", brief: "" }],
    },
    appointments: [],
    hours: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
      weekday,
      startTime: "09:00",
      endTime: "19:00",
      closed: weekday === 0,
    })),
    centerName: "Institut Gap",
    centerAddress: "12 avenue des Alpes, Gap",
    centerId: "center-gap",
    now: NOW,
  });
  assert.match(lastSeya(result.conversation), /Parking devant/);
  assert.doesNotMatch(lastSeya(result.conversation), /JFG|Clermont/i);
});
