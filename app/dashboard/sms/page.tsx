"use client";

import {
  CalendarClock,
  CheckCircle2,
  Gift,
  MessageCircle,
  Send,
  ShoppingCart,
  Smartphone,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { loadCrmAppointments } from "@/lib/agenda-supabase";
import { getActiveCenterContext } from "@/lib/center-access";
import { loadCrmClients, loadCrmLeads } from "@/lib/crm-supabase";
import {
  defaultSmsSettings,
  loadCenterSmsSettings,
  loadSmsHistory,
  loadSmsInbox,
  loadSmsQuota,
  MONTHLY_SMS_LIMIT,
  saveCenterSmsSettings,
  saveSmsHistory,
  type CenterSmsSettings,
  type SmsInboxItem,
  type SmsTemplate,
  type StoredSmsCampaign,
} from "@/lib/sms-settings";
import { sendBookeaSms } from "@/lib/send-sms";
import type { Appointment } from "@/types/agenda";
import type { Lead } from "@/types/lead";
import type { CrmClient } from "@/lib/crm-supabase";

type SmsCampaign = StoredSmsCampaign;

type SmsRecipient = {
  phone: string;
  firstName: string;
};

const recallStatuses = new Set([
  "Nouveau",
  "À relancer",
  "À rappeler",
  "Souhaite être rappelé(e) plus tard",
  "Apl en abs",
]);

const statusStyles: Record<SmsCampaign["status"], string> = {
  Envoyé: "bg-emerald-100 text-emerald-700",
  Planifié: "bg-blue-100 text-blue-700",
  Brouillon: "bg-slate-100 text-slate-600",
};

export default function SmsPage() {
  const [credits, setCredits] = useState(MONTHLY_SMS_LIMIT);
  const [smsUsed, setSmsUsed] = useState(0);
  const [smsLimit, setSmsLimit] = useState(MONTHLY_SMS_LIMIT);
  const [centerId, setCenterId] = useState("");
  const [campaigns, setCampaigns] = useState<SmsCampaign[]>([]);
  const [name, setName] = useState("Relance prospects du jour");
  const [audience, setAudience] = useState("Prospects à rappeler");
  const [message, setMessage] = useState(
    "Bonjour {{prenom}}, votre centre revient vers vous pour vous proposer un créneau cette semaine.",
  );
  const [scheduledDate, setScheduledDate] = useState("2026-07-30");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [testPhone, setTestPhone] = useState("");
  const [reminder48h, setReminder48h] = useState(true);
  const [reminderDayBefore, setReminderDayBefore] = useState(true);
  const [birthdaySms, setBirthdaySms] = useState(true);
  const [confirmation, setConfirmation] = useState("");
  const [isError, setIsError] = useState(false);
  const [sending, setSending] = useState(false);
  const [centerName, setCenterName] = useState("le centre");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<CrmClient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [smsSettings, setSmsSettings] = useState<CenterSmsSettings>(defaultSmsSettings);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [inbox, setInbox] = useState<SmsInboxItem[]>([]);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyingId, setReplyingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [center, leadData, clientData, appointmentData, sms, history, replies, quota] =
          await Promise.all([
            getActiveCenterContext(),
            loadCrmLeads().catch(() => ({ leads: [] as Lead[] })),
            loadCrmClients().catch(() => ({ clients: [] as CrmClient[] })),
            loadCrmAppointments().catch(() => [] as Appointment[]),
            loadCenterSmsSettings().catch(() => ({
              centerName: "le centre",
              settings: defaultSmsSettings,
            })),
            loadSmsHistory().catch(() => ({
              campaigns: [] as SmsCampaign[],
              remainingCredits: undefined as number | undefined,
            })),
            loadSmsInbox().catch(() => [] as SmsInboxItem[]),
            loadSmsQuota().catch(() => ({
              remaining: MONTHLY_SMS_LIMIT,
              used: 0,
              limit: MONTHLY_SMS_LIMIT,
              month: "",
            })),
          ]);

        void fetch("/api/sms/dispatch")
          .then(() => loadSmsInbox())
          .then((nextInbox) => {
            if (!cancelled) setInbox(nextInbox);
          })
          .catch(() => null);
        void fetch("/api/sms/inbound").catch(() => null);

        if (cancelled) {
          return;
        }

        setCenterId(center.centerId);
        setCenterName(center.centerName);
        setLeads(leadData.leads);
        setClients(clientData.clients);
        setAppointments(appointmentData);
        setSmsSettings(sms.settings);
        setBirthdaySms(sms.settings.birthdaySmsEnabled !== false);
        setCampaigns(history.campaigns);
        setInbox(replies);
        setCredits(quota.remaining);
        setSmsUsed(quota.used);
        setSmsLimit(quota.limit);
      } catch (error) {
        if (!cancelled) {
          setIsError(true);
          setConfirmation(
            error instanceof Error
              ? error.message
              : "Impossible de charger les destinataires SMS.",
          );
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const audienceRecipients = useMemo(
    () => getAudienceRecipients(audience, { leads, clients, appointments }),
    [appointments, audience, clients, leads],
  );

  const stats = useMemo(
    () => ({
      scheduled: campaigns.filter((campaign) => campaign.status === "Planifié")
        .length,
      sent: campaigns.filter((campaign) => campaign.status === "Envoyé").length,
      used: campaigns.reduce((total, campaign) => total + campaign.recipients, 0),
    }),
    [campaigns],
  );

  function applyQuota(remaining?: number, used?: number, limit?: number) {
    if (typeof remaining === "number") {
      setCredits(Math.floor(remaining));
    }

    if (typeof used === "number") {
      setSmsUsed(Math.floor(used));
    }

    if (typeof limit === "number") {
      setSmsLimit(Math.floor(limit));
    }
  }

  async function persistSmsSettings(nextSettings: CenterSmsSettings) {
    setSmsSettings(nextSettings);
    setSavingTemplates(true);
    setIsError(false);

    try {
      await saveCenterSmsSettings(nextSettings);
      setConfirmation(`Modèles SMS enregistrés pour ${centerName}.`);
    } catch (error) {
      setIsError(true);
      setConfirmation(
        error instanceof Error
          ? error.message
          : "Impossible d'enregistrer les modèles SMS.",
      );
    } finally {
      setSavingTemplates(false);
    }
  }

  function startNewTemplate() {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateBody(
      "Bonjour {{prenom}}, votre rendez-vous {{soin}} est confirmé le {{date}} à {{heure}} chez {{centre}}.",
    );
  }

  function editTemplate(template: SmsTemplate) {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateBody(template.body);
  }

  async function saveTemplate() {
    const name = templateName.trim();
    const body = templateBody.trim();

    if (!name || !body) {
      setIsError(true);
      setConfirmation("Le modèle doit avoir un nom et un texte.");
      return;
    }

    const nextTemplate: SmsTemplate = {
      id: editingTemplateId || crypto.randomUUID(),
      name,
      body,
    };
    const templates = editingTemplateId
      ? smsSettings.templates.map((template) =>
          template.id === editingTemplateId ? nextTemplate : template,
        )
      : [...smsSettings.templates, nextTemplate];

    setEditingTemplateId(nextTemplate.id);
    await persistSmsSettings({ ...smsSettings, templates });
  }

  async function deleteTemplate(templateId: string) {
    const templates = smsSettings.templates.filter((template) => template.id !== templateId);

    if (templates.length === 0) {
      setIsError(true);
      setConfirmation("Garde au moins un modèle SMS.");
      return;
    }

    if (editingTemplateId === templateId) {
      startNewTemplate();
    }

    await persistSmsSettings({
      ...smsSettings,
      templates,
      confirmationTemplateId:
        smsSettings.confirmationTemplateId === templateId
          ? templates[0].id
          : smsSettings.confirmationTemplateId,
      reminder48hTemplateId:
        smsSettings.reminder48hTemplateId === templateId
          ? templates[0].id
          : smsSettings.reminder48hTemplateId,
      leadWelcomeTemplateId:
        smsSettings.leadWelcomeTemplateId === templateId
          ? templates[0].id
          : smsSettings.leadWelcomeTemplateId,
      birthdayTemplateId:
        smsSettings.birthdayTemplateId === templateId
          ? templates[0].id
          : smsSettings.birthdayTemplateId,
    });
  }

  async function replyToInbox(item: SmsInboxItem) {
    const message = replyDraft.trim();

    if (!message) {
      setIsError(true);
      setConfirmation("Écris une réponse SMS.");
      return;
    }

    setReplyingId(item.id);
    setIsError(false);

    try {
      const result = await sendBookeaSms({
        phone: item.phone,
        firstName: item.clientName?.split(" ")[0] || "vous",
        message,
      });

      if (!result.ok) {
        throw new Error(result.error || "Réponse SMS refusée");
      }

      setReplyDraft("");
      if (typeof result.remainingCredits === "number") {
        applyQuota(result.remainingCredits, smsUsed + 1);
      }
      setConfirmation(`Réponse envoyée à ${item.clientName || item.phone}.`);
    } catch (error) {
      setIsError(true);
      setConfirmation(
        error instanceof Error ? error.message : "Impossible de répondre au SMS.",
      );
    } finally {
      setReplyingId(null);
    }
  }

  async function sendNow() {
    const recipients = testPhone.trim()
      ? [{ phone: testPhone.trim(), firstName: "vous" }]
      : audienceRecipients;

    if (recipients.length === 0) {
      setIsError(true);
      setConfirmation(
        "Aucun numéro à envoyer. Ajoute un numéro test, ou choisis une audience qui a des téléphones.",
      );
      return;
    }

    setSending(true);
    setIsError(false);
    setConfirmation("Envoi SMS en cours via Brevo...");

    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          type: isMarketingAudience(audience) && !testPhone.trim()
            ? "marketing"
            : "transactional",
          centerId,
          centerName,
          recipients,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || result.results?.[0]?.error || "Envoi SMS refusé");
      }

      applyQuota(
        result.remainingCredits,
        result.used,
        result.monthlyLimit,
      );

      const nextCampaign: SmsCampaign = {
        id: Date.now(),
        name: testPhone.trim() ? `${name} (test)` : name,
        audience: testPhone.trim() ? `Numéro test ${testPhone}` : audience,
        message,
        plannedAt: "Envoyé maintenant",
        recipients: result.sent ?? recipients.length,
        status: "Envoyé",
      };
      setCampaigns((current) => {
        const nextCampaigns = [nextCampaign, ...current];
        void saveSmsHistory(
          nextCampaigns,
          typeof result.remainingCredits === "number"
            ? Math.floor(result.remainingCredits)
            : credits,
        );
        return nextCampaigns;
      });
      setConfirmation(
        result.failed
          ? `${result.sent} SMS envoyés, ${result.failed} échec(s).`
          : `${result.sent} SMS envoyés via Brevo.`,
      );
    } catch (error) {
      setIsError(true);
      setConfirmation(
        error instanceof Error ? error.message : "Impossible d'envoyer le SMS.",
      );
    } finally {
      setSending(false);
    }
  }

  function createCampaign(status: SmsCampaign["status"]) {
    if (status === "Envoyé") {
      void sendNow();
      return;
    }

    const recipients = testPhone.trim() ? 1 : audienceRecipients.length;
    const nextCampaign: SmsCampaign = {
      id: Date.now(),
      name,
      audience,
      message,
      plannedAt: `Le ${new Intl.DateTimeFormat("fr-FR").format(
        new Date(`${scheduledDate}T${scheduledTime}`),
      )} à ${scheduledTime}`,
      recipients,
      status,
    };

    setCampaigns((current) => {
      const nextCampaigns = [nextCampaign, ...current];
      void saveSmsHistory(nextCampaigns, credits);
      return nextCampaigns;
    });
    setIsError(false);
    setConfirmation(`Envoi SMS planifié pour ${recipients} destinataire(s).`);
  }

  return (
    <main className="min-h-screen bg-[#eef3f9] px-6 py-6 text-slate-950">
      <section className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-600">Bookea CRM</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Envoi SMS</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            SMS réels via Brevo pour {centerName}. Mets d’abord ton numéro en test.
          </p>
        </div>
        <button
          type="button"
          disabled={sending}
          onClick={() => createCampaign("Envoyé")}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-sm disabled:opacity-60"
        >
          <Send className="h-6 w-6" />
          {sending ? "Envoi..." : "Envoyer SMS"}
        </button>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard
          title="SMS restants"
          value={credits}
          detail={`+${smsLimit} chaque 1er · sans expiration`}
          color="text-blue-600"
          icon={<Smartphone />}
        />
        <StatCard title="Utilisés ce mois" value={smsUsed} color="text-orange-600" icon={<Zap />} />
        <StatCard title="Planifiés" value={stats.scheduled} color="text-violet-600" icon={<CalendarClock />} />
        <StatCard title="Campagnes envoyées" value={stats.sent} color="text-emerald-600" icon={<CheckCircle2 />} />
      </section>

      {confirmation && (
        <div
          className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-medium ${
            isError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {confirmation}
        </div>
      )}

      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-base font-semibold">Modèles SMS de {centerName}</h2>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
              Crée tes textes, enregistre-les, puis choisis lequel part à la confirmation RDV, 48h avant, ou depuis le CRM. Variables : {"{{prenom}} {{nom}} {{date}} {{heure}} {{soin}} {{centre}} {{lien_confirmation}}"}.
            </p>
          </div>
          <button
            type="button"
            onClick={startNewTemplate}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
          >
            Nouveau modèle
          </button>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-3">
            {smsSettings.templates.map((template) => (
              <article
                key={template.id}
                className={`rounded-2xl border p-4 ${
                  editingTemplateId === template.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{template.name}</p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-600">
                      {template.body}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => editTemplate(template)}
                      className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-700"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTemplate(template.id)}
                      className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-red-600"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Input
              label="Nom du modèle"
              value={templateName}
              onChange={setTemplateName}
              placeholder="Confirmation Gap, Rappel Clermont..."
            />
            <label className="mt-4 block space-y-2">
              <span className="text-xs font-medium text-slate-500">
                Texte du modèle
              </span>
              <textarea
                value={templateBody}
                onChange={(event) => setTemplateBody(event.target.value)}
                className="min-h-32 w-full rounded-2xl border border-slate-200 bg-white p-4 text-base font-bold leading-7 outline-none focus:border-blue-500"
              />
            </label>
            <button
              type="button"
              disabled={savingTemplates}
              onClick={() => void saveTemplate()}
              className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {savingTemplates ? "Enregistrement..." : "Enregistrer le modèle"}
            </button>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TemplateSelect
                label="Confirmation RDV"
                value={smsSettings.confirmationTemplateId}
                templates={smsSettings.templates}
                onChange={(value) =>
                  void persistSmsSettings({
                    ...smsSettings,
                    confirmationTemplateId: value,
                  })
                }
              />
              <TemplateSelect
                label="Rappel 48h"
                value={smsSettings.reminder48hTemplateId}
                templates={smsSettings.templates}
                onChange={(value) =>
                  void persistSmsSettings({
                    ...smsSettings,
                    reminder48hTemplateId: value,
                  })
                }
              />
              <TemplateSelect
                label="Accueil prospect"
                value={smsSettings.leadWelcomeTemplateId}
                templates={smsSettings.templates}
                onChange={(value) =>
                  void persistSmsSettings({
                    ...smsSettings,
                    leadWelcomeTemplateId: value,
                  })
                }
              />
              <TemplateSelect
                label="Anniversaire"
                value={smsSettings.birthdayTemplateId}
                templates={smsSettings.templates}
                onChange={(value) =>
                  void persistSmsSettings({
                    ...smsSettings,
                    birthdayTemplateId: value,
                  })
                }
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Forfait du centre</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {centerName} reçoit {smsLimit} SMS chaque 1er du mois. Les SMS non
              utilisés et les recharges admin n’expirent pas : s’il en reste 100,
              le mois suivant le solde passe à {smsLimit + 100}. L’envoi s’arrête
              uniquement quand le solde est à 0.
            </p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              {credits} restant{credits > 1 ? "s" : ""} · {smsUsed} utilisé
              {smsUsed > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Créer un envoi</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Si le numéro test est rempli, un seul SMS part vers ce numéro.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Input label="Nom de l'envoi" value={name} onChange={setName} />
            <label className="space-y-2">
              <span className="text-xs font-medium text-slate-500">
                Audience
              </span>
              <select
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-base font-bold outline-none focus:border-blue-500"
              >
                <option>Prospects à rappeler</option>
                <option>RDV confirmés demain</option>
                <option>Clientes anniversaire</option>
                <option>Tous les clients</option>
              </select>
            </label>
            <Input label="Date d'envoi" type="date" value={scheduledDate} onChange={setScheduledDate} />
            <Input label="Heure d'envoi" type="time" value={scheduledTime} onChange={setScheduledTime} />
            <Input
              label="Numéro test"
              value={testPhone}
              onChange={setTestPhone}
              placeholder="06 12 34 56 78"
            />
            <label className="space-y-2 md:col-span-2">
              <span className="text-xs font-medium text-slate-500">
                Message SMS
              </span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-36 w-full rounded-2xl border border-slate-200 p-4 text-base font-bold leading-7 outline-none focus:border-blue-500"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => createCampaign("Planifié")}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700"
            >
              Planifier l'envoi
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => createCampaign("Envoyé")}
              className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              {sending ? "Envoi..." : "Envoyer maintenant"}
            </button>
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Automatiques</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Les rappels RDV et le SMS d&apos;anniversaire partiront ensuite tout seuls. Le bouton envoie déjà via Brevo.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            <Toggle
              active={reminder48h}
              label="Rappel SMS 48h avant le RDV"
              onClick={() => setReminder48h((value) => !value)}
            />
            <Toggle
              active={reminderDayBefore}
              label="Rappel SMS la veille du RDV"
              onClick={() => setReminderDayBefore((value) => !value)}
            />
            <Toggle
              active={birthdaySms}
              label="SMS anniversaire le jour J"
              onClick={() => {
                const next = !birthdaySms;
                setBirthdaySms(next);
                void persistSmsSettings({
                  ...smsSettings,
                  birthdaySmsEnabled: next,
                });
              }}
            />
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">
              Aperçu
            </p>
            <p className="mt-3 text-base font-bold leading-7 text-slate-700">
              {message.replace("{{prenom}}", "Marie")}
            </p>
            <p className="mt-3 font-semibold text-blue-600">
              {testPhone.trim() ? 1 : audienceRecipients.length} destinataire(s)
            </p>
          </div>
        </aside>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Réponses SMS</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Les réponses des clientes arrivent ici et dans la fiche CRM. Active aussi “Réponses SMS” dans Brevo (SMS transactionnel → Configuration).
        </p>
        <div className="mt-5 grid gap-3">
          {inbox.length === 0 ? (
            <p className="font-semibold text-slate-500">
              Aucune réponse reçue pour l’instant.
            </p>
          ) : (
            inbox.map((item) => (
              <article
                key={item.id}
                className="grid gap-3 rounded-2xl border border-violet-100 bg-violet-50 p-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {item.clientName || "Cliente"} · {item.phone}
                  </p>
                  <p className="font-bold text-slate-500">{item.at}</p>
                  <p className="mt-2 font-semibold text-slate-800">{item.text}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={replyingId === item.id ? replyDraft : ""}
                    onChange={(event) => {
                      setReplyingId(item.id);
                      setReplyDraft(event.target.value);
                    }}
                    placeholder="Répondre par SMS..."
                    className="h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    disabled={replyingId === item.id && !replyDraft.trim()}
                    onClick={() => void replyToInbox(item)}
                    className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {replyingId === item.id ? "Envoyer" : "Répondre"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Historique SMS</h2>
        <div className="mt-5 grid gap-3">
          {campaigns.length === 0 ? (
            <p className="font-semibold text-slate-500">
              Aucun SMS envoyé pour l’instant.
            </p>
          ) : (
            campaigns.map((campaign) => (
              <article
                key={campaign.id}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="text-sm font-medium">{campaign.name}</p>
                  <p className="font-bold text-slate-500">
                    {campaign.audience} · {campaign.plannedAt}
                  </p>
                  <p className="mt-2 font-semibold text-slate-600">
                    {campaign.message}
                  </p>
                </div>
                <p className="self-center font-semibold text-slate-700">
                  {campaign.recipients} SMS
                </p>
                <span className={`self-center rounded-full px-4 py-2 text-center font-semibold ${statusStyles[campaign.status]}`}>
                  {campaign.status}
                </span>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function getAudienceRecipients(
  audience: string,
  data: { leads: Lead[]; clients: CrmClient[]; appointments: Appointment[] },
): SmsRecipient[] {
  if (audience === "RDV confirmés demain") {
    const tomorrow = addDaysIso(todayIso(), 1);
    return uniqueRecipients(
      data.appointments
        .filter(
          (appointment) =>
            appointment.date === tomorrow &&
            appointment.status !== "Annulation" &&
            appointment.phone,
        )
        .map((appointment) => ({
          phone: appointment.phone,
          firstName: appointment.personName.split(" ")[0] || "vous",
        })),
    );
  }

  if (audience === "Clientes anniversaire") {
    const today = todayIso().slice(5);
    return uniqueRecipients(
      data.clients
        .filter(
          (client) =>
            birthMonthDay(client.birthDate) === today && client.phone,
        )
        .map((client) => ({
          phone: client.phone,
          firstName: client.firstName || "vous",
        })),
    );
  }

  if (audience === "Tous les clients") {
    return uniqueRecipients(
      data.clients
        .filter((client) => client.phone)
        .map((client) => ({
          phone: client.phone,
          firstName: client.firstName || "vous",
        })),
    );
  }

  return uniqueRecipients(
    data.leads
      .filter((lead) => recallStatuses.has(lead.status) && lead.phone)
      .map((lead) => ({
        phone: lead.phone,
        firstName: lead.firstName || "vous",
      })),
  );
}

function uniqueRecipients(recipients: SmsRecipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const phone = recipient.phone.replace(/\D/g, "");
    if (!phone || seen.has(phone)) {
      return false;
    }
    seen.add(phone);
    return true;
  });
}

function isMarketingAudience(audience: string) {
  return audience === "Tous les clients" || audience === "Clientes anniversaire";
}

function birthMonthDay(value: string | undefined) {
  if (!value || value === "À compléter") return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(5, 10);

  const match = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{4})?/);

  if (!match) return "";

  return `${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number) {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function Input({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-base font-bold outline-none focus:border-blue-500"
      />
    </label>
  );
}

function TemplateSelect({
  label,
  value,
  templates,
  onChange,
}: {
  label: string;
  value: string;
  templates: SmsTemplate[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-blue-500"
      >
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left font-semibold ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <span>{label}</span>
      <span className="rounded-full bg-white px-3 py-1 text-sm">
        {active ? "Actif" : "Inactif"}
      </span>
    </button>
  );
}

function StatCard({
  title,
  value,
  detail,
  color,
  icon,
}: {
  title: string;
  value: number | string;
  detail?: string;
  color?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`mt-3 text-xl font-semibold ${color ?? ""}`}>{value}</p>
          {detail ? (
            <p className="mt-2 text-xs font-bold text-slate-400">{detail}</p>
          ) : null}
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}
