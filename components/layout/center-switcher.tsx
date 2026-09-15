"use client";

import { Building2, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";

import {
  type AccessibleCenter,
  loadAccessibleCenters,
  readActiveCenterId,
  saveActiveCenterId,
} from "@/lib/center-access";

type CenterSwitcherProps = {
  collapsed: boolean;
};

export function CenterSwitcher({ collapsed }: CenterSwitcherProps) {
  const [centers, setCenters] = useState<AccessibleCenter[]>([]);
  const [activeCenterId, setActiveCenterId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    loadAccessibleCenters()
      .then((loadedCenters) => {
        if (!alive) return;

        const selectedCenter =
          loadedCenters.find((center) => center.id === readActiveCenterId()) ??
          loadedCenters[0];

        setCenters(loadedCenters);
        setActiveCenterId(selectedCenter?.id ?? "");

        if (selectedCenter?.id) {
          saveActiveCenterId(selectedCenter.id);
        }
      })
      .catch(() => {
        if (alive) {
          setCenters([]);
          setActiveCenterId("");
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  if (loading || centers.length === 0) {
    return null;
  }

  const activeCenter = centers.find((center) => center.id === activeCenterId);

  function handleChange(nextCenterId: string) {
    setActiveCenterId(nextCenterId);
    saveActiveCenterId(nextCenterId);
    window.location.reload();
  }

  if (collapsed) {
    return (
      <button
        type="button"
        data-sidebar-keep-open="true"
        title={activeCenter?.name ?? "Changer de centre"}
        className="mb-4 flex h-11 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <Building2 className="h-5 w-5" />
      </button>
    );
  }

  return (
    <label
      data-sidebar-keep-open="true"
      className="mb-5 block rounded-2xl border border-white/10 bg-white/5 p-3"
    >
      <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-white/40">
        <Building2 className="h-4 w-4" />
        Centre actif
      </span>
      <span className="relative block">
        <select
          value={activeCenterId}
          onChange={(event) => handleChange(event.target.value)}
          className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#171b38] px-3 pr-10 text-sm font-black text-white outline-none transition focus:border-blue-400"
        >
          {centers.map((center) => (
            <option key={center.id} value={center.id}>
              {center.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
      </span>
    </label>
  );
}
