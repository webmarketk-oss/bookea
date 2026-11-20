"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { User, X } from "lucide-react";

import { loadLeadWhatsAppMessages } from "@/lib/crm-supabase";
import type { LeadWhatsAppMessage } from "@/lib/lead-whatsapp";

/** Ouvre la conversation dans une fenêtre, sans quitter la page et sans charger Seya. */
export function WhatsAppConversationLink({
  leadId,
  phone,
  name,
}: {
  leadId?: string;
  phone?: string;
  name?: string;
}) {
  const lead = String(leadId || "").trim();
  const digits = String(phone || "").replace(/\D/g, "");
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<LeadWhatsAppMessage[] | "loading" | "error">(
    "loading",
  );
  if (!lead && digits.length < 8) {
    return null;
  }
  const who = name?.trim() || "le prospect";

  return (
    <>
      <button
        type="button"
        aria-label={`Ouvrir la conversation WhatsApp de ${who}`}
        title="Conversation WhatsApp"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#25D366] transition-colors hover:bg-emerald-50 hover:text-[#128C7E] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
          <path d="M20.52 3.48A11.8 11.8 0 0 0 12.04 0C5.5 0 .2 5.3.2 11.84c0 2.09.55 4.13 1.59 5.93L0 24l6.39-1.67a11.8 11.8 0 0 0 5.65 1.44h.01c6.54 0 11.84-5.3 11.84-11.84 0-3.16-1.23-6.13-3.37-8.45zM12.05 21.5h-.01a9.8 9.8 0 0 1-5-1.37l-.36-.21-3.79.99 1.01-3.69-.23-.38a9.8 9.8 0 0 1-1.5-5.2c0-5.42 4.41-9.83 9.84-9.83 2.63 0 5.1 1.02 6.96 2.89a9.77 9.77 0 0 1 2.88 6.95c0 5.42-4.42 9.85-9.8 9.85zm5.4-7.36c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
        </svg>
      </button>
      {open ? (
        <WhatsAppConversationDialog
          leadId={lead}
          phone={digits}
          name={who}
          messages={messages}
          onMessages={setMessages}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function WhatsAppConversationDialog({
  leadId,
  phone,
  name,
  messages,
  onMessages,
  onClose,
}: {
  leadId: string;
  phone: string;
  name: string;
  messages: LeadWhatsAppMessage[] | "loading" | "error";
  onMessages: (messages: LeadWhatsAppMessage[] | "loading" | "error") => void;
  onClose: () => void;
}) {
  useEffect(() => {
    let cancelled = false;
    onMessages("loading");
    loadLeadWhatsAppMessages(leadId, phone)
      .then((loaded) => {
        if (!cancelled) {
          onMessages(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          onMessages("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [leadId, phone, onMessages]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Conversation WhatsApp avec ${name}`}
        className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Conversation WhatsApp</h2>
            <p className="mt-0.5 text-sm text-slate-500">Conversation avec {name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-64 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages === "loading" ? (
            <p className="text-sm font-semibold text-slate-400">Chargement…</p>
          ) : messages === "error" ? (
            <p className="text-sm font-semibold text-rose-600">
              La conversation n’a pas pu être ouverte.
            </p>
          ) : messages.length === 0 ? (
            <p className="text-sm font-semibold text-slate-500">
              Aucune conversation WhatsApp pour ce prospect.
            </p>
          ) : (
            messages.map((message) =>
              message.from === "prospect" ? (
                <div key={message.id} className="flex items-end gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <User className="h-4 w-4" />
                  </span>
                  <p className="max-w-[75%] whitespace-pre-wrap break-words rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800">
                    {message.text}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[75%] whitespace-pre-wrap break-words rounded-2xl bg-blue-500 px-3 py-2 text-sm text-white">
                    {message.text}
                  </p>
                </div>
              ),
            )
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
