const test = require("node:test");
const assert = require("node:assert/strict");
const {
  centerNotifyCopy,
  centerNotifyEmails,
  centerNotifySender,
  notifyKey,
} = require("./center-notify");

test("l’email Seya du centre est prioritaire, puis l’email Bookea", () => {
  assert.deepEqual(
    centerNotifyEmails(
      { email: "accueil@centre.fr" },
      { centerProfile: { supportEmail: "seya@centre.fr" } },
    ),
    ["seya@centre.fr", "accueil@centre.fr"],
  );
  assert.deepEqual(
    centerNotifyEmails({ email: "accueil@centre.fr" }, { centerProfile: {} }),
    ["accueil@centre.fr"],
  );
  assert.deepEqual(centerNotifyEmails({ email: "" }, {}), []);
  assert.deepEqual(
    centerNotifyEmails(
      {
        email: "accueil@centre.fr",
        settings: {
          mailing: { mailbox: { email: "boite@centre.fr", verified: true } },
        },
      },
      { centerProfile: {} },
    ),
    ["boite@centre.fr", "accueil@centre.fr"],
  );
});

test("le mail RDV reprend le prospect, le soin et le créneau", () => {
  const copy = centerNotifyCopy({
    kind: "booked",
    centerName: "JFG Clermont",
    conversation: {
      firstName: "Léa",
      lastName: "Martin",
      phone: "0612345678",
      qualification: { need: "Soin minceur" },
    },
    slot: { date: "2026-10-10", time: "09:00", label: "ven. 10/10 à 09h00" },
  });
  assert.match(copy.subject, /RDV posé/);
  assert.match(copy.subject, /Léa/);
  assert.match(copy.text, /0612345678/);
  assert.match(copy.text, /Soin minceur/);
  assert.match(copy.text, /ven\. 10\/10 à 09h00/);
  assert.match(copy.text, /agenda Bookea/);
});

test("le mail rappel opératrice ne parle pas d’un RDV posé", () => {
  const copy = centerNotifyCopy({
    kind: "callback",
    centerName: "Dépil Tech Vichy",
    conversation: {
      firstName: "Sam",
      phone: "0699999999",
      treatment: "Épilation laser",
    },
    slot: { date: "2026-10-12", time: "15:00", label: "lun. 12/10 à 15h00" },
  });
  assert.match(copy.subject, /à rappeler/);
  assert.match(copy.text, /rappeler/);
  assert.match(copy.text, /Épilation laser/);
  assert.match(copy.text, /Aucun rendez-vous/);
});

test("le mail d’absence reprend le message et ne dit pas que le RDV est annulé", () => {
  const copy = centerNotifyCopy({
    kind: "absence",
    centerName: "JFG Clinic Gaillard",
    conversation: {
      firstName: "Camille",
      phone: "0611111111",
      treatment: "Soin minceur",
      bookedSlot: { date: "2026-11-07", time: "10:00", label: "sam. 07/11 à 10h00" },
      teamNotes: { absence: { text: "je suis vraiment désolé je suis malade", at: "2026-11-06T06:00:00.000Z" } },
    },
  });
  assert.match(copy.subject, /ne vient pas/);
  assert.match(copy.subject, /Camille/);
  assert.match(copy.text, /JFG Clinic Gaillard/);
  assert.match(copy.text, /0611111111/);
  assert.match(copy.text, /je suis vraiment désolé je suis malade/);
  assert.match(copy.text, /sam\. 07\/11 à 10h00/);
  assert.match(copy.text, /n’a pas annulé/);
  assert.doesNotMatch(copy.text, /à rappeler/);
});

test("une même action n’est notifiée qu’une fois", () => {
  assert.equal(
    notifyKey("booked", { date: "2026-10-10", time: "09:00" }),
    "booked:2026-10-10|09:00",
  );
});

test("l’expéditeur Brevo passe avant l’email du centre", () => {
  const previousSender = process.env.BREVO_EMAIL_SENDER;
  const previousFrom = process.env.BREVO_FROM_EMAIL;
  process.env.BREVO_EMAIL_SENDER = "noreply@bookeai.fr";
  delete process.env.BREVO_FROM_EMAIL;
  assert.equal(
    centerNotifySender(
      { email: "accueil@centre.fr" },
      { centerProfile: { supportEmail: "seya@centre.fr" } },
    ),
    "noreply@bookeai.fr",
  );
  delete process.env.BREVO_EMAIL_SENDER;
  assert.equal(
    centerNotifySender(
      { email: "accueil@centre.fr" },
      { centerProfile: { supportEmail: "seya@centre.fr" } },
    ),
    "seya@centre.fr",
  );
  if (previousSender) {
    process.env.BREVO_EMAIL_SENDER = previousSender;
  }
  if (previousFrom) {
    process.env.BREVO_FROM_EMAIL = previousFrom;
  }
});

test("info@bookeai.fr connecté en admin envoie à la place du centre", () => {
  assert.equal(
    centerNotifySender(
      {
        settings: {
          mailing: {
            mailbox: { email: "boite@centre.fr", verified: true },
          },
        },
      },
      {},
      { email: "info@bookeai.fr", verified: true, name: "Bookea" },
    ),
    "info@bookeai.fr",
  );
});

test("la boîte Mailing connectée sert d’expéditeur", () => {
  const previousSender = process.env.BREVO_EMAIL_SENDER;
  const previousFrom = process.env.BREVO_FROM_EMAIL;
  delete process.env.BREVO_EMAIL_SENDER;
  delete process.env.BREVO_FROM_EMAIL;
  assert.equal(
    centerNotifySender({
      settings: {
        mailing: {
          mailbox: {
            email: "boite@centre.fr",
            name: "Le centre",
            verified: true,
          },
        },
      },
    }),
    "boite@centre.fr",
  );
  if (previousSender) {
    process.env.BREVO_EMAIL_SENDER = previousSender;
  }
  if (previousFrom) {
    process.env.BREVO_FROM_EMAIL = previousFrom;
  }
});
