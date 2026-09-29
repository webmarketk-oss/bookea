const test = require("node:test");
const assert = require("node:assert/strict");

const { outgoingWhatsAppTexts, replaceDraftWithSent } = require("./whatsapp");

test("Bookea ne garde pas « je vérifie » si WhatsApp n’envoie que le créneau pris", () => {
  const conversation = {
    leadId: "lead-1",
    messages: [
      { author: "lead", text: "17h", at: "2026-09-29T20:27:00.000Z" },
      {
        author: "seya",
        text: "Parfait, je vérifie le créneau dont nous avions parlé et je reviens vers vous tout de suite 😊",
        at: "2026-09-29T20:27:01.000Z",
      },
    ],
  };
  const sent = [
    "Ce créneau n’est plus disponible. Le jeu. 15/10 je peux vous proposer 16h00, 16h30 ou 17h00 — lequel vous irait le mieux ?",
  ];
  const synced = replaceDraftWithSent(conversation, sent);
  const seyaTexts = synced.messages
    .filter((item) => item.author === "seya")
    .map((item) => item.text);
  assert.deepEqual(seyaTexts, sent);
  assert.equal(synced.messages.some((item) => /je vérifie le créneau/i.test(item.text)), false);
  assert.equal(synced.messages.some((item) => item.author === "lead" && item.text === "17h"), true);
});

test("si le créneau est pris, WhatsApp n’envoie pas le brouillon « je vérifie »", () => {
  const sent = outgoingWhatsAppTexts(
    ["Ce créneau n’est plus disponible. Le jeu. 15/10 à 16h00."],
    "Parfait, je vérifie le créneau dont nous avions parlé et je reviens vers vous tout de suite 😊",
    "Lequel vous irait le mieux ?",
  );
  assert.equal(sent.length, 1);
  assert.match(sent[0], /plus disponible/i);
  assert.doesNotMatch(sent[0], /je vérifie/i);
});
