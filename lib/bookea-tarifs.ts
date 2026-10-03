export const BREVO_SMS_FRANCE_UNIT = 0.045;

const brevoUnitForQuantity = (quantity: number) => {
  if (quantity >= 800) return 0.038;
  if (quantity >= 300) return 0.04;
  if (quantity >= 200) return 0.042;
  return BREVO_SMS_FRANCE_UNIT;
};

export function brevoSmsCost(quantity: number) {
  return Number((quantity * brevoUnitForQuantity(quantity)).toFixed(2));
}

export const WHATSAPP_PACK_POINTS = [
  "Relance",
  "Qualification",
  "Reprise de RDV",
] as const;

export const whatsappLeadPacks = [
  { leads: 100, price: 79 },
  { leads: 200, price: 159 },
  { leads: 300, price: 229 },
  { leads: 500, price: 389 },
] as const;

export function formatEuro(value: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export const smsPacks = [30, 50, 100, 200, 300, 800].map((quantity) => {
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
