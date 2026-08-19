"use client";

import {
  AlertTriangle,
  Bot,
  Calendar,
  CheckCircle2,
  MessageCircle,
  Send,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  defaultCenterDepositLinks,
  readCenterSettings,
  type CenterDepositLinkSetting,
} from "@/lib/center-settings";

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

const initialTasks: SeyaTask[] = [
  {
    id: 1,
    title: "Relancer acompte en attente",
    client: "Julie Martin",
    phone: "0671229091",
    channel: "WhatsApp",
    priority: "Haute",
    status: "À valider",
    suggestion:
      "Bonjour Julie, votre créneau est bien préparé. Pour le bloquer définitivement, vous pouvez régler l'acompte ici.",
  },
  {
    id: 2,
    title: "Confirmer le rendez-vous de demain",
    client: "Marie Dubois",
    phone: "0612345678",
    channel: "SMS",
    priority: "Moyenne",
    status: "Prêt",
    suggestion:
      "Rappel Bookea : votre rendez-vous est prévu demain à 09:00 chez JFG Clinique Clermont-Ferrand.",
  },
  {
    id: 3,
    title: "Proposer un créneau libre",
    client: "Sarah Bernard",
    phone: "0698765432",
    channel: "Agenda",
    priority: "Moyenne",
    status: "À valider",
    suggestion:
      "Seya propose cabine 3 mercredi à 14:30 avec Camille pour Hydrafacial.",
  },
  {
    id: 4,
    title: "Anniversaire cliente",
    client: "Claire Moreau",
    phone: "0695861369",
    channel: "Email",
    priority: "Basse",
    status: "Prêt",
    suggestion:
      "Joyeux anniversaire Claire. Votre centre vous offre une attention sur votre prochain soin.",
  },
];

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
  const [tasks, setTasks] = useState(initialTasks);
  const [prompt, setPrompt] = useState(
    "Prépare les relances prioritaires du jour et évite les doublons.",
  );
  const [summary, setSummary] = useState(
    "4 actions détectées. 1 acompte prioritaire, 1 rappel SMS, 1 proposition agenda et 1 anniversaire.",
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
    window.location.href = `sms:${phone}?&body=${encodeURIComponent(message)}`;
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
    <main className="min-h-screen bg-[#eef3f9] px-6 py-6 text-slate-950">
      <section className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black text-violet-600">Bookea Agent IA</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Seya CRM</h1>
          <p className="mt-2 max-w-3xl text-base font-medium text-slate-500">
            L'agent qui prépare les relances, vérifie les doublons, surveille les
            acomptes et aide les équipes à traiter les leads.
          </p>
        </div>
        <button
          type="button"
          onClick={runSeya}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm"
        >
          <Wand2 className="h-6 w-6" />
          Lancer l'analyse
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
                        Lien d'acompte à envoyer
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
          <p className={`mt-3 text-3xl font-black `}>{value}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}
