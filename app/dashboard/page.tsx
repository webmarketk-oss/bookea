"use client";

import Link from "next/link";
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
import { appointments } from "@/lib/agenda-data";
import { leads } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const dailyTasks = [
  {
    label: "Rappeler les prospects prévus aujourd'hui",
    value: "1 relance",
    href: "/dashboard/crm-leads?status=%C3%80%20rappeler",
    tone: "orange",
  },
  {
    label: "Confirmer les rendez-vous non validés",
    value: "1 RDV",
    href: "/dashboard/agenda",
    tone: "violet",
  },
  {
    label: "Vérifier les montants de cure à encaisser",
    value: "Clients",
    href: "/dashboard/crm-clients",
    tone: "emerald",
  },
];

const recommendations = [
  "Prioriser Julie Martin : relance prévue aujourd'hui, proposer un créneau court.",
  "Cabine 4 reste disponible cet après-midi : placer un bilan ou une consultation.",
  "Demander un acompte sur les prospects RDV pris pour sécuriser le planning.",
];

export default function DashboardPage() {
  const today = todayIso();
  const todayLeads = leads.filter((lead) => isTodayLabel(lead.createdAt));
  const yesterdayLeads = leads.filter((lead) => isYesterdayLabel(lead.createdAt));
  const todayAppointments = appointments.filter(
    (appointment) => appointment.date === today
  );
  const confirmedAppointments = todayAppointments.filter(
    (appointment) => appointment.status === "Confirmé"
  );
  const monthRevenue = leads
    .filter((lead) => isCurrentMonth(lead.createdDate))
    .reduce((total, lead) => total + lead.dealAmount, 0);
  const fillRate = Math.round(
    (todayAppointments.reduce(
      (total, appointment) => total + appointment.duration,
      0
    ) /
      (12 * 60 * 5)) *
      100
  );

  return (
    <main className="min-h-screen bg-[#f5f6fa]">
      <div className="mx-auto max-w-[1800px] space-y-6 p-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-black uppercase text-[#6415e8]">
              Bookea Dashboard
            </p>
            <h1 className="mt-1 text-4xl font-black text-[#11152e]">
              Tableau de bord
            </h1>
            <p className="mt-2 max-w-2xl text-slate-500">
              Les chiffres du jour, les tâches à traiter et les optimisations
              proposées par Seya.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <DashboardStat
            label="Leads aujourd'hui"
            value={todayLeads.length}
            subtitle="À traiter"
            icon={<Users />}
            color="text-blue-600"
            href="/dashboard/crm-leads?status=Nouveau"
          />
          <DashboardStat
            label="Leads hier"
            value={yesterdayLeads.length}
            subtitle="Reçus la veille"
            icon={<TrendingUp />}
            color="text-slate-600"
            href="/dashboard/crm-leads?quick=Hier"
          />
          <DashboardStat
            label="RDV aujourd'hui"
            value={todayAppointments.length}
            subtitle={`${confirmedAppointments.length} confirmés`}
            icon={<CalendarCheck2 />}
            color="text-violet-600"
            href="/dashboard/agenda"
          />
          <DashboardStat
            label="CA enregistré"
            value={formatCurrency(monthRevenue)}
            subtitle="Ce mois-ci"
            icon={<Euro />}
            color="text-emerald-600"
            href="/dashboard/crm-clients"
          />
          <DashboardStat
            label="Remplissage"
            value={`${fillRate}%`}
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
                  <h2 className="text-xl font-black text-[#11152e]">
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
                  <h2 className="text-xl font-black text-[#11152e]">
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
                        "shrink-0 rounded-full border px-3 py-1 text-sm font-black",
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
              <h2 className="text-xl font-black text-[#11152e]">
                Rendez-vous du jour
              </h2>
              <div className="mt-4 divide-y divide-slate-100">
                {todayAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="grid grid-cols-[88px_minmax(0,1fr)_120px] items-center gap-4 py-4"
                  >
                    <span className="font-black text-[#247af2]">
                      {appointment.start}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-[#11152e]">
                        {appointment.personName}
                      </p>
                      <p className="truncate text-sm font-semibold text-slate-500">
                        {appointment.treatment} · {appointment.duration} min
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-center text-xs font-black",
                        appointmentStatusClass(appointment.status)
                      )}
                    >
                      {appointment.status}
                    </span>
                  </div>
                ))}
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
                  <h2 className="text-xl font-black text-[#11152e]">
                    Contacts à traiter
                  </h2>
                  <p className="text-sm font-medium text-slate-500">
                    Leads chauds et relances du jour.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {leads.slice(0, 3).map((lead) => (
                  <Link
                    key={lead.id}
                    href="/dashboard/crm-leads"
                    className="flex items-center justify-between gap-4 rounded-xl border border-[#dfe5f2] bg-white p-4 transition-colors hover:bg-[#fff7ed]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-black text-[#11152e]">
                        {lead.firstName} {lead.lastName}
                      </p>
                      <p className="truncate text-sm font-semibold text-slate-500">
                        {lead.nextAction}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">
                      {lead.status}
                    </span>
                  </Link>
                ))}
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
      <CardContent className="flex min-h-36 items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
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

function isTodayLabel(value: string) {
  return value.toLowerCase().includes("aujourd");
}

function isYesterdayLabel(value: string) {
  return value.toLowerCase().includes("hier");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function appointmentStatusClass(status: string) {
  if (status === "Confirmé") {
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

function isCurrentMonth(date: string) {
  return date.slice(0, 7) === todayIso().slice(0, 7);
}

function formatCurrency(value: number) {
  return value.toLocaleString("fr-FR", {
    currency: "EUR",
    style: "currency",
  });
}
