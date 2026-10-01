"use client";

import {
  CalendarCheck2,
  Clock3,
  Euro,
  FileText,
  HeartHandshake,
  LogOut,
  MessageCircle,
  Percent,
  Receipt,
  RefreshCcw,
  Reply,
  Sparkles,
  UserCheck,
} from "lucide-react";

import type { SeyaKpiResult } from "@/lib/seya-kpi";
import { formatSeyaKpiDelay } from "@/lib/seya-kpi";

export function SeyaKpiPanel({ kpi }: { kpi: SeyaKpiResult }) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Contactés"
          value={kpi.contacted}
          detail="Seya a envoyé au moins un message"
          icon={<MessageCircle className="h-5 w-5" />}
          color="text-violet-600"
        />
        <KpiCard
          title="Ont répondu"
          value={kpi.replied}
          detail={`Taux de réponse ${kpi.replyRate}%`}
          icon={<Reply className="h-5 w-5" />}
          color="text-cyan-600"
        />
        <KpiCard
          title="Qualifiés"
          value={kpi.qualified}
          detail="Soin ou zone connus dans le fil"
          icon={<UserCheck className="h-5 w-5" />}
          color="text-blue-600"
        />
        <KpiCard
          title="RDV posés par Seya"
          value={kpi.booked}
          detail={`${kpi.proposed} créneaux proposés · taux ${kpi.proposalToBookRate}%`}
          icon={<CalendarCheck2 className="h-5 w-5" />}
          color="text-emerald-600"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          title="CA Seya"
          value={formatEuro(kpi.revenue)}
          detail={`${kpi.devis} devis · ${kpi.invoices} facture${kpi.invoices > 1 ? "s" : ""}`}
          icon={<Euro className="h-5 w-5" />}
          color="text-amber-600"
        />
        <KpiCard
          title="Devis"
          value={kpi.devis}
          detail="Leads contactés par Seya uniquement"
          icon={<FileText className="h-5 w-5" />}
          color="text-amber-600"
        />
        <KpiCard
          title="Factures"
          value={kpi.invoices}
          detail="Factures finales de ces mêmes leads"
          icon={<Receipt className="h-5 w-5" />}
          color="text-cyan-600"
        />
      </section>

      <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <LogOut className="h-5 w-5 text-slate-500" />
          <h3 className="font-semibold">Sorties</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <MiniStat label="Pas intéressé" value={kpi.notInterested} />
          <MiniStat label="Reviendra vers nous" value={kpi.willComeBack} />
          <MiniStat label="Hors zone / mauvais centre" value={kpi.outOfZoneOrWrongCenter} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <RefreshCcw className="h-5 w-5 text-violet-600" />
            <h3 className="font-semibold">Après relance</h3>
          </div>
          <MiniStat label="Relancés" value={kpi.relanced} />
          <MiniStat label="Ont répondu après relance" value={kpi.repliedAfterRelance} />
          <MiniStat label="RDV après relance" value={kpi.bookedAfterRelance} />
        </article>
        <article className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Percent className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold">Proposition → RDV</h3>
          </div>
          <p className="text-3xl font-semibold text-emerald-600">
            {kpi.proposalToBookRate}%
          </p>
          <p className="mt-2 text-sm font-bold text-slate-500">
            {kpi.booked} RDV sur {kpi.proposed} proposition
            {kpi.proposed > 1 ? "s" : ""}
          </p>
        </article>
        <article className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-rose-600" />
            <h3 className="font-semibold">Handoff</h3>
          </div>
          <MiniStat label="Revue santé" value={kpi.healthHandoff} />
          <MiniStat label="À recontacter" value={kpi.humanHandoff} />
          <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500">
            <Clock3 className="h-4 w-4" />
            Délai moyen 1er RDV : {formatSeyaKpiDelay(kpi.averageHoursToFirstRdv)}
          </div>
        </article>
      </section>

      <p className="flex items-center gap-2 text-sm font-semibold text-slate-500">
        <Sparkles className="h-4 w-4 text-violet-600" />
        Uniquement les conversations WhatsApp Seya du centre. Le bloc planning n’est
        pas compté.
      </p>
    </div>
  );
}

function KpiCard({
  title,
  value,
  detail,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <div className={`grid h-11 w-11 place-items-center rounded-2xl bg-slate-50 ${color}`}>
          {icon}
        </div>
      </div>
      <p className={`mt-5 text-2xl font-semibold ${color}`}>{value}</p>
      <p className="mt-2 text-sm font-bold text-slate-500">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
