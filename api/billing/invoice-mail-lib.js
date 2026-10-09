function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function invoiceMailReceipts(settings) {
  return asRecord(asRecord(asRecord(settings).billing).invoiceMails);
}

function withInvoiceMailReceipt(settings, invoiceId, receipt) {
  const current = asRecord(settings);
  const billing = asRecord(current.billing);
  const id = String(invoiceId || "").trim();
  if (!id) {
    return current;
  }
  return {
    ...current,
    billing: {
      ...billing,
      invoiceMails: {
        ...asRecord(billing.invoiceMails),
        [id]: {
          emailedAt: String(receipt?.emailedAt || "").trim(),
          emailedTo: String(receipt?.emailedTo || "").trim().toLowerCase(),
        },
      },
    },
  };
}

function defaultInvoiceMailCopy(invoice = {}, centerName = "") {
  const number = String(invoice.number || "").trim() || "facture";
  const client = String(invoice.client || invoice.clientName || "bonjour").trim() || "bonjour";
  const kind = String(invoice.type || "").toLowerCase().includes("devis")
    ? "devis"
    : "facture";
  const centre = String(centerName || "").trim() || "votre centre";
  return {
    subject: `Votre ${kind} ${number}`,
    message: [
      `Bonjour ${client},`,
      "",
      `Veuillez trouver ci-joint votre ${kind} ${number}.`,
      "",
      `Cordialement,`,
      centre,
    ].join("\n"),
  };
}

function parsePdfAttachment(value, fileName) {
  const raw = String(value || "").trim();
  const match = raw.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=\s]+)$/i);
  const content = (match ? match[1] : raw).replace(/\s/g, "");
  if (!content || content.length < 80) {
    return null;
  }
  const name = String(fileName || "facture.pdf").replace(/[^\w.-]+/g, "_");
  return {
    name: name.endsWith(".pdf") ? name : `${name}.pdf`,
    content,
  };
}

module.exports = {
  defaultInvoiceMailCopy,
  invoiceMailReceipts,
  isValidEmail,
  parsePdfAttachment,
  withInvoiceMailReceipt,
};
