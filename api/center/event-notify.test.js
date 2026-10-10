const test = require("node:test");
const assert = require("node:assert/strict");
const {
  alreadyNotified,
  appointmentEventCopy,
  conversationUrl,
  eventNotifyKey,
  formatEventWhen,
  messageEventCopy,
  notificationVia,
} = require("./event-copy");
const { centerNotifyEmails } = require("../seya/center-notify");
const { sendEventToCenter } = require("./event-notify");

test("le mail d’annulation reprend le nom, le soin et le créneau", () => {
  const copy = appointmentEventCopy({
    kind: "appointment_cancelled",
    via: "lien SMS",
    personName: "Léa Martin",
    treatment: "Épilation laser",
    when: formatEventWhen("2026-10-10", "09:00"),
    centerName: "JFG Clermont",
  });
  assert.equal(copy.title, "RDV annulé");
  assert.match(copy.subject, /Léa Martin/);
  assert.match(copy.body, /Léa Martin/);
  assert.match(copy.body, /Épilation laser/);
  assert.match(copy.body, /lien SMS/);
  assert.match(copy.text, /Rendez-vous annulé/);
  assert.match(copy.text, /Épilation laser/);
  assert.match(copy.text, /lien SMS/);
});

test("le mail de déplacement affiche l’ancien et le nouveau créneau", () => {
  const copy = appointmentEventCopy({
    kind: "appointment_moved",
    via: "Bookea Client",
    personName: "Sam Durand",
    treatment: "Soin minceur",
    previousWhen: formatEventWhen("2026-10-10", "09:00"),
    when: formatEventWhen("2026-10-12", "14:30"),
  });
  assert.match(copy.subject, /déplacé/);
  assert.match(copy.body, /Soin minceur/);
  assert.match(copy.body, /09h00|09:00/);
  assert.match(copy.body, /14h30|14:30/);
  assert.match(copy.text, /Ancien créneau/);
  assert.match(copy.text, /Nouveau créneau/);
  assert.match(copy.text, /Bookea Client/);
});

test("le mail de réservation Bookea Client reprend nom, soin et horaire", () => {
  const copy = appointmentEventCopy({
    kind: "appointment_booked",
    personName: "Julie Martin",
    treatment: "Hydrafacial",
    when: formatEventWhen("2026-10-11", "11:00"),
    centerName: "JFG Clermont",
  });
  assert.match(copy.subject, /RDV en ligne/);
  assert.match(copy.body, /Julie Martin/);
  assert.match(copy.body, /Hydrafacial/);
  assert.match(copy.text, /Bookea Client/);
  assert.match(copy.text, /11h00|11:00/);
});

test("le mail message contient un lien vers la conversation", () => {
  const url = conversationUrl("conv-42");
  const copy = messageEventCopy({
    personName: "Claire",
    preview: "Bonjour, je peux décaler samedi ?",
    conversationUrl: url,
    centerName: "JFG Clermont",
  });
  assert.match(copy.subject, /Claire/);
  assert.match(copy.text, /décaler samedi/);
  assert.match(copy.text, /messagerie/);
  assert.match(copy.text, /conversation=conv-42/);
  assert.match(copy.href, /messagerie\?conversation=conv-42/);
});

test("SMS et Bookea Client restent distingués, sans notifier un autre centre", () => {
  assert.equal(notificationVia("client_link"), "lien SMS");
  assert.equal(notificationVia("public_bookea"), "Bookea Client");
  const emails = centerNotifyEmails(
    { id: "c1", email: "accueil@jfg.fr" },
    { centerProfile: { supportEmail: "accueil@jfg.fr" } },
  );
  assert.deepEqual(emails, ["accueil@jfg.fr"]);
  assert.equal(
    eventNotifyKey("appointment_cancelled", {
      id: "apt-1",
      date: "2026-10-10",
      time: "09:00",
    }),
    "appointment_cancelled:apt-1:2026-10-10:09:00",
  );
  assert.equal(
    alreadyNotified(
      [{ action: "center_notify", to: "appointment_cancelled:apt-1:2026-10-10:09:00" }],
      "appointment_cancelled:apt-1:2026-10-10:09:00",
    ),
    true,
  );
  assert.equal(
    alreadyNotified(
      [{ action: "cancel", to: "cancelled" }],
      "appointment_cancelled:apt-1:2026-10-10:09:00",
    ),
    false,
  );
});

test("un e-mail n’est envoyé qu’une fois aux adresses uniques du centre", async () => {
  const sent = [];
  const previousFetch = global.fetch;
  const previousKey = process.env.BREVO_API_KEY;
  const previousSender = process.env.BREVO_EMAIL_SENDER;
  process.env.BREVO_API_KEY = "test-key";
  process.env.BREVO_EMAIL_SENDER = "info@bookeai.fr";
  global.fetch = async (_url, init) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({}) };
  };
  try {
    const result = await sendEventToCenter({
      center: {
        id: "c1",
        name: "JFG",
        email: "accueil@jfg.fr",
        settings: {
          mailing: { mailbox: { email: "accueil@jfg.fr", verified: true } },
        },
      },
      seya: { centerProfile: { supportEmail: "accueil@jfg.fr" } },
      copy: { subject: "RDV annulé — Léa", text: "Léa a annulé." },
    });
    assert.equal(result.sent, true);
    assert.deepEqual(result.recipients, ["accueil@jfg.fr"]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to[0].email, "accueil@jfg.fr");
    assert.equal(sent[0].sender.email, "info@bookeai.fr");
    assert.match(sent[0].subject, /Léa/);
  } finally {
    global.fetch = previousFetch;
    process.env.BREVO_API_KEY = previousKey;
    process.env.BREVO_EMAIL_SENDER = previousSender;
  }
});
