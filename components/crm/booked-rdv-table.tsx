"use client";

import { useMemo, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { compareBookedLeads, displayVisitDate } from "@/lib/crm-rdv";
import { matchesPersonSearch } from "@/lib/person-search";
import type { Lead } from "@/types/lead";

export default function BookedRdvTable({
  leads,
  loading,
  error,
  onVisitDateChange,
  onRefresh,
}: {
  leads: Lead[] | null;
  loading: boolean;
  error: string | null;
  onVisitDateChange: (leadId: string, date: string) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (leads ?? [])
      .filter((lead) => {
        if (!needle) {
          return true;
        }
        const center = (lead.centerName || "").toLowerCase();
        const phone = (lead.phone || "").toLowerCase();
        return (
          matchesPersonSearch(query, lead.firstName, lead.lastName) ||
          center.includes(needle) ||
          phone.includes(needle)
        );
      })
      .sort(compareBookedLeads);
  }, [leads, query]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Tous les RDV pris</h2>
          <p className="text-sm text-slate-500">
            Historique complet, tous les centres accessibles. Les dates manquantes sont en haut.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          Actualiser
        </button>
      </div>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher un nom, un téléphone ou un centre"
        aria-label="Rechercher un rendez-vous"
      />
      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      {loading && !leads ? (
        <p className="text-sm font-semibold text-slate-500">Chargement des rendez-vous…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prospect</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-[9.5rem]">Date du RDV</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Soin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-slate-500">
                    Aucun rendez-vous pris pour cette recherche.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-semibold">
                      {lead.firstName} {lead.lastName}
                    </TableCell>
                    <TableCell>{lead.centerName || "Centre"}</TableCell>
                    <TableCell>{lead.status}</TableCell>
                    <TableCell>
                      <input
                        type="date"
                        aria-label={`Date du RDV de ${lead.firstName} ${lead.lastName}`}
                        value={displayVisitDate(lead)}
                        onChange={(event) =>
                          onVisitDateChange(lead.id, event.target.value)
                        }
                        className="h-8 w-[8.5rem] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </TableCell>
                    <TableCell>{lead.phone || "—"}</TableCell>
                    <TableCell>{lead.treatment}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {leads ? (
        <p className="text-xs font-semibold text-slate-400">
          {rows.length} rendez-vous
          {query.trim() ? ` sur ${leads.length}` : ""}
        </p>
      ) : null}
    </section>
  );
}
