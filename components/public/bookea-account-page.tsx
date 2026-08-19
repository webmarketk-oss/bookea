"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  Gift,
  History,
  MessageCircle,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import type { ComponentType } from "react";

type AccountTab = "upcoming" | "loyalty" | "past" | "messages";
type ClientMessage = {
  id: string;
  side: "center" | "client";
  author: string;
  text: string;
  time: string;
};

const tabs: Array<{
  id: AccountTab;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    id: "upcoming",
    label: "RDV à venir",
    description: "Vos prochains rendez-vous Bookea.",
    icon: CalendarDays,
  },
  {
    id: "loyalty",
    label: "Carte fidélité",
    description: "Points, avantages et notes partagées.",
    icon: Gift,
  },
  {
    id: "past",
    label: "RDV passés",
    description: "Historique des soins réalisés.",
    icon: History,
  },
  {
    id: "messages",
    label: "Messagerie Bookea",
    description: "Chat privé avec les instituts.",
    icon: MessageCircle,
  },
];

const upcomingAppointments = [
  {
    id: "rdv-1",
    center: "JFG Clinique Clermont-Ferrand",
    service: "Hydrafacial",
    date: "Samedi 14:30",
    detail: "Cabine 3 · Camille",
    status: "Confirmé",
    color: "emerald",
  },
  {
    id: "rdv-2",
    center: "Institut Nova",
    service: "Cryolipolyse",
    date: "Mardi 10:00",
    detail: "Cabine 2 · Aurélie",
    status: "À confirmer",
    color: "amber",
  },
];

const pastAppointments = [
  {
    id: "past-1",
    center: "JFG Clinique Clermont-Ferrand",
    service: "Épilation laser",
    date: "25 juillet 2026",
    reward: "+10 points",
  },
  {
    id: "past-2",
    center: "Studio Belle Peau",
    service: "Soin du visage",
    date: "12 juillet 2026",
    reward: "+8 points",
  },
  {
    id: "past-3",
    center: "Institut Nova",
    service: "Bilan minceur",
    date: "28 juin 2026",
    reward: "+5 points",
  },
];

const initialMessages: ClientMessage[] = [
  {
    id: "msg-1",
    side: "center",
    author: "JFG Clinique",
    text: "Bonjour Julie, votre rendez-vous Hydrafacial est bien confirmé samedi à 14:30.",
    time: "10:12",
  },
  {
    id: "msg-2",
    side: "client",
    author: "Vous",
    text: "Merci, je confirme ma présence.",
    time: "10:18",
  },
];

const sharedNotes = [
  "Prévoir une protection solaire après le soin visage.",
  "Carte fidélité active : prochaine récompense à 10 passages.",
];

export function BookeaAccountPage() {
  const [activeTab, setActiveTab] = useState<AccountTab>("upcoming");
  const [messages, setMessages] = useState(initialMessages);
  const [messageDraft, setMessageDraft] = useState("");

  const active = useMemo(
    () => tabs.find((tab) => tab.id === activeTab) ?? tabs[0],
    [activeTab]
  );

  function sendMessage() {
    const text = messageDraft.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      {
        id: `msg-${Date.now()}`,
        side: "client",
        author: "Vous",
        text,
        time: "Maintenant",
      },
    ]);
    setMessageDraft("");
  }

  return (
    <main className="min-h-screen bg-[#eef4fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
          <a href="/client" className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 via-blue-600 to-cyan-400 text-2xl font-black text-white shadow-lg shadow-blue-900/10">
              B
            </div>
            <div>
              <p className="text-lg font-black text-blue-600">Bookea</p>
              <p className="text-xs font-bold text-slate-500">
                Mon espace cliente
              </p>
            </div>
          </a>

          <nav className="flex items-center gap-3 text-sm font-black text-slate-600">
            <a href="/client" className="rounded-full px-4 py-2 hover:bg-blue-50 hover:text-blue-700">
              Rechercher
            </a>
            <a href="/login" className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800">
              Connexion
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[300px_1fr] lg:px-10 lg:py-8">
        <aside className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-[24px] bg-slate-950 p-5 text-white">
            <p className="text-xs font-black uppercase text-cyan-200">
              Mon compte Bookea
            </p>
            <h1 className="mt-2 text-2xl font-black">Julie Martin</h1>
            <p className="mt-1 text-sm font-bold text-slate-300">
              julie@email.com
            </p>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-left font-black transition lg:w-full ${
                    selected
                      ? "bg-blue-600 text-white shadow-md shadow-blue-900/10"
                      : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase text-violet-700">
                  {active.label}
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  Mon compte Bookea
                </h2>
                <p className="mt-2 max-w-2xl text-base font-semibold leading-7 text-slate-500">
                  {active.description}
                </p>
              </div>
              <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
                Compte actif
              </div>
            </div>
          </div>

          {activeTab === "upcoming" && (
            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-400">
                      Prochains soins
                    </p>
                    <h3 className="text-2xl font-black">Rendez-vous à venir</h3>
                  </div>
                  <CalendarCheck className="h-7 w-7 text-blue-600" />
                </div>

                <div className="mt-5 space-y-3">
                  {upcomingAppointments.map((appointment) => (
                    <article
                      key={appointment.id}
                      className="rounded-[26px] border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-xl font-black text-slate-950">
                            {appointment.service}
                          </h4>
                          <p className="mt-1 font-bold text-slate-500">
                            {appointment.center}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-black ${
                            appointment.color === "emerald"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {appointment.status}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 rounded-3xl bg-white p-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-black uppercase text-slate-400">
                            Créneau
                          </p>
                          <p className="mt-1 font-black text-slate-900">
                            {appointment.date}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-slate-400">
                            Détail
                          </p>
                          <p className="mt-1 font-black text-slate-900">
                            {appointment.detail}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-black text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab("messages");
                            setMessageDraft(
                              `Bonjour, j'ai une question sur mon rendez-vous ${appointment.service} chez ${appointment.center}.`
                            );
                          }}
                          className="rounded-2xl bg-blue-600 px-4 py-3 font-black text-white hover:bg-blue-700"
                        >
                          Contacter
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-[32px] border border-violet-100 bg-violet-50 p-5 shadow-sm sm:p-6">
                <Sparkles className="h-8 w-8 text-violet-700" />
                <h3 className="mt-4 text-2xl font-black text-violet-950">
                  Seya suit vos rendez-vous
                </h3>
                <p className="mt-3 text-base font-semibold leading-7 text-violet-800">
                  Vos rappels, messages des instituts, points fidélité et
                  rendez-vous passés restent regroupés dans cet espace.
                </p>
              </section>
            </div>
          )}

          {activeTab === "loyalty" && (
            <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-violet-600 via-blue-600 to-cyan-400 p-5 text-white">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase text-cyan-100">
                      Carte fidélité
                    </p>
                    <h3 className="mt-2 text-3xl font-black">72 points</h3>
                    <p className="mt-1 font-bold text-blue-50">
                      Plus que 28 points avant votre prochaine récompense.
                    </p>
                  </div>
                  <Gift className="h-10 w-10" />
                </div>

                <div className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-10">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <div
                      key={index}
                      className={`grid aspect-square place-items-center rounded-2xl border text-sm font-black ${
                        index < 7
                          ? "border-white bg-white text-blue-700"
                          : "border-white/50 bg-white/10 text-white"
                      }`}
                    >
                      <Star className="h-4 w-4" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-[26px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-400">
                  Notes partagées par les instituts
                </p>
                <div className="mt-3 space-y-2">
                  {sharedNotes.map((note) => (
                    <p key={note} className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-700">
                      {note}
                    </p>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === "past" && (
            <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h3 className="text-2xl font-black">RDV passés</h3>
              <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-[26px] border border-slate-200">
                {pastAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="grid gap-3 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div>
                      <h4 className="text-lg font-black text-slate-950">
                        {appointment.service}
                      </h4>
                      <p className="mt-1 font-bold text-slate-500">
                        {appointment.center} · {appointment.date}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
                      {appointment.reward}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === "messages" && (
            <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-blue-600">
                    Messagerie in-app
                  </p>
                  <h3 className="text-2xl font-black">Messages Bookea</h3>
                </div>
                <MessageCircle className="h-7 w-7 text-blue-600" />
              </div>

              <div className="mt-5 max-h-[430px] space-y-3 overflow-y-auto rounded-[28px] bg-slate-50 p-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[88%] rounded-3xl px-4 py-3 shadow-sm ${
                      message.side === "client"
                        ? "ml-auto bg-blue-600 text-white"
                        : "bg-white text-slate-800"
                    }`}
                  >
                    <p
                      className={`text-xs font-black uppercase ${
                        message.side === "client" ? "text-blue-100" : "text-slate-400"
                      }`}
                    >
                      {message.author} · {message.time}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-6">{message.text}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") sendMessage();
                  }}
                  placeholder="Écrire à l'institut..."
                  className="min-h-12 flex-1 rounded-2xl border border-slate-200 px-4 font-bold outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white hover:bg-slate-800"
                >
                  Envoyer
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 rounded-2xl bg-blue-50 px-4 py-3 text-xs font-bold leading-5 text-blue-700">
                En version connectée, l'institut reçoit une notification email
                quand un nouveau message arrive.
              </p>
            </section>
          )}

          <a
            href="/client"
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-black text-slate-700 shadow-sm ring-1 ring-slate-200 hover:text-blue-700"
          >
            Retour à la recherche
            <ChevronRight className="h-4 w-4" />
          </a>
        </section>
      </div>
    </main>
  );
}
