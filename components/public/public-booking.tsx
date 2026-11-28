"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Flame,
  Gift,
  Heart,
  ImageIcon,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  Quote,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Timer,
  UserRound,
} from "lucide-react";
import { BookeaLogo } from "@/components/bookea-logo";
import { PublicLegalFooter } from "@/components/legal/legal-page";
import {
  createPublicBookingId,
  readPublicBookings,
  savePublicBooking,
} from "@/lib/public-bookings";
import {
  defaultCenterOffers,
  formatCenterServicePrice,
  loadPublishedCenterProfile,
  mergeServiceCategories,
  publicCenterCategories,
  readCenterSettings,
  sortServicesByCategory,
  type CenterPublicOffer,
  type StoredCenterSettings,
} from "@/lib/center-settings";
import { coverPositionCss, servicePhotoByName } from "@/lib/center-media";
import { offerDeadline, offerIsLive, offerShelf } from "@/lib/public-offers";
import {
  clientFavoriteId,
  loadClientFavorites,
  saveClientFavorite,
  type ClientFavorite,
  type ClientOfferNotice,
} from "@/lib/client-account";
import { nextPublicSlots } from "@/lib/center-hours";
import { createClient } from "@/lib/supabase";
import {
  ClientMarketplace,
  type MarketplaceOffer,
} from "@/components/public/client-marketplace";

type Center = {
  name: string;
  city: string;
  distance: string;
  rating: string;
  reviews: number;
  price: number;
  deposit: number;
  service: string;
  duration: string;
  nextSlot: string;
  slots: string[];
  tags: string[];
  categories: string[];
  color: string;
  address?: string;
  photos?: Array<{
    label: string;
    src?: string;
    gradient: string;
  }>;
  cover?: string;
  coverPosition?: { x: number; y: number };
  reviewHighlights?: Array<{
    author: string;
    rating: number;
    source: string;
    comment: string;
  }>;
  services?: Array<{
    name: string;
    category?: string;
    price: number;
    onQuote?: boolean;
    duration: string;
    color: string;
    deposit: number;
    photo?: string;
  }>;
  profileColor?: string;
  phone?: string;
  email?: string;
  offers?: CenterPublicOffer[];
  socialLinks?: {
    instagram?: string;
    tiktok?: string;
    facebook?: string;
  };
  centerId?: string;
};

type ClientAppointment = {
  center: string;
  service: string;
  date: string;
  time: string;
  status: string;
};

type ClientMessage = {
  id: string;
  author: string;
  text: string;
  time: string;
  side: "client" | "center";
};

type SharedClientNote = {
  id: string;
  center: string;
  date: string;
  text: string;
};

const centers: Center[] = [
  {
    name: "JFG Clinique Clermont-Ferrand",
    city: "Clermont-Ferrand",
    distance: "1,4 km",
    rating: "4,9",
    reviews: 218,
    price: 89,
    deposit: 25,
    service: "Hydrafacial",
    duration: "60 min",
    nextSlot: "Samedi 14:30",
    phone: "04 73 00 00 00",
    email: "contact@jfg-clinique.fr",
    slots: ["Sam 14:30", "Sam 16:00", "Lun 10:15"],
    tags: ["Réservation rapide", "Seya disponible", "Parking"],
    categories: [
      "Institut beauté",
      "Soin du visage",
      "Minceur",
      "Beauté des ongles",
      "Beauté du regard",
      "Spa",
    ],
    color: "from-blue-500 to-cyan-400",
    address: "12 avenue Julien, 63000 Clermont-Ferrand",
    photos: [
      {
        label: "Cabine soin visage",
        gradient: "linear-gradient(135deg, #dbeafe, #bfdbfe 45%, #a5f3fc)",
      },
      {
        label: "Espace laser",
        gradient: "linear-gradient(135deg, #ede9fe, #c4b5fd 45%, #7dd3fc)",
      },
      {
        label: "Accueil clinique",
        gradient: "linear-gradient(135deg, #ecfeff, #e0f2fe 45%, #ddd6fe)",
      },
    ],
    reviewHighlights: [
      {
        author: "Julie",
        rating: 5,
        source: "Google",
        comment: "Accueil impeccable, rendez-vous rapide et prestation très professionnelle.",
      },
      {
        author: "Sarah",
        rating: 5,
        source: "Bookea",
        comment: "J'ai réservé en quelques secondes et le créneau était parfaitement respecté.",
      },
    ],
    services: [
      {
        name: "Hydrafacial",
        price: 89,
        duration: "60 min",
        color: "#2563eb",
        deposit: 25,
      },
      {
        name: "Épilation laser",
        price: 120,
        duration: "45 min",
        color: "#7c3aed",
        deposit: 30,
      },
      {
        name: "Cryolipolyse",
        price: 95,
        duration: "60 min",
        color: "#06b6d4",
        deposit: 25,
      },
    ],
    socialLinks: {
      instagram: "https://www.instagram.com/jfgclinique",
      tiktok: "https://www.tiktok.com/@jfgclinique",
      facebook: "https://www.facebook.com/jfgclinique",
    },
  },
  {
    name: "Studio Belle Peau",
    city: "Clermont-Ferrand",
    distance: "3,2 km",
    rating: "4,8",
    reviews: 146,
    price: 75,
    deposit: 20,
    service: "Hydrafacial",
    duration: "45 min",
    nextSlot: "Samedi 15:15",
    slots: ["Sam 15:15", "Mar 09:30", "Mer 17:45"],
    tags: ["Meilleur prix", "Cabine immediate"],
    categories: ["Institut beauté", "Soin du visage", "Beauté des ongles", "Bien-être"],
    color: "from-violet-500 to-blue-500",
    address: "8 rue Blatin, 63000 Clermont-Ferrand",
    photos: [
      {
        label: "Studio visage",
        gradient: "linear-gradient(135deg, #f5f3ff, #ddd6fe 45%, #bfdbfe)",
      },
      {
        label: "Onglerie",
        gradient: "linear-gradient(135deg, #fce7f3, #fbcfe8 45%, #ddd6fe)",
      },
    ],
    reviewHighlights: [
      {
        author: "Nadia",
        rating: 5,
        source: "Bookea",
        comment: "Très bon rapport qualité-prix et équipe vraiment douce.",
      },
    ],
    services: [
      {
        name: "Hydrafacial",
        price: 75,
        duration: "45 min",
        color: "#8b5cf6",
        deposit: 20,
      },
      {
        name: "Remplissage gel",
        price: 39,
        duration: "60 min",
        color: "#ec4899",
        deposit: 0,
      },
    ],
    socialLinks: {
      instagram: "https://www.instagram.com/studiobellepeau",
      tiktok: "https://www.tiktok.com/@studiobellepeau",
      facebook: "https://www.facebook.com/studiobellepeau",
    },
  },
  {
    name: "Institut Nova",
    city: "Romagnat",
    distance: "5,8 km",
    rating: "4,7",
    reviews: 94,
    price: 95,
    deposit: 30,
    service: "Hydrafacial premium",
    duration: "75 min",
    nextSlot: "Samedi 17:00",
    slots: ["Sam 17:00", "Dim 11:00", "Lun 12:30"],
    tags: ["Premium", "Ouvert dimanche"],
    categories: ["Spa", "Bien-être", "Institut beauté", "Minceur"],
    color: "from-fuchsia-500 to-orange-400",
    address: "4 place de la République, 63540 Romagnat",
    photos: [
      {
        label: "Spa premium",
        gradient: "linear-gradient(135deg, #fff7ed, #fed7aa 45%, #f0abfc)",
      },
      {
        label: "Cabine minceur",
        gradient: "linear-gradient(135deg, #fae8ff, #f5d0fe 45%, #fdba74)",
      },
    ],
    reviewHighlights: [
      {
        author: "Camille",
        rating: 5,
        source: "Google",
        comment: "Un institut très soigné, parfait pour un rendez-vous premium.",
      },
    ],
    services: [
      {
        name: "Hydrafacial premium",
        price: 95,
        duration: "75 min",
        color: "#d946ef",
        deposit: 30,
      },
      {
        name: "Massage détente",
        price: 70,
        duration: "45 min",
        color: "#f97316",
        deposit: 20,
      },
    ],
    socialLinks: {
      instagram: "https://www.instagram.com/institutnova",
      tiktok: "https://www.tiktok.com/@institutnova",
      facebook: "https://www.facebook.com/institutnova",
    },
  },
];

const initialClientAppointments: ClientAppointment[] = [
  {
    center: "JFG Clinique Clermont-Ferrand",
    service: "Hydrafacial",
    date: "Samedi 1 aout",
    time: "14:30",
    status: "Réservé",
  },
  {
    center: "Studio Belle Peau",
    service: "Remplissage gel",
    date: "12 aout",
    time: "10:00",
    status: "A confirmer",
  },
];

const initialClientMessages: ClientMessage[] = [
  {
    id: "msg-1",
    author: "JFG Clinique",
    text: "Bonjour Julie, votre rendez-vous Hydrafacial est bien réservé samedi à 14:30.",
    time: "Aujourd'hui 09:42",
    side: "center",
  },
  {
    id: "msg-2",
    author: "Julie",
    text: "Merci, je confirme ma présence.",
    time: "Aujourd'hui 09:45",
    side: "client",
  },
];

const sharedClientNotes: SharedClientNote[] = [
  {
    id: "shared-note-1",
    center: "JFG Clinique Clermont-Ferrand",
    date: "Aujourd'hui",
    text: "Pensez à bien hydrater votre peau après la séance. Prochain contrôle conseillé dans 4 semaines.",
  },
  {
    id: "shared-note-2",
    center: "Studio Belle Peau",
    date: "12/08/2026",
    text: "Votre remise fidélité sera disponible lors de votre prochain rendez-vous.",
  },
];

const mostBookedByCategory = [
  {
    category: "Coiffeur",
    service: "Brushing",
    price: "29 €",
    badge: "Top semaine",
  },
  {
    category: "Institut beauté",
    service: "Hydrafacial",
    price: "89 €",
    badge: "Très demandé",
  },
  {
    category: "Soin du visage",
    service: "Soin glow visage",
    price: "69 €",
    badge: "Top recherche",
  },
  {
    category: "Minceur",
    service: "Cryolipolyse",
    price: "120 €",
    badge: "Très demandé",
  },
  {
    category: "Beauté des ongles",
    service: "Remplissage gel",
    price: "45 €",
    badge: "Le plus réservé",
  },
  {
    category: "Beauté du regard",
    service: "Rehaussement de cils",
    price: "55 €",
    badge: "Populaire",
  },
  {
    category: "Bien-être",
    service: "Massage relaxant",
    price: "70 €",
    badge: "Favori clientes",
  },
  {
    category: "Barbier",
    service: "Barbe + contours",
    price: "25 €",
    badge: "Rapide",
  },
];

const currentOffers: Array<{
  title: string;
  center: string;
  price: string;
  oldPrice: string;
  category: string;
  photo?: string;
}> = [
  {
    title: "Hydrafacial découverte",
    center: "JFG Clinique Clermont-Ferrand",
    price: "79 €",
    oldPrice: "99 €",
    category: "Soin du visage",
  },
  {
    title: "Remplissage gel",
    center: "Studio Belle Peau",
    price: "39 €",
    oldPrice: "49 €",
    category: "Beauté des ongles",
  },
  {
    title: "Massage détente 45 min",
    center: "Institut Nova",
    price: "59 €",
    oldPrice: "75 €",
    category: "Bien-être",
  },
];

const endingSoonOffers: Array<{
  title: string;
  until: string;
  discount: string;
  category: string;
  photo?: string;
}> = [
  {
    title: "Laser jambes",
    until: "Termine ce soir",
    discount: "-20%",
    category: "Institut beauté",
  },
  {
    title: "Cryolipolyse bilan",
    until: "Encore 2 jours",
    discount: "Bilan offert",
    category: "Minceur",
  },
  {
    title: "Beauté du regard",
    until: "Derniers créneaux",
    discount: "-15%",
    category: "Beauté du regard",
  },
];

const popularCenters = [
  {
    name: "Institut Élégance",
    city: "Clermont-Ferrand",
    bookings: 186,
    rating: "5,0",
    category: "Institut beauté",
  },
  {
    name: "Maison Glow",
    city: "Aubière",
    bookings: 142,
    rating: "4,9",
    category: "Beauté du regard",
  },
  {
    name: "Barbier Central",
    city: "Chamalières",
    bookings: 98,
    rating: "4,8",
    category: "Barbier",
  },
];

const trendItems = [
  ["Hydrafacial", "+320 réservations cette semaine", "Très demandé", "Soin du visage"],
  ["Laser", "Créneaux du soir recherchés", "Top recherche", "Institut beauté"],
  ["Minceur", "Bilans cryo très demandés", "En hausse", "Minceur"],
  ["Ongles", "Nouveaux centres disponibles", "Nouveau", "Beauté des ongles"],
  ["Spa", "Demandes week-end en hausse", "Détente", "Spa"],
];

const nearbyDeals = [
  ["Aubière", "Hydrafacial", "-30%", "1,8 km"],
  ["Clermont-Ferrand", "Remplissage gel", "-15%", "2,4 km"],
  ["Romagnat", "Massage relaxant", "59 €", "5,8 km"],
];

const todayAvailabilities = [
  ["14:30", "Hydrafacial", "JFG Clinique"],
  ["16:00", "Laser jambes", "Institut Élégance"],
  ["17:45", "Remplissage gel", "Maison Glow"],
];

const latestReviews = [
  ["Julie", "Très satisfaite, réservation rapide et centre très propre."],
  ["Nadia", "Le créneau proposé par Seya était parfait."],
  ["Camille", "Accueil impeccable et prestation très soignée."],
];

export function PublicBooking() {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [serviceQuery, setServiceQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("Clermont-Ferrand");
  const [selectedCenterName, setSelectedCenterName] = useState(centers[0].name);
  const [selectedSlot, setSelectedSlot] = useState(centers[0].slots[0]);
  const [appointments, setAppointments] = useState(initialClientAppointments);
  const [clientMessages, setClientMessages] = useState(initialClientMessages);
  const [clientMessageDraft, setClientMessageDraft] = useState("");
  const [bookingStatus, setBookingStatus] = useState(() => {
    if (typeof window === "undefined") {
      return "Creneau pret a reserver";
    }
    const paid = new URLSearchParams(window.location.search).get("paid");
    if (paid === "1") {
      return "Vérification du paiement en cours. Le rendez-vous sera confirmé dès que Stripe aura validé l’acompte.";
    }
    if (paid === "0") {
      return "Paiement abandonné. Le créneau a été libéré.";
    }
    return "Creneau pret a reserver";
  });
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [storedSettings, setStoredSettings] = useState<StoredCenterSettings | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientFavorites, setClientFavorites] = useState<ClientFavorite[]>([]);
  const [offerNotices, setOfferNotices] = useState<ClientOfferNotice[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState("");
  const appliedConfiguredRef = useRef(false);
  const [customerForm, setCustomerForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });
  const [selectedServiceName, setSelectedServiceName] = useState("");
  const [catalogView, setCatalogView] = useState<Record<string, "soins" | "tarifs" | "">>({});
  const [catalogCategory, setCatalogCategory] = useState<Record<string, string>>({});
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const paid = new URLSearchParams(window.location.search).get("paid");
    if (paid !== "0") {
      return;
    }
    const last = readPublicBookings()[0];
    const slug = readPublicCenterSlug();
    if (!last || !slug) {
      return;
    }
    void fetch("/api/public/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", slug, bookingId: last.id }),
    });
  }, []);

  useEffect(() => {
    const refreshSettings = () => setStoredSettings(readCenterSettings());

    refreshSettings();
    window.addEventListener("bookea-center-settings-updated", refreshSettings);
    window.addEventListener("storage", refreshSettings);

    const slug = readPublicCenterSlug();

    void loadPublishedCenterProfile(slug).then((remote) => {
      if (remote) {
        setStoredSettings(remote);
      }
    });

    return () => {
      window.removeEventListener("bookea-center-settings-updated", refreshSettings);
      window.removeEventListener("storage", refreshSettings);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    async function readSession() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) {
        return;
      }
      const user = data.session?.user;
      if (!user) {
        setClientName("");
        setClientFavorites([]);
        setOfferNotices([]);
        return;
      }
      const meta = user.user_metadata || {};
      const full = String(meta.full_name || meta.first_name || user.email || "Mon compte");
      setClientName(full.split(" ")[0] || "Mon compte");
      try {
        const snapshot = await loadClientFavorites();
        if (cancelled || !snapshot) {
          return;
        }
        setClientFavorites(snapshot.favorites);
        setOfferNotices(snapshot.notices);
      } catch {
        setClientFavorites([]);
        setOfferNotices([]);
      }
    }
    void readSession();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void readSession();
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const toggleFavorite = async (center: Center) => {
    const id = clientFavoriteId(center);
    if (!id || favoriteBusy) {
      return;
    }
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = `${window.location.pathname}${window.location.search}` || "/";
      window.location.href = `/client/login?next=${encodeURIComponent(next)}`;
      return;
    }
    const saved = clientFavorites.some((item) => item.id === id);
    setFavoriteBusy(id);
    try {
      const snapshot = await saveClientFavorite(saved ? "remove" : "add", {
        id,
        name: center.name,
        city: center.city,
      });
      setClientFavorites(snapshot.favorites);
      setOfferNotices(snapshot.notices);
    } finally {
      setFavoriteBusy("");
    }
  };

  const configuredCenter = useMemo<Center | null>(() => {
    const profile = storedSettings?.center;

    if (!profile?.published) {
      return null;
    }

    const visibleServices = sortServicesByCategory(
      (storedSettings?.services ?? []).filter(isPublicCare),
      mergeServiceCategories(
        storedSettings?.serviceCategories,
        storedSettings?.services,
      ),
    );
    const topService =
      visibleServices.find((service) => service.topListed) ?? visibleServices[0];
    const externalReviews = storedSettings?.externalReviews ?? [];
    const averageRating =
      externalReviews.length > 0
        ? (
            externalReviews.reduce((sum, review) => sum + review.rating, 0) /
            externalReviews.length
          )
            .toFixed(1)
            .replace(".", ",")
        : "";

    if (!topService) {
      return null;
    }

    return {
      name: profile.name,
      city: profile.city,
      distance: "Centre partenaire",
      rating: averageRating,
      reviews: externalReviews.length,
      price: topService.price,
      deposit: publicDepositEuros(topService),
      service: topService.name,
      duration: `${topService.duration} min`,
      nextSlot: nextPublicSlots(storedSettings?.hours ?? [])[0] || "Selon les horaires du centre",
      phone: profile.phone,
      email: profile.email,
      slots: nextPublicSlots(storedSettings?.hours ?? []),
      tags: [
        "Réservation en ligne",
        "Agenda à jour",
        "Seya disponible",
      ],
      categories:
        profile.categories && profile.categories.length > 0
          ? profile.categories
          : ["Institut beauté"],
      address: profile.address,
      cover: storedSettings?.coverPreview,
      coverPosition: storedSettings?.coverPosition,
      photos: (storedSettings?.photoPreviews ?? []).slice(0, 3).map((src, index) => ({
        label: `Photo ${index + 1}`,
        src,
        gradient: "linear-gradient(135deg, #eef2ff, #dbeafe 45%, #cffafe)",
      })),
      reviewHighlights: externalReviews.slice(0, 2).map((review) => ({
        author: review.author,
        rating: review.rating,
        source: review.source,
        comment: review.comment,
      })),
      services: visibleServices.map((service) => ({
        name: service.name,
        category: service.category || "Autres",
        price: service.price,
        onQuote: service.onQuote === true,
        duration: `${service.duration} min`,
        color: service.color,
        deposit: publicDepositEuros(service),
        photo: service.photo,
      })),
      color: "from-violet-600 via-blue-500 to-cyan-400",
      profileColor: profile.profileColor,
      socialLinks: profile.socialLinks,
      centerId: profile.id,
      offers: (storedSettings?.offers ?? []).filter((offer) => offer.visible),
    };
  }, [storedSettings]);

  useEffect(() => {
    if (!configuredCenter || appliedConfiguredRef.current) {
      return;
    }

    appliedConfiguredRef.current = true;
    setSelectedCenterName(configuredCenter.name);
    if (configuredCenter.city) {
      setLocationQuery(configuredCenter.city);
    }
  }, [configuredCenter]);

  const allCenters = useMemo(() => {
    if (!configuredCenter) {
      return centers;
    }

    return [configuredCenter];
  }, [configuredCenter]);

  const filteredCenters = useMemo(() => {
    const service = serviceQuery.trim().toLowerCase();
    const location = locationQuery.trim().toLowerCase();
    const aroundMeSelected =
      location === "autour de moi" || location === "autour-moi";

    return allCenters.filter((center) => {
      const firstServiceWord = service.split(" ")[0];
      const firstLocationWord = location.split(" ")[0];
      const matchesCategory =
        activeCategory === "Tous" || center.categories.includes(activeCategory);
      const matchesService =
        !service ||
        center.service.toLowerCase().includes(firstServiceWord) ||
        center.tags.some((tag) => tag.toLowerCase().includes(firstServiceWord)) ||
        center.categories.some((category) =>
          category.toLowerCase().includes(firstServiceWord),
        );
      const matchesLocation =
        !location ||
        aroundMeSelected ||
        center.city.toLowerCase().includes(firstLocationWord);

      return matchesCategory && (matchesService || matchesLocation);
    });
  }, [activeCategory, allCenters, locationQuery, serviceQuery]);

  const visibleCenters = filteredCenters.length > 0 ? filteredCenters : allCenters;
  const selectedCenter =
    allCenters.find((center) => center.name === selectedCenterName) ?? allCenters[0];
  const bookedService =
    selectedCenter.services?.find((service) => service.name === selectedServiceName) ?? null;
  const bookedPrice = {
    price: bookedService?.price ?? selectedCenter.price,
    deposit: bookedService?.deposit ?? selectedCenter.deposit,
    remaining: Math.max(
      0,
      (bookedService?.price ?? selectedCenter.price) -
        (bookedService?.deposit ?? selectedCenter.deposit),
    ),
  };
  const publicCurrentOffers = useMemo(() => {
    const centerOffers =
      configuredCenter?.offers
        ?.filter((offer) => !offer.tag.toLowerCase().includes("épuis"))
        .map((offer) => ({
          title: offer.title,
          center: configuredCenter.name,
          price: `${offer.price} €`,
          oldPrice: `${offer.oldPrice} €`,
          category: configuredCenter.categories[0] ?? "Institut beauté",
          photo: servicePhotoByName(storedSettings?.services, offer.serviceName),
        })) ?? [];

    return configuredCenter ? centerOffers : [...centerOffers, ...currentOffers];
  }, [configuredCenter, storedSettings]);
  const publicEndingSoonOffers = useMemo(() => {
    const centerOffers =
      configuredCenter?.offers
        ?.filter((offer) => offer.tag.toLowerCase().includes("épuis"))
        .map((offer) => ({
          title: offer.title,
          until:
            offer.limitedSpots > 0
              ? `${offer.limitedSpots} places restantes`
              : "Dernières places",
          discount: `${offer.price} €`,
          category: configuredCenter.categories[0] ?? "Institut beauté",
          photo: servicePhotoByName(storedSettings?.services, offer.serviceName),
        })) ?? [];

    return configuredCenter ? centerOffers : [...centerOffers, ...endingSoonOffers];
  }, [configuredCenter, storedSettings]);
  const showcaseOffers = useMemo(() => {
    const published = (configuredCenter?.offers ?? []).filter((offer) => offer.visible);
    const source = configuredCenter
      ? published
      : published.length > 0
        ? published
        : defaultCenterOffers;
    const centerName = configuredCenter?.name ?? centers[0].name;
    const city = configuredCenter?.city ?? centers[0].city;
    const searchCategory = configuredCenter?.categories[0] ?? "Institut beauté";
    return source
      .filter((offer) => offerIsLive(offer))
      .map((offer): MarketplaceOffer => ({
        id: String(offer.id),
        title: offer.title,
        center: centerName,
        city,
        price: offer.price,
        oldPrice: offer.oldPrice,
        shelf: offerShelf(offer),
        photo: servicePhotoByName(storedSettings?.services, offer.serviceName),
        deadline: offerDeadline(offer),
        spots: offer.limitedSpots,
        service: offer.serviceName,
        searchCategory,
      }));
  }, [configuredCenter, storedSettings]);

  const focusSeyaSearch = () => {
    document.getElementById("recherche")?.scrollIntoView({ behavior: "smooth" });
    window.setTimeout(() => searchInputRef.current?.focus(), 250);
  };

  const scrollToCenters = () => {
    document.getElementById("centres")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToBooking = () => {
    document.getElementById("reservation")?.scrollIntoView({ behavior: "smooth" });
  };

  const selectCategory = (category: string) => {
    setActiveCategory(category);
    scrollToCenters();
  };

  const launchOfferSearch = (service: string, category: string) => {
    setServiceQuery(service);
    setActiveCategory(category);
    scrollToCenters();
  };

  const launchPublicSearch = () => {
    setBookingStatus(`${visibleCenters.length} centre(s) disponible(s) pour votre recherche`);
    scrollToCenters();
  };

  const openPopularCenter = (center: (typeof popularCenters)[number]) => {
    setLocationQuery(center.city);
    setActiveCategory(center.category);

    const matchingCenter =
      allCenters.find((item) => item.name === center.name) ??
      allCenters.find((item) => item.city === center.city) ??
      allCenters.find((item) => item.categories.includes(center.category));

    if (matchingCenter) {
      setSelectedCenterName(matchingCenter.name);
      setSelectedSlot(matchingCenter.slots[0]);
    }

    scrollToCenters();
  };

  const openAvailability = (time: string, service: string, centerName: string) => {
    setServiceQuery(service);

    const matchingCenter =
      allCenters.find((center) => center.name.includes(centerName)) ??
      allCenters.find((center) => center.service.toLowerCase().includes(service.toLowerCase().split(" ")[0])) ??
      allCenters[0];

    setSelectedCenterName(matchingCenter.name);
    setSelectedSlot(time.includes(" ") ? time : `Auj ${time}`);
    setBookingStatus(`Creneau ${time} selectionne pour ${service}`);
    scrollToBooking();
  };

  const selectSlot = (center: Center, slot: string) => {
    setSelectedCenterName(center.name);
    setSelectedSlot(slot);
    if (slot) {
      setVisitDate(resolveSlotDate(slot));
      setVisitTime((slot.split(" ")[1] || "").slice(0, 5));
    }
    setBookingStatus("Creneau selectionne");
  };

  const chooseService = (center: Center, serviceName: string) => {
    setSelectedServiceName(serviceName);
    setSelectedCenterName(center.name);
    setBookingStatus(`${serviceName} sélectionné`);
    document.getElementById("reservation")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const reserveAppointment = async () => {
    const firstName = customerForm.firstName.trim();
    const lastName = customerForm.lastName.trim();
    const phone = customerForm.phone.trim();
    const email = customerForm.email.trim();

    if (!firstName || !lastName || !phone || !email) {
      setBookingStatus(
        "Completez le prenom, le nom, le telephone et l'email pour valider la reservation."
      );
      document.getElementById("reservation")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    const bookedService =
      selectedCenter.services?.find((service) => service.name === selectedServiceName) ??
      null;
    const start = (visitTime || selectedSlot.split(" ")[1] || "").slice(0, 5);
    const date = visitDate || resolveSlotDate(selectedSlot);
    if (!/^\d{2}:\d{2}$/.test(start)) {
      setBookingStatus("Choisissez une date et une heure pour réserver.");
      return;
    }
    const booking = {
      id: createPublicBookingId(),
      centerName: selectedCenter.name,
      firstName,
      lastName,
      phone,
      email,
      treatment: bookedService?.name || selectedCenter.service,
      date,
      start,
      duration: bookedService
        ? parseDuration(bookedService.duration)
        : parseDuration(selectedCenter.duration),
      price: bookedService?.price ?? selectedCenter.price,
      deposit: bookedService?.deposit ?? selectedCenter.deposit,
      createdAt: new Date().toISOString(),
    };

    setAppointments((current) => [
      {
        center: selectedCenter.name,
        service: bookedService?.name || selectedCenter.service,
        date: formatPublicDate(date),
        time: start,
        status: "Réservé",
      },
      ...current,
    ]);
    savePublicBooking(booking);

    const slug = storedSettings?.center?.slug?.trim();
    const isPublishedCenter =
      Boolean(slug) &&
      selectedCenter.name.trim().toLowerCase() ===
        String(storedSettings?.center?.name || "").trim().toLowerCase();
    if (isPublishedCenter) {
      const response = await fetch("/api/public/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          bookingId: booking.id,
          firstName,
          lastName,
          phone,
          email,
          treatment: booking.treatment,
          date: booking.date,
          start: booking.start,
          duration: booking.duration,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        checkoutUrl?: string;
        message?: string;
      };
      if (json.checkoutUrl) {
        setBookingStatus("Redirection vers le paiement de l’acompte…");
        window.location.assign(json.checkoutUrl);
        return;
      }
      if (!response.ok) {
        setBookingStatus(json.message || "La réservation n’a pas pu être enregistrée.");
        return;
      }
    }
    setBookingStatus(
      "Reservation confirmee : SMS et mail de confirmation envoyes, CRM et planning du centre mis a jour",
    );
    window.setTimeout(() => {
      document.getElementById("reservation-confirmee")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const sendClientMessage = () => {
    const text = clientMessageDraft.trim();

    if (!text) {
      return;
    }

    setClientMessages((current) => [
      ...current,
      {
        id: `msg-${Date.now()}`,
        author: customerForm.firstName || "Cliente",
        text,
        time: new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        side: "client",
      },
    ]);
    setClientMessageDraft("");
  };

  const openBookeaChat = (center: Center) => {
    setClientMessageDraft((current) =>
      current.trim()
        ? current
        : `Bonjour ${center.name}, je souhaite vous contacter depuis Bookea.`,
    );

    requestAnimationFrame(() => {
      document
        .getElementById("client-messagerie")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-white pb-28 text-slate-950 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BookeaLogo href="/" size="sm" showSlogan={false} />
          <nav className="hidden items-center gap-5 text-sm font-medium text-slate-700 lg:flex">
            <button type="button" onClick={() => document.getElementById("offres")?.scrollIntoView({ behavior: "smooth" })}>
              Offres
            </button>
            <button type="button" onClick={() => selectCategory("Coiffeur")}>
              Coiffure
            </button>
            <button type="button" onClick={() => selectCategory("Soin du visage")}>
              Visage
            </button>
            <button type="button" onClick={() => selectCategory("Bien-être")}>
              Bien-être
            </button>
          </nav>
          <form
            id="recherche"
            className="hidden min-w-0 flex-1 items-center justify-end gap-2 lg:flex"
            onSubmit={(event) => {
              event.preventDefault();
              launchPublicSearch();
            }}
          >
            <div className="flex min-w-0 max-w-[420px] flex-1 items-center rounded-full border border-slate-200 bg-white">
              <label className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  ref={searchInputRef}
                  value={serviceQuery}
                  onChange={(event) => setServiceQuery(event.target.value)}
                  aria-label="Quel soin ?"
                  placeholder="Quel soin ?"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </label>
              <span className="h-5 w-px bg-slate-200" />
              <label className="flex w-44 items-center gap-1.5 px-3 py-2">
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                <select
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                  aria-label="Ville"
                  className="w-full appearance-none bg-transparent text-sm outline-none"
                >
                  {[locationQuery, ...allCenters.map((center) => center.city)]
                    .filter((city, index, list) => city && list.indexOf(city) === index)
                    .map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                </select>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </label>
            </div>
            <button
              type="submit"
              className="rounded-full bg-[#5e41ee] px-4 py-2 text-sm font-semibold text-white"
            >
              Rechercher
            </button>
          </form>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <Link
              href={
                clientName
                  ? "/client/compte"
                  : `/client/login?next=${encodeURIComponent("/")}`
              }
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-800"
            >
              <UserRound className="h-5 w-5" />
              {clientName || "Mon compte"}
            </Link>
            <Link href="/login" className="text-xs font-semibold text-slate-400">
              Pro
            </Link>
          </div>
        </div>
        <form
          className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 pb-3 lg:hidden"
          onSubmit={(event) => {
            event.preventDefault();
            launchPublicSearch();
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={serviceQuery}
              onChange={(event) => setServiceQuery(event.target.value)}
              aria-label="Quel soin ?"
              placeholder="Quel soin ?"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </label>
          <button type="submit" className="rounded-full bg-[#5e41ee] px-3 py-2 text-sm font-semibold text-white">
            OK
          </button>
        </form>
      </header>

      <ClientMarketplace
        serviceQuery={serviceQuery}
        locationQuery={locationQuery}
        categories={publicCenterCategories}
        activeCategory={activeCategory}
        offers={showcaseOffers}
        centers={visibleCenters.map((center) => ({
          name: center.name,
          city: center.city,
          distance: center.distance,
          rating: center.rating,
          reviews: center.reviews,
          service: center.service,
          slots: center.slots,
        }))}
        onServiceQuery={setServiceQuery}
        onLocationQuery={setLocationQuery}
        onSearch={launchPublicSearch}
        onCategory={selectCategory}
        onOffer={(offer) => launchOfferSearch(offer.service || offer.title, offer.searchCategory)}
        onCenter={(center) => {
          setLocationQuery(center.city);
          setSelectedCenterName(center.name);
          setSelectedSlot(center.slots[0] ?? "");
          scrollToCenters();
        }}
        onSlot={openAvailability}
      />

      <section id="centres" className="mx-auto w-full max-w-6xl px-3 pb-8 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
              Disponibilités
            </p>
            <h2 className="mt-1 font-serif text-2xl text-stone-950 sm:text-[1.7rem]">
              Centres recommandés
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setFiltersExpanded((current) => !current)}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition ${
              filtersExpanded
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <SlidersHorizontal className="h-5 w-5" />
            <span className="hidden sm:inline">Filtres</span>
          </button>
        </div>

        {filtersExpanded ? (
          <div className="mb-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  Catégorie
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Tous", ...publicCenterCategories].map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveCategory(category)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        activeCategory === category
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  Ville
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Autour de moi", "Aubière", "Clermont", "Romagnat", "Chamalières"].map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => setLocationQuery(city)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        locationQuery.toLowerCase().includes(city.toLowerCase())
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <MapPin className="h-5 w-5 shrink-0 text-slate-400" />
                  <input
                    value={locationQuery === "Autour de moi" ? "" : locationQuery}
                    onChange={(event) => setLocationQuery(event.target.value)}
                    placeholder="Entrer une ville"
                    className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          {visibleCenters.map((center) => (
            <article
              key={center.name}
              className={`min-w-0 overflow-hidden rounded-[22px] border bg-white shadow-sm transition sm:rounded-[26px] ${
                selectedCenter.name === center.name
                  ? "border-blue-300 ring-4 ring-blue-100"
                  : "border-slate-200"
              }`}
            >
              {center.cover ? (
                <div
                  className="h-28 bg-cover"
                  style={{
                    backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.18)), url(${center.cover})`,
                    backgroundPosition: coverPositionCss(center.coverPosition),
                  }}
                />
              ) : (
                <div
                  className={`h-2.5 bg-gradient-to-r ${center.color}`}
                  style={
                    center.profileColor
                      ? {
                          background: `linear-gradient(90deg, ${center.profileColor}, #06b6d4)`,
                        }
                      : undefined
                  }
                />
              )}
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-serif text-2xl text-stone-950">
                      {center.name}
                    </h3>
                    <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-stone-500">
                      <MapPin className="h-4 w-4 shrink-0" />
                      {center.city} · {center.distance}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={favoriteBusy === clientFavoriteId(center)}
                    onClick={() => void toggleFavorite(center)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stone-200"
                    aria-label={
                      clientFavorites.some((item) => item.id === clientFavoriteId(center))
                        ? `Retirer ${center.name} des favoris`
                        : `Ajouter ${center.name} aux favoris`
                    }
                    aria-pressed={clientFavorites.some(
                      (item) => item.id === clientFavoriteId(center),
                    )}
                  >
                    <Heart
                      className={`h-5 w-5 ${
                        clientFavorites.some((item) => item.id === clientFavoriteId(center))
                          ? "fill-rose-700 text-rose-700"
                          : "text-stone-500"
                      }`}
                    />
                  </button>
                </div>

                {center.reviews > 0 ? (
                <div className="mt-4 flex items-center gap-2">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <span className="font-semibold text-stone-950">{center.rating}</span>
                  <span className="text-sm text-stone-500">
                    ({center.reviews} avis)
                  </span>
                </div>
                ) : null}

                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 sm:rounded-3xl sm:px-4">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.14)]" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        Prochaine disponibilité
                      </p>
                      <p className="text-lg font-semibold text-stone-950">{center.nextSlot}</p>
                    </div>
                  </div>
                </div>

                {center.photos?.length ? (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {center.photos.slice(0, 3).map((photo) => (
                      <div
                        key={photo.label}
                        className="relative h-20 overflow-hidden rounded-2xl border border-slate-100 bg-slate-100"
                        style={{
                          background: photo.gradient,
                          backgroundImage: photo.src
                            ? `linear-gradient(180deg, rgba(15,23,42,0.04), rgba(15,23,42,0.28)), url(${photo.src})`
                            : photo.gradient,
                          backgroundPosition: "center",
                          backgroundSize: "cover",
                        }}
                      >
                        <div className="absolute inset-x-2 bottom-2 flex items-center gap-1 rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold text-stone-700 backdrop-blur">
                          <ImageIcon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{photo.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {center.services?.length ? (
                  <div className="mt-4 min-w-0 rounded-[22px] border border-slate-100 bg-white p-3 shadow-sm sm:rounded-[28px] sm:p-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                          Prestations
                        </p>
                        <h4 className="font-serif text-xl text-stone-950">
                          Les soins ({center.services.length})
                        </h4>
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {["Tous", ...new Set(center.services.map((service) => service.category || "Soin"))].map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() =>
                            setCatalogCategory((current) => ({
                              ...current,
                              [center.name]: category,
                            }))
                          }
                          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                            (catalogCategory[center.name] || "Tous") === category
                              ? "bg-stone-950 text-white shadow-sm"
                              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                          }`}
                        >
                          {category}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 space-y-3">
                      {(catalogView[center.name] === "soins" || catalogView[center.name] === "tarifs"
                        ? center.services
                        : center.services.slice(0, 4)
                      )
                        .filter(
                          (service) =>
                            (catalogCategory[center.name] || "Tous") === "Tous" ||
                            (service.category || "Soin") === catalogCategory[center.name],
                        )
                        .map((service, index) => (
                        <button
                          key={service.name}
                          type="button"
                          onClick={() => chooseService(center, service.name)}
                          className="group flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-slate-50"
                        >
                          <span
                            className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white shadow-sm"
                            style={{
                              background: `linear-gradient(135deg, ${service.color}, ${
                                index % 2 === 0 ? "#06b6d4" : "#f472b6"
                              })`,
                            }}
                          >
                            {service.photo ? (
                              <img
                                src={service.photo}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <>
                                <span className="absolute inset-0 bg-white/10" />
                                <ImageIcon className="relative h-6 w-6 text-white" />
                              </>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-stone-950">
                              {service.name}
                            </span>
                            <span className="mt-0.5 block text-sm text-stone-500">
                              {service.duration} - {formatCenterServicePrice(service)}
                            </span>
                          </span>
                          <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
                        </button>
                      ))}
                    </div>

                    {catalogView[center.name] === "tarifs" ? (
                      <div className="mt-4 divide-y divide-stone-100 rounded-2xl border border-stone-100">
                        {center.services
                          .filter(
                            (service) =>
                              (catalogCategory[center.name] || "Tous") === "Tous" ||
                              (service.category || "Soin") === catalogCategory[center.name],
                          )
                          .map((service) => (
                            <button
                              key={`price-${service.name}`}
                              type="button"
                              onClick={() => chooseService(center, service.name)}
                              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                            >
                              <span>
                                <span className="block text-sm font-semibold text-stone-950">
                                  {service.name}
                                </span>
                                <span className="text-xs text-stone-500">
                                  {service.duration}
                                  {service.deposit > 0 ? ` · acompte ${service.deposit} €` : ""}
                                </span>
                              </span>
                              <span className="text-sm font-semibold text-stone-950">
                                {formatCenterServicePrice(service)}
                              </span>
                            </button>
                          ))}
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCatalogView((current) => ({
                            ...current,
                            [center.name]: current[center.name] === "soins" ? "" : "soins",
                          }))
                        }
                        className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-200"
                      >
                        {catalogView[center.name] === "soins"
                          ? "Réduire la liste"
                          : "Voir tous les soins"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCatalogView((current) => ({
                            ...current,
                            [center.name]: current[center.name] === "tarifs" ? "" : "tarifs",
                          }))
                        }
                        className="rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                      >
                        Grille tarifaire
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                    Prochains créneaux
                  </p>
                  <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {center.slots.length === 0 ? (
                      <p className="text-sm text-stone-500">
                        Les créneaux suivent les horaires enregistrés du centre.
                      </p>
                    ) : null}
                    {center.slots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => selectSlot(center, slot)}
                        className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                          selectedCenter.name === center.name && selectedSlot === slot
                            ? "bg-stone-950 text-white"
                            : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>

                {center.reviewHighlights?.[0] ? (
                  <div className="mt-4 rounded-3xl border border-amber-100 bg-amber-50/70 p-4">
                    <div className="flex items-start gap-3">
                      <Quote className="mt-1 h-5 w-5 shrink-0 text-amber-500" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-stone-950">
                            {center.reviewHighlights[0].author}
                          </span>
                          <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {center.reviewHighlights[0].rating}/5
                          </span>
                          <span className="text-xs text-stone-500">
                            {center.reviewHighlights[0].source}
                          </span>
                        </div>
                        <p className="mt-1 overflow-hidden text-sm text-stone-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                          {center.reviewHighlights[0].comment}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openBookeaChat(center);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm"
                    aria-label={`Contacter ${center.name}`}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Contacter
                  </button>
                  {center.socialLinks?.instagram && (
                    <a
                      href={center.socialLinks.instagram}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 px-3 py-2 text-xs font-semibold text-white shadow-sm"
                    >
                      <InstagramGlyph className="h-4 w-4" />
                      Instagram
                    </a>
                  )}
                  {center.socialLinks?.tiktok && (
                    <a
                      href={center.socialLinks.tiktok}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-3 py-2 text-xs font-semibold text-white shadow-sm"
                    >
                      <Music2 className="h-4 w-4" />
                      TikTok
                    </a>
                  )}
                  {center.socialLinks?.facebook && (
                    <a
                      href={center.socialLinks.facebook}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-3 py-2 text-xs font-semibold text-white shadow-sm"
                    >
                      <FacebookGlyph className="h-4 w-4" />
                      Facebook
                    </a>
                  )}
                </div>

                <button
                  onClick={() => selectSlot(center, center.slots[0])}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-stone-800"
                >
                  Choisir ce centre
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="reservation" className="mx-auto grid w-full max-w-6xl gap-4 px-3 pb-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[26px] sm:p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CalendarCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Réservation
              </p>
              <h2 className="mt-1 font-serif text-2xl text-stone-950">
                Réservation rapide
              </h2>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4 sm:rounded-3xl sm:p-5">
            {[
              ["Centre", selectedCenter.name],
              ["Soin", selectedServiceName || selectedCenter.service],
              ["Prix", `${bookedPrice.price} €`],
              ["Acompte", bookedPrice.deposit > 0 ? `${bookedPrice.deposit} €` : "Aucun"],
              ["Reste au salon", `${bookedPrice.remaining} €`],
              ["Créneau", visitDate && visitTime ? `${visitDate} ${visitTime}` : selectedSlot],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex min-w-0 items-center justify-between gap-4 border-b border-slate-200 py-3 first:pt-0"
              >
                <span className="text-sm text-stone-500">{label}</span>
                <span className="min-w-0 text-right text-sm font-semibold text-stone-950">{value}</span>
              </div>
            ))}
          </div>

          {configuredCenter && selectedCenter.name === configuredCenter.name ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  Date
                </span>
                <input
                  type="date"
                  value={visitDate}
                  onChange={(event) => setVisitDate(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-stone-200 px-4 text-sm text-stone-950 outline-none focus:border-stone-400"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  Heure
                </span>
                <input
                  type="time"
                  value={visitTime}
                  onChange={(event) => setVisitTime(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-stone-200 px-4 text-sm text-stone-950 outline-none focus:border-stone-400"
                />
              </label>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Prénom
              </span>
              <input
                className="h-12 w-full rounded-2xl border border-stone-200 px-4 text-sm text-stone-950 outline-none focus:border-stone-400"
                value={customerForm.firstName}
                onChange={(event) =>
                  setCustomerForm((form) => ({
                    ...form,
                    firstName: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Nom
              </span>
              <input
                className="h-12 w-full rounded-2xl border border-stone-200 px-4 text-sm text-stone-950 outline-none focus:border-stone-400"
                value={customerForm.lastName}
                onChange={(event) =>
                  setCustomerForm((form) => ({
                    ...form,
                    lastName: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Téléphone
              </span>
              <input
                className="h-12 w-full rounded-2xl border border-stone-200 px-4 text-sm text-stone-950 outline-none focus:border-stone-400"
                value={customerForm.phone}
                onChange={(event) =>
                  setCustomerForm((form) => ({
                    ...form,
                    phone: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Email
              </span>
              <input
                type="email"
                className="h-12 w-full rounded-2xl border border-stone-200 px-4 text-sm text-stone-950 outline-none focus:border-stone-400"
                value={customerForm.email}
                onChange={(event) =>
                  setCustomerForm((form) => ({
                    ...form,
                    email: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <p
            className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
              bookingStatus.startsWith("Completez")
                ? "bg-rose-50 text-rose-700"
                : bookingStatus.startsWith("Reservation confirmee")
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-blue-50 text-blue-700"
            }`}
          >
            {bookingStatus}
          </p>

          {storedSettings?.loyalty?.enabled &&
          storedSettings.loyalty.noShowEnabled &&
          storedSettings.loyalty.noShowPenalty > 0 ? (
            <p className="mt-4 text-sm text-stone-600">
              Un rendez-vous non honoré retire {storedSettings.loyalty.noShowPenalty}{" "}
              points de fidélité. Le solde ne descend pas sous zéro.
            </p>
          ) : null}

          <button
            type="button"
            onClick={reserveAppointment}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-5 w-5" />
            Valider la reservation
          </button>

          {bookingStatus.startsWith("Reservation confirmee") ? (
            <div
              id="reservation-confirmee"
              className="mt-5 rounded-[26px] border border-emerald-100 bg-emerald-50 p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Réservation confirmée
                  </p>
                  <h3 className="mt-1 font-serif text-2xl text-stone-950">
                    Votre rendez-vous est bien réservé.
                  </h3>
                  <p className="mt-1 text-sm text-emerald-800">
                    Le planning du centre et le CRM sont mis a jour.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                    Centre
                  </p>
                  <p className="mt-1 font-semibold text-stone-950">
                    {selectedCenter.name}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                    Soin
                  </p>
                  <p className="mt-1 font-semibold text-stone-950">
                    {selectedCenter.service}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                    Créneau
                  </p>
                  <p className="mt-1 font-semibold text-stone-950">
                    {selectedSlot}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-100 bg-white p-3">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <MessageCircle className="h-5 w-5" />
                    <p className="font-semibold">SMS de confirmation</p>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    Envoyé au {customerForm.phone || "numéro renseigné"}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-white p-3">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Mail className="h-5 w-5" />
                    <p className="font-semibold">Mail de confirmation</p>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    Envoyé à {customerForm.email || "l'email renseigné"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div id="client" className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-6">
          {configuredCenter ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Espace cliente
              </p>
              <h2 className="mt-1 font-serif text-2xl text-stone-950">Mon compte Bookea</h2>
              <p className="mt-2 text-sm text-stone-600">
                {clientName
                  ? `${clientName}, vos rendez-vous, messages et cartes de fidélité sont dans votre compte.`
                  : "Connectez-vous pour retrouver vos rendez-vous, vos messages et vos cartes de fidélité."}
              </p>
              <a
                href={clientName ? "/client/compte" : "/client/login?next=%2Fclient%2Fcompte"}
                className="mt-4 inline-flex rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white"
              >
                {clientName ? "Ouvrir mon compte" : "Connexion cliente"}
              </a>
            </div>
          ) : null}
          {configuredCenter ? null : (
          <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <UserRound className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  Espace cliente connecté
                </p>
                <h2 className="mt-1 font-serif text-2xl text-stone-950 sm:text-[1.7rem]">
                  Mon compte Bookea
                </h2>
                <p className="mt-1 truncate text-sm text-stone-500">
                  {customerForm.firstName} {customerForm.lastName} · {customerForm.email}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              Compte actif
            </span>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="min-w-0 rounded-[22px] border border-slate-200 bg-slate-50 p-4 sm:rounded-[26px]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                    Mes RDV
                  </p>
                  <h3 className="font-serif text-xl text-stone-950">
                    Rendez-vous à venir
                  </h3>
                </div>
                <CalendarCheck className="h-6 w-6 text-blue-600" />
              </div>

              <div className="mt-4 space-y-3">
                {appointments.map((appointment, index) => (
                  <div
                    key={`${appointment.center}-${appointment.time}-${index}`}
                    className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-serif text-lg text-stone-950">
                          {appointment.service}
                        </h4>
                        <p className="mt-1 text-sm text-stone-500">
                          {appointment.center}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          appointment.status === "Réservé"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {appointment.status}
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-stone-800">
                      {appointment.date} · {appointment.time}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button className="flex-1 rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50">
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setClientMessageDraft(
                            `Bonjour, j'ai une question sur mon rendez-vous ${appointment.service} du ${appointment.date} à ${appointment.time}.`
                          )
                        }
                        className="flex-1 rounded-2xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
                      >
                        Message
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section
              id="client-messagerie"
              className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[26px]"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                    Messagerie
                  </p>
                  <h3 className="font-serif text-xl text-stone-950">
                    Messages avec le centre
                  </h3>
                </div>
                <MessageCircle className="h-6 w-6 text-emerald-600" />
              </div>

              <div className="mt-4 max-h-[330px] space-y-3 overflow-y-auto rounded-3xl bg-slate-50 p-3">
                {clientMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[88%] rounded-3xl px-4 py-3 ${
                      message.side === "client"
                        ? "ml-auto bg-blue-600 text-white"
                        : "bg-white text-slate-800 shadow-sm"
                    }`}
                  >
                    <p className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
                      message.side === "client" ? "text-blue-100" : "text-slate-400"
                    }`}>
                      {message.author} · {message.time}
                    </p>
                    <p className="mt-1 text-sm leading-6">
                      {message.text}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={clientMessageDraft}
                  onChange={(event) => setClientMessageDraft(event.target.value)}
                  placeholder="Écrire au centre..."
                  className="min-h-12 min-w-0 flex-1 rounded-2xl border border-stone-200 px-4 text-sm text-stone-950 outline-none focus:border-stone-400"
                />
                <button
                  type="button"
                  onClick={sendClientMessage}
                  className="rounded-2xl bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 sm:py-0"
                >
                  Envoyer
                </button>
              </div>
              <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                En version connectée, le centre reçoit aussi une notification email à chaque nouveau message.
              </p>
            </section>
          </div>

          <div className="mt-5 overflow-hidden rounded-[28px] border border-amber-100/80 bg-[#fbf8f4] p-2 shadow-sm">
            <div className="relative overflow-hidden rounded-[22px] bg-[#1c1917] px-5 py-6 text-[#fbf8f4] sm:px-7 sm:py-7">
              <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-amber-200/15 blur-3xl" />
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/80 to-transparent" />

              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/70">
                    Bookea Club
                  </p>
                  <h3 className="mt-2 font-serif text-3xl leading-none sm:text-4xl">
                    Carte fidélité
                  </h3>
                  <p className="mt-3 text-sm text-stone-300">
                    {customerForm.firstName || "Cliente"}{" "}
                    {customerForm.lastName || "Bookea"}
                  </p>
                </div>
                <p className="shrink-0 rounded-full border border-amber-200/40 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-amber-100">
                  #BK-0420
                </p>
              </div>

              <div className="relative mt-7 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
                <div>
                  <p className="font-serif text-5xl leading-none tracking-tight">
                    420
                    <span className="ml-2 font-serif text-2xl text-amber-100/80">pts</span>
                  </p>
                  <div className="mt-5">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                          Niveau Glow
                        </p>
                        <p className="mt-1 text-sm text-stone-300">80 pts avant Gold</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-amber-200 to-amber-400" />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((stamp) => (
                      <div
                        key={stamp}
                        className={`grid h-11 w-11 place-items-center rounded-full border ${
                          stamp <= 4
                            ? "border-amber-200/50 bg-amber-100 text-stone-950"
                            : "border-dashed border-white/25 text-white/40"
                        }`}
                      >
                        {stamp <= 4 ? (
                          <Star className="h-4 w-4 fill-current" />
                        ) : (
                          <span className="text-xs">{stamp}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
                    {[
                      ["RDV honoré", "+40"],
                      ["Avis", "+20"],
                      ["Parrainage", "+100"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-stone-400">
                          {label}
                        </p>
                        <p className="mt-1 font-serif text-xl text-amber-100">{value}</p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 text-sm text-stone-300">
                    Prochaine récompense ·{" "}
                    <span className="font-semibold text-[#fbf8f4]">
                      10 € offerts ou bonus soin
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[28px] border border-blue-100 bg-blue-50/70 p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                  Notes partagées
                </p>
                <h3 className="mt-1 font-serif text-2xl text-stone-950">
                  Conseils visibles dans votre compte
                </h3>
              </div>
              <span className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-stone-600 shadow-sm">
                {sharedClientNotes.length} notes
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {sharedClientNotes.map((note) => (
                <article
                  key={note.id}
                  className="rounded-3xl border border-white/70 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-stone-950">{note.center}</p>
                    <span className="text-xs text-stone-400">
                      {note.date}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {note.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
          </>
          )}
        </div>
      </section>

      <PublicLegalFooter />

      <div className="fixed inset-x-3 bottom-3 z-40 rounded-[24px] border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/20 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">
              {selectedCenter.name}
            </p>
            <p className="truncate text-xs font-bold text-slate-500">
              {selectedCenter.service} · {selectedSlot}
            </p>
          </div>
          <button
            onClick={reserveAppointment}
            className="shrink-0 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white"
          >
            Réserver
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={focusSeyaSearch}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2"
        aria-label="Demandez à Seya"
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-lg ring-1 ring-violet-100">
          <Bot className="h-6 w-6 text-[#5410d6]" />
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#5410d6] px-4 py-3 text-sm font-semibold text-white shadow-lg">
          <Sparkles className="h-4 w-4" />
          Demandez à Seya
        </span>
      </button>
    </main>
  );
}

function parseDuration(duration: string) {
  const minutes = Number.parseInt(duration, 10);
  return Number.isFinite(minutes) ? minutes : 60;
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

function publicDepositEuros(service: {
  price?: number;
  depositEnabled?: boolean;
  depositAmount?: number;
  depositMode?: string;
  depositPercent?: number;
}) {
  if (service.depositEnabled === false) {
    return 0;
  }
  if (service.depositMode === "percent") {
    return (
      Math.round((Number(service.price) || 0) * (Number(service.depositPercent) || 0)) / 100
    );
  }
  return Number(service.depositAmount) || 0;
}

function isPublicCare(service: { visible?: boolean }) {
  return service.visible !== false;
}

function resolveSlotDate(slot: string) {
  const [dayLabel] = slot.split(" ");
  const date = new Date();
  if (dayLabel === "Auj") {
    return date.toISOString().slice(0, 10);
  }
  if (dayLabel === "Dem") {
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  const targetDay = {
    Dim: 0,
    Lun: 1,
    Mar: 2,
    Mer: 3,
    Jeu: 4,
    Ven: 5,
    Sam: 6,
  }[dayLabel];

  if (targetDay === undefined) {
    return date.toISOString().slice(0, 10);
  }

  const daysUntilSlot = (targetDay - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + daysUntilSlot);

  return date.toISOString().slice(0, 10);
}

function formatPublicDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${date}T00:00:00`));
}

function readPublicCenterSlug() {
  if (typeof window === "undefined") {
    return "";
  }

  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "centres" && parts[1]) {
    return decodeURIComponent(parts[1]).trim().toLowerCase();
  }

  return readCenterSettings()?.center?.slug?.trim().toLowerCase() || "";
}
