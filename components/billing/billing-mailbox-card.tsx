"use client";

import { Mail } from "lucide-react";
import { useEffect, useState } from "react";

import {
  loadBillingMailbox,
  postBillingMailbox,
} from "@/lib/billing-invoice-mail";

export function BillingMailboxCard({
  onStatus,
}: {
  onStatus?: (status: { connected: boolean; email: string; centerId: string }) => void;
}) {
  const [centerId, setCenterId] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [mailbox, setMailbox] = useState({
    connected: false,
    pending: false,
    email: "",
  });

  useEffect(() => {
    let cancelled = false;
    void loadBillingMailbox().then((box) => {
      if (cancelled) return;
      setCenterId(box.centerId);
      setMailbox({
        connected: box.connected,
        pending: box.pending,
        email: box.email,
      });
      if (box.email) setEmail(box.email);
      onStatus?.({
        connected: box.connected,
        email: box.email,
        centerId: box.centerId,
      });
      if (box.error) setError(box.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(
    action: "connect" | "validate" | "disconnect",
  ) {
    if (!centerId) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await postBillingMailbox({
      action,
      centerId,
      email,
      otp,
    });
    setBusy(false);
    setMailbox({
      connected: result.connected,
      pending: result.pending,
      email: result.email,
    });
    if (result.email) setEmail(result.email);
    onStatus?.({
      connected: result.connected,
      email: result.email,
      centerId,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setNotice(result.notice || (result.connected ? "Boîte connectée." : ""));
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600">
          <Mail className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Boîte mail Bookea
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Les factures partent de cette adresse. Les réponses reviennent
            dans cette même boîte.
          </p>
        </div>
      </div>
      {mailbox.connected ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            Connectée · {mailbox.email}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("disconnect")}
            className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 disabled:opacity-60"
          >
            Changer
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="contact@centre.fr"
            className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-violet-500"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("connect")}
            className="h-11 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Envoi…" : "Recevoir le code"}
          </button>
          {mailbox.pending ? (
            <>
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="Code à 6 chiffres"
                inputMode="numeric"
                className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-violet-500"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void run("validate")}
                className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Valider
              </button>
            </>
          ) : null}
        </div>
      )}
      {notice ? (
        <p className="mt-3 text-sm font-medium text-emerald-700">{notice}</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
