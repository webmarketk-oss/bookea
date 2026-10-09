const test = require("node:test");
const assert = require("node:assert/strict");
const {
  findBrevoSender,
  mailboxPublicStatus,
  mergeMailingMailbox,
  parseMailingMailbox,
  resolveCenterSender,
} = require("./mailbox-lib");

test("une boîte vérifiée sert d’expéditeur au centre", () => {
  const center = {
    name: "JFG Clermont",
    email: "accueil@centre.fr",
    settings: {
      mailing: {
        mailbox: {
          email: "contact@jfg.fr",
          name: "JFG Clinique",
          senderId: 42,
          verified: true,
        },
      },
    },
  };
  assert.equal(parseMailingMailbox(center.settings).email, "contact@jfg.fr");
  assert.deepEqual(resolveCenterSender(center), {
    email: "contact@jfg.fr",
    name: "JFG Clinique",
    mailboxConnected: true,
  });
  assert.equal(mailboxPublicStatus(center).connected, true);
});

test("sans boîte connectée, le mailing n’utilise pas l’email du centre comme connecté", () => {
  const center = {
    name: "Dépil Tech",
    email: "hello@depil.fr",
    settings: {},
  };
  const sender = resolveCenterSender(center);
  assert.equal(sender.mailboxConnected, false);
  assert.equal(mailboxPublicStatus(center).connected, false);
  assert.equal(mailboxPublicStatus(center).pending, false);
});

test("fusionner la boîte ne casse pas les modèles déjà enregistrés", () => {
  const next = mergeMailingMailbox(
    {
      mailing: {
        templates: [{ id: "t1", name: "Fidélité" }],
        mailbox: { email: "old@centre.fr", verified: true },
      },
    },
    { email: "new@centre.fr", name: "Le centre", senderId: 9, verified: false },
  );
  assert.equal(next.mailing.templates[0].id, "t1");
  assert.equal(next.mailing.mailbox.email, "new@centre.fr");
  assert.equal(next.mailing.mailbox.verified, false);
  assert.equal(next.mailing.mailbox.senderId, 9);
});

test("retrouver l’expéditeur Brevo par email", () => {
  assert.equal(
    findBrevoSender(
      [
        { id: 1, email: "a@centre.fr", active: false },
        { id: 2, email: "b@centre.fr", active: true },
      ],
      "B@centre.fr",
    )?.id,
    2,
  );
});
