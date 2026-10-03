import { PriceCard } from "@/components/tarifs/price-card";
import { BREVO_SMS_FRANCE_UNIT, smsPacks } from "@/lib/bookea-tarifs";

function formatEuro(value: number, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export default function TarifSmsPage() {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Packs SMS</h2>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
          Les SMS Bookea partent via Brevo. En France, le coût opérateur est
          d’environ {formatEuro(BREVO_SMS_FRANCE_UNIT, 3)} par SMS (environ{" "}
          {formatEuro(100 * BREVO_SMS_FRANCE_UNIT)} les 100 SMS). Les packs
          ci-dessous reprennent ce tarif, arrondi.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {smsPacks.map((pack) => (
          <PriceCard
            key={pack.quantity}
            title={`${pack.quantity} SMS`}
            price={`${pack.price} €`}
            detail={`${formatEuro(pack.unit)} / SMS`}
            highlight={pack.quantity === 300}
          >
            <p className="mt-3 text-sm font-medium text-slate-500">
              Coût Brevo ≈ {formatEuro(pack.cost)}
            </p>
          </PriceCard>
        ))}
      </div>
    </section>
  );
}
