const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getMetaPublicBaseUrl,
  extractPageRef,
  matchManagedPage,
} = require("./oauth-lib");

test("Meta OAuth reste sur www.bookeai.fr", () => {
  assert.equal(getMetaPublicBaseUrl(), "https://www.bookeai.fr");
});

test("un lien Facebook ou un ID deviennent une référence de page", () => {
  assert.equal(extractPageRef("109876543210123"), "109876543210123");
  assert.equal(
    extractPageRef("https://www.facebook.com/jfgclinique"),
    "jfgclinique",
  );
  assert.equal(
    extractPageRef("https://www.facebook.com/pages/JFG/109876543210123"),
    "109876543210123",
  );
  assert.equal(extractPageRef("https://www.facebook.com/profile.php?id=109876543210123"), "109876543210123");
});

test("on rattache la page même sans coller l’ID Meta", () => {
  const pages = [
    {
      id: "109876543210123",
      name: "JFG Clinique Gap",
      username: "jfgclinique",
      link: "https://www.facebook.com/jfgclinique",
      access_token: "tok",
    },
  ];
  assert.equal(matchManagedPage(pages, "109876543210123")?.id, "109876543210123");
  assert.equal(matchManagedPage(pages, "jfgclinique")?.id, "109876543210123");
  assert.equal(
    matchManagedPage(pages, "https://www.facebook.com/jfgclinique")?.id,
    "109876543210123",
  );
});
