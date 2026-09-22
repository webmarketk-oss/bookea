import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const utils = require("../api/appointments/token-utils.js");

const token = utils.createConfirmationToken();
assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
assert.equal(utils.hashConfirmationToken(token).length, 64);
assert.notEqual(
  utils.hashConfirmationToken(token),
  utils.hashConfirmationToken(`${token}x`),
);

const row = {
  appointment_date: "2026-09-30",
  starts_at: "14:30:00",
  status: "to_confirm",
  confirmation_token_slot: "2026-09-30|14:30",
  confirmation_token_expires_at: "2026-10-01T00:00:00.000Z",
  confirmed_at: null,
  cancelled_at: null,
  client_response: null,
};

assert.equal(utils.appointmentSlot("2026-09-30", "14:30:00"), "2026-09-30|14:30");
assert.equal(utils.readConfirmationState(row, new Date("2026-09-22T10:00:00.000Z")), "pending");
assert.equal(
  utils.readConfirmationState(
    { ...row, confirmation_token_slot: "2026-09-30|16:00" },
    new Date("2026-09-22T10:00:00.000Z"),
  ),
  "moved",
);
assert.equal(
  utils.readConfirmationState(
    { ...row, confirmed_at: "2026-09-22T09:00:00.000Z", client_response: "confirmed par le client" },
    new Date("2026-09-22T10:00:00.000Z"),
  ),
  "confirmed",
);
assert.equal(
  utils.readConfirmationState(
    { ...row, cancelled_at: "2026-09-22T09:00:00.000Z", status: "cancelled", client_response: "annuler" },
    new Date("2026-09-22T10:00:00.000Z"),
  ),
  "cancelled",
);
assert.equal(
  utils.readConfirmationState(row, new Date("2026-10-01T10:00:00.000Z")),
  "expired",
);
assert.equal(utils.readConfirmationState(null), "invalid");
assert.match(utils.confirmationUrlForToken(token), /\/r\//);
assert.match(utils.confirmationSmsLinkForToken(token), /\/r\/[A-Za-z0-9_-]{40,}/);
assert.match(utils.confirmationSmsLinkForToken(token), /^https:\/\//);
assert.equal(utils.formatPublicAppointmentDate("2026-09-30").includes("30"), true);

console.log("appointment confirmation token utils ok");
