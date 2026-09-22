"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { inactiveLeadStatuses } from "@/lib/lead-statuses";
import { Lead } from "@/types/lead";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Euro,
  FileText,
  ShoppingBag,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";

type KPIDashboardProps = {
  leads: Lead[];
};

type KPIPeriod =
  | "all"
  | "month"
  | "last15"
  | "last30"
  | "previousMonth"
  | "custom";

const periodLabels: Record<KPIPeriod, string> = {
  all: "Tout",
  month: "Ce mois",
  last15: "15 derniers jours",
  last30: "30 derniers jours",
  previousMonth: "Mois dernier",
  custom: "Personnalisé",
};

const soldStatuses = ["Vendu", "Client converti", "Client"];
const rdvStatuses = [
  "RDV pris",
  "RDV confirmé",
  "RDV programmé",
  "RDV fixé",
  "Acompte reçu",
  "Acompte validé",
];
const presentStatuses = [
  "Vendu",
  "Client converti",
  "Client",
  "Acompte reçu",
  "Acompte validé",
];
const lostStatuses = [...inactiveLeadStatuses, "Perdu"];

export default function KPIDashboard({ leads }: KPIDashboardProps) {
  const [period, setPeriod] = useState<KPIPeriod>("month");
  const [customStartDate, setCustomStartDate] = useState(getMonthStartIso());
  const [customEndDate, setCustomEndDate] = useState(todayIso());
  const periodLeads = useMemo(
    () =>
      leads.filter((lead) =>
        isLeadInPeriod(lead, period, customStartDate, customEndDate)
      ),
    [leads, period, customStartDate, customEndDate]
  );

  const totalProspects = periodLeads.length;
  const rdvCount = countByStatus(periodLeads, rdvStatuses);
  const devisCount = countByStatus(periodLeads, ["Devis"]);
  const soldCount = countByStatus(periodLeads, soldStatuses);
  const presentCount = countByStatus(periodLeads, presentStatuses);
  const depositCount = countByStatus(periodLeads, [
    "Acompte reçu",
    "Acompte validé",
  ]);
  const waitingDepositCount = countByStatus(periodLeads, ["Acompte en attente"]);
  const lostCount = countByStatus(periodLeads, lostStatuses);
  const remainingCount = periodLeads.filter((lead) =>
    ["Nouveau", "À relancer", "À rappeler", "Acompte envoyé", "Acompte en attente"].includes(
      lead.status
    )
  ).length;
  const revenue = periodLeads
    .filter((lead) => soldStatuses.includes(lead.status))
    .reduce((total, lead) => total + lead.dealAmount, 0);

  const conversionRate = ratio(soldCount, totalProspects);
  const rdvRate = ratio(rdvCount, totalProspects);
  const attendanceRate = ratio(presentCount, presentCount + lostCountByNoShow(periodLeads));
  const depositRate = ratio(depositCount, Math.max(soldCount + rdvCount, 1));
  const redRate = ratio(lostCount, totalProspects);
  const remainingRate = ratio(remainingCount, totalProspects);

  const campaignRows = getCampaignRows(periodLeads);
  const sourceRows = getSourceRows(periodLeads);

  const cards = [
    {
      title: "NB prospects",
      value: totalProspects,
      subtitle: "Total CRM leads",
      icon: Users,
      color: "text-violet-600",
    },
    {
      title: "NB RDV pris",
      value: rdvCount,
      subtitle: "RDV programmés",
      icon: CalendarDays,
      color: "text-blue-600",
    },
    {
      title: "NB devis",
      value: devisCount,
      subtitle: "Devis en cours",
      icon: FileText,
      color: "text-amber-600",
    },
    {
      title: "NB ventes",
      value: soldCount,
      subtitle: "Vendu + converti",
      icon: ShoppingBag,
      color: "text-emerald-600",
    },
    {
      title: "Acomptes validés",
      value: depositCount,
      subtitle: "Reçu ou validé",
      icon: CheckCircle2,
      color: "text-green-600",
    },
    {
      title: "Acomptes attente",
      value: waitingDepositCount,
      subtitle: "À confirmer",
      icon: Clock3,
      color: "text-yellow-600",
    },
    {
      title: "Perdus",
      value: lostCount,
      subtitle: "Classés en bas",
      icon: XCircle,
      color: "text-red-600",
    },
    {
      title: "Reste à traiter",
      value: remainingCount,
      subtitle: "Actions ouvertes",
      icon: AlertCircle,
      color: "text-cyan-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">CRM - KPI</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Période sélectionnée :{" "}
            {period === "custom"
              ? `${formatShortDate(customStartDate)} - ${formatShortDate(
                  customEndDate
                )}`
              : periodLabels[period]}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as KPIPeriod)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition-colors hover:bg-slate-50 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          >
            {(Object.keys(periodLabels) as KPIPeriod[]).map((key) => (
              <option key={key} value={key}>
                {periodLabels[key]}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            <label className="flex items-center gap-2 text-xs font-black uppercase text-slate-500">
              Du
              <input
                type="date"
                value={customStartDate}
                onChange={(event) => {
                  setCustomStartDate(event.target.value);
                  setPeriod("custom");
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-black uppercase text-slate-500">
              Au
              <input
                type="date"
                value={customEndDate}
                onChange={(event) => {
                  setCustomEndDate(event.target.value);
                  setPeriod("custom");
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-violet-500"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-8">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <Card key={card.title} className="border-slate-200 py-0 shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase text-slate-500">
                    {card.title}
                  </p>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <Icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </div>
                <p className={`text-3xl font-black ${card.color}`}>
                  {card.value}
                </p>
                <p className="mt-2 text-xs font-medium text-slate-400">
                  {card.subtitle}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Card className="border-slate-200 py-0 shadow-sm xl:col-span-6">
          <CardContent className="p-5">
            <h3 className="mb-5 text-sm font-black uppercase text-slate-700">
              Taux & performances
            </h3>
            <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
              <Rate label="Taux de transformation" value={conversionRate} color="text-emerald-600" />
              <Rate label="Taux de présentiel" value={attendanceRate} color="text-cyan-600" />
              <Rate label="Taux de prise RDV" value={rdvRate} color="text-blue-600" />
              <Rate label="% prise d'acompte" value={depositRate} color="text-green-600" />
              <Rate label="% classés en bas" value={redRate} color="text-red-600" />
              <Rate label="% reste à traiter" value={remainingRate} color="text-violet-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 py-0 shadow-sm xl:col-span-3">
          <CardContent className="p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="text-sm font-black uppercase text-slate-700">
                Chiffre d&apos;affaires
              </h3>
              <Euro className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="text-4xl font-black text-slate-950">
              {formatCurrency(revenue)}
            </p>
            <p className="mt-3 text-sm font-semibold text-emerald-600">
              Calculé depuis les leads vendus/convertis
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 py-0 shadow-sm xl:col-span-3">
          <CardContent className="p-5">
            <h3 className="mb-5 text-sm font-black uppercase text-slate-700">
              Répartition par campagne
            </h3>
            <div className="space-y-3">
              {campaignRows.map((row) => (
                <div key={row.name}>
                  <div className="mb-1 flex items-start justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-700">
                      {row.name}
                    </span>
                    <span className="text-right text-slate-500">
                      <span className="block font-bold text-slate-700">
                        {row.count} leads
                      </span>
                      <span>
                        {row.percent}% · {formatCurrency(row.revenue)}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Card className="border-slate-200 py-0 shadow-sm xl:col-span-5">
          <CardContent className="p-5">
            <h3 className="mb-4 text-sm font-black uppercase text-slate-700">
              Performances par source de lead
            </h3>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Prospects</th>
                    <th className="px-4 py-3">Ventes</th>
                    <th className="px-4 py-3">Taux</th>
                    <th className="px-4 py-3">CA généré</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sourceRows.map((row) => (
                    <tr key={row.source}>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {row.source}
                      </td>
                      <td className="px-4 py-3">{row.total}</td>
                      <td className="px-4 py-3">{row.sold}</td>
                      <td className="px-4 py-3">{row.rate}%</td>
                      <td className="px-4 py-3 font-semibold">
                        {formatCurrency(row.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 py-0 shadow-sm xl:col-span-7">
          <CardContent className="p-5">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase text-slate-700">
                Évolution des KPI dans le temps
              </h3>
              <TrendingUp className="h-5 w-5 text-violet-600" />
            </div>
            <div className="flex h-72 items-end gap-4 rounded-xl bg-slate-50 p-5">
              {["S1", "S2", "S3", "S4", "S5"].map((week, index) => {
                const prospectHeight = 30 + index * 8;
                const revenueHeight = Math.min(90, 22 + index * 14 + soldCount * 5);

                return (
                  <div key={week} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-48 items-end gap-1">
                      <div
                        className="w-4 rounded-t bg-violet-500"
                        style={{ height: `${prospectHeight}%` }}
                      />
                      <div
                        className="w-4 rounded-t bg-blue-500"
                        style={{ height: `${20 + rdvCount * 8}%` }}
                      />
                      <div
                        className="w-4 rounded-t bg-emerald-500"
                        style={{ height: `${revenueHeight}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {week}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex gap-5 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-2">
                <i className="h-2 w-2 rounded-full bg-violet-500" />
                Prospects
              </span>
              <span className="flex items-center gap-2">
                <i className="h-2 w-2 rounded-full bg-blue-500" />
                RDV pris
              </span>
              <span className="flex items-center gap-2">
                <i className="h-2 w-2 rounded-full bg-emerald-500" />
                CA généré
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Rate({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="p-4">
      <p className="text-xs font-black uppercase text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${color}`}>
        {value.toLocaleString("fr-FR", {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        })}
        %
      </p>
    </div>
  );
}

function countByStatus(leads: Lead[], statuses: string[]) {
  return leads.filter((lead) => statuses.includes(lead.status)).length;
}

function lostCountByNoShow(leads: Lead[]) {
  return leads.filter((lead) => lead.status === "No show").length;
}

function ratio(value: number, total: number) {
  if (total === 0) {
    return 0;
  }

  return (value / total) * 100;
}

function formatCurrency(value: number) {
  return value.toLocaleString("fr-FR", {
    currency: "EUR",
    style: "currency",
  });
}

function getCampaignRows(leads: Lead[]) {
  const counts = new Map<string, number>();

  leads.forEach((lead) => {
    const campaign = lead.campaign || "Sans campagne";
    counts.set(campaign, (counts.get(campaign) ?? 0) + 1);
  });

  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / Math.max(leads.length, 1)) * 100),
      revenue: leads
        .filter((lead) => lead.campaign === name && soldStatuses.includes(lead.status))
        .reduce((total, lead) => total + lead.dealAmount, 0),
    }))
    .sort((current, next) => next.count - current.count)
    .slice(0, 5);
}

function getSourceRows(leads: Lead[]) {
  const sources = [...new Set(leads.map((lead) => lead.source))];

  return sources.map((source) => {
    const sourceLeads = leads.filter((lead) => lead.source === source);
    const soldLeads = sourceLeads.filter((lead) =>
      soldStatuses.includes(lead.status)
    );
    const revenue = soldLeads.reduce(
      (total, lead) => total + lead.dealAmount,
      0
    );

    return {
      source,
      total: sourceLeads.length,
      sold: soldLeads.length,
      rate: Math.round(ratio(soldLeads.length, sourceLeads.length)),
      revenue,
    };
  });
}

function isLeadInPeriod(
  lead: Lead,
  period: KPIPeriod,
  customStartDate: string,
  customEndDate: string
) {
  if (period === "all") {
    return true;
  }

  const createdDate = parseDate(lead.createdDate);

  if (!createdDate) {
    return false;
  }

  const now = new Date();
  const today = startOfDay(now);

  if (period === "custom") {
    const startDate = parseDate(customStartDate);
    const endDate = parseDate(customEndDate);

    if (!startDate || !endDate) {
      return false;
    }

    const start = startOfDay(startDate);
    const end = startOfDay(endDate);
    const rangeStart = start <= end ? start : end;
    const rangeEnd = start <= end ? end : start;

    return createdDate >= rangeStart && createdDate <= rangeEnd;
  }

  if (period === "last15") {
    const start = addDays(today, -14);
    return createdDate >= start && createdDate <= today;
  }

  if (period === "last30") {
    const start = addDays(today, -29);
    return createdDate >= start && createdDate <= today;
  }

  if (period === "month") {
    return (
      createdDate.getFullYear() === today.getFullYear() &&
      createdDate.getMonth() === today.getMonth()
    );
  }

  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  return (
    createdDate.getFullYear() === previousMonth.getFullYear() &&
    createdDate.getMonth() === previousMonth.getMonth()
  );
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function todayIso() {
  return toDateInputValue(new Date());
}

function getMonthStartIso() {
  const today = new Date();
  return toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatShortDate(value: string) {
  const date = parseDate(value);

  if (!date) {
    return "--/--/----";
  }

  return date.toLocaleDateString("fr-FR");
}
