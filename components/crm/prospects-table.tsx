import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  inactiveLeadStatuses,
  leadStatusClasses,
  leadStatuses,
} from "@/lib/lead-statuses";
import { cn } from "@/lib/utils";
import { Lead, LeadStatus } from "@/types/lead";
import { Globe } from "lucide-react";

interface ProspectsTableProps {
  leads: Lead[];
  selectedLead: Lead;
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
  selectedLead,
  onSelectLead,
  onStatusChange,
  onCommentAdd,
  onCommentDelete,
  onDealAmountChange,
  onReminderDateChange,
  onCommercialChange,
}: ProspectsTableProps) {
  const sortedLeads = leads
    .map((lead, index) => ({ lead, index }))
    .sort((current, next) => {
      const currentInactive = inactiveLeadStatuses.includes(
        current.lead.status
      );
      const nextInactive = inactiveLeadStatuses.includes(next.lead.status);
      const currentReminderDue = isReminderDue(current.lead.reminderDate);
      const nextReminderDue = isReminderDue(next.lead.reminderDate);

      if (currentInactive && !nextInactive) {
        return 1;
      }

      if (!currentInactive && nextInactive) {
        return -1;
      }

      if (currentReminderDue && !nextReminderDue) {
        return -1;
      }

      if (!currentReminderDue && nextReminderDue) {
        return 1;
      }

      return current.index - next.index;
    })
    .map(({ lead }) => lead);

  return (
    <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Table className="min-w-[1500px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox />
            </TableHead>

            <TableHead>Prospect</TableHead>
            <TableHead>Campagne</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Rappel</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Commercial</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Commentaire</TableHead>
            <TableHead>Montant cure</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {sortedLeads.map((lead) => {
            const latestComment = lead.activityLog.find(
              (activity) => activity.type === "comment"
            );

            return (
            <TableRow
              key={lead.id}
              onClick={() => onSelectLead(lead)}
              className={cn(
                "h-20 cursor-pointer transition-all hover:bg-slate-50",
                inactiveLeadStatuses.includes(lead.status) &&
                  "bg-red-50/50 hover:bg-red-50",
                isReminderDue(lead.reminderDate) &&
                  !inactiveLeadStatuses.includes(lead.status) &&
                  "bg-amber-50 hover:bg-amber-50",
                selectedLead.id === lead.id &&
                  "border-l-4 border-l-blue-600 bg-blue-50 hover:bg-blue-50"
              )}
            >
              <TableCell>
                <Checkbox />
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-4">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback className="bg-blue-100 font-semibold text-blue-700">
                      {lead.firstName[0]}
                      {lead.lastName[0]}
                    </AvatarFallback>
                  </Avatar>

                  <div>
                    <p className="font-semibold">
                      {lead.firstName} {lead.lastName}
                    </p>

                    <p className="text-sm text-slate-500">{lead.phone}</p>
                  </div>
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
                  value={lead.reminderDate ?? ""}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    onReminderDateChange(lead.id, event.target.value)
                  }
                  className={cn(
                    "h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
                    isReminderDue(lead.reminderDate) &&
                      "border-amber-200 bg-amber-100 text-amber-800"
                  )}
                />
              </TableCell>

              <TableCell>
                <span className="text-sm font-medium">{lead.nextAction}</span>
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
                    "h-7 rounded-full border-0 px-3 text-xs font-semibold outline-none ring-1 transition-colors",
                    "focus:ring-2 focus:ring-blue-400",
                    leadStatusClasses[lead.status]
                  )}
                >
                  {leadStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </TableCell>

              <TableCell>
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
                  className="line-clamp-2 min-h-14 w-72 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-5 text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
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
                    className="h-8 w-24 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <span className="text-sm text-slate-400">€</span>
                </div>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SourceBadge({ source }: { source: Lead["source"] }) {
  const styles: Record<Lead["source"], string> = {
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
        styles[source]
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

function isReminderDue(date?: string) {
  if (!date) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);

  return date <= today;
}
