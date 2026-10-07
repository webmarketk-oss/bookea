const test = require("node:test");
const assert = require("node:assert/strict");

const { canonicalLeadSource, leadUrls } = require("./leads");
const handler = require("./leads");

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

test("la source Systeme.io / Bookea est lue dans l’URL", () => {
  assert.equal(canonicalLeadSource({ source: "systeme.io" }), "systeme.io");
  assert.equal(canonicalLeadSource({ source: "Systeme" }), "systeme.io");
  assert.equal(canonicalLeadSource({ source: "bookea" }), "bookea");
  assert.equal(canonicalLeadSource({ source: "vercel" }), "bookea");
  assert.equal(canonicalLeadSource({ source: "facebook" }), "facebook");
  assert.equal(canonicalLeadSource({}), "");
});

test("GET /api/leads donne les 3 portes", async () => {
  const res = mockRes();
  await handler({ method: "GET", query: { center: "gap-institut" } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.systeme_io.url, /center=gap-institut/);
  assert.match(res.body.systeme_io.url, /source=systeme.io/);
  assert.match(res.body.bookea.url, /source=bookea/);
  assert.match(res.body.facebook.url, /\/api\/meta\/leads$/);
  assert.deepEqual(res.body.fields, [
    "first_name",
    "last_name",
    "email",
    "phone",
    "offre",
  ]);
});

test("POST /api/leads sans source est refusé", async () => {
  const res = mockRes();
  await handler(
    { method: "POST", query: { center: "gap-institut" }, body: { phone: "0612345678" } },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "missing_source");
});

test("les URLs Facebook et Systeme.io ne se mélangent pas", () => {
  const urls = leadUrls("depil-tech-vichy");
  assert.match(urls.facebook, /\/api\/meta\/leads$/);
  assert.doesNotMatch(urls.systeme_io, /meta\/leads/);
  assert.match(urls.systeme_io, /source=systeme.io/);
});
