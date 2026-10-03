import { PriceCard } from "@/components/tarifs/price-card";
import { whatsappLeadPacks } from "@/lib/bookea-tarifs";

export default function TarifWhatsappPage() {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Agent Seya WhatsApp</h2>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
          Relance, qualification et reprise de rendez-vous sur vos leads. Seya
          écrit au prospect, qualifie la demande et relance pour reposer un RDV.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {whatsappLeadPacks.map((pack) => (
          <PriceCard
            key={pack.leads}
            title={`${pack.leads} leads`}
            price={`${pack.price} €`}
            detail={pack.detail}
            highlight={pack.leads === 200}
          />
        ))}
      </div>
    </section>
  );
}
