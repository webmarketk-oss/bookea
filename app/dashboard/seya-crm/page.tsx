"use client";

import {
  AlertTriangle,
  Bot,
  CalendarCheck,
  CheckCircle2,
  MessageCircle,
  Send,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { cabins, practitioners } from "@/lib/agenda-data";
import {
  createCrmAppointment,
  loadCrmAppointments,
} from "@/lib/agenda-supabase";
import {
  defaultCenterDepositLinks,
  readCenterSettings,
  type CenterDepositLinkSetting,
} from "@/lib/center-settings";
import { defaultCenterDayHours, loadCenterHours } from "@/lib/center-hours";
import { todayIso } from "@/lib/crm-stats";
import {
  addCrmLeadActivity,
  loadCrmClients,
  loadCrmLeads,
  updateCrmLeadNextAction,
  updateCrmLeadStatus,
} from "@/lib/crm-supabase";
import { inactiveLeadStatuses } from "@/lib/lead-statuses";
import {
  applyLeadReply,
  lastSeyaMessage,
  startSeyaConversation,
  suggestAvailableSlots,
  whatsappHref,
} from "@/lib/seya-agent";
import {
  defaultSeyaAgentSettings,
  loadSeyaAgentSettings,
  readLocalSeyaConversations,
  saveSeyaAgentSettings,
  saveSeyaConversations,
  writeLocalSeyaConversations,
  type SeyaAgentSettings,
  type SeyaConversation,
} from "@/lib/seya-settings";
import { formatSharedWhatsAppNumber } from "@/lib/seya-whatsapp";
import type { Appointment } from "@/types/agenda";
import type { Lead } from "@/types/lead";

type TaskStatus = "À valider" | "Prêt" | "Envoyé";
type Priority = "Haute" | "Moyenne" | "Basse";

type SeyaTask = {
  id: number;
  title: string;
  client: string;
  phone: string;
  channel: "WhatsApp" | "SMS" | "Email" | "Agenda";
  priority: Priority;
  status: TaskStatus;
  suggestion: string;
};

function isBirthdayToday(value?: string | null) {
  if (!value) {
    return false;
  }

  const isoMatch = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  const frMatch = value.match(/(\d{2})\/(\d{2})(?:\/\d{4})?/);
  const monthDay = isoMatch
    ? `${isoMatch[2]}-${isoMatch[3]}`
    : frMatch
      ? `${frMatch[2]}-${frMatch[1]}`
      : "";

  return Boolean(monthDay) && todayIso().slice(5) === monthDay;
}

function buildSeyaTasks({
  leads,
  appointments,
  clients,
}: {
  leads: Awaited<ReturnType<typeof loadCrmLeads>>["leads"];
  appointments: Awaited<ReturnType<typeof loadCrmAppointments>>;
  clients: Awaited<ReturnType<typeof loadCrmClients>>["clients"];
}): SeyaTask[] {
  const today = todayIso();
  const tasks: SeyaTask[] = [];
  let nextId = 1;

  for (const client of clients.filter((item) => item.balanceDue > 0).slice(0, 4)) {
    tasks.push({
      id: nextId++,
      title: "Relancer acompte en attente",
      client: `${client.firstName} ${client.lastName}`.trim(),
      phone: client.phone,
      channel: "SMS",
      priority: "Haute",
      status: "À valider",
      suggestion: `Bonjour ${client.firstName}, un reste dû de ${client.balanceDue.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} est encore ouvert. Vous pouvez régler l'acompte pour sécuriser votre soin.`,
    });
  }

  for (const appointment of appointments
    .filter(
      (item) =>
        item.date === today &&
        item.status === "À confirmer" &&
        (!item.kind || item.kind === "Rendez-vous"),
    )
    .slice(0, 4)) {
    tasks.push({
      id: nextId++,
      title: "Confirmer le rendez-vous du jour",
      client: appointment.personName,
      phone: appointment.phone,
      channel: "SMS",
      priority: "Moyenne",
      status: "Prêt",
      suggestion: `Rappel Bookea : votre rendez-vous est prévu aujourd'hui à ${appointment.start} pour ${appointment.treatment}.`,
    });
  }

  for (const lead of leads
    .filter(
      (item) =>
        item.reminderDate === today && !inactiveLeadStatuses.includes(item.status),
    )
    .slice(0, 4)) {
    tasks.push({
      id: nextId++,
      title: "Relancer le prospect prévu aujourd'hui",
      client: `${lead.firstName} ${lead.lastName}`.trim(),
      phone: lead.phone,
      channel: "WhatsApp",
      priority: "Haute",
      status: "À valider",
      suggestion: `Bonjour ${lead.firstName}, je reviens vers vous concernant ${lead.treatment || "votre projet"}. Souhaitez-vous que je vous propose un créneau ?`,
    });
  }

  for (const client of clients.filter((item) => isBirthdayToday(item.birthDate)).slice(0, 2)) {
    tasks.push({
      id: nextId++,
      title: "Anniversaire cliente",
      client: `${client.firstName} ${client.lastName}`.trim(),
      phone: client.phone,
      channel: "Email",
      priority: "Basse",
      status: "Prêt",
      suggestion: `Joyeux anniversaire ${client.firstName}. Votre centre vous offre une attention sur votre prochain soin.`,
    });
  }

  return tasks;
}

const priorityStyles: Record<Priority, string> = {
  Haute: "bg-rose-100 text-rose-700 border-rose-200",
  Moyenne: "bg-orange-100 text-orange-700 border-orange-200",
  Basse: "bg-blue-100 text-blue-700 border-blue-200",
};

const channelStyles: Record<SeyaTask["channel"], string> = {
  WhatsApp: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SMS: "bg-blue-50 text-blue-700 border-blue-200",
  Email: "bg-violet-50 text-violet-700 border-violet-200",
  Agenda: "bg-amber-50 text-amber-700 border-amber-200",
};

const conversationStatusStyles: Record<SeyaConversation["status"], string> = {
  "À envoyer": "bg-amber-100 text-amber-800",
  "En cours": "bg-blue-100 text-blue-700",
  Qualifié: "bg-violet-100 text-violet-700",
  "RDV proposé": "bg-cyan-100 text-cyan-800",
  "RDV pris": "bg-emerald-100 text-emerald-700",
  Terminé: "bg-slate-100 text-slate-600",
};

function shouldStartConversation(lead: Lead, conversations: SeyaConversation[]) {
  if (!lead.phone.trim()) {
    return false;
  }

  if (conversations.some((item) => item.leadId === lead.id)) {
    return false;
  }

  if (inactiveLeadStatuses.includes(lead.status)) {
    return false;
  }

  if (
    ["RDV pris", "RDV confirmé", "Client converti", "Vendu", "Acompte reçu"].includes(
      lead.status,
    )
  ) {
    return false;
  }

  return lead.status === "Nouveau" || lead.nextAction === "À contacter";
}

export default function SeyaCrmPage() {
  const [tasks, setTasks] = useState<SeyaTask[]>([]);
  const [prompt, setPrompt] = useState(
    "Prépare les relances prioritaires du jour et évite les doublons.",
  );
  const [summary, setSummary] = useState("Analyse du centre en cours…");
  const [depositLinks, setDepositLinks] =
    useState<CenterDepositLinkSetting[]>(defaultCenterDepositLinks);
  const [selectedDepositLinkId, setSelectedDepositLinkId] = useState(
    String(defaultCenterDepositLinks[0]?.id ?? ""),
  );
  const [centerId, setCenterId] = useState("");
  const [centerName, setCenterName] = useState("le centre");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [hours, setHours] = useState(defaultCenterDayHours);
  const [agentSettings, setAgentSettings] = useState<SeyaAgentSettings>(
    defaultSeyaAgentSettings,
  );
  const [conversations, setConversations] = useState<SeyaConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    null,
  );
  const [reply, setReply] = useState("");
  const [savingAgent, setSavingAgent] = useState(false);
  const [agentFeedback, setAgentFeedback] = useState("");
  const [sharedNumber, setSharedNumber] = useState("Numéro Bookea unique");
  const [whatsappConnected, setWhatsappConnected] = useState(false);

  const stats = useMemo(
    () => ({
      urgent: tasks.filter((task) => task.priority === "Haute").length,
      ready: tasks.filter((task) => task.status === "Prêt").length,
      sent: tasks.filter((task) => task.status === "Envoyé").length,
      pending: tasks.filter((task) => task.status !== "Envoyé").length,
    }),
    [tasks],
  );

  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ??
    conversations[0] ??
    null;

  const availableSlots = useMemo(
    () =>
      suggestAvailableSlots({
        appointments,
        hours,
      }),
    [appointments, hours],
  );

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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [leadData, appointmentData, clientData, seya, centerHours] =
          await Promise.all([
            loadCrmLeads(),
            loadCrmAppointments(),
            loadCrmClients(),
            loadSeyaAgentSettings().catch(() => ({
              centerId: "",
              centerName: "le centre",
              settings: defaultSeyaAgentSettings,
              conversations: [],
            })),
            loadCenterHours().catch(() => defaultCenterDayHours),
          ]);

        if (cancelled) {
          return;
        }

        const storedConversations = seya.conversations?.length
          ? seya.conversations
          : seya.centerId
            ? readLocalSeyaConversations(seya.centerId)
            : [];
        const nextConversations = seya.settings.whatsappAgentEnabled
          ? [
              ...storedConversations,
              ...leadData.leads
                .filter((lead) => shouldStartConversation(lead, storedConversations))
                .map((lead) =>
                  startSeyaConversation({
                    lead,
                    centerName: seya.centerName,
                    settings: seya.settings,
                  }),
                ),
            ]
          : storedConversations;

        if (seya.centerId) {
          writeLocalSeyaConversations(seya.centerId, nextConversations);
          void saveSeyaConversations(nextConversations).catch(() => null);
        }

        setCenterId(seya.centerId);
        setCenterName(seya.centerName);
        setLeads(leadData.leads);
        setAppointments(appointmentData);
        setHours(centerHours);
        setAgentSettings(seya.settings);
        setConversations(nextConversations);
        setSelectedConversationId((current) =>
          current && nextConversations.some((item) => item.id === current)
            ? current
            : (nextConversations[0]?.id ?? null),
        );

        const nextTasks = buildSeyaTasks({
          leads: leadData.leads,
          appointments: appointmentData,
          clients: clientData.clients,
        });
        setTasks(nextTasks);
        setSummary(
          nextTasks.length === 0
            ? "Aucune action prioritaire détectée sur ce centre pour aujourd'hui."
            : `${nextTasks.length} action${nextTasks.length > 1 ? "s" : ""} détectée${nextTasks.length > 1 ? "s" : ""} à partir des leads, rendez-vous et soldes du centre.`,
        );
      } catch {
        if (!cancelled) {
          setTasks([]);
          setSummary("Impossible de charger les actions Seya de ce centre.");
        }
      }
    }

    void load();
    void fetch("/api/seya/whatsapp")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setSharedNumber(
          payload?.number
            ? formatSharedWhatsAppNumber(String(payload.number))
            : "Numéro Bookea unique",
        );
        setWhatsappConnected(Boolean(payload?.connected));
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDepositLink =
    depositLinks.find((link) => String(link.id) === selectedDepositLinkId) ??
    depositLinks[0] ??
    defaultCenterDepositLinks[0];

  function persistConversations(next: SeyaConversation[]) {
    setConversations(next);
    if (centerId) {
      writeLocalSeyaConversations(centerId, next);
      void saveSeyaConversations(next).catch(() => null);
    }
  }

  function updateConversation(next: SeyaConversation) {
    persistConversations(
      conversations.map((item) => (item.id === next.id ? next : item)),
    );
  }

  async function persistAgentSettings(next: SeyaAgentSettings) {
    setAgentSettings(next);
    setSavingAgent(true);
    try {
      await saveSeyaAgentSettings(next);
      setAgentFeedback("Réglages de l’agent enregistrés pour ce centre.");
    } catch {
      setAgentFeedback("Impossible d’enregistrer les réglages de l’agent.");
    } finally {
      setSavingAgent(false);
    }
  }

  async function sendWhatsApp(conversation: SeyaConversation) {
    const message = lastSeyaMessage(conversation);
    if (!message || !conversation.phone.trim()) {
      setAgentFeedback("Ce prospect n’a pas de numéro WhatsApp.");
      return;
    }

    window.open(whatsappHref(conversation.phone, message.text), "_blank");
    const next: SeyaConversation = {
      ...conversation,
      status: conversation.status === "À envoyer" ? "En cours" : conversation.status,
      updatedAt: new Date().toISOString(),
    };
    updateConversation(next);

    const lead = leads.find((item) => item.id === conversation.leadId);
    try {
      await addCrmLeadActivity(
        conversation.leadId,
        `Seya WhatsApp : ${message.text}`,
      );
      await updateCrmLeadNextAction(conversation.leadId, "Agent Seya WhatsApp");
      if (lead && lead.status === "Nouveau") {
        await updateCrmLeadStatus(lead, "Message WhatsApp envoyé");
      }
    } catch {
      // The WhatsApp window still opens even if the CRM note fails.
    }
  }

  async function submitLeadReply(nextReply?: string) {
    if (!selectedConversation) {
      return;
    }

    const text = (nextReply ?? reply).trim();
    if (!text) {
      return;
    }

    const result = applyLeadReply(
      selectedConversation,
      text,
      agentSettings,
      availableSlots,
    );
    updateConversation(result.conversation);
    setReply("");

    if (!result.shouldBook) {
      return;
    }

    const lead = leads.find((item) => item.id === selectedConversation.leadId);
    const treatment =
      result.conversation.qualification.need ||
      selectedConversation.treatment ||
      "Soin à préciser";

    try {
      const created = await createCrmAppointment({
        id: `seya-${Date.now()}`,
        personName: `${selectedConversation.firstName} ${selectedConversation.lastName}`.trim(),
        phone: selectedConversation.phone,
        treatment,
        practitionerId: practitioners[0]?.id ?? "samantha",
        cabinId: cabins[0]?.id ?? "cabine-1",
        date: result.shouldBook.date,
        start: result.shouldBook.time,
        duration: 60,
        status: "À confirmer",
        source: "Seya",
        notes: "RDV pris par l’agent Seya WhatsApp",
      });
      setAppointments((current) => [...current, created]);
      if (lead) {
        await updateCrmLeadStatus(lead, "RDV pris");
      }
      await addCrmLeadActivity(
        selectedConversation.leadId,
        `RDV Seya posé le ${result.shouldBook.label}.`,
      );
      setAgentFeedback(`Rendez-vous posé dans l’agenda : ${result.shouldBook.label}.`);
    } catch {
      setAgentFeedback("L’agent a validé le créneau, mais le rendez-vous n’a pas pu être écrit dans l’agenda.");
    }
  }

  function validateTask(id: number) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, status: "Prêt" } : task,
      ),
    );
  }

  function sendTask(id: number) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, status: "Envoyé" } : task,
      ),
    );
  }

  function sendDepositSms(task: SeyaTask) {
    if (!selectedDepositLink) return;
    const message = `${selectedDepositLink.message} ${selectedDepositLink.url}`.trim();
    const phone = task.phone.replace(/\s+/g, "");
    window.location.assign(`sms:${phone}?&body=${encodeURIComponent(message)}`);
    sendTask(task.id);
  }

  function runSeya() {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) return;
    setSummary(
      `Seya a analysé la demande : "${cleanPrompt}". Les actions ont été priorisées et attendent validation humaine avant envoi automatique.`,
    );
  }

  return (
    <main
      className="min-h-screen bg-[#eef3f9] px-6 py-6 text-slate-950"
      data-sidebar-collapse-area="true"
    >
      <section className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-600">Bookea Agent IA</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Seya CRM</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Un seul numéro WhatsApp Bookea pour tous les centres. Les leads, le
            planning et les consignes restent ceux de ce centre.
          </p>
        </div>
        <button
          type="button"
          onClick={runSeya}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-sm"
        >
          <Wand2 className="h-6 w-6" />
          Lancer l&apos;analyse
        </button>
      </section>

      <section className="mb-6 rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Agent WhatsApp Seya</h2>
            <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
              Le prospect écrit toujours au même numéro Bookea. Seya retrouve le
              centre du lead, applique les consignes de ce centre, et ne propose
              que les créneaux de ce planning.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800">{sharedNumber}</p>
          <p className="mt-1 text-xs font-medium text-emerald-700">
            {whatsappConnected
              ? "Numéro partagé connecté. Chaque centre garde son CRM, son planning et ses automatisations."
              : "Même numéro pour tout le monde. On le connecte ensemble ; en attendant, Envoyer sur WhatsApp ouvre le message de ce centre."}
          </p>
        </div>

        <div className="mt-5 grid gap-3">
          <ToggleRow
            title="Dès qu’un lead s’inscrit"
            hint="Nouveau prospect avec un téléphone : Seya prépare la conversation tout de suite."
            enabled={agentSettings.whatsappAgentEnabled}
            onToggle={() =>
              void persistAgentSettings({
                ...agentSettings,
                whatsappAgentEnabled: !agentSettings.whatsappAgentEnabled,
              })
            }
          />
          <ToggleRow
            title="Qualifier le besoin"
            hint="Seya demande le soin, la zone et le délai avant de proposer un RDV."
            enabled={agentSettings.qualifyOnSignup}
            onToggle={() =>
              void persistAgentSettings({
                ...agentSettings,
                qualifyOnSignup: !agentSettings.qualifyOnSignup,
              })
            }
          />
          <ToggleRow
            title="Prendre un rendez-vous"
            hint="Après qualification, Seya propose 2 ou 3 créneaux libres et les écrit dans l’agenda."
            enabled={agentSettings.bookAppointment}
            onToggle={() =>
              void persistAgentSettings({
                ...agentSettings,
                bookAppointment: !agentSettings.bookAppointment,
              })
            }
          />
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-xs font-medium text-slate-500">
            Consignes générales
          </span>
          <textarea
            value={agentSettings.brief}
            onChange={(event) =>
              setAgentSettings((current) => ({
                ...current,
                brief: event.target.value,
              }))
            }
            onBlur={() => void persistAgentSettings(agentSettings)}
            rows={3}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium leading-6 text-slate-700 outline-none focus:border-emerald-500"
          />
        </label>

        <div className="mt-5">
          <p className="text-xs font-medium text-slate-500">
            Consignes selon le soin demandé
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Seya lit le soin du lead (formulaire, Meta, fiche) et applique la
            consigne correspondante.
          </p>
          <div className="mt-3 grid gap-3">
            {agentSettings.treatmentBriefs.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[180px_1fr]"
              >
                <input
                  value={item.name}
                  onChange={(event) =>
                    setAgentSettings((current) => ({
                      ...current,
                      treatmentBriefs: current.treatmentBriefs.map((brief, briefIndex) =>
                        briefIndex === index
                          ? { ...brief, name: event.target.value }
                          : brief,
                      ),
                    }))
                  }
                  onBlur={() => void persistAgentSettings(agentSettings)}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
                <textarea
                  value={item.brief}
                  onChange={(event) =>
                    setAgentSettings((current) => ({
                      ...current,
                      treatmentBriefs: current.treatmentBriefs.map((brief, briefIndex) =>
                        briefIndex === index
                          ? { ...brief, brief: event.target.value }
                          : brief,
                      ),
                    }))
                  }
                  onBlur={() => void persistAgentSettings(agentSettings)}
                  rows={2}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-5 text-slate-700 outline-none focus:border-emerald-500"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              void persistAgentSettings({
                ...agentSettings,
                treatmentBriefs: [
                  ...agentSettings.treatmentBriefs,
                  { name: "Nouveau soin", brief: "" },
                ],
              })
            }
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Ajouter un soin
          </button>
        </div>
        <p className="mt-2 text-xs font-medium text-slate-400">
          {savingAgent ? "Enregistrement…" : agentFeedback || `Centre : ${centerName}`}
        </p>
      </section>

      <section className="mb-6 grid gap-4 xl:grid-cols-[280px_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Conversations agent</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {conversations.length} lead
            {conversations.length > 1 ? "s" : ""} pris en charge.
          </p>
          <div className="mt-4 grid gap-2">
            {conversations.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-500">
                Aucun nouveau lead à qualifier pour l’instant.
              </p>
            ) : null}
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                  setReply("");
                }}
                className={`rounded-2xl border px-4 py-3 text-left ${
                  selectedConversation?.id === conversation.id
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="text-sm font-semibold">
                  {conversation.firstName} {conversation.lastName}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {conversation.treatment || "Soin à préciser"}
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${conversationStatusStyles[conversation.status]}`}
                >
                  {conversation.status}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {selectedConversation ? (
            <>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-base font-semibold">
                    {selectedConversation.firstName} {selectedConversation.lastName}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {selectedConversation.phone || "Pas de téléphone"} ·{" "}
                    {selectedConversation.qualification.need ||
                      selectedConversation.treatment ||
                      "Besoin à qualifier"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void sendWhatsApp(selectedConversation)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
                >
                  <MessageCircle className="h-5 w-5" />
                  Envoyer sur WhatsApp
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                {selectedConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-3xl rounded-2xl px-4 py-3 text-sm font-medium leading-6 ${
                      message.author === "lead"
                        ? "ml-auto bg-slate-100 text-slate-800"
                        : "bg-emerald-50 text-emerald-900"
                    }`}
                  >
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {message.author === "lead" ? "Prospect" : "Seya"}
                    </p>
                    <p className="whitespace-pre-wrap">{message.text}</p>
                  </div>
                ))}
              </div>

              {selectedConversation.proposedSlots.length > 0 ? (
                <div className="mt-5 grid gap-2 md:grid-cols-3">
                  {selectedConversation.proposedSlots.map((slot) => (
                    <button
                      key={`${slot.date}-${slot.time}`}
                      type="button"
                      onClick={() =>
                        void submitLeadReply(
                          String(selectedConversation.proposedSlots.indexOf(slot) + 1),
                        )
                      }
                      className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-800"
                    >
                      <CalendarCheck className="mb-1 h-4 w-4" />
                      {slot.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitLeadReply();
                    }
                  }}
                  placeholder="Collez ici la réponse WhatsApp du prospect…"
                  className="h-12 rounded-2xl border border-slate-200 px-4 text-sm font-medium outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => void submitLeadReply()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
                >
                  <Send className="h-4 w-4" />
                  Faire répondre Seya
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm font-medium text-slate-500">
              Active l’agent, puis un nouveau lead avec téléphone apparaîtra ici.
            </p>
          )}
        </div>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard title="Priorité haute" value={stats.urgent} color="text-rose-600" icon={<AlertTriangle />} />
        <StatCard title="Messages prêts" value={stats.ready} color="text-blue-600" icon={<MessageCircle />} />
        <StatCard title="Actions envoyées" value={stats.sent} color="text-emerald-600" icon={<CheckCircle2 />} />
        <StatCard title="À traiter" value={stats.pending} color="text-violet-600" icon={<Users />} />
      </section>

      <section className="mb-6 rounded-3xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-violet-700">
              Demander à Seya
            </span>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="h-12 w-full rounded-2xl border border-violet-200 bg-white px-4 text-base font-bold outline-none focus:border-violet-500"
            />
          </label>
          <button
            type="button"
            onClick={runSeya}
            className="self-end rounded-2xl bg-violet-600 px-4 py-3 text-sm font-medium text-white"
          >
            Préparer
          </button>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-white p-4 text-violet-700">
          <Sparkles className="mt-1 h-6 w-6 shrink-0" />
          <p className="text-sm font-bold leading-6">{summary}</p>
        </div>
      </section>

      <section className="grid gap-4">
        {tasks.length === 0 ? (
          <p className="rounded-3xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500 shadow-sm">
            Aucune tâche Seya pour ce centre aujourd&apos;hui.
          </p>
        ) : null}
        {tasks.map((task) => (
          <article
            key={task.id}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-sm font-medium ${priorityStyles[task.priority]}`}>
                    {task.priority}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-sm font-medium ${channelStyles[task.channel]}`}>
                    {task.channel}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                    {task.status}
                  </span>
                </div>
                <h2 className="mt-4 text-sm font-medium">{task.title}</h2>
                <p className="mt-1 text-base font-bold text-slate-500">{task.client}</p>
                <p className="mt-4 max-w-4xl rounded-2xl bg-slate-50 p-4 text-base font-semibold leading-7 text-slate-700">
                  {task.suggestion}
                </p>
                {task.title.toLowerCase().includes("acompte") && (
                  <div className="mt-4 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:grid-cols-[1fr_auto]">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-blue-700">
                        Lien d&apos;acompte à envoyer
                      </span>
                      <select
                        value={selectedDepositLinkId}
                        onChange={(event) =>
                          setSelectedDepositLinkId(event.target.value)
                        }
                        className="h-12 w-full rounded-2xl border border-blue-200 bg-white px-4 text-sm font-medium text-slate-800 outline-none"
                      >
                        {depositLinks.map((link) => (
                          <option key={link.id} value={link.id}>
                            {link.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => sendDepositSms(task)}
                      className="self-end rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white"
                    >
                      SMS acompte
                    </button>
                    <p className="text-sm font-semibold leading-6 text-blue-700 md:col-span-2">
                      {selectedDepositLink?.message}{" "}
                      <span className="font-semibold">{selectedDepositLink?.url}</span>
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => validateTask(task.id)}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700"
                >
                  Valider
                </button>
                <button
                  type="button"
                  onClick={() => sendTask(task.id)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white"
                >
                  <Send className="h-5 w-5" />
                  Envoyer
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function ToggleRow({
  title,
  hint,
  enabled,
  onToggle,
}: {
  title: string;
  hint: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-xs font-medium leading-4 text-slate-500">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`h-12 rounded-2xl px-5 text-sm font-semibold ${
          enabled ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-500"
        }`}
      >
        {enabled ? "Oui" : "Non"}
      </button>
    </div>
  );
}

function StatCard({
  title,
  value,
  color,
  icon,
}: {
  title: string;
  value: number;
  color: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`mt-3 text-xl font-semibold ${color}`}>{value}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}
