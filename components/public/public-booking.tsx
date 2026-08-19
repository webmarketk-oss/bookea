"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Gift,
  Heart,
  ImageIcon,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  Navigation,
  Phone,
  Quote,
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
  savePublicBooking,
} from "@/lib/public-bookings";
import {
  defaultCenterServices,
  defaultCenterOffers,
  defaultExternalReviews,
  publicCenterCategories,
  readCenterSettings,
  type CenterPublicOffer,
  type StoredCenterSettings,
} from "@/lib/center-settings";

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
  reviewHighlights?: Array<{
    author: string;
    rating: number;
    source: string;
    comment: string;
  }>;
  services?: Array<{
    name: string;
    price: number;
    duration: string;
    color: string;
    deposit: number;
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

const currentOffers = [
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

const endingSoonOffers = [
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
  const [serviceQuery, setServiceQuery] = useState("Hydrafacial samedi apres-midi");
  const [locationQuery, setLocationQuery] = useState("Aubiere");
  const [selectedCenterName, setSelectedCenterName] = useState(centers[0].name);
  const [selectedSlot, setSelectedSlot] = useState(centers[0].slots[0]);
  const [appointments, setAppointments] = useState(initialClientAppointments);
  const [clientMessages, setClientMessages] = useState(initialClientMessages);
  const [clientMessageDraft, setClientMessageDraft] = useState("");
  const [bookingStatus, setBookingStatus] = useState("Creneau pret a reserver");
  const [activeCategory, setActiveCategory] = useState("Tous");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [storedSettings, setStoredSettings] = useState<StoredCenterSettings | null>(null);
  const [customerForm, setCustomerForm] = useState({
    firstName: "Julie",
    lastName: "Martin",
    phone: "06 22 33 44 55",
    email: "julie@email.com",
  });

  useEffect(() => {
    const refreshSettings = () => setStoredSettings(readCenterSettings());

    refreshSettings();
    window.addEventListener("bookea-center-settings-updated", refreshSettings);
    window.addEventListener("storage", refreshSettings);

    return () => {
      window.removeEventListener("bookea-center-settings-updated", refreshSettings);
      window.removeEventListener("storage", refreshSettings);
    };
  }, []);

  const configuredCenter = useMemo<Center | null>(() => {
    const profile = storedSettings?.center;

    if (!profile?.published) {
      return null;
    }

    const visibleServices = (storedSettings?.services ?? defaultCenterServices).filter(
      (service) => service.visible,
    );
    const topService =
      visibleServices.find((service) => service.topListed) ?? visibleServices[0];
    const externalReviews =
      storedSettings?.externalReviews ?? defaultExternalReviews;
    const averageRating =
      externalReviews.length > 0
        ? (
            externalReviews.reduce((sum, review) => sum + review.rating, 0) /
            externalReviews.length
          )
            .toFixed(1)
            .replace(".", ",")
        : "4,9";

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
      deposit: topService.depositEnabled ? topService.depositAmount : 0,
      service: topService.name,
      duration: `${topService.duration} min`,
      nextSlot: "Aujourd'hui 14:30",
      phone: profile.phone,
      email: profile.email,
      slots: ["Auj 14:30", "Dem 10:00", "Sam 16:00"],
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
      services: visibleServices.slice(0, 4).map((service) => ({
        name: service.name,
        price: service.price,
        duration: `${service.duration} min`,
        color: service.color,
        deposit: service.depositEnabled ? service.depositAmount : 0,
      })),
      color: "from-violet-600 via-blue-500 to-cyan-400",
      profileColor: profile.profileColor,
      socialLinks: profile.socialLinks,
      offers: (storedSettings?.offers ?? defaultCenterOffers).filter(
        (offer) => offer.visible,
      ),
    };
  }, [storedSettings]);

  const allCenters = useMemo(() => {
    if (!configuredCenter) {
      return centers;
    }

    return [
      configuredCenter,
      ...centers.filter((center) => center.name !== configuredCenter.name),
    ];
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
        })) ?? [];

    return [...centerOffers, ...currentOffers];
  }, [configuredCenter]);
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
        })) ?? [];

    return [...centerOffers, ...endingSoonOffers];
  }, [configuredCenter]);

  const focusSeyaSearch = () => {
    document.getElementById("recherche")?.scrollIntoView({ behavior: "smooth" });
    window.setTimeout(() => searchInputRef.current?.focus(), 250);
  };

  const scrollToSeyaAssistant = () => {
    document.getElementById("seya-assistant")?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
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
    setSelectedSlot(`Auj ${time}`);
    setBookingStatus(`Creneau ${time} selectionne pour ${service}`);
    scrollToBooking();
  };

  const selectSlot = (center: Center, slot: string) => {
    setSelectedCenterName(center.name);
    setSelectedSlot(slot);
    setBookingStatus("Creneau selectionne");
  };

  const reserveAppointment = () => {
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

    const start = selectedSlot.split(" ")[1] ?? selectedCenter.nextSlot;
    const date = resolveSlotDate(selectedSlot);
    const booking = {
      id: createPublicBookingId(),
      centerName: selectedCenter.name,
      firstName,
      lastName,
      phone,
      email,
      treatment: selectedCenter.service,
      date,
      start,
      duration: parseDuration(selectedCenter.duration),
      price: selectedCenter.price,
      deposit: selectedCenter.deposit,
      createdAt: new Date().toISOString(),
    };

    setAppointments((current) => [
      {
        center: selectedCenter.name,
        service: selectedCenter.service,
        date: formatPublicDate(date),
        time: start,
        status: "Réservé",
      },
      ...current,
    ]);
    savePublicBooking(booking);
    setBookingStatus(
      "Reservation confirmee : SMS et mail de confirmation envoyes, CRM et planning du centre mis a jour"
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
    <main className="min-h-screen bg-[#f4f7fb] pb-28 text-slate-950 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <BookeaLogo href="/" size="sm" showSlogan={false} />
          <nav className="hidden max-w-[680px] items-center gap-2 overflow-x-auto text-sm font-semibold text-slate-600 md:flex">
            {publicCenterCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => selectCategory(category)}
                className={`shrink-0 rounded-full px-3 py-2 transition ${
                  activeCategory === category
                    ? "bg-blue-600 text-white"
                    : "hover:bg-blue-50 hover:text-blue-600"
                }`}
              >
                {category}
              </button>
            ))}
            <a href="/client/compte" className="hover:text-blue-600">
              Mon compte Bookea
            </a>
          </nav>
          <Link
            href="/login"
            className="rounded-full bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
          >
            Connexion
          </Link>
        </div>
      </header>

      <section id="recherche" className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-10">
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <div className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-sm sm:p-7 lg:p-9">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 sm:text-sm">
              <Sparkles className="h-4 w-4" />
              Bookea Client avec Seya
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.03] tracking-tight text-slate-950 sm:text-5xl lg:text-7xl">
              Trouvez un soin, réservez, brillez.
            </h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-slate-600 sm:text-lg">
              Cherchez une prestation, comparez les prix et bloquez votre
              rendez-vous en quelques secondes.
            </p>

            <div className="sticky top-[65px] z-20 mt-6 rounded-3xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/70 lg:static lg:bg-slate-50 lg:shadow-inner">
              <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr_auto]">
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
                  <Search className="h-5 w-5 shrink-0 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    className="w-full bg-transparent text-base font-semibold outline-none placeholder:text-slate-400"
                    value={serviceQuery}
                    onChange={(event) => setServiceQuery(event.target.value)}
                    aria-label="Prestation recherchee"
                    placeholder="Soin, exemple Hydrafacial"
                  />
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
                  <MapPin className="h-5 w-5 shrink-0 text-slate-400" />
                  <input
                    className="w-full bg-transparent text-base font-semibold outline-none placeholder:text-slate-400"
                    value={locationQuery}
                    onChange={(event) => setLocationQuery(event.target.value)}
                    aria-label="Localisation"
                    placeholder="Ville"
                  />
                </label>
                <button
                  type="button"
                  onClick={launchPublicSearch}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3.5 text-base font-black text-white shadow-sm transition hover:bg-blue-700"
                >
                  Rechercher
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-4 flex snap-x gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {["Tous", ...publicCenterCategories].map((item) => (
                <button
                  key={item}
                  onClick={() => selectCategory(item)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${
                    activeCategory === item
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {["Remplissage gel demain", "Laser jambes", "Cryolipolyse proche"].map(
                (item) => (
                  <button
                    key={item}
                    onClick={() => launchOfferSearch(item, "Tous")}
                    className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600"
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={focusSeyaSearch}
            className="rounded-[28px] border border-violet-100 bg-violet-50 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md sm:p-7 lg:p-8"
            aria-label="Demander à Seya de chercher un créneau"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-600 text-white">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-violet-700">
                  Seya comprend
                </p>
                <h2 className="text-xl font-black text-slate-950 sm:text-2xl">
                  votre demande naturelle
                </h2>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-3xl bg-white p-4 text-base font-bold leading-7 text-slate-800 shadow-sm">
                "Je cherche un institut pres de chez moi pour un Hydrafacial
                samedi apres-midi."
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Prestation", serviceQuery || "A preciser"],
                  ["Ville", locationQuery || "Autour de moi"],
                  ["Moment", "Samedi apres-midi"],
                  ["Resultat", `${visibleCenters.length} centres`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-white/80 p-4">
                    <p className="text-[11px] font-black uppercase text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 truncate text-sm font-black text-slate-950 sm:text-base">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-blue-600">
                  Par catégorie
                </p>
                <h2 className="text-2xl font-black tracking-tight text-slate-950">
                  Les plus réservés
                </h2>
              </div>
              <Flame className="h-7 w-7 text-orange-500" />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {mostBookedByCategory.map((item) => (
                <button
                  key={`${item.category}-${item.service}`}
                  type="button"
                  onClick={() => launchOfferSearch(item.service, item.category)}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50"
                >
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">
                    {item.category}
                  </span>
                  <h3 className="mt-3 text-lg font-black text-slate-950">
                    {item.service}
                  </h3>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-2xl font-black text-blue-600">
                      dès {item.price}
                    </p>
                    <p className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-700">
                      {item.badge}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-violet-100 bg-violet-50 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-violet-700">
                    Offres
                  </p>
                  <h2 className="text-2xl font-black text-slate-950">
                    À ne pas rater
                  </h2>
                </div>
                <Gift className="h-7 w-7 text-violet-600" />
              </div>
              <div className="mt-4 space-y-3">
                {publicCurrentOffers.map((offer) => (
                  <button
                    key={offer.title}
                    type="button"
                    onClick={() => launchOfferSearch(offer.title, offer.category)}
                    className="flex w-full items-center justify-between gap-3 rounded-3xl bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5"
                  >
                    <div>
                      <p className="font-black text-slate-950">{offer.title}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {offer.center}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-violet-700">
                        {offer.price}
                      </p>
                      <p className="text-sm font-bold text-slate-400 line-through">
                        {offer.oldPrice}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-orange-100 bg-orange-50 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-orange-700">
                    Urgence douce
                  </p>
                  <h2 className="text-2xl font-black text-slate-950">
                    Bientôt terminées
                  </h2>
                </div>
                <Timer className="h-7 w-7 text-orange-600" />
              </div>
              <div className="mt-4 grid gap-2">
                {publicEndingSoonOffers.map((offer) => (
                  <button
                    key={offer.title}
                    type="button"
                    onClick={() => launchOfferSearch(offer.title, offer.category)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left font-black shadow-sm transition hover:bg-orange-100"
                  >
                    <span className="text-slate-950">{offer.title}</span>
                    <span className="rounded-full bg-orange-100 px-3 py-1 text-xs text-orange-700">
                      {offer.discount} · {offer.until}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-4 px-4 pb-8 sm:px-6 lg:px-8">
        <div className="rounded-[30px] border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-violet-50 p-5 shadow-sm sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase text-orange-600">
                Offres à ne pas manquer
              </p>
              <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Les bons plans du moment
              </h2>
            </div>
            <Flame className="hidden h-8 w-8 text-orange-500 sm:block" />
          </div>

          <div className="mt-5 flex snap-x gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {publicCurrentOffers.slice(0, 4).map((offer, index) => (
              <button
                key={`${offer.title}-${offer.center}`}
                type="button"
                onClick={() => launchOfferSearch(offer.title, offer.category)}
                className={`min-w-[270px] snap-start rounded-[26px] p-5 text-left text-white shadow-sm transition hover:-translate-y-0.5 sm:min-w-[320px] ${
                  index % 2 === 0
                    ? "bg-gradient-to-br from-orange-500 to-pink-500"
                    : "bg-gradient-to-br from-blue-600 to-violet-600"
                }`}
              >
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-black">
                  Offre limitée
                </span>
                <h3 className="mt-5 text-2xl font-black">{offer.title}</h3>
                <p className="mt-2 text-sm font-bold text-white/80">
                  {offer.center}
                </p>
                <div className="mt-6 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-3xl font-black">{offer.price}</p>
                    <p className="text-sm font-bold text-white/70 line-through">
                      {offer.oldPrice}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950">
                    Voir l'offre
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[28px] border border-orange-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase text-orange-600">
                  Expire bientôt
                </p>
                <h2 className="text-2xl font-black text-slate-950">
                  Derniers créneaux
                </h2>
              </div>
              <Timer className="h-7 w-7 text-orange-500" />
            </div>
            <div className="mt-4 space-y-3">
              {publicEndingSoonOffers.slice(0, 3).map((offer) => (
                <button
                  key={`soon-${offer.title}`}
                  type="button"
                  onClick={() => launchOfferSearch(offer.title, offer.category)}
                  className="flex w-full items-center justify-between gap-3 rounded-3xl border border-orange-100 bg-orange-50 px-4 py-3 text-left transition hover:border-orange-200"
                >
                  <div>
                    <p className="font-black text-slate-950">{offer.title}</p>
                    <p className="mt-1 text-sm font-bold text-orange-700">
                      {offer.until}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-orange-700">
                    {offer.discount}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            id="seya-assistant"
            type="button"
            onClick={focusSeyaSearch}
            className="rounded-[28px] border border-violet-200 bg-violet-600 p-5 text-left text-white shadow-sm transition hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
                <Bot className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-black uppercase text-violet-100">
                  Demandez à Seya
                </p>
                <h2 className="mt-1 text-3xl font-black">
                  Bonjour, je peux vous aider.
                </h2>
              </div>
            </div>
            <div className="mt-5 rounded-3xl bg-white p-4 text-slate-950 shadow-sm">
              <p className="text-sm font-black uppercase text-slate-400">
                Que recherchez-vous ?
              </p>
              <p className="mt-2 text-lg font-black">
                Je voudrais refaire mon remplissage gel demain.
              </p>
            </div>
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-blue-600">
              Très réservés
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              Centres de la semaine
            </h2>
            <div className="mt-4 space-y-3">
              {popularCenters.map((center, index) => (
                <button
                  key={center.name}
                  type="button"
                  onClick={() => openPopularCenter(center)}
                  className="flex w-full items-center justify-between gap-3 rounded-3xl bg-slate-50 p-4 text-left transition hover:bg-blue-50"
                >
                  <div>
                    <p className="font-black text-slate-950">
                      {index + 1}. {center.name}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      {center.city} · {center.rating}/5
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white">
                    {center.bookings} fois
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-violet-600">
              Tendances du moment
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              Ce qui monte
            </h2>
            <div className="mt-4 grid gap-3">
              {trendItems.map(([title, detail, badge, category]) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => launchOfferSearch(title, category)}
                  className="rounded-3xl border border-slate-200 p-4 text-left transition hover:border-violet-200 hover:bg-violet-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-slate-950">{title}</p>
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                      {badge}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-500">
                    {detail}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-emerald-600">
              Près de vous
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              Bons plans locaux
            </h2>
            <div className="mt-4 space-y-3">
              {nearbyDeals.map(([city, service, deal, distance]) => (
                <button
                  key={`${city}-${service}`}
                  type="button"
                  onClick={() => {
                    setLocationQuery(city);
                    setServiceQuery(service);
                    document
                      .getElementById("centres")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex w-full items-center justify-between rounded-3xl bg-emerald-50 p-4 text-left"
                >
                  <div>
                    <p className="font-black text-slate-950">{service}</p>
                    <p className="mt-1 text-sm font-bold text-slate-500">
                      {city} · {distance}
                    </p>
                  </div>
                  <span className="text-2xl font-black text-emerald-600">
                    {deal}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-blue-50 p-5">
                <Heart className="h-7 w-7 text-blue-600" />
                <p className="mt-4 text-xs font-black uppercase text-blue-700">
                  Vos instituts favoris
                </p>
                <h3 className="mt-1 text-xl font-black text-slate-950">
                  Retrouvez vite vos adresses préférées.
                </h3>
                <button
                  type="button"
                  onClick={() => document.getElementById("centres")?.scrollIntoView({ behavior: "smooth" })}
                  className="mt-5 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white"
                >
                  Voir les centres
                </button>
              </div>

              <div className="rounded-3xl bg-pink-50 p-5">
                <Gift className="h-7 w-7 text-pink-600" />
                <p className="mt-4 text-xs font-black uppercase text-pink-700">
                  Offre personnalisée
                </p>
                <h3 className="mt-1 text-xl font-black text-slate-950">
                  20% sur votre prochain soin le mois de votre anniversaire.
                </h3>
                <p className="mt-3 text-sm font-bold text-slate-500">
                  Activée dans votre espace client.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-3xl bg-slate-950 p-5 text-white">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase text-cyan-200">
                    Carte
                  </p>
                  <h3 className="mt-1 text-2xl font-black">
                    Centres autour de moi
                  </h3>
                </div>
                <MapPin className="h-8 w-8 text-cyan-200" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {["Aubière", "Clermont", "Romagnat"].map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => {
                      setLocationQuery(city);
                      scrollToCenters();
                    }}
                    className="rounded-2xl bg-white/10 px-3 py-3 text-sm font-black"
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase text-blue-600">
                Disponibilités aujourd'hui
              </p>
              <div className="mt-4 space-y-3">
                {todayAvailabilities.map(([time, service, center]) => (
                  <button
                    key={`${time}-${service}`}
                    type="button"
                    onClick={() => openAvailability(time, service, center)}
                    className="grid w-full grid-cols-[72px_1fr_auto] items-center gap-3 rounded-3xl border border-slate-200 p-4 text-left"
                  >
                    <span className="text-xl font-black text-blue-600">
                      {time}
                    </span>
                    <span>
                      <span className="block font-black text-slate-950">
                        {service}
                      </span>
                      <span className="block text-sm font-bold text-slate-500">
                        {center}
                      </span>
                    </span>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                      Réserver
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase text-slate-500">
                Derniers avis
              </p>
              <div className="mt-4 space-y-3">
                {latestReviews.map(([name, review]) => (
                  <div key={name} className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm font-black text-amber-500">★★★★★</p>
                    <p className="mt-2 font-bold text-slate-700">{review}</p>
                    <p className="mt-2 text-sm font-black text-slate-950">
                      {name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-cyan-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase text-cyan-600">
                Nouveaux centres
              </p>
              <h2 className="text-2xl font-black text-slate-950">
                Ouvertures cette semaine
              </h2>
            </div>
            <Sparkles className="h-7 w-7 text-cyan-500" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {["Glow Studio", "Maison du Regard", "Spa Volcan"].map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  const matchingCenter =
                    allCenters.find((center) => center.name === name) ??
                    allCenters.find((center) =>
                      center.categories.some((category) =>
                        name.toLowerCase().includes(category.toLowerCase().split(" ")[0]),
                      ),
                    );
                  if (matchingCenter) {
                    setSelectedCenterName(matchingCenter.name);
                  }
                  scrollToCenters();
                }}
                className="rounded-3xl border border-cyan-100 bg-cyan-50 p-4 text-left"
              >
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-cyan-700">
                  Nouveau
                </span>
                <p className="mt-4 text-xl font-black text-slate-950">{name}</p>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  Disponible sur Bookea
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="centres" className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-blue-600">
              Disponibilites
            </p>
            <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              Centres recommandes
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setFiltersExpanded((current) => !current)}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 font-black shadow-sm transition ${
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
                <p className="text-xs font-black uppercase text-slate-500">
                  Catégorie
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Tous", ...publicCenterCategories].map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveCategory(category)}
                      className={`rounded-full px-4 py-2 text-sm font-black transition ${
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
                <p className="text-xs font-black uppercase text-slate-500">
                  Ville
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Autour de moi", "Aubière", "Clermont", "Romagnat", "Chamalières"].map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => setLocationQuery(city)}
                      className={`rounded-full px-4 py-2 text-sm font-black transition ${
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
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {visibleCenters.map((center) => (
            <article
              key={center.name}
              className={`overflow-hidden rounded-[26px] border bg-white shadow-sm transition ${
                selectedCenter.name === center.name
                  ? "border-blue-300 ring-4 ring-blue-100"
                  : "border-slate-200"
              }`}
            >
              {center.cover ? (
                <div
                  className="h-28 bg-cover bg-center"
                  style={{
                    backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.18)), url(${center.cover})`,
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
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-2xl font-black text-slate-950">
                      {center.name}
                    </h3>
                    <p className="mt-1 flex items-center gap-2 font-semibold text-slate-500">
                      <MapPin className="h-4 w-4 shrink-0" />
                      {center.city} · {center.distance}
                    </p>
                  </div>
                  <button
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200"
                    aria-label={`Ajouter ${center.name} aux favoris`}
                  >
                    <Heart className="h-5 w-5 text-slate-500" />
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  <span className="font-black">{center.rating}</span>
                  <span className="font-semibold text-slate-500">
                    ({center.reviews} avis)
                  </span>
                </div>

                <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.14)]" />
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700">
                        Prochaine disponibilité
                      </p>
                      <p className="font-black text-slate-950">{center.nextSlot}</p>
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
                        <div className="absolute inset-x-2 bottom-2 flex items-center gap-1 rounded-full bg-white/85 px-2 py-1 text-[10px] font-black text-slate-700 backdrop-blur">
                          <ImageIcon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{photo.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {center.services?.length ? (
                  <div className="mt-4 rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-blue-600">
                          Prestations
                        </p>
                        <h4 className="text-xl font-black text-slate-950">
                          Les soins ({center.services.length})
                        </h4>
                      </div>
                      <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                        Top centre
                      </span>
                    </div>

                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {["Tous", ...center.categories.slice(0, 3)].map((category, index) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setServiceQuery(index === 0 ? "" : category)}
                          className={`shrink-0 rounded-full px-4 py-2 text-sm font-black transition ${
                            index === 0
                              ? "bg-blue-600 text-white shadow-sm"
                              : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                          }`}
                        >
                          {category}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 space-y-3">
                      {center.services.slice(0, 4).map((service, index) => (
                        <button
                          key={service.name}
                          type="button"
                          onClick={() => {
                            setServiceQuery(service.name);
                            selectSlot(center, center.slots[0]);
                          }}
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
                            <span className="absolute inset-0 bg-white/10" />
                            <ImageIcon className="relative h-6 w-6 text-white" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base font-black text-slate-950">
                              {service.name}
                            </span>
                            <span className="mt-0.5 block text-sm font-bold text-slate-500">
                              {service.duration} - {service.price},00 €
                            </span>
                          </span>
                          <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCenterName(center.name);
                          setBookingStatus("Liste des soins ouverte");
                        }}
                        className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                      >
                        Voir tous les soins
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCenterName(center.name);
                          setBookingStatus("Grille tarifaire selectionnee");
                        }}
                        className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100"
                      >
                        Grille tarifaire
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <p className="text-xs font-black uppercase text-slate-400">
                    Prochains créneaux
                  </p>
                  <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {center.slots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => selectSlot(center, slot)}
                        className={`shrink-0 rounded-full px-4 py-2 text-sm font-black transition ${
                          selectedCenter.name === center.name && selectedSlot === slot
                            ? "bg-blue-600 text-white"
                            : "bg-blue-50 text-blue-700 hover:bg-blue-100"
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
                          <span className="font-black text-slate-950">
                            {center.reviewHighlights[0].author}
                          </span>
                          <span className="flex items-center gap-1 text-xs font-black text-amber-600">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {center.reviewHighlights[0].rating}/5
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            {center.reviewHighlights[0].source}
                          </span>
                        </div>
                        <p className="mt-1 overflow-hidden text-sm font-semibold text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                          {center.reviewHighlights[0].comment}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {center.address || center.phone || center.email ? (
                  <div className="mt-4 rounded-3xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                        <Navigation className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase text-slate-400">
                          Coordonnées du centre
                        </p>
                        <div className="mt-2 grid gap-2 text-xs font-bold text-slate-600 sm:grid-cols-3">
                          <p className="flex min-w-0 items-start gap-2">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                            <span className="min-w-0">
                              <span className="block truncate font-black text-slate-950">
                                {center.address ?? center.city}
                              </span>
                              <span className="block text-slate-500">
                                {center.city} · {center.distance}
                              </span>
                            </span>
                          </p>
                          <p className="flex min-w-0 items-center gap-2">
                            <Phone className="h-4 w-4 shrink-0 text-emerald-600" />
                            <span className="truncate">
                              {center.phone ?? "Téléphone à renseigner"}
                            </span>
                          </p>
                          <p className="flex min-w-0 items-center gap-2">
                            <Mail className="h-4 w-4 shrink-0 text-purple-600" />
                            <span className="truncate">
                              {center.email ?? "Email à renseigner"}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openBookeaChat(center);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 shadow-sm"
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
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 px-3 py-2 text-xs font-black text-white shadow-sm"
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
                      className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-sm"
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
                      className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-sm"
                    >
                      <FacebookGlyph className="h-4 w-4" />
                      Facebook
                    </a>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {center.categories.slice(0, 3).map((category) => (
                    <span
                      key={category}
                      className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700"
                    >
                      {category}
                    </span>
                  ))}
                  {center.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => selectSlot(center, center.slots[0])}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 font-black text-white transition hover:bg-slate-800"
                >
                  Choisir ce centre
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="reservation" className="mx-auto grid max-w-6xl gap-4 px-4 pb-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CalendarCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase text-emerald-600">
                Reservation
              </p>
              <h2 className="text-2xl font-black text-slate-950">
                Reservation rapide
              </h2>
            </div>
          </div>

          <div className="mt-5 rounded-3xl bg-slate-50 p-5">
            {[
              ["Centre", selectedCenter.name],
              ["Soin", selectedCenter.service],
              ["Creneau", selectedSlot],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 border-b border-slate-200 py-3 first:pt-0"
              >
                <span className="font-bold text-slate-500">{label}</span>
                <span className="text-right font-black">{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase text-slate-500">
                Prénom
              </span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-bold outline-none focus:border-blue-500"
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
              <span className="text-xs font-black uppercase text-slate-500">
                Nom
              </span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-bold outline-none focus:border-blue-500"
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
              <span className="text-xs font-black uppercase text-slate-500">
                Téléphone
              </span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-bold outline-none focus:border-blue-500"
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
              <span className="text-xs font-black uppercase text-slate-500">
                Email
              </span>
              <input
                type="email"
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-bold outline-none focus:border-blue-500"
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
            className={`mt-4 rounded-2xl px-4 py-3 text-sm font-black ${
              bookingStatus.startsWith("Completez")
                ? "bg-rose-50 text-rose-700"
                : bookingStatus.startsWith("Reservation confirmee")
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-blue-50 text-blue-700"
            }`}
          >
            {bookingStatus}
          </p>

          <button
            type="button"
            onClick={reserveAppointment}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
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
                  <p className="text-xs font-black uppercase text-emerald-700">
                    Reservation confirmee
                  </p>
                  <h3 className="mt-1 text-2xl font-black text-slate-950">
                    Votre rendez-vous est bien reserve.
                  </h3>
                  <p className="mt-1 text-sm font-bold text-emerald-800">
                    Le planning du centre et le CRM sont mis a jour.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-xs font-black uppercase text-slate-400">
                    Centre
                  </p>
                  <p className="mt-1 font-black text-slate-950">
                    {selectedCenter.name}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-xs font-black uppercase text-slate-400">
                    Soin
                  </p>
                  <p className="mt-1 font-black text-slate-950">
                    {selectedCenter.service}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <p className="text-xs font-black uppercase text-slate-400">
                    Creneau
                  </p>
                  <p className="mt-1 font-black text-slate-950">
                    {selectedSlot}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-100 bg-white p-3">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <MessageCircle className="h-5 w-5" />
                    <p className="font-black">SMS de confirmation</p>
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    Envoye au {customerForm.phone || "numero renseigne"}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-white p-3">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Mail className="h-5 w-5" />
                    <p className="font-black">Mail de confirmation</p>
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    Envoye a {customerForm.email || "l'email renseigne"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div id="client" className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <UserRound className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-black uppercase text-blue-600">
                  Espace cliente connecté
                </p>
                <h2 className="text-2xl font-black text-slate-950 sm:text-3xl">
                  Mon compte Bookea
                </h2>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {customerForm.firstName} {customerForm.lastName} · {customerForm.email}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
              Compte actif
            </span>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[26px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-slate-400">
                    Mes RDV
                  </p>
                  <h3 className="text-xl font-black text-slate-950">
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
                        <h4 className="text-lg font-black text-slate-950">
                          {appointment.service}
                        </h4>
                        <p className="mt-1 font-semibold text-slate-500">
                          {appointment.center}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          appointment.status === "Réservé"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {appointment.status}
                      </span>
                    </div>
                    <p className="mt-4 text-base font-black text-slate-800">
                      {appointment.date} · {appointment.time}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-black text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setClientMessageDraft(
                            `Bonjour, j'ai une question sur mon rendez-vous ${appointment.service} du ${appointment.date} à ${appointment.time}.`
                          )
                        }
                        className="flex-1 rounded-2xl bg-blue-50 px-4 py-3 font-black text-blue-700 transition hover:bg-blue-100"
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
              className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-slate-400">
                    Messagerie in-app
                  </p>
                  <h3 className="text-xl font-black text-slate-950">
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
                    <p className={`text-xs font-black uppercase ${
                      message.side === "client" ? "text-blue-100" : "text-slate-400"
                    }`}>
                      {message.author} · {message.time}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-6">
                      {message.text}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={clientMessageDraft}
                  onChange={(event) => setClientMessageDraft(event.target.value)}
                  placeholder="Écrire au centre..."
                  className="min-h-12 flex-1 rounded-2xl border border-slate-200 px-4 font-bold outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={sendClientMessage}
                  className="rounded-2xl bg-slate-950 px-5 font-black text-white transition hover:bg-slate-800"
                >
                  Envoyer
                </button>
              </div>
              <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-700">
                En version connectée, le centre reçoit aussi une notification email à chaque nouveau message.
              </p>
            </section>
          </div>

          <div className="mt-5 overflow-hidden rounded-[28px] border border-white/40 bg-slate-950 p-1 shadow-xl shadow-blue-950/10">
            <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#7c3cff] via-[#2563eb] to-[#06b6d4] p-5 text-white sm:p-6">
              <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/20 blur-2xl" />
              <div className="absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-cyan-200/20 blur-2xl" />

              <div className="relative grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70">
                    Bookea Club
                  </p>
                  <h3 className="mt-2 text-3xl font-black leading-tight">
                    Carte fidélité
                  </h3>
                  <p className="mt-2 text-sm font-bold text-white/75">
                    {customerForm.firstName || "Cliente"}{" "}
                    {customerForm.lastName || "Bookea"} · 420 points
                  </p>

                  <div className="mt-5 rounded-3xl border border-white/15 bg-white/12 p-4 backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-white/60">
                          Niveau actuel
                        </p>
                        <p className="mt-1 text-xl font-black">Glow</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">
                        80 pts avant Gold
                      </span>
                    </div>

                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full w-[84%] rounded-full bg-white shadow-sm" />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((stamp) => (
                      <div
                        key={stamp}
                        className={`grid aspect-square place-items-center rounded-2xl border text-sm font-black ${
                          stamp <= 4
                            ? "border-white/30 bg-white text-blue-700"
                            : "border-dashed border-white/35 bg-white/10 text-white/55"
                        }`}
                      >
                        {stamp <= 4 ? <Star className="h-4 w-4 fill-current" /> : stamp}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {[
                      ["RDV honoré", "+40 pts"],
                      ["Avis publié", "+20 pts"],
                      ["Parrainage", "+100 pts"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-white/12 p-3">
                        <p className="text-xs font-black uppercase text-white/60">
                          {label}
                        </p>
                        <p className="mt-1 text-lg font-black">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-4 text-slate-950">
                    <div>
                      <p className="text-xs font-black uppercase text-slate-400">
                        Prochaine récompense
                      </p>
                      <p className="mt-1 font-black">
                        10 € offerts ou bonus soin
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
                      #BK-0420
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[28px] border border-blue-100 bg-blue-50/70 p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">
                  Notes partagées
                </p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">
                  Conseils visibles dans votre compte
                </h3>
              </div>
              <span className="rounded-full bg-white px-4 py-2 text-xs font-black text-blue-700 shadow-sm">
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
                    <p className="font-black text-slate-950">{note.center}</p>
                    <span className="text-xs font-black text-slate-400">
                      {note.date}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
                    {note.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="rounded-[28px] bg-slate-950 p-5 text-white shadow-sm sm:p-7 lg:p-9">
          <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase text-cyan-300">
                Plateforme multi-centres
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">
                Une seule plateforme pour la cliente et pour le centre.
              </h2>
              <p className="mt-4 font-medium leading-7 text-slate-300">
                La cliente reserve depuis l'interface publique. Le centre recoit
                le rendez-vous dans son agenda Pro, avec les donnees separees de
                chaque etablissement.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Client", "Recherche, reservation, suivi"],
                ["Centre", "CRM, agenda, KPI, relances"],
                ["Admin", "Support, abonnements, supervision"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-3xl bg-white/10 p-5">
                  <CheckCircle2 className="h-6 w-6 text-cyan-300" />
                  <p className="mt-4 text-xl font-black">{title}</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
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
        onClick={scrollToSeyaAssistant}
        className="fixed bottom-5 right-5 z-30 hidden max-w-sm rounded-3xl border border-blue-100 bg-white p-4 text-left shadow-xl transition hover:-translate-y-0.5 hover:shadow-2xl md:block"
        aria-label="Ouvrir le bloc Seya"
      >
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600 text-white">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-black text-slate-950">Seya</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
              Dites-moi le soin, la ville et le moment souhaite. Je cherche le
              meilleur creneau.
            </p>
          </div>
        </div>
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

function resolveSlotDate(slot: string) {
  const [dayLabel] = slot.split(" ");
  const targetDay = {
    Dim: 0,
    Lun: 1,
    Mar: 2,
    Mer: 3,
    Jeu: 4,
    Ven: 5,
    Sam: 6,
  }[dayLabel];
  const date = new Date();

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
