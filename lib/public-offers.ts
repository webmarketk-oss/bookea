export const PUBLIC_OFFER_SHELVES = [
  { id: "bon-plan", label: "Bon plan du moment" },
  { id: "offre-limitee", label: "Offre limitée" },
  { id: "derniers-creneaux", label: "Derniers créneaux disponibles" },
  { id: "pres-de-chez-vous", label: "Près de chez vous" },
] as const;

export type PublicOfferShelf = (typeof PUBLIC_OFFER_SHELVES)[number]["id"];

export function publicOfferShelfLabel(shelf: PublicOfferShelf) {
  return PUBLIC_OFFER_SHELVES.find((item) => item.id === shelf)?.label ?? "Bon plan du moment";
}

export function offerShelf(offer: { shelf?: string; tag?: string }): PublicOfferShelf {
  const raw = String(offer.shelf || "").trim();
  if (PUBLIC_OFFER_SHELVES.some((item) => item.id === raw)) {
    return raw as PublicOfferShelf;
  }
  const tag = String(offer.tag || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (tag.includes("creneau") || tag.includes("epuis")) {
    return "derniers-creneaux";
  }
  if (tag.includes("limit")) {
    return "offre-limitee";
  }
  if (tag.includes("pres") || tag.includes("chez vous")) {
    return "pres-de-chez-vous";
  }
  return "bon-plan";
}

export function offerDeadline(offer: {
  timerEnabled?: boolean;
  endsAt?: string;
  endsAtTime?: string;
}) {
  if (!offer.timerEnabled || !offer.endsAt) {
    return null;
  }
  const time = /^\d{2}:\d{2}$/.test(String(offer.endsAtTime || ""))
    ? offer.endsAtTime
    : "23:59";
  const stamp = Date.parse(`${offer.endsAt}T${time}:00`);
  return Number.isNaN(stamp) ? null : stamp;
}

export function offerIsLive(
  offer: {
    visible?: boolean;
    timerEnabled?: boolean;
    endsAt?: string;
    endsAtTime?: string;
  },
  now = Date.now(),
) {
  if (offer.visible === false) {
    return false;
  }
  const deadline = offerDeadline(offer);
  return deadline == null || deadline > now;
}

export function countdownParts(deadline: number, now: number) {
  const left = Math.max(0, deadline - now);
  const total = Math.floor(left / 1000);
  return {
    done: left <= 0,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
