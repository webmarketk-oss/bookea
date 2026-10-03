const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canMessageCenter,
  clientMessageNotification,
  emptyAccount,
  formatSlot,
  isPastAppointment,
  sanitizeProfileInput,
} = require("./account-lib");

test("un compte sans fiche reste vide, sans Julie ni RDV fictif", () => {
  const account = emptyAccount({
    firstName: "Samantha",
    lastName: "",
    email: "samantha@test.fr",
  });
  assert.equal(account.displayName, "Samantha");
  assert.deepEqual(account.upcoming, []);
  assert.deepEqual(account.past, []);
  assert.deepEqual(account.threads, []);
  assert.equal(account.loyalty.points, 0);
  assert.doesNotMatch(JSON.stringify(account), /Julie Martin|Institut Nova|72 points/);
  assert.equal(account.birthDate, "");
  assert.equal(account.address, "");
});

test("le profil client refuse un email ou un mot de passe invalide", () => {
  assert.equal(sanitizeProfileInput({ firstName: "", email: "a@b.fr" }).error, "first_name_required");
  assert.equal(
    sanitizeProfileInput({ firstName: "Léa", email: "pas-un-mail" }).error,
    "invalid_email",
  );
  assert.equal(
    sanitizeProfileInput({
      firstName: "Léa",
      email: "lea@test.fr",
      newPassword: "123",
      currentPassword: "ancien",
    }).error,
    "password_too_short",
  );
  const ok = sanitizeProfileInput({
    firstName: "Léa",
    lastName: "Martin",
    email: "lea@test.fr",
    birthDate: "1998-04-12",
    address: "12 rue des Lilas",
    postalCode: "63000",
    city: "Clermont-Ferrand",
  });
  assert.equal(ok.error, undefined);
  assert.equal(ok.fullName, "Léa Martin");
  assert.equal(ok.birthDate, "1998-04-12");
});

test("on n’écrit qu’au centre où la cliente a un dossier", () => {
  const account = {
    centers: [{ id: "jfg-clermont", name: "JFG Clinique Clermont-Ferrand" }],
  };
  assert.equal(canMessageCenter(account, "jfg-clermont"), true);
  assert.equal(canMessageCenter(account, "institut-nova"), false);
});

test("un message cliente devient une notification Seya", () => {
  const item = clientMessageNotification({
    id: "m1",
    clientName: "Samantha",
    body: "Bonjour, je peux décaler samedi ?",
    createdAt: "2026-10-03T08:00:00.000Z",
  });
  assert.equal(item.kind, "client_message");
  assert.match(item.title, /Message cliente/i);
  assert.match(item.body, /Samantha/);
  assert.match(item.body, /décaler samedi/);
  assert.equal(item.href, "/dashboard/seya-crm");
});

test("le créneau se lit en français, et un RDV passé se classe bien", () => {
  assert.match(formatSlot("2026-10-04", "14:30"), /octobre/i);
  assert.match(formatSlot("2026-10-04", "14:30"), /14:30/);
  assert.equal(
    isPastAppointment(
      { appointment_date: "2026-10-01", starts_at: "09:00" },
      new Date("2026-10-03T12:00:00Z"),
    ),
    true,
  );
  assert.equal(
    isPastAppointment(
      { appointment_date: "2026-10-10", starts_at: "09:00" },
      new Date("2026-10-03T12:00:00Z"),
    ),
    false,
  );
});
