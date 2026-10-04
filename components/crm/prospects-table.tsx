"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isOpenReminderDue, toDateOnlyIso } from "@/lib/crm-stats";
import {
  isInactiveLeadStatus,
  leadStatusClassName,
  leadStatusSelectOptions,
} from "@/lib/lead-statuses";
import { cn } from "@/lib/utils";
import { Lead, LeadStatus } from "@/types/lead";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Globe } from "lucide-react";

interface ProspectsTableProps {
  leads: Lead[];
  sortBy?: "created" | "updated";
  selectedLead: Lead;
  isLeadDetailsOpen?: boolean;
  onSelectLead: (lead: Lead) => void;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
  onCommentAdd: (leadId: string, text: string) => void;
  onCommentDelete: (leadId: string, activityId: string) => void;
  onDealAmountChange: (leadId: string, amount: number) => void;
  onReminderDateChange: (leadId: string, date: string) => void;
  onCommercialChange: (leadId: string, commercial: string) => void;
}

export default function ProspectsTable({
  leads,
  sortBy = "created",
  selectedLead,
  isLeadDetailsOpen = false,
  onSelectLead,
  onStatusChange,
  onCommentAdd,
  onCommentDelete,
  onDealAmountChange,
  onReminderDateChange,
  onCommercialChange,
}: ProspectsTableProps) {
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    setDateSort("desc");
  }, [sortBy]);

  const sortedLeads = leads
    .map((lead, index) => ({ lead, index }))
    .sort((current, next) => {
      const stamp = sortBy === "updated" ? leadUpdatedStamp : leadCreatedStamp;
      const dateDiff = stamp(current.lead).localeCompare(stamp(next.lead));
      if (dateDiff !== 0) {
        return dateSort === "desc" ? -dateDiff : dateDiff;
      }
      return current.index - next.index;
    })
    .map(({ lead }) => lead);

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-auto overflow-y-clip rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Table className="min-w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[12rem]">Prospect</TableHead>
            <TableHead>Campagne</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>
              <button
                type="button"
                onClick={() =>
                  setDateSort((order) => (order === "desc" ? "asc" : "desc"))
                }
                className="inline-flex items-center gap-1 text-left font-medium text-foreground hover:text-slate-950"
                aria-label={
                  dateSort === "desc"
                    ? "Trier du plus ancien au plus récent"
                    : "Trier du plus récent au plus ancien"
                }
                title={
                  dateSort === "desc"
                    ? "Plus récent en haut"
                    : "Plus ancien en haut"
                }
              >
                Date
                <span className="flex flex-col -space-y-1" aria-hidden>
                  <ChevronUp
                    className={cn(
                      "h-3 w-3",
                      dateSort === "asc" ? "text-slate-900" : "text-slate-300",
                    )}
                  />
                  <ChevronDown
                    className={cn(
                      "h-3 w-3",
                      dateSort === "desc" ? "text-slate-900" : "text-slate-300",
                    )}
                  />
                </span>
              </button>
            </TableHead>
            <TableHead>Rappel</TableHead>
            <TableHead>Commercial</TableHead>
            <TableHead className="min-w-[12rem]">Statut</TableHead>
            <TableHead>Montant</TableHead>
            <TableHead
              className={cn(
                "sticky right-0 z-20 border-l border-slate-200 bg-white shadow-[-8px_0_12px_rgba(15,23,42,0.06)]",
                commentsOpen ? "min-w-[19rem] w-[19rem]" : "w-10 min-w-10"
              )}
            >
              <div className="flex items-center justify-between gap-1">
                {commentsOpen ? (
                  <span className="truncate text-sm font-medium text-slate-950">
                    Commentaire
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setCommentsOpen((open) => !open);
                  }}
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950"
                  aria-label={
                    commentsOpen
                      ? "Rabattre les commentaires"
                      : "Ouvrir les commentaires"
                  }
                  title={
                    commentsOpen
                      ? "Rabattre les commentaires"
                      : "Ouvrir les commentaires"
                  }
                >
                  {commentsOpen ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </button>
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {sortedLeads.map((lead) => {
            const isInactive = isInactiveLeadStatus(lead.status);
            const latestComment = getLatestLeadComment(lead);

            return (
            <TableRow
              key={lead.id}
              data-lead-id={lead.id}
              data-lead-row="true"
              onClick={() => onSelectLead(lead)}
              className={cn(
                "h-20 cursor-pointer transition-all hover:bg-slate-50",
                isInactive && "bg-slate-50 hover:bg-slate-100",
                isOpenReminderDue(lead) &&
                  !isInactive &&
                  "bg-amber-50 hover:bg-amber-50",
                isLeadDetailsOpen &&
                  selectedLead.id === lead.id &&
                  "border-l-4 border-l-blue-600 bg-blue-50 hover:bg-blue-50"
              )}
            >
              <TableCell>
                <div>
                  <p className="font-semibold">
                    {lead.firstName} {lead.lastName}
                  </p>
                  <p className="text-sm text-slate-500">{lead.phone}</p>
                </div>
              </TableCell>

              <TableCell>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {lead.campaign}
                </span>
              </TableCell>

              <TableCell>
                <SourceBadge source={lead.source} />
              </TableCell>

              <TableCell>{lead.createdAt}</TableCell>

              <TableCell>
                <input
                  type="date"
                  value={toDateOnlyIso(lead.reminderDate) ?? ""}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    onReminderDateChange(lead.id, event.target.value)
                  }
                  className={cn(
                    "h-8 w-[11rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
                    isOpenReminderDue(lead) &&
                      "border-amber-200 bg-amber-100 text-amber-800"
                  )}
                />
              </TableCell>

              <TableCell>
                <select
                  value={lead.commercial}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    onCommercialChange(lead.id, event.target.value)
                  }
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {["Samantha", "Thomas", "Camille", "Marie L.", "Aurélie"].map(
                    (commercial) => (
                      <option key={commercial} value={commercial}>
                        {commercial}
                      </option>
                    )
                  )}
                </select>
              </TableCell>

              <TableCell>
                <select
                  value={lead.status}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    onStatusChange(lead.id, event.target.value as LeadStatus)
                  }
                  className={cn(
                    "h-7 min-w-[11rem] rounded-full border-0 px-3 text-xs font-semibold outline-none ring-1 transition-colors",
                    "focus:ring-2 focus:ring-blue-400",
                    leadStatusClassName(lead.status)
                  )}
                >
                  {leadStatusSelectOptions(lead.status).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={lead.dealAmount || ""}
                    placeholder="0"
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) =>
                      onDealAmountChange(lead.id, Number(event.target.value))
                    }
                    className="h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <span className="text-sm text-slate-400">€</span>
                </div>
              </TableCell>

              <TableCell
                className={cn(
                  "sticky right-0 z-10 whitespace-normal border-l border-slate-200 bg-white shadow-[-8px_0_12px_rgba(15,23,42,0.06)]",
                  isInactive && "bg-slate-50",
                  isOpenReminderDue(lead) &&
                    !isInactive &&
                    "bg-amber-50",
                  selectedLead.id === lead.id && "bg-blue-50",
                  commentsOpen ? "min-w-[19rem] w-[19rem]" : "w-10 min-w-10"
                )}
              >
                {commentsOpen ? (
                  <textarea
                    key={latestComment?.id ?? `${lead.id}-empty-comment`}
                    defaultValue={latestComment?.text ?? ""}
                    placeholder="Ajouter un commentaire..."
                    rows={2}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => {
                      const value = event.currentTarget.value.trim();

                      if (!value && latestComment) {
                        onCommentDelete(lead.id, latestComment.id);
                        return;
                      }

                      if (value && value !== latestComment?.text) {
                        onCommentAdd(lead.id, value);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                    className="min-h-14 min-w-0 w-full max-h-32 resize-y overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-5 text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                ) : null}
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function leadCreatedStamp(lead: Lead) {
  const isoDate = String(lead.createdDate || "").slice(0, 10);
  const timeMatch = String(lead.createdAt || "").match(/(\d{1,2})\D(\d{2})\s*$/);
  if (isoDate && timeMatch) {
    return `${isoDate}T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00`;
  }
  return isoDate || String(lead.createdAt || "");
}

function leadUpdatedStamp(lead: Lead) {
  const activity = String(lead.lastActivityAt || "").trim();
  if (activity && !Number.isNaN(Date.parse(activity))) {
    return new Date(activity).toISOString();
  }
  const isoDate = String(lead.updatedDate || "").slice(0, 10);
  if (isoDate) {
    return `${isoDate}T00:00:00`;
  }
  return leadCreatedStamp(lead);
}

function SourceBadge({ source }: { source: Lead["source"] }) {
  const styles: Record<string, string> = {
    Facebook: "border-blue-100 bg-blue-50 text-blue-700",
    Instagram: "border-pink-100 bg-pink-50 text-pink-700",
    Google: "border-slate-200 bg-white text-slate-700",
    "Site Web": "border-slate-200 bg-slate-50 text-slate-700",
    Organique: "border-emerald-100 bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-xs font-semibold",
        styles[source] ?? "border-slate-200 bg-slate-50 text-slate-700",
      )}
    >
      <SourceIcon source={source} />
      {source}
    </span>
  );
}

function SourceIcon({ source }: { source: Lead["source"] }) {
  if (source === "Facebook") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded bg-[#1877F2] text-[11px] font-bold text-white">
        f
      </span>
    );
  }

  if (source === "Instagram") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5]">
        <span className="h-2 w-2 rounded-full border border-white" />
      </span>
    );
  }

  if (source === "Google") {
    return (
      <span className="text-sm font-bold">
        <span className="text-blue-600">G</span>
      </span>
    );
  }

  if (source === "Organique") {
    return <Globe className="h-4 w-4 text-emerald-600" />;
  }

  return <Globe className="h-4 w-4 text-slate-500" />;
}

function getLatestLeadComment(lead: Lead) {
  const fromLog = lead.activityLog.find(
    (activity) => activity.type === "comment" && activity.text.trim()
  );

  if (fromLog) {
    return fromLog;
  }

  const latestComment = lead.latestComment?.trim();

  if (!latestComment) {
    return undefined;
  }

  return {
    id: `${lead.id}-latest-comment`,
    author: "Équipe",
    date: lead.createdAt,
    text: latestComment,
    type: "comment" as const,
  };
}

