import { CrmPacks } from "@/components/tarifs/pack-subscribe";

export default function TarifCrmPage() {
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

      <CrmPacks />
    </section>
  );
}
