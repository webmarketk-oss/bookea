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
import { useMemo, useState } from "react";

type SmsCampaign = {
  id: number;
  name: string;
  audience: string;
  message: string;
  plannedAt: string;
  recipients: number;
  status: "Envoyé" | "Planifié" | "Brouillon";
};

const initialCampaigns: SmsCampaign[] = [
  {
    id: 1,
    name: "Rappel RDV 48h",
    audience: "RDV confirmés",
    message: "Rappel Bookea : votre RDV est prévu dans 48h chez JFG Clinique.",
    plannedAt: "Automatique 48h avant RDV",
    recipients: 4,
    status: "Planifié",
  },
  {
    id: 2,
    name: "Anniversaires",
    audience: "Clientes anniversaire",
    message: "Joyeux anniversaire {{prenom}}. Votre centre vous réserve une surprise.",
    plannedAt: "Automatique le jour J 10:00",
    recipients: 2,
    status: "Planifié",
  },
];

const statusStyles: Record<SmsCampaign["status"], string> = {
  Envoyé: "bg-emerald-100 text-emerald-700",
  Planifié: "bg-blue-100 text-blue-700",
  Brouillon: "bg-slate-100 text-slate-600",
};

export default function SmsPage() {
  const [credits, setCredits] = useState(320);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [name, setName] = useState("Relance prospects du jour");
  const [audience, setAudience] = useState("Prospects à rappeler");
  const [message, setMessage] = useState(
    "Bonjour {{prenom}}, votre centre revient vers vous pour vous proposer un créneau cette semaine.",
  );
  const [scheduledDate, setScheduledDate] = useState("2026-07-30");
  const [scheduledTime, setScheduledTime] = useState("10:00");
  const [reminder48h, setReminder48h] = useState(true);
  const [reminderDayBefore, setReminderDayBefore] = useState(true);
  const [birthdaySms, setBirthdaySms] = useState(true);
  const [confirmation, setConfirmation] = useState("");

  const stats = useMemo(
    () => ({
      scheduled: campaigns.filter((campaign) => campaign.status === "Planifié")
        .length,
      sent: campaigns.filter((campaign) => campaign.status === "Envoyé").length,
      used: campaigns.reduce((total, campaign) => total + campaign.recipients, 0),
    }),
    [campaigns],
  );

  function buyCredits(amount: number) {
    setCredits((current) => current + amount);
    setConfirmation(`${amount} SMS ajoutés au solde du centre.`);
  }

  function campaignRecipients() {
    if (audience === "Tous les clients") return 148;
    if (audience === "RDV confirmés demain") return 6;
    if (audience === "Clientes anniversaire") return 2;
    return 12;
  }

  function createCampaign(status: SmsCampaign["status"]) {
    const recipients = campaignRecipients();
    if (status === "Envoyé" && credits < recipients) {
      setConfirmation("Solde SMS insuffisant. Rechargez avant l'envoi.");
      return;
    }

    const nextCampaign: SmsCampaign = {
      id: Date.now(),
      name,
      audience,
      message,
      plannedAt:
        status === "Planifié"
          ? `Le ${new Intl.DateTimeFormat("fr-FR").format(
              new Date(`${scheduledDate}T${scheduledTime}`),
            )} à ${scheduledTime}`
          : "Envoyé maintenant",
      recipients,
      status,
    };

    setCampaigns((current) => [nextCampaign, ...current]);
    if (status === "Envoyé") {
      setCredits((current) => current - recipients);
    }
    setConfirmation(
      status === "Envoyé"
        ? `${recipients} SMS envoyés en maquette. L'envoi réel passera par un fournisseur SMS.`
        : `Envoi SMS planifié pour ${recipients} destinataires.`,
    );
  }

  return (
    <main className="min-h-screen bg-[#eef3f9] px-6 py-6 text-slate-950">
      <section className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black text-violet-600">Bookea CRM</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Envoi SMS</h1>
          <p className="mt-2 max-w-3xl text-base font-medium text-slate-500">
            Rechargez des SMS, envoyez des campagnes, planifiez les rappels RDV
            et automatisez les anniversaires.
          </p>
        </div>
        <button
          type="button"
          onClick={() => createCampaign("Envoyé")}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm"
        >
          <Send className="h-6 w-6" />
          Envoyer SMS
        </button>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard title="Solde SMS" value={credits} color="text-blue-600" icon={<Smartphone />} />
        <StatCard title="Planifiés" value={stats.scheduled} color="text-violet-600" icon={<CalendarClock />} />
        <StatCard title="Envoyés" value={stats.sent} color="text-emerald-600" icon={<CheckCircle2 />} />
        <StatCard title="Consommés" value={stats.used} color="text-orange-600" icon={<Zap />} />
      </section>

      {confirmation && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base font-black text-emerald-700">
          {confirmation}
        </div>
      )}

      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <ShoppingCart className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black">Recharge SMS</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Le centre achète des crédits avant les envois.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {[100, 500, 1000].map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => buyCredits(amount)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 font-black text-slate-700 hover:bg-blue-50 hover:text-blue-700"
              >
                Acheter {amount} SMS
              </button>
            ))}
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
              <h2 className="text-xl font-black">Créer un envoi</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Envoi immédiat ou planifié, avec variables prénom et RDV.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Input label="Nom de l'envoi" value={name} onChange={setName} />
            <label className="space-y-2">
              <span className="text-sm font-black uppercase text-slate-500">
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
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-black uppercase text-slate-500">
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
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-700"
            >
              Planifier l'envoi
            </button>
            <button
              type="button"
              onClick={() => createCampaign("Envoyé")}
              className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white"
            >
              Envoyer maintenant
            </button>
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black">Automatiques</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Les règles que Bookea déclenchera avec la vraie base.
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
              onClick={() => setBirthdaySms((value) => !value)}
            />
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-black uppercase text-slate-500">
              Aperçu
            </p>
            <p className="mt-3 text-base font-bold leading-7 text-slate-700">
              {message.replace("{{prenom}}", "Marie")}
            </p>
            <p className="mt-3 font-black text-blue-600">
              {campaignRecipients()} destinataires estimés
            </p>
          </div>
        </aside>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Historique SMS</h2>
        <div className="mt-5 grid gap-3">
          {campaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_auto_auto]"
            >
              <div>
                <p className="text-sm font-black">{campaign.name}</p>
                <p className="font-bold text-slate-500">
                  {campaign.audience} · {campaign.plannedAt}
                </p>
                <p className="mt-2 font-semibold text-slate-600">
                  {campaign.message}
                </p>
              </div>
              <p className="self-center font-black text-slate-700">
                {campaign.recipients} SMS
              </p>
              <span className={`self-center rounded-full px-4 py-2 text-center font-black ${statusStyles[campaign.status]}`}>
                {campaign.status}
              </span>
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
      <span className="text-sm font-black uppercase text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-base font-bold outline-none focus:border-blue-500"
      />
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
      className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left font-black ${
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
