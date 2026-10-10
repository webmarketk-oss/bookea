"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { daysUntilRenewal, renewalStage } from "@/api/billing/_renewal";
import { formatEuro } from "@/lib/bookea-tarifs";
import {
  loadActiveCenterBilling,
  renewBookeaPlan,
  renewSeyaPack,
} from "@/lib/center-billing";
import { formatOfferDate } from "@/lib/center-offers";
import { subscriptionInvoiceNotice } from "@/lib/subscription-invoice-request";

type RenewableLine = {
  offer: "seya" | "crm";
  text: string;
  renewsAt: string | null;
  confirmLabel: string;
};

type OfferLines = {
  whatsapp: RenewableLine | null;
  sms: string;
  bookea: RenewableLine | null;
};

function emptyLines(): OfferLines {
  return {
    whatsapp: null,
    sms: "SMS : solde à jour · sans date limite",
    bookea: null,
  };
}

export const BOOKEA_OFFERS_UPDATED = "bookea-offers-updated";

export function notifyOffersUpdated() {
  window.dispatchEvent(new Event(BOOKEA_OFFERS_UPDATED));
}

function renewalText(renewsAt: string | null) {
  const days = daysUntilRenewal(renewsAt);
  const day = formatOfferDate(renewsAt);
  if (days == null) {
    return "";
  }
  if (days < 0) {
    return `expiré depuis le ${day}`;
  }
  if (days === 0) {
    return `renouvellement aujourd’hui (${day})`;
  }
  if (days <= 3) {
    return `renouvellement dans ${days} jour${days > 1 ? "s" : ""} (${day})`;
  }
  return `renouvellement le ${day}`;
}

function OfferRow({
  line,
  fallback,
  busy,
  onRenew,
}: {
  line: RenewableLine | null;
  fallback: string;
  busy: boolean;
  onRenew: (line: RenewableLine) => void;
}) {
  if (!line) {
    return <li>{fallback}</li>;
  }

  const stage = renewalStage(line.renewsAt);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <span
        className={
          stage === "expired"
            ? "text-rose-700"
            : stage
              ? "text-amber-700"
              : undefined
        }
      >
        {line.text} · {renewalText(line.renewsAt)}
      </span>
      {stage ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRenew(line)}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Renouveler
        </button>
      ) : null}
    </li>
  );
}

export function CurrentOffers() {
  const [lines, setLines] = useState<OfferLines>(emptyLines());
  const [tick, setTick] = useState(0);
  const [renewing, setRenewing] = useState<"seya" | "crm" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  useEffect(() => {
    const refresh = () => setTick((value) => value + 1);
    window.addEventListener(BOOKEA_OFFERS_UPDATED, refresh);
    window.addEventListener("bookea-active-center-changed", refresh);
    return () => {
      window.removeEventListener(BOOKEA_OFFERS_UPDATED, refresh);
      window.removeEventListener("bookea-active-center-changed", refresh);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void loadActiveCenterBilling()
      .then((billing) => {
        if (!alive) return;
        const whatsapp = billing.whatsappOffer;
        const plan = billing.bookeaPlan;
        setLines({
          whatsapp: whatsapp
            ? {
                offer: "seya",
                text: `WhatsApp : ${whatsapp.leads} leads · ${formatEuro(whatsapp.price)} / mois`,
                renewsAt: whatsapp.renewsAt,
                confirmLabel: `le pack WhatsApp ${whatsapp.leads} conversations pour ${formatEuro(whatsapp.price)}`,
              }
            : null,
          sms: `SMS : ${billing.smsRemaining} restants · sans date limite`,
          bookea: plan
            ? {
                offer: "crm",
                text: `Bookea : ${plan.title} · ${formatEuro(plan.price)} / mois`,
                renewsAt: plan.renewsAt,
                confirmLabel: `Bookea ${plan.title} pour ${formatEuro(plan.price)}`,
              }
            : null,
        });
      })
      .catch(() => {
        if (alive) {
          setLines(emptyLines());
        }
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  async function handleRenew(line: RenewableLine) {
    if (
      !window.confirm(
        `Renouveler ${line.confirmLabel} pour un mois ? Bookea vous enverra la facture.`,
      )
    ) {
      return;
    }
    setRenewing(line.offer);
    setNotice(null);
    try {
      const result =
        line.offer === "seya" ? await renewSeyaPack() : await renewBookeaPlan();
      setNotice({
        ok: true,
        text: `Renouvelé jusqu’au ${formatOfferDate(result.renewsAt)}. ${subscriptionInvoiceNotice(result.invoice)}`,
      });
      notifyOffersUpdated();
    } catch (error) {
      setNotice({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "Impossible de renouveler. Réessayez.",
      });
    } finally {
      setRenewing(null);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">
        Offre actuelle
      </p>
      <ul className="mt-3 grid gap-1.5 text-sm font-medium text-slate-700">
        <OfferRow
          line={lines.whatsapp}
          fallback="WhatsApp : pas encore souscrit"
          busy={renewing === "seya"}
          onRenew={(line) => void handleRenew(line)}
        />
        <li>{lines.sms}</li>
        <OfferRow
          line={lines.bookea}
          fallback="Bookea : pas encore souscrit"
          busy={renewing === "crm"}
          onRenew={(line) => void handleRenew(line)}
        />
      </ul>
      {notice ? (
        <p
          className={`mt-3 text-sm font-semibold ${
            notice.ok ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
