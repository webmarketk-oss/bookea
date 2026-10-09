const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applySeyaMissionFlags,
  canBookSeya,
  operatorCallbackReply,
  resolveSeyaMission,
} = require("./mission");

test("mission : book explicite ou bookAppointment historique", () => {
  assert.equal(resolveSeyaMission({ seyaMission: "book" }), "book");
  assert.equal(resolveSeyaMission({ bookAppointment: true }), "book");
  assert.equal(resolveSeyaMission({ bookAppointment: false }), "qualify_callback");
  assert.equal(resolveSeyaMission({}), "qualify_callback");
  assert.equal(canBookSeya({ seyaMission: "welcome_relance_book" }), true);
  assert.equal(canBookSeya({ seyaMission: "qualify_callback" }), false);
  assert.equal(canBookSeya({ seyaMission: "welcome_relance" }), false);
});

test("mission : les drapeaux restent dissociés", () => {
  const welcome = applySeyaMissionFlags({ seyaMission: "welcome_relance" });
  assert.equal(welcome.bookAppointment, false);
  assert.equal(welcome.qualifyOnSignup, false);
  assert.equal(welcome.autoMessageOnNewLead, true);
  assert.equal(welcome.relanceEnabled, true);

  const callback = applySeyaMissionFlags({ seyaMission: "qualify_callback" });
  assert.equal(callback.bookAppointment, false);
  assert.equal(callback.qualifyOnSignup, true);
  assert.equal(callback.autoMessageOnNewLead, true);

  const book = applySeyaMissionFlags({
    seyaMission: "book",
    autoMessageOnNewLead: false,
    relanceEnabled: false,
  });
  assert.equal(book.bookAppointment, true);
  assert.equal(book.autoMessageOnNewLead, false);
  assert.equal(book.relanceEnabled, false);
});

test("relances : trois J+ saisissables, héritage de relanceDays", () => {
  const custom = applySeyaMissionFlags({
    seyaMission: "book",
    relances: [
      { afterDays: 14, message: "Rebonjour {prenom}" },
      { afterDays: 21, message: "" },
      { afterDays: 30, message: "" },
    ],
  });
  assert.deepEqual(custom.relanceDays, [14, 21, 30]);
  assert.equal(custom.relances[0].message, "Rebonjour {prenom}");

  const legacy = applySeyaMissionFlags({ relanceDays: [2, 8, 20] });
  assert.deepEqual(legacy.relanceDays, [2, 8, 20]);
});

test("rappel opératrice : date et heure convenues", () => {
  assert.match(
    operatorCallbackReply({ date: "2026-10-01", time: "15:00" }),
    /opératrice vous rappellera jeudi 01\/10 à 15h/,
  );
});
