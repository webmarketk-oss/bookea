"use client";

import {
  CalendarClock,
  CheckCircle2,
  Gift,
  Megaphone,
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
  loadSmsQuota,
  MONTHLY_SMS_LIMIT,
  saveCenterSmsSettings,
  saveSmsHistory,
  type CenterSmsSettings,
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

const campaignAudienceOptions = [
  "Leads",
  "Clients",
  "Leads RDV pris",
  "Leads à relancer",
  "Leads reviendra vers nous",
] as const;

type CampaignAudience = (typeof campaignAudienceOptions)[number];

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
  const [campaignName, setCampaignName] = useState("Campagne SMS");
  const [campaignAudience, setCampaignAudience] =
    useState<CampaignAudience>("Leads");
  const [campaignMessage, setCampaignMessage] = useState(
    "Bonjour {{prenom}}, votre centre vous contacte. Répondez à ce SMS ou appelez-nous pour en parler.",
  );
  const [campaignDate, setCampaignDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
      new Date(),
    ),
  );
  const [campaignTime, setCampaignTime] = useState("10:00");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [center, leadData, clientData, appointmentData, sms, history, quota] =
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
            loadSmsQuota().catch(() => ({
              remaining: MONTHLY_SMS_LIMIT,
              used: 0,
              limit: MONTHLY_SMS_LIMIT,
              month: "",
            })),
          ]);

        void fetch("/api/sms/dispatch").catch(() => null);
        void fetch("/api/sms/campaign-dispatch").catch(() => null);
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
        setCampaigns(history.campaigns);
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

  const campaignRecipients = useMemo(
    () =>
      getAudienceRecipients(campaignAudience, { leads, clients, appointments }),
    [appointments, campaignAudience, clients, leads],
  );

  const campaignAudienceCounts = useMemo(
    () =>
      Object.fromEntries(
        campaignAudienceOptions.map((option) => [
          option,
          getAudienceRecipients(option, { leads, clients, appointments }).length,
        ]),
      ) as Record<CampaignAudience, number>,
    [appointments, clients, leads],
  );

  const campaignSegments = useMemo(
    () => smsSegmentInfo(campaignMessage),
    [campaignMessage],
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
      reminderJ7TemplateId:
        smsSettings.reminderJ7TemplateId === templateId
          ? templates[0].id
          : smsSettings.reminderJ7TemplateId,
      reminderJ5TemplateId:
        smsSettings.reminderJ5TemplateId === templateId
          ? templates[0].id
          : smsSettings.reminderJ5TemplateId,
      reminder48hTemplateId:
        smsSettings.reminder48hTemplateId === templateId
          ? templates[0].id
          : smsSettings.reminder48hTemplateId,
      reminder24hTemplateId:
        smsSettings.reminder24hTemplateId === templateId
          ? templates[0].id
          : smsSettings.reminder24hTemplateId,
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

  async function sendCampaignNow() {
    const recipients = campaignRecipients;

    if (!campaignMessage.trim()) {
      setIsError(true);
      setConfirmation("Écris le texte de la campagne SMS avant d’envoyer.");
      return;
    }

    if (recipients.length === 0) {
      setIsError(true);
      setConfirmation(
        `Aucun numéro pour « ${campaignAudience} ». Vérifie les fiches avec un téléphone.`,
      );
      return;
    }

    setSending(true);
    setIsError(false);
    setConfirmation("Envoi de la campagne SMS via Brevo...");

    try {
      let sent = 0;
      let failed = 0;
      let remainingCredits = credits;
      let used = smsUsed;
      let monthlyLimit = smsLimit;
      const chunks = chunkRecipients(recipients, 100);

      for (const chunk of chunks) {
        const response = await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: campaignMessage,
            type: "marketing",
            centerId,
            centerName,
            recipients: chunk,
          }),
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(
            result.error || result.results?.[0]?.error || "Envoi SMS refusé",
          );
        }

        sent += Number(result.sent) || 0;
        failed += Number(result.failed) || 0;
        if (typeof result.remainingCredits === "number") {
          remainingCredits = result.remainingCredits;
        }
        if (typeof result.used === "number") {
          used = result.used;
        }
        if (typeof result.monthlyLimit === "number") {
          monthlyLimit = result.monthlyLimit;
        }
      }

      applyQuota(remainingCredits, used, monthlyLimit);

      const nextCampaign: SmsCampaign = {
        id: Date.now(),
        name: campaignName.trim() || "Campagne SMS",
        audience: campaignAudience,
        message: campaignMessage,
        plannedAt: "Envoyé maintenant",
        recipients: sent,
        status: "Envoyé",
      };
      setCampaigns((current) => {
        const nextCampaigns = [nextCampaign, ...current];
        void saveSmsHistory(nextCampaigns, remainingCredits);
        return nextCampaigns;
      });
      setConfirmation(
        failed
          ? `${sent} SMS envoyés, ${failed} échec(s).`
          : `${sent} SMS envoyés via Brevo.`,
      );
    } catch (error) {
      setIsError(true);
      setConfirmation(
        error instanceof Error
          ? error.message
          : "Impossible d'envoyer la campagne SMS.",
      );
    } finally {
      setSending(false);
    }
  }

  async function planCampaign() {
    const recipients = campaignRecipients;

    if (!campaignMessage.trim()) {
      setIsError(true);
      setConfirmation("Écris le texte de la campagne SMS avant de planifier.");
      return;
    }

    if (!campaignDate || !campaignTime) {
      setIsError(true);
      setConfirmation("Choisis une date et une heure d’envoi.");
      return;
    }

    if (recipients.length === 0) {
      setIsError(true);
      setConfirmation(
        `Aucun numéro pour « ${campaignAudience} ». Vérifie les fiches avec un téléphone.`,
      );
      return;
    }

    setSending(true);
    setIsError(false);
    setConfirmation("Planification de la campagne SMS…");

    try {
      const campaignId = Date.now();
      const response = await fetch("/api/sms/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          kind: "campaign",
          centerId,
          centerName,
          campaignId,
          name: campaignName.trim() || "Campagne SMS",
          audience: campaignAudience,
          message: campaignMessage,
          date: campaignDate,
          time: campaignTime,
          recipients,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Impossible de planifier la campagne.");
      }

      const plannedLabel = `Le ${new Intl.DateTimeFormat("fr-FR").format(
        new Date(`${campaignDate}T${campaignTime}`),
      )} à ${campaignTime}`;
      const nextCampaign: SmsCampaign = {
        id: Number(result.campaignId) || campaignId,
        name: campaignName.trim() || "Campagne SMS",
        audience: campaignAudience,
        message: campaignMessage,
        plannedAt: plannedLabel,
        recipients: result.recipients ?? recipients.length,
        status: "Planifié",
      };

      setCampaigns((current) => {
        const nextCampaigns = [nextCampaign, ...current];
        void saveSmsHistory(nextCampaigns, credits);
        return nextCampaigns;
      });
      setIsError(false);
      setConfirmation(
        `Campagne SMS planifiée pour ${result.recipients ?? recipients.length} destinataire(s), ${plannedLabel}.`,
      );
    } catch (error) {
      setIsError(true);
      setConfirmation(
        error instanceof Error
          ? error.message
          : "Impossible de planifier la campagne SMS.",
      );
    } finally {
      setSending(false);
    }
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
              Ici tu écris seulement les textes. Un nouveau modèle apparaît tout de suite dans la suite d’automatisation, en bas. Variables : {"{{prenom}} {{nom}} {{date}} {{heure}} {{soin}} {{centre}} {{lien_confirmation}}"}.
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
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Suite d&apos;automatisation</h2>
            <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
              Actif = la case apparaît à la prise de RDV. Inactif = elle n’apparaît
              pas et le SMS ou le mail ne part pas. L’accueil prospect s’envoie
              depuis la fiche, pas depuis le rendez-vous.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          <AutomationRow
            title="1. Dès que le RDV est posé"
            hint="Actif : apparaît à la prise de RDV et part tout de suite. Inactif : masqué."
            templateId={smsSettings.confirmationTemplateId}
            templates={smsSettings.templates}
            enabled={smsSettings.confirmationEnabled}
            onTemplateChange={(value) =>
              void persistSmsSettings({
                ...smsSettings,
                confirmationTemplateId: value,
              })
            }
            onToggle={() =>
              void persistSmsSettings({
                ...smsSettings,
                confirmationEnabled: !smsSettings.confirmationEnabled,
              })
            }
          />
          <AutomationRow
            title="1 bis. Mail de confirmation RDV"
            hint="Actif : apparaît à la prise de RDV si un email client est renseigné. Inactif : masqué. Même texte que le SMS de confirmation, envoyé à l’email de la fiche."
            templateId={smsSettings.confirmationTemplateId}
            templates={smsSettings.templates}
            enabled={smsSettings.confirmationEmailEnabled}
            hideTemplate
            onTemplateChange={(value) =>
              void persistSmsSettings({
                ...smsSettings,
                confirmationTemplateId: value,
              })
            }
            onToggle={() =>
              void persistSmsSettings({
                ...smsSettings,
                confirmationEmailEnabled: !smsSettings.confirmationEmailEnabled,
              })
            }
          />
          <AutomationRow
            title="2. Contre-indications laser J-7"
            hint="Actif : apparaît à la prise de RDV laser. Inactif : masqué."
            templateId={smsSettings.reminderJ7TemplateId}
            templates={smsSettings.templates}
            enabled={smsSettings.reminderJ7Enabled}
            onTemplateChange={(value) =>
              void persistSmsSettings({
                ...smsSettings,
                reminderJ7TemplateId: value,
              })
            }
            onToggle={() =>
              void persistSmsSettings({
                ...smsSettings,
                reminderJ7Enabled: !smsSettings.reminderJ7Enabled,
              })
            }
          />
          <AutomationRow
            title="3. Rappel J-5"
            hint="Actif : apparaît à la prise de RDV. Inactif : masqué."
            templateId={smsSettings.reminderJ5TemplateId}
            templates={smsSettings.templates}
            enabled={smsSettings.reminderJ5Enabled}
            onTemplateChange={(value) =>
              void persistSmsSettings({
                ...smsSettings,
                reminderJ5TemplateId: value,
              })
            }
            onToggle={() =>
              void persistSmsSettings({
                ...smsSettings,
                reminderJ5Enabled: !smsSettings.reminderJ5Enabled,
              })
            }
          />
          <AutomationRow
            title="4. Rappel 48h"
            hint="Actif : apparaît à la prise de RDV. Inactif : masqué."
            templateId={smsSettings.reminder48hTemplateId}
            templates={smsSettings.templates}
            enabled={smsSettings.reminder48hEnabled}
            onTemplateChange={(value) =>
              void persistSmsSettings({
                ...smsSettings,
                reminder48hTemplateId: value,
              })
            }
            onToggle={() =>
              void persistSmsSettings({
                ...smsSettings,
                reminder48hEnabled: !smsSettings.reminder48hEnabled,
              })
            }
          />
          <AutomationRow
            title="5. Rappel 24h / la veille"
            hint="Actif : apparaît à la prise de RDV. Inactif : masqué."
            templateId={smsSettings.reminder24hTemplateId}
            templates={smsSettings.templates}
            enabled={smsSettings.reminder24hEnabled}
            onTemplateChange={(value) =>
              void persistSmsSettings({
                ...smsSettings,
                reminder24hTemplateId: value,
              })
            }
            onToggle={() =>
              void persistSmsSettings({
                ...smsSettings,
                reminder24hEnabled: !smsSettings.reminder24hEnabled,
              })
            }
          />
          <AutomationRow
            title="6. Accueil prospect"
            hint="Ne part pas avec le RDV. Tu l’envoies depuis la fiche prospect."
            templateId={smsSettings.leadWelcomeTemplateId}
            templates={smsSettings.templates}
            enabled={smsSettings.leadWelcomeEnabled}
            onTemplateChange={(value) =>
              void persistSmsSettings({
                ...smsSettings,
                leadWelcomeTemplateId: value,
              })
            }
            onToggle={() =>
              void persistSmsSettings({
                ...smsSettings,
                leadWelcomeEnabled: !smsSettings.leadWelcomeEnabled,
              })
            }
          />
          <AutomationRow
            title="7. Anniversaire"
            hint="Se coche sur la fiche cliente, pas à la prise de RDV. Le jour J, si la date de naissance est enregistrée."
            templateId={smsSettings.birthdayTemplateId}
            templates={smsSettings.templates}
            enabled={smsSettings.birthdaySmsEnabled}
            onTemplateChange={(value) =>
              void persistSmsSettings({
                ...smsSettings,
                birthdayTemplateId: value,
              })
            }
            onToggle={() =>
              void persistSmsSettings({
                ...smsSettings,
                birthdaySmsEnabled: !smsSettings.birthdaySmsEnabled,
              })
            }
          />
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

      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600">
            <Megaphone className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Campagne SMS</h2>
            <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
              Texte libre, envoyé aux leads ou clients du centre. Variables :{" "}
              {"{{prenom}}"}. Un SMS simple = {campaignSegments.singleLimit}{" "}
              caractères {campaignSegments.alphabetHint} ; le texte n’est pas
              limité.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {campaignAudienceOptions.map((option) => {
            const active = campaignAudience === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setCampaignAudience(option)}
                className={`rounded-2xl border px-4 py-3 text-left ${
                  active
                    ? "border-violet-300 bg-violet-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold">{option}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {campaignAudienceCounts[option]} destinataire
                  {campaignAudienceCounts[option] > 1 ? "s" : ""}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Input
            label="Nom de la campagne"
            value={campaignName}
            onChange={setCampaignName}
            placeholder="Offre de rentrée…"
          />
          <label className="space-y-2">
            <span className="text-xs font-medium text-slate-500">
              Reprendre un modèle
            </span>
            <select
              value=""
              onChange={(event) => {
                const template = smsSettings.templates.find(
                  (item) => item.id === event.target.value,
                );
                if (template) {
                  setCampaignMessage(template.body);
                }
              }}
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-base font-bold outline-none focus:border-blue-500"
            >
              <option value="">Texte personnalisé</option>
              {smsSettings.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Date d'envoi"
            type="date"
            value={campaignDate}
            onChange={setCampaignDate}
          />
          <Input
            label="Heure d'envoi"
            type="time"
            value={campaignTime}
            onChange={setCampaignTime}
          />
          <p className="text-sm font-medium text-slate-500 md:col-span-2">
            L’envoi part à cette date et cette heure (heure de Paris).
          </p>
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-medium text-slate-500">
              Message de la campagne
            </span>
            <textarea
              value={campaignMessage}
              onChange={(event) => setCampaignMessage(event.target.value)}
              className="min-h-36 w-full rounded-2xl border border-slate-200 p-4 text-base font-bold leading-7 outline-none focus:border-blue-500"
            />
            <p className="text-sm font-medium text-slate-500">
              {campaignSegments.length} caractère
              {campaignSegments.length > 1 ? "s" : ""} · un SMS ={" "}
              {campaignSegments.singleLimit} caractères{" "}
              {campaignSegments.alphabetHint} · ce texte ={" "}
              {campaignSegments.parts} SMS par destinataire.
            </p>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={sending}
            onClick={() => void planCampaign()}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 disabled:opacity-60"
          >
            {sending ? "Planification..." : "Planifier la campagne"}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendCampaignNow()}
            className="rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            {sending ? "Envoi..." : "Envoyer la campagne"}
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Aperçu</p>
          <p className="mt-3 whitespace-pre-wrap text-base font-bold leading-7 text-slate-700">
            {campaignMessage.replaceAll("{{prenom}}", "Marie")}
          </p>
          <p className="mt-3 font-semibold text-violet-600">
            {campaignRecipients.length} destinataire
            {campaignRecipients.length > 1 ? "s" : ""} · {campaignAudience}
          </p>
        </div>

        {campaigns.length > 0 ? (
          <div className="mt-5 grid gap-2">
            <p className="text-xs font-medium text-slate-500">
              Dernières campagnes
            </p>
            {campaigns.slice(0, 6).map((item) => (
              <article
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm font-medium text-slate-500">
                    {item.audience} · {item.recipients} destinataire
                    {item.recipients > 1 ? "s" : ""} · {item.plannedAt}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-700">
                  {item.status}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
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
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">Aperçu</p>
            <p className="mt-3 text-base font-bold leading-7 text-slate-700">
              {message.replace("{{prenom}}", "Marie")}
            </p>
            <p className="mt-3 font-semibold text-blue-600">
              {testPhone.trim() ? 1 : audienceRecipients.length} destinataire(s)
            </p>
          </div>
      </section>
    </main>
  );
}

function getAudienceRecipients(
  audience: string,
  data: { leads: Lead[]; clients: CrmClient[]; appointments: Appointment[] },
): SmsRecipient[] {
  if (audience === "Leads") {
    return uniqueRecipients(
      data.leads
        .filter((lead) => lead.phone)
        .map((lead) => ({
          phone: lead.phone,
          firstName: lead.firstName || "vous",
        })),
    );
  }

  if (audience === "Clients") {
    return uniqueRecipients(
      data.clients
        .filter((client) => client.phone)
        .map((client) => ({
          phone: client.phone,
          firstName: client.firstName || "vous",
        })),
    );
  }

  if (audience === "Leads RDV pris") {
    return uniqueRecipients(
      data.leads
        .filter(
          (lead) =>
            (lead.status === "RDV pris" || lead.status === "RDV confirmé") &&
            lead.phone,
        )
        .map((lead) => ({
          phone: lead.phone,
          firstName: lead.firstName || "vous",
        })),
    );
  }

  if (audience === "Leads à relancer") {
    return uniqueRecipients(
      data.leads
        .filter((lead) => lead.status === "À relancer" && lead.phone)
        .map((lead) => ({
          phone: lead.phone,
          firstName: lead.firstName || "vous",
        })),
    );
  }

  if (audience === "Leads reviendra vers nous") {
    return uniqueRecipients(
      data.leads
        .filter((lead) => lead.status === "Reviendra vers nous" && lead.phone)
        .map((lead) => ({
          phone: lead.phone,
          firstName: lead.firstName || "vous",
        })),
    );
  }

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

function chunkRecipients(recipients: SmsRecipient[], size: number) {
  const chunks: SmsRecipient[][] = [];
  for (let index = 0; index < recipients.length; index += size) {
    chunks.push(recipients.slice(index, index + size));
  }
  return chunks;
}

function smsSegmentInfo(text: string) {
  const gsm = gsmSeptetLength(text);
  if (gsm != null) {
    const parts = gsm <= 160 ? 1 : Math.ceil(gsm / 153);
    return {
      length: gsm,
      singleLimit: 160,
      parts,
      alphabetHint: "(alphabet standard)",
    };
  }

  const length = Array.from(text).length;
  const parts = length <= 70 ? 1 : Math.ceil(length / 67);
  return {
    length,
    singleLimit: 70,
    parts,
    alphabetHint: "(accents ou emoji)",
  };
}

function gsmSeptetLength(text: string) {
  const basic =
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
  const extended = "^{}\\[~]|€";
  let length = 0;

  for (const char of text) {
    if (extended.includes(char)) {
      length += 2;
      continue;
    }
    if (!basic.includes(char)) {
      return null;
    }
    length += 1;
  }

  return length;
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

function AutomationRow({
  title,
  hint,
  templateId,
  templates,
  enabled,
  hideTemplate,
  onTemplateChange,
  onToggle,
}: {
  title: string;
  hint: string;
  templateId: string;
  templates: SmsTemplate[];
  enabled: boolean;
  hideTemplate?: boolean;
  onTemplateChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-xs font-medium leading-4 text-slate-500">{hint}</p>
      </div>
      {hideTemplate ? (
        <p className="text-sm font-semibold text-slate-500">
          Même modèle que le SMS de confirmation
        </p>
      ) : (
      <select
        value={templateId}
        onChange={(event) => onTemplateChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-blue-500"
      >
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
      )}
      <button
        type="button"
        onClick={onToggle}
        className={`h-12 rounded-2xl px-5 text-sm font-semibold ${
          enabled
            ? "bg-emerald-100 text-emerald-700"
            : "bg-white text-slate-500"
        }`}
      >
        {enabled ? "Actif" : "Inactif"}
      </button>
    </div>
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
