"use client";

import { useEffect, useState } from "react";

import { redeemCenterReward } from "@/lib/loyalty-client";

export type AppointmentLoyaltyReward = {
  requestId: string;
  status: "requested" | "used";
  discountEur: number;
  points: number;
  centerId?: string;
};

export function LoyaltyRewardMark({
  reward,
}: {
  reward?: AppointmentLoyaltyReward | null;
}) {
  const [current, setCurrent] = useState(reward || null);
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrent(reward || null);
  }, [reward]);

  if (!current && !reward) {
    return null;
  }
  const shown = current || reward;
  if (!shown) {
    return null;
  }

  async function validate(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    if (!shown || shown.status !== "requested" || !shown.centerId) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await redeemCenterReward(
        shown.centerId,
        shown.requestId,
        Number(price) || 0,
      );
      setCurrent({ ...shown, status: "used" });
      setMessage(
        `Récompense validée. Reste à régler : ${Number(result.due || 0).toLocaleString("fr-FR")} €.`,
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(
        code === "insufficient_points"
          ? "Le solde a changé : la récompense n’est plus disponible."
          : code === "service_too_small"
            ? "Le montant de la prestation est trop bas."
            : code === "already_used"
              ? "Cette récompense est déjà utilisée."
              : "La validation a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1" onClick={(event) => event.stopPropagation()}>
      <p className="text-[11px] font-semibold">
        Récompense {shown.discountEur} €
        {shown.status === "used" ? " · utilisée" : " · à valider"}
      </p>
      {shown.status === "requested" ? (
        <div className="mt-1 flex items-center gap-1">
          <input
            type="number"
            min={0}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="Prix €"
            className="h-7 w-16 rounded border border-slate-200 bg-white px-1 text-[11px] text-slate-900"
          />
          <button
            type="button"
            disabled={busy}
            onClick={(event) => void validate(event)}
            className="rounded bg-slate-950 px-2 py-1 text-[11px] font-semibold text-white"
          >
            Valider
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-1 text-[11px] leading-4">{message}</p> : null}
    </div>
  );
}
