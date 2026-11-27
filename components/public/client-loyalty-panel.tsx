"use client";

import { useEffect, useState } from "react";

import {
  loadClientLoyalty,
  requestClientReward,
  type LoyaltyCard,
} from "@/lib/loyalty-client";

const rewardErrors: Record<string, string> = {
  insufficient_points: "Le solde ne suffit plus pour cette récompense.",
  service_too_small: "La prestation n’atteint pas le montant minimum.",
  already_requested: "Une récompense est déjà demandée sur ce rendez-vous.",
  appointment_not_eligible: "Ce rendez-vous n’est plus éligible.",
  program_disabled: "Ce centre n’a pas activé le programme.",
  loyalty_not_ready: "Le programme n’est pas encore disponible.",
};

export function ClientLoyaltyPanel() {
  const [cards, setCards] = useState<LoyaltyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [choice, setChoice] = useState<
    Record<string, { rewardId: string; appointmentId: string }>
  >({});

  async function reload() {
    const next = await loadClientLoyalty();
    setCards(next);
  }

  useEffect(() => {
    let cancelled = false;
    void loadClientLoyalty()
      .then((next) => {
        if (!cancelled) {
          setCards(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("La carte de fidélité n’a pas pu être chargée.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function useReward(card: LoyaltyCard) {
    const selected = choice[card.centerId];
    if (!selected?.appointmentId || !selected.rewardId) {
      setError("Choisissez une récompense et un rendez-vous.");
      return;
    }
    setBusyId(card.centerId);
    setError("");
    try {
      await requestClientReward(selected.appointmentId, selected.rewardId);
      setChoice((current) => ({
        ...current,
        [card.centerId]: { rewardId: "", appointmentId: "" },
      }));
      await reload();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setError(rewardErrors[code] || "La demande n’a pas pu être enregistrée.");
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return <p className="text-sm font-medium text-slate-500">Chargement des cartes…</p>;
  }
  if (!cards.length) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-950">Carte fidélité</h3>
        <p className="mt-2 text-sm text-slate-500">
          Aucune carte pour le moment. Les points apparaissent par institut, après un
          rendez-vous confirmé par le salon.
        </p>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      ) : null}
      {cards.map((card) => (
        <section
          key={card.centerId}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
            {card.centerName}
          </p>
          <h3 className="mt-1 font-serif text-2xl text-slate-950">
            {card.balance} point{card.balance === 1 ? "" : "s"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {card.pending > 0
              ? `${card.pending} point${card.pending === 1 ? "" : "s"} en attente`
              : "Aucun point en attente"}
          </p>
          <p className="mt-3 text-sm font-medium text-slate-700">{card.progress}</p>
          {card.noShowRule ? (
            <p className="mt-3 rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
              {card.noShowRule}
            </p>
          ) : null}
          {!card.enabled && card.balance === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Ce centre n’a pas encore activé son programme.
            </p>
          ) : null}

          {card.enabled ? (
          <div className="mt-5 space-y-3">
            {card.rewards.map((reward) => (
              <div
                key={reward.id}
                className="rounded-2xl border border-slate-200 px-4 py-3"
              >
                <p className="text-sm font-semibold text-slate-950">
                  {reward.points} points = {reward.discountEur} €
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Sur une prestation d’au moins {reward.minServiceEur} €.
                </p>
              </div>
            ))}
          </div>
          ) : null}

          {card.enabled && card.appointments.length > 0 ? (
            <div className="mt-4 space-y-3">
              <label className="block text-sm text-slate-600">
                Récompense
                <select
                  className="mt-1 h-11 w-full rounded-2xl border border-slate-200 px-3"
                  value={choice[card.centerId]?.rewardId || ""}
                  onChange={(event) =>
                    setChoice((current) => ({
                      ...current,
                      [card.centerId]: {
                        rewardId: event.target.value,
                        appointmentId: current[card.centerId]?.appointmentId || "",
                      },
                    }))
                  }
                >
                  <option value="">Choisir</option>
                  {card.rewards.map((reward) => (
                    <option key={reward.id} value={reward.id}>
                      {reward.discountEur} € · {reward.points} points
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-slate-600">
                Prochain rendez-vous
                <select
                  className="mt-1 h-11 w-full rounded-2xl border border-slate-200 px-3"
                  value={choice[card.centerId]?.appointmentId || ""}
                  onChange={(event) =>
                    setChoice((current) => ({
                      ...current,
                      [card.centerId]: {
                        rewardId: current[card.centerId]?.rewardId || "",
                        appointmentId: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="">Choisir</option>
                  {card.appointments.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {appointment.date} {appointment.time} · {appointment.service}
                      {appointment.request ? " · récompense demandée" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busyId === card.centerId}
                onClick={() => void useReward(card)}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Utiliser mes points
              </button>
            </div>
          ) : null}

          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">
              Historique
            </p>
            {card.history.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Aucun mouvement.</p>
            ) : (
              <div className="mt-2 divide-y divide-slate-100">
                {card.history.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 py-2">
                    <p className="text-sm text-slate-700">{entry.label}</p>
                    <p className="shrink-0 text-xs text-slate-400">
                      {entry.at ? new Date(entry.at).toLocaleDateString("fr-FR") : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
