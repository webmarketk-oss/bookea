const test = require("node:test");
const assert = require("node:assert/strict");

const { mergeTableBilling } = require("./agency-billing");

test("les factures restées dans l’ancienne table reviennent sans doublon", () => {
  const merged = mergeTableBilling(
    "webk",
    {
      company: "webk",
      invoices: [{ id: "a", number: "WK-2026-003", status: "Payée" }],
      clients: [{ id: "c1", name: "JFG" }],
    },
    {
      company: "webk",
      mailbox: { email: "info@bookeai.fr" },
      invoices: [
        { id: "a", number: "WK-2026-003", status: "En attente de paiement" },
        { id: "b", number: "WK-2026-001" },
      ],
      clients: [{ id: "c2", name: "Gaillard" }],
    },
  );

  assert.deepEqual(merged.invoices.map((item) => item.id).sort(), ["a", "b"]);
  assert.equal(merged.invoices.find((item) => item.id === "a").status, "Payée");
  assert.deepEqual(merged.clients.map((item) => item.id).sort(), ["c1", "c2"]);
  assert.equal("mailbox" in merged, false);
});

test("sans fichier serveur, on repart de l’ancienne table", () => {
  const merged = mergeTableBilling("bookea", null, {
    company: "bookea",
    mailbox: { email: "info@bookeai.fr" },
    invoices: [{ id: "x", number: "BK-2026-001" }],
  });
  assert.equal(merged.company, "bookea");
  assert.equal(merged.invoices.length, 1);
  assert.equal("mailbox" in merged, false);
  assert.equal(mergeTableBilling("bookea", null, null), null);
});
