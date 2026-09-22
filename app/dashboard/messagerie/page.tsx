"use client";

import {
  BellRing,
  CalendarCheck,
  CheckCheck,
  Clock,
  Mail,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

type Message = {
  id: number;
  author: "client" | "centre" | "seya";
  text: string;
  time: string;
  mailNotified?: boolean;
};

type EmailNotification = {
  id: number;
  conversationId: number;
  recipient: string;
  subject: string;
  time: string;
  status: "Envoyée";
};

type Conversation = {
  id: number;
  name: string;
  phone: string;
  email: string;
  status: "Client" | "Prospect" | "Acompte" | "À confirmer";
  channel: "In-app" | "Bookea public";
  lastSeen: string;
  nextAppointment: string;
  service: string;
  unread: number;
  messages: Message[];
};

const initialConversations: Conversation[] = [];

const statusStyles: Record<Conversation["status"], string> = {
  Client: "bg-emerald-100 text-emerald-700",
  Prospect: "bg-blue-100 text-blue-700",
  Acompte: "bg-violet-100 text-violet-700",
  "À confirmer": "bg-orange-100 text-orange-700",
};

const quickReplies = [
  "Bonjour {{prenom}}, votre rendez-vous est bien confirmé.",
  "Bonjour {{prenom}}, souhaitez-vous que je vous propose un autre créneau ?",
  "Bonjour {{prenom}}, nous pouvons bloquer le rendez-vous avec un acompte.",
];

export default function MessagingPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [emailNotifications, setEmailNotifications] = useState<EmailNotification[]>([]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) =>
      [
        conversation.name,
        conversation.phone,
        conversation.email,
        conversation.service,
        conversation.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [conversations, search]);

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedId,
  );

  const unreadCount = conversations.reduce(
    (total, conversation) => total + conversation.unread,
    0,
  );

  function selectConversation(id: number) {
    setSelectedId(id);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === id ? { ...conversation, unread: 0 } : conversation,
      ),
    );
  }

  function sendMessage() {
    const text = draft.trim();

    if (!text || !selectedConversation) {
      return;
    }

    const now = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === selectedConversation.id
          ? {
              ...conversation,
              lastSeen: "Maintenant",
              messages: [
                ...conversation.messages,
                {
                  id: Date.now(),
                  author: "centre",
                  text,
                  time: now,
                  mailNotified: true,
                },
              ],
            }
          : conversation,
      ),
    );
    setEmailNotifications((current) => [
      {
        id: Date.now(),
        conversationId: selectedConversation.id,
        recipient: selectedConversation.email,
        subject: `Nouveau message de JFG Clinique Clermont`,
        time: now,
        status: "Envoyée",
      },
      ...current,
    ]);
    setDraft("");
  }

  function useQuickReply(reply: string) {
    if (!selectedConversation) {
      return;
    }

    setDraft(reply.replace("{{prenom}}", selectedConversation.name.split(" ")[0]));
  }

  return (
    <main className="min-h-screen bg-[#eef3f9] px-6 py-6 text-slate-950">
      <section className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-600">Bookea CRM</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Messagerie in-app
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Communiquez avec vos client(e)s directement dans Bookea, sans perdre
            l'historique des échanges.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            useQuickReply(
              "Bonjour {{prenom}}, je vous réponds depuis la messagerie Bookea.",
            )
          }
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-sm"
        >
          <Sparkles className="h-5 w-5" />
          Réponse Seya
        </button>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard title="Conversations" value={conversations.length} icon={<MessageCircle />} color="text-blue-600" />
        <StatCard title="Non lus" value={unreadCount} icon={<BellRing />} color="text-orange-600" />
        <StatCard title="RDV à confirmer" value={conversations.filter((conversation) => conversation.status === "À confirmer").length} icon={<CalendarCheck />} color="text-violet-600" />
        <StatCard title="Temps réponse" value="—" icon={<Clock />} color="text-emerald-600" />
      </section>

      <section className="grid min-h-[680px] gap-4 xl:grid-cols-[360px_1fr_330px]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-4 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
            <Search className="h-5 w-5 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, téléphone, email..."
              className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
            />
          </label>

          <div className="space-y-2">
            {filteredConversations.length === 0 ? (
              <p className="rounded-2xl border border-slate-100 p-4 text-sm font-semibold text-slate-500">
                Aucune conversation pour ce centre.
              </p>
            ) : null}
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => selectConversation(conversation.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedConversation?.id === conversation.id
                    ? "border-blue-200 bg-blue-50"
                    : "border-transparent bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">
                      {conversation.name}
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-slate-500">
                      {conversation.messages.at(-1)?.text}
                    </p>
                  </div>
                  {conversation.unread > 0 && (
                    <span className="grid h-7 min-w-7 place-items-center rounded-full bg-blue-600 px-2 text-xs font-medium text-white">
                      {conversation.unread}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[conversation.status]}`}>
                    {conversation.status}
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    {conversation.lastSeen}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {!selectedConversation ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm font-semibold text-slate-500">
              Aucun échange à afficher pour ce centre.
            </div>
          ) : (
            <>
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {selectedConversation.name}
                </h2>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {selectedConversation.channel} · {selectedConversation.service}
                </p>
              </div>
              <span className={`rounded-full px-4 py-2 text-sm font-medium ${statusStyles[selectedConversation.status]}`}>
                {selectedConversation.status}
              </span>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5">
            {selectedConversation.messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.author === "centre" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[78%] rounded-3xl px-5 py-4 shadow-sm ${
                    message.author === "centre"
                      ? "bg-blue-600 text-white"
                      : message.author === "seya"
                        ? "border border-violet-100 bg-violet-50 text-violet-900"
                        : "bg-white text-slate-800"
                  }`}
                >
                  <p className="text-sm font-bold leading-6">{message.text}</p>
                  <p
                    className={`mt-2 text-xs font-medium ${
                      message.author === "centre"
                        ? "text-blue-100"
                        : "text-slate-400"
                    }`}
                  >
                    {message.time}
                    {message.mailNotified && " · Mail notifié"}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {quickReplies.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => useQuickReply(reply)}
                  className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  {reply.replace("{{prenom}}", selectedConversation.name.split(" ")[0])}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-3">
              <button
                type="button"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-slate-500"
                aria-label="Joindre un fichier"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Écrire un message à la cliente..."
                className="min-h-11 flex-1 resize-none bg-transparent px-1 py-2 text-sm font-bold leading-6 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={sendMessage}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Send className="h-4 w-4" />
                Envoyer
              </button>
            </div>
          </div>
            </>
          )}
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selectedConversation ? (
            <p className="text-sm font-semibold text-slate-500">
              Sélectionnez une conversation du centre pour voir la fiche.
            </p>
          ) : (
            <>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <UserRound className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">
                Fiche cliente
              </p>
              <h3 className="text-base font-semibold">{selectedConversation.name}</h3>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <InfoLine label="Téléphone" value={selectedConversation.phone} />
            <InfoLine label="Email" value={selectedConversation.email} />
            <InfoLine label="Prochain RDV" value={selectedConversation.nextAppointment} />
            <InfoLine label="Prestation" value={selectedConversation.service} />
          </div>

          <div className="mt-5 rounded-3xl border border-violet-100 bg-violet-50 p-4">
            <div className="flex items-center gap-2 text-violet-700">
              <Sparkles className="h-5 w-5" />
              <p className="font-semibold">Seya suggère</p>
            </div>
            <p className="mt-3 text-sm font-bold leading-6 text-violet-900">
              Répondre dans l'application, puis conserver l'échange dans la fiche
              client pour que toute l'équipe voie le contexte.
            </p>
          </div>

          <div className="mt-5 rounded-3xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-blue-700">
              <Mail className="h-5 w-5" />
              <p className="font-semibold">Notifications mail</p>
            </div>
            <div className="mt-3 space-y-2">
              {emailNotifications.filter(
                (notification) =>
                  notification.conversationId === selectedConversation.id,
              ).length > 0 ? (
                emailNotifications
                  .filter(
                    (notification) =>
                      notification.conversationId === selectedConversation.id,
                  )
                  .slice(0, 3)
                  .map((notification) => (
                    <div
                      key={notification.id}
                      className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-600"
                    >
                      <p className="font-semibold text-slate-950">
                        {notification.status} à {notification.time}
                      </p>
                      <p className="mt-1 truncate">{notification.recipient}</p>
                    </div>
                  ))
              ) : (
                <p className="text-sm font-bold leading-6 text-blue-900">
                  Le prochain message envoyé depuis Bookea déclenchera aussi une
                  notification mail à {selectedConversation.email}.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700">
              Ouvrir fiche complète
            </button>
            <button className="rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-700">
              Marquer comme traité
            </button>
          </div>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`mt-3 text-2xl font-semibold ${color}`}>{value}</p>
        </div>
        <div className={`grid h-14 w-14 place-items-center rounded-2xl bg-slate-50 ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
