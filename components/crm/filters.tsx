import { Search, SlidersHorizontal, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { leadStatuses } from "@/lib/lead-statuses";
import { Lead, LeadStatus } from "@/types/lead";

export type ProspectFilters = {
  search: string;
  source: "Tous" | Lead["source"];
  campaign: string;
  commercial: string;
  status: "Tous" | LeadStatus;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
  sortBy: "created" | "updated";
};

export const defaultProspectFilters: ProspectFilters = {
  search: "",
  source: "Tous",
  campaign: "Toutes",
  commercial: "Tous",
  status: "Tous",
  createdFrom: "",
  createdTo: "",
  updatedFrom: "",
  updatedTo: "",
  sortBy: "created",
};

type FiltersProps = {
  filters: ProspectFilters;
  onFiltersChange: (
    filters: ProspectFilters | ((current: ProspectFilters) => ProspectFilters),
  ) => void;
  onReset?: () => void;
  onNewLead: () => void;
};

const sourceOptions: ProspectFilters["source"][] = [
  "Tous",
  "Facebook",
  "Instagram",
  "Google",
  "Site Web",
  "Organique",
];

const campaignOptions = [
  "Toutes",
  "Laser juillet",
  "Cryo été",
  "HIFU Lift",
  "Hydrafacial",
];

const commercialOptions = ["Tous", "Samantha", "Thomas", "Camille"];

const statusOptions: ProspectFilters["status"][] = [
  "Tous",
  ...leadStatuses,
];

export default function Filters({
  filters,
  onFiltersChange,
  onReset,
  onNewLead,
}: FiltersProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [draft, setDraft] = useState<ProspectFilters>(filters);

  function updateSearch(value: string) {
    onFiltersChange((current) => ({
      ...current,
      search: value,
    }));
  }

  function updateDraft<Key extends keyof ProspectFilters>(
    key: Key,
    value: ProspectFilters[Key],
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function applyDraft() {
    onFiltersChange((current) => ({
      ...draft,
      search: current.search,
    }));
  }

  function resetFilters() {
    setDraft({ ...defaultProspectFilters });
    onFiltersChange({ ...defaultProspectFilters });
    onReset?.();
  }

  return (
    <div className="mt-8 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">

        <div className="relative flex-1 min-w-[280px]">

          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

          <input
            type="search"
            placeholder="Rechercher un prospect..."
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-slate-800 outline-none transition-colors placeholder:font-medium placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            autoComplete="off"
            value={filters.search}
            onChange={(event) => updateSearch(event.target.value)}
          />

        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setShowAdvancedFilters((open) => {
              if (!open) {
                setDraft({ ...filters, search: filters.search });
              }
              return !open;
            });
          }}
          aria-expanded={showAdvancedFilters}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filtres
        </Button>

        <Button type="button" onClick={onNewLead}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau
        </Button>

      </div>

      {showAdvancedFilters && (
        <>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect
            label="Source"
            value={draft.source}
            options={sourceOptions}
            onChange={(value) =>
              updateDraft("source", value as ProspectFilters["source"])
            }
          />

          <FilterSelect
            label="Campagne"
            value={draft.campaign}
            options={campaignOptions}
            onChange={(value) => updateDraft("campaign", value)}
          />

          <FilterSelect
            label="Commercial"
            value={draft.commercial}
            options={commercialOptions}
            onChange={(value) => updateDraft("commercial", value)}
          />

          <FilterSelect
            label="Statut"
            value={draft.status}
            options={statusOptions}
            onChange={(value) =>
              updateDraft("status", value as ProspectFilters["status"])
            }
          />

          <DateRangeFilter
            label="Date ajout prospect"
            from={draft.createdFrom}
            to={draft.createdTo}
            onFromChange={(value) => updateDraft("createdFrom", value)}
            onToChange={(value) => updateDraft("createdTo", value)}
          />

          <DateRangeFilter
            label="Dernière modification"
            from={draft.updatedFrom}
            to={draft.updatedTo}
            onFromChange={(value) => updateDraft("updatedFrom", value)}
            onToChange={(value) => updateDraft("updatedTo", value)}
          />

          <FilterSelect
            label="Trier"
            value={
              draft.sortBy === "updated"
                ? "Date dernière modification"
                : "Date d'ajout"
            }
            options={["Date d'ajout", "Date dernière modification"]}
            onChange={(value) =>
              updateDraft(
                "sortBy",
                value === "Date dernière modification" ? "updated" : "created",
              )
            }
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4"
            onClick={resetFilters}
          >
            Réinitialiser
          </Button>
          <Button type="button" className="h-11 px-4" onClick={applyDraft}>
            Valider
          </Button>
        </div>
        </>
      )}

    </div>
  );
}

function DateRangeFilter({
  label,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  label: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-black uppercase text-slate-500">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="sr-only">{label} début</span>
          <input
            type="date"
            value={from}
            onChange={(event) => onFromChange(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <label>
          <span className="sr-only">{label} fin</span>
          <input
            type="date"
            value={to}
            onChange={(event) => onToChange(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-9 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-colors hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {label} : {option}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
        ▾
      </span>
    </label>
  );
}
