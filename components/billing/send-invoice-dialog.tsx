"use client";

import { Mail, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  defaultInvoiceMailDraft,
  sendBillingInvoiceMail,
} from "@/lib/billing-invoice-mail";
import { invoiceHtmlToPdfDataUrl } from "@/lib/billing-invoice-pdf";

type SendInvoiceDialogProps = {
  invoice: {
    id: string;
    number: string;
    type: string;
    client: string;
    email: string;
    emailedTo?: string;
  };
  centerName: string;
  mailboxConnected: boolean;
  mailboxEmail: string;
  buildHtml: () => string;
  onClose: () => void;
  onSent: (receipt: { emailedAt: string; emailedTo: string }) => void;
};

export function SendInvoiceDialog({
  invoice,
  centerName,
  mailboxConnected,
  mailboxEmail,
  buildHtml,
  onClose,
  onSent,
}: SendInvoiceDialogProps) {
  const draft = defaultInvoiceMailDraft({
    ...invoice,
    email: invoice.emailedTo || invoice.email,
    centerName,
  });
  const [to, setTo] = useState(draft.to);
  const [subject, setSubject] = useState(draft.subject);
  const [message, setMessage] = useState(draft.message);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const next = defaultInvoiceMailDraft({
      ...invoice,
      email: invoice.emailedTo || invoice.email,
      centerName,
    });
    setTo(next.to);
    setSubject(next.subject);
    setMessage(next.message);
    setError("");
  }, [centerName, invoice]);

  async function send() {
    setError("");
    if (!mailboxConnected) {
      setError("Connectez d’abord la boîte mail Bookea dans Réglages.");
      return;
    }
    setBusy(true);
    try {
      const pdf = await invoiceHtmlToPdfDataUrl(buildHtml());
      const result = await sendBillingInvoiceMail({
        invoiceId: invoice.id,
        to,
        subject,
        message,
        pdf,
      });
      if (!result.ok || !result.emailedAt || !result.emailedTo) {
        setError(result.error || "L’envoi de la facture a échoué.");
        return;
      }
      onSent({ emailedAt: result.emailedAt, emailedTo: result.emailedTo });
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "L’envoi de la facture a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
              Envoyer la facture par mail
            </p>
            <h2 className="mt-1 text-lg font-semibold">{invoice.number}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm font-medium text-slate-500">
          {mailboxConnected
            ? `Envoi depuis ${mailboxEmail}. Les réponses arrivent dans cette boîte.`
            : "Connectez la boîte mail Bookea dans Réglages avant d’envoyer."}
        </p>

        <label className="mt-4 block text-xs font-medium text-slate-500">
          Destinataire
          <input
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-violet-500"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-slate-500">
          Objet
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-violet-500"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-slate-500">
          Message
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={7}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none focus:border-violet-500"
          />
        </label>
        <p className="mt-2 text-xs font-medium text-slate-400">
          Pièce jointe : {invoice.number}.pdf
        </p>

        {error ? (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Mail className="h-4 w-4" />
            {busy ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
