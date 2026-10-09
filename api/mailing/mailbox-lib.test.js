const test = require("node:test");
const assert = require("node:assert/strict");
const {
  bookeaSenderPublicStatus,
  findBrevoSender,
  mailboxPublicStatus,
  mergeBookeaSenderPayload,
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

test("la boîte Bookea se relit depuis la fiche plateforme", () => {
  const stored = mergeBookeaSenderPayload(
    {},
    { email: "info@bookeai.fr", name: "Bookea", senderId: 3, verified: true },
  );
  assert.equal(stored.mailbox.email, "info@bookeai.fr");
  assert.equal(bookeaSenderPublicStatus(stored).connected, true);
});

test("connecter info@bookeai.fr ne casse pas la facturation admin", () => {
  const next = mergeBookeaSenderPayload(
    { invoices: [{ id: "inv-1" }], identity: { name: "Bookea" } },
    { email: "info@bookeai.fr", name: "Bookea", senderId: 7, verified: true },
  );
  assert.equal(next.invoices[0].id, "inv-1");
  assert.equal(next.mailbox.email, "info@bookeai.fr");
  assert.equal(next.mailbox.verified, true);
  assert.equal(bookeaSenderPublicStatus(next).connected, true);
  assert.equal(bookeaSenderPublicStatus(next).email, "info@bookeai.fr");
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
