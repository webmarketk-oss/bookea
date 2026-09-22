import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { inactiveLeadStatuses } from "@/lib/lead-statuses";
import {
  addDaysIso,
  isLeadCreatedBetween,
  isLeadCreatedOn,
  isLeadCreatedSince,
  isLeadRdvTakenBetween,
  isLeadRdvTakenOn,
  monthStartIso,
  todayIso,
  type CrmQuickFilter,
} from "@/lib/crm-stats";
import { Lead, LeadStatus } from "@/types/lead";
import {
  CalendarCheck2,
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
  activeQuickFilter: CrmQuickFilter;
  onQuickFilter: (filter: CrmQuickFilter) => void;
};

type StatCard = {
  title: string;
  value: number;
  subtitle: string;
  icon: typeof Users;
  color: string;
  status?: LeadStatus | null;
  quickFilter?: Exclude<CrmQuickFilter, "Tous">;
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
  const monthStart = monthStartIso(today);

  const acquisitionStats: StatCard[] = [
    {
      title: "Nouveaux",
      value: leads.filter((lead) => isLeadCreatedOn(lead, today)).length,
      subtitle: "Leads acquis aujourd'hui",
      icon: Users,
      color: "text-blue-600",
      quickFilter: "Aujourd'hui",
    },
    {
      title: "Hier",
      value: leads.filter((lead) => isLeadCreatedOn(lead, yesterday)).length,
      subtitle: "Prospects acquis la veille",
      icon: History,
      color: "text-slate-600",
      quickFilter: "Hier",
    },
    {
      title: "7 derniers jours",
      value: leads.filter((lead) =>
        isLeadCreatedBetween(lead, sevenDaysAgo, today),
      ).length,
      subtitle: "Prospects acquis",
      icon: CalendarDays,
      color: "text-cyan-600",
      quickFilter: "7 derniers jours",
    },
    {
      title: "Ce mois",
      value: leads.filter((lead) => isLeadCreatedSince(lead, monthStart)).length,
      subtitle: "Depuis le 1er du mois",
      icon: CalendarDays,
      color: "text-indigo-600",
      quickFilter: "Ce mois",
    },
  ];

  const rdvStats: StatCard[] = [
    {
      title: "RDV pris aujourd'hui",
      value: leads.filter((lead) => isLeadRdvTakenOn(lead, today)).length,
      subtitle: "Même convertis, no-show ou annulés",
      icon: CalendarCheck2,
      color: "text-violet-600",
      quickFilter: "RDV aujourd'hui",
    },
    {
      title: "RDV pris hier",
      value: leads.filter((lead) => isLeadRdvTakenOn(lead, yesterday)).length,
      subtitle: "Même convertis, no-show ou annulés",
      icon: CalendarCheck2,
      color: "text-fuchsia-600",
      quickFilter: "RDV hier",
    },
    {
      title: "RDV pris 7 jours",
      value: leads.filter((lead) =>
        isLeadRdvTakenBetween(lead, sevenDaysAgo, today),
      ).length,
      subtitle: "Même convertis, no-show ou annulés",
      icon: CalendarCheck2,
      color: "text-purple-600",
      quickFilter: "RDV 7 jours",
    },
  ];

  const followUpStats: StatCard[] = [
    {
      title: "À recontacter",
      value: leads.filter((lead) =>
        [
          "Nouveau",
          "Apl en abs",
          "SMS envoyé",
          "Mail envoyé",
          "À relancer",
        ].includes(lead.status),
      ).length,
      subtitle: "Nouveau, absents, SMS, mail",
      icon: Phone,
      color: "text-orange-500",
      status: "À relancer",
    },
    {
      title: "Clients",
      value: leads.filter((lead) =>
        ["Client converti", "Vendu"].includes(lead.status),
      ).length,
      subtitle: "Convertis",
      icon: CircleCheck,
      color: "text-green-600",
      status: "Client converti",
    },
    {
      title: "Perdus",
      value: leads.filter((lead) =>
        inactiveLeadStatuses.includes(lead.status),
      ).length,
      subtitle: "Classés en bas",
      icon: CircleX,
      color: "text-red-600",
      status: "Prospect perdu",
    },
  ];

  return (
    <div className="space-y-5">
      <StatGroup title="Prospects acquis" cards={acquisitionStats} columns="xl:grid-cols-4">
        {(stat) =>
          renderStatCard(stat, activeStatus, activeQuickFilter, onStatusFilter, onQuickFilter)
        }
      </StatGroup>
      <StatGroup
        title="RDV pris"
        hint="Comptés à la date où le rendez-vous a été pris, même si le statut a ensuite changé."
        cards={rdvStats}
        columns="md:grid-cols-3"
      >
        {(stat) =>
          renderStatCard(stat, activeStatus, activeQuickFilter, onStatusFilter, onQuickFilter)
        }
      </StatGroup>
      <StatGroup title="Suivi" cards={followUpStats} columns="md:grid-cols-3">
        {(stat) =>
          renderStatCard(stat, activeStatus, activeQuickFilter, onStatusFilter, onQuickFilter)
        }
      </StatGroup>
    </div>
  );
}

function StatGroup({
  title,
  hint,
  cards,
  columns,
  children,
}: {
  title: string;
  hint?: string;
  cards: StatCard[];
  columns: string;
  children: (stat: StatCard) => ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </p>
        {hint ? (
          <p className="mt-1 text-xs font-medium text-slate-500">{hint}</p>
        ) : null}
      </div>
      <div className={`grid gap-5 md:grid-cols-2 ${columns}`}>
        {cards.map(children)}
      </div>
    </section>
  );
}

function renderStatCard(
  stat: StatCard,
  activeStatus: "Tous" | LeadStatus,
  activeQuickFilter: CrmQuickFilter,
  onStatusFilter: (status: "Tous" | LeadStatus) => void,
  onQuickFilter: (filter: CrmQuickFilter) => void,
) {
  const Icon = stat.icon;
  const active =
    (stat.status != null && activeStatus === stat.status) ||
    (stat.quickFilter != null && activeQuickFilter === stat.quickFilter);

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
      <Card
        className={`h-full border-0 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
          active ? "ring-2 ring-violet-400" : ""
        }`}
      >
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{stat.title}</p>
              <h2 className={`mt-3 text-4xl font-bold ${stat.color}`}>
                {stat.value}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">{stat.subtitle}</p>
            </div>
            <div className="rounded-xl bg-slate-100 p-3">
              <Icon className={`h-6 w-6 ${stat.color}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
