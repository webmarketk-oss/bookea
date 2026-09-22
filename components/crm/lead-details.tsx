"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  leadStatusClassName,
  leadStatusClasses,
  leadStatusSelectOptions,
} from "@/lib/lead-statuses";
import { practitioners } from "@/lib/agenda-data";
import {
  defaultCenterDepositLinks,
  getCenterServices,
  getSourceNames,
  readCenterSettings,
  type CenterDepositLinkSetting,
} from "@/lib/center-settings";
import {
  defaultSmsSettings,
  fillSmsTemplate,
  getSmsTemplate,
  loadCenterSmsSettings,
  type CenterSmsSettings,
} from "@/lib/sms-settings";
import { sendBookeaSms } from "@/lib/send-sms";
import { Lead, LeadStatus } from "@/types/lead";
import {
  Calendar,
  FileText,
  Gift,
  Mail,
  MessageCircle,
  MapPin,
  MoreVertical,
  PanelRightClose,
  Pencil,
  Phone,
  Sparkles,
  Trash2,
} from "lucide-react";

type LeadDetailsTab = "information" | "history" | "comments" | "ai";

type LeadInfoForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: string;
  address: string;
  postalCode: string;
  city: string;
  source: Lead["source"];
  campaign: string;
  treatment: string;
  commercial: string;
  status: LeadStatus;
  dealAmount: string;
  reminderDate: string;
  nextAction: string;
};

interface LeadDetailsProps {
  lead: Lead;
  onAddActivity: (leadId: string, text: string) => void;
  onDeleteActivity: (leadId: string, activityId: string) => void;
  onUpdateLead: (leadId: string, patch: LeadInfoForm) => void;
  onClose: () => void;
}

const leadSources: Lead["source"][] = [
  "Facebook",
  "Instagram",
  "Google",
  "Site Web",
  "Organique",
];

const commercialOptions = Array.from(
  new Set([
    "Équipe",
    ...practitioners.map((practitioner) => practitioner.name),
    "Thomas",
  ]),
);

const genderOptions = ["À compléter", "Femme", "Homme", "Non renseigné"];

function leadToInfoForm(lead: Lead): LeadInfoForm {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    phone: lead.phone,
    email: lead.email,
    birthDate: lead.birthDate ?? "",
    gender: lead.gender?.trim() || "À compléter",
    address: lead.address ?? "",
    postalCode: lead.postalCode ?? "",
    city: lead.city ?? "",
    source: lead.source,
    campaign: lead.campaign,
    treatment: lead.treatment,
    commercial: lead.commercial,
    status: lead.status,
    dealAmount: lead.dealAmount ? String(lead.dealAmount) : "",
    reminderDate: lead.reminderDate ?? "",
    nextAction: lead.nextAction,
  };
}

export default function LeadDetails({
  lead,
  onAddActivity,
  onDeleteActivity,
  onUpdateLead,
  onClose,
}: LeadDetailsProps) {
  const fullName = `${lead.firstName} ${lead.lastName}`;
  const [commentDraft, setCommentDraft] = useState("");
  const [infoForm, setInfoForm] = useState<LeadInfoForm>(() => leadToInfoForm(lead));
  const infoFormRef = useRef(infoForm);
  const [infoSaving, setInfoSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<LeadDetailsTab>("information");
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [depositLinks, setDepositLinks] =
    useState<CenterDepositLinkSetting[]>(defaultCenterDepositLinks);
  const [selectedDepositLinkId, setSelectedDepositLinkId] = useState(
    String(defaultCenterDepositLinks[0]?.id ?? ""),
  );
  const [smsSettings, setSmsSettings] = useState<CenterSmsSettings>(defaultSmsSettings);
  const [smsCenterName, setSmsCenterName] = useState("");
  const [smsMode, setSmsMode] = useState("template");
  const [smsTemplateId, setSmsTemplateId] = useState(defaultSmsSettings.leadWelcomeTemplateId);
  const [smsDraft, setSmsDraft] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsNotice, setSmsNotice] = useState("");
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);

  infoFormRef.current = infoForm;

  useEffect(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.closest("[data-lead-info-form='true']")
    ) {
      return;
    }

    setInfoForm(leadToInfoForm(lead));
  }, [
    lead.id,
    lead.firstName,
    lead.lastName,
    lead.phone,
    lead.email,
    lead.birthDate,
    lead.gender,
    lead.address,
    lead.postalCode,
    lead.city,
    lead.source,
    lead.campaign,
    lead.treatment,
    lead.commercial,
    lead.status,
    lead.dealAmount,
    lead.reminderDate,
    lead.nextAction,
  ]);

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
    void loadCenterSmsSettings()
      .then((result) => {
        setSmsSettings(result.settings);
        setSmsCenterName(result.centerName);
        setSmsTemplateId(result.settings.leadWelcomeTemplateId);
      })
      .catch(() => null);
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

  const smsPreview = useMemo(() => {
    if (smsMode === "free") {
      return smsDraft;
    }

    if (smsMode === "deposit" && selectedDepositLink) {
      return `${selectedDepositLink.message} ${selectedDepositLink.url}`.trim();
    }

    return fillSmsTemplate(getSmsTemplate(smsSettings, smsTemplateId).body, {
      firstName: lead.firstName,
      lastName: lead.lastName,
      treatment: lead.treatment,
      centerName: smsCenterName,
    });
  }, [
    lead.firstName,
    lead.lastName,
    lead.treatment,
    selectedDepositLink,
    smsCenterName,
    smsDraft,
    smsMode,
    smsSettings,
    smsTemplateId,
  ]);

  function addComment() {
    const text = commentDraft.trim();

    if (!text) {
      return;
    }

    onAddActivity(lead.id, text);
    setCommentDraft("");
  }

  function saveLeadInfo() {
    const form = infoFormRef.current;
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();

    if (!firstName || !lastName) {
      return;
    }

    const nextForm: LeadInfoForm = {
      ...form,
      firstName,
      lastName,
      phone: form.phone.trim(),
      email: form.email.trim(),
      campaign: form.campaign.trim() || lead.campaign,
      treatment: form.treatment.trim() || lead.treatment,
      nextAction: form.nextAction.trim() || "À contacter",
    };

    if (JSON.stringify(nextForm) === JSON.stringify(leadToInfoForm(lead))) {
      return;
    }

    setInfoForm(nextForm);
    setInfoSaving(true);
    onUpdateLead(lead.id, nextForm);
    window.setTimeout(() => setInfoSaving(false), 400);
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

  async function sendLeadSms(messageOverride?: string) {
    const message = (messageOverride ?? (smsMode === "free" ? smsDraft : smsPreview)).trim();

    if (!lead.phone.trim()) {
      setSmsNotice("Ce prospect n'a pas de téléphone.");
      return;
    }

    if (!message) {
      setSmsNotice("Écris un SMS ou choisis un modèle.");
      return;
    }

    setSmsSending(true);
    setSmsNotice("Envoi SMS en cours...");

    try {
      const result = await sendBookeaSms({
        phone: lead.phone,
        firstName: lead.firstName,
        lastName: lead.lastName,
        treatment: lead.treatment,
        centerName: smsCenterName,
        message,
      });

      if (!result.ok) {
        throw new Error(result.error || "Envoi SMS refusé");
      }

      setSmsNotice("SMS envoyé.");
      onAddActivity(lead.id, `SMS envoyé : ${message}`);
    } catch (error) {
      setSmsNotice(
        error instanceof Error ? error.message : "Impossible d'envoyer le SMS.",
      );
    } finally {
      setSmsSending(false);
    }
  }

  return (
    <Card
      className="min-h-full overflow-visible rounded-2xl border-slate-200 py-0 shadow-sm"
    >
      <CardContent className="space-y-5 p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0" data-fiche-keep-open="true">
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
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            aria-label="Rabattre la fiche"
            title="Rabattre la fiche"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </header>

        <div data-fiche-keep-open="true" className="space-y-5">
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
          <div className="grid gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-black uppercase text-blue-700">
                Envoyer un SMS
              </span>
              <select
                value={
                  smsMode === "template"
                    ? `template:${smsTemplateId}`
                    : smsMode === "deposit"
                      ? `deposit:${selectedDepositLinkId}`
                      : smsMode
                }
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.startsWith("template:")) {
                    setSmsMode("template");
                    setSmsTemplateId(value.replace("template:", ""));
                    return;
                  }

                  if (value.startsWith("deposit:")) {
                    setSmsMode("deposit");
                    setSelectedDepositLinkId(value.replace("deposit:", ""));
                    return;
                  }

                  setSmsMode(value);
                }}
                className="h-10 w-full rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-slate-800 outline-none"
              >
                {smsSettings.templates.map((template) => (
                  <option key={template.id} value={`template:${template.id}`}>
                    Modèle : {template.name}
                  </option>
                ))}
                {depositLinks.map((link) => (
                  <option key={link.id} value={`deposit:${link.id}`}>
                    Acompte : {link.name}
                  </option>
                ))}
                <option value="free">Texte libre</option>
              </select>
            </label>
            {smsMode === "deposit" && (
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
            )}
            <textarea
              value={smsMode === "free" ? smsDraft : smsPreview}
              onChange={(event) => {
                setSmsMode("free");
                setSmsDraft(event.target.value);
              }}
              rows={4}
              className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-800 outline-none"
              placeholder="Écris le SMS ou choisis un modèle."
            />
            <Button
              type="button"
              disabled={smsSending}
              onClick={() => void sendLeadSms()}
              className="rounded-xl bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700"
            >
              {smsSending ? "Envoi..." : "Envoyer SMS"}
            </Button>
            {smsNotice ? (
              <p className="text-xs font-black text-blue-800">{smsNotice}</p>
            ) : null}
          </div>
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
            <div className="space-y-4 pr-1">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <textarea
                ref={commentTextareaRef}
                placeholder="Ajouter un commentaire..."
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                onWheel={(event) => {
                  const field = event.currentTarget;
                  if (field.scrollHeight > field.clientHeight + 1) {
                    return;
                  }

                  field
                    .closest("[class*='overflow-y-auto']")
                    ?.scrollBy({ top: event.deltaY });
                }}
                className="min-h-24 w-full resize-none overflow-y-auto bg-transparent text-sm outline-none placeholder:text-slate-400"
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
            <form
              data-lead-info-form="true"
              className="space-y-2.5"
              onSubmit={(event) => {
                event.preventDefault();
                saveLeadInfo();
              }}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && event.currentTarget.contains(next)) {
                  return;
                }
                saveLeadInfo();
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <InfoField
                  label="Prénom"
                  value={infoForm.firstName}
                  onChange={(value) =>
                    setInfoForm((form) => ({ ...form, firstName: value }))
                  }
                />
                <InfoField
                  label="Nom"
                  value={infoForm.lastName}
                  onChange={(value) =>
                    setInfoForm((form) => ({ ...form, lastName: value }))
                  }
                />
              </div>
              <InfoField
                icon={<Phone />}
                label="Téléphone"
                value={infoForm.phone}
                onChange={(value) =>
                  setInfoForm((form) => ({ ...form, phone: value }))
                }
              />
              <InfoField
                icon={<Mail />}
                label="Email"
                value={infoForm.email}
                onChange={(value) =>
                  setInfoForm((form) => ({ ...form, email: value }))
                }
              />
              <div>
                <InfoField
                  icon={<Gift />}
                  label="Date d'anniversaire"
                  type="date"
                  value={infoForm.birthDate}
                  onChange={(value) =>
                    setInfoForm((form) => ({ ...form, birthDate: value }))
                  }
                />
                {infoForm.birthDate ? (
                  <p className="mt-1 px-1 text-xs font-semibold text-rose-600">
                    {birthdayGiftHint(infoForm.birthDate)}
                  </p>
                ) : (
                  <p className="mt-1 px-1 text-xs font-medium text-slate-500">
                    Pour le cadeau d&apos;anniversaire et le SMS du jour J
                  </p>
                )}
              </div>
              <InfoSelect
                label="Genre"
                value={infoForm.gender}
                options={genderOptions}
                onChange={(value) =>
                  setInfoForm((form) => ({ ...form, gender: value }))
                }
              />
              <InfoField
                label="Adresse"
                value={infoForm.address}
                onChange={(value) =>
                  setInfoForm((form) => ({ ...form, address: value }))
                }
              />
              <div className="grid grid-cols-[7.5rem_1fr] gap-2">
                <InfoField
                  label="Code postal"
                  value={infoForm.postalCode}
                  onChange={(value) =>
                    setInfoForm((form) => ({ ...form, postalCode: value }))
                  }
                />
                <InfoField
                  label="Ville"
                  value={infoForm.city}
                  onChange={(value) =>
                    setInfoForm((form) => ({ ...form, city: value }))
                  }
                />
              </div>
              <InfoSelect
                icon={<MapPin />}
                label="Source"
                value={infoForm.source}
                options={Array.from(
                  new Set([
                    ...leadSources,
                    ...getSourceNames(readCenterSettings()),
                    infoForm.source,
                  ]),
                )}
                onChange={(value) =>
                  setInfoForm((form) => ({
                    ...form,
                    source: value as Lead["source"],
                  }))
                }
              />
              <InfoField
                label="Campagne"
                value={infoForm.campaign}
                onChange={(value) =>
                  setInfoForm((form) => ({ ...form, campaign: value }))
                }
              />
              <InfoField
                label="Soin demandé"
                value={infoForm.treatment}
                list="lead-treatment-options"
                onChange={(value) =>
                  setInfoForm((form) => ({ ...form, treatment: value }))
                }
              />
              <datalist id="lead-treatment-options">
                {getCenterServices(readCenterSettings()).map((service) => (
                  <option key={service.id} value={service.name} />
                ))}
              </datalist>
              <InfoSelect
                label="Commercial"
                value={infoForm.commercial}
                options={
                  commercialOptions.includes(infoForm.commercial)
                    ? commercialOptions
                    : [infoForm.commercial, ...commercialOptions]
                }
                onChange={(value) =>
                  setInfoForm((form) => ({ ...form, commercial: value }))
                }
              />
              <label className="block rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">
                  Statut
                </span>
                <select
                  value={infoForm.status}
                  onChange={(event) =>
                    setInfoForm((form) => ({
                      ...form,
                      status: event.target.value as LeadStatus,
                    }))
                  }
                  className={`h-8 w-full rounded-full border-0 px-3 text-xs font-semibold outline-none ring-1 ${leadStatusClassName(infoForm.status)}`}
                >
                  {leadStatusSelectOptions(infoForm.status).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <InfoField
                  label="Montant (€)"
                  value={infoForm.dealAmount}
                  type="number"
                  onChange={(value) =>
                    setInfoForm((form) => ({ ...form, dealAmount: value }))
                  }
                />
                <InfoField
                  icon={<Calendar />}
                  label="Rappel"
                  value={infoForm.reminderDate}
                  type="date"
                  onChange={(value) =>
                    setInfoForm((form) => ({ ...form, reminderDate: value }))
                  }
                />
              </div>
              <InfoField
                label="Prochaine action"
                value={infoForm.nextAction}
                onChange={(value) =>
                  setInfoForm((form) => ({ ...form, nextAction: value }))
                }
              />
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="[&_svg]:h-4 [&_svg]:w-4">
                    <Calendar />
                  </span>
                  Créé
                </span>
                <span className="text-right text-sm font-semibold text-slate-800">
                  {lead.createdAt}
                </span>
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={infoSaving}
                onClick={saveLeadInfo}
              >
                {infoSaving ? "Enregistrement..." : "Enregistrer les infos"}
              </Button>
            </form>
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

function birthdayGiftHint(isoDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return "Pour le cadeau d'anniversaire";
  }

  const [, monthText, dayText] = isoDate.split("-");
  const month = Number(monthText);
  const day = Number(dayText);
  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  const label = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;

  if (month === todayMonth && day === todayDay) {
    return `Cadeau d'anniversaire aujourd'hui — ${label}`;
  }

  const startToday = new Date(now.getFullYear(), todayMonth - 1, todayDay);
  let nextBirthday = new Date(now.getFullYear(), month - 1, day);

  if (nextBirthday < startToday) {
    nextBirthday = new Date(now.getFullYear() + 1, month - 1, day);
  }

  const daysUntil = Math.round(
    (nextBirthday.getTime() - startToday.getTime()) / 86_400_000,
  );

  if (daysUntil > 0 && daysUntil <= 7) {
    return `Préparer le cadeau — dans ${daysUntil} jour${daysUntil > 1 ? "s" : ""}`;
  }

  if (month === todayMonth) {
    return `Anniversaire ce mois-ci, le ${label}`;
  }

  return `Anniversaire le ${label} — pour le cadeau`;
}

function InfoField({
  icon,
  label,
  value,
  type = "text",
  list,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  type?: string;
  list?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon ? <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
        {label}
      </span>
      <input
        type={type}
        list={list}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function InfoSelect({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-500">
        {icon ? <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
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
