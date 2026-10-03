import { FeatureTicks } from "@/components/tarifs/feature-ticks";
import { PriceCard } from "@/components/tarifs/price-card";
import { crmOffers } from "@/lib/bookea-tarifs";

const crmPlus = crmOffers.find((offer) => offer.id === "crm-plus");

export default function TarifCrmPage() {
  if (!crmPlus) {
    return null;
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">CRM + SMS</h2>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
          49 € par mois, avec 300 SMS offerts et les fonctions de base Bookea :
          planning, planning en ligne, SMS de confirmation des rendez-vous et
          automatisation des SMS.
        </p>
      </div>

      <div className="max-w-md">
        <PriceCard
          title={crmPlus.title}
          price={`${crmPlus.price} €`}
          period={crmPlus.period}
          highlight
        >
          <FeatureTicks items={crmPlus.points} />
        </PriceCard>
      </div>
    </section>
  );
}
