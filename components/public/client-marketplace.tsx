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
      className="w-[250px] shrink-0 overflow-hidden rounded-[22px] border border-slate-100 bg-white text-left shadow-sm transition hover:-translate-y-0.5"
    >
      <div className="relative h-40">
        <img src={photo} alt="" className="h-full w-full object-cover" />
        {badge ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#5b46f0] px-2.5 py-1 text-[11px] font-semibold text-white">
            {/jusqu|termine|dernier jour/i.test(badge) ? (
              <Hourglass className="h-3 w-3" />
            ) : null}
            {badge}
          </span>
        ) : null}
      </div>
      <div className="px-3.5 pb-3.5 pt-3">
        <p className="font-heading text-[15px] font-bold leading-5 text-[#17133a]">{offer.title}</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="font-heading text-[1.65rem] font-extrabold leading-none text-[#4d3fe0]">
            {money(offer.price)}
          </span>
          {offer.oldPrice > offer.price ? (
            <span className="text-sm text-slate-400 line-through">{money(offer.oldPrice)}</span>
          ) : null}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{offer.city || offer.center}</span>
          </span>
          <span className="shrink-0 rounded-full bg-[#efeaff] px-2.5 py-1 text-[11px] font-semibold text-[#5b46f0]">
            Voir les créneaux →
          </span>
        </div>
      </div>
    </button>
  );
}

export function ClientMarketplace({
  activeCategory,
  offers,
  centers,
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
        <section className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-[28px] bg-[#f4f0ff] lg:grid-cols-[1.02fr_0.98fr]">
          <div className="flex flex-col justify-center px-6 py-7 sm:px-9 sm:py-10">
            {endingPhrase(featured.deadline) ? (
              <p className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#5b46f0] shadow-sm">
                <Hourglass className="h-3.5 w-3.5" />
                {endingPhrase(featured.deadline)}
              </p>
            ) : null}
            <h1 className="mt-4 max-w-md font-heading text-[2.15rem] font-extrabold leading-[1.05] tracking-tight text-[#17133a] sm:text-[2.7rem]">
              Les offres beauté
              <br />
              <span className="underline decoration-[#17133a] decoration-[3px] underline-offset-[7px]">
                près de chez vous
              </span>
            </h1>
            <p className="mt-5 text-lg font-semibold text-[#241a55]">{featured.title}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="font-heading text-[2.7rem] font-extrabold leading-none tracking-tight text-[#17133a]">
                {money(featured.price)}
              </p>
              {featured.oldPrice > featured.price ? (
                <p className="text-lg text-slate-400 line-through">{money(featured.oldPrice)}</p>
              ) : null}
              {featured.spots > 0 ? (
                <p className="border-l border-violet-200 pl-3 text-sm font-medium text-[#3b2d78]">
                  Encore {featured.spots} créneau{featured.spots > 1 ? "x" : ""} à ce tarif
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOffer(featured)}
              className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-[#5b46f0] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4936e4]"
            >
              Voir les créneaux
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="relative min-h-64">
            <img
              src={featured.photo || "/marketplace/hero-portrait.jpg"}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[center_20%] lg:rounded-l-[72px]"
            />
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
        <h2 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight text-[#1a1440]">
          Les offres du moment
          <span aria-hidden>🔥</span>
        </h2>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          <h2 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight text-[#1a1440]">
            Bientôt terminé
            <Clock3 className="h-5 w-5 text-[#5b46f0]" />
          </h2>
          <div className="mt-4 flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          <h2 className="font-heading text-2xl font-extrabold tracking-tight text-[#1a1440]">
            Offres à prix cassé
          </h2>
          <div className="mt-4 flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        <h2 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight text-[#1a1440]">
          Dernier créneau dispo
          <Clock3 className="h-5 w-5 text-slate-700" />
        </h2>
        {lastSlotOffers.length > 0 ? (
          <div className="mt-4 flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              className="flex w-[220px] shrink-0 items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm"
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
