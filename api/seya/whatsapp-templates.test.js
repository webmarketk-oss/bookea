const test = require("node:test");
const assert = require("node:assert/strict");

const previous = {
  token: process.env.WHATSAPP_TOKEN,
  phone: process.env.WHATSAPP_PHONE_NUMBER_ID,
  waba: process.env.WHATSAPP_WABA_ID,
  fetch: global.fetch,
};

process.env.WHATSAPP_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
process.env.WHATSAPP_WABA_ID = "999";

const handler = require("./whatsapp");

function response(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

test("les modèles WhatsApp au-delà de la première page Meta restent visibles", async () => {
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("after=page2")) {
      return response({
        data: [
          {
            name: "seya_minceur_79_relance",
            status: "APPROVED",
            language: "fr",
            components: [{ type: "BODY", text: "Bonjour {{1}}" }],
          },
        ],
      });
    }
    return response({
      data: [{ name: "seya_acceuil_minceur", status: "APPROVED", language: "fr", components: [] }],
      paging: { next: "https://graph.facebook.com/v21.0/999/message_templates?after=page2" },
    });
  };

  let payload = null;
  await handler(
    { method: "GET", query: { templates: "1" } },
    {
      setHeader() {},
      status(code) {
        assert.equal(code, 200);
        return this;
      },
      json(body) {
        payload = body;
      },
    },
  );

  assert.equal(urls.length, 2);
  assert.equal(payload.ok, true);
  assert.deepEqual(
    payload.templates.map((item) => item.name),
    ["seya_acceuil_minceur", "seya_minceur_79_relance"],
  );
  assert.equal(payload.templates[1].status, "APPROVED");
});

test.after(() => {
  process.env.WHATSAPP_TOKEN = previous.token;
  process.env.WHATSAPP_PHONE_NUMBER_ID = previous.phone;
  process.env.WHATSAPP_WABA_ID = previous.waba;
  if (previous.token === undefined) delete process.env.WHATSAPP_TOKEN;
  if (previous.phone === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (previous.waba === undefined) delete process.env.WHATSAPP_WABA_ID;
  global.fetch = previous.fetch;
});
