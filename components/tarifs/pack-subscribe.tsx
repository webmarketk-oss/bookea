"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { CHECKOUT_CONFIRM } from "@/components/tarifs/current-offers";
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
  startOfferCheckout,
  type OfferCheckoutRequest,
} from "@/lib/center-billing";
import { seyaRemainingConversations } from "@/lib/seya-quota";

type Notice = { type: "success" | "error"; message: string };

function useOfferCheckout<Key>() {
  const [busy, setBusy] = useState<Key | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function pay(key: Key, question: string, offer: OfferCheckoutRequest) {
    if (!window.confirm(`${question}\n\n${CHECKOUT_CONFIRM}`)) {
      return;
    }
    setBusy(key);
    setNotice(null);
    try {
      await startOfferCheckout(offer);
    } catch (error) {
      setBusy(null);
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Le paiement n’a pas pu démarrer. Réessayez.",
      });
    }
  }

  return { busy, notice, pay };
}

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
  const { busy: busyLeads, notice, pay } = useOfferCheckout<number>();
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
  }, []);

  function handleSubscribe(leads: number) {
    const pack = whatsappLeadPacks.find((item) => item.leads === leads);
    void pay(
      leads,
      `Souscrire le pack WhatsApp ${leads} conversations pour ${formatEuro(pack?.price ?? 0)} / mois ?`,
      { type: "seya", leads },
    );
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
              onClick={() => handleSubscribe(pack.leads)}
            />
          </PriceCard>
        ))}
      </div>
    </div>
  );
}

export function SmsPacks() {
  const { busy: busyQuantity, notice, pay } = useOfferCheckout<number>();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    void loadActiveCenterBilling()
      .then((billing) => setRemaining(billing.smsRemaining))
      .catch(() => setRemaining(null));
  }, []);

  function handleSubscribe(quantity: number) {
    const pack = smsPacks.find((item) => item.quantity === quantity);
    void pay(
      quantity,
      `Ajouter ${quantity} SMS pour ${formatEuro(pack?.price ?? 0)} ?`,
      { type: "sms", quantity },
    );
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
              onClick={() => handleSubscribe(pack.quantity)}
            />
          </PriceCard>
        ))}
      </div>
    </div>
  );
}

const crmPlus = crmOffers.find((offer) => offer.id === "crm-plus");

export function CrmPacks() {
  const { busy, notice, pay } = useOfferCheckout<"crm">();

  if (!crmPlus) {
    return null;
  }

  function handleSubscribe() {
    void pay(
      "crm",
      `Souscrire ${crmPlus?.title ?? "Bookea"} pour ${crmPlus?.price ?? ""} € / mois ?`,
      { type: "crm" },
    );
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
            busy={busy === "crm"}
            onClick={handleSubscribe}
          />
        </PriceCard>
      </div>
    </div>
  );
}
