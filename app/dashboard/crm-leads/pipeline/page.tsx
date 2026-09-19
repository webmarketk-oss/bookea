"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, RefreshCcw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { leadStatusClassName, leadStatusSelectOptions } from "@/lib/lead-statuses";
import { loadCrmLeads, updateCrmLeadStatus } from "@/lib/crm-supabase";
import { cn } from "@/lib/utils";
import type { Lead, LeadStatus } from "@/types/lead";

type PipelineStage = {
  title: string;
  description: string;
  statuses: LeadStatus[];
};

const stages: PipelineStage[] = [
  {
    title: "Nouveaux",
    description: "À qualifier rapidement",
    statuses: ["Nouveau"],
  },
  {
    title: "À recontacter",
    description: "Absents, SMS, mail, à relancer",
    statuses: [
      "À relancer",
      "Apl en abs",
      "Reviendra vers nous",
      "En réflexion",
      "Message WhatsApp envoyé",
      "SMS envoyé",
      "Message vocal envoyé",
      "Mail envoyé",
      "Mail/SMS Injoignable",
      "Message vocal",
    ],
  },
  {
    title: "RDV",
    description: "Rendez-vous pris ou confirmé",
    statuses: ["RDV pris", "RDV confirmé"],
  },
  {
    title: "Vente",
    description: "Devis, acompte, vente",
    statuses: [
      "Devis",
      "Acompte envoyé",
      "Acompte reçu",
      "Acompte en attente",
      "Vendu",
      "Client converti",
    ],
  },
  {
    title: "Perdus",
    description: "Non exploitables ou clôturés",
    statuses: [
      "Pas intéressé",
      "Prospect perdu",
      "Intraitable",
      "Numéro invalide",
      "Doublon",
      "Hors zone",
      "No show",
    ],
  },
];

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);

  async function refreshPipeline() {
    setLoading(true);
    setError(null);

    try {
      const { leads: nextLeads } = await loadCrmLeads();
      setLeads(nextLeads);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Impossible de charger le pipeline CRM.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPipeline();
  }, []);

  const leadGroups = useMemo(
    () =>
      stages.map((stage) => ({
        ...stage,
        leads: leads.filter((lead) => stage.statuses.includes(lead.status)),
      })),
    [leads],
  );

  async function changeStatus(lead: Lead, status: LeadStatus) {
    setSavingLeadId(lead.id);
    setLeads((current) =>
      current.map((item) =>
        item.id === lead.id
          ? { ...item, status, updatedDate: new Date().toISOString().slice(0, 10) }
          : item,
      ),
    );

    try {
      await updateCrmLeadStatus(lead, status);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Le statut n'a pas pu être enregistré.",
      );
      await refreshPipeline();
    } finally {
      setSavingLeadId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8" data-sidebar-collapse-area="true">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase text-violet-600">
              Bookea CRM
            </p>
            <h1 className="mt-1 text-4xl font-black tracking-tight text-slate-950">
              Pipeline prospects
            </h1>
            <p className="mt-2 max-w-2xl font-semibold text-slate-500">
              Visualisez les leads par étape commerciale et changez leur statut
              directement depuis le pipeline.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={refreshPipeline}
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

        <section className="grid gap-4 xl:grid-cols-5">
          {leadGroups.map((group) => (
            <div
              key={group.title}
              className="min-h-[620px] rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-slate-950">
                    {group.title}
                  </h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {group.description}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-600">
                  {group.leads.length}
                </span>
              </div>

              <div className="space-y-3">
                {group.leads.map((lead) => (
                  <article
                    key={lead.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-black text-slate-950">
                          {lead.firstName} {lead.lastName}
                        </h3>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                          {lead.treatment}
                        </p>
                      </div>
                      <Users className="h-5 w-5 shrink-0 text-blue-600" />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-black ring-1",
                          leadStatusClassName(lead.status),
                        )}
                      >
                        {lead.status}
                      </span>
                      {lead.dealAmount > 0 ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                          {lead.dealAmount} €
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 line-clamp-2 text-sm font-semibold text-slate-600">
                      {lead.nextAction}
                    </p>

                    <label className="mt-4 block">
                      <span className="mb-1 block text-[11px] font-black uppercase text-slate-400">
                        Déplacer vers
                      </span>
                      <select
                        value={lead.status}
                        disabled={savingLeadId === lead.id}
                        onChange={(event) =>
                          changeStatus(lead, event.target.value as LeadStatus)
                        }
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-blue-500"
                      >
                        {leadStatusSelectOptions(lead.status).map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                ))}

                {!loading && group.leads.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm font-bold text-slate-400">
                    Aucun lead ici
                    <ArrowRight className="mx-auto mt-3 h-5 w-5" />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
