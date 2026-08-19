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

export type CenterServiceSetting = {
  id: number;
  name: string;
  category: string;
  color: string;
  price: number;
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
  sources?: CenterSourceSetting[];
  products?: CenterProductSetting[];
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

export function mergeCenterSettings(nextSettings: StoredCenterSettings) {
  if (typeof window === "undefined") {
    return;
  }

  const current = readCenterSettings() ?? {};
  window.localStorage.setItem(
    CENTER_SETTINGS_STORAGE_KEY,
    JSON.stringify({ ...current, ...nextSettings }),
  );
  window.dispatchEvent(new Event("bookea-center-settings-updated"));
}

export function getServiceNames(settings: StoredCenterSettings | null) {
  return (settings?.services ?? defaultCenterServices)
    .filter((service) => service.visible)
    .map((service) => service.name);
}

export function getSourceNames(settings: StoredCenterSettings | null) {
  return (settings?.sources ?? defaultCenterSources)
    .filter((source) => source.visible)
    .map((source) => source.name);
}
