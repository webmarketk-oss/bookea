"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  Gift,
  History,
  MessageCircle,
  Send,
} from "lucide-react";
import type { ComponentType } from "react";
import { useRouter } from "next/navigation";

import {
  emptyClientAccount,
  loadClientAccount,
  sendClientMessage,
  type ClientAccount,
  type ClientAppointmentCard,
} from "@/lib/client-account";
import { createClient } from "@/lib/supabase";

type AccountTab = "upcoming" | "loyalty" | "past" | "messages";

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
    description: "Points et notes partagées par vos instituts.",
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
    description: "Écrivez à l’institut de votre rendez-vous.",
    icon: MessageCircle,
  },
];

function statusTone(status: string) {
  if (status === "Confirmé") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "À confirmer") {
    return "bg-amber-50 text-amber-800";
  }
  return "bg-slate-100 text-slate-600";
}

function messageTime(iso?: string) {
  if (!iso) {
    return "";
  }
  const stamp = Date.parse(iso);
  if (!Number.isFinite(stamp)) {
    return "";
  }
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(stamp));
}

export function BookeaAccountPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AccountTab>("upcoming");
  const [account, setAccount] = useState<ClientAccount>(emptyClientAccount);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCenterId, setActiveCenterId] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [sending, setSending] = useState(false);

  const active = useMemo(
    () => tabs.find((tab) => tab.id === activeTab) ?? tabs[0],
    [activeTab],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await loadClientAccount();
        if (cancelled) {
          return;
        }
        if (!next) {
          router.replace("/client/login");
          return;
        }
        setAccount(next);
        setActiveCenterId((current) => current || next.centers[0]?.id || "");
      } catch {
        if (!cancelled) {
          setError("Impossible de charger votre espace pour le moment.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const thread =
    account.threads.find((item) => item.centerId === activeCenterId) || null;
  const activeCenter =
    account.centers.find((item) => item.id === activeCenterId) ||
    account.centers[0] ||
    null;

  async function sendMessage() {
    const text = messageDraft.trim();
    if (!text || !activeCenter || sending) {
      return;
    }
    setSending(true);
    setError("");
    try {
      const result = await sendClientMessage(activeCenter.id, text);
      setAccount((current) => {
        const existing = current.threads.find((item) => item.centerId === activeCenter.id);
        const nextThread = existing
          ? {
              ...existing,
              messages: [...existing.messages, result.message],
            }
          : {
              id: `local-${activeCenter.id}`,
              centerId: activeCenter.id,
              centerName: activeCenter.name,
              messages: [result.message],
            };
        return {
          ...current,
          threads: existing
            ? current.threads.map((item) =>
                item.centerId === activeCenter.id ? nextThread : item,
              )
            : [...current.threads, nextThread],
        };
      });
      setMessageDraft("");
    } catch {
      setError("Le message n’a pas pu partir. Réessayez.");
    } finally {
      setSending(false);
    }
  }

  function openContact(appointment: ClientAppointmentCard) {
    setActiveCenterId(appointment.centerId);
    setActiveTab("messages");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/client/login");
  }

  return (
    <main className="min-h-screen bg-[#eef3f9] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/client" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-600 text-sm font-semibold text-white">
              B
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">Bookea</p>
              <p className="text-xs font-medium text-slate-500">Espace client</p>
            </div>
          </a>
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <a
              href="/client"
              className="rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-50"
            >
              Rechercher
            </a>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-xl bg-slate-950 px-3 py-2 text-white"
            >
              Déconnexion
            </button>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl bg-slate-950 p-4 text-white">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-300">
              Mon compte Bookea
            </p>
            <h1 className="mt-2 text-lg font-semibold">
              {loading ? "…" : account.displayName}
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-300">
              {account.email || " "}
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
                  className={`flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold lg:w-full ${
                    selected
                      ? "bg-slate-950 text-white"
                      : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">
              {active.label}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              {active.label}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {active.description}
            </p>
          </div>

          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-sm font-medium text-slate-500">
              Chargement de votre espace…
            </p>
          ) : null}

          {!loading && activeTab === "upcoming" ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Rendez-vous à venir</h3>
                <CalendarCheck className="h-5 w-5 text-slate-400" />
              </div>
              {account.upcoming.length === 0 ? (
                <p className="mt-6 text-sm font-medium text-slate-500">
                  Aucun rendez-vous à venir. Quand vous réservez un soin, il
                  apparaîtra ici.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {account.upcoming.map((appointment) => (
                    <article
                      key={appointment.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-slate-950">
                            {appointment.service}
                          </h4>
                          <p className="mt-1 text-sm font-medium text-slate-500">
                            {appointment.center}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(appointment.status)}`}
                        >
                          {appointment.status}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 rounded-2xl bg-white p-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium text-slate-400">
                            Créneau
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {appointment.date}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-400">
                            Détail
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {appointment.detail || "—"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openContact(appointment)}
                        className="mt-3 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Contacter {appointment.center}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {!loading && activeTab === "loyalty" ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Carte fidélité
              </p>
              <h3 className="mt-1 text-2xl font-semibold">
                {account.loyalty.points} point
                {account.loyalty.points === 1 ? "" : "s"}
              </h3>
              {account.loyalty.points === 0 ? (
                <p className="mt-3 text-sm font-medium text-slate-500">
                  Aucun point pour le moment. Ils s’ajouteront après vos
                  passages en institut.
                </p>
              ) : (
                <p className="mt-2 text-sm font-medium text-slate-500">
                  Cumul réel de vos instituts Bookea.
                </p>
              )}
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Notes partagées
                </p>
                {account.loyalty.notes.length === 0 ? (
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    Aucune note partagée par un institut.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {account.loyalty.notes.map((note) => (
                      <p
                        key={note}
                        className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
                      >
                        {note}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {!loading && activeTab === "past" ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">RDV passés</h3>
              {account.past.length === 0 ? (
                <p className="mt-6 text-sm font-medium text-slate-500">
                  Aucun rendez-vous passé pour l’instant.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                  {account.past.map((appointment) => (
                    <div key={appointment.id} className="bg-white p-4">
                      <h4 className="text-sm font-semibold">{appointment.service}</h4>
                      <p className="mt-1 text-sm font-medium text-slate-500">
                        {appointment.center} · {appointment.date}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {!loading && activeTab === "messages" ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Messages</h3>
              {account.centers.length === 0 ? (
                <p className="mt-6 text-sm font-medium text-slate-500">
                  Vous pourrez écrire à un institut dès que vous aurez un
                  rendez-vous Bookea avec lui.
                </p>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {account.centers.map((center) => (
                      <button
                        key={center.id}
                        type="button"
                        onClick={() => setActiveCenterId(center.id)}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                          activeCenter?.id === center.id
                            ? "bg-slate-950 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {center.name}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-sm font-medium text-slate-500">
                    Conversation avec {activeCenter?.name}
                  </p>
                  <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto rounded-2xl bg-slate-50 p-4">
                    {(thread?.messages || []).length === 0 ? (
                      <p className="text-sm font-medium text-slate-500">
                        Aucun message. Écrivez au centre pour une question sur
                        votre rendez-vous.
                      </p>
                    ) : (
                      (thread?.messages || []).map((message) => (
                        <div
                          key={message.id}
                          className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                            message.side === "client"
                              ? "ml-auto bg-slate-950 text-white"
                              : "bg-white text-slate-800"
                          }`}
                        >
                          <p
                            className={`text-[11px] font-medium ${
                              message.side === "client"
                                ? "text-slate-300"
                                : "text-slate-400"
                            }`}
                          >
                            {message.author}
                            {message.at ? ` · ${messageTime(message.at)}` : ""}
                          </p>
                          <p className="mt-1 font-medium leading-6">{message.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <input
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder={`Écrire à ${activeCenter?.name || "l’institut"}…`}
                      className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none focus:border-violet-500"
                    />
                    <button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={sending || !messageDraft.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Envoyer
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}
