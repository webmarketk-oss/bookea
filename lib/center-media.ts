export const MAX_BANNER_PHOTOS = 4;
const MAX_STORED_DATA_URL = 220_000;

export function persistableMediaUrl(value?: string) {
  if (!value) {
    return "";
  }
  if (!value.startsWith("data:")) {
    return value;
  }
  return value.length <= MAX_STORED_DATA_URL ? value : "";
}

export function mergePublicMedia(
  local?: {
    coverPreview?: string;
    logoPreview?: string;
    photoPreviews?: string[];
  } | null,
  remote?: {
    coverPreview?: string;
    logoPreview?: string;
    photoPreviews?: string[];
  } | null,
) {
  return {
    coverPreview: remote?.coverPreview || local?.coverPreview || "",
    logoPreview: remote?.logoPreview || local?.logoPreview || "",
    photoPreviews:
      remote?.photoPreviews && remote.photoPreviews.length > 0
        ? remote.photoPreviews
        : local?.photoPreviews ?? [],
  };
}

export function parseExternalReviewsCsv(content: string, source = "Google") {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = lines.map((line) =>
    line.includes(";")
      ? line.split(";").map((item) => item.trim())
      : line.split(",").map((item) => item.trim()),
  );

  const start = rows[0] && isReviewCsvHeader(rows[0]) ? 1 : 0;
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  return rows
    .slice(start)
    .map((cells, index) => {
      const [author, rating, comment, rowSource, date] = cells;
      return {
        id: now + index,
        author: author || "Cliente",
        rating: Math.min(5, Math.max(1, Number(rating) || 5)),
        source: rowSource || source,
        date: date || today,
        comment: comment || "",
        imported: true,
      };
    })
    .filter((review) => review.author !== "Cliente" || review.comment);
}

function isReviewCsvHeader(cells: string[]) {
  const head = cells.map((cell) => cell.toLowerCase()).join(" ");
  return /nom|name|author|cliente|note|rating|commentaire|comment/.test(head);
}

export async function prepareCenterImage(
  file: File,
  kind: "cover" | "logo" | "photo",
) {
  const maxDim = kind === "logo" ? 640 : 1600;
  const keepPng = kind === "logo" && /png$/i.test(file.type);
  const mime = keepPng ? "image/png" : "image/jpeg";
  const quality = keepPng ? 0.92 : 0.78;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("canvas");
    }
    if (!keepPng) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, quality),
    );
    if (!blob) {
      throw new Error("blob");
    }
    return { blob, contentType: mime, dataUrl: await blobToDataUrl(blob) };
  } catch {
    const dataUrl = await blobToDataUrl(file);
    return { blob: file, contentType: file.type || mime, dataUrl };
  }
}

export async function uploadCenterImage(options: {
  centerId: string;
  kind: "cover" | "logo" | "photo";
  file: File;
}) {
  const prepared = await prepareCenterImage(options.file, options.kind);
  const payload = {
    centerId: options.centerId,
    kind: options.kind,
    contentType: prepared.contentType,
    filename: options.file.name,
    data: prepared.dataUrl.replace(/^data:[^;]+;base64,/, ""),
  };

  try {
    const response = await fetch("/api/center/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
    };
    if (json.ok && json.url) {
      return json.url;
    }
  } catch {
    // Fallback to a compressed data URL stored in the centre settings.
  }

  return persistableMediaUrl(prepared.dataUrl) || prepared.dataUrl;
}

export async function deleteCenterImage(url: string, centerId: string) {
  if (!url || url.startsWith("data:")) {
    return;
  }

  try {
    await fetch("/api/center/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ centerId, url }),
    });
  } catch {
    // Local/remote settings still drop the URL even if storage delete fails.
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
