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
import type { Appointment } from "@/types/agenda";
import type { Lead } from "@/types/lead";
import type { CrmClient } from "@/lib/crm-supabase";

type SmsCampaign = {
  id: number;
  name: string;
  audience: string;
  message: string;
  plannedAt: string;
  recipients: number;
  status: "Envoyé" | "Planifié" | "Brouillon";
};

type SmsRecipient = {
  phone: string;
  firstName: string;
};

const recallStatuses = new Set([
  "Nouveau",
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
  const [credits, setCredits] = useState(0);
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [center, leadData, clientData, appointmentData, status] =
          await Promise.all([
            getActiveCenterContext(),
            loadCrmLeads().catch(() => ({ leads: [] as Lead[] })),
            loadCrmClients().catch(() => ({ clients: [] as CrmClient[] })),
            loadCrmAppointments().catch(() => [] as Appointment[]),
            fetch("/api/sms/send").then((response) => response.json()).catch(() => null),
          ]);

        if (cancelled) {
          return;
        }

        setCenterName(center.centerName);
        setLeads(leadData.leads);
        setClients(clientData.clients);
        setAppointments(appointmentData);
        if (typeof status?.remainingCredits === "number") {
          setCredits(Math.floor(status.remainingCredits));
        }
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

  function buyCredits(amount: number) {
    setIsError(false);
    setConfirmation(
      `La recharge Bookea arrive ensuite. Pour l'instant, achetez les crédits SMS dans Brevo (${amount} SMS).`,
    );
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
          recipients,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || result.results?.[0]?.error || "Envoi SMS refusé");
      }

      if (typeof result.remainingCredits === "number") {
        setCredits(Math.floor(result.remainingCredits));
      }

      const nextCampaign: SmsCampaign = {
        id: Date.now(),
        name: testPhone.trim() ? `${name} (test)` : name,
        audience: testPhone.trim() ? `Numéro test ${testPhone}` : audience,
        message,
        plannedAt: "Envoyé maintenant",
        recipients: result.sent ?? recipients.length,
        status: "Envoyé",
      };
      setCampaigns((current) => [nextCampaign, ...current]);
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

    setCampaigns((current) => [nextCampaign, ...current]);
    setIsError(false);
    setConfirmation(`Envoi SMS planifié pour ${recipients} destinataire(s).`);
  }

  return (
    <main className="min-h-screen bg-[#eef3f9] px-6 py-6 text-slate-950">
      <section className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black text-violet-600">Bookea CRM</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Envoi SMS</h1>
          <p className="mt-2 max-w-3xl text-base font-medium text-slate-500">
            SMS réels via Brevo pour {centerName}. Mets d’abord ton numéro en test.
          </p>
        </div>
        <button
          type="button"
          disabled={sending}
          onClick={() => createCampaign("Envoyé")}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60"
        >
          <Send className="h-6 w-6" />
          {sending ? "Envoi..." : "Envoyer SMS"}
        </button>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard title="Solde SMS" value={credits} color="text-blue-600" icon={<Smartphone />} />
        <StatCard title="Planifiés" value={stats.scheduled} color="text-violet-600" icon={<CalendarClock />} />
        <StatCard title="Envoyés" value={stats.sent} color="text-emerald-600" icon={<CheckCircle2 />} />
        <StatCard title="Consommés" value={stats.used} color="text-orange-600" icon={<Zap />} />
      </section>

      {confirmation && (
        <div
          className={`mb-6 rounded-2xl border px-4 py-3 text-base font-black ${
            isError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
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
                Les crédits se rechargent pour l’instant dans Brevo.
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
                Si le numéro test est rempli, un seul SMS part vers ce numéro.
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
            <Input
              label="Numéro test"
              value={testPhone}
              onChange={setTestPhone}
              placeholder="06 12 34 56 78"
            />
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
              disabled={sending}
              onClick={() => createCampaign("Envoyé")}
              className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-60"
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
              <h2 className="text-xl font-black">Automatiques</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Les rappels RDV partiront ensuite tout seuls. Le bouton envoie déjà via Brevo.
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
              {testPhone.trim() ? 1 : audienceRecipients.length} destinataire(s)
            </p>
          </div>
        </aside>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Historique SMS</h2>
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
        .filter((client) => client.birthDate?.slice(5) === today && client.phone)
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
      <span className="text-sm font-black uppercase text-slate-500">{label}</span>
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
  icon,
}: {
  title: string;
  value: number | string;
  color?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-black">{value}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}
