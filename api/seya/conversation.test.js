const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.OPENAI_API_KEY;

const { generateSeyaReply } = require("./ai");
const { startConversation } = require("./agent");

const NOW = new Date("2026-09-27T12:00:00");
const SLOT_PUSH =
  /jeu\.|lun\.|09h00|lequel vous irait|début ou fin de semaine|je regarde le planning|quand seriez-vous disponible/i;

const seya = {
  qualifyOnSignup: true,
  askForAppointment: true,
  bookAppointment: true,
  handoffToHuman: true,
  treatmentBriefs: [
    {
      name: "Soin minceur",
      brief: "Réceptionniste.",
      pricing: {
        bilan: "offert",
        discovery: "offerte",
        session: "",
        package: "",
        sessionPolicy: "after_bilan",
      },
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

async function reply(conversation, text) {
  const result = await generateSeyaReply({
    conversation,
    text,
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "12 rue de la République, 63000 Clermont-Ferrand",
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  return result.conversation;
}

test("20 questions imprévues : répondre à chacune sans ramener aux créneaux", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-20",
      centerId: "jfg-clinique-clermont",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "",
    },
    "JFG Clinique Clermont",
    seya,
  );

  const unexpected = [
    ["Bonjour perdre du poids sur le ventre", /ventre|minceur|noté/i],
    ["Tu es une IA ?", /assistante virtuelle/i],
    ["Le bilan est-il gratuit ?", /bilan.*offert|offert/i],
    [
      "Si je veux continuer ensuite, les séances coûtent combien ?",
      /séances après la découverte|prix fiable|fourchette/i,
    ],
    ["Pourquoi tu répètes la même chose ?", /vous avez raison/i],
    ["Tu es situé où ?", /12 rue de la République/i],
    ["Ça dure combien de temps ?", /30 à 45|minutes/i],
    ["Est-ce que ça fait mal ?", /indolore/i],
    ["Quels résultats on peut attendre ?", /résultats|protocole/i],
    ["Je réfléchis, je ne réserve pas maintenant", /temps|d’accord|pas.*rendez-vous/i],
    ["Merci", /plaisir|disponible|très bien/i],
    ["Vous prenez la CB ?", /règlement|paiement|centre/i],
    ["Je peux venir avec ma copine ?", /accompagn/i],
    ["C’est pour un homme aussi ?", /hommes/i],
    ["Vous êtes ouverts le samedi ?", /samedi/i],
    ["Il faut s’épiler avant ?", /bilan|consignes/i],
    ["C’est adapté si j’allaite ?", /allaitement|équipe|vérifi/i],
    ["Arrête de me proposer des horaires", /rendez-vous|temps|d’accord/i],
  ];

  for (const [text, expected] of unexpected) {
    conversation = await reply(conversation, text);
    const answer = lastSeya(conversation);
    assert.match(answer, expected, `« ${text} » → ${answer}`);
    assert.doesNotMatch(answer, SLOT_PUSH, `créneaux forcés après « ${text} » : ${answer}`);
    assert.equal((conversation.proposedSlots || []).length, 0, `slots après « ${text} »`);
  }

  conversation = await reply(conversation, "Jeudi");
  assert.match(lastSeya(conversation), /jeu\.|jeudi|01\/10/i);
  assert.doesNotMatch(lastSeya(conversation), /lun\./i);

  conversation = await reply(conversation, "Je me suis trompée, je voulais le vendredi");
  assert.match(lastSeya(conversation), /ven\.|vendredi/i);
  assert.doesNotMatch(lastSeya(conversation), /lun\./i);
});

test("ne plus dire « je m’en souviens » : zone, créneaux, adresse, diabète", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-catastrophe",
      centerId: "jfg-clinique-clermont",
      firstName: "Alex",
      lastName: "Test",
      phone: "0611223344",
      treatment: "",
    },
    "JFG Clinique Clermont",
    seya,
  );

  conversation = await reply(conversation, "Je veux mincir des cuisses");
  assert.match(lastSeya(conversation), /cuisses/i);
  assert.doesNotMatch(lastSeya(conversation), /je m’en souviens|reste sur ce que/i);

  conversation = await reply(conversation, "Alors tu proposes quoi");
  assert.match(lastSeya(conversation), /09h00|10h00|lun\.|mar\./i);
  assert.doesNotMatch(lastSeya(conversation), /je m’en souviens|reste sur ce que/i);

  const firstSlots = lastSeya(conversation);
  conversation = await reply(conversation, "Change de jour");
  assert.doesNotMatch(lastSeya(conversation), /reste sur ce que/i);
  if (/lun\. 28\/09/.test(firstSlots)) {
    assert.doesNotMatch(lastSeya(conversation), /lun\. 28\/09/);
  }

  conversation = await reply(conversation, "Tu es situé où ?");
  assert.match(lastSeya(conversation), /12 rue de la République/i);
  assert.doesNotMatch(lastSeya(conversation), /09h00|lun\./i);

  conversation = await reply(conversation, "J’ai du diabète ça pose pas de problème");
  assert.match(lastSeya(conversation), /équipe|vérifi|transmet/i);
  assert.doesNotMatch(lastSeya(conversation), /noté pour le ventre|je m’en souviens/i);

  conversation = await reply(conversation, "C’est quoi le rapport");
  assert.match(lastSeya(conversation), /équipe|vérifi|transmet|à côté/i);
  assert.doesNotMatch(lastSeya(conversation), /reste sur ce que vous m’avez déjà dit/i);
});

test("je reviendrai : plus de créneaux ni « noté pour le ventre »", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-harcelement",
      centerId: "jfg-clinique-clermont",
      firstName: "Alex",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );

  conversation = await reply(conversation, "Je veux mincir des cuisses");
  conversation = await reply(conversation, "Alors tu proposes quoi");
  assert.match(lastSeya(conversation), /09h00|lun\.|mar\./i);

  conversation = await reply(conversation, "Je reviendrai vers toi");
  assert.match(lastSeya(conversation), /temps|disponible|d’accord|reprendre/i);
  assert.doesNotMatch(lastSeya(conversation), /09h00|lun\.|noté pour le ventre/i);

  conversation = await reply(conversation, "ok");
  assert.doesNotMatch(lastSeya(conversation), /09h00|lun\.|bloque|confirm/i);
  assert.doesNotMatch(lastSeya(conversation), /noté pour le ventre/i);
});
