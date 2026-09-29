"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getLeadRdvTakenDates, isRdvBookedStatus } from "@/lib/crm-stats";
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
  "Acompte envoyé",
  "Acompte reçu",
  "Acompte validé",
  "Acompte en attente",
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
  const rdvCount = periodLeads.filter(leadHasTakenRdv).length;
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
  const outOfZoneCount = countByStatus(periodLeads, ["Hors zone"]);
  const outOfZoneRate = ratio(outOfZoneCount, totalProspects);

  const campaignRows = getCampaignRows(periodLeads);
  const campaignStats = getCampaignDiagramRows(periodLeads);
  const sourceRows = getSourceRows(periodLeads);
  const campaignChartMax = Math.max(
    1,
    ...campaignStats.map((row) => Math.max(row.leads, row.rdv)),
  );
  const campaignLeadTotal = campaignStats.reduce(
    (total, row) => total + row.leads,
    0,
  );
  const campaignRdvTotal = campaignStats.reduce(
    (total, row) => total + row.rdv,
    0,
  );

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
      subtitle: "RDV et acomptes posés",
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
      subtitle: "Leads rouge",
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
              <Rate label="% leads rouge" value={redRate} color="text-red-600" />
              <Rate label="Taux hors zone" value={outOfZoneRate} color="text-rose-600" />
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

        <Card className="border-slate-200 py-0 shadow-sm xl:col-span-12">
          <CardContent className="p-5">
            <YearlyKpiCurves leads={leads} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 py-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-sm font-black uppercase text-slate-700">
                Stats par campagne
              </h3>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Nombre de leads et de RDV pris pour chaque campagne
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase text-slate-500">
                  NB total leads
                </p>
                <p className="mt-1 text-2xl font-black text-violet-600">
                  {campaignLeadTotal}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase text-slate-500">
                  NB total RDV pris
                </p>
                <p className="mt-1 text-2xl font-black text-blue-600">
                  {campaignRdvTotal}
                </p>
              </div>
            </div>
          </div>

          {campaignStats.length === 0 ? (
            <p className="mt-6 text-sm font-medium text-slate-500">
              Aucune campagne sur cette période.
            </p>
          ) : (
            <CampaignBarChart
              rows={campaignStats}
              maxValue={campaignChartMax}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function YearlyKpiCurves({ leads }: { leads: Lead[] }) {
  const series = useMemo(() => getYearlyMonthlySeries(leads), [leads]);
  const [hiddenYears, setHiddenYears] = useState<number[]>([]);
  const visibleSeries = series.filter((row) => !hiddenYears.includes(row.year));
  const chartMax = niceChartMax(
    Math.max(1, ...visibleSeries.flatMap((row) => [...row.leads, ...row.rdv])),
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) =>
    Math.round(chartMax * step),
  );

  function toggleYear(year: number) {
    setHiddenYears((current) =>
      current.includes(year)
        ? current.filter((item) => item !== year)
        : [...current, year],
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black uppercase text-slate-700">
              Évolution annuelle
            </h3>
            <TrendingUp className="h-5 w-5 text-violet-600" />
          </div>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Leads et RDV pris par mois, une courbe par année
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {series.map((row, index) => {
            const hidden = hiddenYears.includes(row.year);
            const colors = yearCurveColors(index);
            return (
              <button
                key={row.year}
                type="button"
                onClick={() => toggleYear(row.year)}
                className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                  hidden
                    ? "border-slate-200 bg-white text-slate-400"
                    : "border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                <span className="mr-2 inline-flex items-center gap-1">
                  <i
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: colors.leads }}
                  />
                  <i
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: colors.rdv }}
                  />
                </span>
                {row.year}
              </button>
            );
          })}
        </div>
      </div>

      {visibleSeries.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-5 text-sm font-medium text-slate-500">
          Aucune année sélectionnée.
        </p>
      ) : (
        <>
          <YearlyLineChart
            series={visibleSeries}
            allYears={series.map((row) => row.year)}
            max={chartMax}
            ticks={ticks}
          />
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-slate-500">
            {visibleSeries.map((row) => {
              const colors = yearCurveColors(
                series.findIndex((item) => item.year === row.year),
              );
              return (
                <span key={row.year} className="flex items-center gap-3">
                  <span className="font-black text-slate-700">{row.year}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <i
                      className="inline-block h-2 w-4 rounded-full"
                      style={{ background: colors.leads }}
                    />
                    Leads
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i
                      className="inline-block h-1.5 w-4 rounded-full"
                      style={{ background: colors.rdv }}
                    />
                    RDV pris
                  </span>
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const MONTH_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

const YEAR_CURVE_PALETTE = [
  { leads: "#7c3aed", rdv: "#2563eb" },
  { leads: "#c026d3", rdv: "#0f766e" },
  { leads: "#ea580c", rdv: "#4f46e5" },
  { leads: "#e11d48", rdv: "#0284c7" },
];

function yearCurveColors(index: number) {
  return YEAR_CURVE_PALETTE[Math.max(0, index) % YEAR_CURVE_PALETTE.length];
}

function YearlyLineChart({
  series,
  allYears,
  max,
  ticks,
}: {
  series: Array<{ year: number; leads: number[]; rdv: number[] }>;
  allYears: number[];
  max: number;
  ticks: number[];
}) {
  const width = 720;
  const height = 280;
  const pad = { left: 42, right: 12, top: 18, bottom: 34 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;

  function point(index: number, value: number) {
    return {
      x: pad.left + (index * innerWidth) / 11,
      y: pad.top + innerHeight - (value / max) * innerHeight,
    };
  }

  function pathFor(values: number[]) {
    return values
      .map((value, index) => {
        const { x, y } = point(index, value);
        return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-72 w-full min-w-[640px]"
        role="img"
        aria-label="Courbes mensuelles des leads et des RDV pris par année"
      >
        {ticks.map((tick) => {
          const y = pad.top + innerHeight - (tick / max) * innerHeight;
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[11px] font-semibold"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {MONTH_LABELS.map((label, index) => {
          const x = pad.left + (index * innerWidth) / 11;
          return (
            <text
              key={label}
              x={x}
              y={height - 10}
              textAnchor="middle"
              className="fill-slate-500 text-[11px] font-semibold"
            >
              {label}
            </text>
          );
        })}

        {series.map((row) => {
          const palette = yearCurveColors(allYears.indexOf(row.year));
          return (
            <g key={row.year}>
              <path
                d={pathFor(row.leads)}
                fill="none"
                stroke={palette.leads}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={pathFor(row.rdv)}
                fill="none"
                stroke={palette.rdv}
                strokeWidth="2.5"
                strokeDasharray="6 4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {row.leads.map((value, index) => {
                const { x, y } = point(index, value);
                return (
                  <circle
                    key={`${row.year}-leads-${index}`}
                    cx={x}
                    cy={y}
                    r="3.5"
                    fill={palette.leads}
                  >
                    <title>
                      {row.year} · {MONTH_LABELS[index]} · {value} lead
                      {value > 1 ? "s" : ""}
                    </title>
                  </circle>
                );
              })}
              {row.rdv.map((value, index) => {
                const { x, y } = point(index, value);
                return (
                  <circle
                    key={`${row.year}-rdv-${index}`}
                    cx={x}
                    cy={y}
                    r="3.5"
                    fill="#fff"
                    stroke={palette.rdv}
                    strokeWidth="2"
                  >
                    <title>
                      {row.year} · {MONTH_LABELS[index]} · {value} RDV
                    </title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getYearlyMonthlySeries(leads: Lead[]) {
  const byYear = new Map<number, { leads: number[]; rdv: number[] }>();

  function emptyMonths() {
    return Array.from({ length: 12 }, () => 0);
  }

  function ensure(year: number) {
    const current = byYear.get(year);
    if (current) {
      return current;
    }
    const next = { leads: emptyMonths(), rdv: emptyMonths() };
    byYear.set(year, next);
    return next;
  }

  ensure(new Date().getFullYear());

  for (const lead of leads) {
    const created = parseDate(lead.createdDate);
    if (created) {
      ensure(created.getFullYear()).leads[created.getMonth()] += 1;
    }

    const rdvMonths = new Set<string>();
    const takenDates = getLeadRdvTakenDates(lead);

    if (takenDates.length > 0) {
      for (const iso of takenDates) {
        const [year, month] = iso.split("-").map(Number);
        if (year && month >= 1 && month <= 12) {
          rdvMonths.add(`${year}-${month - 1}`);
        }
      }
    } else if (leadHasTakenRdv(lead) && created) {
      rdvMonths.add(`${created.getFullYear()}-${created.getMonth()}`);
    }

    for (const key of rdvMonths) {
      const [year, month] = key.split("-").map(Number);
      ensure(year).rdv[month] += 1;
    }
  }

  return [...byYear.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([year, values]) => ({ year, ...values }));
}

function CampaignBarChart({
  rows,
  maxValue,
}: {
  rows: Array<{ name: string; leads: number; rdv: number }>;
  maxValue: number;
}) {
  const chartMax = niceChartMax(maxValue);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => Math.round(chartMax * step));
  const columnWidth = Math.max(92, Math.min(140, 720 / Math.max(rows.length, 1)));

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap gap-5 text-xs font-semibold text-slate-500">
        <span className="flex items-center gap-2">
          <i className="h-2.5 w-2.5 rounded-sm bg-violet-500" />
          Leads
        </span>
        <span className="flex items-center gap-2">
          <i className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
          RDV pris
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
        <div
          className="grid"
          style={{
            minWidth: `${Math.max(rows.length * columnWidth + 44, 360)}px`,
            gridTemplateColumns: `44px repeat(${rows.length}, minmax(${columnWidth}px, 1fr))`,
          }}
        >
          <div className="relative h-64">
            {ticks.map((tick) => (
              <div
                key={`label-${tick}`}
                className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold text-slate-400"
                style={{ bottom: `${(tick / chartMax) * 100}%` }}
              >
                {tick}
              </div>
            ))}
          </div>

          {rows.map((row) => (
            <div key={row.name} className="relative h-64 px-3">
              {ticks.map((tick) => (
                <div
                  key={`${row.name}-${tick}`}
                  className="absolute inset-x-0 border-t border-dashed border-slate-200"
                  style={{ bottom: `${(tick / chartMax) * 100}%` }}
                />
              ))}
              <div className="relative z-10 flex h-full items-end justify-center gap-2 pb-0">
                <ChartBar
                  value={row.leads}
                  max={chartMax}
                  color="bg-violet-500"
                  label={`${row.leads} leads`}
                />
                <ChartBar
                  value={row.rdv}
                  max={chartMax}
                  color="bg-blue-500"
                  label={`${row.rdv} RDV`}
                />
              </div>
            </div>
          ))}

          <div />
          {rows.map((row) => (
            <div key={`${row.name}-label`} className="px-2 pt-3 text-center">
              <p className="truncate text-xs font-bold text-slate-800" title={row.name}>
                {row.name}
              </p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                {row.leads} leads · {row.rdv} RDV
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChartBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const height = value > 0 ? Math.max((value / max) * 100, 8) : 0;

  return (
    <div className="flex h-full w-8 items-end justify-center">
      <div
        className={`relative w-full rounded-t-md ${color}`}
        style={{ height: `${height}%` }}
        title={label}
      >
        {value > 0 ? (
          <span className="absolute inset-x-0 -top-5 text-center text-[11px] font-black text-slate-700">
            {value}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function niceChartMax(value: number) {
  const safe = Math.max(1, value);

  if (safe <= 4) {
    return 4;
  }

  if (safe <= 8) {
    return 8;
  }

  const magnitude = 10 ** Math.floor(Math.log10(safe));
  return Math.ceil(safe / magnitude) * magnitude;
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

function leadHasTakenRdv(lead: Lead) {
  return (
    isRdvBookedStatus(lead.status) ||
    rdvStatuses.includes(lead.status) ||
    getLeadRdvTakenDates(lead).length > 0
  );
}

function getCampaignDiagramRows(leads: Lead[]) {
  const groups = new Map<string, { leads: number; rdv: number }>();

  leads.forEach((lead) => {
    const name = lead.campaign.trim() || "Sans campagne";
    const current = groups.get(name) ?? { leads: 0, rdv: 0 };
    current.leads += 1;
    if (leadHasTakenRdv(lead)) {
      current.rdv += 1;
    }
    groups.set(name, current);
  });

  return [...groups.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((left, right) => right.leads - left.leads);
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
