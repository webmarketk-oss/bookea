const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isAttachableEmail,
  normalizeAttachEmail,
} = require("./center-members-lib");

test("l’email de rattachement est normalisé et doit être complet", () => {
  assert.equal(normalizeAttachEmail("  Sandra.Lucard@gmail.com "), "sandra.lucard@gmail.com");
  assert.equal(isAttachableEmail("sandra.lucard@gmail.com"), true);
  assert.equal(isAttachableEmail("sandra.lucard@g"), false);
  assert.equal(isAttachableEmail(""), false);
});
