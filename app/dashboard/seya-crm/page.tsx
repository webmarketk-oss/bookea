"use client";

import { Bot } from "lucide-react";
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
  sortSeyaInbox,
  writeLocalSeyaConversations,
  type SeyaAgentSettings,
  type SeyaConversation,
} from "@/lib/seya-settings";
import {
  BOOKEA_SHARED_WHATSAPP_NUMBER,
  formatSharedWhatsAppNumber,
} from "@/lib/seya-whatsapp";
import { SeyaInbox } from "@/components/seya/seya-inbox";
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

function shouldStartConversation(
  lead: Lead,
  conversations: SeyaConversation[],
  autoStart = true,
) {
  if (!autoStart || !lead.phone.trim()) {
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
  const [sharedNumber, setSharedNumber] = useState(
    formatSharedWhatsAppNumber(BOOKEA_SHARED_WHATSAPP_NUMBER),
  );
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [view, setView] = useState<"inbox" | "settings">("inbox");

  const stats = useMemo(
    () => ({
      urgent: tasks.filter((task) => task.priority === "Haute").length,
      ready: tasks.filter((task) => task.status === "Prêt").length,
      sent: tasks.filter((task) => task.status === "Envoyé").length,
      pending: tasks.filter((task) => task.status !== "Envoyé").length,
    }),
    [tasks],
  );

  const inbox = useMemo(() => sortSeyaInbox(conversations), [conversations]);

  const selectedConversation =
    inbox.find((item) => item.id === selectedConversationId) ??
    inbox[0] ??
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
                .filter((lead) =>
                  shouldStartConversation(
                    lead,
                    storedConversations,
                    seya.settings.autoMessageOnNewLead,
                  ),
                )
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

    if (whatsappConnected) {
      setAgentFeedback("Envoi depuis le numéro Bookea…");
      try {
        const response = await fetch("/api/seya/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            phone: conversation.phone,
            text: message.text,
            firstName: conversation.firstName,
            centerName,
            treatment:
              conversation.qualification?.need || conversation.treatment || "",
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          sent?: boolean;
          reason?: string;
          error?: string;
        };
        if (!payload.sent) {
          if (payload.reason === "template_required") {
            setAgentFeedback(
              "Meta exige un modèle pour le premier message. On le crée ensuite dans le Gestionnaire WhatsApp.",
            );
          } else {
            setAgentFeedback(
              payload.error || "L’envoi Bookea a échoué. Réessaie dans une minute.",
            );
          }
          return;
        }
        setAgentFeedback(
          `Message envoyé depuis ${formatSharedWhatsAppNumber()} (Bookea).`,
        );
      } catch {
        setAgentFeedback("Impossible de joindre l’API WhatsApp Bookea.");
        return;
      }
    } else {
      window.open(whatsappHref(conversation.phone, message.text), "_blank");
    }

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
      className="min-h-screen bg-[#eef3f9] px-4 py-4 text-slate-950 sm:px-6"
      data-sidebar-collapse-area="true"
    >
      <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {centerName} · {sharedNumber}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Seya</h1>
        </div>
        <div className="flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => setView("inbox")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              view === "inbox" ? "bg-slate-950 text-white" : "text-slate-600"
            }`}
          >
            Messagerie
          </button>
          <button
            type="button"
            onClick={() => setView("settings")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              view === "settings" ? "bg-slate-950 text-white" : "text-slate-600"
            }`}
          >
            Réglages
          </button>
        </div>
      </section>

      {view === "inbox" ? (
        <SeyaInbox
          inbox={inbox}
          selected={selectedConversation}
          leads={leads}
          settings={agentSettings}
          reply={reply}
          feedback={agentFeedback}
          onSelect={(id) => {
            setSelectedConversationId(id);
            setReply("");
          }}
          onReplyChange={setReply}
          onSendReply={() => void submitLeadReply()}
          onSendWhatsApp={() => {
            if (selectedConversation) {
              void sendWhatsApp(selectedConversation);
            }
          }}
          onPickSlot={(index) => void submitLeadReply(index)}
        />
      ) : null}

      {view === "settings" ? (
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
            title="WhatsApp Seya activé"
            hint="Si c’est off, Seya ne parle pas pour ce centre (ex. Gap)."
            enabled={agentSettings.whatsappAgentEnabled}
            onToggle={() =>
              void persistAgentSettings({
                ...agentSettings,
                whatsappAgentEnabled: !agentSettings.whatsappAgentEnabled,
              })
            }
          />
          <ToggleRow
            title="Message dès qu’un lead arrive"
            hint="Seya ouvre la conversation dès qu’un prospect avec téléphone entre dans le CRM."
            enabled={agentSettings.autoMessageOnNewLead}
            onToggle={() =>
              void persistAgentSettings({
                ...agentSettings,
                autoMessageOnNewLead: !agentSettings.autoMessageOnNewLead,
              })
            }
          />
          <ToggleRow
            title="Qualifier le besoin"
            hint="Seya cherche le soin, la zone et le délai. Elle ne pose pas de RDV toute seule."
            enabled={agentSettings.qualifyOnSignup}
            onToggle={() =>
              void persistAgentSettings({
                ...agentSettings,
                qualifyOnSignup: !agentSettings.qualifyOnSignup,
              })
            }
          />
          <ToggleRow
            title="Demander s’ils veulent un RDV"
            hint="Après qualification : « une conseillère vous contacte » si oui. Pas de créneau posé."
            enabled={agentSettings.askForAppointment}
            onToggle={() =>
              void persistAgentSettings({
                ...agentSettings,
                askForAppointment: !agentSettings.askForAppointment,
              })
            }
          />
          <ToggleRow
            title="Laisser Seya poser le RDV dans l’agenda"
            hint="Off par défaut. À activer seulement si le centre veut que l’IA booke."
            enabled={agentSettings.bookAppointment}
            onToggle={() =>
              void persistAgentSettings({
                ...agentSettings,
                bookAppointment: !agentSettings.bookAppointment,
              })
            }
          />
          <ToggleRow
            title="Relances J+1, J+5, J+30"
            hint="Si le lead est encore en attente, Seya relance le lendemain, à 5 jours, puis une dernière fois à 30 jours."
            enabled={agentSettings.relanceEnabled}
            onToggle={() =>
              void persistAgentSettings({
                ...agentSettings,
                relanceEnabled: !agentSettings.relanceEnabled,
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
            Offres campagne → texte WhatsApp
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Si le CRM a « offre 99 », Seya dit « séance découverte à 99€ », jamais le code.
          </p>
          <div className="mt-3 grid gap-3">
            {agentSettings.offerMaps.map((item, index) => (
              <div
                key={`${item.match}-${index}`}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[180px_1fr]"
              >
                <input
                  value={item.match}
                  onChange={(event) =>
                    setAgentSettings((current) => ({
                      ...current,
                      offerMaps: current.offerMaps.map((offer, offerIndex) =>
                        offerIndex === index
                          ? { ...offer, match: event.target.value }
                          : offer,
                      ),
                    }))
                  }
                  onBlur={() => void persistAgentSettings(agentSettings)}
                  placeholder="offre 99"
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
                <input
                  value={item.label}
                  onChange={(event) =>
                    setAgentSettings((current) => ({
                      ...current,
                      offerMaps: current.offerMaps.map((offer, offerIndex) =>
                        offerIndex === index
                          ? { ...offer, label: event.target.value }
                          : offer,
                      ),
                    }))
                  }
                  onBlur={() => void persistAgentSettings(agentSettings)}
                  placeholder="une séance découverte cryo à 99€"
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-emerald-500"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              void persistAgentSettings({
                ...agentSettings,
                offerMaps: [
                  ...agentSettings.offerMaps,
                  { match: "", label: "" },
                ],
              })
            }
            className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Ajouter une offre
          </button>
        </div>

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
      ) : null}
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

