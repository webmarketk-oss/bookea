import { getActiveCenterContext } from "@/lib/center-access";
import { createClient } from "@/lib/supabase";

export const CENTER_SETTINGS_STORAGE_KEY = "bookea-center-settings";

export const publicCenterCategories = [
  "Coiffeur",
  "Institut beauté",
  "Soin du visage",
  "Minceur",
  "Beauté des ongles",
  "Beauté du regard",
  "Bien-être",
  "Spa",
  "Barbier",
];

export const defaultServiceCategories = [
  "Bilan",
  "Soin visage",
  "Soins minceur",
  "Soin du visage",
  "Minceur",
  "Laser",
  "Silhouette",
  "Beauté des ongles",
  "Beauté du regard",
  "Bien-être",
  "Spa",
];

export const defaultProductCategories = [
  "Produits visage",
  "Produits corps",
  "Soin après séance",
  "Visage",
  "Compléments",
  "Hygiène",
];

function mergeNamedCategories(
  stored?: string[] | null,
  items?: Array<{ category?: string }> | null,
  fallback: string[] = [],
) {
  const values = [
    ...(stored && stored.length > 0 ? stored : fallback),
    ...(items ?? []).map((item) => item.category ?? ""),
  ]
    .map((value) => value.trim())
    .filter(
      (value) =>
        value.length > 0 && value.toLowerCase() !== "catégorie",
    );

  const seen = new Set<string>();

  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function mergeServiceCategories(
  stored?: string[] | null,
  services?: Array<{ category?: string }> | null,
) {
  return mergeNamedCategories(stored, services, defaultServiceCategories);
}

export function mergeProductCategories(
  stored?: string[] | null,
  products?: Array<{ category?: string }> | null,
) {
  return mergeNamedCategories(stored, products, defaultProductCategories);
}

export function sortServicesByCategory<
  T extends { category?: string; topListed?: boolean },
>(services: T[], categoryOrder: string[] = []) {
  const order = new Map(
    categoryOrder.map((name, index) => [name.trim().toLowerCase(), index]),
  );

  return services
    .map((service, index) => ({ service, index }))
    .sort((a, b) => {
      const categoryA = (a.service.category ?? "").trim().toLowerCase();
      const categoryB = (b.service.category ?? "").trim().toLowerCase();
      const rankA = order.get(categoryA) ?? Number.MAX_SAFE_INTEGER;
      const rankB = order.get(categoryB) ?? Number.MAX_SAFE_INTEGER;

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      if (categoryA !== categoryB) {
        return categoryA.localeCompare(categoryB, "fr");
      }

      const pinned =
        Number(Boolean(b.service.topListed)) - Number(Boolean(a.service.topListed));
      if (pinned !== 0) {
        return pinned;
      }

      return a.index - b.index;
    })
    .map(({ service }) => service);
}

export type CenterServiceSetting = {
  id: number;
  name: string;
  category: string;
  color: string;
  price: number;
  onQuote?: boolean;
  vatRate: number;
  duration: number;
  depositEnabled: boolean;
  depositAmount: number;
  visible: boolean;
  topListed: boolean;
  cabins: string;
  practitioners: string;
};

export type CenterSourceSetting = {
  id: number;
  name: string;
  channel: string;
  color: string;
  visible: boolean;
  organic: boolean;
};

export type CenterProductSetting = {
  id: number;
  name: string;
  category: string;
  price: number;
  vatRate: number;
  stock: number;
  sku: string;
  visible: boolean;
};

export type CenterDepositLinkSetting = {
  id: number;
  name: string;
  url: string;
  message: string;
  active: boolean;
};

export type CenterExternalReview = {
  id: number;
  author: string;
  rating: number;
  source: string;
  date: string;
  comment: string;
  imported: boolean;
};

export type CenterPublicOffer = {
  id: number;
  title: string;
  serviceName: string;
  oldPrice: number;
  price: number;
  tag: string;
  endsAt: string;
  limitedSpots: number;
  visible: boolean;
};

export type CenterReviewAutomation = {
  enabled: boolean;
  emailSubject: string;
  emailDelayHours: number;
  loyaltyPointsReward: number;
};

export type StoredCenterSettings = {
  center?: {
    name: string;
    slug: string;
    city: string;
    address: string;
    postalCode?: string;
    phone: string;
    email: string;
    description: string;
    bookingMode: string;
    published: boolean;
    categories?: string[];
    profileColor?: string;
    socialLinks?: {
      instagram?: string;
      tiktok?: string;
      facebook?: string;
    };
  };
  services?: CenterServiceSetting[];
  serviceCategories?: string[];
  sources?: CenterSourceSetting[];
  products?: CenterProductSetting[];
  productCategories?: string[];
  depositLinks?: CenterDepositLinkSetting[];
  stripeConnected?: boolean;
  coverPreview?: string;
  logoPreview?: string;
  photoPreviews?: string[];
  externalReviews?: CenterExternalReview[];
  offers?: CenterPublicOffer[];
  reviewAutomation?: CenterReviewAutomation;
};

export const defaultCenterServices: CenterServiceSetting[] = [
  {
    id: 1,
    name: "Hydrafacial",
    category: "Soin du visage",
    color: "#06b6d4",
    price: 89,
    vatRate: 20,
    duration: 60,
    depositEnabled: true,
    depositAmount: 25,
    visible: true,
    topListed: true,
    cabins: "Cabine 3",
    practitioners: "Camille, Samantha",
  },
  {
    id: 2,
    name: "Épilation Laser",
    category: "Laser",
    color: "#2563eb",
    price: 120,
    vatRate: 20,
    duration: 45,
    depositEnabled: true,
    depositAmount: 30,
    visible: true,
    topListed: true,
    cabins: "Cabine 1",
    practitioners: "Samantha, Marie L.",
  },
  {
    id: 3,
    name: "Cryolipolyse",
    category: "Silhouette",
    color: "#8b5cf6",
    price: 180,
    onQuote: true,
    vatRate: 20,
    duration: 75,
    depositEnabled: false,
    depositAmount: 0,
    visible: true,
    topListed: false,
    cabins: "Cabine 2",
    practitioners: "Aurélie",
  },
];

export const defaultCenterSources: CenterSourceSetting[] = [
  {
    id: 1,
    name: "Organique",
    channel: "Bookea public",
    color: "bg-emerald-100 text-emerald-700",
    visible: true,
    organic: true,
  },
  {
    id: 2,
    name: "Facebook",
    channel: "Meta",
    color: "bg-blue-100 text-blue-700",
    visible: true,
    organic: false,
  },
  {
    id: 3,
    name: "Instagram",
    channel: "Meta",
    color: "bg-pink-100 text-pink-700",
    visible: true,
    organic: false,
  },
  {
    id: 4,
    name: "Google",
    channel: "Recherche",
    color: "bg-sky-100 text-sky-700",
    visible: true,
    organic: false,
  },
  {
    id: 5,
    name: "Site Web",
    channel: "Site",
    color: "bg-slate-100 text-slate-700",
    visible: true,
    organic: false,
  },
];

export const defaultCenterDepositLinks: CenterDepositLinkSetting[] = [
  {
    id: 1,
    name: "Acompte soin visage",
    url: "https://pay.bookeai.fr/acompte-visage",
    message:
      "Bonjour, voici le lien pour régler votre acompte soin visage et bloquer votre rendez-vous Bookea :",
    active: true,
  },
  {
    id: 2,
    name: "Acompte laser",
    url: "https://pay.bookeai.fr/acompte-laser",
    message:
      "Bonjour, voici le lien pour régler votre acompte laser et confirmer votre créneau :",
    active: true,
  },
  {
    id: 3,
    name: "Acompte cure",
    url: "https://pay.bookeai.fr/acompte-cure",
    message:
      "Bonjour, voici le lien pour régler l'acompte de votre cure et réserver vos séances :",
    active: true,
  },
];

export const defaultCenterProducts: CenterProductSetting[] = [
  {
    id: 1,
    name: "Sérum hydratant",
    category: "Produits visage",
    price: 39,
    vatRate: 20,
    stock: 18,
    sku: "HYD-001",
    visible: true,
  },
  {
    id: 2,
    name: "Crème post laser",
    category: "Produits corps",
    price: 29,
    vatRate: 20,
    stock: 12,
    sku: "LAS-002",
    visible: true,
  },
];

export const defaultExternalReviews: CenterExternalReview[] = [
  {
    id: 1,
    author: "Laura P.",
    rating: 5,
    source: "Google",
    date: "2026-07-18",
    comment:
      "Très bon accueil, explications claires et rendez-vous facile à prendre.",
    imported: true,
  },
  {
    id: 2,
    author: "Nadia A.",
    rating: 5,
    source: "Google",
    date: "2026-07-12",
    comment:
      "Centre propre, équipe douce et résultat visible dès la première séance.",
    imported: true,
  },
  {
    id: 3,
    author: "Emma B.",
    rating: 4,
    source: "Planity",
    date: "2026-07-05",
    comment: "Bon suivi après la séance et planning pratique.",
    imported: true,
  },
];

export const defaultCenterOffers: CenterPublicOffer[] = [
  {
    id: 1,
    title: "Hydrafacial découverte",
    serviceName: "Hydrafacial",
    oldPrice: 99,
    price: 79,
    tag: "Offre du moment",
    endsAt: "2026-08-15",
    limitedSpots: 8,
    visible: true,
  },
  {
    id: 2,
    title: "Laser jambes",
    serviceName: "Épilation Laser",
    oldPrice: 150,
    price: 120,
    tag: "Bientôt épuisée",
    endsAt: "2026-08-02",
    limitedSpots: 3,
    visible: true,
  },
];

export const defaultReviewAutomation: CenterReviewAutomation = {
  enabled: true,
  emailSubject: "Comment s'est passé votre rendez-vous ?",
  emailDelayHours: 2,
  loyaltyPointsReward: 25,
};

export function readCenterSettings(): StoredCenterSettings | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(CENTER_SETTINGS_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as StoredCenterSettings) : null;
  } catch {
    window.localStorage.removeItem(CENTER_SETTINGS_STORAGE_KEY);
    return null;
  }
}

export function mergeCenterSettings(
  nextSettings: StoredCenterSettings,
  options?: { emit?: boolean },
) {
  writeCenterSettingsSafe(nextSettings, options?.emit !== false);
}

export async function loadPublicCenterProfile() {
  const local = readCenterSettings();

  try {
    const context = await getActiveCenterContext();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("centers")
      .select(CENTER_PROFILE_COLUMNS)
      .eq("id", context.centerId)
      .maybeSingle();

    if (error || !data) {
      return { centerId: context.centerId, settings: local };
    }

    const remote = storedSettingsFromCenterRow(data as CenterProfileRow);
    const hasRemotePublic = hasStoredPublicSettings(data.settings);
    const merged = mergeLocalAndRemote(local, remote, hasRemotePublic);

    if (hasRemotePublic || !local) {
      writeCenterSettingsSafe(merged);
    }

    return { centerId: context.centerId, settings: merged };
  } catch {
    return { settings: local };
  }
}

export async function loadPublishedCenterProfile(slug: string) {
  const normalized = slug.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const supabase = createClient();
  const bySlug = await supabase
    .from("centers")
    .select(CENTER_PROFILE_COLUMNS)
    .eq("slug", normalized)
    .eq("public_profile_enabled", true)
    .maybeSingle();

  let row = (bySlug.data ?? null) as CenterProfileRow | null;

  if (!row) {
    const byPublicSlug = await supabase
      .from("centers")
      .select(CENTER_PROFILE_COLUMNS)
      .eq("public_slug", normalized)
      .eq("public_profile_enabled", true)
      .maybeSingle();

    if (!byPublicSlug.error) {
      row = (byPublicSlug.data ?? null) as CenterProfileRow | null;
    }
  }

  if (!row) {
    return null;
  }

  return mergeLocalAndRemote(
    readCenterSettings(),
    storedSettingsFromCenterRow(row),
    hasStoredPublicSettings(row.settings),
  );
}

export async function savePublicCenterProfile(nextSettings: StoredCenterSettings) {
  writeCenterSettingsSafe(nextSettings);

  const context = await getActiveCenterContext();
  const supabase = createClient();
  const { data } = await supabase
    .from("centers")
    .select("settings, slug")
    .eq("id", context.centerId)
    .maybeSingle();

  const currentSettings = asRecord(data?.settings);
  const currentSlug = asString(data?.slug, context.centerSlug);
  const nextSlug = sanitizeCenterSlug(nextSettings.center?.slug ?? "", currentSlug);
  const publicSettings = withoutDataUrls(nextSettings);

  const payload: Record<string, unknown> = {
    name: nextSettings.center?.name?.trim() || context.centerName,
    slug: nextSlug,
    public_slug: nextSlug,
    city: emptyToNull(nextSettings.center?.city),
    email: emptyToNull(nextSettings.center?.email),
    phone: emptyToNull(nextSettings.center?.phone),
    description: emptyToNull(nextSettings.center?.description),
    address_line1: emptyToNull(nextSettings.center?.address),
    postal_code: emptyToNull(nextSettings.center?.postalCode),
    theme_color: nextSettings.center?.profileColor || "#2563eb",
    public_profile_enabled: nextSettings.center?.published !== false,
    is_public: nextSettings.center?.published !== false,
    instagram_url: emptyToNull(nextSettings.center?.socialLinks?.instagram),
    facebook_url: emptyToNull(nextSettings.center?.socialLinks?.facebook),
    tiktok_url: emptyToNull(nextSettings.center?.socialLinks?.tiktok),
    settings: {
      ...currentSettings,
      public: publicSettings,
    },
    updated_at: new Date().toISOString(),
  };

  let result = await supabase
    .from("centers")
    .update(payload)
    .eq("id", context.centerId)
    .select("id")
    .maybeSingle();

  if (result.error && isUnknownColumnError(result.error.message)) {
    result = await supabase
      .from("centers")
      .update({
        name: payload.name,
        slug: payload.slug,
        city: payload.city,
        email: payload.email,
        phone: payload.phone,
        description: payload.description,
        address_line1: payload.address_line1,
        postal_code: payload.postal_code,
        theme_color: payload.theme_color,
        public_profile_enabled: payload.public_profile_enabled,
        instagram_url: payload.instagram_url,
        facebook_url: payload.facebook_url,
        tiktok_url: payload.tiktok_url,
        settings: payload.settings,
        updated_at: payload.updated_at,
      })
      .eq("id", context.centerId)
      .select("id")
      .maybeSingle();
  }

  if (
    result.error &&
    isSlugConflict(result.error.message) &&
    nextSlug !== currentSlug
  ) {
    result = await supabase
      .from("centers")
      .update({
        ...payload,
        slug: currentSlug,
        public_slug: currentSlug,
      })
      .eq("id", context.centerId)
      .select("id")
      .maybeSingle();

    if (!result.error && result.data?.id) {
      writeCenterSettingsSafe({
        ...nextSettings,
        center: nextSettings.center
          ? { ...nextSettings.center, slug: currentSlug }
          : nextSettings.center,
      });
    }
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data?.id) {
    throw new Error(
      "Enregistrement refusé. Seul un gérant du centre peut modifier la fiche publique.",
    );
  }

  return { centerId: context.centerId };
}

const CENTER_PROFILE_COLUMNS =
  "name,slug,city,email,phone,description,address_line1,postal_code,theme_color,public_profile_enabled,instagram_url,facebook_url,tiktok_url,settings";

type CenterProfileRow = {
  address_line1?: string | null;
  city?: string | null;
  description?: string | null;
  email?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  name?: string | null;
  phone?: string | null;
  postal_code?: string | null;
  public_profile_enabled?: boolean | null;
  settings?: unknown;
  slug?: string | null;
  theme_color?: string | null;
  tiktok_url?: string | null;
};

function writeCenterSettingsSafe(
  nextSettings: StoredCenterSettings,
  emit = true,
) {
  if (typeof window === "undefined") {
    return;
  }

  const merged = { ...(readCenterSettings() ?? {}), ...nextSettings };

  try {
    window.localStorage.setItem(
      CENTER_SETTINGS_STORAGE_KEY,
      JSON.stringify(merged),
    );
  } catch {
    try {
      window.localStorage.setItem(
        CENTER_SETTINGS_STORAGE_KEY,
        JSON.stringify(withoutDataUrls(merged)),
      );
    } catch {
      // Keep the in-memory save path even if the browser cache is full.
    }
  }

  if (emit) {
    window.dispatchEvent(new Event("bookea-center-settings-updated"));
  }
}

function storedSettingsFromCenterRow(row: CenterProfileRow): StoredCenterSettings {
  const publicSettings = asRecord(asRecord(row.settings).public);
  const fromJsonCenter = asRecord(publicSettings.center);
  const socialLinks = asRecord(fromJsonCenter.socialLinks);

  return {
    center: {
      name: asString(row.name, asString(fromJsonCenter.name)),
      slug: asString(row.slug, asString(fromJsonCenter.slug)),
      city: asString(row.city, asString(fromJsonCenter.city)),
      address: asString(row.address_line1, asString(fromJsonCenter.address)),
      postalCode: asString(row.postal_code, asString(fromJsonCenter.postalCode)),
      phone: asString(row.phone, asString(fromJsonCenter.phone)),
      email: asString(row.email, asString(fromJsonCenter.email)),
      description: asString(row.description, asString(fromJsonCenter.description)),
      bookingMode: asString(
        fromJsonCenter.bookingMode,
        "Réservation avec acompte selon prestation",
      ),
      published: row.public_profile_enabled !== false,
      categories: asStringArray(fromJsonCenter.categories),
      profileColor: asString(
        row.theme_color,
        asString(fromJsonCenter.profileColor, "#2563eb"),
      ),
      socialLinks: {
        instagram: asString(row.instagram_url, asString(socialLinks.instagram)),
        facebook: asString(row.facebook_url, asString(socialLinks.facebook)),
        tiktok: asString(row.tiktok_url, asString(socialLinks.tiktok)),
      },
    },
    services: asArray(publicSettings.services),
    serviceCategories: asStringArray(publicSettings.serviceCategories),
    sources: asArray(publicSettings.sources),
    products: asArray(publicSettings.products),
    productCategories: asStringArray(publicSettings.productCategories),
    depositLinks: asArray(publicSettings.depositLinks),
    stripeConnected:
      typeof publicSettings.stripeConnected === "boolean"
        ? publicSettings.stripeConnected
        : undefined,
    coverPreview: asOptionalString(publicSettings.coverPreview),
    logoPreview: asOptionalString(publicSettings.logoPreview),
    photoPreviews: asStringArray(publicSettings.photoPreviews),
    externalReviews: asArray(publicSettings.externalReviews),
    offers: asArray(publicSettings.offers),
    reviewAutomation: Object.keys(asRecord(publicSettings.reviewAutomation))
      .length
      ? (asRecord(publicSettings.reviewAutomation) as CenterReviewAutomation)
      : undefined,
  };
}

function mergeLocalAndRemote(
  local: StoredCenterSettings | null,
  remote: StoredCenterSettings,
  remotePublicSaved: boolean,
): StoredCenterSettings {
  if (!remotePublicSaved && local) {
    return {
      ...remote,
      ...local,
      center: {
        ...remote.center,
        ...local.center,
        categories:
          local.center?.categories && local.center.categories.length > 0
            ? local.center.categories
            : remote.center?.categories,
        socialLinks: {
          ...remote.center?.socialLinks,
          ...local.center?.socialLinks,
        },
      },
    };
  }

  return {
    ...local,
    ...remote,
    center: remote.center
      ? {
          ...local?.center,
          ...remote.center,
          categories:
            remote.center.categories && remote.center.categories.length > 0
              ? remote.center.categories
              : local?.center?.categories,
          socialLinks: {
            ...local?.center?.socialLinks,
            ...remote.center.socialLinks,
          },
        }
      : local?.center,
    coverPreview: remote.coverPreview || local?.coverPreview,
    logoPreview: remote.logoPreview || local?.logoPreview,
    photoPreviews:
      remote.photoPreviews && remote.photoPreviews.length > 0
        ? remote.photoPreviews
        : local?.photoPreviews,
    services: remote.services ?? local?.services,
    serviceCategories: remote.serviceCategories ?? local?.serviceCategories,
    sources: remote.sources ?? local?.sources,
    products: remote.products ?? local?.products,
    productCategories: remote.productCategories ?? local?.productCategories,
    depositLinks: remote.depositLinks ?? local?.depositLinks,
    externalReviews: remote.externalReviews ?? local?.externalReviews,
    offers: remote.offers ?? local?.offers,
    reviewAutomation: remote.reviewAutomation ?? local?.reviewAutomation,
    stripeConnected: remote.stripeConnected ?? local?.stripeConnected,
  };
}

function hasStoredPublicSettings(settings: unknown) {
  return Object.keys(asRecord(asRecord(settings).public)).length > 0;
}

function withoutDataUrls(settings: StoredCenterSettings): StoredCenterSettings {
  return {
    ...settings,
    coverPreview: isDataUrl(settings.coverPreview) ? "" : settings.coverPreview,
    logoPreview: isDataUrl(settings.logoPreview) ? "" : settings.logoPreview,
    photoPreviews: (settings.photoPreviews ?? []).filter((src) => !isDataUrl(src)),
  };
}

function sanitizeCenterSlug(value: string, fallback: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || fallback;
}

function isDataUrl(value?: string) {
  return Boolean(value?.startsWith("data:"));
}

function isUnknownColumnError(message: string) {
  return /column|schema cache|could not find/i.test(message);
}

function isSlugConflict(message: string) {
  return /duplicate|unique|slug/i.test(message);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray<T>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? (value as T[]) : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : undefined;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function emptyToNull(value?: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

export function getServiceNames(settings: StoredCenterSettings | null) {
  return getCenterServices(settings).map((service) => service.name);
}

export function getCenterServices(settings?: StoredCenterSettings | null) {
  const stored = settings === undefined ? readCenterSettings() : settings;
  const services = (stored?.services ?? defaultCenterServices).filter(
    (service) => service.visible !== false,
  );

  return sortServicesByCategory(
    services,
    mergeServiceCategories(stored?.serviceCategories, stored?.services),
  );
}

export function getCenterProducts(settings?: StoredCenterSettings | null) {
  const stored = settings === undefined ? readCenterSettings() : settings;
  const products = (stored?.products ?? defaultCenterProducts).filter(
    (product) => product.visible !== false,
  );

  return sortServicesByCategory(
    products,
    mergeProductCategories(stored?.productCategories, stored?.products),
  );
}

export function formatCenterServicePrice(service: {
  onQuote?: boolean;
  price: number;
}) {
  return service.onQuote ? "Sur devis" : `${service.price} €`;
}

export function addCenterService(input: {
  duration?: number;
  name: string;
}) {
  const name = input.name.trim();
  const duration = input.duration && input.duration > 0 ? input.duration : 60;
  const existing = readCenterSettings()?.services ?? defaultCenterServices;
  const already = existing.find(
    (service) => service.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (already) {
    if (already.visible === false) {
      const nextServices = existing.map((service) =>
        service.id === already.id ? { ...service, visible: true } : service
      );
      mergeCenterSettings({ services: nextServices });
      return { ...already, visible: true };
    }

    return already;
  }

  const nextService: CenterServiceSetting = {
    id: Date.now(),
    name,
    category:
      mergeServiceCategories(readCenterSettings()?.serviceCategories, existing)[0] ??
      "Soin",
    color: "#2563eb",
    price: 0,
    onQuote: false,
    vatRate: 20,
    duration,
    depositEnabled: false,
    depositAmount: 0,
    visible: true,
    topListed: false,
    cabins: "Toutes",
    practitioners: "Toutes",
  };

  mergeCenterSettings({ services: [nextService, ...existing] });

  return nextService;
}

export function getSourceNames(settings: StoredCenterSettings | null) {
  return (settings?.sources ?? defaultCenterSources)
    .filter((source) => source.visible)
    .map((source) => source.name);
}
