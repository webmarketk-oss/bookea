"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { notifyOffersUpdated } from "@/components/tarifs/current-offers";
import { FeatureTicks } from "@/components/tarifs/feature-ticks";
import { PriceCard } from "@/components/tarifs/price-card";
import {
  crmOffers,
  formatEuro,
  smsPacks,
  WHATSAPP_PACK_POINTS,
  whatsappLeadPacks,
} from "@/lib/bookea-tarifs";
import {
  loadActiveCenterBilling,
  subscribeBookeaPlan,
  subscribeSeyaPack,
  subscribeSmsPack,
} from "@/lib/center-billing";
import { seyaRemainingConversations } from "@/lib/seya-quota";
import { subscriptionInvoiceNotice } from "@/lib/subscription-invoice-request";

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
    const pack = whatsappLeadPacks.find((item) => item.leads === leads);
    if (
      !window.confirm(
        `Souscrire le pack WhatsApp ${leads} conversations pour ${formatEuro(pack?.price ?? 0)} / mois ? Bookea vous enverra la facture.`,
      )
    ) {
      return;
    }
    setBusyLeads(leads);
    setNotice(null);
    try {
      const result = await subscribeSeyaPack(leads);
      notifyOffersUpdated();
      setNotice({
        type: "success",
        message: `${result.quota.conversationLimit} conversations Seya sont maintenant débloquées pour ${result.centerName}. ${subscriptionInvoiceNotice(result.invoice)}`,
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {whatsappLeadPacks.map((pack) => (
          <PriceCard
            key={pack.leads}
            title={`${pack.leads} leads`}
            price={formatEuro(pack.price)}
            highlight={pack.leads === 200}
          >
            <FeatureTicks items={WHATSAPP_PACK_POINTS} />
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
    const pack = smsPacks.find((item) => item.quantity === quantity);
    if (
      !window.confirm(
        `Ajouter ${quantity} SMS pour ${formatEuro(pack?.price ?? 0)} ? Bookea vous enverra la facture.`,
      )
    ) {
      return;
    }
    setBusyQuantity(quantity);
    setNotice(null);
    try {
      const result = await subscribeSmsPack(quantity);
      notifyOffersUpdated();
      setRemaining(result.remaining);
      setNotice({
        type: "success",
        message: `${quantity} SMS ajoutés. Nouveau solde : ${result.remaining}. ${subscriptionInvoiceNotice(result.invoice)}`,
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

const crmPlus = crmOffers.find((offer) => offer.id === "crm-plus");

export function CrmPacks() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (!crmPlus) {
    return null;
  }

  async function handleSubscribe() {
    if (
      !window.confirm(
        `Souscrire ${crmPlus?.title ?? "Bookea"} pour ${crmPlus?.price ?? ""} € / mois ? Bookea vous enverra la facture.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await subscribeBookeaPlan();
      notifyOffersUpdated();
      setNotice({
        type: "success",
        message: `Bookea CRM + SMS est actif pour ${result.centerName}. ${subscriptionInvoiceNotice(result.invoice)}`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de souscrire Bookea.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <NoticeBanner notice={notice} />
      <div className="max-w-md">
        <PriceCard
          title={crmPlus.title}
          price={`${crmPlus.price} €`}
          period={crmPlus.period}
          highlight
        >
          <FeatureTicks items={crmPlus.points} />
          <SubscribeButton
            label="Souscrire"
            busy={busy}
            onClick={() => void handleSubscribe()}
          />
        </PriceCard>
      </div>
    </div>
  );
}
