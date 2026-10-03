import { PriceCard } from "@/components/tarifs/price-card";
import { crmOffers } from "@/lib/bookea-tarifs";

export default function TarifCrmPage() {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">CRM Bookea</h2>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
          Le CRM seul est à 49 €. Le CRM + inclut 300 SMS offerts et les
          fonctions de base Bookea : planning, planning en ligne, SMS de
          confirmation des rendez-vous et automatisation des SMS.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {crmOffers.map((offer) => (
          <PriceCard
            key={offer.id}
            title={offer.title}
            price={`${offer.price} €`}
            period={offer.period}
            highlight={"highlight" in offer && offer.highlight}
          >
            <ul className="mt-4 grid gap-2 text-sm font-medium text-slate-600">
              {offer.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </PriceCard>
        ))}
      </div>
    </section>
  );
}
