"use client";

import { CalendarCheck, MessageCircle, Search, Send } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  inboxTag,
  inboxTagLabel,
  type SeyaAgentSettings,
  type SeyaConversation,
  type SeyaInboxTag,
} from "@/lib/seya-settings";
import type { Lead } from "@/types/lead";

const tagStyles: Record<SeyaInboxTag, string> = {
  court: "bg-sky-100 text-sky-800",
  chaud: "bg-orange-100 text-orange-800",
  humain: "bg-amber-200 text-amber-950",
  rdv: "bg-violet-100 text-violet-800",
  sans_reponse: "bg-slate-200 text-slate-600",
  ferme: "bg-red-600 text-white",
};

const statusStyles: Record<SeyaConversation["status"], string> = {
  "À envoyer": "bg-amber-100 text-amber-800",
  "En cours": "bg-blue-100 text-blue-700",
  Qualifié: "bg-violet-100 text-violet-700",
  "RDV proposé": "bg-cyan-100 text-cyan-800",
  "RDV pris": "bg-violet-100 text-violet-700",
  "RDV confirmé": "bg-violet-500 text-white",
  Chaud: "bg-orange-100 text-orange-800",
  "À recontacter": "bg-amber-200 text-amber-900",
  "Pas intéressé": "bg-red-600 text-white",
  Terminé: "bg-slate-100 text-slate-600",
};

type FilterId = "toutes" | "agir" | "attente" | "fermees";

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const delta = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(delta) || delta < 0) return "";
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

function lastPreview(conversation: SeyaConversation) {
  const last = conversation.messages[conversation.messages.length - 1];
  return last?.text?.replace(/\s+/g, " ").trim() || "Pas encore de message";
}

function factualSummary(conversation: SeyaConversation) {
  return (
    [
      conversation.offerLabel || conversation.treatment || "",
      conversation.qualification.zone
        ? `zone ${conversation.qualification.zone}`
        : "",
      conversation.qualification.availability ||
        conversation.qualification.delay ||
        "",
      conversation.status === "À recontacter"
        ? "Une conseillère doit recontacter."
        : "",
      conversation.status === "Pas intéressé"
        ? "A demandé l’arrêt des messages."
        : "",
      conversation.bookedSlot ? `RDV ${conversation.bookedSlot.label}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "Qualification en cours."
  );
}

const ConversationRow = memo(function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: SeyaConversation;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const tag = inboxTag(conversation);
  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={`w-full border-b border-slate-100 px-4 py-3 text-left transition-colors ${
        selected
          ? "bg-violet-50"
          : tag === "ferme"
            ? "bg-red-50/80"
            : "bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold text-slate-950">
          {conversation.firstName} {conversation.lastName}
        </p>
        <span className="shrink-0 text-[11px] font-medium text-slate-400">
          {conversation.messages.length}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${tagStyles[tag]}`}
        >
          {inboxTagLabel(tag)}
        </span>
        <span className="text-[11px] font-medium text-slate-400">
          {timeAgo(conversation.updatedAt)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-500">
        {lastPreview(conversation)}
      </p>
    </button>
  );
});

export function SeyaInbox({
  inbox,
  selected,
  leads,
  settings,
  reply,
  feedback,
  busy = false,
  onSelect,
  onReplyChange,
  onSendReply,
  onSendWhatsApp,
  onPickSlot,
}: {
  inbox: SeyaConversation[];
  selected: SeyaConversation | null;
  leads: Lead[];
  settings: SeyaAgentSettings;
  reply: string;
  feedback: string;
  busy?: boolean;
  onSelect: (id: string) => void;
  onReplyChange: (value: string) => void;
  onSendReply: () => void;
  onSendWhatsApp: () => void;
  onPickSlot: (index: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("toutes");
  const threadRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inbox.filter((conversation) => {
      const tag = inboxTag(conversation);
      if (filter === "agir" && tag !== "court" && tag !== "humain" && tag !== "chaud") {
        return false;
      }
      if (filter === "attente" && tag !== "sans_reponse") {
        return false;
      }
      if (filter === "fermees" && tag !== "ferme") {
        return false;
      }
      if (!needle) {
        return true;
      }
      const hay = `${conversation.firstName} ${conversation.lastName} ${conversation.phone} ${conversation.treatment} ${conversation.offerLabel || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [filter, inbox, query]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [selected?.id, selected?.messages.length]);

  const lead = selected
    ? leads.find((item) => item.id === selected.leadId)
    : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-h-[calc(100vh-180px)] xl:grid-cols-[300px_minmax(0,1fr)_300px]">
        <aside className="flex flex-col border-b border-slate-200 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Conversations</h2>
              <span className="text-xs font-medium text-slate-400">
                {visible.length}
              </span>
            </div>
            <label className="relative mt-3 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un prospect…"
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-medium outline-none focus:border-violet-500"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  ["toutes", "Toutes"],
                  ["agir", "À traiter"],
                  ["attente", "Sans réponse"],
                  ["fermees", "Fermées"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    filter === id
                      ? "bg-slate-950 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-4 py-8 text-sm font-medium text-slate-500">
                Aucune conversation dans ce filtre.
              </p>
            ) : (
              visible.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  selected={selected?.id === conversation.id}
                  onSelect={onSelect}
                />
              ))
            )}
          </div>
        </aside>

        <div className="flex min-h-[520px] flex-col bg-[#f7f8fa]">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">
                      {selected.firstName} {selected.lastName}
                    </h2>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${statusStyles[selected.status]}`}
                    >
                      {selected.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {selected.phone || "Pas de téléphone"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSendWhatsApp}
                  className="inline-flex items-center gap-2 rounded-2xl bg-violet-500 px-3.5 py-2 text-sm font-semibold text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </button>
              </div>
              {feedback ? (
                <p className="bg-amber-50 px-5 py-2 text-sm font-medium text-amber-800">
                  {feedback}
                </p>
              ) : null}
              <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {selected.messages.map((message) => {
                  const fromLead = message.author === "lead";
                  return (
                    <div
                      key={message.id}
                      className={`flex ${fromLead ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm font-medium leading-6 shadow-sm ${
                          fromLead
                            ? "bg-white text-slate-800"
                            : "bg-violet-500 text-white"
                        }`}
                      >
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                          {fromLead ? "WhatsApp" : "Seya"}
                        </p>
                        <p className="whitespace-pre-wrap">{message.text}</p>
                        <p className="mt-2 text-[10px] opacity-70">
                          {timeAgo(message.at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {selected.proposedSlots.length > 0 && settings.bookAppointment ? (
                <div className="grid gap-2 border-t border-slate-200 bg-white px-5 py-3 md:grid-cols-3">
                  {selected.proposedSlots.map((slot, index) => (
                    <button
                      key={`${slot.date}-${slot.time}`}
                      type="button"
                      onClick={() => onPickSlot(String(index + 1))}
                      className="rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-left text-sm font-semibold text-cyan-800"
                    >
                      <CalendarCheck className="mb-1 h-4 w-4" />
                      {slot.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="border-t border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3">
                  <input
                    value={reply}
                    onChange={(event) => onReplyChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        onSendReply();
                      }
                    }}
                    placeholder={
                      busy ? "Seya réfléchit…" : "Écrire une réponse au prospect…"
                    }
                    disabled={busy}
                    className="h-12 flex-1 bg-transparent text-sm font-medium outline-none disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={onSendReply}
                    disabled={busy}
                    className="grid h-9 w-9 place-items-center rounded-full bg-violet-500 text-white disabled:opacity-50"
                    aria-label="Envoyer"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="m-auto px-6 text-sm font-medium text-slate-500">
              Choisis une conversation à gauche.
            </p>
          )}
        </div>

        <aside className="bg-white p-4">
          {selected ? (
            <div className="grid gap-3">
              <section className="rounded-2xl border border-slate-200 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Infos prospect
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-medium text-slate-400">Nom</dt>
                    <dd className="font-semibold">
                      {selected.firstName} {selected.lastName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-slate-400">Téléphone</dt>
                    <dd className="font-medium">{selected.phone || "—"}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[11px] font-medium text-slate-400">Offre</dt>
                    <dd className="font-medium">
                      {selected.offerLabel || selected.treatment || "—"}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[11px] font-medium text-slate-400">Campagne</dt>
                    <dd className="font-medium">
                      {selected.campaign || lead?.campaign || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-slate-400">IA</dt>
                    <dd className="font-medium">
                      {settings.whatsappAgentEnabled ? "On" : "Off"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium text-slate-400">Statut</dt>
                    <dd className="font-medium">{selected.status}</dd>
                  </div>
                </dl>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Rendez-vous
                </p>
                <p className="mt-2 text-sm font-medium text-slate-700">
                  {selected.bookedSlot?.label ||
                    (selected.status === "À recontacter"
                      ? "À poser par une conseillère"
                      : "Aucun RDV")}
                </p>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Résumé
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-700">
                  {factualSummary(selected)}
                </p>
              </section>
            </div>
          ) : (
            <p className="text-sm font-medium text-slate-500">
              La fiche s’affiche quand une conversation est ouverte.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
