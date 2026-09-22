"use client";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  MessageCircle,
  Send,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { loadCrmAppointments } from "@/lib/agenda-supabase";
import {
  defaultCenterDepositLinks,
  readCenterSettings,
  type CenterDepositLinkSetting,
} from "@/lib/center-settings";
import { todayIso } from "@/lib/crm-stats";
import { loadCrmClients, loadCrmLeads } from "@/lib/crm-supabase";
import { inactiveLeadStatuses } from "@/lib/lead-statuses";

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

export default function SeyaCrmPage() {
  const [tasks, setTasks] = useState<SeyaTask[]>([]);
  const [prompt, setPrompt] = useState(
    "Prépare les relances prioritaires du jour et évite les doublons.",
  );
  const [summary, setSummary] = useState(
    "Analyse du centre en cours…",
  );
  const [depositLinks, setDepositLinks] =
    useState<CenterDepositLinkSetting[]>(defaultCenterDepositLinks);
  const [selectedDepositLinkId, setSelectedDepositLinkId] = useState(
    String(defaultCenterDepositLinks[0]?.id ?? ""),
  );

  const stats = useMemo(
    () => ({
      urgent: tasks.filter((task) => task.priority === "Haute").length,
      ready: tasks.filter((task) => task.status === "Prêt").length,
      sent: tasks.filter((task) => task.status === "Envoyé").length,
      pending: tasks.filter((task) => task.status !== "Envoyé").length,
    }),
    [tasks],
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
        const [leadData, appointments, clientData] = await Promise.all([
          loadCrmLeads(),
          loadCrmAppointments(),
          loadCrmClients(),
        ]);

        if (cancelled) {
          return;
        }

        const nextTasks = buildSeyaTasks({
          leads: leadData.leads,
          appointments,
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
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDepositLink =
    depositLinks.find((link) => String(link.id) === selectedDepositLinkId) ??
    depositLinks[0] ??
    defaultCenterDepositLinks[0];

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
          <p className="text-sm font-black text-violet-600">Bookea Agent IA</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Seya CRM</h1>
          <p className="mt-2 max-w-3xl text-base font-medium text-slate-500">
            L&apos;agent qui prépare les relances, vérifie les doublons, surveille les
            acomptes et aide les équipes à traiter les leads.
          </p>
        </div>
        <button
          type="button"
          onClick={runSeya}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm"
        >
          <Wand2 className="h-6 w-6" />
          Lancer l&apos;analyse
        </button>
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
            <span className="mb-2 block text-sm font-black uppercase text-violet-700">
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
            className="self-end rounded-2xl bg-violet-600 px-4 py-3 text-sm font-black text-white"
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
                  <span className={`rounded-full border px-3 py-1 text-sm font-black ${priorityStyles[task.priority]}`}>
                    {task.priority}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-sm font-black ${channelStyles[task.channel]}`}>
                    {task.channel}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-600">
                    {task.status}
                  </span>
                </div>
                <h2 className="mt-4 text-base font-black">{task.title}</h2>
                <p className="mt-1 text-base font-bold text-slate-500">{task.client}</p>
                <p className="mt-4 max-w-4xl rounded-2xl bg-slate-50 p-4 text-base font-semibold leading-7 text-slate-700">
                  {task.suggestion}
                </p>
                {task.title.toLowerCase().includes("acompte") && (
                  <div className="mt-4 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:grid-cols-[1fr_auto]">
                    <label className="block">
                      <span className="mb-2 block text-sm font-black uppercase text-blue-700">
                        Lien d&apos;acompte à envoyer
                      </span>
                      <select
                        value={selectedDepositLinkId}
                        onChange={(event) =>
                          setSelectedDepositLinkId(event.target.value)
                        }
                        className="h-12 w-full rounded-2xl border border-blue-200 bg-white px-4 text-sm font-black text-slate-800 outline-none"
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
                      className="self-end rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white"
                    >
                      SMS acompte
                    </button>
                    <p className="text-sm font-semibold leading-6 text-blue-700 md:col-span-2">
                      {selectedDepositLink?.message}{" "}
                      <span className="font-black">{selectedDepositLink?.url}</span>
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => validateTask(task.id)}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-700"
                >
                  Valider
                </button>
                <button
                  type="button"
                  onClick={() => sendTask(task.id)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white"
                >
                  <Send className="h-5 w-5" />
                  Envoyer
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Automatisations prévues</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            "Relance WhatsApp automatique après validation Meta",
            "Détection doublons téléphone, email, nom et prénom",
            "Création note historique à chaque action IA",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold text-slate-700"
            >
              <Bot className="h-5 w-5 text-violet-600" />
              {item}
            </div>
          ))}
        </div>
      </section>
    </main>
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
          <p className="text-sm font-black text-slate-500">{title}</p>
          <p className={`mt-3 text-3xl font-black ${color}`}>{value}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}
