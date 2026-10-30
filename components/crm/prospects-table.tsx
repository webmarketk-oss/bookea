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
import { AdaptiveDateInput } from "@/components/ui/adaptive-date-input";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import {
  DEPOSIT_REMINDER_INDEXES,
  DEPOSIT_REMINDER_LABELS,
  toDatetimeLocalValue,
} from "@/lib/crm-deposit";
import { isOpenReminderDue, toDateOnlyIso } from "@/lib/crm-stats";
import { displayVisitDate } from "@/lib/crm-rdv";
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
    comment: string,
  ) => void;
  showVisitDate?: boolean;
  onVisitDateChange?: (leadId: string, date: string) => void;
  /** Change quand la recherche, les filtres ou l'onglet changent : on revient alors à la page 1. */
  resetKey?: string;
}

const PAGE_SIZES = [20, 50, 100] as const;
const PAGE_SIZE_STORAGE_KEY = "bookea-crm-page-size";

function readPageSize() {
  if (typeof window === "undefined") {
    return PAGE_SIZES[0];
  }
  const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
  return PAGE_SIZES.find((size) => size === stored) ?? PAGE_SIZES[0];
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
  showVisitDate = false,
  onVisitDateChange,
  resetKey = "",
}: ProspectsTableProps) {
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const pressStartedOnControlRef = useRef(false);

  useEffect(() => {
    setDateSort("desc");
  }, [sortBy]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageSize(readPageSize());
  }, []);

  const sortedLeads = leads
    .map((lead, index) => ({ lead, index }))
    .sort((current, next) => {
      const currentDue = isOpenReminderDue(current.lead) ? 0 : 1;
      const nextDue = isOpenReminderDue(next.lead) ? 0 : 1;
      if (currentDue !== nextDue) {
        return currentDue - nextDue;
      }

      if (currentDue === 0) {
        const currentReminder = toDateOnlyIso(current.lead.reminderDate) ?? "";
        const nextReminder = toDateOnlyIso(next.lead.reminderDate) ?? "";
        if (currentReminder !== nextReminder) {
          return currentReminder.localeCompare(nextReminder);
        }
      }

      const stamp = sortBy === "updated" ? leadUpdatedStamp : leadCreatedStamp;
      const dateDiff = stamp(current.lead).localeCompare(stamp(next.lead));
      if (dateDiff !== 0) {
        return dateSort === "desc" ? -dateDiff : dateDiff;
      }
      return current.index - next.index;
    })
    .map(({ lead }) => lead);

  const pageKey = `${resetKey}|${sortBy}|${dateSort}|${pageSize}`;
  const [pageState, setPageState] = useState({ key: pageKey, page: 0 });
  const pageCount = Math.max(1, Math.ceil(sortedLeads.length / pageSize));
  const page = Math.min(pageState.key === pageKey ? pageState.page : 0, pageCount - 1);
  const pageStart = page * pageSize;
  const visibleLeads = sortedLeads.slice(pageStart, pageStart + pageSize);
  const goToPage = (next: number) =>
    setPageState({ key: pageKey, page: Math.max(0, Math.min(next, pageCount - 1)) });

  // Fiche ouverte depuis un lien, la recherche ou WhatsApp : afficher la page où se trouve ce prospect.
  const selectedIndex = isLeadDetailsOpen
    ? sortedLeads.findIndex((lead) => lead.id === selectedLead?.id)
    : -1;
  const selectedPage = selectedIndex >= 0 ? Math.floor(selectedIndex / pageSize) : -1;
  useEffect(() => {
    if (selectedPage >= 0 && selectedPage !== page) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageState({ key: pageKey, page: selectedPage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead?.id, isLeadDetailsOpen]);

  return (
    <>
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
            {showDepositReminders ? (
              <TableHead className="w-[9.25rem] min-w-[9.25rem]">Statut</TableHead>
            ) : null}
            {showDepositReminders
              ? DEPOSIT_REMINDER_INDEXES.map((index) => (
                  <TableHead
                    key={`deposit-head-${index}`}
                    className="w-[12.5rem] min-w-[12.5rem]"
                  >
                    {DEPOSIT_REMINDER_LABELS[index]}
                  </TableHead>
                ))
              : null}
            {showDepositReminders ? null : (
              <TableHead className="w-[9.25rem] min-w-[9.25rem]">Statut</TableHead>
            )}
            {showVisitDate ? (
              <TableHead className="w-[9.5rem] min-w-[9.5rem]">Date du RDV</TableHead>
            ) : null}
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
          {visibleLeads.map((lead) => {
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
                <AdaptiveDateInput
                  ariaLabel="Rappel"
                  value={toDateOnlyIso(lead.reminderDate) ?? ""}
                  onChange={(date) => onReminderDateChange(lead.id, date)}
                  className={cn(
                    "h-8 w-[8.5rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
                    isOpenReminderDue(lead) &&
                      "border-amber-200 bg-amber-100 text-amber-800"
                  )}
                />
              </TableCell>

              {showDepositReminders ? (
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
              ) : null}

              {showDepositReminders
                ? DEPOSIT_REMINDER_INDEXES.map((index) => (
                    <TableCell key={`${lead.id}-deposit-${index}`}>
                      <DepositReminderCell
                        label={DEPOSIT_REMINDER_LABELS[index]}
                        datetime={toDatetimeLocalValue(
                          lead.depositReminders?.[index],
                        )}
                        comment={lead.depositReminderNotes?.[index] || ""}
                        onCommit={(datetimeLocal, comment) =>
                          onDepositReminderChange?.(
                            lead.id,
                            index,
                            datetimeLocal,
                            comment,
                          )
                        }
                      />
                    </TableCell>
                  ))
                : null}

              {showDepositReminders ? null : (
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
              )}

              {showVisitDate ? (
                <TableCell>
                  <AdaptiveDateInput
                    ariaLabel="Date du RDV"
                    value={displayVisitDate(lead)}
                    onChange={(date) => onVisitDateChange?.(lead.id, date)}
                    className="h-8 w-[8.5rem] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </TableCell>
              ) : null}

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
    {sortedLeads.length > PAGE_SIZES[0] ? (
      <TablePager
        page={page}
        pageCount={pageCount}
        pageSize={pageSize}
        total={sortedLeads.length}
        onPage={goToPage}
        onPageSize={(size) => {
          setPageSize(size);
          window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
        }}
      />
    ) : null}
    </>
  );
}

function pagerPages(page: number, pageCount: number) {
  const pages = new Set([0, pageCount - 1, page - 1, page, page + 1]);
  return [...pages].filter((item) => item >= 0 && item < pageCount).sort((a, b) => a - b);
}

function TablePager({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  const pages = pagerPages(page, pageCount);
  const buttonClass =
    "h-8 min-w-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav
      aria-label="Pages des prospects"
      className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-xs font-semibold text-slate-500"
    >
      <span>
        {first}–{last} sur {total} prospects
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={buttonClass}
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
          aria-label="Page précédente"
        >
          <ChevronLeft className="mx-auto h-4 w-4" />
        </button>
        {pages.map((item, index) => (
          <span key={item} className="flex items-center gap-1">
            {index > 0 && item - pages[index - 1] > 1 ? (
              <span className="px-1 text-slate-400">…</span>
            ) : null}
            <button
              type="button"
              className={cn(
                buttonClass,
                item === page && "border-violet-600 bg-violet-600 text-white hover:bg-violet-600",
              )}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPage(item)}
            >
              {item + 1}
            </button>
          </span>
        ))}
        <button
          type="button"
          className={buttonClass}
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          aria-label="Page suivante"
        >
          <ChevronRight className="mx-auto h-4 w-4" />
        </button>
      </div>
      <label className="flex items-center gap-2">
        Par page
        <select
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </nav>
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

function DepositReminderCell({
  label,
  datetime,
  comment,
  onCommit,
}: {
  label: string;
  datetime: string;
  comment: string;
  onCommit: (datetimeLocal: string, comment: string) => void;
}) {
  const [draft, setDraft] = useState(comment);
  const draftRef = useRef(comment);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      draftRef.current = comment;
      setDraft(comment);
    }
  }, [comment, focused]);

  function commit(nextDatetime: string, nextComment: string) {
    if (nextDatetime === datetime && nextComment.trim() === comment.trim()) {
      return;
    }
    onCommit(nextDatetime, nextComment);
  }

  return (
    <div className="flex w-[11.5rem] flex-col gap-1">
      <AdaptiveDateInput
        withTime
        ariaLabel={label}
        value={datetime}
        onChange={(value) => commit(value, draftRef.current)}
        className="h-8 w-full shrink-0 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
      <input
        type="text"
        aria-label={`Commentaire ${label}`}
        placeholder="Commentaire"
        maxLength={500}
        value={draft}
        onClick={(event) => event.stopPropagation()}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          draftRef.current = event.target.value;
          setDraft(event.target.value);
        }}
        onBlur={() => {
          setFocused(false);
          commit(datetime, draftRef.current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
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

