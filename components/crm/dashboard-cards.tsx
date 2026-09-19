import { Card, CardContent } from "@/components/ui/card";
import { Lead, LeadStatus } from "@/types/lead";
import {
  CalendarDays,
  CircleCheck,
  CircleX,
  History,
  Phone,
  Users,
} from "lucide-react";

type DashboardCardsProps = {
  leads: Lead[];
  activeStatus: "Tous" | LeadStatus;
  onStatusFilter: (status: "Tous" | LeadStatus) => void;
  activeQuickFilter: "Tous" | "Hier" | "7 derniers jours";
  onQuickFilter: (filter: "Tous" | "Hier" | "7 derniers jours") => void;
};

type QuickFilter = "Hier" | "7 derniers jours";

type StatCard = {
  title: string;
  value: number;
  subtitle: string;
  icon: typeof Users;
  color: string;
  status: LeadStatus | null;
  quickFilter?: QuickFilter;
};

export default function DashboardCards({
  leads,
  activeStatus,
  onStatusFilter,
  activeQuickFilter,
  onQuickFilter,
}: DashboardCardsProps) {
  const today = todayIso();
  const yesterday = addDaysIso(today, -1);
  const sevenDaysAgo = addDaysIso(today, -6);
  const todayCreatedLeads = leads.filter(isLeadCreatedToday);
  const yesterdayLeads = leads.filter((lead) => isLeadCreatedOn(lead, yesterday));
  const last7DaysLeads = leads.filter((lead) =>
    isLeadCreatedBetween(lead, sevenDaysAgo, today)
  );
  const stats: StatCard[] = [
    {
      title: "Nouveaux",
      value: todayCreatedLeads.filter((lead) => lead.status === "Nouveau")
        .length,
      subtitle: "Reçus aujourd'hui",
      icon: Users,
      color: "text-blue-600",
      status: "Nouveau" as const,
    },
    {
      title: "À relancer",
      value: leads.filter((lead) =>
        isLeadDueToday(lead) &&
        ["À relancer", "Apl en abs"].includes(
          lead.status
        )
      ).length,
      subtitle: "Relances du jour",
      icon: Phone,
      color: "text-orange-500",
      status: "À relancer" as const,
    },
    {
      title: "RDV programmés",
      value: leads.filter((lead) =>
        isLeadDueToday(lead) &&
        ["RDV pris", "RDV confirmé", "Acompte reçu"].includes(
          lead.status
        )
      ).length,
      subtitle: "Rendez-vous du jour",
      icon: CalendarDays,
      color: "text-violet-600",
      status: "RDV pris" as const,
    },
    {
      title: "Clients",
      value: todayCreatedLeads.filter((lead) =>
        ["Client converti", "Vendu"].includes(lead.status)
      ).length,
      subtitle: "Convertis aujourd'hui",
      icon: CircleCheck,
      color: "text-green-600",
      status: "Client converti" as const,
    },
    {
      title: "Perdus",
      value: todayCreatedLeads.filter((lead) =>
        [
          "Pas intéressé",
          "Prospect perdu",
          "Intraitable",
          "Numéro invalide",
          "Doublon",
          "Hors zone",
          "No show",
        ].includes(lead.status)
      ).length,
      subtitle: "Classés en bas",
      icon: CircleX,
      color: "text-red-600",
      status: "Prospect perdu" as const,
    },
    {
      title: "Hier",
      value: yesterdayLeads.length,
      subtitle: "Leads reçus la veille",
      icon: History,
      color: "text-slate-600",
      status: null,
      quickFilter: "Hier" as const,
    },
    {
      title: "7 derniers jours",
      value: last7DaysLeads.length,
      subtitle: "Leads reçus",
      icon: CalendarDays,
      color: "text-cyan-600",
      status: null,
      quickFilter: "7 derniers jours" as const,
    },
  ];

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const active =
          (stat.status !== null && activeStatus === stat.status) ||
          (stat.quickFilter && activeQuickFilter === stat.quickFilter);

        const content = (
            <Card
              className={`h-full border-0 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                active ? "ring-2 ring-violet-400" : ""
              }`}
            >
              <CardContent className="p-6">

              <div className="flex items-center justify-between">

                <div>
                  <p className="text-sm text-muted-foreground">
                    {stat.title}
                  </p>

                  <h2 className={`mt-3 text-4xl font-bold ${stat.color}`}>
                    {stat.value}
                  </h2>

                  <p className="mt-3 text-sm text-muted-foreground">
                    {stat.subtitle}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-100 p-3">
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>

              </div>

              </CardContent>
            </Card>
        );

        return (
          <button
            key={stat.title}
            type="button"
            onClick={() => {
              if (stat.quickFilter) {
                onQuickFilter(active ? "Tous" : stat.quickFilter);
                return;
              }

              if (stat.status) {
                onStatusFilter(active ? "Tous" : stat.status);
              }
            }}
            className="cursor-pointer text-left"
            aria-label={`Filtrer les prospects : ${stat.title}`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function isLeadCreatedToday(lead: Lead) {
  return lead.createdAt.toLowerCase().includes("aujourd") || isLeadCreatedOn(lead, todayIso());
}

function isLeadDueToday(lead: Lead) {
  return lead.reminderDate === todayIso() || lead.createdAt.toLowerCase().includes("aujourd");
}

function isLeadCreatedOn(lead: Lead, date: string) {
  if (date === addDaysIso(todayIso(), -1) && lead.createdAt.toLowerCase().includes("hier")) {
    return true;
  }

  return lead.createdDate === date;
}

function isLeadCreatedBetween(lead: Lead, startDate: string, endDate: string) {
  if (lead.createdAt.toLowerCase().includes("aujourd") || lead.createdAt.toLowerCase().includes("hier")) {
    return true;
  }

  return lead.createdDate >= startDate && lead.createdDate <= endDate;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number) {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate.toISOString().slice(0, 10);
}
