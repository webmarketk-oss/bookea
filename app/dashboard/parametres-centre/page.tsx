"use client";

import Link from "next/link";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BadgeEuro,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Eye,
  EyeOff,
  ImagePlus,
  MapPin,
  Package,
  Plus,
  Save,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  CENTER_SETTINGS_STORAGE_KEY,
  defaultCenterDepositLinks,
  defaultCenterOffers,
  defaultExternalReviews,
  defaultProductCategories,
  defaultReviewAutomation,
  defaultServiceCategories,
  formatCenterServicePrice,
  loadPublicCenterProfile,
  mergeProductCategories,
  mergeServiceCategories,
  publicCenterCategories,
  savePublicCenterProfile,
  sortServicesByCategory,
  type CenterDepositLinkSetting,
  type CenterExternalReview,
  type CenterPublicOffer,
  type CenterReviewAutomation,
} from "@/lib/center-settings";
import { cabins as agendaCabins, practitioners as agendaPractitioners } from "@/lib/agenda-data";
import { loadCenterAssignmentOptions } from "@/lib/agenda-supabase";
import { PlaceSuggestField } from "@/components/forms/place-suggest-field";

type Service = {
  id: number;
  name: string;
  category: string;
  color: string;
  price: number;
  onQuote: boolean;
  vatRate: number;
  duration: number;
  depositEnabled: boolean;
  depositAmount: number;
  visible: boolean;
  topListed: boolean;
  cabins: string;
  practitioners: string;
};

type CenterProfile = {
  name: string;
  slug: string;
  city: string;
  address: string;
  postalCode: string;
  phone: string;
  email: string;
  description: string;
  bookingMode: string;
  published: boolean;
  categories: string[];
  profileColor: string;
  socialLinks: {
    instagram: string;
    tiktok: string;
    facebook: string;
  };
};

type LeadSource = {
  id: number;
  name: string;
  channel: string;
  color: string;
  visible: boolean;
  organic: boolean;
};

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  vatRate: number;
  stock: number;
  sku: string;
  visible: boolean;
};

type StoredCenterSettings = {
  center: CenterProfile;
  services: Service[];
  serviceCategories: string[];
  sources: LeadSource[];
  products: Product[];
  productCategories: string[];
  depositLinks: CenterDepositLinkSetting[];
  stripeConnected: boolean;
  coverPreview: string;
  logoPreview: string;
  photoPreviews: string[];
  externalReviews: CenterExternalReview[];
  offers: CenterPublicOffer[];
  reviewAutomation: CenterReviewAutomation;
};

const centerSettingsStorageKey = CENTER_SETTINGS_STORAGE_KEY;

const initialServices: Service[] = [
  {
    id: 1,
    name: "Hydrafacial",
    category: "Soin du visage",
    color: "#06b6d4",
    price: 89,
    onQuote: false,
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
    onQuote: false,
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
    category: "Minceur",
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

const initialSources: LeadSource[] = [
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
    color: "bg-amber-100 text-amber-700",
    visible: true,
    organic: false,
  },
];

const initialProducts: Product[] = [
  {
    id: 1,
    name: "Crème post-laser",
    category: "Soin après séance",
    price: 29,
    vatRate: 20,
    stock: 18,
    sku: "CREME-LASER",
    visible: true,
  },
  {
    id: 2,
    name: "Sérum hydratant",
    category: "Visage",
    price: 45,
    vatRate: 20,
    stock: 12,
    sku: "SERUM-HYDRA",
    visible: true,
  },
];

const profileColorPresets = [
  { name: "Bookea", color: "#2563eb" },
  { name: "Violet glow", color: "#7c3aed" },
  { name: "Rose beauté", color: "#ec4899" },
  { name: "Spa vert", color: "#059669" },
  { name: "Ambre luxe", color: "#d97706" },
  { name: "Noir premium", color: "#0f172a" },
];

const serviceColorPresets = [
  "#2563eb",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
];

const serviceColorFallback = (index: number) =>
  serviceColorPresets[index % serviceColorPresets.length];

export default function CenterSettingsPage() {
  const [activeTab, setActiveTab] = useState("profil");
  const [services, setServices] = useState(initialServices);
  const [serviceCategories, setServiceCategories] = useState(
    defaultServiceCategories,
  );
  const [categoryDraft, setCategoryDraft] = useState("");
  const [productCategories, setProductCategories] = useState(
    defaultProductCategories,
  );
  const [productCategoryDraft, setProductCategoryDraft] = useState("");
  const [centerCabins, setCenterCabins] = useState(
    agendaCabins.map((cabin) => cabin.name),
  );
  const [centerPractitioners, setCenterPractitioners] = useState(
    agendaPractitioners.map((practitioner) => practitioner.name),
  );
  const [sources, setSources] = useState(initialSources);
  const [products, setProducts] = useState(initialProducts);
  const [depositLinks, setDepositLinks] =
    useState<CenterDepositLinkSetting[]>(defaultCenterDepositLinks);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const noticeTimer = useRef(0);
  const [coverPreview, setCoverPreview] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [externalReviews, setExternalReviews] =
    useState<CenterExternalReview[]>(defaultExternalReviews);
  const [offers, setOffers] = useState<CenterPublicOffer[]>(defaultCenterOffers);
  const [reviewAutomation, setReviewAutomation] = useState<CenterReviewAutomation>(
    defaultReviewAutomation,
  );
  const [reviewSource, setReviewSource] = useState("Google");
  const [reviewUrl, setReviewUrl] = useState("");
  const [importingReviews, setImportingReviews] = useState(false);
  const [manualReview, setManualReview] = useState({
    author: "",
    rating: 5,
    comment: "",
  });
  const [center, setCenter] = useState<CenterProfile>({
    name: "JFG Clinique Clermont-Ferrand",
    slug: "jfg-clinique-clermont",
    city: "Clermont-Ferrand",
    address: "12 avenue des Volcans, 63000 Clermont-Ferrand",
    postalCode: "63000",
    phone: "04 73 00 00 00",
    email: "contact@jfg-clinique.fr",
    description:
      "Centre esthétique spécialisé en soins visage, laser, cryolipolyse et accompagnement personnalisé.",
    bookingMode: "Réservation avec acompte selon prestation",
    published: true,
    categories: [
      "Institut beauté",
      "Soin du visage",
      "Minceur",
      "Beauté des ongles",
      "Beauté du regard",
    ],
    profileColor: "#2563eb",
    socialLinks: {
      instagram: "https://instagram.com/jfgclinique",
      tiktok: "https://www.tiktok.com/@jfgclinique",
      facebook: "https://facebook.com/jfgclinique",
    },
  });

  const applyStoredSettings = (parsed: Partial<StoredCenterSettings>) => {
    if (parsed.center) {
      setCenter((current) => ({
        ...current,
        ...parsed.center,
        postalCode: parsed.center?.postalCode ?? current.postalCode,
        profileColor: parsed.center?.profileColor ?? current.profileColor,
        categories:
          parsed.center?.categories && parsed.center.categories.length > 0
            ? parsed.center.categories
            : current.categories,
        socialLinks: {
          ...current.socialLinks,
          ...parsed.center?.socialLinks,
        },
      }));
    }
    if (parsed.services) {
      setServices(
        parsed.services.map((service, index) => ({
          ...service,
          color: service.color ?? serviceColorFallback(index),
          vatRate: service.vatRate ?? 20,
          onQuote: service.onQuote === true,
        })),
      );
    }
    if (parsed.serviceCategories || parsed.services) {
      setServiceCategories((current) =>
        mergeServiceCategories(
          parsed.serviceCategories ?? current,
          parsed.services,
        ),
      );
    }
    if (parsed.sources) setSources(parsed.sources);
    if (parsed.products) setProducts(parsed.products);
    if (parsed.productCategories || parsed.products) {
      setProductCategories((current) =>
        mergeProductCategories(
          parsed.productCategories ?? current,
          parsed.products,
        ),
      );
    }
    if (parsed.depositLinks) setDepositLinks(parsed.depositLinks);
    if (typeof parsed.stripeConnected === "boolean") {
      setStripeConnected(parsed.stripeConnected);
    }
    if (parsed.coverPreview) setCoverPreview(parsed.coverPreview);
    if (parsed.logoPreview) setLogoPreview(parsed.logoPreview);
    if (parsed.photoPreviews) setPhotoPreviews(parsed.photoPreviews);
    if (parsed.externalReviews) setExternalReviews(parsed.externalReviews);
    if (parsed.offers) setOffers(parsed.offers);
    if (parsed.reviewAutomation) {
      setReviewAutomation({
        ...defaultReviewAutomation,
        ...parsed.reviewAutomation,
      });
    }
  };

  const showNotice = (message: string, isError = false) => {
    window.clearTimeout(noticeTimer.current);
    setSaveError(isError);
    setSavedMessage(message);
    noticeTimer.current = window.setTimeout(
      () => setSavedMessage(""),
      isError ? 5200 : 2400,
    );
  };

  const visibleServices = useMemo(
    () => services.filter((service) => service.visible),
    [services],
  );
  const depositServices = useMemo(
    () => services.filter((service) => service.depositEnabled).length,
    [services],
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(centerSettingsStorageKey);
      if (stored) {
        applyStoredSettings(JSON.parse(stored) as Partial<StoredCenterSettings>);
      }
    } catch {
      window.localStorage.removeItem(centerSettingsStorageKey);
    }

    void loadPublicCenterProfile().then((loaded) => {
      if (loaded.settings) {
        applyStoredSettings(loaded.settings as Partial<StoredCenterSettings>);
      }
    });

    void loadCenterAssignmentOptions().then((loaded) => {
      if (loaded.cabins.length > 0) {
        setCenterCabins(loaded.cabins);
      }
      if (loaded.practitioners.length > 0) {
        setCenterPractitioners(loaded.practitioners);
      }
    });
  }, []);

  const updateService = <K extends keyof Service>(
    id: number,
    key: K,
    value: Service[K],
  ) => {
    setServices((current) =>
      current.map((service) =>
        service.id === id ? { ...service, [key]: value } : service,
      ),
    );
  };

  const moveService = (id: number, direction: -1 | 1) => {
    setServices((current) => {
      const sorted = sortServicesByCategory(current, categoryOptions);
      const index = sorted.findIndex((service) => service.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) {
        return current;
      }
      if (
        sorted[index].category.toLowerCase() !==
        sorted[nextIndex].category.toLowerCase()
      ) {
        return current;
      }
      const copy = [...sorted];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  const addService = () => {
    setServices((current) => [
      {
        id: Date.now(),
        name: "Nouveau soin",
        category: serviceCategories[0] ?? "Soin visage",
        color: serviceColorFallback(current.length),
        price: 0,
        onQuote: false,
        vatRate: 20,
        duration: 60,
        depositEnabled: false,
        depositAmount: 0,
        visible: true,
        topListed: true,
        cabins: "Toutes",
        practitioners: "Toutes",
      },
      ...current,
    ]);
    setSavedMessage("Nouvelle prestation ajoutée dans sa catégorie.");
    window.setTimeout(() => setSavedMessage(""), 2400);
  };

  const categoryOptions = useMemo(
    () => mergeServiceCategories(serviceCategories, services),
    [serviceCategories, services],
  );
  const cabinOptions = useMemo(
    () =>
      mergeAssignmentOptions(
        centerCabins,
        services.map((service) => service.cabins),
      ),
    [centerCabins, services],
  );
  const practitionerOptions = useMemo(
    () =>
      mergeAssignmentOptions(
        centerPractitioners,
        services.map((service) => service.practitioners),
      ),
    [centerPractitioners, services],
  );
  const displayedServices = useMemo(
    () => sortServicesByCategory(services, categoryOptions),
    [categoryOptions, services],
  );
  const productCategoryOptions = useMemo(
    () => mergeProductCategories(productCategories, products),
    [productCategories, products],
  );
  const displayedProducts = useMemo(
    () => sortServicesByCategory(products, productCategoryOptions),
    [productCategoryOptions, products],
  );

  const createServiceCategory = (rawName: string, serviceId?: number) => {
    const name = rawName.trim();

    if (!name) {
      return false;
    }

    setServiceCategories((current) =>
      mergeServiceCategories([...current, name], services),
    );

    if (serviceId) {
      updateService(serviceId, "category", name);
    }

    setCategoryDraft("");
    return true;
  };

  const removeServiceCategory = (name: string) => {
    setServiceCategories((current) =>
      current.filter((item) => item.toLowerCase() !== name.toLowerCase()),
    );
  };

  const createProductCategory = (rawName: string, productId?: number) => {
    const name = rawName.trim();

    if (!name) {
      return false;
    }

    setProductCategories((current) =>
      mergeProductCategories([...current, name], products),
    );

    if (productId) {
      updateProduct(productId, "category", name);
    }

    setProductCategoryDraft("");
    return true;
  };

  const removeProductCategory = (name: string) => {
    setProductCategories((current) =>
      current.filter((item) => item.toLowerCase() !== name.toLowerCase()),
    );
  };

  const removeService = (id: number) => {
    setServices((current) => current.filter((service) => service.id !== id));
  };

  const updateSource = <K extends keyof LeadSource>(
    id: number,
    key: K,
    value: LeadSource[K],
  ) => {
    setSources((current) =>
      current.map((source) =>
        source.id === id ? { ...source, [key]: value } : source,
      ),
    );
  };

  const addSource = () => {
    setSources((current) => [
      {
        id: Date.now(),
        name: "Nouvelle source",
        channel: "Campagne",
        color: "bg-slate-100 text-slate-700",
        visible: true,
        organic: false,
      },
      ...current,
    ]);
    setSavedMessage("Nouvelle source ajoutée.");
    window.setTimeout(() => setSavedMessage(""), 2400);
  };

  const removeSource = (id: number) => {
    const source = sources.find((item) => item.id === id);
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer la source ${source?.name ?? ""} ?`,
    );

    if (!confirmed) return;
    setSources((current) => current.filter((item) => item.id !== id));
  };

  const updateProduct = <K extends keyof Product>(
    id: number,
    key: K,
    value: Product[K],
  ) => {
    setProducts((current) =>
      current.map((product) =>
        product.id === id ? { ...product, [key]: value } : product,
      ),
    );
  };

  const addProduct = () => {
    setProducts((current) => [
      {
        id: Date.now(),
        name: "Nouveau produit",
        category: productCategories[0] ?? "Produits visage",
        price: 0,
        vatRate: 20,
        stock: 0,
        sku: "REF-PRODUIT",
        visible: true,
      },
      ...current,
    ]);
    setSavedMessage("Nouveau produit ajouté.");
    window.setTimeout(() => setSavedMessage(""), 2400);
  };

  const removeProduct = (id: number) => {
    const product = products.find((item) => item.id === id);
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer le produit ${product?.name ?? ""} ?`,
    );

    if (!confirmed) return;
    setProducts((current) => current.filter((item) => item.id !== id));
  };

  const updateDepositLink = <K extends keyof CenterDepositLinkSetting>(
    id: number,
    key: K,
    value: CenterDepositLinkSetting[K],
  ) => {
    setDepositLinks((current) =>
      current.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  };

  const addDepositLink = () => {
    setDepositLinks((current) => [
      {
        id: Date.now(),
        name: "Nouvel acompte",
        url: "https://",
        message:
          "Bonjour, voici le lien pour régler votre acompte et confirmer votre rendez-vous :",
        active: true,
      },
      ...current,
    ]);
    setSavedMessage("Nouveau lien d'acompte ajouté.");
    window.setTimeout(() => setSavedMessage(""), 2400);
  };

  const removeDepositLink = (id: number) => {
    const link = depositLinks.find((item) => item.id === id);
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer le lien ${link?.name ?? ""} ?`,
    );

    if (!confirmed) return;
    setDepositLinks((current) => current.filter((item) => item.id !== id));
  };

  const saveSettings = async () => {
    if (saving) {
      return;
    }

    setSaving(true);

    try {
      await savePublicCenterProfile({
        center,
        services: sortServicesByCategory(services, categoryOptions),
        serviceCategories,
        sources,
        products: sortServicesByCategory(products, productCategoryOptions),
        productCategories,
        depositLinks,
        stripeConnected,
        coverPreview,
        logoPreview,
        photoPreviews,
        externalReviews,
        offers,
        reviewAutomation,
      });
      showNotice("Fiche publique enregistrée.");
    } catch (error) {
      showNotice(publicSaveErrorMessage(error), true);
    } finally {
      setSaving(false);
    }
  };

  const toggleCenterCategory = (category: string) => {
    setCenter((current) => {
      const hasCategory = current.categories.includes(category);
      return {
        ...current,
        categories: hasCategory
          ? current.categories.filter((item) => item !== category)
          : [...current.categories, category],
      };
    });
  };

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLogoPreview(await readFileAsDataUrl(file));
    setSavedMessage("Logo ajouté à l'aperçu. Cliquez sur Enregistrer.");
    window.setTimeout(() => setSavedMessage(""), 2400);
    event.target.value = "";
  };

  const uploadCover = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCoverPreview(await readFileAsDataUrl(file));
    setSavedMessage("Image de couverture ajoutée. Cliquez sur Enregistrer.");
    window.setTimeout(() => setSavedMessage(""), 2400);
    event.target.value = "";
  };

  const uploadPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 4);
    if (!files.length) return;

    setPhotoPreviews(await Promise.all(files.map(readFileAsDataUrl)));
    setSavedMessage("Photos ajoutées au bandeau. Cliquez sur Enregistrer.");
    window.setTimeout(() => setSavedMessage(""), 2400);
    event.target.value = "";
  };

  const importExternalReviews = async () => {
    const url = reviewUrl.trim();
    if (!url) {
      setSavedMessage(
        "Colle le lien Google Maps de la fiche, ou ajoute un avis à la main en dessous.",
      );
      window.setTimeout(() => setSavedMessage(""), 3600);
      return;
    }

    setImportingReviews(true);
    try {
      const response = await fetch("/api/reviews/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, source: reviewSource }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        reviews?: CenterExternalReview[];
        message?: string;
      };

      if (payload.ok && payload.reviews?.length) {
        setExternalReviews((current) => [...payload.reviews!, ...current]);
        setSavedMessage(
          `${payload.reviews.length} avis Google importés. Cliquez sur Enregistrer pour publier.`,
        );
      } else {
        setSavedMessage(
          payload.message ||
            "Google ne laisse pas lire les avis depuis ce lien. Ajoute-les à la main ou en CSV : Nom;5;Commentaire",
        );
      }
    } catch {
      setSavedMessage(
        "Import impossible. Ajoute les avis à la main (nom, note, commentaire) ou via CSV.",
      );
    } finally {
      setImportingReviews(false);
      window.setTimeout(() => setSavedMessage(""), 5000);
    }
  };

  const addManualReview = () => {
    if (!manualReview.author.trim() || !manualReview.comment.trim()) {
      setSavedMessage("Ajoutez au minimum un nom et un commentaire.");
      window.setTimeout(() => setSavedMessage(""), 2600);
      return;
    }

    setExternalReviews((current) => [
      {
        id: Date.now(),
        author: manualReview.author.trim(),
        rating: manualReview.rating,
        source: reviewSource,
        date: new Date().toISOString().slice(0, 10),
        comment: manualReview.comment.trim(),
        imported: false,
      },
      ...current,
    ]);
    setManualReview({ author: "", rating: 5, comment: "" });
    setSavedMessage("Avis ajouté. Cliquez sur Enregistrer pour publier.");
    window.setTimeout(() => setSavedMessage(""), 2600);
  };

  const removeExternalReview = (id: number) => {
    setExternalReviews((current) => current.filter((review) => review.id !== id));
  };

  const updateOffer = <K extends keyof CenterPublicOffer>(
    id: number,
    key: K,
    value: CenterPublicOffer[K],
  ) => {
    setOffers((current) =>
      current.map((offer) =>
        offer.id === id ? { ...offer, [key]: value } : offer,
      ),
    );
  };

  const addOffer = () => {
    const firstService = services.find((service) => service.visible) ?? services[0];
    setOffers((current) => [
      {
        id: Date.now(),
        title: firstService ? `${firstService.name} offre spéciale` : "Offre spéciale",
        serviceName: firstService?.name ?? "Prestation",
        oldPrice: firstService?.price ?? 0,
        price: firstService ? Math.max(0, firstService.price - 10) : 0,
        tag: "Offre du moment",
        endsAt: new Date().toISOString().slice(0, 10),
        limitedSpots: 5,
        visible: true,
      },
      ...current,
    ]);
    setSavedMessage("Offre ajoutée. Cliquez sur Enregistrer pour publier.");
    window.setTimeout(() => setSavedMessage(""), 2400);
  };

  const removeOffer = (id: number) => {
    const offer = offers.find((item) => item.id === id);
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer l'offre ${offer?.title ?? ""} ?`,
    );
    if (!confirmed) return;
    setOffers((current) => current.filter((offerItem) => offerItem.id !== id));
  };

  const moveOffer = (id: number, direction: -1 | 1) => {
    setOffers((current) => {
      const index = current.findIndex((offer) => offer.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  };

  const updateReviewAutomation = <K extends keyof CenterReviewAutomation>(
    key: K,
    value: CenterReviewAutomation[K],
  ) => {
    setReviewAutomation((current) => ({ ...current, [key]: value }));
  };

  const uploadReviewsCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const content = await file.text();
    const importedReviews = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [author, rating, comment, source, date] = line
          .split(";")
          .map((item) => item.trim());

        return {
          id: Date.now() + index,
          author: author || "Cliente",
          rating: Math.min(5, Math.max(1, Number(rating) || 5)),
          source: source || reviewSource,
          date: date || new Date().toISOString().slice(0, 10),
          comment: comment || "Avis importé.",
          imported: true,
        };
      });

    if (importedReviews.length > 0) {
      setExternalReviews((current) => [...importedReviews, ...current]);
      setSavedMessage(`${importedReviews.length} avis importés depuis le fichier.`);
      window.setTimeout(() => setSavedMessage(""), 2600);
    }
    event.target.value = "";
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-violet-600">Bookea Pro</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Paramètres du centre
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Configurez la fiche publique, les prestations, les sources, les
            produits, les acomptes et la réservation en ligne.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/centres/${center.slug}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
          >
            <Eye className="h-4 w-4" />
            Voir la fiche publique
          </Link>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </header>

      {savedMessage && (
        <div
          className={`mb-5 rounded-2xl border px-5 py-3 text-sm font-medium ${
            saveError
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {savedMessage}
        </div>
      )}

      <section className="mb-6 grid gap-4 lg:grid-cols-4">
        <MetricCard
          title="Prestations visibles"
          value={visibleServices.length.toString()}
          detail={`${services.length} prestations au total`}
          icon={<Eye className="h-4 w-4" />}
          color="text-blue-600"
        />
        <MetricCard
          title="Acompte activé"
          value={depositServices.toString()}
          detail="Prestations avec acompte"
          icon={<BadgeEuro className="h-4 w-4" />}
          color="text-emerald-600"
        />
        <MetricCard
          title="Paiement"
          value={stripeConnected ? "Actif" : "À connecter"}
          detail="Stripe Connect"
          icon={<CreditCard className="h-4 w-4" />}
          color={stripeConnected ? "text-emerald-600" : "text-orange-600"}
        />
        <MetricCard
          title="Fiche publique"
          value={center.published ? "Publiée" : "Masquée"}
          detail={`/centres/${center.slug}`}
          icon={<Building2 className="h-4 w-4" />}
          color={center.published ? "text-violet-600" : "text-slate-500"}
        />
      </section>

      <nav className="mb-6 flex gap-3 overflow-x-auto border-b border-slate-200">
        {[
          ["profil", "Profil public"],
          ["prestations", "Prestations"],
          ["sources", "Sources"],
          ["produits", "Produits"],
          ["acomptes", "Liens acompte"],
          ["paiements", "Paiements"],
          ["reservation", "Réservation en ligne"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition ${
              activeTab === id
                ? "border-violet-600 text-violet-600"
                : "border-transparent text-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "profil" && (
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              icon={<Building2 className="h-4 w-4" />}
              title="Fiche publique du centre"
              subtitle="Ces informations seront visibles par les clientes qui cherchent un prestataire."
            />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field
                label="Nom du centre"
                value={center.name}
                onChange={(value) => setCenter({ ...center, name: value })}
              />
              <Field
                label="URL publique"
                value={center.slug}
                onChange={(value) => setCenter({ ...center, slug: value })}
              />
              <PlaceSuggestField
                label="Ville"
                kind="city"
                value={center.city}
                placeholder="Gap, Clermont-Ferrand…"
                onChange={(value) => setCenter({ ...center, city: value })}
                onSelect={(place) =>
                  setCenter((current) => ({
                    ...current,
                    city: place.city,
                    postalCode: place.postcode || current.postalCode,
                    address: current.address,
                  }))
                }
              />
              <Field
                label="Téléphone"
                value={center.phone}
                onChange={(value) => setCenter({ ...center, phone: value })}
              />
              <Field
                label="Email"
                value={center.email}
                onChange={(value) => setCenter({ ...center, email: value })}
              />
              <label className="space-y-2">
                <span className="text-xs font-medium text-slate-500">
                  Visibilité
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCenter((current) => ({
                      ...current,
                      published: !current.published,
                    }))
                  }
                  className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium ${
                    center.published
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  {center.published ? (
                    <Eye className="h-5 w-5" />
                  ) : (
                    <EyeOff className="h-5 w-5" />
                  )}
                  {center.published ? "Visible en public" : "Masqué"}
                </button>
              </label>
              <div className="md:col-span-2">
                <PlaceSuggestField
                  label="Adresse complète"
                  kind="address"
                  value={center.address}
                  placeholder="12 rue… Gap"
                  onChange={(value) => setCenter({ ...center, address: value })}
                  onSelect={(place) =>
                    setCenter((current) => ({
                      ...current,
                      address: place.street,
                      city: place.city || current.city,
                      postalCode: place.postcode || current.postalCode,
                    }))
                  }
                />
              </div>
              <div className="space-y-3 md:col-span-2">
                <div>
                  <span className="text-xs font-medium text-slate-500">
                    Couleur du profil
                  </span>
                  <p className="mt-1 text-sm font-normal text-slate-500">
                    Adaptez la fiche publique à la direction artistique du centre.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {profileColorPresets.map((preset) => (
                    <button
                      key={preset.color}
                      type="button"
                      onClick={() =>
                        setCenter((current) => ({
                          ...current,
                          profileColor: preset.color,
                        }))
                      }
                      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                        center.profileColor === preset.color
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className="h-5 w-5 rounded-full border border-white/60 shadow-sm"
                        style={{ backgroundColor: preset.color }}
                      />
                      {preset.name}
                    </button>
                  ))}
                  <label className="flex h-11 items-center gap-3 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600">
                    Perso
                    <input
                      type="color"
                      value={center.profileColor}
                      onChange={(event) =>
                        setCenter((current) => ({
                          ...current,
                          profileColor: event.target.value,
                        }))
                      }
                      className="h-7 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label="Couleur personnalisée du profil"
                    />
                  </label>
                </div>
              </div>
              <div className="space-y-3 md:col-span-2">
                <div>
                  <span className="text-xs font-medium text-slate-500">
                    Catégories publiques
                  </span>
                  <p className="mt-1 text-sm font-normal text-slate-500">
                    Le centre peut apparaître dans plusieurs catégories côté cliente.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {publicCenterCategories.map((category) => {
                    const selected = center.categories.includes(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => toggleCenterCategory(category)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          selected
                            ? "border-blue-200 bg-blue-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="space-y-2 md:col-span-2">
                <span className="text-xs font-medium text-slate-500">
                  Description
                </span>
                <textarea
                  className="min-h-28 w-full rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500"
                  value={center.description}
                  onChange={(event) =>
                    setCenter({ ...center, description: event.target.value })
                  }
                />
              </label>
              <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 md:grid-cols-2">
                <div className="md:col-span-2">
                  <span className="text-xs font-medium text-slate-500">
                    Réseaux sociaux visibles dans la bio
                  </span>
                  <p className="mt-1 text-sm font-normal text-slate-500">
                    Les clientes pourront cliquer directement sur Instagram,
                    TikTok ou Facebook depuis la fiche publique.
                  </p>
                </div>
                <label className="space-y-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <InstagramGlyph className="h-4 w-4 text-pink-600" />
                    Instagram
                  </span>
                  <input
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-pink-500"
                    value={center.socialLinks.instagram}
                    onChange={(event) =>
                      setCenter((current) => ({
                        ...current,
                        socialLinks: {
                          ...current.socialLinks,
                          instagram: event.target.value,
                        },
                      }))
                    }
                    placeholder="https://instagram.com/votrecentre"
                  />
                </label>
                <label className="space-y-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <TikTokGlyph className="h-4 w-4 text-slate-950" />
                    TikTok
                  </span>
                  <input
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-950"
                    value={center.socialLinks.tiktok ?? ""}
                    onChange={(event) =>
                      setCenter((current) => ({
                        ...current,
                        socialLinks: {
                          ...current.socialLinks,
                          tiktok: event.target.value,
                        },
                      }))
                    }
                    placeholder="https://www.tiktok.com/@votrecentre"
                  />
                </label>
                <label className="space-y-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <FacebookGlyph className="h-4 w-4 text-blue-600" />
                    Facebook
                  </span>
                  <input
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500"
                    value={center.socialLinks.facebook}
                    onChange={(event) =>
                      setCenter((current) => ({
                        ...current,
                        socialLinks: {
                          ...current.socialLinks,
                          facebook: event.target.value,
                        },
                      }))
                    }
                    placeholder="https://facebook.com/votrecentre"
                  />
                </label>
              </div>
            </div>
            <div className="mt-5 grid gap-4 rounded-3xl border border-blue-100 bg-blue-50/60 p-4 md:grid-cols-3">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-300 bg-white px-4 py-3 text-sm font-medium text-cyan-700 transition hover:bg-cyan-50">
                <ImagePlus className="h-5 w-5" />
                Importer la couverture
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={uploadCover}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-white px-4 py-3 text-sm font-medium text-blue-700 transition hover:bg-blue-50">
                <ImagePlus className="h-5 w-5" />
                Importer le logo
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={uploadLogo}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-white px-4 py-3 text-sm font-medium text-violet-700 transition hover:bg-violet-50">
                <ImagePlus className="h-5 w-5" />
                Importer les photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={uploadPhotos}
                />
              </label>

              {(coverPreview || logoPreview || photoPreviews.length > 0) && (
                <div className="grid gap-3 md:col-span-3 md:grid-cols-[1.2fr_120px_1fr]">
                  <div className="rounded-3xl bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-medium text-slate-500">
                      Couverture
                    </p>
                    <div className="grid h-32 overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-blue-500 to-cyan-400">
                      {coverPreview ? (
                        <img
                          src={coverPreview}
                          alt="Image de couverture du centre"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center bg-white/15 font-semibold text-white">
                          Image de couverture
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-3xl bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-medium text-slate-500">
                      Logo
                    </p>
                    <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl bg-slate-50 text-xl font-semibold text-blue-600">
                      {logoPreview ? (
                        <img
                          src={logoPreview}
                          alt="Logo du centre"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        "JFG"
                      )}
                    </div>
                  </div>
                  <div className="rounded-3xl bg-white p-3 shadow-sm">
                    <p className="mb-2 text-xs font-medium text-slate-500">
                      Photos du bandeau
                    </p>
                    <div className="grid min-h-24 gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-blue-500 to-cyan-400 p-2 sm:grid-cols-4">
                      {photoPreviews.length > 0 ? (
                        photoPreviews.map((photo) => (
                          <img
                            key={photo}
                            src={photo}
                            alt="Photo du centre"
                            className="h-24 w-full rounded-xl object-cover"
                          />
                        ))
                      ) : (
                        <div className="col-span-full grid h-24 place-items-center rounded-xl bg-white/15 font-semibold text-white">
                          Bandeau public
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 md:col-span-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Avis externes
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">
                      Importer les avis Google ou autre plateforme
                    </h3>
                    <p className="mt-1 text-sm font-normal text-slate-500">
                      Un lien share.google ne donne pas les avis. Colle le lien
                      Maps de la fiche, ou ajoute-les à la main / en CSV
                      (Nom;5;Commentaire).
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white">
                    Import CSV
                    <input
                      type="file"
                      accept=".csv,.txt"
                      className="sr-only"
                      onChange={uploadReviewsCsv}
                    />
                  </label>
                </div>

                <div className="grid gap-3 lg:grid-cols-[170px_1fr_auto]">
                  <select
                    value={reviewSource}
                    onChange={(event) => setReviewSource(event.target.value)}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
                  >
                    <option>Google</option>
                    <option>Planity</option>
                    <option>Facebook</option>
                    <option>Treatwell</option>
                    <option>Autre</option>
                  </select>
                  <input
                    value={reviewUrl}
                    onChange={(event) => setReviewUrl(event.target.value)}
                    placeholder="https://maps.app.goo.gl/… ou lien fiche Maps"
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => void importExternalReviews()}
                    disabled={importingReviews}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
                  >
                    {importingReviews ? "Import…" : "Importer"}
                  </button>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_120px_1.4fr_auto]">
                  <input
                    value={manualReview.author}
                    onChange={(event) =>
                      setManualReview((current) => ({
                        ...current,
                        author: event.target.value,
                      }))
                    }
                    placeholder="Nom cliente"
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none focus:border-blue-500"
                  />
                  <select
                    value={manualReview.rating}
                    onChange={(event) =>
                      setManualReview((current) => ({
                        ...current,
                        rating: Number(event.target.value),
                      }))
                    }
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-blue-500"
                  >
                    {[5, 4, 3, 2, 1].map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}/5
                      </option>
                    ))}
                  </select>
                  <input
                    value={manualReview.comment}
                    onChange={(event) =>
                      setManualReview((current) => ({
                        ...current,
                        comment: event.target.value,
                      }))
                    }
                    placeholder="Commentaire de l'avis"
                    className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={addManualReview}
                    className="rounded-xl border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-medium text-white"
                  >
                    Ajouter
                  </button>
                </div>

                <div className="grid gap-3">
                  {externalReviews.map((review) => (
                    <div
                      key={review.id}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-start md:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-950">
                            {review.author}
                          </p>
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                            {"★".repeat(review.rating)}
                          </span>
                          <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                            {review.source}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                          {review.comment}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExternalReview(review.id)}
                        className="inline-flex items-center justify-center rounded-xl border border-red-100 bg-white p-2 text-red-500 transition hover:bg-red-50"
                        aria-label={`Supprimer l'avis de ${review.author}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 rounded-3xl border border-violet-100 bg-violet-50/70 p-4 md:col-span-2">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-medium text-violet-700">
                      Offres publiques
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">
                      Offres du moment et offres bientôt épuisées
                    </h3>
                    <p className="mt-1 text-sm font-normal text-slate-500">
                      L'ordre ci-dessous est l'ordre affiché sur la fiche publique.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addOffer}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm"
                  >
                    <Plus className="h-5 w-5" />
                    Ajouter une offre
                  </button>
                </div>

                <div className="space-y-3">
                  {offers.map((offer, index) => (
                    <article
                      key={offer.id}
                      className="rounded-[24px] border border-violet-100 bg-white p-4 shadow-sm"
                    >
                      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_0.65fr_0.65fr_0.9fr_0.65fr_auto]">
                        <Field
                          label="Titre"
                          value={offer.title}
                          onChange={(value) => updateOffer(offer.id, "title", value)}
                        />
                        <label className="space-y-2">
                          <span className="text-xs font-medium text-slate-500">
                            Prestation
                          </span>
                          <select
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500"
                            value={offer.serviceName}
                            onChange={(event) =>
                              updateOffer(offer.id, "serviceName", event.target.value)
                            }
                          >
                            {services.map((service) => (
                              <option key={service.id}>{service.name}</option>
                            ))}
                          </select>
                        </label>
                        <NumberField
                          label="Prix avant"
                          value={offer.oldPrice}
                          suffix="€"
                          onChange={(value) => updateOffer(offer.id, "oldPrice", value)}
                        />
                        <NumberField
                          label="Prix offre"
                          value={offer.price}
                          suffix="€"
                          onChange={(value) => updateOffer(offer.id, "price", value)}
                        />
                        <label className="space-y-2">
                          <span className="text-xs font-medium text-slate-500">
                            Badge
                          </span>
                          <select
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500"
                            value={offer.tag}
                            onChange={(event) =>
                              updateOffer(offer.id, "tag", event.target.value)
                            }
                          >
                            <option>Offre du moment</option>
                            <option>Bientôt épuisée</option>
                            <option>Derniers créneaux</option>
                            <option>À ne pas rater</option>
                          </select>
                        </label>
                        <NumberField
                          label="Places"
                          value={offer.limitedSpots}
                          suffix="rest."
                          onChange={(value) =>
                            updateOffer(offer.id, "limitedSpots", value)
                          }
                        />
                        <div className="flex items-end gap-2">
                          <IconButton
                            label="Monter l'offre"
                            disabled={index === 0}
                            onClick={() => moveOffer(offer.id, -1)}
                          >
                            <ArrowUp className="h-5 w-5" />
                          </IconButton>
                          <IconButton
                            label="Descendre l'offre"
                            disabled={index === offers.length - 1}
                            onClick={() => moveOffer(offer.id, 1)}
                          >
                            <ArrowDown className="h-5 w-5" />
                          </IconButton>
                          <IconButton
                            label="Supprimer l'offre"
                            onClick={() => removeOffer(offer.id)}
                          >
                            <Trash2 className="h-5 w-5" />
                          </IconButton>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <label className="space-y-2">
                          <span className="text-xs font-medium text-slate-500">
                            Fin de l'offre
                          </span>
                          <input
                            type="date"
                            value={offer.endsAt}
                            onChange={(event) =>
                              updateOffer(offer.id, "endsAt", event.target.value)
                            }
                            className="h-12 rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-blue-500"
                          />
                        </label>
                        <Toggle
                          checked={offer.visible}
                          label={offer.visible ? "Visible public" : "Masquée public"}
                          onClick={() => updateOffer(offer.id, "visible", !offer.visible)}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4 md:col-span-2 lg:grid-cols-[1fr_1fr]">
                <div>
                  <p className="text-xs font-medium text-emerald-700">
                    Avis client + fidélité
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-950">
                    Mail automatique après chaque rendez-vous
                  </h3>
                  <p className="mt-2 font-semibold leading-7 text-slate-600">
                    Après un rendez-vous terminé, Bookea pourra envoyer un email
                    pour demander un avis. Si la cliente répond, les points sont
                    ajoutés à sa carte fidélité.
                  </p>
                  <div className="mt-4">
                    <Toggle
                      checked={reviewAutomation.enabled}
                      label={
                        reviewAutomation.enabled
                          ? "Automatisation activée"
                          : "Automatisation désactivée"
                      }
                      onClick={() =>
                        updateReviewAutomation(
                          "enabled",
                          !reviewAutomation.enabled,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-3">
                  <Field
                    label="Objet du mail"
                    value={reviewAutomation.emailSubject}
                    onChange={(value) =>
                      updateReviewAutomation("emailSubject", value)
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField
                      label="Délai d'envoi"
                      value={reviewAutomation.emailDelayHours}
                      suffix="h"
                      onChange={(value) =>
                        updateReviewAutomation("emailDelayHours", value)
                      }
                    />
                    <NumberField
                      label="Récompense avis"
                      value={reviewAutomation.loyaltyPointsReward}
                      suffix="pts"
                      onChange={(value) =>
                        updateReviewAutomation("loyaltyPointsReward", value)
                      }
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60 md:col-span-2"
              >
                <Save className="h-5 w-5" />
                {saving ? "Enregistrement…" : "Enregistrer la fiche publique"}
              </button>
            </div>
          </section>

          <PublicPreview
            center={center}
            services={services}
            serviceCategories={categoryOptions}
            coverPreview={coverPreview}
            logoPreview={logoPreview}
            photoPreviews={photoPreviews}
            externalReviews={externalReviews}
            offers={offers}
            reviewAutomation={reviewAutomation}
          />
        </div>
      )}

      {activeTab === "prestations" && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionTitle
              icon={<Settings2 className="h-4 w-4" />}
              title="Prestations proposées"
              subtitle="Tarif, durée, acompte, ordre d'affichage et compatibilité cabine/praticienne."
            />
            <button
              type="button"
              onClick={addService}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-5 w-5" />
              Ajouter une prestation
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">
              Catégories des prestations
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {categoryOptions.map((category) => (
                <span
                  key={category}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm"
                >
                  {category}
                  <button
                    type="button"
                    onClick={() => removeServiceCategory(category)}
                    className="text-slate-400 hover:text-rose-500"
                    aria-label={`Supprimer la catégorie ${category}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={categoryDraft}
                onChange={(event) => setCategoryDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    createServiceCategory(categoryDraft);
                  }
                }}
                placeholder="Nouvelle catégorie : Bilan, Soins minceur…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 sm:max-w-sm"
              />
              <button
                type="button"
                onClick={() => createServiceCategory(categoryDraft)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" />
                Créer
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {displayedServices.map((service, index) => {
              const previous = displayedServices[index - 1];
              const next = displayedServices[index + 1];
              const showCategory =
                !previous ||
                previous.category.toLowerCase() !== service.category.toLowerCase();

              return (
              <div key={service.id} className="space-y-2">
              {showCategory ? (
                <p
                  className={`px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${
                    index === 0 ? "" : "pt-2"
                  }`}
                >
                  {service.category || "Sans catégorie"}
                </p>
              ) : null}
              <article
                className="rounded-2xl border p-2.5 shadow-sm transition"
                style={{
                  backgroundColor: `${service.color ?? serviceColorFallback(index)}12`,
                  borderColor: `${service.color ?? serviceColorFallback(index)}45`,
                }}
              >
                <div className="grid gap-2 xl:grid-cols-[1.4fr_0.9fr_0.7fr_0.6fr_0.7fr_0.9fr_1fr_1fr_auto]">
                  <Field
                    compact
                    label="Nom"
                    value={service.name}
                    onChange={(value) => updateService(service.id, "name", value)}
                  />
                  <ServiceCategoryField
                    compact
                    value={service.category}
                    options={categoryOptions}
                    onChange={(value) =>
                      updateService(service.id, "category", value)
                    }
                    onCreate={(value) =>
                      createServiceCategory(value, service.id)
                    }
                  />
                  {service.onQuote ? (
                    <label className="space-y-0.5">
                      <span className="text-[11px] font-medium text-slate-500">
                        Prix
                      </span>
                      <div className="flex h-8 items-center rounded-lg border border-violet-200 bg-violet-50 px-2 text-sm font-medium text-violet-700">
                        Sur devis
                      </div>
                    </label>
                  ) : (
                    <NumberField
                      compact
                      label="Prix"
                      value={service.price}
                      suffix="€"
                      onChange={(value) =>
                        updateService(service.id, "price", value)
                      }
                    />
                  )}
                  <NumberField
                    compact
                    label="TVA"
                    value={service.vatRate}
                    suffix="%"
                    onChange={(value) =>
                      updateService(service.id, "vatRate", value)
                    }
                  />
                  <NumberField
                    compact
                    label="Durée"
                    value={service.duration}
                    suffix="min"
                    onChange={(value) =>
                      updateService(service.id, "duration", value)
                    }
                  />
                  <NumberField
                    compact
                    label="Acompte"
                    value={service.depositAmount}
                    suffix="€"
                    disabled={!service.depositEnabled}
                    onChange={(value) =>
                      updateService(service.id, "depositAmount", value)
                    }
                  />
                  <AssignmentSelect
                    compact
                    label="Cabines"
                    allLabel="Toutes"
                    options={cabinOptions}
                    value={service.cabins}
                    onChange={(value) =>
                      updateService(service.id, "cabins", value)
                    }
                  />
                  <AssignmentSelect
                    compact
                    label="Praticiennes"
                    allLabel="Toutes"
                    options={practitionerOptions}
                    value={service.practitioners}
                    onChange={(value) =>
                      updateService(service.id, "practitioners", value)
                    }
                  />
                  <div className="flex items-end gap-1">
                    <IconButton
                      compact
                      label="Monter"
                      disabled={
                        !previous ||
                        previous.category.toLowerCase() !==
                          service.category.toLowerCase()
                      }
                      onClick={() => moveService(service.id, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      compact
                      label="Descendre"
                      disabled={
                        !next ||
                        next.category.toLowerCase() !==
                          service.category.toLowerCase()
                      }
                      onClick={() => moveService(service.id, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      compact
                      label="Supprimer"
                      onClick={() => removeService(service.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">
                    <input
                      type="color"
                      value={service.color ?? serviceColorFallback(index)}
                      onChange={(event) =>
                        updateService(service.id, "color", event.target.value)
                      }
                      className="h-6 w-6 cursor-pointer rounded-full border border-slate-200 bg-white p-0"
                      aria-label={`Couleur de ${service.name}`}
                    />
                    Couleur
                  </label>
                  <Toggle
                    compact
                    checked={service.visible}
                    label={service.visible ? "Visible public" : "Masqué public"}
                    onClick={() =>
                      updateService(service.id, "visible", !service.visible)
                    }
                  />
                  <Toggle
                    compact
                    checked={service.topListed}
                    label={
                      service.topListed
                        ? "En haut de la liste"
                        : "Ordre standard"
                    }
                    onClick={() =>
                      updateService(service.id, "topListed", !service.topListed)
                    }
                  />
                  <Toggle
                    compact
                    checked={service.onQuote}
                    label={service.onQuote ? "Sur devis" : "Prix affiché"}
                    onClick={() =>
                      updateService(service.id, "onQuote", !service.onQuote)
                    }
                  />
                  <Toggle
                    compact
                    checked={service.depositEnabled}
                    label={
                      service.depositEnabled
                        ? "Acompte demandé"
                        : "Sans acompte"
                    }
                    onClick={() =>
                      updateService(
                        service.id,
                        "depositEnabled",
                        !service.depositEnabled,
                      )
                    }
                  />
                </div>
              </article>
              </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
          >
            <Save className="h-5 w-5" />
            {saving ? "Enregistrement…" : "Enregistrer les prestations"}
          </button>
        </section>
      )}

      {activeTab === "sources" && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionTitle
              icon={<Share2 className="h-4 w-4" />}
              title="Sources & provenances"
              subtitle="Ces sources alimentent le CRM, les KPI par campagne et les réservations organiques Bookea."
            />
            <button
              type="button"
              onClick={addSource}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-5 w-5" />
              Ajouter une source
            </button>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {sources.map((source) => (
              <article
                key={source.id}
                className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <Field
                    label="Nom"
                    value={source.name}
                    onChange={(value) => updateSource(source.id, "name", value)}
                  />
                  <Field
                    label="Canal"
                    value={source.channel}
                    onChange={(value) =>
                      updateSource(source.id, "channel", value)
                    }
                  />
                  <div className="flex items-end">
                    <IconButton
                      label="Supprimer la source"
                      onClick={() => removeSource(source.id)}
                    >
                      <Trash2 className="h-5 w-5" />
                    </IconButton>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Toggle
                    checked={source.visible}
                    label={source.visible ? "Disponible CRM" : "Masquée CRM"}
                    onClick={() =>
                      updateSource(source.id, "visible", !source.visible)
                    }
                  />
                  <Toggle
                    checked={source.organic}
                    label={
                      source.organic
                        ? "Réservation organique"
                        : "Source campagne"
                    }
                    onClick={() =>
                      updateSource(source.id, "organic", !source.organic)
                    }
                  />
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${source.color}`}
                  >
                    Aperçu : {source.name}
                  </span>
                </div>
              </article>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
          >
            <Save className="h-5 w-5" />
            {saving ? "Enregistrement…" : "Enregistrer les sources"}
          </button>
        </section>
      )}

      {activeTab === "produits" && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionTitle
              icon={<Package className="h-4 w-4" />}
              title="Produits du centre"
              subtitle="Produits vendus en cabine, utilisés pour la facturation, les cures et plus tard le stock."
            />
            <button
              type="button"
              onClick={addProduct}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-5 w-5" />
              Ajouter un produit
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">
              Catégories des produits
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {productCategoryOptions.map((category) => (
                <span
                  key={category}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm"
                >
                  {category}
                  <button
                    type="button"
                    onClick={() => removeProductCategory(category)}
                    className="text-slate-400 hover:text-rose-500"
                    aria-label={`Supprimer la catégorie ${category}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={productCategoryDraft}
                onChange={(event) => setProductCategoryDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    createProductCategory(productCategoryDraft);
                  }
                }}
                placeholder="Nouvelle catégorie : Visage, Compléments…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 sm:max-w-sm"
              />
              <button
                type="button"
                onClick={() => createProductCategory(productCategoryDraft)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" />
                Créer
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {displayedProducts.map((product, index) => {
              const previous = displayedProducts[index - 1];
              const showCategory =
                !previous ||
                previous.category.toLowerCase() !== product.category.toLowerCase();

              return (
              <div key={product.id} className="space-y-2">
              {showCategory ? (
                <p
                  className={`px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${
                    index === 0 ? "" : "pt-1"
                  }`}
                >
                  {product.category || "Sans catégorie"}
                </p>
              ) : null}
              <article
                className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 xl:grid-cols-[1.3fr_1fr_0.8fr_0.7fr_0.8fr_1fr_auto]">
                  <Field
                    label="Produit"
                    value={product.name}
                    onChange={(value) =>
                      updateProduct(product.id, "name", value)
                    }
                  />
                  <ServiceCategoryField
                    value={product.category}
                    options={productCategoryOptions}
                    onChange={(value) =>
                      updateProduct(product.id, "category", value)
                    }
                    onCreate={(value) =>
                      createProductCategory(value, product.id)
                    }
                    createPlaceholder="Visage, Compléments…"
                  />
                  <NumberField
                    label="Prix vente"
                    value={product.price}
                    suffix="€"
                    onChange={(value) =>
                      updateProduct(product.id, "price", value)
                    }
                  />
                  <NumberField
                    label="TVA"
                    value={product.vatRate}
                    suffix="%"
                    onChange={(value) =>
                      updateProduct(product.id, "vatRate", value)
                    }
                  />
                  <NumberField
                    label="Stock"
                    value={product.stock}
                    suffix="u."
                    onChange={(value) =>
                      updateProduct(product.id, "stock", value)
                    }
                  />
                  <Field
                    label="Référence"
                    value={product.sku}
                    onChange={(value) => updateProduct(product.id, "sku", value)}
                  />
                  <div className="flex items-end">
                    <IconButton
                      label="Supprimer le produit"
                      onClick={() => removeProduct(product.id)}
                    >
                      <Trash2 className="h-5 w-5" />
                    </IconButton>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Toggle
                    checked={product.visible}
                    label={product.visible ? "Visible vente" : "Masqué vente"}
                    onClick={() =>
                      updateProduct(product.id, "visible", !product.visible)
                    }
                  />
                  <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600">
                    Total stock : {(product.price * product.stock).toFixed(2)} €
                  </span>
                </div>
              </article>
              </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
          >
            <Save className="h-5 w-5" />
            {saving ? "Enregistrement…" : "Enregistrer les produits"}
          </button>
        </section>
      )}

      {activeTab === "paiements" && (
        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              icon={<CreditCard className="h-4 w-4" />}
              title="Stripe Connect"
              subtitle="Chaque centre doit pouvoir recevoir ses acomptes directement sur son compte."
            />
            <div
              className={`mt-6 rounded-3xl border p-5 ${
                stripeConnected
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-orange-200 bg-orange-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2
                  className={`h-7 w-7 ${
                    stripeConnected ? "text-emerald-600" : "text-orange-600"
                  }`}
                />
                <div>
                  <p className="text-base font-semibold">
                    {stripeConnected
                      ? "Compte Stripe connecté"
                      : "Compte Stripe non connecté"}
                  </p>
                  <p className="mt-1 font-semibold text-slate-600">
                    Les acomptes seront encaissés par le centre via Stripe
                    Connect.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStripeConnected((value) => !value)}
                className="mt-5 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
              >
                {stripeConnected ? "Déconnecter la maquette" : "Connecter Stripe"}
              </button>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              icon={<BadgeEuro className="h-4 w-4" />}
              title="Règles d'acompte"
              subtitle="Ces règles seront affichées avant la réservation de la cliente."
            />
            <div className="mt-6 grid gap-3">
              {[
                "Acompte remboursable jusqu'à 48h avant le rendez-vous.",
                "Annulation gratuite quand aucun acompte n'est demandé.",
                "No-show : acompte perdu.",
                "Retard : rendez-vous reporté selon les disponibilités du centre.",
              ].map((rule) => (
                <div
                  key={rule}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700"
                >
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "acomptes" && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionTitle
              icon={<BadgeEuro className="h-4 w-4" />}
              title="Liens d'acompte"
              subtitle="Ces liens seront proposés dans le bouton SMS acompte de Seya CRM."
            />
            <button
              type="button"
              onClick={addDepositLink}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-5 w-5" />
              Ajouter un lien
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            {depositLinks.map((link) => (
              <article
                key={link.id}
                className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[0.75fr_1.15fr_auto]">
                  <Field
                    label="Nom affiché"
                    value={link.name}
                    onChange={(value) =>
                      updateDepositLink(link.id, "name", value)
                    }
                  />
                  <Field
                    label="Lien de paiement"
                    value={link.url}
                    onChange={(value) =>
                      updateDepositLink(link.id, "url", value)
                    }
                  />
                  <div className="flex items-end gap-2">
                    <Toggle
                      checked={link.active}
                      label={link.active ? "Actif" : "Masqué"}
                      onClick={() =>
                        updateDepositLink(link.id, "active", !link.active)
                      }
                    />
                    <IconButton
                      label="Supprimer le lien"
                      onClick={() => removeDepositLink(link.id)}
                    >
                      <Trash2 className="h-5 w-5" />
                    </IconButton>
                  </div>
                </div>
                <label className="mt-3 block space-y-2">
                  <span className="text-xs font-medium text-slate-500">
                    Message SMS avant le lien
                  </span>
                  <textarea
                    value={link.message}
                    onChange={(event) =>
                      updateDepositLink(link.id, "message", event.target.value)
                    }
                    className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-blue-500"
                  />
                </label>
              </article>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
          >
            <Save className="h-5 w-5" />
            {saving ? "Enregistrement…" : "Enregistrer les liens d'acompte"}
          </button>
        </section>
      )}

      {activeTab === "reservation" && (
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <SectionTitle
              icon={<CalendarClock className="h-4 w-4" />}
              title="Réservation en ligne"
              subtitle="Bookea doit proposer uniquement les vrais créneaux disponibles."
            />
            <div className="mt-6 grid gap-4">
              <label className="space-y-2">
                <span className="text-xs font-medium text-slate-500">
                  Mode de réservation
                </span>
                <select
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none"
                  value={center.bookingMode}
                  onChange={(event) =>
                    setCenter({ ...center, bookingMode: event.target.value })
                  }
                >
                  <option>Réservation automatique</option>
                  <option>Réservation avec acompte selon prestation</option>
                  <option>Demande à confirmer par le centre</option>
                </select>
              </label>
              {[
                "Respecter les horaires du centre",
                "Respecter les horaires praticiennes",
                "Bloquer les cabines indisponibles",
                "Afficher seulement les soins visibles",
                "Éviter les doublons client par téléphone/email",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-violet-200 bg-violet-50 p-6 shadow-sm">
            <SectionTitle
              icon={<Sparkles className="h-4 w-4" />}
              title="Ce que Seya utilisera"
              subtitle="La cliente pourra parler naturellement, Bookea liera la demande au bon centre."
            />
            <div className="mt-6 space-y-3">
              {[
                "Prestation demandée",
                "Ville ou localisation",
                "Prix et durée du soin",
                "Acompte obligatoire ou non",
                "Cabine compatible",
                "Praticienne disponible",
                "Agenda en temps réel",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-violet-700"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  color,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p>
          <p className="mt-1 text-sm text-slate-500">{detail}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({
  compact = false,
  label,
  value,
  onChange,
}: {
  compact?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={compact ? "space-y-0.5" : "space-y-1.5"}>
      <span
        className={`font-medium text-slate-500 ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        {label}
      </span>
      <input
        className={`w-full border border-slate-200 font-medium text-slate-800 outline-none focus:border-blue-500 ${
          compact
            ? "h-8 rounded-lg px-2 text-sm"
            : "h-11 rounded-xl px-3 text-sm"
        }`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ServiceCategoryField({
  compact = false,
  createPlaceholder = "Bilan, Soins minceur…",
  onChange,
  onCreate,
  options,
  value,
}: {
  compact?: boolean;
  createPlaceholder?: string;
  onChange: (value: string) => void;
  onCreate: (value: string) => boolean;
  options: string[];
  value: string;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const controlClass = compact
    ? "h-8 rounded-lg px-2 text-sm"
    : "h-11 rounded-xl px-3 text-sm";

  if (creating) {
    return (
      <label className={compact ? "space-y-0.5" : "space-y-1.5"}>
        <span
          className={`font-medium text-slate-500 ${
            compact ? "text-[11px]" : "text-xs"
          }`}
        >
          Catégorie
        </span>
        <div className={`flex items-center gap-2 ${compact ? "h-8" : "h-11"}`}>
          <input
            autoFocus
            value={draft}
            placeholder={createPlaceholder}
            className={`w-full border border-slate-200 font-medium text-slate-800 outline-none focus:border-blue-500 ${controlClass}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (onCreate(draft)) {
                  setCreating(false);
                  setDraft("");
                }
              }
              if (event.key === "Escape") {
                setCreating(false);
                setDraft("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (onCreate(draft)) {
                setCreating(false);
                setDraft("");
              }
            }}
            className={`shrink-0 bg-slate-950 font-medium text-white ${
              compact
                ? "h-8 rounded-lg px-2 text-xs"
                : "h-11 rounded-xl px-3 text-sm"
            }`}
          >
            OK
          </button>
        </div>
      </label>
    );
  }

  const currentValue = options.includes(value) ? value : value || options[0] || "";

  return (
    <label className={compact ? "space-y-0.5" : "space-y-1.5"}>
      <span
        className={`font-medium text-slate-500 ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        Catégorie
      </span>
      <select
        value={currentValue}
        className={`w-full border border-slate-200 bg-white font-medium text-slate-800 outline-none focus:border-blue-500 ${controlClass}`}
        onChange={(event) => {
          if (event.target.value === "__create__") {
            setCreating(true);
            return;
          }
          onChange(event.target.value);
        }}
      >
        {value && !options.includes(value) ? (
          <option value={value}>{value}</option>
        ) : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="__create__">+ Créer une catégorie…</option>
      </select>
    </label>
  );
}

const assignmentAllPattern = /^(toutes?|tous)$/i;

function parseAssignmentNames(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && !assignmentAllPattern.test(item));
}

function mergeAssignmentOptions(base: string[], stored: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of [...base, ...stored.flatMap(parseAssignmentNames)]) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || assignmentAllPattern.test(name) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(name);
  }

  return result;
}

function AssignmentSelect({
  allLabel,
  compact = false,
  label,
  onChange,
  options,
  value,
}: {
  allLabel: string;
  compact?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = parseAssignmentNames(value);
  const isAll = selected.length === 0;
  const display = isAll
    ? allLabel
    : selected.length <= 2
      ? selected.join(", ")
      : `${selected.length} ${label.toLowerCase()}`;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const toggle = (name: string) => {
    if (name === allLabel) {
      onChange(allLabel);
      return;
    }

    const current = isAll ? [] : [...selected];
    const exists = current.some(
      (item) => item.toLowerCase() === name.toLowerCase(),
    );
    const next = exists
      ? current.filter((item) => item.toLowerCase() !== name.toLowerCase())
      : [...current, name];

    if (next.length === 0 || (options.length > 0 && next.length === options.length)) {
      onChange(allLabel);
      return;
    }

    onChange(next.join(", "));
  };

  return (
    <div ref={rootRef} className={`relative ${compact ? "space-y-0.5" : "space-y-1.5"}`}>
      <span
        className={`font-medium text-slate-500 ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between border border-slate-200 bg-white text-left font-medium text-slate-800 outline-none focus:border-blue-500 ${
          compact
            ? "h-8 rounded-lg px-2 text-sm"
            : "h-11 rounded-xl px-3 text-sm"
        }`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{display}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div
          className="absolute right-0 z-30 mt-1 max-h-56 w-max min-w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          role="listbox"
          aria-multiselectable="true"
        >
          <AssignmentOption
            checked={isAll}
            label={allLabel}
            onClick={() => toggle(allLabel)}
          />
          {options.map((option) => (
            <AssignmentOption
              key={option}
              checked={!isAll && selected.some((item) => item.toLowerCase() === option.toLowerCase())}
              label={option}
              onClick={() => toggle(option)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssignmentOption({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium ${
        checked ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded border ${
          checked
            ? "border-white bg-white text-slate-950"
            : "border-slate-300 bg-white"
        }`}
      >
        {checked ? <Check className="h-3 w-3" /> : null}
      </span>
      {label}
    </button>
  );
}

function NumberField({
  compact = false,
  label,
  value,
  suffix,
  disabled = false,
  onChange,
}: {
  compact?: boolean;
  label: string;
  value: number;
  suffix: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={compact ? "space-y-0.5" : "space-y-1.5"}>
      <span
        className={`font-medium text-slate-500 ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        {label}
      </span>
      <div
        className={`flex items-center border border-slate-200 bg-white focus-within:border-blue-500 ${
          compact ? "h-8 rounded-lg px-2" : "h-11 rounded-xl px-3"
        }`}
      >
        <input
          type="number"
          min={0}
          disabled={disabled}
          className="w-full bg-transparent text-sm font-medium text-slate-800 outline-none disabled:text-slate-300"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="text-sm font-medium text-slate-400">{suffix}</span>
      </div>
    </label>
  );
}

function Toggle({
  checked,
  compact = false,
  label,
  onClick,
}: {
  checked: boolean;
  compact?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full font-medium ${
        compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
      } ${
        checked
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-200 text-slate-600"
      }`}
    >
      {label}
    </button>
  );
}

function IconButton({
  compact = false,
  label,
  disabled = false,
  onClick,
  children,
}: {
  compact?: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid place-items-center border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 ${
        compact ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"
      }`}
    >
      {children}
    </button>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="5"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="16.8" cy="7.2" r="1.2" fill="currentColor" />
    </svg>
  );
}

function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14.7 8.1h2.1V4.7c-.4-.1-1.8-.2-3.3-.2-3.3 0-5.5 2-5.5 5.7v3.2H4.5v3.8H8V24h4.2v-6.8h3.5l.6-3.8h-4.1v-2.8c0-1.1.3-2.5 2.5-2.5Z" />
    </svg>
  );
}

function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16.4 3c.4 2.2 1.8 3.7 4.1 4v3.2a7.2 7.2 0 0 1-4-1.2v5.6c0 3.8-2.5 6.4-6.1 6.4-3.1 0-5.5-2.2-5.5-5.2 0-3.3 2.7-5.5 6.2-5.3v3.3c-1.6-.2-2.8.6-2.8 2 0 1.2.9 2 2.1 2 1.5 0 2.4-1 2.4-3.1V3h3.6Z" />
    </svg>
  );
}

function PublicPreview({
  center,
  services,
  serviceCategories,
  coverPreview,
  logoPreview,
  photoPreviews,
  externalReviews,
  offers,
  reviewAutomation,
}: {
  center: {
    name: string;
    city: string;
    address: string;
    description: string;
    bookingMode: string;
    published: boolean;
    profileColor: string;
    socialLinks: {
      instagram: string;
      tiktok: string;
      facebook: string;
    };
  };
  services: Service[];
  serviceCategories?: string[];
  coverPreview: string;
  logoPreview: string;
  photoPreviews: string[];
  externalReviews: CenterExternalReview[];
  offers: CenterPublicOffer[];
  reviewAutomation: CenterReviewAutomation;
}) {
  const sortedServices = sortServicesByCategory(
    services.filter((service) => service.visible),
    mergeServiceCategories(serviceCategories, services),
  );
  const averageRating =
    externalReviews.length > 0
      ? (
          externalReviews.reduce((sum, review) => sum + review.rating, 0) /
          externalReviews.length
        ).toFixed(1)
      : "0.0";
  const visibleOffers = offers.filter((offer) => offer.visible);

  return (
    <aside className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <SectionTitle
        icon={<Eye className="h-4 w-4" />}
        title="Aperçu public"
        subtitle="Ce que la cliente verra dans Bookea."
      />
      <div className="mt-6 overflow-hidden rounded-[28px] border border-slate-200 bg-[#f4f7fb]">
        <div
          className="h-28 bg-cover bg-center"
          style={
            coverPreview
              ? {
                  backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.12)), url(${coverPreview})`,
                }
              : {
                  background: `linear-gradient(135deg, ${center.profileColor}, #06b6d4)`,
                }
          }
        >
          {!coverPreview && photoPreviews.length > 0 && (
            <div className="grid h-full grid-cols-4 gap-1 p-1">
              {photoPreviews.map((photo) => (
                <img
                  key={photo}
                  src={photo}
                  alt="Photo du centre"
                  className="h-full w-full rounded-2xl object-cover"
                />
              ))}
            </div>
          )}
        </div>
        <div className="p-5">
          <div
            className="-mt-12 mb-4 grid h-20 w-20 place-items-center overflow-hidden rounded-3xl border-4 border-white bg-white text-xl font-semibold shadow-sm"
            style={{ color: center.profileColor }}
          >
            {logoPreview ? (
              <img
                src={logoPreview}
                alt={`Logo ${center.name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              "JFG"
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{center.name}</h3>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                <MapPin className="h-5 w-5" />
                {center.city}
              </p>
              <p className="mt-2 font-semibold text-amber-500">
                ★ {averageRating.replace(".", ",")} · {externalReviews.length} avis
                importés
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                center.published
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {center.published ? "Visible" : "Masquée"}
            </span>
          </div>
          <p className="mt-4 font-semibold leading-7 text-slate-600">
            {center.description}
          </p>
          {(center.socialLinks.instagram ||
            center.socialLinks.tiktok ||
            center.socialLinks.facebook) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {center.socialLinks.instagram && (
                <a
                  href={center.socialLinks.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                >
                  <InstagramGlyph className="h-4 w-4" />
                  Instagram
                </a>
              )}
              {center.socialLinks.tiktok && (
                <a
                  href={center.socialLinks.tiktok}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                >
                  <TikTokGlyph className="h-4 w-4" />
                  TikTok
                </a>
              )}
              {center.socialLinks.facebook && (
                <a
                  href={center.socialLinks.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm"
                >
                  <FacebookGlyph className="h-4 w-4" />
                  Facebook
                </a>
              )}
            </div>
          )}
          <p
            className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold"
            style={{ color: center.profileColor }}
          >
            {center.bookingMode}
          </p>
          {visibleOffers.length > 0 && (
            <div className="mt-5 space-y-3">
              <p className="text-xs font-medium text-slate-400">
                Offres visibles
              </p>
              {visibleOffers.slice(0, 3).map((offer) => (
                <div
                  key={offer.id}
                  className="rounded-2xl border border-violet-100 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{offer.title}</p>
                      <p className="mt-1 text-sm font-normal text-slate-500">
                        {offer.serviceName} · fin {offer.endsAt}
                      </p>
                    </div>
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                      {offer.tag}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-normal text-slate-400 line-through">
                      {offer.oldPrice} €
                    </p>
                    <p className="text-base font-semibold text-violet-700">
                      {offer.price} €
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-xs font-medium text-emerald-700">
              Avis après RDV
            </p>
            <p className="mt-1 text-sm font-normal leading-6 text-slate-600">
              {reviewAutomation.enabled
                ? `Email envoyé ${reviewAutomation.emailDelayHours}h après le RDV · ${reviewAutomation.loyaltyPointsReward} points fidélité si avis déposé.`
                : "Email d'avis désactivé pour le moment."}
            </p>
          </div>
          {externalReviews.length > 0 && (
            <div className="mt-5 space-y-3">
              <p className="text-xs font-medium text-slate-400">
                Derniers avis
              </p>
              {externalReviews.slice(0, 3).map((review) => (
                <div
                  key={review.id}
                  className="rounded-2xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">{review.author}</p>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                      {review.source} · {review.rating}/5
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">
                    {review.comment}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 grid gap-3">
            {sortedServices.map((service) => (
              <div
                key={service.id}
                className="rounded-3xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold">{service.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {service.category} · {service.duration} min
                    </p>
                  </div>
                  <p className="text-base font-semibold text-slate-950">
                    {formatCenterServicePrice(service)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {service.topListed && (
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                      En avant
                    </span>
                  )}
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    {service.cabins}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {service.depositEnabled
                      ? `Acompte ${service.depositAmount} €`
                      : "Sans acompte"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function publicSaveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/row-level security|not authorized|permission|42501/i.test(message)) {
    return "Enregistrement refusé. Seul un gérant du centre peut modifier la fiche publique.";
  }

  if (/duplicate|unique/i.test(message)) {
    return "Cette URL publique est déjà utilisée. Changez le slug puis réessayez.";
  }

  return message
    ? `Impossible d'enregistrer la fiche publique : ${message}`
    : "Impossible d'enregistrer la fiche publique.";
}
