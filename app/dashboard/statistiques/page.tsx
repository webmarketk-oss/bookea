"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Euro,
  Flame,
  MousePointerClick,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";

import { loadCrmAppointments } from "@/lib/agenda-supabase";
import { todayIso } from "@/lib/crm-stats";
import { loadCrmLeads } from "@/lib/crm-supabase";
import { findDuplicateLeadGroups } from "@/lib/public-bookings";
import { Lead } from "@/types/lead";
import type { Appointment } from "@/types/agenda";

const bookedStatuses = ["RDV programmé", "RDV pris", "RDV fixé", "RDV confirmé"];
const soldStatuses = ["Vendu", "Client", "Client converti"];
const redStatuses = ["Perdu", "Prospect perdu", "Numéro invalide", "Doublon", "Hors zone", "No show"];

export default function StatisticsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [leadData, appointmentData] = await Promise.all([
          loadCrmLeads(),
          loadCrmAppointments(),
        ]);

        if (cancelled) {
          return;
        }

        setLeads(leadData.leads);
        setAppointments(appointmentData);
      } catch {
        if (!cancelled) {
          setLeads([]);
          setAppointments([]);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = todayIso();
  const todayAppointments = appointments.filter(
    (appointment) =>
      appointment.date === today &&
      (!appointment.kind || appointment.kind === "Rendez-vous") &&
      appointment.status !== "Annulation",
  );
  const leadCount = leads.length;
  const rdvLeads = leads.filter((lead) => bookedStatuses.includes(lead.status)).length;
  const soldLeads = leads.filter((lead) => soldStatuses.includes(lead.status)).length;
  const redLeads = leads.filter((lead) => redStatuses.includes(lead.status)).length;
  const revenue = leads.reduce((total, lead) => total + lead.dealAmount, 0);
  const totalAppointmentMinutes = todayAppointments.reduce(
    (total, appointment) => total + appointment.duration,
    0,
  );
  const cabinCount = Math.max(
    new Set(
      appointments
        .map((appointment) => appointment.cabinId)
        .filter(Boolean),
    ).size,
    1,
  );
  const capacityMinutes = cabinCount * 11 * 60;
  const fillRate = Math.round((totalAppointmentMinutes / capacityMinutes) * 100);
  const attendanceRate = ratio(
    appointments.filter(
      (appointment) =>
        appointment.status === "Confirmé" ||
        appointment.status === "Présent" ||
        appointment.status === "Terminé",
    ).length,
    appointments.filter(
      (appointment) => !appointment.kind || appointment.kind === "Rendez-vous",
    ).length,
  );
  const conversionRate = ratio(soldLeads, leadCount);
  const noShowRate = ratio(redLeads, leadCount);
  const sourceRows = groupByLeadField(leads, "source");
  const campaignRows = groupByLeadField(leads, "campaign");
  const organicAppointments = appointments.filter(
    (appointment) => appointment.source === "Organique" || appointment.source === "Seya",
  );
  const organicBookings = organicAppointments.length;
  const organicShare = ratio(organicBookings, appointments.length);
  const servicePerformance = useMemo(
    () => buildServicePerformance(appointments, leads),
    [appointments, leads],
  );
  const requestedSlots = useMemo(
    () => buildRequestedSlots(appointments),
    [appointments],
  );
  const duplicateCount = findDuplicateLeadGroups(leads).length;
  const reminderCount = leads.filter((lead) => lead.reminderDate === today).length;
  const unconfirmedCount = todayAppointments.filter(
    (appointment) => appointment.status === "À confirmer",
  ).length;
  const seyaActivity = [
    {
      label: "Relances du jour",
      value: reminderCount,
      detail: "Prospects à rappeler aujourd'hui",
      color: "text-violet-600",
    },
    {
      label: "RDV à confirmer",
      value: unconfirmedCount,
      detail: "Planning du jour",
      color: "text-emerald-600",
    },
    {
      label: "Remplissage jour",
      value: `${Math.max(0, fillRate)}%`,
      detail: "Cabines du centre",
      color: "text-blue-600",
    },
    {
      label: "Doublons détectés",
      value: duplicateCount,
      detail: "Groupes de fiches proches",
      color: "text-orange-600",
    },
    {
      label: "RDV organiques",
      value: organicBookings,
      detail: "Seya ou réservation publique",
      color: "text-cyan-600",
    },
    {
      label: "CA leads",
      value: formatCurrency(revenue),
      detail: "Montants enregistrés CRM",
      color: "text-emerald-700",
    },
  ];
  const organicRevenue = organicAppointments.reduce((total, appointment) => {
    const service = servicePerformance.find((item) =>
      appointment.treatment.toLowerCase().includes(item.name.toLowerCase().split(" ")[0]),
    );
    return total + Math.round((service?.revenue ?? 0) / Math.max(service?.reservations ?? 1, 1));
  }, 0);
  const emptyService = {
    name: "Aucune prestation",
    reservations: 0,
    honored: 0,
    missed: 0,
    revenue: 0,
    trend: "0%",
  };
  const organicTop = servicePerformance[0];
  const organicRows = [
    {
      label: "Réservations organiques",
      value: `${organicBookings}`,
      sub: "RDV pris directement depuis Bookea, sans campagne",
      percent: organicShare,
      progressLabel: `${organicShare}% du planning`,
    },
    {
      label: "Prestation organique #1",
      value: organicTop?.name || "Aucune",
      sub: "Soin le plus réservé sans relance commerciale",
      percent: organicTop
        ? ratio(organicTop.reservations, Math.max(appointments.length, 1))
        : 0,
      progressLabel: organicTop
        ? `${organicTop.reservations} réservation${organicTop.reservations > 1 ? "s" : ""}`
        : "pas encore de data",
    },
    {
      label: "CA organique estimé",
      value: formatCurrency(organicRevenue),
      sub: "Hors campagnes, hors relances CRM",
      percent: ratio(organicRevenue, Math.max(revenue, 1)),
      progressLabel: "à suivre",
    },
  ];
  const topService = servicePerformance.reduce(
    (best, item) => (item.reservations > best.reservations ? item : best),
    emptyService,
  );
  const weakestService = servicePerformance.reduce((worst, item) => {
    const worstRate = worst.reservations ? worst.missed / worst.reservations : 0;
    const itemRate = item.reservations ? item.missed / item.reservations : 0;
    return itemRate > worstRate ? item : worst;
  }, emptyService);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <div className="mx-auto max-w-[1800px] space-y-6 p-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-black text-violet-600">
              Bookea Statistiques
            </p>
            <h1 className="mt-1 text-5xl font-black tracking-tight">
              Statistiques
            </h1>
            <p className="mt-3 max-w-4xl text-xl font-medium text-slate-500">
              Activité Bookea, performance des prestations, comportement des
              clientes, remplissage planning et recommandations Seya.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <select className="h-12 rounded-2xl border border-slate-200 bg-white px-4 font-black text-slate-700 shadow-sm outline-none">
              <option>Ce mois-ci</option>
              <option>15 derniers jours</option>
              <option>30 derniers jours</option>
              <option>Mois dernier</option>
            </select>
            <button className="inline-flex h-12 items-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
              Analyse Seya
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-9">
          <MetricCard title="Leads CRM" value={leadCount} detail="Prospects ajoutés ou reçus" icon={<Users />} color="text-blue-600" />
          <MetricCard title="RDV via leads" value={rdvLeads} detail="Leads passés en RDV" icon={<CalendarClock />} color="text-violet-600" />
          <MetricCard title="Organique Bookea" value={organicBookings} detail="Réservations directes" icon={<MousePointerClick />} color="text-cyan-600" />
          <MetricCard
            title="Conversion leads"
            value={`${conversionRate}%`}
            detail="Leads devenus clients"
            icon={<TrendingUp />}
            tone={rateTone(conversionRate)}
          />
          <MetricCard
            title="Présentiel"
            value={`${attendanceRate}%`}
            detail="RDV honorés"
            icon={<CheckCircle2 />}
            tone={rateTone(attendanceRate)}
          />
          <MetricCard
            title="No-show / rouge"
            value={`${noShowRate}%`}
            detail="À réduire"
            icon={<XCircle />}
            tone={rateTone(noShowRate, true)}
          />
          <MetricCard title="CA leads" value={formatCurrency(revenue)} detail="Depuis CRM + factures" icon={<Euro />} color="text-emerald-600" />
          <MetricCard
            title="Remplissage"
            value={`${fillRate}%`}
            detail="Planning jour"
            icon={<BarChart3 />}
            tone={rateTone(fillRate)}
          />
          <MetricCard title="Activité Seya" value={reminderCount + unconfirmedCount + duplicateCount} detail="Relances, confirmations, doublons" icon={<Sparkles />} color="text-violet-600" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel
            title="Prestations"
            subtitle="Réservation, présence, CA et perte d'opportunité par soin."
            icon={<Flame className="h-6 w-6 text-orange-500" />}
          >
            <div className="grid gap-3">
              {servicePerformance.length === 0 ? (
                <p className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                  Aucune prestation enregistrée sur ce centre.
                </p>
              ) : null}
              {servicePerformance.map((service) => {
                const honoredRate = ratio(service.honored, service.reservations);
                const missedRate = ratio(service.missed, service.reservations);

                return (
                  <div key={service.name} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-xl font-black">{service.name}</h3>
                        <p className="mt-1 text-sm font-bold text-slate-500">
                          {service.reservations} réservations · {formatCurrency(service.revenue)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={service.trend.startsWith("+") ? "green" : "red"}>
                          {service.trend}
                        </Badge>
                        <Badge tone={rateTone(honoredRate)}>
                          {honoredRate}% honoré
                        </Badge>
                        <Badge tone={rateTone(missedRate, true)}>
                          {missedRate}% non honoré
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-[1fr_100px] md:items-center">
                      <Progress value={honoredRate} color={toneBarClass[rateTone(honoredRate)]} />
                      <p className="text-right text-sm font-black text-slate-600">
                        {service.honored}/{service.reservations}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="À surveiller"
            subtitle="Ce que Seya doit remonter en priorité."
            icon={<AlertTriangle className="h-6 w-6 text-amber-500" />}
          >
            <div className="grid gap-3">
              <InsightCard
                title="Prestation la plus réservée"
                value={topService.name}
                detail={`${topService.reservations} réservations, ${formatCurrency(topService.revenue)} de CA potentiel`}
                tone="blue"
              />
              <InsightCard
                title="Prestation la moins honorée"
                value={weakestService.name}
                detail={`${weakestService.missed} absences ou pertes à relancer`}
                tone="red"
              />
              <InsightCard
                title="Créneau le plus demandé"
                value={requestedSlots[0]?.slot || "Aucun créneau"}
                detail={
                  requestedSlots[0]
                    ? `${requestedSlots[0].bookings} réservations · ${requestedSlots[0].missed} absences`
                    : "Pas encore assez de rendez-vous pour lire la demande."
                }
                tone="violet"
              />
              <InsightCard
                title="Action recommandée"
                value={
                  weakestService.missed > 0
                    ? `Sécuriser ${weakestService.name}`
                    : "Continuer le suivi"
                }
                detail={
                  weakestService.missed > 0
                    ? `${weakestService.missed} rendez-vous non honorés à relancer.`
                    : "Aucun no-show enregistré pour le moment."
                }
                tone="orange"
              />
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-4">
          <Panel
            title="Créneaux les plus demandés"
            subtitle="Aide à adapter les horaires, cabines et praticiennes."
            icon={<Clock3 className="h-6 w-6 text-blue-600" />}
          >
            <RankList
              rows={requestedSlots.map((slot) => ({
                label: slot.slot,
                value: `${slot.demand}%`,
                sub: `${slot.bookings} réservations · ${slot.missed} absences`,
                percent: slot.demand,
              }))}
            />
          </Panel>

          <Panel
            title="Organique Bookea"
            subtitle="Réservations naturelles depuis la page publique, sans campagne."
            icon={<Sparkles className="h-6 w-6 text-cyan-600" />}
          >
            <RankList rows={organicRows} />
          </Panel>

          <Panel
            title="Sources leads CRM"
            subtitle="D'où viennent les leads enregistrés dans le CRM."
            icon={<MousePointerClick className="h-6 w-6 text-emerald-600" />}
          >
            <RankList
              rows={sourceRows.map((row) => ({
                label: row.label,
                value: `${row.count} lead${row.count > 1 ? "s" : ""}`,
                sub: `${formatCurrency(row.revenue)} CA · ${row.sold} converti${row.sold > 1 ? "s" : ""} · ${row.conversion}% conversion`,
                percent: row.percent,
                progressLabel: `${row.percent}% des leads`,
                valueTone: rateTone(row.conversion),
              }))}
            />
          </Panel>

          <Panel
            title="Campagnes leads"
            subtitle="Comparer les campagnes rattachées aux leads CRM."
            icon={<Star className="h-6 w-6 text-amber-500" />}
          >
            <RankList
              rows={campaignRows.map((row) => ({
                label: row.label,
                value: `${row.count} lead${row.count > 1 ? "s" : ""}`,
                sub: `${formatCurrency(row.revenue)} CA · ${row.sold} converti${row.sold > 1 ? "s" : ""} · ${row.conversion}% conversion`,
                percent: row.percent,
                progressLabel: `${row.percent}% des leads`,
                tone: rateTone(row.conversion),
              }))}
            />
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel
            title="Activité Seya"
            subtitle="Impact de l'IA sur les relances, le planning, les doublons et le chiffre."
            icon={<Sparkles className="h-6 w-6 text-violet-600" />}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {seyaActivity.map((item) => (
                <div key={item.label} className="rounded-3xl border border-violet-100 bg-violet-50/60 p-4">
                  <p className="text-sm font-black text-slate-600">{item.label}</p>
                  <p className={`mt-3 text-4xl font-black ${item.color}`}>{item.value}</p>
                  <p className="mt-2 text-sm font-bold text-slate-500">{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-3xl border border-violet-100 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-wide text-violet-600">
                Lecture rapide
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-600">
                Cette zone mesure uniquement ce que Seya prépare, détecte ou
                aide à déclencher. Elle reste séparée des statistiques de
                réservations, des campagnes et de l'organique.
              </p>
            </div>
          </Panel>

          <Panel
            title="Diagnostic activité"
            subtitle="Lecture rapide pour piloter le centre."
            icon={<TrendingDown className="h-6 w-6 text-rose-500" />}
          >
            <div className="grid gap-3">
              {(
                [
                  fillRate < 50
                    ? `Le planning du jour n'est rempli qu'à ${Math.max(0, fillRate)}% : relancer les nouveaux leads.`
                    : `Le planning du jour est rempli à ${fillRate}%.`,
                  topService.reservations > 0
                    ? `Mettre en avant ${topService.name} : ${topService.reservations} réservations.`
                    : "Aucune prestation réservée pour l'instant.",
                  weakestService.missed > 0
                    ? `Sécuriser ${weakestService.name} avec un acompte : ${weakestService.missed} absences.`
                    : "Pas de no-show à surveiller pour le moment.",
                  reminderCount > 0
                    ? `${reminderCount} relance${reminderCount > 1 ? "s" : ""} prévue${reminderCount > 1 ? "s" : ""} aujourd'hui.`
                    : "Aucune relance planifiée aujourd'hui.",
                  duplicateCount > 0
                    ? `${duplicateCount} groupe${duplicateCount > 1 ? "s" : ""} de doublons à fusionner avant un envoi SMS.`
                    : "Aucun doublon détecté.",
                ] as string[]
              ).map((text, index) => (
                <div key={text} className="flex gap-3 rounded-3xl border border-slate-200 bg-white p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-slate-950 text-sm font-black text-white">
                    {index + 1}
                  </span>
                  <p className="font-bold leading-7 text-slate-700">{text}</p>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  color,
  tone,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  color?: string;
  tone?: RateTone;
}) {
  const textColor = tone ? toneTextClass[tone] : color;
  const cardClass = tone ? toneCardClass[tone] : "border-slate-200 bg-white";
  const iconWrapClass = tone ? toneIconWrapClass[tone] : "bg-slate-50";

  return (
    <div className={`rounded-[26px] border p-5 shadow-sm ${cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-black text-slate-500">{title}</p>
        <div className={`grid h-11 w-11 place-items-center rounded-2xl ${iconWrapClass} ${textColor}`}>
          {icon}
        </div>
      </div>
      <p className={`mt-5 text-4xl font-black ${textColor}`}>{value}</p>
      <p className="mt-2 text-sm font-bold text-slate-500">{detail}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-50">
          {icon}
        </div>
        <div>
          <h2 className="text-2xl font-black">{title}</h2>
          <p className="mt-1 font-semibold text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function InsightCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: "blue" | "red" | "violet" | "orange";
}) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    red: "border-red-100 bg-red-50 text-red-700",
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    orange: "border-orange-100 bg-orange-50 text-orange-700",
  };

  return (
    <div className={`rounded-3xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-black uppercase opacity-80">{title}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
      <p className="mt-2 text-sm font-bold leading-6 opacity-80">{detail}</p>
    </div>
  );
}

function RankList({
  rows,
}: {
  rows: {
    label: string;
    value: string;
    sub: string;
    percent: number;
    progressLabel?: string;
    tone?: RateTone;
  }[];
}) {
  return (
    <div className="grid gap-4">
      {rows.length === 0 ? (
        <p className="text-sm font-semibold text-slate-500">
          Aucune donnée pour ce centre.
        </p>
      ) : null}
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="font-black text-slate-950">{row.label}</p>
              <p className={`text-sm font-semibold ${row.tone ? toneTextClass[row.tone] : "text-slate-500"}`}>
                {row.sub}
              </p>
            </div>
            <p className="font-black text-slate-700">{row.value}</p>
          </div>
          <Progress
            value={row.percent}
            color="bg-gradient-to-r from-violet-500 to-cyan-400"
          />
          {row.progressLabel ? (
            <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-400">
              {row.progressLabel}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "green" | "red" | "orange" | "blue";
}) {
  const tones = {
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    orange: "bg-orange-100 text-orange-700",
    blue: "bg-blue-100 text-blue-700",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Progress({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.max(4, Math.min(value, 100))}%` }}
      />
    </div>
  );
}

function buildServicePerformance(appointments: Appointment[], leads: Lead[]) {
  const bookable = appointments.filter(
    (appointment) => !appointment.kind || appointment.kind === "Rendez-vous",
  );
  const grouped = new Map<string, Appointment[]>();

  for (const appointment of bookable) {
    const name = appointment.treatment.trim() || "Soin à préciser";
    grouped.set(name, [...(grouped.get(name) ?? []), appointment]);
  }

  return [...grouped.entries()]
    .map(([name, rows]) => {
      const honored = rows.filter((appointment) =>
        ["Confirmé", "Présent", "Terminé", "Vendu"].includes(appointment.status),
      ).length;
      const missed = rows.filter((appointment) =>
        ["No show", "Annulation", "Pas venu pas prévenu"].includes(
          appointment.status,
        ),
      ).length;
      const revenue = leads
        .filter((lead) => lead.treatment === name)
        .reduce((total, lead) => total + (Number(lead.dealAmount) || 0), 0);

      return {
        name,
        reservations: rows.length,
        honored,
        missed,
        revenue,
        trend: missed > honored ? `-${missed}` : `+${honored}`,
      };
    })
    .sort((left, right) => right.reservations - left.reservations);
}

function buildRequestedSlots(appointments: Appointment[]) {
  const bookable = appointments.filter(
    (appointment) =>
      (!appointment.kind || appointment.kind === "Rendez-vous") &&
      appointment.status !== "Annulation",
  );
  const grouped = new Map<
    string,
    { bookings: number; missed: number }
  >();

  for (const appointment of bookable) {
    const hour = Number(appointment.start.slice(0, 2));
    const weekday = new Date(`${appointment.date}T12:00:00`).toLocaleDateString(
      "fr-FR",
      { weekday: "long" },
    );
    const slotHour = `${String(hour).padStart(2, "0")}h-${String(hour + 2).padStart(2, "0")}h`;
    const label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${slotHour}`;
    const current = grouped.get(label) ?? { bookings: 0, missed: 0 };
    current.bookings += 1;
    if (
      appointment.status === "No show" ||
      appointment.status === "Pas venu pas prévenu"
    ) {
      current.missed += 1;
    }
    grouped.set(label, current);
  }

  const maxBookings = Math.max(
    1,
    ...[...grouped.values()].map((item) => item.bookings),
  );

  return [...grouped.entries()]
    .map(([slot, item]) => ({
      slot,
      demand: Math.round((item.bookings / maxBookings) * 100),
      bookings: item.bookings,
      missed: item.missed,
    }))
    .sort((left, right) => right.bookings - left.bookings)
    .slice(0, 4);
}

function groupByLeadField(leadsList: Lead[], field: "source" | "campaign") {
  const total = Math.max(leadsList.length, 1);
  const grouped = leadsList.reduce<Record<string, Lead[]>>((acc, lead) => {
    const key = String(lead[field]);
    acc[key] = [...(acc[key] ?? []), lead];
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([label, rows]) => {
      const sold = rows.filter((lead) => soldStatuses.includes(lead.status)).length;
      const revenue = rows.reduce((sum, lead) => sum + lead.dealAmount, 0);

      return {
        label,
        count: rows.length,
        percent: Math.round((rows.length / total) * 100),
        conversion: ratio(sold, rows.length),
        revenue,
        sold,
      };
    })
    .sort((a, b) => b.count - a.count);
}

function ratio(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

type RateTone = "green" | "orange" | "red";

function rateTone(percent: number, inverted = false): RateTone {
  if (inverted) {
    if (percent > 50) return "red";
    if (percent >= 35) return "orange";
    return "green";
  }

  if (percent > 50) return "green";
  if (percent >= 35) return "orange";
  return "red";
}

const toneTextClass: Record<RateTone, string> = {
  green: "text-emerald-600",
  orange: "text-orange-500",
  red: "text-red-600",
};

const toneBarClass: Record<RateTone, string> = {
  green: "bg-emerald-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
};

const toneCardClass: Record<RateTone, string> = {
  green: "border-emerald-200 bg-emerald-50",
  orange: "border-orange-200 bg-orange-50",
  red: "border-red-200 bg-red-50",
};

const toneIconWrapClass: Record<RateTone, string> = {
  green: "bg-emerald-100",
  orange: "bg-orange-100",
  red: "bg-red-100",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
