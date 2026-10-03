import { SmsPacks } from "@/components/tarifs/pack-subscribe";
import { BREVO_SMS_FRANCE_UNIT, formatEuro } from "@/lib/bookea-tarifs";

export default function TarifSmsPage() {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Packs SMS</h2>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
          Rechargez le solde SMS du centre au tarif France, environ{" "}
          {formatEuro(BREVO_SMS_FRANCE_UNIT, 3)} par SMS. Les crédits s’ajoutent
          tout de suite.
        </p>
      </div>

      <SmsPacks />
    </section>
  );
}
