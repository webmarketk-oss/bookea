const test = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultInvoiceMailCopy,
  invoiceMailReceipts,
  parsePdfAttachment,
  withInvoiceMailReceipt,
} = require("./invoice-mail-lib");

test("l’objet et le message reprennent le numéro de facture", () => {
  const copy = defaultInvoiceMailCopy(
    { number: "FAC-2026-0012", type: "Facture finale", client: "Camille" },
    "JFG Clinic Gaillard",
  );
  assert.match(copy.subject, /FAC-2026-0012/);
  assert.match(copy.message, /Camille/);
  assert.match(copy.message, /JFG Clinic Gaillard/);
});

test("un PDF en base64 est accepté, un fichier vide est refusé", () => {
  const ok = parsePdfAttachment(`data:application/pdf;base64,${"A".repeat(120)}`, "FAC 12");
  assert.equal(ok.name, "FAC_12.pdf");
  assert.equal(ok.content.length, 120);
  assert.equal(parsePdfAttachment("not-a-pdf", "x.pdf"), null);
});

test("un échec n’écrit pas l’envoi sur la facture", () => {
  const settings = withInvoiceMailReceipt({}, "inv-1", {
    emailedAt: "2026-10-09T16:00:00.000Z",
    emailedTo: "camille@test.fr",
  });
  assert.equal(invoiceMailReceipts(settings)["inv-1"].emailedTo, "camille@test.fr");
  assert.equal(invoiceMailReceipts({}).inv1, undefined);
});

test("le PDF généré par le navigateur (avec nom de fichier) est bien joint", () => {
  const { jsPDF } = require("jspdf");
  const dataUrl = new jsPDF().output("datauristring");
  assert.match(dataUrl, /^data:application\/pdf;filename=/);
  const attachment = parsePdfAttachment(dataUrl, "WK-2026-001.pdf");
  assert.equal(Buffer.from(attachment.content, "base64").subarray(0, 5).toString(), "%PDF-");
  assert.equal(parsePdfAttachment(`data:application/pdf;filename=x.pdf;base64,${"A".repeat(40)}!!`, "x"), null);
});
