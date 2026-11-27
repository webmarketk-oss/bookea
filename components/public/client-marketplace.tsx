"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Clock3, Flame, MapPin, Search, Sparkles, Timer } from "lucide-react";
import {
  countdownParts,
  publicOfferShelfLabel,
  type PublicOfferShelf,
} from "@/lib/public-offers";

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

const popularSearches = [
  "Hydrafacial",
  "Épilation laser",
  "Bilan minceur",
  "Soin du visage",
  "Massage",
];

function money(value: number) {
  return `${value} €`;
}

function discountPercent(price: number, oldPrice: number) {
  if (!oldPrice || oldPrice <= price) {
    return 0;
  }
  return Math.round((1 - price / oldPrice) * 100);
}

function spotsLabel(spots: number) {
  if (spots === 1) {
    return "Plus qu’une place";
  }
  if (spots > 1) {
    return `Plus que ${spots} places`;
  }
  return "";
}

function endDateLabel(deadline: number) {
  const date = new Date(deadline);
  const day = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${day} · ${time}`;
}

function OfferTimer({ deadline }: { deadline: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (now == null) {
    return <div className="h-12 rounded-xl bg-stone-950" aria-hidden="true" />;
  }

  const parts = countdownParts(deadline, now);
  const cells = [
    [parts.days, "j"],
    [parts.hours, "h"],
    [parts.minutes, "min"],
    [parts.seconds, "s"],
  ] as const;

  return (
    <div
      className="rounded-xl bg-stone-950 px-2.5 py-1.5 text-white"
      aria-label="Temps restant"
    >
      <p className="flex items-baseline justify-between gap-2 text-sm font-semibold tabular-nums">
        {cells.map(([value, label]) => (
          <span key={label} className={label === "s" ? "text-rose-400" : undefined}>
            {String(value).padStart(2, "0")}
            <span className="ml-0.5 text-[10px] font-medium uppercase text-white/60">{label}</span>
          </span>
        ))}
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-rose-200">
        Fin le {endDateLabel(deadline)}
      </p>
    </div>
  );
}

function SectionHeading({
  kicker,
  title,
  action,
  urgent = false,
}: {
  kicker: string;
  title: string;
  action?: string;
  urgent?: boolean;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
            urgent ? "text-rose-700" : "text-stone-400"
          }`}
        >
          {kicker}
        </p>
        <h2 className="mt-1 flex items-center gap-2 font-serif text-2xl text-stone-950 sm:text-[1.7rem]">
          {title}
          {urgent ? (
            <Flame className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
          ) : null}
        </h2>
      </div>
      {action ? (
        <span className="hidden text-sm font-medium text-stone-500 sm:inline">{action}</span>
      ) : null}
    </div>
  );
}

export function ClientMarketplace({
  serviceQuery,
  locationQuery,
  categories,
  activeCategory,
  offers,
  centers,
  onServiceQuery,
  onLocationQuery,
  onSearch,
  onCategory,
  onOffer,
  onCenter,
  onSlot,
}: ClientMarketplaceProps) {
  const featured =
    offers.find((offer) => offer.shelf === "bon-plan") ??
    offers.find((offer) => offer.shelf === "offre-limitee");
  const limited = offers.filter((offer) => offer.shelf === "offre-limitee");
  const slots = offers.filter((offer) => offer.shelf === "derniers-creneaux");
  const nearbyOffers = offers.filter((offer) => offer.shelf === "pres-de-chez-vous");
  const liveSlots = centers
    .flatMap((center) =>
      center.slots.slice(0, 1).map((slot) => ({
        slot,
        service: center.service,
        center,
      })),
    )
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-3 py-5 sm:px-6 lg:px-8 lg:py-8">
      <section className="overflow-hidden rounded-[28px] border border-stone-200 bg-[#fbf8f4] shadow-sm">
        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
              Votre beauté, nos meilleures adresses
            </p>
            <h1 className="mt-3 max-w-xl font-serif text-4xl leading-[1.05] text-stone-950 sm:text-5xl">
              Trouvez le soin{" "}
              <span className="text-violet-700">qui vous ressemble</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-stone-600 sm:text-base">
              Réservez en quelques clics. Les offres limitées, les derniers
              créneaux et les adresses près de chez vous sont publiés par les
              centres.
            </p>
            <form
              className="mt-6 flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                onSearch();
              }}
            >
              <label className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-stone-400" />
                <input
                  value={serviceQuery}
                  onChange={(event) => onServiceQuery(event.target.value)}
                  aria-label="Quel soin recherchez-vous"
                  placeholder="Quel soin recherchez-vous ?"
                  className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-stone-400"
                />
              </label>
              <label className="flex min-w-0 flex-1 items-center gap-2 border-t border-stone-100 px-3 py-2 sm:border-t-0 sm:border-l">
                <MapPin className="h-4 w-4 shrink-0 text-stone-400" />
                <input
                  value={locationQuery}
                  onChange={(event) => onLocationQuery(event.target.value)}
                  aria-label="Votre ville"
                  placeholder="Votre ville"
                  className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-stone-400"
                />
              </label>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-800"
              >
                Rechercher
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {popularSearches.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    onServiceQuery(item);
                    onSearch();
                  }}
                  className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <aside className="rounded-[24px] border border-white/80 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-700 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-950">Seya</p>
                <p className="text-xs text-stone-500">
                  Je vous aide à trouver le bon créneau.
                </p>
              </div>
            </div>
            <p className="mt-4 rounded-2xl bg-stone-50 px-3 py-3 text-sm leading-6 text-stone-700">
              « Je cherche un soin près de chez moi, ce week-end. »
            </p>
            <button
              type="button"
              onClick={onSearch}
              className="mt-4 w-full rounded-xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white"
            >
              Discuter avec Seya
            </button>
          </aside>
        </div>
        <div className="flex gap-2 overflow-x-auto border-t border-stone-200/80 px-5 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {["Tous", ...categories].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onCategory(category)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                activeCategory === category
                  ? "bg-stone-950 text-white"
                  : "bg-white text-stone-600"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <SectionHeading kicker="À saisir" title="Offre limitée" urgent />
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {limited.length === 0 ? (
              <p className="text-sm text-stone-500">
                Les offres limitées publiées par les centres apparaîtront ici.
              </p>
            ) : (
              limited.map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => onOffer(offer)}
                  className="w-[260px] shrink-0 rounded-3xl border border-stone-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-stone-400"
                >
                  <div className="relative flex h-28 items-end overflow-hidden rounded-2xl bg-stone-100 p-3">
                    {offer.photo ? (
                      <img src={offer.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : null}
                    <span className="relative rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {publicOfferShelfLabel(offer.shelf)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-stone-950">{offer.title}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {offer.center}
                    {offer.city ? ` · ${offer.city}` : ""}
                  </p>
                  {spotsLabel(offer.spots) ? (
                    <p className="mt-2 text-xs font-semibold text-rose-700">{spotsLabel(offer.spots)}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-baseline gap-2">
                    <p className="text-xl font-semibold text-stone-950">{money(offer.price)}</p>
                    {offer.oldPrice > offer.price ? (
                      <p className="text-base font-medium text-stone-400 line-through decoration-rose-400">
                        {money(offer.oldPrice)}
                      </p>
                    ) : null}
                    {discountPercent(offer.price, offer.oldPrice) > 0 ? (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                        −{discountPercent(offer.price, offer.oldPrice)} %
                      </span>
                    ) : null}
                  </div>
                  {offer.deadline ? (
                    <div className="mt-3">
                      <OfferTimer deadline={offer.deadline} />
                    </div>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        {featured ? (
          <button
            type="button"
            onClick={() => onOffer(featured)}
            className="rounded-[28px] border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                Bon plan du moment
              </p>
              <Timer className="h-5 w-5 text-rose-600" />
            </div>
            <h2 className="mt-4 font-serif text-3xl text-stone-950">{featured.title}</h2>
            <p className="mt-2 text-sm text-stone-500">
              {featured.center}
              {spotsLabel(featured.spots)
                ? ` · ${spotsLabel(featured.spots).toLowerCase()}`
                : featured.spots > 0
                  ? ` · ${featured.spots} places`
                  : ""}
            </p>
            <div className="mt-5 flex flex-wrap items-baseline gap-3">
              <p className="text-4xl font-semibold text-stone-950">{money(featured.price)}</p>
              {featured.oldPrice > featured.price ? (
                <p className="text-2xl font-medium text-stone-400 line-through decoration-rose-400">
                  {money(featured.oldPrice)}
                </p>
              ) : null}
              {discountPercent(featured.price, featured.oldPrice) > 0 ? (
                <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white">
                  −{discountPercent(featured.price, featured.oldPrice)} %
                </span>
              ) : null}
            </div>
            {featured.deadline ? (
              <div className="mt-4">
                <OfferTimer deadline={featured.deadline} />
              </div>
            ) : (
              <p className="mt-5 text-sm text-stone-500">Offre en cours dans ce centre.</p>
            )}
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-stone-950">
              Voir l&apos;offre
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        ) : (
          <div className="rounded-[28px] border border-dashed border-stone-200 bg-white p-5 text-sm text-stone-500">
            Le bon plan du moment se règle dans les paramètres du centre.
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <SectionHeading
          kicker="Avant qu'il ne soit trop tard"
          title="Derniers créneaux disponibles"
          urgent
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {slots.map((offer) => (
            <button
              key={offer.id}
              type="button"
              onClick={() => onOffer(offer)}
              className="rounded-3xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-400"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                {spotsLabel(offer.spots) || "Places limitées"}
              </p>
              <p className="mt-2 font-semibold text-stone-950">{offer.title}</p>
              <p className="mt-1 text-sm text-stone-500">{offer.center}</p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold text-stone-950">{money(offer.price)}</span>
                  {offer.oldPrice > offer.price ? (
                    <span className="text-base font-medium text-stone-400 line-through decoration-rose-400">
                      {money(offer.oldPrice)}
                    </span>
                  ) : null}
                </p>
                <span className="rounded-full bg-stone-950 px-3 py-1.5 text-xs font-semibold text-white">
                  Réserver
                </span>
              </div>
              {offer.deadline ? (
                <div className="mt-3">
                  <OfferTimer deadline={offer.deadline} />
                </div>
              ) : null}
            </button>
          ))}
          {liveSlots.map((item) => (
            <button
              key={`${item.center.name}-${item.slot}`}
              type="button"
              onClick={() => onSlot(item.slot, item.service, item.center.name)}
              className="rounded-3xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-400"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-3 py-1.5 text-sm font-semibold text-white">
                <Clock3 className="h-3.5 w-3.5" />
                {item.slot}
              </div>
              <p className="mt-3 font-semibold text-stone-950">{item.service}</p>
              <p className="mt-1 text-sm text-stone-500">
                {item.center.name} · {item.center.city}
              </p>
              <span className="mt-4 inline-flex rounded-full bg-stone-950 px-3 py-1.5 text-xs font-semibold text-white">
                Réserver
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <SectionHeading kicker="Autour de vous" title="Près de chez vous" />
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {centers.slice(0, 3).map((center) => {
            const deal = nearbyOffers.find((offer) => offer.center === center.name);
            return (
              <button
                key={center.name}
                type="button"
                onClick={() => (deal ? onOffer(deal) : onCenter(center))}
                className="rounded-3xl border border-stone-200 bg-[#fbf8f4] p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-stone-950">{center.name}</p>
                    <p className="mt-1 text-sm text-stone-500">
                      {center.city}
                      {center.distance ? ` · ${center.distance}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-amber-600">★ {center.rating}</p>
                </div>
                <p className="mt-3 text-sm text-stone-600">{center.service}</p>
                {deal ? (
                  <p className="mt-3 text-sm font-semibold text-violet-800">
                    {deal.title} · {money(deal.price)}
                  </p>
                ) : null}
                <span className="mt-4 inline-flex text-sm font-semibold text-stone-950">
                  Voir les créneaux
                </span>
              </button>
            );
          })}
        </div>
        {nearbyOffers.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {nearbyOffers
              .filter((offer) => !centers.slice(0, 3).some((center) => center.name === offer.center))
              .map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => onOffer(offer)}
                  className="flex items-center justify-between rounded-2xl border border-stone-200 px-4 py-3 text-left"
                >
                  <span>
                    <span className="block text-sm font-semibold text-stone-950">{offer.title}</span>
                    <span className="block text-xs text-stone-500">{offer.center}</span>
                  </span>
                  <span className="text-sm font-semibold">{money(offer.price)}</span>
                </button>
              ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
