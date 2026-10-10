const fs = require("fs");
const path = require("path");
const { jsPDF } = require("jspdf");
const {
  AGENCY_LEGAL_ENTITY,
  DEFAULT_AGENCY_BANK,
  REVERSE_CHARGE_MENTION,
  invoiceTotal,
  lineNet,
} = require("./_agency-invoice");

const PAGE_WIDTH = 595;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function pdfText(value) {
  return String(value ?? "")
    .replace(/[\u202f\u00a0]/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[—–−]/g, "-")
    .replace(/…/g, "...");
}

function formatEuroAmount(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatShortDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "");
}

function formatPeriod(invoice) {
  if (invoice.periodFrom && invoice.periodTo) {
    return `Du ${formatShortDate(invoice.periodFrom)} au ${formatShortDate(invoice.periodTo)}`;
  }
  return "";
}

function formatDiscount(line) {
  const gross = Number(line.quantity || 0) * Number(line.unitPrice || 0);
  const amount = gross - lineNet(line);
  if (amount <= 0) {
    return "-";
  }
  return line.discountType === "%"
    ? `${line.discountValue} % (-${formatEuroAmount(amount)})`
    : `-${formatEuroAmount(amount)}`;
}

function issuerLines(identity) {
  const merged = { ...AGENCY_LEGAL_ENTITY, ...identity };
  return [
    merged.legalName,
    merged.contactName,
    merged.address,
    [merged.postalCode, merged.city].filter(Boolean).join(" "),
    merged.country,
  ].filter(Boolean);
}

function clientLines(client) {
  if (!client) {
    return { title: "-", lines: [] };
  }
  const title = String(client.name || "").trim() || "-";
  const legalName = String(client.legalName || "").trim();
  const address = String(client.address || "").trim();
  return {
    title,
    lines: [
      legalName && legalName.toLowerCase() !== title.toLowerCase() ? legalName : "",
      address,
      !address ? String(client.city || "").trim() : "",
      String(client.phone || "").trim(),
      String(client.email || "").trim(),
    ].filter(Boolean),
  };
}

function bankLines(bank) {
  const merged = { ...DEFAULT_AGENCY_BANK, ...bank };
  return [
    `Nom : ${merged.accountName}`,
    `IBAN : ${merged.iban}`,
    `Swift/BIC : ${merged.bic}`,
    `Banque : ${merged.bankName}`,
    merged.bankAddress,
  ].filter((line) => !line.endsWith(": ") && line.trim());
}

function readLogo(company) {
  try {
    const file = path.join(
      __dirname,
      "..",
      "..",
      "public",
      company === "webk" ? "webk-invoice-logo.png" : "bookea-invoice-logo.png",
    );
    return new Uint8Array(fs.readFileSync(file));
  } catch {
    return null;
  }
}

function buildAgencyInvoicePdf(state, invoice, options = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const write = (text, x, y, opts) => doc.text(pdfText(text), x, y, opts);
  const color = (hex) => doc.setTextColor(hex);
  let y = MARGIN;

  const logo = readLogo(state.company);
  if (logo) {
    try {
      const image = doc.getImageProperties(logo);
      const height = 30;
      const width = Math.min(150, (image.width / image.height) * height);
      doc.addImage(logo, image.fileType, MARGIN, y, width, height);
    } catch (error) {
      console.warn("[billing/invoice-pdf] logo", error);
    }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  color("#475569");
  issuerLines(state.identity || {}).forEach((line, index) => {
    write(line, MARGIN, y + 46 + index * 12);
  });

  const right = PAGE_WIDTH - MARGIN;
  doc.setFontSize(8);
  color("#64748b");
  write("FACTURE", right, y + 8, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  color("#0f172a");
  write(invoice.number, right, y + 28, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  color("#475569");
  write(`Date : ${formatShortDate(invoice.issuedOn)}`, right, y + 44, { align: "right" });
  if (formatPeriod(invoice)) {
    write(`Période : ${formatPeriod(invoice)}`, right, y + 56, { align: "right" });
  }

  y += 46 + issuerLines(state.identity || {}).length * 12 + 18;

  const box = (label, render, height) => {
    doc.setDrawColor("#e2e8f0");
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 6, 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    color("#64748b");
    write(label.toUpperCase(), MARGIN + 12, y + 16);
    render(y + 16);
    y += height + 16;
  };

  const client = clientLines(
    state.clients.find((item) => item.id === invoice.clientId),
  );
  box(
    "Client",
    (top) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      color("#0f172a");
      write(client.title, MARGIN + 12, top + 16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      color("#475569");
      client.lines.forEach((line, index) => {
        write(line, MARGIN + 12, top + 30 + index * 12);
      });
    },
    44 + client.lines.length * 12,
  );

  const columns = [
    { label: "Prestation", x: MARGIN },
    { label: "Qté", x: MARGIN + 270 },
    { label: "Prix", x: MARGIN + 310 },
    { label: "Remise", x: MARGIN + 370 },
    { label: "Total", x: right, align: "right" },
  ];
  doc.setFontSize(8);
  color("#64748b");
  columns.forEach((column) =>
    write(column.label.toUpperCase(), column.x, y, column.align ? { align: column.align } : undefined),
  );
  doc.setDrawColor("#e2e8f0");
  doc.line(MARGIN, y + 7, right, y + 7);
  y += 24;
  doc.setFontSize(9.5);
  color("#1e293b");
  for (const line of invoice.lines || []) {
    const label = doc.splitTextToSize(pdfText(line.label), 255);
    doc.text(label, MARGIN, y);
    write(String(line.quantity), columns[1].x, y);
    write(formatEuroAmount(line.unitPrice), columns[2].x, y);
    write(formatDiscount(line), columns[3].x, y);
    write(formatEuroAmount(lineNet(line)), right, y, { align: "right" });
    y += label.length * 12 + 8;
    doc.setDrawColor("#f1f5f9");
    doc.line(MARGIN, y - 6, right, y - 6);
  }

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  color("#0f172a");
  write(formatEuroAmount(invoiceTotal(invoice)), right, y, { align: "right" });
  y += 22;

  if (String(invoice.invoiceNote || "").trim()) {
    const note = doc.splitTextToSize(pdfText(invoice.invoiceNote), CONTENT_WIDTH - 24);
    box(
      "Commentaire",
      (top) => {
        doc.setFontSize(9.5);
        color("#334155");
        doc.text(note, MARGIN + 12, top + 16);
      },
      30 + note.length * 12,
    );
  }

  if (options.payUrl) {
    box(
      "Payer par carte",
      (top) => {
        doc.setFontSize(9.5);
        color("#334155");
        write("Réglez cette facture en ligne, par carte bancaire :", MARGIN + 12, top + 16);
        doc.setTextColor("#1d4ed8");
        doc.textWithLink(pdfText("Payer la facture par carte"), MARGIN + 12, top + 30, {
          url: options.payUrl,
        });
      },
      52,
    );
  }

  const bank = bankLines(state.bank || {});
  box(
    "Coordonnées pour le virement",
    (top) => {
      doc.setFontSize(9.5);
      color("#334155");
      bank.forEach((line, index) => write(line, MARGIN + 12, top + 16 + index * 12));
    },
    30 + bank.length * 12,
  );

  const legal = doc.splitTextToSize(pdfText(REVERSE_CHARGE_MENTION), CONTENT_WIDTH - 24);
  doc.setFillColor("#fffbeb");
  doc.rect(MARGIN, y, CONTENT_WIDTH, 16 + legal.length * 11, "F");
  doc.setFillColor("#d97706");
  doc.rect(MARGIN, y, 2, 16 + legal.length * 11, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  color("#78350f");
  doc.text(legal, MARGIN + 12, y + 14);

  return Buffer.from(doc.output("arraybuffer")).toString("base64");
}

module.exports = { buildAgencyInvoicePdf };
