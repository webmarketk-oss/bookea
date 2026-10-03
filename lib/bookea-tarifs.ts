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

export const whatsappLeadPacks = [
  {
    leads: 100,
    price: 79,
    detail: "Relance, qualification et reprise de RDV",
  },
  {
    leads: 200,
    price: 159,
    detail: "Relance, qualification et reprise de RDV",
  },
  {
    leads: 300,
    price: 229,
    detail: "Volume centre, suivi Seya inclus",
  },
  {
    leads: 500,
    price: 389,
    detail: "Le plus complet pour un flux de leads",
  },
] as const;

export const smsPacks = [30, 50, 100, 200, 300, 800].map((quantity) => {
  const cost = brevoSmsCost(quantity);
  const sell =
    quantity === 30
      ? 3
      : quantity === 50
        ? 5
        : quantity === 100
          ? 9
          : quantity === 200
            ? 15
            : quantity === 300
              ? 22
              : 49;

  return {
    quantity,
    cost,
    price: sell,
    unit: Number((sell / quantity).toFixed(3)),
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
