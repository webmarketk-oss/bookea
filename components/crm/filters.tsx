import { Search, SlidersHorizontal, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { leadStatuses } from "@/lib/lead-statuses";
import { LeadStatus } from "@/types/lead";

export type ProspectFilters = {
  search: string;
  sources: string[];
  campaigns: string[];
  commercials: string[];
  /** Catégorie choisie depuis les cartes du tableau de bord. */
  status: "Tous" | LeadStatus;
  /** Statuts cochés dans les filtres avancés. */
  statuses: LeadStatus[];
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
  sortBy: "created" | "updated";
};

export const defaultProspectFilters: ProspectFilters = {
  search: "",
  sources: [],
  campaigns: [],
  commercials: [],
  status: "Tous",
  statuses: [],
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
  commercialOptions?: string[];
  sourceOptions?: string[];
  campaignOptions?: string[];
};

export default function Filters({
  filters,
  onFiltersChange,
  onReset,
  onNewLead,
  commercialOptions = [],
  sourceOptions = [],
  campaignOptions = [],
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
          <FilterMultiSelect
            label="Source"
            allLabel="Tous"
            selected={draft.sources}
            options={withSelected(sourceOptions, draft.sources)}
            onChange={(value) => updateDraft("sources", value)}
          />

          <FilterMultiSelect
            label="Campagne"
            allLabel="Toutes"
            selected={draft.campaigns}
            options={withSelected(campaignOptions, draft.campaigns)}
            onChange={(value) => updateDraft("campaigns", value)}
          />

          <FilterMultiSelect
            label="Commercial"
            allLabel="Tous"
            selected={draft.commercials}
            options={withSelected(commercialOptions, draft.commercials)}
            onChange={(value) => updateDraft("commercials", value)}
          />

          <FilterMultiSelect
            label="Statut"
            allLabel="Tous"
            selected={draft.statuses}
            options={leadStatuses}
            onChange={(value) => updateDraft("statuses", value as LeadStatus[])}
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

function withSelected(options: string[], selected: string[]) {
  return Array.from(new Set([...options, ...selected])).filter(Boolean);
}

function multiSummary(selected: string[], allLabel: string) {
  if (selected.length === 0) {
    return allLabel;
  }
  if (selected.length <= 2) {
    return selected.join(", ");
  }
  return `${selected.length} sélectionnés`;
}

function FilterMultiSelect({
  label,
  allLabel,
  selected,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  selected: string[];
  options: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function closeOutside(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function toggle(option: string) {
    onChange(
      selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option],
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        title={selected.length > 2 ? selected.join(", ") : undefined}
        className={`h-11 max-w-full truncate rounded-xl border bg-white px-4 pr-9 text-left text-sm font-semibold text-slate-800 shadow-sm outline-none transition-colors hover:bg-slate-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${
          selected.length ? "border-violet-300" : "border-slate-200"
        }`}
      >
        {label} : {multiSummary(selected, allLabel)}
      </button>
      <span className="pointer-events-none absolute right-3 top-[22px] -translate-y-1/2 text-xs text-slate-400">
        ▾
      </span>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="absolute left-0 z-30 mt-2 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm font-semibold hover:bg-slate-50 ${
              selected.length === 0 ? "text-violet-700" : "text-slate-500"
            }`}
          >
            {allLabel}
          </button>
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-slate-400">Aucune option</p>
          ) : (
            options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => toggle(option)}
                  className="h-4 w-4 accent-violet-600"
                />
                {option}
              </label>
            ))
          )}
        </div>
      ) : null}
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
