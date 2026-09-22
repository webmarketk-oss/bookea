"use client";

import {
  CalendarClock,
  CheckCircle2,
  Gift,
  Mail,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type Campaign = {
  id: number;
  name: string;
  audience: string;
  subject: string;
  sentAt: string;
  recipients: number;
  status: "Envoyée" | "Programmée" | "Brouillon";
};

const initialCampaigns: Campaign[] = [
  {
    id: 1,
    name: "Anniversaires du jour",
    audience: "Clientes anniversaire",
    subject: "Votre surprise anniversaire chez JFG Clinique",
    sentAt: "Aujourd'hui 09:00",
    recipients: 2,
    status: "Programmée",
  },
  {
    id: 2,
    name: "Relance clientes inactives",
    audience: "Clientes sans RDV depuis 60 jours",
    subject: "Un créneau vous attend cette semaine",
    sentAt: "Hier 16:30",
    recipients: 18,
    status: "Envoyée",
  },
];

const statusStyles: Record<Campaign["status"], string> = {
  Envoyée: "bg-emerald-100 text-emerald-700",
  Programmée: "bg-blue-100 text-blue-700",
  Brouillon: "bg-slate-100 text-slate-600",
};

export default function MailingPage() {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [name, setName] = useState("Campagne fidélité");
  const [audience, setAudience] = useState("Tous les clients");
  const [subject, setSubject] = useState("Votre prochaine réservation Bookea");
  const [scheduledDate, setScheduledDate] = useState("2026-07-30");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [message, setMessage] = useState(
    "Bonjour {{prenom}}, votre centre vous propose une attention personnalisée sur votre prochain rendez-vous.",
  );
  const [birthdayAutomation, setBirthdayAutomation] = useState(true);
  const [confirmation, setConfirmation] = useState("");

  const stats = useMemo(
    () => ({
      sent: campaigns.filter((campaign) => campaign.status === "Envoyée").length,
      scheduled: campaigns.filter(
        (campaign) => campaign.status === "Programmée",
      ).length,
      recipients: campaigns.reduce(
        (total, campaign) => total + campaign.recipients,
        0,
      ),
    }),
    [campaigns],
  );

  function sendCampaign(status: Campaign["status"]) {
    const nextCampaign: Campaign = {
      id: Date.now(),
      name,
      audience,
      subject,
      sentAt:
        status === "Programmée"
          ? `Programmée le ${new Intl.DateTimeFormat("fr-FR").format(
              new Date(`${scheduledDate}T${scheduledTime}`),
            )} à ${scheduledTime}`
          : new Intl.DateTimeFormat("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date()),
      recipients:
        audience === "Tous les clients"
          ? 148
          : audience === "Clientes anniversaire"
            ? 2
            : 24,
      status,
    };
    setCampaigns((current) => [nextCampaign, ...current]);
    setConfirmation(
      status === "Envoyée"
        ? "Campagne envoyée en maquette. L'envoi réel passera par le fournisseur email."
        : "Campagne programmée.",
    );
  }

  return (
    <main className="min-h-screen bg-[#eef3f9] px-6 py-6 text-slate-950">
      <section className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-600">Bookea CRM</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Mailing</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Envoyez des emails aux clientes, programmez les anniversaires et
            préparez les campagnes de fidélisation du centre.
          </p>
        </div>
        <button
          type="button"
          onClick={() => sendCampaign("Envoyée")}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-sm"
        >
          <Send className="h-6 w-6" />
          Envoyer
        </button>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard title="Campagnes envoyées" value={stats.sent} color="text-emerald-600" icon={<CheckCircle2 />} />
        <StatCard title="Programmées" value={stats.scheduled} color="text-blue-600" icon={<CalendarClock />} />
        <StatCard title="Destinataires" value={stats.recipients} color="text-violet-600" icon={<Users />} />
        <StatCard title="Anniversaire auto" value={birthdayAutomation ? "ON" : "OFF"} color={birthdayAutomation ? "text-rose-600" : "text-slate-500"} icon={<Gift />} />
      </section>

      {confirmation && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {confirmation}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600">
              <Mail className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Créer un mailing</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Message simple, audience claire et historique conservé.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Input label="Nom campagne" value={name} onChange={setName} />
            <label className="space-y-2">
              <span className="text-xs font-medium text-slate-500">
                Audience
              </span>
              <select
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-base font-bold outline-none focus:border-blue-500"
              >
                <option>Tous les clients</option>
                <option>Clientes anniversaire</option>
                <option>Clientes sans RDV depuis 60 jours</option>
                <option>Clients avec cure en cours</option>
                <option>Prospects avec RDV confirmé</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <Input label="Objet email" value={subject} onChange={setSubject} />
            </div>
            <Input
              label="Date d'envoi"
              type="date"
              value={scheduledDate}
              onChange={setScheduledDate}
            />
            <Input
              label="Heure d'envoi"
              type="time"
              value={scheduledTime}
              onChange={setScheduledTime}
            />
            <label className="space-y-2 md:col-span-2">
              <span className="text-xs font-medium text-slate-500">
                Message
              </span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-44 w-full rounded-2xl border border-slate-200 p-4 text-base font-bold leading-7 outline-none focus:border-blue-500"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setBirthdayAutomation((value) => !value)}
              className={`rounded-2xl px-5 py-3 font-semibold ${
                birthdayAutomation
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Email anniversaire automatique {birthdayAutomation ? "actif" : "inactif"}
            </button>
            <button
              type="button"
              onClick={() => sendCampaign("Programmée")}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700"
            >
              Planifier l'envoi
            </button>
            <button
              type="button"
              onClick={() => sendCampaign("Envoyée")}
              className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white"
            >
              Envoyer maintenant
            </button>
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Aperçu</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Email vu par la cliente.
              </p>
            </div>
          </div>
          <div className="mt-6 rounded-[26px] border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-medium text-slate-500">
              {audience}
            </p>
            <h3 className="mt-3 text-sm font-medium">{subject}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-600">
              {message.replace("{{prenom}}", "Marie")}
            </p>
            <button
              type="button"
              className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white"
            >
              Réserver mon soin
            </button>
          </div>
        </aside>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Historique mailing</h2>
        <div className="mt-5 grid gap-3">
          {campaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_1fr_auto_auto]"
            >
              <div>
                <p className="text-sm font-medium">{campaign.name}</p>
                <p className="font-bold text-slate-500">{campaign.subject}</p>
              </div>
              <p className="self-center font-bold text-slate-600">
                {campaign.audience}
              </p>
              <p className="self-center font-semibold text-slate-700">
                {campaign.recipients} contacts
              </p>
              <span className={`self-center rounded-full px-4 py-2 text-center font-semibold ${statusStyles[campaign.status]}`}>
                {campaign.status}
              </span>
              <p className="self-center font-bold text-slate-500 lg:col-span-4">
                {campaign.sentAt}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Input({
  label,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-base font-bold outline-none focus:border-blue-500"
      />
    </label>
  );
}

function StatCard({
  title,
  value,
  color,
  icon,
}: {
  title: string;
  value: number | string;
  color: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`mt-3 text-xl font-semibold `}>{value}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}
