"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, RefreshCcw } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addCrmLeadActivity,
  loadCrmLeads,
  updateCrmLeadNextAction,
} from "@/lib/crm-supabase";
import { leadStatusClasses } from "@/lib/lead-statuses";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types/lead";

export default function LeadTasksPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);

  async function refreshTasks() {
    setLoading(true);
    setError(null);

    try {
      const { leads: nextLeads } = await loadCrmLeads();
      setLeads(nextLeads);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Impossible de charger les tâches prospects.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshTasks();
  }, []);

  const tasks = useMemo(
    () =>
      leads
        .filter((lead) => {
          const action = lead.nextAction.trim().toLowerCase();
          return action.length > 0 && action !== "-" && action !== "traité";
        })
        .sort((current, next) => {
          const currentDate = current.reminderDate ?? "9999-12-31";
          const nextDate = next.reminderDate ?? "9999-12-31";
          return currentDate.localeCompare(nextDate);
        }),
    [leads],
  );

  async function completeTask(lead: Lead) {
    setSavingLeadId(lead.id);
    setLeads((current) =>
      current.map((item) =>
        item.id === lead.id
          ? { ...item, nextAction: "Traité", updatedDate: new Date().toISOString().slice(0, 10) }
          : item,
      ),
    );

    try {
      await updateCrmLeadNextAction(lead.id, "Traité");
      await addCrmLeadActivity(lead.id, `Tâche traitée : ${lead.nextAction}`);
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : "La tâche n'a pas pu être mise à jour.",
      );
      await refreshTasks();
    } finally {
      setSavingLeadId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8" data-sidebar-collapse-area="true">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-violet-600">Bookea CRM</p>
            <h1 className="mt-1 text-4xl font-black tracking-tight text-slate-950">
              Tâches prospects
            </h1>
            <p className="mt-2 text-slate-500">
              Suivez les prochaines actions à traiter depuis les fiches leads.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={refreshTasks}
            disabled={loading}
          >
            <RefreshCcw className="h-4 w-4" />
            {loading ? "Chargement..." : "Rafraîchir"}
          </Button>
        </header>

        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            <AlertTriangle className="h-5 w-5" />
            {error}
          </div>
        ) : null}

        <Card className="border-slate-200 py-0 shadow-sm">
          <CardContent className="divide-y divide-slate-100 p-0">
            {tasks.map((lead) => (
              <div
                key={lead.id}
                className="grid gap-3 p-5 md:grid-cols-[1fr_1.2fr_150px_150px_120px]"
              >
                <div>
                  <p className="font-black text-slate-950">
                    {lead.firstName} {lead.lastName}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {lead.phone || lead.email || "Contact à compléter"}
                  </p>
                </div>
                <p className="font-semibold text-slate-700">{lead.nextAction}</p>
                <p className="text-sm font-semibold text-slate-500">
                  <CalendarClock className="mr-1 inline h-4 w-4" />
                  {lead.reminderDate ?? "Sans rappel"}
                </p>
                <Badge
                  className={cn(
                    "justify-self-start ring-1",
                    leadStatusClasses[lead.status],
                  )}
                >
                  {lead.status}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  disabled={savingLeadId === lead.id}
                  onClick={() => completeTask(lead)}
                >
                  <Check className="h-4 w-4" />
                  Traité
                </Button>
              </div>
            ))}

            {!loading && tasks.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-lg font-black text-slate-950">
                  Aucune tâche à traiter
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Les prochaines actions créées dans les fiches prospects
                  apparaîtront ici.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
