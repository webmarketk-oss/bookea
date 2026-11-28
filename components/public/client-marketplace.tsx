"use client";

import { Activity, ArrowRight, Clock3, Hand, Hourglass, MapPin, Scissors, Sparkles, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PublicOfferShelf } from "@/lib/public-offers";

export type MarketplaceOffer = {
  id: string;
  title: string;
  center: string;
  city: string;
  price: number;
  oldPrice: number;
  shelf: PublicOfferShelf;
  photo?: string;
  deadline: number | null;
  spots: number;
  service: string;
  searchCategory: string;
};

export type MarketplaceCenter = {
  name: string;
  city: string;
  distance: string;
  rating: string;
  reviews: number;
  service: string;
  slots: string[];
};

type ClientMarketplaceProps = {
  serviceQuery: string;
  locationQuery: string;
  categories: string[];
  activeCategory: string;
  offers: MarketplaceOffer[];
  centers: MarketplaceCenter[];
  onServiceQuery: (value: string) => void;
  onLocationQuery: (value: string) => void;
  onSearch: () => void;
  onCategory: (category: string) => void;
  onOffer: (offer: MarketplaceOffer) => void;
  onCenter: (center: MarketplaceCenter) => void;
  onSlot: (slot: string, service: string, centerName: string) => void;
};

const shortcuts: Array<{
  label: string;
  category?: string;
  query?: string;
  icon: LucideIcon;
}> = [
  { label: "Visage", category: "Soin du visage", icon: Sparkles },
  { label: "Coiffure", category: "Coiffeur", icon: Scissors },
  { label: "Laser", query: "Laser", icon: Zap },
  { label: "Minceur", category: "Minceur", icon: Activity },
  { label: "Massage", query: "Massage", category: "Bien-être", icon: Hand },
];

function money(value: number) {
  return `${value} €`;
}

const fallbackPool = [
  "/marketplace/offer-nails.jpg",
  "/marketplace/offer-hair.jpg",
  "/marketplace/offer-spa.jpg",
  "/marketplace/offer-care.jpg",
];

function fallbackPhoto(offer: MarketplaceOffer, used: Set<string>) {
  const text = `${offer.title} ${offer.service} ${offer.searchCategory}`.toLowerCase();
  const start = /(ongle|manucure|semi)/.test(text)
    ? 0
    : /(coiff|brush|balay|cheveu)/.test(text)
      ? 1
      : /(visage|éclat|eclat|hydra|soin)/.test(text)
        ? 3
        : 2;
  let photo = fallbackPool[start];
  for (let step = 0; step < fallbackPool.length && used.has(photo); step += 1) {
    photo = fallbackPool[(start + step + 1) % fallbackPool.length];
  }
  used.add(photo);
  return photo;
}

function endingPhrase(deadline: number | null) {
  if (!deadline) {
    return "";
  }
  const date = new Date(deadline);
  const left = deadline - Date.now();
  if (left <= 24 * 60 * 60 * 1000) {
    return "Dernier jour";
  }
  if (left <= 7 * 24 * 60 * 60 * 1000) {
    const weekday = date.toLocaleDateString("fr-FR", { weekday: "long" });
    return `Se termine ${weekday}`;
  }
  return `Jusqu'au ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}

function offerBadge(offer: MarketplaceOffer) {
  if (offer.spots === 1) {
    return "Plus qu’une place";
  }
  if (offer.spots > 1 && offer.spots <= 5) {
    return `Plus que ${offer.spots} places`;
  }
  return endingPhrase(offer.deadline);
}

function OfferCard({
  offer,
  photo,
  onOffer,
}: {
  offer: MarketplaceOffer;
  photo: string;
  onOffer: (offer: MarketplaceOffer) => void;
}) {
  const badge = offerBadge(offer);
  return (
    <button
      type="button"
      onClick={() => onOffer(offer)}
      className="w-[168px] shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-white text-left shadow-sm transition hover:-translate-y-0.5 sm:w-[250px] sm:rounded-[22px]"
    >
      <div className="relative h-24 sm:h-40">
        <img src={photo} alt="" className="h-full w-full object-cover" />
        {badge ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#5b46f0] px-2 py-0.5 text-[10px] font-semibold text-white sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[11px]">
            {/jusqu|termine|dernier jour/i.test(badge) ? (
              <Hourglass className="h-3 w-3" />
            ) : null}
            {badge}
          </span>
        ) : null}
      </div>
      <div className="px-2.5 pb-2.5 pt-2 sm:px-3.5 sm:pb-3.5 sm:pt-3">
        <p className="font-heading text-[13px] font-bold leading-4 text-[#17133a] sm:text-[15px] sm:leading-5">{offer.title}</p>
        <p className="mt-1 flex items-baseline gap-1.5 sm:gap-2">
          <span className="font-heading text-xl font-extrabold leading-none text-[#4d3fe0] sm:text-[1.65rem]">
            {money(offer.price)}
          </span>
          {offer.oldPrice > offer.price ? (
            <span className="text-xs text-slate-400 line-through sm:text-sm">{money(offer.oldPrice)}</span>
          ) : null}
        </p>
        <div className="mt-2 flex items-center justify-between gap-1.5 sm:mt-3 sm:gap-2">
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-slate-500 sm:text-xs">
            <MapPin className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
            <span className="truncate">{offer.city || offer.center}</span>
          </span>
          <span className="shrink-0 rounded-full bg-[#efeaff] px-2 py-0.5 text-[10px] font-semibold text-[#5b46f0] sm:px-2.5 sm:py-1 sm:text-[11px]">
            <span className="sm:hidden">Créneaux →</span>
            <span className="hidden sm:inline">Voir les créneaux →</span>
          </span>
        </div>
      </div>
    </button>
  );
}

export function ClientMarketplace({
  locationQuery,
  activeCategory,
  offers,
  centers,
  onLocationQuery,
  onServiceQuery,
  onSearch,
  onCategory,
  onOffer,
  onSlot,
}: ClientMarketplaceProps) {
  const featured =
    offers.find((offer) => offer.shelf === "bon-plan") ?? offers[0] ?? null;
  const momentOffers = offers.filter((offer) => offer.id !== featured?.id);
  const rowOffers = momentOffers.length > 0 ? momentOffers : offers;
  const soonLimit = Date.now() + 14 * 24 * 60 * 60 * 1000;
  const endingSoon = offers
    .filter((offer) => offer.deadline != null && offer.deadline <= soonLimit)
    .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));
  const brokenPrices = offers.filter((offer) => offer.oldPrice > offer.price);
  const lastSlotOffers = offers.filter(
    (offer) => offer.shelf === "derniers-creneaux" || (offer.spots > 0 && offer.spots <= 3),
  );
  const usedPhotos = new Set<string>();
  const photoById = new Map(
    offers.map((offer) => [offer.id, offer.photo || fallbackPhoto(offer, usedPhotos)]),
  );
  const liveSlots = centers
    .flatMap((center) =>
      center.slots.slice(0, 2).map((slot) => ({
        slot,
        service: center.service,
        center,
      })),
    )
    .slice(0, 8);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      {featured ? (
        <section className="grid w-full grid-cols-2 overflow-hidden rounded-[22px] bg-[#f4f0ff] sm:rounded-[28px]">
          <div className="flex flex-col justify-center px-3 py-3 sm:px-7 sm:py-4">
            {endingPhrase(featured.deadline) ? (
              <p className="inline-flex w-fit items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#5b46f0] shadow-sm sm:gap-2 sm:px-3 sm:py-1 sm:text-xs">
                <Hourglass className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                {endingPhrase(featured.deadline)}
              </p>
            ) : null}
            <h1 className="mt-1.5 max-w-md font-heading text-lg font-extrabold leading-[1.05] tracking-tight text-[#17133a] sm:mt-2 sm:text-[1.85rem]">
              Les offres beauté
              <br />
              <span className="underline decoration-[#17133a] decoration-2 underline-offset-4 sm:decoration-[3px] sm:underline-offset-[7px]">
                près de chez vous
              </span>
            </h1>
            <p className="mt-1.5 text-sm font-semibold text-[#241a55] sm:mt-2 sm:text-base">{featured.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
              <p className="font-heading text-2xl font-extrabold leading-none tracking-tight text-[#17133a] sm:text-4xl">
                {money(featured.price)}
              </p>
              {featured.oldPrice > featured.price ? (
                <p className="text-sm text-slate-400 line-through sm:text-lg">{money(featured.oldPrice)}</p>
              ) : null}
              {featured.spots > 0 ? (
                <p className="hidden border-l border-violet-200 pl-3 text-sm font-medium text-[#3b2d78] sm:block">
                  Encore {featured.spots} créneau{featured.spots > 1 ? "x" : ""} à ce tarif
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOffer(featured)}
              className="mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#5b46f0] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#4936e4] sm:mt-3 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
            >
              Voir les créneaux
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
          <div className="relative min-h-full overflow-hidden">
            <img
              src={featured.photo || "/marketplace/hero-portrait.jpg"}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
            />
            <form
              className="absolute inset-x-2 bottom-2 sm:inset-x-3 sm:bottom-3"
              onSubmit={(event) => {
                event.preventDefault();
                onSearch();
              }}
            >
              <label className="flex items-center gap-1.5 rounded-xl border border-white bg-white/95 px-2 py-1.5 shadow-lg sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#5b46f0] sm:h-4 sm:w-4" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[9px] font-semibold leading-tight text-slate-500 sm:text-[10px]">
                    Dans quelle ville réserver ?
                  </span>
                  <input
                    value={locationQuery}
                    onChange={(event) => onLocationQuery(event.target.value)}
                    aria-label="Ville de recherche"
                    placeholder="Votre ville"
                    className="w-full bg-transparent text-xs font-semibold text-[#17133a] outline-none placeholder:font-medium placeholder:text-slate-400 sm:text-sm"
                  />
                </span>
              </label>
            </form>
          </div>
        </section>
      ) : null}

      <div className="flex justify-center gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          const selected = item.category && activeCategory === item.category;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                if (item.query) {
                  onServiceQuery(item.query);
                }
                if (item.category) {
                  onCategory(item.category);
                }
                onSearch();
              }}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-sm ${
                selected
                  ? "border-violet-300 bg-violet-50 text-violet-800"
                  : "border-violet-100 bg-white text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4 text-violet-600" />
              {item.label}
            </button>
          );
        })}
      </div>

      <section id="offres">
        <h2 className="flex items-center gap-2 font-heading text-xl font-extrabold tracking-tight text-[#1a1440] sm:text-2xl">
          Les offres du moment
          <span aria-hidden>🔥</span>
        </h2>
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-4 sm:gap-4 [&::-webkit-scrollbar]:hidden">
          {rowOffers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              photo={photoById.get(offer.id) || ""}
              onOffer={onOffer}
            />
          ))}
        </div>
      </section>

      {endingSoon.length > 0 ? (
        <section>
          <h2 className="flex items-center gap-2 font-heading text-xl font-extrabold tracking-tight text-[#1a1440] sm:text-2xl">
            Bientôt terminé
            <Clock3 className="h-5 w-5 text-[#5b46f0]" />
          </h2>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-4 sm:gap-4 [&::-webkit-scrollbar]:hidden">
            {endingSoon.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                photo={photoById.get(offer.id) || ""}
                onOffer={onOffer}
              />
            ))}
          </div>
        </section>
      ) : null}

      {brokenPrices.length > 0 ? (
        <section>
          <h2 className="font-heading text-xl font-extrabold tracking-tight text-[#1a1440] sm:text-2xl">
            Offres à prix cassé
          </h2>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-4 sm:gap-4 [&::-webkit-scrollbar]:hidden">
            {brokenPrices.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                photo={photoById.get(offer.id) || ""}
                onOffer={onOffer}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="flex items-center gap-2 font-heading text-xl font-extrabold tracking-tight text-[#1a1440] sm:text-2xl">
          Dernier créneau dispo
          <Clock3 className="h-5 w-5 text-slate-700" />
        </h2>
        {lastSlotOffers.length > 0 ? (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-4 sm:gap-4 [&::-webkit-scrollbar]:hidden">
            {lastSlotOffers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                photo={photoById.get(offer.id) || ""}
                onOffer={onOffer}
              />
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {liveSlots.map((item) => (
            <button
              key={`${item.center.name}-${item.slot}`}
              type="button"
              onClick={() => onSlot(item.slot, item.service, item.center.name)}
              className="flex w-[180px] shrink-0 items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 text-left shadow-sm sm:w-[220px] sm:gap-3 sm:px-4 sm:py-3"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-700">
                <Clock3 className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[#1a1440]">{item.slot}</span>
                <span className="block truncate text-xs text-slate-500">
                  {item.service} · {item.center.city}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
