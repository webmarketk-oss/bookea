"use client";

import { Bot } from "lucide-react";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { readActiveCenterId } from "@/lib/center-access";
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
  createSeyaMessage,
  suggestAvailableSlots,
  whatsappHref,
} from "@/lib/seya-agent";
import {
  defaultSeyaAgentSettings,
  emptySeyaCenterProfile,
  loadSeyaAgentSettings,
  mergeSeyaConversations,
  readLocalSeyaConversations,
  saveSeyaAgentSettings,
  saveSeyaConversations,
  markSeyaHealthReviewed,
  sortSeyaInbox,
  writeLocalSeyaConversations,
  writeLocalSeyaSettings,
  type SeyaAgentSettings,
  type SeyaCenterProfile,
  type SeyaConversation,
  type SeyaHealthSheet,
  type SeyaPricePolicy,
  type SeyaTreatmentBrief,
} from "@/lib/seya-settings";
import {
  BOOKEA_SHARED_WHATSAPP_NUMBER,
  formatSharedWhatsAppNumber,
  newTextsFromAuthor,
} from "@/lib/seya-whatsapp";
import { displayPersonName } from "@/lib/seya-person-name";
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

function patchBriefPricing(
  brief: SeyaTreatmentBrief,
  field: keyof Omit<SeyaPricePolicy, "sessionPolicy">,
  value: string,
): SeyaTreatmentBrief {
  const pricing: SeyaPricePolicy = {
    bilan: brief.pricing?.bilan || "",
    discovery: brief.pricing?.discovery || "",
    session: brief.pricing?.session || "",
    package: brief.pricing?.package || "",
    sessionPolicy: brief.pricing?.sessionPolicy || "after_bilan",
  };
  pricing[field] = value;
  return { ...brief, pricing };
}

function patchBriefHealth(
  brief: SeyaTreatmentBrief,
  field: keyof Omit<SeyaHealthSheet, "validated">,
  value: string,
): SeyaTreatmentBrief {
  const health: SeyaHealthSheet = {
    validated: brief.health?.validated === true,
    contraindications: brief.health?.contraindications || "",
    precautions: brief.health?.precautions || "",
    professionalQuestions: brief.health?.professionalQuestions || "",
    transferTo: brief.health?.transferTo || "",
  };
  health[field] = value;
  return { ...brief, health };
}

function patchCenterProfile(
  settings: SeyaAgentSettings,
  field: keyof SeyaCenterProfile,
  value: string,
): SeyaAgentSettings {
  return {
    ...settings,
    centerProfile: {
      ...emptySeyaCenterProfile,
      ...settings.centerProfile,
      [field]: value,
    },
  };
}

const CENTER_PROFILE_FIELDS: Array<{
  key: keyof SeyaCenterProfile;
  label: string;
  hint: string;
  placeholder: string;
  rows?: number;
}> = [
  {
    key: "activity",
    label: "Résumé de l’activité",
    hint: "Ce que fait CE centre, pas un autre.",
    placeholder:
      "Centre de technologies minceur, soins visage et épilation définitive, avec un suivi personnalisé.",
    rows: 3,
  },
  {
    key: "extras",
    label: "Autres informations",
    hint: "Parking, accès, bâtiment, bornes… Seya le dit si on lui demande.",
    placeholder:
      "Parking devant l’établissement, bâtiment au 1er étage avec ascenseur.",
    rows: 3,
  },
  {
    key: "audience",
    label: "Vos cibles",
    hint: "À qui s’adresse le centre.",
    placeholder:
      "Femmes et hommes qui souhaitent perdre du poids, raffermir, ou une épilation définitive.",
    rows: 3,
  },
  {
    key: "problem",
    label: "Le problème que vous résolvez",
    hint: "Objectifs pris en charge ici.",
    placeholder:
      "Silhouette, rétention d’eau, cellulite, imperfections visage, poils indésirables.",
    rows: 3,
  },
  {
    key: "differentiation",
    label: "Votre différenciation",
    hint: "Ce qui distingue CE centre.",
    placeholder:
      "Accompagnement en centre, technologies ciblées et suivi personnalisé.",
    rows: 3,
  },
  {
    key: "promise",
    label: "Vos résultats ou promesse",
    hint: "Sans inventer de résultat médical.",
    placeholder:
      "Programmes personnalisés après un diagnostic, pour des résultats visibles et durables.",
    rows: 3,
  },
  {
    key: "positioning",
    label: "Votre positionnement",
    hint: "Comment le centre se présente.",
    placeholder:
      "Centre de technologies et de bien-être, solutions non invasives.",
    rows: 3,
  },
];

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
      client: displayPersonName(client.firstName, client.lastName),
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
      client: displayPersonName(lead.firstName, lead.lastName),
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
      client: displayPersonName(client.firstName, client.lastName),
      phone: client.phone,
      channel: "Email",
      priority: "Basse",
      status: "Prêt",
      suggestion: `Joyeux anniversaire ${client.firstName}. Votre centre vous offre une attention sur votre prochain soin.`,
    });
  }

  return tasks;
}

function lastOutgoingMessage(conversation: SeyaConversation) {
  return [...(conversation.messages || [])]
    .reverse()
    .find((item) => item.author === "seya" || item.author === "centre");
}

function prefersWelcomeTemplate(conversation: SeyaConversation, _text: string) {
  return !(conversation.messages || []).some((item) => item.author === "lead");
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
  const agentSettingsRef = useRef(agentSettings);
  agentSettingsRef.current = agentSettings;
  const persistSeqRef = useRef(0);
  const persistConversationsSeqRef = useRef(0);
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
  const [aiEnabled, setAiEnabled] = useState(false);
  const [replying, setReplying] = useState(false);
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
    let loaded = false;
    let refreshInFlight = false;

    const savedCenterId = readActiveCenterId();
    if (savedCenterId) {
      const localConversations = readLocalSeyaConversations(savedCenterId);
      if (localConversations.length > 0) {
        setCenterId(savedCenterId);
        setConversations(localConversations);
        setSelectedConversationId(localConversations[0]?.id ?? null);
      }
    }

    async function loadInbox() {
      try {
        const seya = await loadSeyaAgentSettings();
        if (cancelled) {
          return;
        }
        const storedConversations = seya.conversations?.length
          ? seya.conversations
          : seya.centerId
            ? readLocalSeyaConversations(seya.centerId)
            : [];
        if (seya.centerId) {
          writeLocalSeyaConversations(seya.centerId, storedConversations, {
            notify: false,
          });
        }
        setCenterId(seya.centerId);
        setCenterName(seya.centerName);
        setAgentSettings(seya.settings);
        setConversations(storedConversations);
        setSelectedConversationId((current) =>
          current && storedConversations.some((item) => item.id === current)
            ? current
            : (storedConversations[0]?.id ?? null),
        );
        loaded = true;
      } catch {
        if (!cancelled) {
          setSummary("Impossible de charger les conversations Seya de ce centre.");
        }
      }
    }

    async function loadTasks() {
      try {
        const [leadData, appointmentData, clientData, centerHours] =
          await Promise.all([
            loadCrmLeads().catch(() => ({ leads: [] as Lead[] })),
            loadCrmAppointments().catch(() => [] as Appointment[]),
            loadCrmClients().catch(() => ({ clients: [] })),
            loadCenterHours().catch(() => defaultCenterDayHours),
          ]);
        if (cancelled) {
          return;
        }
        setLeads(leadData.leads);
        setAppointments(appointmentData);
        setHours(centerHours);
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
        }
      }
    }

    async function refreshConversations() {
      if (cancelled || !loaded || refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      try {
        const seya = await loadSeyaAgentSettings();
        if (cancelled || !seya.centerId) {
          return;
        }
        setConversations((current) => {
          const merged = mergeSeyaConversations(
            seya.conversations || [],
            current,
          );
          writeLocalSeyaConversations(seya.centerId, merged, { notify: false });
          return merged;
        });
      } catch {
        return;
      } finally {
        refreshInFlight = false;
      }
    }

    void loadInbox();
    void loadTasks();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshConversations();
      }
    }, 12000);
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshConversations();
      }
    };
    const reloadOnCenterChange = () => {
      window.location.reload();
    };
    window.addEventListener("bookea-active-center-changed", reloadOnCenterChange);
    window.addEventListener("focus", refreshConversations);
    document.addEventListener("visibilitychange", refreshIfVisible);
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
        setAiEnabled(Boolean(payload?.ai));
      })
      .catch(() => null);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener(
        "bookea-active-center-changed",
        reloadOnCenterChange,
      );
      window.removeEventListener("focus", refreshConversations);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);

  const selectedDepositLink =
    depositLinks.find((link) => String(link.id) === selectedDepositLinkId) ??
    depositLinks[0] ??
    defaultCenterDepositLinks[0];

  function persistConversations(next: SeyaConversation[]) {
    setConversations(next);
    if (!centerId) {
      return;
    }
    writeLocalSeyaConversations(centerId, next, { notify: false });
    const seq = ++persistConversationsSeqRef.current;
    void saveSeyaConversations(next, centerId)
      .then((saved) => {
        if (seq !== persistConversationsSeqRef.current) {
          return;
        }
        setConversations((current) => mergeSeyaConversations(saved, current));
      })
      .catch(() => null);
  }

  function updateConversation(next: SeyaConversation) {
    persistConversations(
      conversations.map((item) => (item.id === next.id ? next : item)),
    );
  }

  async function persistAgentSettings(next: SeyaAgentSettings) {
    agentSettingsRef.current = next;
    setAgentSettings(next);
    if (!centerId) {
      setAgentFeedback("Centre introuvable : réglages non enregistrés.");
      return;
    }
    writeLocalSeyaSettings(centerId, next);
    const seq = ++persistSeqRef.current;
    setSavingAgent(true);
    try {
      await saveSeyaAgentSettings(next, centerId);
      if (seq !== persistSeqRef.current) {
        return;
      }
      setAgentFeedback(
        `Réglages enregistrés pour ${centerName} uniquement.`,
      );
    } catch {
      if (seq !== persistSeqRef.current) {
        return;
      }
      setAgentFeedback("Impossible d’enregistrer les réglages de l’agent.");
    } finally {
      if (seq === persistSeqRef.current) {
        setSavingAgent(false);
      }
    }
  }

  function persistCurrentAgentSettings() {
    void persistAgentSettings(agentSettingsRef.current);
  }

  function removeOfferMap(index: number) {
    const current = agentSettingsRef.current;
    void persistAgentSettings({
      ...current,
      offerMaps: current.offerMaps.filter((_, offerIndex) => offerIndex !== index),
    });
  }

  function removeTreatmentBrief(index: number) {
    const current = agentSettingsRef.current;
    void persistAgentSettings({
      ...current,
      treatmentBriefs: current.treatmentBriefs.filter(
        (_, briefIndex) => briefIndex !== index,
      ),
    });
  }

  async function postWhatsAppSend(
    conversation: SeyaConversation,
    text: string,
    preferTemplate: boolean,
  ) {
    const response = await fetch("/api/seya/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send",
        phone: conversation.phone,
        text,
        firstName: conversation.firstName,
        centerName,
        treatment:
          conversation.offerLabel ||
          conversation.qualification?.need ||
          conversation.treatment ||
          "",
        campaign: conversation.campaign || "",
        offerLabel: conversation.offerLabel || "",
        preferTemplate,
      }),
    });
    return (await response.json().catch(() => ({}))) as {
      sent?: boolean;
      reason?: string;
      error?: string;
    };
  }

  function explainWhatsAppFailure(payload: {
    reason?: string;
    error?: string;
  }) {
    if (payload.reason === "template_required") {
      return (
        payload.error ||
        "Le premier WhatsApp part via le modèle générique (prénom, centre, offre). Il doit être Approuvé une fois dans Meta."
      );
    }
    return payload.error || "L’envoi Bookea a échoué. Réessaie dans une minute.";
  }

  async function deliverWhatsAppTexts(
    conversation: SeyaConversation,
    texts: string[],
  ) {
    if (!conversation.phone.trim()) {
      setAgentFeedback("Ce prospect n’a pas de numéro WhatsApp.");
      return false;
    }
    const outgoing = texts.map((item) => item.trim()).filter(Boolean);
    if (outgoing.length === 0) {
      return true;
    }

    if (!whatsappConnected) {
      window.open(whatsappHref(conversation.phone, outgoing.join("\n\n")), "_blank");
      return true;
    }

    setAgentFeedback("Envoi depuis le numéro Bookea…");
    try {
      for (const text of outgoing) {
        const payload = await postWhatsAppSend(
          conversation,
          text,
          prefersWelcomeTemplate(conversation, text),
        );
        if (!payload.sent) {
          updateConversation({
            ...conversation,
            sendError: payload.error || payload.reason || "échec WhatsApp",
            updatedAt: new Date().toISOString(),
          });
          setAgentFeedback(explainWhatsAppFailure(payload));
          return false;
        }
      }
      setAgentFeedback(
        `Message envoyé depuis ${formatSharedWhatsAppNumber()} (Bookea).`,
      );
      return true;
    } catch {
      setAgentFeedback("Impossible de joindre l’API WhatsApp Bookea.");
      return false;
    }
  }

  async function sendWhatsApp(conversation: SeyaConversation) {
    const message = lastOutgoingMessage(conversation);
    if (!message || !conversation.phone.trim()) {
      setAgentFeedback("Ce prospect n’a pas de numéro WhatsApp.");
      return;
    }

    const sent = await deliverWhatsAppTexts(conversation, [message.text]);
    if (!sent) {
      return;
    }

    const next: SeyaConversation = {
      ...conversation,
      status: conversation.status === "À envoyer" ? "En cours" : conversation.status,
      sendError: null,
      sentVia: "whatsapp",
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

  async function sendCentreReply() {
    if (!selectedConversation || replying) {
      return;
    }

    const text = reply.trim();
    if (!text) {
      return;
    }

    setReplying(true);
    setReply("");
    const sent = await deliverWhatsAppTexts(selectedConversation, [text]);
    setReplying(false);
    if (!sent) {
      setReply(text);
      return;
    }

    const next: SeyaConversation = {
      ...selectedConversation,
      messages: [
        ...selectedConversation.messages,
        createSeyaMessage("centre", text),
      ],
      status:
        selectedConversation.status === "À envoyer"
          ? "En cours"
          : selectedConversation.status,
      sendError: null,
      sentVia: "whatsapp",
      updatedAt: new Date().toISOString(),
    };
    updateConversation(next);

    const lead = leads.find((item) => item.id === selectedConversation.leadId);
    try {
      await addCrmLeadActivity(
        selectedConversation.leadId,
        `Seya WhatsApp : ${text}`,
      );
      await updateCrmLeadNextAction(
        selectedConversation.leadId,
        "Agent Seya WhatsApp",
      );
      if (lead && lead.status === "Nouveau") {
        await updateCrmLeadStatus(lead, "Message WhatsApp envoyé");
      }
    } catch {
      // The WhatsApp send already succeeded.
    }
  }

  async function submitLeadReply(nextReply?: string) {
    if (!selectedConversation || replying) {
      return;
    }

    const text = (nextReply ?? reply).trim();
    if (!text) {
      return;
    }

    setReplying(true);
    setReply("");
    setAgentFeedback("Seya réfléchit…");

    let result = applyLeadReply(
      selectedConversation,
      text,
      agentSettings,
      availableSlots,
    );

    try {
      const response = await fetch("/api/seya/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation: selectedConversation,
          text,
          centerId,
          slots: availableSlots,
          appointments,
          hours,
          centerName,
          centerAddress: [
            readCenterSettings()?.center?.address,
            readCenterSettings()?.center?.postalCode,
            readCenterSettings()?.center?.city,
          ]
            .filter(Boolean)
            .join(", "),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        conversation?: SeyaConversation;
        shouldBook?: { date: string; time: string; label: string } | null;
        via?: string;
        ai?: boolean;
      };
      if (payload.conversation) {
        result = {
          conversation: payload.conversation,
          shouldBook: payload.shouldBook ?? null,
        };
        setAiEnabled(Boolean(payload.ai));
        setAgentFeedback(
          payload.via === "ai" ? "Réponse IA Seya." : "Réponse Seya (règles).",
        );
      } else {
        setAgentFeedback("Réponse Seya (règles).");
      }
    } catch {
      setAgentFeedback("Réponse Seya (règles).");
    } finally {
      setReplying(false);
    }

    updateConversation(result.conversation);

    const seyaTexts = newTextsFromAuthor(
      selectedConversation.messages,
      result.conversation.messages,
      "seya",
    );
    if (seyaTexts.length > 0) {
      const sent = await deliverWhatsAppTexts(result.conversation, seyaTexts);
      if (sent) {
        updateConversation({
          ...result.conversation,
          sendError: null,
          sentVia: "whatsapp",
          updatedAt: new Date().toISOString(),
        });
      }
    }

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
        personName: displayPersonName(
          selectedConversation.firstName,
          selectedConversation.lastName,
        ),
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
      className={`bg-[#eef3f9] px-4 py-4 text-slate-950 sm:px-6 ${
        view === "inbox"
          ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          : "min-h-full"
      }`}
      data-sidebar-collapse-area="true"
    >
      <section className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
            {centerName} · {sharedNumber}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Seya</h1>
        </div>
        <div className="flex items-center gap-3">
        <NotificationsBell />
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
        </div>
      </section>

      {view === "inbox" ? (
        <div className="min-h-0 flex-1">
        <SeyaInbox
          inbox={inbox}
          selected={selectedConversation}
          leads={leads}
          settings={agentSettings}
          reply={reply}
          feedback={agentFeedback}
          busy={replying}
          onSelect={(id) => {
            setSelectedConversationId(id);
            setReply("");
          }}
          onReplyChange={setReply}
          onSendReply={() => void sendCentreReply()}
          onSendWhatsApp={() => {
            if (selectedConversation) {
              void sendWhatsApp(selectedConversation);
            }
          }}
          onPickSlot={(index) => void submitLeadReply(index)}
          onMarkHealthReviewed={() => {
            if (!selectedConversation) {
              return;
            }
            updateConversation(markSeyaHealthReviewed(selectedConversation));
            setAgentFeedback("Vérification santé marquée comme faite.");
          }}
        />
        </div>
      ) : null}

      {view === "settings" ? (
      <section className="mb-6 rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Agent WhatsApp Seya</h2>
            <p className="mt-1 text-sm font-semibold text-violet-800">
              Centre : {centerName || "—"}
            </p>
            <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">
              Ces réglages valent uniquement pour ce centre. Off, 99 € ou
              offert ici ne s’appliquent jamais à un autre établissement.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
          <p className="text-sm font-semibold text-violet-800">{sharedNumber}</p>
          <p className="mt-1 text-xs font-medium text-violet-700">
            {whatsappConnected
              ? "Numéro partagé connecté. Chaque centre garde son CRM, son planning et ses automatisations."
              : "Même numéro pour tout le monde. On le connecte ensemble ; en attendant, Envoyer sur WhatsApp ouvre le message de ce centre."}{" "}
            {aiEnabled
              ? "IA OpenAI branchée."
              : "IA en attente : ajoute OPENAI_API_KEY sur Vercel."}
          </p>
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium text-slate-500">
            Description du centre
          </p>
          <p className="mt-1 text-xs font-medium leading-4 text-slate-400">
            Fiche de {centerName || "ce centre"} uniquement. Seya ne recopie
            pas tout ça à chaque message : elle s’en sert pour parler de CET
            établissement, jamais d’un autre. Les horaires viennent du
            Planning.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {CENTER_PROFILE_FIELDS.map((field) => (
              <label key={field.key} className="grid gap-1">
                <span className="text-xs font-semibold text-slate-600">
                  {field.label}
                </span>
                <span className="text-[11px] font-medium leading-4 text-slate-400">
                  {field.hint}
                </span>
                <textarea
                  value={agentSettings.centerProfile?.[field.key] || ""}
                  onChange={(event) =>
                    setAgentSettings((current) =>
                      patchCenterProfile(current, field.key, event.target.value),
                    )
                  }
                  onBlur={persistCurrentAgentSettings}
                  rows={field.rows || 3}
                  placeholder={field.placeholder}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium leading-5 text-slate-700 outline-none focus:border-violet-500"
                />
              </label>
            ))}
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-slate-600">
                Téléphone du centre
              </span>
              <span className="text-[11px] font-medium leading-4 text-slate-400">
                Uniquement si on lui demande un numéro.
              </span>
              <input
                value={agentSettings.centerProfile?.supportPhone || ""}
                onChange={(event) =>
                  setAgentSettings((current) =>
                    patchCenterProfile(current, "supportPhone", event.target.value),
                  )
                }
                onBlur={persistCurrentAgentSettings}
                placeholder="02 28 10 79 76"
                className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-violet-500"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-slate-600">
                Email du centre
              </span>
              <span className="text-[11px] font-medium leading-4 text-slate-400">
                Uniquement si on lui demande un email.
              </span>
              <input
                value={agentSettings.centerProfile?.supportEmail || ""}
                onChange={(event) =>
                  setAgentSettings((current) =>
                    patchCenterProfile(current, "supportEmail", event.target.value),
                  )
                }
                onBlur={persistCurrentAgentSettings}
                placeholder="contact@centre.fr"
                className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-violet-500"
              />
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <ToggleRow
            title="WhatsApp Seya activé"
            hint="Si c’est off, aucun WhatsApp aux nouveaux leads (Meta, SaveMyLeads, relances)."
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
            title="Relances 15 h, +24 h, puis 5 j"
            hint="Uniquement trois relances : ~15 h après le dernier message, 24 h plus tard, puis à 5 jours. Rien d’autre. Stop si refus, stop, ou RDV confirmé."
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
          <p className="mb-2 text-xs font-medium leading-4 text-slate-400">
            Écris comme si tu briefais la réceptionniste du centre, pas une
            liste d’interdits. C’est ce que Seya lit avant de répondre.
          </p>
          <textarea
            value={agentSettings.brief}
            onChange={(event) =>
              setAgentSettings((current) => ({
                ...current,
                brief: event.target.value,
              }))
            }
            onBlur={persistCurrentAgentSettings}
            rows={5}
            placeholder="Tu es Seya, au standard. Tu vouvoies. Tu parles comme au téléphone : simple, posée, sans script. Tu réponds d’abord au message. Prix seulement si on te le demande."
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium leading-6 text-slate-700 outline-none focus:border-violet-500"
          />
        </label>

        <div className="mt-5">
          <p className="text-xs font-medium text-slate-500">
            Offres campagne → texte WhatsApp
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Laisse 1 ligne par code campagne (99€, 49€, offert…). Ces lignes
            valent seulement pour ce centre : Gap ne reprend jamais Clermont.
            Ne clique pas « Ajouter une offre » pour le prix : ça va plus bas.
          </p>
          <div className="mt-3 grid gap-3">
            {agentSettings.offerMaps.map((item, index) => (
              <div
                key={`${item.match}-${index}`}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[180px_1fr_auto]"
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
                  onBlur={persistCurrentAgentSettings}
                  placeholder="cryo 99"
                  className="h-11 min-w-0 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-violet-500"
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
                  onBlur={persistCurrentAgentSettings}
                  placeholder="bilan + séance découverte offerte"
                  className="h-11 min-w-0 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-violet-500"
                />
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => removeOfferMap(index)}
                  className="h-11 shrink-0 cursor-pointer px-2 text-sm font-semibold text-rose-500 hover:text-rose-700"
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const current = agentSettingsRef.current;
              void persistAgentSettings({
                ...current,
                offerMaps: [...current.offerMaps, { match: "", label: "" }],
              });
            }}
            className="mt-3 cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Ajouter une offre
          </button>
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium text-slate-500">
            Prix et discours par soin
          </p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Ce texte, Seya ne le dit que si on lui demande le prix. Elle ne le
            sort jamais toute seule.
          </p>
          <div className="mt-3 grid gap-3">
            {agentSettings.treatmentBriefs.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between gap-3">
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
                    onBlur={persistCurrentAgentSettings}
                    placeholder="Soin minceur"
                    className="h-11 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-violet-500"
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => removeTreatmentBrief(index)}
                    className="h-11 shrink-0 cursor-pointer px-2 text-sm font-semibold text-rose-500 hover:text-rose-700"
                  >
                    Retirer
                  </button>
                </div>
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-600">
                      Titre pour WhatsApp
                    </span>
                    <span className="text-[11px] font-medium leading-4 text-slate-400">
                      Si un lead arrive pour ce soin, Seya s’en sert dans le
                      premier message. Pas besoin de coller tout le texte
                      produit.
                    </span>
                    <input
                      value={item.title || ""}
                      onChange={(event) =>
                        setAgentSettings((current) => ({
                          ...current,
                          treatmentBriefs: current.treatmentBriefs.map(
                            (brief, briefIndex) =>
                              briefIndex === index
                                ? { ...brief, title: event.target.value }
                                : brief,
                          ),
                        }))
                      }
                      onBlur={persistCurrentAgentSettings}
                      placeholder="Soins visage anti-âge"
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-violet-500"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-semibold text-slate-600">
                      URL du soin
                    </span>
                    <span className="text-[11px] font-medium leading-4 text-slate-400">
                      Seya ne l’envoie que si on lui demande le site ou le
                      lien.
                    </span>
                    <input
                      value={item.url || ""}
                      onChange={(event) =>
                        setAgentSettings((current) => ({
                          ...current,
                          treatmentBriefs: current.treatmentBriefs.map(
                            (brief, briefIndex) =>
                              briefIndex === index
                                ? { ...brief, url: event.target.value }
                                : brief,
                          ),
                        }))
                      }
                      onBlur={persistCurrentAgentSettings}
                      placeholder="https://…"
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-violet-500"
                    />
                  </label>
                </div>
                <div className="grid gap-3 rounded-2xl border border-violet-100 bg-white p-3">
                  <p className="text-xs font-semibold text-violet-900">
                    Politique de prix — {item.name}
                  </p>
                  <p className="text-[11px] font-medium leading-4 text-slate-400">
                    Même si le devis final est personnalisé, dites à Seya ce
                    qu’elle a le droit d’annoncer : tarif à la séance,
                    fourchette, « à partir de », ou seulement un rappel
                    conseillère.
                  </p>
                  {(
                    [
                      ["bilan", "Prix du bilan"],
                      ["discovery", "Prix de la séance découverte"],
                      ["session", "Prix d’une séance suivante"],
                      ["package", "Prix d’un forfait / d’une cure"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="grid gap-1">
                      <span className="text-xs font-medium text-slate-500">
                        {label}
                      </span>
                      <input
                        value={item.pricing?.[field] || ""}
                        onChange={(event) =>
                          setAgentSettings((current) => ({
                            ...current,
                            treatmentBriefs: current.treatmentBriefs.map(
                              (brief, briefIndex) =>
                                briefIndex === index
                                  ? patchBriefPricing(
                                      brief,
                                      field,
                                      event.target.value,
                                    )
                                  : brief,
                            ),
                          }))
                        }
                        onBlur={persistCurrentAgentSettings}
                        placeholder={
                          field === "package"
                            ? "à partir de 500€, jusqu’en 10 fois"
                            : field === "session"
                              ? "à partir de 90€"
                              : "offert"
                        }
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-violet-500"
                      />
                    </label>
                  ))}
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-500">
                      Ce que Seya peut dire sur les séances suivantes
                    </span>
                    <select
                      value={item.pricing?.sessionPolicy || "after_bilan"}
                      onChange={(event) =>
                        setAgentSettings((current) => ({
                          ...current,
                          treatmentBriefs: current.treatmentBriefs.map(
                            (brief, briefIndex) =>
                              briefIndex === index
                                ? {
                                    ...brief,
                                    pricing: {
                                      bilan: brief.pricing?.bilan || "",
                                      discovery: brief.pricing?.discovery || "",
                                      session: brief.pricing?.session || "",
                                      package: brief.pricing?.package || "",
                                      sessionPolicy: event.target.value as NonNullable<
                                        typeof brief.pricing
                                      >["sessionPolicy"],
                                    },
                                  }
                                : brief,
                          ),
                        }))
                      }
                      onBlur={persistCurrentAgentSettings}
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-violet-500"
                    >
                      <option value="after_bilan">
                        Dépend du protocole après le bilan
                      </option>
                      <option value="fixed">Tarif à la séance</option>
                      <option value="from">« À partir de »</option>
                      <option value="range">Fourchette</option>
                      <option value="callback">
                        Une conseillère rappelle
                      </option>
                    </select>
                  </label>
                </div>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-500">
                    Premier message — {"{centre}"} {"{offre}"}
                  </span>
                  <textarea
                    value={item.opening || ""}
                    onChange={(event) =>
                      setAgentSettings((current) => ({
                        ...current,
                        treatmentBriefs: current.treatmentBriefs.map((brief, briefIndex) =>
                          briefIndex === index
                            ? { ...brief, opening: event.target.value }
                            : brief,
                        ),
                      }))
                    }
                    onBlur={persistCurrentAgentSettings}
                    rows={2}
                    placeholder="Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}."
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-5 text-slate-700 outline-none focus:border-violet-500"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-500">
                    Consigne pour ce soin
                  </span>
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
                    onBlur={persistCurrentAgentSettings}
                    rows={2}
                    placeholder="Tu parles comme au téléphone. Prix seulement si on te le demande. Si on te le demande, tu le dis, tu n’enchaînes pas avec des créneaux."
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-5 text-slate-700 outline-none focus:border-violet-500"
                  />
                </label>
                <div className="grid gap-3 rounded-2xl border border-amber-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-amber-900">
                      Fiche santé — {item.name}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void persistAgentSettings({
                          ...agentSettings,
                          treatmentBriefs: agentSettings.treatmentBriefs.map(
                            (brief, briefIndex) =>
                              briefIndex === index
                                ? {
                                    ...brief,
                                    health: {
                                      validated: !(brief.health?.validated === true),
                                      contraindications:
                                        brief.health?.contraindications || "",
                                      precautions: brief.health?.precautions || "",
                                      professionalQuestions:
                                        brief.health?.professionalQuestions || "",
                                      transferTo: brief.health?.transferTo || "",
                                    },
                                  }
                                : brief,
                          ),
                        })
                      }
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        item.health?.validated
                          ? "bg-amber-900 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.health?.validated ? "Validée" : "Non validée"}
                    </button>
                  </div>
                  <p className="text-[11px] font-medium leading-4 text-slate-400">
                    Seya ne lit que la fiche de ce soin, jamais celle d’un autre
                    centre ou d’une autre technologie.
                  </p>
                  {(
                    [
                      ["contraindications", "Contre-indications générales"],
                      ["precautions", "Précautions avant séance"],
                      ["professionalQuestions", "Questions à faire valider"],
                      ["transferTo", "Transférer à"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="grid gap-1">
                      <span className="text-xs font-medium text-slate-500">
                        {label}
                      </span>
                      {field === "transferTo" ? (
                        <input
                          value={item.health?.[field] || ""}
                          onChange={(event) =>
                            setAgentSettings((current) => ({
                              ...current,
                              treatmentBriefs: current.treatmentBriefs.map(
                                (brief, briefIndex) =>
                                  briefIndex === index
                                    ? patchBriefHealth(
                                        brief,
                                        field,
                                        event.target.value,
                                      )
                                    : brief,
                              ),
                            }))
                          }
                          onBlur={persistCurrentAgentSettings}
                          placeholder="l’esthéticienne cryolipolyse"
                          className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-violet-500"
                        />
                      ) : (
                        <textarea
                          value={item.health?.[field] || ""}
                          onChange={(event) =>
                            setAgentSettings((current) => ({
                              ...current,
                              treatmentBriefs: current.treatmentBriefs.map(
                                (brief, briefIndex) =>
                                  briefIndex === index
                                    ? patchBriefHealth(
                                        brief,
                                        field,
                                        event.target.value,
                                      )
                                    : brief,
                              ),
                            }))
                          }
                          onBlur={persistCurrentAgentSettings}
                          rows={2}
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium leading-5 text-slate-700 outline-none focus:border-violet-500"
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const current = agentSettingsRef.current;
              void persistAgentSettings({
                ...current,
                treatmentBriefs: [
                  ...current.treatmentBriefs,
                  {
                    name: "Nouveau soin",
                    title: "",
                    url: "",
                    price: "",
                    brief:
                      "Prix seulement si on te le demande. Si on te le demande, tu dis le tarif comme au comptoir.",
                    opening:
                      "Bonjour {prenom}, c’est Seya du {centre}. On vient de recevoir votre demande pour {offre}.",
                    health: {
                      validated: false,
                      contraindications: "",
                      precautions: "",
                      professionalQuestions: "",
                      transferTo: "",
                    },
                  },
                ],
              });
            }}
            className="mt-3 cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
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
          enabled ? "bg-violet-100 text-violet-700" : "bg-white text-slate-500"
        }`}
      >
        {enabled ? "Oui" : "Non"}
      </button>
    </div>
  );
}

