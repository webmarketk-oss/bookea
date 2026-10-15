"use client";

import { useEffect, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import {
  DEPOSIT_REMINDER_INDEXES,
  DEPOSIT_REMINDER_LABELS,
  toDatetimeLocalValue,
} from "@/lib/crm-deposit";
import { isOpenReminderDue, toDateOnlyIso } from "@/lib/crm-stats";
import { leadOfferLabel } from "@/lib/lead-offer";
import {
  formatWhatsAppDate,
  type LeadWhatsAppSummary,
} from "@/lib/lead-whatsapp";
import {
  isInactiveLeadStatus,
  leadStatusClassName,
  leadStatusSelectOptions,
} from "@/lib/lead-statuses";
import { cn } from "@/lib/utils";
import { Lead, LeadStatus } from "@/types/lead";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Globe,
  PanelRightOpen,
} from "lucide-react";

interface ProspectsTableProps {
  leads: Lead[];
  sortBy?: "created" | "updated";
  selectedLead: Lead;
  isLeadDetailsOpen?: boolean;
  onSelectLead: (lead: Lead) => void;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
  onCommentAdd: (leadId: string, text: string) => void | Promise<boolean>;
  onCommentDelete: (leadId: string, activityId: string) => void | Promise<boolean>;
  onDealAmountChange: (leadId: string, amount: number) => void;
  onReminderDateChange: (leadId: string, date: string) => void;
  onCommercialChange: (leadId: string, commercial: string) => void;
  commercialOptions?: string[];
  whatsApp?: ProspectsWhatsApp;
  /** Colonnes Relance acompte 1–4 (onglet Gestion des acomptes). */
  showDepositReminders?: boolean;
  onDepositReminderChange?: (
    leadId: string,
    index: 1 | 2 | 3 | 4,
    datetimeLocal: string,
  ) => void;
}

export type ProspectsWhatsApp = {
  state: "loading" | "ready" | "error";
  byLead: Map<string, LeadWhatsAppSummary>;
};

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
  commercialOptions = [],
  whatsApp,
  showDepositReminders = false,
  onDepositReminderChange,
}: ProspectsTableProps) {
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");
  const pressStartedOnControlRef = useRef(false);

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
            <TableHead className="w-[9rem] min-w-[9rem] max-w-[9rem]">Soin / offre</TableHead>
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
            {showDepositReminders
              ? DEPOSIT_REMINDER_INDEXES.map((index) => (
                  <TableHead
                    key={`deposit-head-${index}`}
                    className="w-[11rem] min-w-[11rem]"
                  >
                    {DEPOSIT_REMINDER_LABELS[index]}
                  </TableHead>
                ))
              : null}
            <TableHead className="w-[9.25rem] min-w-[9.25rem]">Statut</TableHead>
            {whatsApp ? (
              <TableHead className="w-[15rem] min-w-[15rem]">Dernier WhatsApp</TableHead>
            ) : null}
            <TableHead>Commercial</TableHead>
            <TableHead>Montant</TableHead>
            <TableHead>Source</TableHead>
            <TableHead
              className={cn(
                "sticky right-0 z-20 border-l border-slate-200 bg-white shadow-[-8px_0_12px_rgba(15,23,42,0.06)]",
                commentsOpen ? "min-w-[14rem] w-[14rem]" : "w-10 min-w-10"
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
            const offer = leadOfferLabel(lead);

            return (
            <TableRow
              key={lead.id}
              data-lead-id={lead.id}
              data-lead-row="true"
              onPointerDown={(event) => {
                pressStartedOnControlRef.current = isOnRowControl(event.target);
              }}
              onDoubleClick={(event) => {
                // Une sélection de texte commencée dans un champ se termine parfois hors du champ.
                if (pressStartedOnControlRef.current || isOnRowControl(event.target)) {
                  pressStartedOnControlRef.current = false;
                  return;
                }
                window.getSelection()?.removeAllRanges();
                onSelectLead(lead);
              }}
              className={cn(
                "min-h-20 transition-all hover:bg-slate-50",
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
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {lead.firstName} {lead.lastName}
                    </p>
                    <p className="text-sm text-slate-500">{lead.phone}</p>
                    {lead.email ? (
                      <p className="truncate text-sm text-slate-500">{lead.email}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label={`Ouvrir la fiche de ${lead.firstName} ${lead.lastName}`.trim()}
                    aria-expanded={isLeadDetailsOpen && selectedLead.id === lead.id}
                    title="Ouvrir la fiche"
                    onClick={() => onSelectLead(lead)}
                    className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <PanelRightOpen className="h-4 w-4" />
                  </button>
                </div>
              </TableCell>

              <TableCell className="w-[9rem] min-w-[9rem] max-w-[9rem] overflow-hidden">
                <span
                  title={lead.treatment || lead.campaign || undefined}
                  className="block max-w-full truncate rounded-full border border-blue-300/80 bg-blue-100/50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700"
                >
                  {lead.treatment || lead.campaign || "—"}
                </span>
                {offer ? (
                  <span
                    title={offer}
                    className="mt-1 block max-w-full truncate px-1 text-[11px] font-semibold text-slate-600"
                  >
                    {offer}
                  </span>
                ) : null}
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
                    "h-8 w-[8.5rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
                    isOpenReminderDue(lead) &&
                      "border-amber-200 bg-amber-100 text-amber-800"
                  )}
                />
              </TableCell>

              {showDepositReminders
                ? DEPOSIT_REMINDER_INDEXES.map((index) => (
                    <TableCell key={`${lead.id}-deposit-${index}`}>
                      <input
                        type="datetime-local"
                        aria-label={DEPOSIT_REMINDER_LABELS[index]}
                        value={toDatetimeLocalValue(
                          lead.depositReminders?.[index],
                        )}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          onDepositReminderChange?.(
                            lead.id,
                            index,
                            event.target.value,
                          )
                        }
                        className="h-8 w-[10.5rem] shrink-0 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </TableCell>
                  ))
                : null}

              <TableCell>
                <AdaptiveSelect
                  ariaLabel="Statut"
                  value={lead.status}
                  options={leadStatusSelectOptions(lead.status)}
                  onChange={(status) =>
                    onStatusChange(lead.id, status as LeadStatus)
                  }
                  className={cn(
                    "h-7 w-full min-w-[8.75rem] max-w-[9.25rem] rounded-full border-0 px-2.5 text-xs font-semibold outline-none ring-1 transition-colors",
                    "focus:ring-2 focus:ring-blue-400",
                    leadStatusClassName(lead.status)
                  )}
                />
              </TableCell>

              {whatsApp ? (
                <TableCell className="w-[15rem] min-w-[15rem] max-w-[15rem] whitespace-normal">
                  <WhatsAppCell
                    state={whatsApp.state}
                    summary={whatsApp.byLead.get(lead.id)}
                  />
                </TableCell>
              ) : null}

              <TableCell>
                <AdaptiveSelect
                  ariaLabel="Commercial"
                  value={lead.commercial}
                  options={
                    commercialOptions.includes(lead.commercial)
                      ? commercialOptions
                      : [lead.commercial, ...commercialOptions].filter(Boolean)
                  }
                  onChange={(commercial) =>
                    onCommercialChange(lead.id, commercial)
                  }
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                    className="h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <span className="text-sm text-slate-400">€</span>
                </div>
              </TableCell>

              <TableCell>
                <SourceBadge source={lead.source} />
              </TableCell>

              <TableCell
                data-comment-zone="true"
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  "sticky right-0 z-10 whitespace-normal border-l border-slate-200 bg-white shadow-[-8px_0_12px_rgba(15,23,42,0.06)]",
                  isInactive && "bg-slate-50",
                  isOpenReminderDue(lead) &&
                    !isInactive &&
                    "bg-amber-50",
                  selectedLead.id === lead.id && "bg-blue-50",
                  commentsOpen ? "min-w-[14rem] w-[14rem]" : "w-10 min-w-10"
                )}
              >
                {commentsOpen ? (
                  <QuickComment
                    key={`${lead.id}-comment`}
                    saved={latestComment?.text ?? ""}
                    onSave={async (value) => {
                      if (!value && latestComment) {
                        return (await onCommentDelete(lead.id, latestComment.id)) !== false;
                      }

                      if (value && value !== latestComment?.text) {
                        return (await onCommentAdd(lead.id, value)) !== false;
                      }

                      return true;
                    }}
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

function WhatsAppCell({
  state,
  summary,
}: {
  state: ProspectsWhatsApp["state"];
  summary?: LeadWhatsAppSummary;
}) {
  if (state === "loading" && !summary) {
    return <p className="text-xs font-semibold text-slate-400">Chargement…</p>;
  }
  if (state === "error" && !summary) {
    return <p className="text-xs font-semibold text-rose-600">Messages indisponibles</p>;
  }

  const lastSent = summary?.lastSent ?? null;
  const lastAttempt = summary?.lastAttempt ?? null;
  const problem =
    lastAttempt && lastAttempt.delivery !== "sent" ? lastAttempt : null;

  if (!lastSent && !problem) {
    return <p className="text-xs font-semibold text-slate-400">Aucun message envoyé</p>;
  }

  return (
    <div className="space-y-1 text-xs">
      {lastSent ? (
        <div title={lastSent.text}>
          <p className="font-bold text-emerald-700">
            Envoyé par {lastSent.from === "seya" ? "Seya" : "l'équipe"} ·{" "}
            {formatWhatsAppDate(lastSent.at)}
          </p>
          <p className="line-clamp-2 font-medium text-slate-600">{lastSent.text}</p>
        </div>
      ) : null}
      {problem ? (
        <p
          title={problem.text}
          className={cn(
            "font-bold",
            problem.delivery === "failed" ? "text-rose-600" : "text-amber-600",
          )}
        >
          {problem.delivery === "failed" ? "Échec d'envoi" : "En attente d'envoi"} ·{" "}
          {formatWhatsAppDate(problem.at)}
        </p>
      ) : null}
    </div>
  );
}

const ROW_CONTROL_SELECTOR = [
  "[data-comment-zone]",
  "input",
  "select",
  "textarea",
  "button",
  "a",
  "label",
  "[role='button']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='option']",
  "[role='checkbox']",
  "[contenteditable='true']",
].join(",");

function isOnRowControl(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(ROW_CONTROL_SELECTOR));
}

function QuickComment({
  saved,
  onSave,
}: {
  saved: string;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <div>
      <textarea
        value={draft ?? saved}
        placeholder="Ajouter un commentaire..."
        rows={2}
        onClick={(event) => event.stopPropagation()}
        onFocus={() => setDraft((current) => current ?? saved)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={async (event) => {
          const value = event.currentTarget.value.trim();
          if (value === saved.trim()) {
            setDraft(null);
            setFailed(false);
            return;
          }
          // Le texte reste affiché tant que la base n’a pas confirmé l’enregistrement.
          const ok = await onSave(value);
          setFailed(!ok);
          if (ok) {
            setDraft((current) => (current?.trim() === value ? null : current));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className={cn(
          "min-h-14 min-w-0 w-full max-h-32 resize-y overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-5 text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
          failed && "border-rose-400 bg-rose-50",
        )}
      />
      {failed ? (
        <p className="mt-1 text-xs font-bold text-rose-600">
          Non enregistré. Cliquez dans le champ puis à côté pour réessayer.
        </p>
      ) : null}
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
  const key = sourceKey(source);
  const styles: Record<string, string> = {
    facebook: "border-blue-100 bg-blue-50 text-blue-700",
    instagram: "border-pink-100 bg-pink-50 text-pink-700",
    google: "border-slate-200 bg-white text-slate-700",
    "site web": "border-slate-200 bg-slate-50 text-slate-700",
    organique: "border-emerald-100 bg-emerald-50 text-emerald-700",
    "systeme.io": "border-amber-300/80 bg-amber-100/50 text-amber-800",
    systeme: "border-amber-300/80 bg-amber-100/50 text-amber-800",
    landing: "border-violet-100 bg-violet-50 text-violet-700",
  };

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-xs font-semibold",
        styles[key] ?? "border-slate-200 bg-slate-50 text-slate-700",
      )}
    >
      <SourceIcon source={source} />
      {source}
    </span>
  );
}

function SourceIcon({ source }: { source: Lead["source"] }) {
  const key = sourceKey(source);

  if (key === "facebook") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded bg-[#1877F2] text-[11px] font-bold text-white">
        f
      </span>
    );
  }

  if (key === "instagram") {
    return (
      <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5]">
        <span className="h-2 w-2 rounded-full border border-white" />
      </span>
    );
  }

  if (key === "google") {
    return (
      <span className="text-sm font-bold">
        <span className="text-blue-600">G</span>
      </span>
    );
  }

  if (key === "organique") {
    return <Globe className="h-4 w-4 text-emerald-600" />;
  }

  if (key === "systeme.io" || key === "systeme") {
    return <Globe className="h-4 w-4 text-amber-700" />;
  }

  return <Globe className="h-4 w-4 text-slate-500" />;
}

function sourceKey(source: Lead["source"]) {
  return String(source || "")
    .trim()
    .toLowerCase();
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

