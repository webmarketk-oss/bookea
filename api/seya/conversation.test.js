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
  assert.equal(conversation.status, "Terminé");

  conversation = await reply(conversation, "ok");
  assert.doesNotMatch(lastSeya(conversation), /09h00|lun\.|bloque|confirm/i);
  assert.doesNotMatch(lastSeya(conversation), /noté pour le ventre/i);
});

test("plus rien cette semaine : CRM reviendra, plus de relance créneaux", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-plus-rien",
      centerId: "jfg-clinique-clermont",
      firstName: "Annouchka",
      lastName: "Barrier",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );

  conversation = await reply(conversation, "C’est pour le ventre");
  conversation = await reply(conversation, "Plus rien sur la semaine qui arrive");
  assert.equal(conversation.status, "Terminé");
  assert.doesNotMatch(lastSeya(conversation), /09h00|lun\.|horaire|créneau/i);
});

test("pas sur place / je vous contacterai : elle n’insiste pas", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-pas-sur-place",
      centerId: "jfg-clinique-clermont",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );

  conversation = await reply(conversation, "C’est pour le ventre");
  conversation = await reply(
    conversation,
    "Je vous contacterai, pour l'instant pas sur place",
  );
  assert.match(lastSeya(conversation), /d’accord, aucun souci|revenir vers nous|belle journée/i);
  assert.doesNotMatch(
    lastSeya(conversation),
    /créneau|creneau|réserve|reserve|sur place|écrivez-moi quand|reprendre|je vous prie|début de semaine|à distance/i,
  );
  assert.equal((conversation.proposedSlots || []).length, 0);

  conversation = await reply(conversation, "Merci d'avance");
  assert.match(lastSeya(conversation), /plaisir|reste|très bien/i);
  assert.doesNotMatch(
    lastSeya(conversation),
    /écrivez-moi quand|reprendre|je vous prie/i,
  );
});

test("9h après des créneaux proposés : elle réserve 09h00, elle ne dit pas qu’il n’y a rien", async () => {
  const { matchProposedSlot } = require("./agent");
  const slots = [
    { date: "2026-10-08", time: "09:00", label: "jeu. 08/10 à 09h00" },
    { date: "2026-10-08", time: "09:30", label: "jeu. 08/10 à 09h30" },
    { date: "2026-10-08", time: "10:00", label: "jeu. 08/10 à 10h00" },
  ];
  assert.equal(matchProposedSlot("9h", slots)?.time, "09:00");

  let conversation = startConversation(
    {
      leadId: "lead-9h",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.proposedSlots = slots;
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    lastOfferedSlots: slots,
    appointmentStatus: "proposed",
    pendingQuestion: null,
  };
  conversation.status = "RDV proposé";
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  conversation.messages.push({
    author: "seya",
    text: "Le jeudi 08/10, je peux vous proposer 09h00, 09h30 ou 10h00. Lequel vous conviendrait le mieux ?",
  });

  const result = await generateSeyaReply({
    conversation,
    text: "9h",
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "12 rue de la République, 63000 Clermont-Ferrand",
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  conversation = result.conversation;
  assert.match(
    lastSeya(conversation),
    /je vérifie le créneau dont nous avions parlé/i,
  );
  assert.doesNotMatch(lastSeya(conversation), /pas de créneau|zone|reprendre contact/i);
  assert.equal(result.shouldBook?.time, "09:00");
  assert.equal(result.shouldBook?.date, "2026-10-08");
});

test("oui merci après « lundi suivant ou une autre journée » : des horaires, pas la zone", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-lundi",
      centerId: "jfg-clinique-clermont",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    requestedWeekday: 1,
    requestedDate: "2026-09-28",
    rejectedDates: ["2026-09-28"],
    lastOfferedSlots: [],
    pendingQuestion: "offer_slots",
  };
  conversation.messages.push(
    { author: "lead", text: "Le lundi après midi" },
    {
      author: "seya",
      text: "Je n’ai pas de disponibilité lundi 28/09 pour ce bilan. Souhaitez-vous que je regarde le lundi suivant ou une autre journée ?",
    },
  );

  conversation = await reply(conversation, "Oui merci");
  assert.doesNotMatch(lastSeya(conversation), /zone souhaitez-vous/i);
  assert.match(lastSeya(conversation), /09h00|10h00|lun\.|mar\.|semaine|jeudi|mercredi/i);
  assert.doesNotMatch(lastSeya(conversation), /reprendre contact|je reste disponible/i);
});

test("bonjour oui toujours après la relance horaire : elle vérifie le créneau", async () => {
  const slots = [
    { date: "2026-10-08", time: "09:00", label: "jeu. 08/10 à 09h00" },
    { date: "2026-10-08", time: "09:30", label: "jeu. 08/10 à 09h30" },
    { date: "2026-10-08", time: "10:00", label: "jeu. 08/10 à 10h00" },
  ];
  let conversation = startConversation(
    {
      leadId: "lead-toujours",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.proposedSlots = slots;
  conversation.status = "RDV proposé";
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    lastOfferedSlots: slots,
    appointmentStatus: "proposed",
  };
  conversation.messages.push({
    author: "seya",
    text: "Bonjour Samantha, je reviens vers vous pour Soin minceur chez JFG Clinique Clermont-Ferrand 😊 L’horaire vu ensemble vous convient toujours, ou je regarde autre chose ?",
  });

  const result = await generateSeyaReply({
    conversation,
    text: "Bonjour oui toujours",
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "12 rue de la République, 63000 Clermont-Ferrand",
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  assert.equal(
    lastSeya(result.conversation),
    "Parfait, je vérifie le créneau dont nous avions parlé et je reviens vers vous tout de suite 😊",
  );
  assert.equal(result.shouldBook?.time, "09:00");
  assert.doesNotMatch(
    lastSeya(result.conversation),
    /je reste disponible|reprendre contact/i,
  );
});

test("Oui après jeudi 16h30 : elle réserve, elle ne reste pas muette", async () => {
  const slots = [
    { date: "2026-10-08", time: "16:30", label: "jeu. 08/10 à 16h30" },
  ];
  let conversation = startConversation(
    {
      leadId: "lead-oui-1630",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.proposedSlots = slots;
  conversation.status = "RDV proposé";
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    lastOfferedSlots: slots,
    appointmentStatus: "proposed",
  };
  conversation.messages.push({
    author: "seya",
    text: "Parfait, je peux vous proposer un rendez-vous le jeudi 08/10 à 16h30. Est-ce que cela vous conviendrait ?",
  });

  const result = await generateSeyaReply({
    conversation,
    text: "Oui",
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "3 rue Eugène Gilbert",
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  assert.equal(result.shouldBook?.time, "16:30");
  assert.equal(result.shouldBook?.date, "2026-10-08");
  assert.match(lastSeya(result.conversation), /je vérifie le créneau/i);
  assert.doesNotMatch(
    lastSeya(result.conversation),
    /ravie|reprendre contact|je reste disponible/i,
  );
});

test("oui merci après proposition de créneau : elle propose des horaires, elle ne clôt pas", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-audreey",
      centerId: "jfg-clinique-clermont",
      firstName: "Audreey",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
      campaign: "Meta Lead Ads",
    },
    "JFG Clinique Clermont",
    seya,
  );

  conversation = await reply(
    conversation,
    "Bonjour Je souhaiterais traiter le ventre et le bas du dos",
  );
  assert.match(lastSeya(conversation), /ventre|dos|créneau|creneau/i);
  assert.doesNotMatch(lastSeya(conversation), /reprendre|écrivez-moi quand/i);

  conversation = await reply(conversation, "Oui, merci");
  const answer = lastSeya(conversation);
  assert.match(answer, /09h00|10h00|lun\.|mar\.|mer\.|jeu\.|ven\.|sam\.|semaine/i);
  assert.doesNotMatch(
    answer,
    /reprendre|écrivez-moi quand|je vous prie|fixer un rendez-vous/i,
  );
  assert.notEqual(conversation.status, "À recontacter");
});

test("demande de rendez-vous : elle reste dans le fil, elle ne clôt pas", async () => {
  const noBook = { ...seya, bookAppointment: false, askForAppointment: true };
  let conversation = startConversation(
    {
      leadId: "lead-rdv",
      centerId: "jfg-clinique-clermont",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    noBook,
  );
  const result = await generateSeyaReply({
    conversation,
    text: "Je veux un rendez-vous",
    seya: noBook,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "12 rue de la République, 63000 Clermont-Ferrand",
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  conversation = result.conversation;
  assert.match(lastSeya(conversation), /semaine|rendez-vous|jour/i);
  assert.doesNotMatch(
    lastSeya(conversation),
    /recontacte|reviendrai|conseillère du centre, elle/i,
  );
  assert.notEqual(conversation.status, "À recontacter");
});

test("le soir elle souhaite une bonne soirée, le jour une belle journée", () => {
  const { willCallBackReply } = require("./conversation");
  assert.match(
    willCallBackReply(new Date("2026-09-27T12:00:00+02:00")),
    /belle journée :\)/,
  );
  assert.match(
    willCallBackReply(new Date("2026-09-27T20:00:00+02:00")),
    /bonne soirée :\)/,
  );
});

test("ok je préfère vous recontacter : elle note, elle n’insiste pas", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-rappel",
      centerId: "jfg-clinique-clermont",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation = await reply(conversation, "C’est pour le ventre");
  conversation = await reply(
    conversation,
    "Ok, je préfère vous recontacter moi-même",
  );
  assert.match(lastSeya(conversation), /d’accord, aucun souci|revenir vers nous|belle journée/i);
  assert.doesNotMatch(
    lastSeya(conversation),
    /09h00|lun\.|début de semaine|quel jour|écrivez-moi quand|à distance/i,
  );
  assert.equal((conversation.proposedSlots || []).length, 0);
});

test("j’ai déjà pris le rdv : elle arrête de proposer des créneaux", async () => {
  const { isAlreadyBookedElsewhere } = require("./conversation");
  assert.equal(
    isAlreadyBookedElsewhere("J'ai pris le rdv à l'instant le 8 octobre"),
    true,
  );
  assert.equal(
    isAlreadyBookedElsewhere("J'ai déjà pris le rdv sur planity"),
    true,
  );
  assert.equal(isAlreadyBookedElsewhere("je veux prendre rdv le 8 octobre"), false);

  let conversation = startConversation(
    {
      leadId: "lead-planity",
      centerId: "jfg-clinique-clermont",
      firstName: "Anastasiia",
      lastName: "Kostiuchenko",
      phone: "33749570454",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation = await reply(conversation, "C’est pour le ventre");
  conversation = await reply(
    conversation,
    "J'ai pris le rdv à l'instant le 8 octobre",
  );
  assert.match(lastSeya(conversation), /déjà pris|c’est noté|à très vite/i);
  assert.doesNotMatch(
    lastSeya(conversation),
    /11h30|12h00|12h30|début de semaine|fin de semaine|lequel/i,
  );
  assert.equal((conversation.proposedSlots || []).length, 0);
  assert.equal(conversation.status, "RDV pris");

  conversation = await reply(conversation, "J'ai déjà pris le rdv sur planity");
  assert.match(lastSeya(conversation), /déjà pris|planity|c’est noté|à très vite/i);
  assert.doesNotMatch(
    lastSeya(conversation),
    /début de semaine|fin de semaine|11h30|lequel/i,
  );
  assert.equal((conversation.proposedSlots || []).length, 0);
});

test("ok merci après un RDV déjà confirmé : elle ne reprend pas le créneau", async () => {
  const slots = [
    { date: "2026-09-29", time: "09:00", label: "mar. 29/09 à 09h00" },
    { date: "2026-09-29", time: "10:30", label: "mar. 29/09 à 10h30" },
  ];
  let conversation = startConversation(
    {
      leadId: "lead-ok-merci",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.proposedSlots = slots;
  conversation.bookedSlot = slots[0];
  conversation.status = "RDV confirmé";
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    lastOfferedSlots: slots,
    appointmentStatus: "confirmed",
  };
  conversation.messages.push({
    author: "seya",
    text: "C’est noté, mar. 29/09 à 09h00 est bien bloqué pour Soin minceur. Vous recevrez la confirmation du centre.",
  });

  const result = await generateSeyaReply({
    conversation,
    text: "Ok merci",
    seya,
    appointments: [
      { date: "2026-09-29", start: "09:00", duration: 75 },
    ],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "3 rue Eugène Gilbert, 63000 Clermont-Ferrand",
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  assert.equal(result.shouldBook, null);
  assert.equal(result.conversation.status, "Terminé");
  assert.doesNotMatch(
    lastSeya(result.conversation),
    /n['’]est plus disponible|zone souhaitez-vous|je peux vous proposer|10h30|11h00|dites-moi un jour/i,
  );
  assert.match(lastSeya(result.conversation), /plaisir|très bien|à bientôt/i);
});

test("merci à bientôt après un RDV confirmé : elle clôture, elle ne redemande pas un jour", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-merci-bientot",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.status = "RDV confirmé";
  conversation.bookedSlot = {
    date: "2026-10-05",
    time: "17:30",
    label: "lun. 05/10 à 17h30",
  };
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    appointmentStatus: "confirmed",
    lastOfferedSlots: [],
  };
  conversation.messages.push(
    {
      author: "seya",
      text: "Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?",
    },
    {
      author: "seya",
      text: "Parfait, votre rendez-vous est confirmé ✅ Lundi 5 octobre à 17h30",
    },
  );
  const result = await generateSeyaReply({
    conversation,
    text: "Merci à bientôt",
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "3 rue Eugène Gilbert",
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  assert.equal(result.shouldBook, null);
  assert.equal(result.conversation.status, "Terminé");
  assert.match(lastSeya(result.conversation), /à bientôt|plaisir/i);
  assert.doesNotMatch(
    lastSeya(result.conversation),
    /dites-moi un jour|je regarde tout de suite|créneau|horaire/i,
  );
});

test("merci à bientôt après le texte de confirmation : elle clôture même sans flag bookedSlot", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-samantha-fil",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.status = "Qualifié";
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    pendingQuestion: "offer_slots",
    lastOfferedSlots: [],
  };
  conversation.messages.push(
    {
      author: "seya",
      text: "Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?",
    },
    {
      author: "seya",
      text: "Parfait, votre rendez-vous est confirmé ✅ Lundi 5 octobre à 17h30 📍 JFG Clinic Clermont-Ferrand, 3 rue Eugène Gilbert Vous recevrez un SMS 48 h avant",
    },
  );
  const result = await generateSeyaReply({
    conversation,
    text: "Merci à bientôt",
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "3 rue Eugène Gilbert",
    centerId: "jfg-clinique-clermont",
    now: NOW,
  });
  assert.equal(result.shouldBook, null);
  assert.equal(result.conversation.status, "Terminé");
  assert.match(lastSeya(result.conversation), /à bientôt|plaisir/i);
  assert.doesNotMatch(
    lastSeya(result.conversation),
    /dites-moi un jour|je regarde tout de suite|créneau|horaire/i,
  );
});

const CONFIRMATION_BRIEF = `Dès qu’un rendez-vous est enregistré et confirmé dans l’agenda, envoie ce message en renseignant le jour, la date et l’heure exacts :
« Parfait, votre rendez-vous est confirmé ✅
📅 [Jour] [date] à [heure]
📍 JFG Clinic Clermont-Ferrand, 3 rue Eugène Gilbert
Vous recevrez un SMS 48 h avant avec un lien pour confirmer ou modifier votre rendez-vous. En cas d’empêchement, merci de nous prévenir.
À très bientôt,
Seya »`;

test("le message de confirmation reprend le modèle des consignes", () => {
  const { confirmedAppointmentReply } = require("./agent");
  const text = confirmedAppointmentReply({
    slot: { date: "2026-09-29", time: "09:00" },
    centerName: "JFG Clinic Clermont-Ferrand",
    centerAddress: "3 rue Eugène Gilbert",
    brief: CONFIRMATION_BRIEF,
  });
  assert.match(text, /Parfait, votre rendez-vous est confirmé/);
  assert.match(text, /Mardi 29\/09 à 09h00/);
  assert.match(text, /JFG Clinic Clermont-Ferrand, 3 rue Eugène Gilbert/);
  assert.match(text, /SMS 48 h avant/);
  assert.doesNotMatch(text, /\[Jour\]|\[date\]|\[heure\]|bien bloqué/);
});

test("le même modèle de consignes prend l’adresse du centre qui parle", () => {
  const { confirmedAppointmentReply } = require("./agent");
  const clermont = confirmedAppointmentReply({
    slot: { date: "2026-09-29", time: "09:00" },
    centerName: "JFG Clinic Clermont-Ferrand",
    centerAddress: "3 rue Eugène Gilbert",
    brief: CONFIRMATION_BRIEF,
  });
  const gap = confirmedAppointmentReply({
    slot: { date: "2026-09-29", time: "09:00" },
    centerName: "JFG Gap",
    centerAddress: "12 avenue des Alpes, 05000 Gap",
    brief: CONFIRMATION_BRIEF,
  });
  const placeholders = confirmedAppointmentReply({
    slot: { date: "2026-09-30", time: "14:30" },
    centerName: "Institut Lyon",
    centerAddress: "8 rue de la République, 69001 Lyon",
    brief: `« Parfait, votre rendez-vous est confirmé ✅
📅 [Jour] [date] à [heure]
📍 [centre], [adresse]
À très bientôt,
Seya »`,
  });
  assert.match(clermont, /JFG Clinic Clermont-Ferrand, 3 rue Eugène Gilbert/);
  assert.doesNotMatch(clermont, /Gap|Lyon/);
  assert.match(gap, /JFG Gap, 12 avenue des Alpes, 05000 Gap/);
  assert.doesNotMatch(gap, /Clermont|Eugène Gilbert/);
  assert.match(placeholders, /Mercredi 30\/09 à 14h30/);
  assert.match(placeholders, /Institut Lyon, 8 rue de la République, 69001 Lyon/);
  assert.doesNotMatch(placeholders, /\[centre\]|\[adresse\]|Clermont/);
});

test("début de semaine après un oui : elle propose des horaires de début de semaine", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-debut",
      centerId: "jfg-clinique-clermont",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation = await reply(conversation, "Je veux un rendez-vous");
  conversation = await reply(conversation, "Début de semaine");
  assert.match(lastSeya(conversation), /lun\.|mar\.|mer\./i);
  assert.doesNotMatch(lastSeya(conversation), /jeu\.|ven\.|sam\./i);
});

test("fin de semaine les après-midi : des créneaux l’après-midi, pas « plus de place »", async () => {
  const now = new Date("2026-09-29T09:07:00");
  let conversation = startConversation(
    {
      leadId: "lead-aprem",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.status = "RDV proposé";
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  conversation.proposedSlots = [
    { date: "2026-09-29", time: "10:30", label: "mar. 29/09 à 10h30" },
    { date: "2026-09-29", time: "11:00", label: "mar. 29/09 à 11h00" },
    { date: "2026-09-29", time: "11:30", label: "mar. 29/09 à 11h30" },
  ];
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    lastOfferedSlots: conversation.proposedSlots,
    appointmentStatus: "proposed",
  };
  conversation.messages.push({
    author: "seya",
    text: "Vous êtes plutôt disponible en début de semaine, ou plutôt en fin de semaine ?",
  });

  const result = await generateSeyaReply({
    conversation,
    text: "Fin de semaine les après midi",
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "3 rue Eugène Gilbert",
    centerId: "jfg-clinique-clermont",
    now,
  });
  const answer = lastSeya(result.conversation);
  assert.doesNotMatch(answer, /plus de place|début de semaine|zone souhaitez/i);
  assert.match(answer, /14h00|14h30|15h00|16h00|17h00/i);
  assert.match(answer, /jeu\.|ven\.|sam\./i);
  assert.doesNotMatch(answer, /09h00|10h00|11h00|12h00|13h00/i);
  for (const slot of result.conversation.proposedSlots || []) {
    const [h] = String(slot.time).split(":").map(Number);
    assert.ok(h >= 14, slot.label);
    const weekday = new Date(`${slot.date}T12:00:00`).getDay();
    assert.ok([4, 5, 6].includes(weekday), slot.label);
  }
});

test("donne d'autre j : elle propose d'autres jours, elle ne redemande pas la moitié de semaine", async () => {
  const now = new Date("2026-09-29T09:07:00");
  let conversation = startConversation(
    {
      leadId: "lead-autre-j",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.status = "RDV proposé";
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  conversation.proposedSlots = [
    { date: "2026-09-29", time: "10:30", label: "mar. 29/09 à 10h30" },
    { date: "2026-09-29", time: "11:00", label: "mar. 29/09 à 11h00" },
    { date: "2026-09-29", time: "11:30", label: "mar. 29/09 à 11h30" },
  ];
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    lastOfferedSlots: conversation.proposedSlots,
    appointmentStatus: "proposed",
  };
  conversation.messages.push({
    author: "seya",
    text: "Ce créneau n’est plus disponible. Le mar. 29/09 je peux vous proposer 10h30, 11h00 ou 11h30 — lequel vous irait le mieux ?",
  });

  const result = await generateSeyaReply({
    conversation,
    text: "Donne d'autre j",
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "3 rue Eugène Gilbert",
    centerId: "jfg-clinique-clermont",
    now,
  });
  const answer = lastSeya(result.conversation);
  assert.doesNotMatch(
    answer,
    /début de semaine|fin de semaine|plus de place|zone souhaitez/i,
  );
  assert.match(answer, /09h00|10h00|mer\.|jeu\.|ven\./i);
  assert.equal(
    (result.conversation.proposedSlots || []).some((slot) => slot.date === "2026-09-29"),
    false,
  );
});

test("oui merci après relance disponibilités : elle cherche des créneaux, elle ne dit pas plus de place", async () => {
  const now = new Date("2026-09-29T10:26:00");
  let conversation = startConversation(
    {
      leadId: "lead-relance-oui",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.status = "RDV proposé";
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  conversation.proposedSlots = [
    { date: "2026-09-29", time: "10:30", label: "mar. 29/09 à 10h30" },
  ];
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    lastOfferedSlots: conversation.proposedSlots,
    weekHalf: "end",
    dayPart: "afternoon",
    appointmentStatus: "proposed",
    pendingQuestion: "offer_slots",
  };
  conversation.messages.push(
    {
      author: "seya",
      text: "Je n’ai plus de place en fin de semaine. Souhaitez-vous plutôt le début de semaine ?",
    },
    {
      author: "seya",
      text: "Bonjour Samantha, je reviens vers vous pour Soin minceur chez JFG Clinic Clermont-ferrand 😊 Vous souhaitez que je regarde les disponibilités pour vous ?",
    },
  );

  const result = await generateSeyaReply({
    conversation,
    text: "oui merci",
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "3 rue Eugène Gilbert",
    centerId: "jfg-clinique-clermont",
    now,
  });
  const answer = lastSeya(result.conversation);
  assert.doesNotMatch(answer, /plus de place|début de semaine|zone souhaitez/i);
  assert.match(answer, /09h00|10h00|14h00|mer\.|jeu\.|ven\./i);
  assert.doesNotMatch(answer, /mar\. 29\/09/i);
});

test("fin de journée après midi : des horaires en fin de journée, pas « aucun créneau »", async () => {
  const now = new Date("2026-09-29T10:32:00");
  let conversation = startConversation(
    {
      leadId: "lead-fin-journee",
      centerId: "jfg-clinique-clermont",
      firstName: "Samantha",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.status = "RDV proposé";
  conversation.qualification = {
    need: "Soin minceur",
    zone: "",
    delay: "",
    availability: "",
  };
  const noon = [
    { date: "2026-10-01", time: "12:00", label: "jeu. 01/10 à 12h00" },
    { date: "2026-10-01", time: "12:30", label: "jeu. 01/10 à 12h30" },
    { date: "2026-10-01", time: "13:00", label: "jeu. 01/10 à 13h00" },
  ];
  conversation.proposedSlots = noon;
  conversation.bookingState = {
    ...(conversation.bookingState || {}),
    lastOfferedSlots: noon,
    weekHalf: "end",
    dayPart: "afternoon",
    appointmentStatus: "proposed",
  };
  conversation.messages.push({
    author: "seya",
    text: "Pour la fin de semaine, je peux vous proposer le jeudi 01/10 à 12h00, 12h30 ou 13h00. Lequel vous conviendrait le mieux ?",
  });

  const result = await generateSeyaReply({
    conversation,
    text: "fin de journée",
    seya,
    appointments: [],
    hours: hours(),
    centerName: "JFG Clinique Clermont",
    centerAddress: "3 rue Eugène Gilbert",
    centerId: "jfg-clinique-clermont",
    now,
  });
  const answer = lastSeya(result.conversation);
  assert.doesNotMatch(answer, /pas de créneau|plus de place|désolée|zone souhaitez/i);
  assert.match(answer, /16h00|16h30|17h00|17h30/i);
  for (const slot of result.conversation.proposedSlots || []) {
    const [h] = String(slot.time).split(":").map(Number);
    assert.ok(h >= 16, slot.label);
  }
});

test("pas te recontacter + proposition après-midi : elle cherche un créneau, elle ne clôt pas", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-collegue",
      centerId: "jfg-clinique-clermont",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation = await reply(conversation, "C’est pour le ventre");
  conversation = await reply(
    conversation,
    "Non je veux pas te recontacter je veux que tu me fasse une proposition pour une après midi",
  );
  const answer = lastSeya(conversation);
  assert.doesNotMatch(
    answer,
    /navrée|gêne occasionnée|écrivez-moi quand|reprendre le rendez-vous|j’arrête ici|pas intéressé/i,
  );
  assert.match(answer, /14h|15h|16h|après-midi|apres-midi|créneau|creneau|jeudi|vendredi|samedi|semaine/i);
});

test("j’ai réfléchi, je veux le prix : elle répond, même après un message de clôture", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-prix-silence",
      centerId: "jfg-clinique-clermont",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation.qualification = {
    need: "Soin minceur",
    zone: "ventre",
    delay: "",
    availability: "",
  };
  conversation.status = "Pas intéressé";
  conversation.messages.push({
    author: "seya",
    text: "Je suis navrée pour la gêne occasionnée. Je reste disponible pour vous aider. Écrivez-moi quand vous souhaitez reprendre le rendez-vous.",
    at: "2026-09-28T12:31:00.000Z",
  });

  conversation = await reply(
    conversation,
    "Bonjour jai réfléchis je veux savoir le prix avant toute chose",
  );
  const answer = lastSeya(conversation);
  assert.match(answer, /prix|tarif|offert|gratuit|bilan|fourchette|€/i);
  assert.doesNotMatch(
    answer,
    /navrée|écrivez-moi quand|reprendre le rendez-vous|prenez le temps/i,
  );
  assert.notEqual(conversation.status, "Pas intéressé");
});

test("le 1er WhatsApp reprend le texte d’offre du centre, pas l’intitulé campagne", () => {
  const conversation = startConversation(
    {
      leadId: "lead-offer-map",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
      campaign: "lift 4 149-copy",
    },
    "Institut Gap",
    {
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
    },
  );
  const opening = conversation.messages[0].text;
  assert.match(opening, /diagnostic de votre peau détaillé offert/i);
  assert.doesNotMatch(opening, /lift 4 149-copy|un soin minceur/i);
  assert.equal(conversation.campaign, "lift 4 149-copy");
});

test("un lead visage reprend le titre du soin, pas l’enseigne", () => {
  const conversation = startConversation(
    {
      leadId: "lead-visage-title",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin visage",
    },
    "Institut Gap",
    {
      treatmentBriefs: [
        {
          name: "Soin visage",
          title:
            "Soins Visage anti-âge (sans chirurgie) - JFG Clinic Saint-Gilles-Croix-de-Vie",
          url: "https://www.jfg-clinic.com/visage",
          brief: "Prix seulement si on te le demande.",
        },
      ],
    },
  );
  const opening = conversation.messages[0].text;
  assert.match(opening, /soins visage anti-âge/i);
  assert.doesNotMatch(opening, /JFG Clinic Saint-Gilles|https?:\/\//i);
});

test("mauvais centre : elle clôt et ne propose plus de rendez-vous", async () => {
  let conversation = startConversation(
    {
      leadId: "lead-cournon",
      centerId: "jfg-clinique-clermont",
      firstName: "Marine",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation = await reply(conversation, "C’est pour le ventre");
  conversation = await reply(
    conversation,
    "Bonjour, Excusez-moi, je pensais que c’était l’institut de Cournon d’Auvergne",
  );

  assert.equal(conversation.status, "Pas intéressé");
  assert.match(lastSeya(conversation), /aucun souci|belle journée|bonne soirée/i);
  assert.doesNotMatch(
    lastSeya(conversation),
    /rendez-vous|créneau|creneau|lequel vous irait|faites-le moi savoir|si vous souhaitez/i,
  );
});

test("hors zone, reviendra et rappel lundi ferment le fil sans créneaux", async () => {
  const {
    crmUpdateFromLeadMessage,
    parseNextWeekdayIso,
    wantsSlots,
  } = require("./conversation");
  const thursday = new Date("2026-10-01T12:00:00");

  assert.deepEqual(
    crmUpdateFromLeadMessage("Désolée je ne donne pas suite cordialement", thursday),
    {
      status: "Pas intéressé",
      conversationStatus: "Pas intéressé",
      reminderDate: null,
    },
  );
  assert.deepEqual(crmUpdateFromLeadMessage("Je suis hors zone", thursday), {
    status: "Hors zone",
    conversationStatus: "Terminé",
    reminderDate: null,
  });
  assert.deepEqual(
    crmUpdateFromLeadMessage("Je reviendrai vers vous", thursday),
    {
      status: "Reviendra vers nous",
      conversationStatus: "Terminé",
      reminderDate: null,
    },
  );
  assert.deepEqual(
    crmUpdateFromLeadMessage("Plus rien sur la semaine qui arrive", thursday),
    {
      status: "Reviendra vers nous",
      conversationStatus: "Terminé",
      reminderDate: null,
    },
  );
  assert.deepEqual(
    crmUpdateFromLeadMessage("Je vous tiens au courant", thursday),
    {
      status: "Reviendra vers nous",
      conversationStatus: "Terminé",
      reminderDate: null,
    },
  );
  assert.deepEqual(
    crmUpdateFromLeadMessage("Renvoyez-moi un message lundi", thursday),
    {
      status: "À relancer",
      conversationStatus: "À recontacter",
      reminderDate: "2026-10-05",
    },
  );
  assert.equal(parseNextWeekdayIso("rappelez-moi mardi", thursday), "2026-10-06");
  assert.equal(parseNextWeekdayIso("recontactez-moi", thursday), null);
  assert.equal(
    wantsSlots("Renvoyez-moi un message lundi", { messages: [] }),
    false,
  );

  let conversation = startConversation(
    {
      leadId: "lead-zone",
      centerId: "jfg-clinique-clermont",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation = await reply(conversation, "C’est pour le ventre");
  conversation = await reply(conversation, "Je suis trop loin, c’est hors zone");
  assert.equal(conversation.status, "Terminé");
  assert.match(lastSeya(conversation), /secteur|belle journée/i);
  assert.equal((conversation.proposedSlots || []).length, 0);

  conversation = startConversation(
    {
      leadId: "lead-lundi",
      centerId: "jfg-clinique-clermont",
      firstName: "Léa",
      lastName: "Test",
      phone: "0611223344",
      treatment: "Soin minceur",
    },
    "JFG Clinique Clermont",
    seya,
  );
  conversation = await reply(conversation, "C’est pour le ventre");
  conversation = await reply(conversation, "Renvoyez-moi un message lundi");
  assert.equal(conversation.status, "À recontacter");
  assert.match(lastSeya(conversation), /recontacte lundi/i);
  assert.doesNotMatch(lastSeya(conversation), SLOT_PUSH);
  assert.equal((conversation.proposedSlots || []).length, 0);
});

