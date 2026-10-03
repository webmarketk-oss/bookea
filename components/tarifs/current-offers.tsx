"use client";

import { useEffect, useState } from "react";

import { formatEuro } from "@/lib/bookea-tarifs";
import { loadActiveCenterBilling } from "@/lib/center-billing";
import { formatOfferDate } from "@/lib/center-offers";

type OfferLines = {
  whatsapp: string;
  sms: string;
  bookea: string;
};

function emptyLines(): OfferLines {
  return {
    whatsapp: "WhatsApp : pas encore souscrit",
    sms: "SMS : solde à jour · sans date limite",
    bookea: "Bookea : pas encore souscrit",
  };
}

export const BOOKEA_OFFERS_UPDATED = "bookea-offers-updated";

export function notifyOffersUpdated() {
  window.dispatchEvent(new Event(BOOKEA_OFFERS_UPDATED));
}

export function CurrentOffers() {
  const [lines, setLines] = useState<OfferLines>(emptyLines());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick((value) => value + 1);
    window.addEventListener(BOOKEA_OFFERS_UPDATED, refresh);
    window.addEventListener("bookea-active-center-changed", refresh);
    return () => {
      window.removeEventListener(BOOKEA_OFFERS_UPDATED, refresh);
      window.removeEventListener("bookea-active-center-changed", refresh);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void loadActiveCenterBilling()
      .then((billing) => {
        if (!alive) return;
        setLines({
          whatsapp: billing.whatsappOffer
            ? `WhatsApp : ${billing.whatsappOffer.leads} leads · ${formatEuro(billing.whatsappOffer.price)} / mois · renouvellement le ${formatOfferDate(billing.whatsappOffer.renewsAt)}`
            : "WhatsApp : pas encore souscrit",
          sms: `SMS : ${billing.smsRemaining} restants · sans date limite`,
          bookea: billing.bookeaPlan
            ? `Bookea : ${billing.bookeaPlan.title} · ${formatEuro(billing.bookeaPlan.price)} / mois · renouvellement le ${formatOfferDate(billing.bookeaPlan.renewsAt)}`
            : "Bookea : pas encore souscrit",
        });
      })
      .catch(() => {
        if (alive) {
          setLines(emptyLines());
        }
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
        Offre actuelle
      </p>
      <ul className="mt-3 grid gap-1.5 text-sm font-medium text-slate-700">
        <li>{lines.whatsapp}</li>
        <li>{lines.sms}</li>
        <li>{lines.bookea}</li>
      </ul>
    </section>
  );
}
