"use client";

import { Building2, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  type AccessibleCenter,
  readActiveCenterId,
  readStoredAccessibleCenters,
  refreshAccessibleCenters,
  saveActiveCenterId,
} from "@/lib/center-access";
import { flushCrmWrites } from "@/lib/crm-supabase";

type CenterSwitcherProps = {
  collapsed: boolean;
  onExpand?: () => void;
};

export function CenterSwitcher({ collapsed, onExpand }: CenterSwitcherProps) {
  const [centers, setCenters] = useState<AccessibleCenter[]>([]);
  const [activeCenterId, setActiveCenterId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const stored = readStoredAccessibleCenters();
    const savedId = readActiveCenterId();

    function show(list: AccessibleCenter[]) {
      const selectedCenter = list.find((center) => center.id === savedId) ?? list[0];
      setCenters(list);
      setActiveCenterId(selectedCenter?.id ?? "");
      setError("");
      setLoading(false);
      return selectedCenter;
    }

    if (stored.some((center) => center.id === savedId)) {
      show(stored);
    }
    const slowHint = window.setTimeout(() => {
      if (alive && !stored.length) {
        setError("Chargement plus long que prévu…");
      }
    }, 8000);

    // Pas de délai maximal ici : une réponse tardive remplace le message, un échec est relancé une fois.
    const load = () => refreshAccessibleCenters();
    load()
      .catch(async (firstError) => {
        if (/auth session missing|not authenticated|jwt/i.test(String(firstError?.message))) {
          throw firstError;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        return load();
      })
      .then((loadedCenters) => {
        if (!alive) return;
        const selectedCenter = show(loadedCenters);
        if (selectedCenter?.id && selectedCenter.id !== readActiveCenterId()) {
          saveActiveCenterId(selectedCenter.id);
        }
      })
      .catch((loadError) => {
        if (!alive) return;
        const raw =
          loadError instanceof Error ? loadError.message : "Impossible de charger les centres.";
        if (stored.length && !/auth session missing|not authenticated|jwt/i.test(raw)) {
          // On garde la liste connue : les données restent protégées par la base.
          show(stored);
          return;
        }
        setCenters([]);
        setActiveCenterId("");
        setError(
          /timeout|statement|fetch|network|abort/i.test(raw)
            ? "Le centre met trop longtemps à charger. Recharge la page, ou reconnecte-toi."
            : raw,
        );
        setLoading(false);
      })
      .finally(() => window.clearTimeout(slowHint));

    return () => {
      alive = false;
      window.clearTimeout(slowHint);
    };
  }, []);

  const activeCenter = centers.find((center) => center.id === activeCenterId);
  const needsLogin = /auth session missing|not authenticated|jwt/i.test(error);

  function handleChange(nextCenterId: string) {
    if (!nextCenterId || nextCenterId === activeCenterId || switching) {
      return;
    }

    setSwitching(true);
    window.dispatchEvent(new Event("bookea-center-will-switch"));

    void (async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      await Promise.race([
        flushCrmWrites(),
        new Promise((resolve) => window.setTimeout(resolve, 4000)),
      ]);
      setActiveCenterId(nextCenterId);
      saveActiveCenterId(nextCenterId);
      window.location.reload();
    })();
  }

  if (collapsed) {
    return (
      <button
        type="button"
        data-sidebar-keep-open="true"
        title={activeCenter?.name ?? "Changer de centre"}
        onClick={() => onExpand?.()}
        className="mb-4 flex h-11 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <Building2 className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div
      data-sidebar-keep-open="true"
      className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-3"
    >
      <span className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-white/40">
        <Building2 className="h-4 w-4" />
        Centre actif
      </span>
      {loading ? (
        <p className="text-sm font-medium text-white/50">{error || "Chargement…"}</p>
      ) : needsLogin ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-white/70">
            Session expirée. Reconnecte-toi pour changer de centre.
          </p>
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-xl bg-white px-3 text-sm font-semibold text-[#11152e]"
          >
            Se reconnecter
          </Link>
        </div>
      ) : error ? (
        <p className="text-sm font-medium text-rose-200">{error}</p>
      ) : centers.length === 0 ? (
        <p className="text-sm font-medium text-white/60">
          Aucun centre accessible sur ce compte.
        </p>
      ) : (
        <span className="relative block">
          <select
            value={activeCenterId}
            disabled={switching}
            onChange={(event) => handleChange(event.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#171b38] px-3 pr-10 text-sm font-medium text-white outline-none transition focus:border-blue-400 disabled:opacity-60"
          >
            {centers.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
        </span>
      )}
      {switching ? (
        <p className="mt-2 text-xs font-medium text-white/50">
          Enregistrement, puis changement de centre…
        </p>
      ) : null}
    </div>
  );
}
