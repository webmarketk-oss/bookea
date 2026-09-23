"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  searchFrenchPlaces,
  type FrenchPlace,
} from "@/lib/french-address";

type PlaceSuggestFieldProps = {
  inputClassName?: string;
  kind?: "address" | "city";
  label: string;
  labelClassName?: string;
  onChange: (value: string) => void;
  onSelect?: (place: FrenchPlace) => void;
  placeholder?: string;
  value: string;
};

export function PlaceSuggestField({
  inputClassName = "h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500",
  kind = "address",
  label,
  labelClassName = "text-xs font-medium text-slate-500",
  onChange,
  onSelect,
  placeholder,
  value,
}: PlaceSuggestFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLLabelElement>(null);
  const skipSearchRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [places, setPlaces] = useState<FrenchPlace[]>([]);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      setPlaces([]);
      setOpen(false);
      return;
    }

    const query = value.trim();

    if (query.length < 2) {
      setPlaces([]);
      setOpen(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void searchFrenchPlaces(query, kind)
        .then((nextPlaces) => {
          setPlaces(nextPlaces);
          setHighlight(0);
          setOpen(nextPlaces.length > 0);
        })
        .catch(() => {
          setPlaces([]);
          setOpen(false);
        });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [kind, value]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function choose(place: FrenchPlace) {
    skipSearchRef.current = true;
    onSelect?.(place);
    onChange(kind === "city" ? place.city : place.street);
    setPlaces([]);
    setOpen(false);
  }

  return (
    <label ref={rootRef} className="relative block space-y-1.5">
      <span className={labelClassName}>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className={inputClassName}
        onFocus={() => {
          if (places.length > 0) {
            setOpen(true);
          }
        }}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (!open || places.length === 0) {
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((current) => (current + 1) % places.length);
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) =>
              current === 0 ? places.length - 1 : current - 1,
            );
          }

          if (event.key === "Enter") {
            event.preventDefault();
            choose(places[highlight] ?? places[0]);
          }

          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {places.map((place, index) => (
            <li key={place.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                className={`flex w-full flex-col items-start px-3 py-2 text-left ${
                  index === highlight ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(place)}
              >
                <span className="text-sm font-medium text-slate-900">
                  {kind === "city" ? place.city : place.street}
                </span>
                <span className="text-xs text-slate-500">{place.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  );
}
