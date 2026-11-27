"use client";

import { useEffect, useState } from "react";

import {
  loadCenterLoyalty,
  loadLoyaltyHistory,
  saveCenterLoyalty,
  searchLoyaltyClients,
  type LoyaltyHistoryEntry,
  type LoyaltyProgram,
} from "@/lib/loyalty-client";

const emptyProgram = (): LoyaltyProgram => ({
  enabled: false,
  visitPoints: 20,
  depositBonus: 5,
  noShowPenalty: 15,
  noShowEnabled: false,
  rewards: [
    { id: "r100", points: 100, discountEur: 5, minServiceEur: 30 },
    { id: "r200", points: 200, discountEur: 12, minServiceEur: 60 },
  ],
});

export function LoyaltySettings({ centerId }: { centerId: string }) {
  const [program, setProgram] = useState<LoyaltyProgram>(emptyProgram);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<
    Array<{ id: string; first_name?: string; last_name?: string; phone?: string }>
  >([]);
  const [history, setHistory] = useState<LoyaltyHistoryEntry[]>([]);
  const [historyName, setHistoryName] = useState("");

  useEffect(() => {
    if (!centerId) {
      return;
    }
    let cancelled = false;
    void loadCenterLoyalty(centerId)
      .then((loaded) => {
        if (!cancelled) {
          setProgram(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("Les réglages fidélité n’ont pas pu être lus.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [centerId]);

  function updateReward(
    index: number,
    field: "points" | "discountEur" | "minServiceEur",
    value: number,
  ) {
    setProgram((current) => ({
      ...current,
      rewards: current.rewards.map((reward, rewardIndex) =>
        rewardIndex === index ? { ...reward, [field]: value } : reward,
      ),
    }));
  }

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const saved = await saveCenterLoyalty(centerId, program);
      setProgram(saved);
      setMessage("Programme enregistré. Les mouvements déjà passés restent inchangés.");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "forbidden"
          ? "Seule une responsable du centre peut modifier le programme."
          : "L’enregistrement a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    setClients(await searchLoyaltyClients(centerId, query));
  }

  async function openClient(client: { id: string; first_name?: string; last_name?: string }) {
    setHistoryName([client.first_name, client.last_name].filter(Boolean).join(" "));
    setHistory(await loadLoyaltyHistory(centerId, client.id));
  }

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Programme de fidélité</h2>
      <p className="mt-1 text-sm text-slate-500">
        Les points sont propres à cet établissement. Les créditer seulement quand le
        rendez-vous passe à Terminé, Présent ou Vendu. Un passage automatique à Présent
        ne donne rien : il faut confirmer le statut.
      </p>

      <label className="mt-5 flex items-center gap-3 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={program.enabled}
          onChange={(event) =>
            setProgram((current) => ({ ...current, enabled: event.target.checked }))
          }
        />
        Activer le programme
      </label>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="text-sm text-slate-600">
          Points par rendez-vous honoré
          <input
            type="number"
            min={0}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            value={program.visitPoints}
            onChange={(event) =>
              setProgram((current) => ({
                ...current,
                visitPoints: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="text-sm text-slate-600">
          Bonus acompte en ligne
          <input
            type="number"
            min={0}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            value={program.depositBonus}
            onChange={(event) =>
              setProgram((current) => ({
                ...current,
                depositBonus: Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="text-sm text-slate-600">
          Retrait no-show
          <input
            type="number"
            min={0}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            value={program.noShowPenalty}
            onChange={(event) =>
              setProgram((current) => ({
                ...current,
                noShowPenalty: Number(event.target.value),
              }))
            }
          />
        </label>
      </div>

      <label className="mt-4 flex items-center gap-3 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={program.noShowEnabled}
          onChange={(event) =>
            setProgram((current) => ({
              ...current,
              noShowEnabled: event.target.checked,
            }))
          }
        />
        Retirer des points en cas de no-show
      </label>
      <p className="mt-1 text-sm text-slate-500">
        Désactivé par défaut. Si vous l’activez, la règle est affichée aux clientes au
        moment de la réservation.
      </p>

      <div className="mt-6 space-y-3">
        <p className="text-sm font-semibold text-slate-900">Récompenses</p>
        {program.rewards.map((reward, index) => (
          <div key={reward.id || index} className="grid gap-3 md:grid-cols-4">
            <label className="text-sm text-slate-600">
              Points
              <input
                type="number"
                min={1}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
                value={reward.points}
                onChange={(event) => updateReward(index, "points", Number(event.target.value))}
              />
            </label>
            <label className="text-sm text-slate-600">
              Réduction €
              <input
                type="number"
                min={0}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
                value={reward.discountEur}
                onChange={(event) =>
                  updateReward(index, "discountEur", Number(event.target.value))
                }
              />
            </label>
            <label className="text-sm text-slate-600">
              Prestation minimum €
              <input
                type="number"
                min={0}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
                value={reward.minServiceEur}
                onChange={(event) =>
                  updateReward(index, "minServiceEur", Number(event.target.value))
                }
              />
            </label>
            <button
              type="button"
              className="self-end h-11 rounded-xl border border-slate-200 text-sm text-slate-600"
              onClick={() =>
                setProgram((current) => ({
                  ...current,
                  rewards: current.rewards.filter((_, rewardIndex) => rewardIndex !== index),
                }))
              }
            >
              Retirer
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-sm font-semibold text-violet-700"
          onClick={() =>
            setProgram((current) => ({
              ...current,
              rewards: [
                ...current.rewards,
                {
                  id: `r${Date.now()}`,
                  points: 100,
                  discountEur: 5,
                  minServiceEur: 30,
                },
              ],
            }))
          }
        >
          Ajouter une récompense
        </button>
      </div>

      <button
        type="button"
        disabled={busy || !centerId}
        onClick={() => void save()}
        className="mt-6 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        Enregistrer
      </button>
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}

      <div className="mt-8 border-t border-slate-100 pt-6">
        <h3 className="text-base font-semibold text-slate-950">Historique d’une cliente</h3>
        <div className="mt-3 flex gap-2">
          <input
            className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
            placeholder="Nom ou téléphone"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            onClick={() => void search()}
            className="rounded-xl border border-slate-200 px-4 text-sm font-semibold"
          >
            Chercher
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {clients.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => void openClient(client)}
              className="block w-full rounded-xl bg-slate-50 px-3 py-2 text-left text-sm"
            >
              {[client.first_name, client.last_name].filter(Boolean).join(" ")}{" "}
              <span className="text-slate-400">{client.phone}</span>
            </button>
          ))}
        </div>
        {historyName ? (
          <div className="mt-4">
            <p className="text-sm font-semibold">{historyName}</p>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Aucun mouvement.</p>
            ) : (
              <div className="mt-2 divide-y divide-slate-100">
                {history.map((entry) => (
                  <div key={entry.id} className="flex justify-between gap-3 py-2 text-sm">
                    <span>{entry.label}</span>
                    <span className="text-slate-400">
                      {entry.at ? new Date(entry.at).toLocaleDateString("fr-FR") : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
