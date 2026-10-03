"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { PriceCard } from "@/components/tarifs/price-card";
import {
  formatEuro,
  smsPacks,
  whatsappLeadPacks,
} from "@/lib/bookea-tarifs";
import {
  loadActiveCenterBilling,
  subscribeSeyaPack,
  subscribeSmsPack,
} from "@/lib/center-billing";
import { seyaRemainingConversations } from "@/lib/seya-quota";

type Notice = { type: "success" | "error"; message: string };

function SubscribeButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </button>
  );
}

function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) {
    return null;
  }

  return (
    <p
      className={`rounded-xl border px-4 py-3 text-sm font-medium ${
        notice.type === "success"
          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
          : "border-rose-100 bg-rose-50 text-rose-700"
      }`}
    >
      {notice.message}
    </p>
  );
}

export function WhatsappPacks() {
  const [busyLeads, setBusyLeads] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    void loadActiveCenterBilling()
      .then((billing) => {
        const remaining = seyaRemainingConversations(
          billing.seyaUsed,
          billing.seyaQuota.conversationLimit,
        );
        setStatus(
          billing.seyaQuota.conversationLimit == null
            ? `${billing.seyaUsed} conversation${billing.seyaUsed > 1 ? "s" : ""} en cours · sans plafond`
            : `${billing.seyaUsed} / ${billing.seyaQuota.conversationLimit} conversations utilisées${
                remaining != null ? ` · ${remaining} restantes` : ""
              }`,
        );
      })
      .catch(() => {
        setStatus("");
      });
  }, [notice]);

  async function handleSubscribe(leads: number) {
    setBusyLeads(leads);
    setNotice(null);
    try {
      const result = await subscribeSeyaPack(leads);
      setNotice({
        type: "success",
        message: `${result.quota.conversationLimit} conversations Seya sont maintenant débloquées pour ${result.centerName}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de souscrire ce pack.",
      });
    } finally {
      setBusyLeads(null);
    }
  }

  return (
    <div className="space-y-4">
      <NoticeBanner notice={notice} />
      {status ? (
        <p className="text-sm font-medium text-slate-500">{status}</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {whatsappLeadPacks.map((pack) => (
          <PriceCard
            key={pack.leads}
            title={`${pack.leads} leads`}
            price={`${pack.price} €`}
            detail={pack.detail}
            highlight={pack.leads === 200}
          >
            <SubscribeButton
              label="Souscrire"
              busy={busyLeads === pack.leads}
              onClick={() => void handleSubscribe(pack.leads)}
            />
          </PriceCard>
        ))}
      </div>
    </div>
  );
}

export function SmsPacks() {
  const [busyQuantity, setBusyQuantity] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    void loadActiveCenterBilling()
      .then((billing) => setRemaining(billing.smsRemaining))
      .catch(() => setRemaining(null));
  }, [notice]);

  async function handleSubscribe(quantity: number) {
    setBusyQuantity(quantity);
    setNotice(null);
    try {
      const result = await subscribeSmsPack(quantity);
      setRemaining(result.remaining);
      setNotice({
        type: "success",
        message: `${quantity} SMS ajoutés. Nouveau solde : ${result.remaining}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible d’ajouter ces SMS.",
      });
    } finally {
      setBusyQuantity(null);
    }
  }

  return (
    <div className="space-y-4">
      <NoticeBanner notice={notice} />
      {remaining != null ? (
        <p className="text-sm font-medium text-slate-500">
          Solde actuel : {remaining} SMS
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {smsPacks.map((pack) => (
          <PriceCard
            key={pack.quantity}
            title={`${pack.quantity} SMS`}
            price={formatEuro(pack.price)}
            detail={`${formatEuro(pack.unit, 3)} / SMS`}
            highlight={pack.quantity === 300}
          >
            <SubscribeButton
              label="Ajouter"
              busy={busyQuantity === pack.quantity}
              onClick={() => void handleSubscribe(pack.quantity)}
            />
          </PriceCard>
        ))}
      </div>
    </div>
  );
}
