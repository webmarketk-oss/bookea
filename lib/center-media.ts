export function servicePhotoByName(
  services: Array<{ name?: string; photo?: string }> | undefined,
  serviceName: string,
) {
  const key = serviceName.trim().toLowerCase();
  if (!key) {
    return "";
  }
  return (
    services?.find(
      (service) => (service.name ?? "").trim().toLowerCase() === key,
    )?.photo || ""
  );
}
export const defaultCoverPosition = { x: 50, y: 50 };
export const MAX_BANNER_PHOTOS = 8;
const MAX_STORED_DATA_URL = 220_000;

export type CoverPosition = {
  x: number;
  y: number;
};

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.min(100, Math.max(0, value));
}

export function normalizeCoverPosition(
  value?: Partial<CoverPosition> | null,
): CoverPosition {
  return {
    x: clampPercent(value?.x ?? defaultCoverPosition.x),
    y: clampPercent(value?.y ?? defaultCoverPosition.y),
  };
}

export function coverPositionCss(value?: Partial<CoverPosition> | null) {
  const next = normalizeCoverPosition(value);
  return `${next.x}% ${next.y}%`;
}

export function persistableMediaUrl(value?: string) {
  if (!value) {
    return "";
  }
  if (!value.startsWith("data:")) {
    return value;
  }
  return value.length <= MAX_STORED_DATA_URL ? value : "";
}

export function retainMediaUrl(
  cleaned?: string,
  requested?: string,
  previous?: string,
) {
  if (cleaned) {
    return cleaned;
  }
  if (!requested) {
    return "";
  }
  return previous || "";
}

export function retainMediaList(
  cleaned?: string[],
  requested?: string[],
  previous?: string[],
) {
  if (cleaned && cleaned.length > 0) {
    return cleaned;
  }
  if (Array.isArray(requested) && requested.length === 0) {
    return [];
  }
  if (Array.isArray(requested) && requested.length > 0) {
    return previous ?? [];
  }
  return cleaned ?? previous ?? [];
}

export function retainServicePhotos<T extends { name?: string; photo?: string }>(
  cleaned?: T[],
  requested?: T[],
  previous?: T[],
) {
  if (!cleaned?.length) {
    return cleaned;
  }
  const requestedByName = new Map(
    (requested ?? []).map((item) => [
      String(item.name || "").trim().toLowerCase(),
      item,
    ]),
  );
  const previousByName = new Map(
    (previous ?? []).map((item) => [
      String(item.name || "").trim().toLowerCase(),
      item,
    ]),
  );
  return cleaned.map((item) => {
    const key = String(item.name || "").trim().toLowerCase();
    return {
      ...item,
      photo: retainMediaUrl(
        persistableMediaUrl(item.photo),
        requestedByName.get(key)?.photo,
        previousByName.get(key)?.photo,
      ) || undefined,
    };
  });
}

export function retainPublicMedia<
  T extends {
    coverPreview?: string;
    logoPreview?: string;
    photoPreviews?: string[];
    services?: Array<{ name?: string; photo?: string }>;
  },
>(cleaned: T, requested: T, previous?: T | null) {
  return {
    ...cleaned,
    coverPreview: retainMediaUrl(
      cleaned.coverPreview,
      requested.coverPreview,
      previous?.coverPreview,
    ),
    logoPreview: retainMediaUrl(
      cleaned.logoPreview,
      requested.logoPreview,
      previous?.logoPreview,
    ),
    photoPreviews: retainMediaList(
      cleaned.photoPreviews,
      requested.photoPreviews,
      previous?.photoPreviews,
    ),
    services: retainServicePhotos(
      cleaned.services,
      requested.services,
      previous?.services,
    ),
  };
}

export function mergePublicMedia(
  local?: {
    coverPreview?: string;
    coverPosition?: CoverPosition;
    logoPreview?: string;
    photoPreviews?: string[];
  } | null,
  remote?: {
    coverPreview?: string;
    coverPosition?: CoverPosition;
    logoPreview?: string;
    photoPreviews?: string[];
  } | null,
) {
  return {
    coverPreview: remote?.coverPreview || local?.coverPreview || "",
    coverPosition: remote?.coverPosition || local?.coverPosition,
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
  kind: "cover" | "logo" | "photo" | "service",
) {
  const keepPng = kind === "logo" && /png$/i.test(file.type);
  const mime = keepPng ? "image/png" : "image/jpeg";
  let maxDim = kind === "logo" ? 640 : kind === "cover" ? 1400 : 1200;
  let quality = keepPng ? 0.92 : 0.7;

  try {
    const bitmap = await createImageBitmap(file);
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
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
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, quality),
      );
      if (blob && (keepPng || blob.size <= 900_000)) {
        break;
      }
      maxDim = Math.round(maxDim * 0.75);
      quality = Math.max(0.5, quality - 0.12);
    }
    bitmap.close();
    if (!blob) {
      throw new Error("blob");
    }
    return { blob, contentType: mime, dataUrl: await blobToDataUrl(blob) };
  } catch {
    if (file.size > 900_000) {
      throw new Error(
        "Cette photo est trop lourde. Envoie-la en JPG ou PNG, plus légère.",
      );
    }
    const dataUrl = await blobToDataUrl(file);
    return { blob: file, contentType: file.type || mime, dataUrl };
  }
}

export async function uploadCenterImage(options: {
  centerId: string;
  kind: "cover" | "logo" | "photo" | "service";
  file: File;
}) {
  if (!options.centerId || options.centerId === "local") {
    throw new Error("Le centre n’est pas encore chargé. Réessaie dans un instant.");
  }

  const prepared = await prepareCenterImage(options.file, options.kind);
  const fromApi = await uploadViaCenterMediaApi(options, prepared);
  if (fromApi) {
    return fromApi;
  }

  const fromStorage = await uploadViaSupabaseStorage(options, prepared);
  if (fromStorage) {
    return fromStorage;
  }

  throw new Error(
    "La photo n’a pas pu être enregistrée. Réessaie avec une image plus légère.",
  );
}

async function uploadViaCenterMediaApi(
  options: {
    centerId: string;
    kind: "cover" | "logo" | "photo" | "service";
    file: File;
  },
  prepared: { blob: Blob; contentType: string; dataUrl: string },
) {
  try {
    const response = await fetch("/api/center/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        centerId: options.centerId,
        kind: options.kind,
        contentType: prepared.contentType,
        filename: options.file.name,
        data: prepared.dataUrl.replace(/^data:[^;]+;base64,/, ""),
      }),
    });
    const json = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
    };
    if (json.ok && json.url) {
      return json.url;
    }
  } catch {
    // Try a direct Storage upload next.
  }
  return "";
}

async function uploadViaSupabaseStorage(
  options: {
    centerId: string;
    kind: "cover" | "logo" | "photo" | "service";
  },
  prepared: { blob: Blob; contentType: string },
) {
  try {
    const { createClient } = await import("@/lib/supabase");
    const supabase = createClient();
    const ext = prepared.contentType.includes("png") ? "png" : "jpg";
    const path = `${options.centerId}/${options.kind}-${Date.now()}.${ext}`;
    const uploaded = await supabase.storage
      .from("center-media")
      .upload(path, prepared.blob, {
        contentType: prepared.contentType,
        upsert: true,
      });
    if (uploaded.error) {
      return "";
    }
    return supabase.storage.from("center-media").getPublicUrl(path).data
      .publicUrl;
  } catch {
    return "";
  }
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
