import * as offers from "../api/billing/_offers.js";

export const BREVO_SMS_FRANCE_UNIT: number = offers.BREVO_SMS_FRANCE_UNIT;

export function brevoSmsCost(quantity: number): number {
  return offers.brevoSmsCost(quantity);
}

export const WHATSAPP_PACK_POINTS = [
  "Relance",
  "Qualification",
  "Reprise de RDV",
] as const;

export const whatsappLeadPacks: ReadonlyArray<{ leads: number; price: number }> =
  offers.WHATSAPP_LEAD_PACKS;

export function formatEuro(value: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export const smsPacks = offers.SMS_PACK_QUANTITIES.map((quantity: number) => {
  const price = brevoSmsCost(quantity);

  return {
    quantity,
    price,
    unit: Number((price / quantity).toFixed(3)),
  };
});

export const crmOffers = [
  {
    id: "crm-seul",
    title: "CRM seul",
    price: 49,
    period: "/ mois",
    points: [
      "Fiches leads et clientes",
      "Suivi commercial Bookea",
      "Statuts, notes et historique",
    ],
  },
  {
    id: "crm-plus",
    title: "CRM + SMS",
    price: 49,
    period: "/ mois",
    highlight: true,
    points: [
      "300 SMS offerts",
      "Planning du centre",
      "Planning en ligne",
      "SMS de confirmation des rendez-vous",
      "Automatisation des SMS",
      "Fonctionnalités de base Bookea",
    ],
  },
] as const;
