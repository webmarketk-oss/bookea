import assert from "node:assert/strict";
import test from "node:test";
import {
  clientNotifyFromMap,
  defaultClientNotifyPref,
  normalizeClientNotifyPref,
  parseClientNotifyMap,
} from "./client-notify.ts";

test("une cliente sans préférence reçoit SMS et mail", () => {
  assert.deepEqual(clientNotifyFromMap({}, "client-1"), defaultClientNotifyPref);
  assert.deepEqual(clientNotifyFromMap(null, ""), defaultClientNotifyPref);
});

test("on peut décocher SMS ou mail sur la fiche", () => {
  const map = parseClientNotifyMap({
    "client-1": { sms: false, email: true },
    "client-2": { sms: true, email: false },
  });

  assert.equal(clientNotifyFromMap(map, "client-1").sms, false);
  assert.equal(clientNotifyFromMap(map, "client-1").email, true);
  assert.equal(clientNotifyFromMap(map, "client-2").sms, true);
  assert.equal(clientNotifyFromMap(map, "client-2").email, false);
});

test("une valeur absente reste cochée", () => {
  assert.deepEqual(normalizeClientNotifyPref({}), defaultClientNotifyPref);
  assert.deepEqual(normalizeClientNotifyPref({ sms: false }), {
    sms: false,
    email: true,
  });
});
