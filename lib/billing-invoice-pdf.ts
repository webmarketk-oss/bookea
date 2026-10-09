export async function invoiceHtmlToPdfDataUrl(html: string) {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasModule.default;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "794px";
  iframe.style.height = "1123px";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentDocument;
  if (!frameDoc) {
    iframe.remove();
    throw new Error("Impossible de préparer le PDF.");
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  await waitForImages(frameDoc);
  const canvas = await html2canvas(frameDoc.body, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: 794,
  });
  iframe.remove();

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pageWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;
  const image = canvas.toDataURL("image/png");
  let remaining = imageHeight;
  let offset = 0;

  pdf.addImage(image, "PNG", 0, offset, imageWidth, imageHeight);
  remaining -= pageHeight;
  while (remaining > 0) {
    offset -= pageHeight;
    pdf.addPage();
    pdf.addImage(image, "PNG", 0, offset, imageWidth, imageHeight);
    remaining -= pageHeight;
  }

  return pdf.output("datauristring");
}

function waitForImages(doc: Document) {
  const images = Array.from(doc.images);
  if (images.length === 0) {
    return Promise.resolve();
  }
  return Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.onload = () => resolve();
          image.onerror = () => resolve();
        }),
    ),
  );
}
