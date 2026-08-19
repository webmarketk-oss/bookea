"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { leadStatusClasses } from "@/lib/lead-statuses";
import {
  defaultCenterDepositLinks,
  readCenterSettings,
  type CenterDepositLinkSetting,
} from "@/lib/center-settings";
import { Lead } from "@/types/lead";
import {
  Calendar,
  FileText,
  Mail,
  MessageCircle,
  MapPin,
  MoreVertical,
  Pencil,
  Phone,
  Sparkles,
  Trash2,
} from "lucide-react";

type LeadDetailsTab = "information" | "history" | "comments" | "ai";

interface LeadDetailsProps {
  lead: Lead;
  onAddActivity: (leadId: string, text: string) => void;
  onDeleteActivity: (leadId: string, activityId: string) => void;
  onClose: () => void;
}

export default function LeadDetails({
  lead,
  onAddActivity,
  onDeleteActivity,
  onClose,
}: LeadDetailsProps) {
  const fullName = `${lead.firstName} ${lead.lastName}`;
  const [commentDraft, setCommentDraft] = useState("");
  const [activeTab, setActiveTab] = useState<LeadDetailsTab>("comments");
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [depositLinks, setDepositLinks] =
    useState<CenterDepositLinkSetting[]>(defaultCenterDepositLinks);
  const [selectedDepositLinkId, setSelectedDepositLinkId] = useState(
    String(defaultCenterDepositLinks[0]?.id ?? ""),
  );
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const refreshDepositLinks = () => {
      const settings = readCenterSettings();
      const nextLinks =
        settings?.depositLinks?.filter((link) => link.active) ??
        defaultCenterDepositLinks;

      setDepositLinks(nextLinks.length > 0 ? nextLinks : defaultCenterDepositLinks);
      setSelectedDepositLinkId((current) => {
        const hasCurrent = nextLinks.some((link) => String(link.id) === current);
        return hasCurrent ? current : String(nextLinks[0]?.id ?? "");
      });
    };

    refreshDepositLinks();
    window.addEventListener("bookea-center-settings-updated", refreshDepositLinks);
    return () =>
      window.removeEventListener(
        "bookea-center-settings-updated",
        refreshDepositLinks,
      );
  }, []);

  const selectedDepositLink =
    depositLinks.find((link) => String(link.id) === selectedDepositLinkId) ??
    depositLinks[0] ??
    defaultCenterDepositLinks[0];

  function addComment() {
    const text = commentDraft.trim();

    if (!text) {
      return;
    }

    onAddActivity(lead.id, text);
    setCommentDraft("");
  }

  function openRdvInAgenda() {
    const params = new URLSearchParams({
      newRdv: "1",
      name: fullName,
      phone: lead.phone,
      treatment: lead.treatment,
      source: "Prospect",
    });

    window.open(`/dashboard/agenda?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  function openNote() {
    setActiveTab("comments");
    setIsMoreOpen(false);
    window.setTimeout(() => commentTextareaRef.current?.focus(), 0);
  }

  function sendDepositSms() {
    if (!selectedDepositLink) return;
    const message = `${selectedDepositLink.message} ${selectedDepositLink.url}`.trim();
    const phone = lead.phone.replace(/\s+/g, "");
    window.location.href = `sms:${phone}?&body=${encodeURIComponent(message)}`;
    onAddActivity(
      lead.id,
      `SMS acompte préparé : ${selectedDepositLink.name}.`,
    );
  }

  return (
    <Card className="h-fit overflow-hidden rounded-2xl border-slate-200 py-0 shadow-sm">
      <CardContent className="space-y-5 p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 text-xl font-bold leading-tight text-slate-950">
                {fullName}
              </h2>
              <Badge className={leadStatusClasses[lead.status]}>
                {lead.status}
              </Badge>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-400">
              Prospect depuis {lead.createdAt}
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Fermer la fiche"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </header>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <ActionButton
            label="Appeler"
            icon={<Phone className="h-4 w-4" />}
            className="border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100"
          />
          <ActionButton
            label="WhatsApp"
            icon={<MessageCircle className="h-4 w-4" />}
            className="border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          />
          <ActionButton
            label="RDV"
            icon={<Calendar className="h-4 w-4" />}
            className="border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100"
            onClick={openRdvInAgenda}
          />
          <ActionButton
            label="Note"
            icon={<Pencil className="h-4 w-4" />}
            className="border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100"
            onClick={openNote}
          />
          <div className="relative">
            <ActionButton
              label="Plus"
              icon={<MoreVertical className="h-4 w-4" />}
              className="w-full border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              onClick={() => setIsMoreOpen((value) => !value)}
            />
            {isMoreOpen && (
              <div className="absolute right-0 top-14 z-30 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                <MoreAction label="Informations" onClick={() => {
                  setActiveTab("information");
                  setIsMoreOpen(false);
                }} />
                <MoreAction label="Historique" onClick={() => {
                  setActiveTab("history");
                  setIsMoreOpen(false);
                }} />
                <MoreAction label="Commentaire" onClick={openNote} />
                <MoreAction label="IA Seya" onClick={() => {
                  setActiveTab("ai");
                  setIsMoreOpen(false);
                }} />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
          <div className="grid gap-2 min-[1500px]:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-[11px] font-black uppercase text-blue-700">
                SMS acompte
              </span>
              <select
                value={selectedDepositLinkId}
                onChange={(event) => setSelectedDepositLinkId(event.target.value)}
                className="h-10 w-full rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-slate-800 outline-none"
              >
                {depositLinks.map((link) => (
                  <option key={link.id} value={link.id}>
                    {link.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              onClick={sendDepositSms}
              className="self-end rounded-xl bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700"
            >
              Envoyer SMS
            </Button>
          </div>
          <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-blue-700">
            {selectedDepositLink?.message} {selectedDepositLink?.url}
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 min-[1700px]:grid-cols-4">
            <LeadTabButton
              active={activeTab === "information"}
              onClick={() => setActiveTab("information")}
            >
              Informations
            </LeadTabButton>
            <LeadTabButton
              active={activeTab === "history"}
              onClick={() => setActiveTab("history")}
            >
              Historique
            </LeadTabButton>
            <LeadTabButton
              active={activeTab === "comments"}
              onClick={() => setActiveTab("comments")}
            >
              Commentaires
            </LeadTabButton>
            <LeadTabButton
              active={activeTab === "ai"}
              onClick={() => setActiveTab("ai")}
            >
              IA
            </LeadTabButton>
          </div>

          {activeTab === "comments" && (
            <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <textarea
                ref={commentTextareaRef}
                placeholder="Ajouter un commentaire..."
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                className="min-h-24 w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2 text-slate-400">
                  <FileText className="h-4 w-4" />
                  <Pencil className="h-4 w-4" />
                </div>

                <Button
                  size="sm"
                  onClick={addComment}
                  disabled={commentDraft.trim().length === 0}
                  className="shrink-0"
                >
                  Ajouter
                </Button>
              </div>
            </div>

            {lead.activityLog.map((comment) => (
              <CommentCard
                key={comment.id}
                author={comment.author}
                date={comment.date}
                text={comment.text}
                highlight={comment.type === "system" || comment.type === "status"}
                onDelete={
                  comment.type === "comment"
                    ? () => onDeleteActivity(lead.id, comment.id)
                    : undefined
                }
              />
            ))}

            <CommentCard
              author="Seya"
              date="Suggestion"
              text="Relancer avec un message court, proposer un créneau cette semaine et rappeler l'acompte si le prospect confirme."
              highlight
            />
            </div>
          )}

          {activeTab === "information" && (
            <div className="space-y-3">
            <InfoLine icon={<Phone />} label="Téléphone" value={lead.phone} />
            <InfoLine icon={<Mail />} label="Email" value={lead.email} />
            <InfoLine icon={<MapPin />} label="Source" value={lead.source} />
            <InfoLine icon={<Calendar />} label="Créé" value={lead.createdAt} />
            <InfoLine label="Soin demandé" value={lead.treatment} />
            <InfoLine label="Commercial" value={lead.commercial} />
            <InfoLine label="Prochaine action" value={lead.nextAction} />
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-3">
            {lead.activityLog.map((activity) => (
              <TimelineItem
                key={activity.id}
                date={activity.date}
                title={activity.text}
              />
            ))}
            </div>
          )}

          {activeTab === "ai" && (
            <div className="space-y-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-blue-900">
                <Sparkles className="h-4 w-4" />
                Seya recommande
              </div>
              <p className="text-sm leading-6 text-blue-800">
                Priorité moyenne. Envoyer un message WhatsApp personnalisé avec
                les disponibilités et proposer un acompte pour bloquer le
                rendez-vous.
              </p>
            </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ActionButton({
  label,
  icon,
  className,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  className: string;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={`h-12 min-w-0 flex-col gap-1 px-1.5 text-[11px] font-semibold ${className}`}
    >
      {icon}
      {label}
    </Button>
  );
}

function MoreAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
    >
      {label}
    </button>
  );
}

function LeadTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 min-w-0 rounded-xl border px-2 text-sm font-semibold transition-colors ${
        active
          ? "border-blue-100 bg-blue-50 text-blue-700 shadow-sm"
          : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <span className="block truncate">{children}</span>
    </button>
  );
}

function InfoLine({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon && <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
        {label}
      </span>
      <span className="text-right text-sm font-semibold text-slate-800">
        {value}
      </span>
    </div>
  );
}

function CommentCard({
  author,
  date,
  text,
  highlight = false,
  onDelete,
}: {
  author: string;
  date: string;
  text: string;
  highlight?: boolean;
  onDelete?: () => void;
}) {
  return (
    <article
      className={`rounded-xl border p-4 ${
        highlight ? "border-blue-100 bg-blue-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {author[0]}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{author}</p>
            <p className="text-xs text-slate-400">{date}</p>
          </div>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
            aria-label="Supprimer le commentaire"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="text-sm leading-6 text-slate-600">{text}</p>
    </article>
  );
}

function TimelineItem({ date, title }: { date: string; title: string }) {
  return (
    <div className="grid gap-1 rounded-xl bg-slate-50 p-3 min-[1500px]:grid-cols-[92px_minmax(0,1fr)] min-[1500px]:gap-3">
      <span className="text-xs font-semibold leading-5 text-slate-400">
        {date}
      </span>
      <p className="min-w-0 break-words text-sm font-medium leading-6 text-slate-700">
        {title}
      </p>
    </div>
  );
}
