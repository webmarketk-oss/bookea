const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractIncomingMessages,
  coalesceIncoming,
  alreadyHandledInbound,
  inboundTextFromWhatsApp,
  isRetryableSend,
  outgoingWhatsAppTexts,
} = require("./whatsapp");
const { mergeSeyaConversationLists } = require("./conversation-key");

test("un bouton, une photo ou un vocal ne sont plus ignorés", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: "33611223344",
                  id: "wamid.1",
                  interactive: { button_reply: { title: "Jeudi 18h" } },
                },
                {
                  from: "33611223344",
                  id: "wamid.2",
                  image: { caption: "" },
                },
                {
                  from: "33699887766",
                  id: "wamid.3",
                  audio: { mime_type: "audio/ogg" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const incoming = extractIncomingMessages(payload);
  assert.equal(incoming.length, 3);
  assert.equal(incoming[0].text, "Jeudi 18h");
  assert.equal(incoming[0].kind, "button");
  assert.equal(incoming[1].kind, "image");
  assert.equal(incoming[2].kind, "audio");
  assert.equal(inboundTextFromWhatsApp({ text: { body: "ok" } }).kind, "text");
});

test("plusieurs messages d’un même numéro dans un webhook sont regroupés", () => {
  const grouped = coalesceIncoming([
    { phone: "33611111111", text: "ok", messageId: "a", kind: "text" },
    { phone: "33611111111", text: "jeudi 18h", messageId: "b", kind: "text" },
    { phone: "33622222222", text: "prix", messageId: "c", kind: "text" },
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].text, "ok\njeudi 18h");
  assert.deepEqual(grouped[0].messageIds, ["a", "b"]);
  assert.equal(grouped[1].text, "prix");
});

test("un même messageId déjà traité n’est pas reproposé, sauf si l’envoi a échoué", () => {
  const conversation = {
    lastInboundIds: ["wamid.1"],
    messages: [
      { author: "lead", text: "Jeudi", at: "2026-10-09T08:00:00.000Z" },
      { author: "seya", text: "Je vous propose 18h.", at: "2026-10-09T08:00:01.000Z" },
    ],
  };
  assert.equal(
    alreadyHandledInbound(conversation, { messageId: "wamid.1", text: "Jeudi" }),
    true,
  );
  assert.equal(
    alreadyHandledInbound(
      { ...conversation, sendError: "Seya n’a pas pu envoyer sa réponse WhatsApp." },
      { messageId: "wamid.1", text: "Jeudi" },
    ),
    false,
  );
});

test("le même texte sans réponse Seya n’est pas considéré comme déjà traité", () => {
  const conversation = {
    lastInboundIds: [],
    messages: [
      { author: "lead", text: "Jeudi matin", at: new Date().toISOString() },
    ],
  };
  assert.equal(
    alreadyHandledInbound(conversation, { text: "Jeudi matin", messageId: "wamid.new" }),
    false,
  );
});

test("une erreur d’envoi n’est pas relancée pour un jeton expiré", () => {
  assert.equal(isRetryableSend({ sent: false, reason: "not_connected" }), false);
  assert.equal(isRetryableSend({ sent: false, reason: "send_failed", code: 190 }), false);
  assert.equal(isRetryableSend({ sent: false, reason: "send_failed", code: 131026 }), false);
  assert.equal(isRetryableSend({ sent: false, reason: "send_failed", code: 1 }), true);
});

test("deux messages rapides du même fil ne s’écrasent plus à la fusion", () => {
  const first = {
    leadId: "lead-1",
    phone: "0611223344",
    messages: [
      { id: "1", author: "lead", text: "ok", at: "2026-10-09T08:00:00.000Z" },
      { id: "2", author: "seya", text: "Quel jour ?", at: "2026-10-09T08:00:01.000Z" },
    ],
  };
  const second = {
    leadId: "lead-1",
    phone: "0611223344",
    messages: [
      { id: "1", author: "lead", text: "ok", at: "2026-10-09T08:00:00.000Z" },
      { id: "2", author: "seya", text: "Quel jour ?", at: "2026-10-09T08:00:01.000Z" },
      { id: "3", author: "lead", text: "jeudi 18h", at: "2026-10-09T08:00:02.000Z" },
      { id: "4", author: "seya", text: "Je vous propose jeudi 18h.", at: "2026-10-09T08:00:03.000Z" },
    ],
  };
  const merged = mergeSeyaConversationLists([first], [second]);
  assert.equal(merged[0].messages.length, 4);
  assert.equal(merged[0].messages.at(-1).text, "Je vous propose jeudi 18h.");
});

test("un nouveau message pendant la recherche de créneau s’envoie", () => {
  const previous = "Je regarde un créneau.";
  const sent = outgoingWhatsAppTexts(
    [],
    "Le jeu. 15/10 je peux vous proposer 18h00.",
    previous,
    "ok\njeudi 18h",
  );
  assert.equal(sent.length, 1);
  assert.match(sent[0], /18h00/);
});
