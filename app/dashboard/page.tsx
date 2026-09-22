"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  Euro,
  PhoneCall,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { loadCrmAppointments } from "@/lib/agenda-supabase";
import {
  addDaysIso,
  isLeadCreatedOn,
  monthStartIso,
  todayIso,
} from "@/lib/crm-stats";
import { loadCrmClients, loadCrmLeads, type CrmClient } from "@/lib/crm-supabase";
import { inactiveLeadStatuses } from "@/lib/lead-statuses";
import {
  mergePublicBookingsIntoAppointments,
  readPublicBookingsForCenter,
} from "@/lib/public-bookings";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/agenda";
import type { Lead } from "@/types/lead";

const followUpStatuses = new Set([
  "Nouveau",
  "À relancer",
  "Apl en abs",
  "SMS envoyé",
  "Mail envoyé",
  "Message WhatsApp envoyé",
  "Message vocal envoyé",
  "Mail/SMS Injoignable",
  "Message vocal",
  "Reviendra vers nous",
  "En réflexion",
]);

const soldStatuses = new Set([
  "Vendu",
  "Client converti",
  "Acompte reçu",
  "Acompte envoyé",
]);

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadError(null);

      try {
        const [leadData, appointmentData, clientData] = await Promise.all([
          loadCrmLeads(),
          loadCrmAppointments(),
          loadCrmClients(),
        ]);

        if (cancelled) {
          return;
        }

        setLeads(leadData.leads);
        setAppointments(
          mergePublicBookingsIntoAppointments(
            appointmentData,
            readPublicBookingsForCenter(leadData.center.centerName),
          ),
        );
        setClients(clientData.clients);
      } catch (error) {
        if (!cancelled) {
          setLeads([]);
          setAppointments([]);
          setClients([]);
          setLoadError(
            error instanceof Error
              ? error.message
              : "Impossible de charger les indicateurs du centre.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = todayIso();
  const yesterday = addDaysIso(today, -1);
  const monthStart = monthStartIso(today);

  const todayLeads = leads.filter((lead) => isLeadCreatedOn(lead, today));
  const yesterdayLeads = leads.filter((lead) => isLeadCreatedOn(lead, yesterday));
  const todayAppointments = appointments
    .filter(isCountableAppointment)
    .filter((appointment) => appointment.date === today)
    .sort((left, right) => left.start.localeCompare(right.start));
  const confirmedAppointments = todayAppointments.filter(
    (appointment) =>
      appointment.status === "Confirmé" ||
      appointment.status === "Présent" ||
      appointment.status === "En cours",
  );
  const unconfirmedAppointments = todayAppointments.filter(
    (appointment) => appointment.status === "À confirmer",
  );
  const monthRevenue = leads
    .filter(
      (lead) =>
        soldStatuses.has(lead.status) &&
        lead.createdDate >= monthStart &&
        lead.createdDate <= today,
    )
    .reduce((total, lead) => total + (Number(lead.dealAmount) || 0), 0);
  const recordedRevenue = monthRevenue;
  const fillRate = planningFillRate(todayAppointments, appointments);
  const reminderLeads = leads.filter(
    (lead) => lead.reminderDate === today && !inactiveLeadStatuses.includes(lead.status),
  );
  const contactsToHandle = leads
    .filter((lead) => {
      if (inactiveLeadStatuses.includes(lead.status)) {
        return false;
      }

      return followUpStatuses.has(lead.status) || lead.reminderDate === today;
    })
    .sort((left, right) => {
      const leftReminder = left.reminderDate === today ? 0 : 1;
      const rightReminder = right.reminderDate === today ? 0 : 1;

      if (leftReminder !== rightReminder) {
        return leftReminder - rightReminder;
      }

      if (left.status === "Nouveau" && right.status !== "Nouveau") {
        return -1;
      }

      if (right.status === "Nouveau" && left.status !== "Nouveau") {
        return 1;
      }

      return `${left.firstName} ${left.lastName}`.localeCompare(
        `${right.firstName} ${right.lastName}`,
      );
    })
    .slice(0, 6);
  const clientsWithBalance = clients.filter((client) => client.balanceDue > 0);
  const dailyTasks = [
    {
      label: "Rappeler les prospects prévus aujourd'hui",
      value:
        reminderLeads.length === 0
          ? "0 relance"
          : `${reminderLeads.length} relance${reminderLeads.length > 1 ? "s" : ""}`,
      href: "/dashboard/crm-leads?status=%C3%80%20relancer",
      tone: "orange",
    },
    {
      label: "Confirmer les rendez-vous non validés",
      value:
        unconfirmedAppointments.length === 0
          ? "0 RDV"
          : `${unconfirmedAppointments.length} RDV`,
      href: "/dashboard/agenda",
      tone: "violet",
    },
    {
      label: "Vérifier les montants de cure à encaisser",
      value:
        clientsWithBalance.length === 0
          ? "0 client"
          : `${clientsWithBalance.length} client${clientsWithBalance.length > 1 ? "s" : ""}`,
      href: "/dashboard/crm-clients",
      tone: "emerald",
    },
  ];
  const recommendations = useMemo(
    () =>
      buildRecommendations({
        reminderLeads,
        unconfirmedAppointments,
        todayAppointments,
        fillRate,
        rdvTakenLeads: leads.filter((lead) => lead.status === "RDV pris"),
      }),
    [fillRate, leads, reminderLeads, todayAppointments, unconfirmedAppointments],
  );

  return (
    <main className="min-h-screen bg-[#f5f6fa]">
      <div className="mx-auto max-w-[1800px] space-y-5 p-4 sm:p-6 lg:space-y-6 lg:p-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-medium text-[#6415e8]">
              Bookea Dashboard
            </p>
            <h1 className="mt-1 text-xl font-semibold text-[#11152e] sm:text-2xl">
              Tableau de bord
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Les chiffres du jour, les tâches à traiter et les optimisations
              proposées par Seya.
            </p>
          </div>

          <div className="grid gap-2 sm:flex sm:flex-wrap">
            <Link
              href="/dashboard/crm-leads"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#dfe5f2] bg-white px-4 text-sm font-bold text-[#11152e] transition-colors hover:bg-[#e9eeff]"
            >
              Voir les leads
            </Link>
            <Link
              href="/dashboard/agenda"
              className="bookea-gradient inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:brightness-105"
            >
              Ouvrir le planning
            </Link>
          </div>
        </header>

        {loadError ? (
          <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {loadError}
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <DashboardStat
            label="Leads aujourd'hui"
            value={isLoading ? "…" : todayLeads.length}
            subtitle="Reçus aujourd'hui"
            icon={<Users />}
            color="text-blue-600"
            href="/dashboard/crm-leads?quick=Aujourd%27hui"
          />
          <DashboardStat
            label="Leads hier"
            value={isLoading ? "…" : yesterdayLeads.length}
            subtitle="Reçus la veille"
            icon={<TrendingUp />}
            color="text-slate-600"
            href="/dashboard/crm-leads?quick=Hier"
          />
          <DashboardStat
            label="RDV aujourd'hui"
            value={isLoading ? "…" : todayAppointments.length}
            subtitle={`${confirmedAppointments.length} confirmés`}
            icon={<CalendarCheck2 />}
            color="text-violet-600"
            href="/dashboard/agenda"
          />
          <DashboardStat
            label="CA enregistré"
            value={isLoading ? "…" : formatCurrency(recordedRevenue)}
            subtitle="Ce mois-ci"
            icon={<Euro />}
            color="text-emerald-600"
            href="/dashboard/crm-clients"
          />
          <DashboardStat
            label="Remplissage"
            value={isLoading ? "…" : `${fillRate}%`}
            subtitle="Planning du jour"
            icon={<CheckCircle2 />}
            color="text-cyan-600"
            href="/dashboard/agenda"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
          <Card className="py-0">
            <CardContent className="p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl bg-[#e9eeff] p-3 text-[#6415e8]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#11152e]">
                    Optimisations Seya
                  </h2>
                  <p className="text-sm font-medium text-slate-500">
                    Recommandations prioritaires pour aujourd&apos;hui.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {recommendations.map((recommendation) => (
                  <div
                    key={recommendation}
                    className="rounded-xl border border-[#dfe5f2] bg-[#e9eeff] p-4 text-sm font-semibold leading-6 text-[#11152e]"
                  >
                    {recommendation}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="py-0">
            <CardContent className="p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl bg-[#e9eeff] p-3 text-[#247af2]">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#11152e]">
                    Tâches journalières
                  </h2>
                  <p className="text-sm font-medium text-slate-500">
                    À faire avant la fin de journée.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {dailyTasks.map((task) => (
                  <Link
                    key={task.label}
                    href={task.href}
                    className="flex items-center justify-between gap-4 rounded-xl border border-[#dfe5f2] bg-white p-4 transition-colors hover:bg-[#e9eeff]"
                  >
                    <span className="font-semibold text-slate-800">
                      {task.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1 text-sm font-medium",
                        taskToneClass(task.tone)
                      )}
                    >
                      {task.value}
                    </span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card className="py-0">
            <CardContent className="p-6">
              <h2 className="text-base font-semibold text-[#11152e]">
                Rendez-vous du jour
              </h2>
              <div className="mt-4 divide-y divide-slate-100">
                {isLoading ? (
                  <p className="py-6 text-sm font-semibold text-slate-500">
                    Chargement des rendez-vous du centre…
                  </p>
                ) : todayAppointments.length === 0 ? (
                  <p className="py-6 text-sm font-semibold text-slate-500">
                    Aucun rendez-vous aujourd&apos;hui sur ce centre.
                  </p>
                ) : (
                  todayAppointments.map((appointment) => (
                    <Link
                      key={appointment.id}
                      href="/dashboard/agenda"
                      className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 py-4 sm:grid-cols-[88px_minmax(0,1fr)_120px] sm:gap-4"
                    >
                      <span className="font-semibold text-[#247af2]">
                        {appointment.start}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#11152e]">
                          {appointment.personName}
                        </p>
                        <p className="truncate text-sm font-semibold text-slate-500">
                          {appointment.treatment} · {appointment.duration} min
                        </p>
                      </div>
                      <span
                        className={cn(
                          "col-span-2 w-fit rounded-full border px-3 py-1 text-center text-xs font-medium sm:col-span-1 sm:w-auto",
                          appointmentStatusClass(appointment.status)
                        )}
                      >
                        {appointment.status}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="py-0">
            <CardContent className="p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl bg-orange-50 p-3 text-orange-600">
                  <PhoneCall className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#11152e]">
                    Contacts à traiter
                  </h2>
                  <p className="text-sm font-medium text-slate-500">
                    Leads chauds et relances du jour.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {isLoading ? (
                  <p className="py-4 text-sm font-semibold text-slate-500">
                    Chargement des contacts du centre…
                  </p>
                ) : contactsToHandle.length === 0 ? (
                  <p className="py-4 text-sm font-semibold text-slate-500">
                    Aucun contact à traiter pour le moment.
                  </p>
                ) : (
                  contactsToHandle.map((lead) => (
                    <Link
                      key={lead.id}
                      href="/dashboard/crm-leads"
                      className="flex items-center justify-between gap-4 rounded-xl border border-[#dfe5f2] bg-white p-4 transition-colors hover:bg-[#fff7ed]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#11152e]">
                          {lead.firstName} {lead.lastName}
                        </p>
                        <p className="truncate text-sm font-semibold text-slate-500">
                          {lead.nextAction || lead.treatment}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                        {lead.status}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function DashboardStat({
  color,
  icon,
  label,
  subtitle,
  value,
  href,
}: {
  color: string;
  href: string;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  value: number | string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="py-0 transition-all group-hover:-translate-y-0.5 group-hover:border-[#247af2]/35 group-hover:shadow-md">
      <CardContent className="flex min-h-32 items-center justify-between gap-4 p-4 sm:min-h-36 sm:p-5">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className={`mt-2 text-xl font-semibold ${color}`}>{value}</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {subtitle}
          </p>
        </div>
        <div className="rounded-2xl bg-[#e9eeff] p-3 [&_svg]:h-6 [&_svg]:w-6">
          <span className={color}>{icon}</span>
        </div>
      </CardContent>
      </Card>
    </Link>
  );
}

function isCountableAppointment(appointment: Appointment) {
  if (appointment.kind && appointment.kind !== "Rendez-vous") {
    return false;
  }

  return appointment.status !== "Annulation";
}

function planningFillRate(
  todayAppointments: Appointment[],
  allAppointments: Appointment[],
) {
  const bookedMinutes = todayAppointments.reduce(
    (total, appointment) => total + appointment.duration,
    0,
  );
  const cabinCount = Math.max(
    new Set(
      allAppointments
        .map((appointment) => appointment.cabinId)
        .filter(Boolean),
    ).size,
    new Set(todayAppointments.map((appointment) => appointment.cabinId)).size,
    1,
  );
  const openingMinutes = Math.max(1, timeToMinutes("19:00") - timeToMinutes("08:00"));
  const capacity = cabinCount * openingMinutes;

  return Math.min(100, Math.round((bookedMinutes / capacity) * 100));
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function buildRecommendations({
  reminderLeads,
  unconfirmedAppointments,
  todayAppointments,
  fillRate,
  rdvTakenLeads,
}: {
  reminderLeads: Lead[];
  unconfirmedAppointments: Appointment[];
  todayAppointments: Appointment[];
  fillRate: number;
  rdvTakenLeads: Lead[];
}) {
  const items: string[] = [];
  const firstReminder = reminderLeads[0];

  if (firstReminder) {
    items.push(
      `Prioriser ${firstReminder.firstName} ${firstReminder.lastName} : relance prévue aujourd'hui.`,
    );
  }

  if (unconfirmedAppointments.length > 0) {
    const first = unconfirmedAppointments[0];
    items.push(
      `Confirmer ${first.personName} à ${first.start} pour sécuriser le planning.`,
    );
  }

  if (fillRate < 50) {
    items.push(
      `Le planning n'est rempli qu'à ${fillRate}% : placer un bilan ou une consultation sur un créneau libre.`,
    );
  } else if (rdvTakenLeads.length > 0) {
    items.push(
      `Demander un acompte sur ${rdvTakenLeads.length} prospect${rdvTakenLeads.length > 1 ? "s" : ""} en RDV pris.`,
    );
  } else if (todayAppointments.length === 0) {
    items.push("Aucun rendez-vous aujourd'hui : relancer les nouveaux leads pour remplir la journée.");
  }

  if (items.length === 0) {
    items.push("Aucun point prioritaire : le centre est à jour pour aujourd'hui.");
  }

  return items.slice(0, 3);
}

function appointmentStatusClass(status: string) {
  if (status === "Confirmé" || status === "Présent") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "À confirmer") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function taskToneClass(tone: string) {
  if (tone === "orange") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (tone === "violet") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (tone === "emerald") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function formatCurrency(value: number) {
  return value.toLocaleString("fr-FR", {
    currency: "EUR",
    style: "currency",
  });
}
