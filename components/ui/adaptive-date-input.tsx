"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const VIEWPORT_GAP = 8;
const PANEL_WIDTH = 264;
const PANEL_HEIGHT = 318;
const TIME_ROW_HEIGHT = 44;
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const DEFAULT_TIME = "09:00";

type AdaptiveDateInputProps = {
  /** « AAAA-MM-JJ », ou « AAAA-MM-JJTHH:MM » avec `withTime`. Vide si aucune date. */
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  ariaLabel?: string;
  className?: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isoDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseValue(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!match) {
    return { day: "", time: "" };
  }
  return { day: `${match[1]}-${match[2]}-${match[3]}`, time: match[4] || "" };
}

function displayValue(day: string, time: string, withTime: boolean) {
  if (!day) {
    return "";
  }
  const [year, month, date] = day.split("-");
  const shown = `${date}/${month}/${year}`;
  return withTime && time ? `${shown} ${time}` : shown;
}

function monthStart(day: string) {
  const base = day ? new Date(`${day}T12:00:00`) : new Date();
  return new Date(base.getFullYear(), base.getMonth(), 1, 12);
}

function monthDays(start: Date) {
  const offset = (start.getDay() + 6) % 7;
  const first = new Date(start.getFullYear(), start.getMonth(), 1 - offset, 12);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return date;
  });
}

export function AdaptiveDateInput({
  value,
  onChange,
  withTime = false,
  ariaLabel,
  className,
}: AdaptiveDateInputProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const { day, time } = parseValue(value);
  const [month, setMonth] = useState(() => monthStart(day));
  const [timeDraft, setTimeDraft] = useState(time || DEFAULT_TIME);

  const close = useCallback((focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) {
      triggerRef.current?.focus();
    }
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const needed = PANEL_HEIGHT + (withTime ? TIME_ROW_HEIGHT : 0);
    const below = window.innerHeight - rect.bottom - VIEWPORT_GAP;
    const above = rect.top - VIEWPORT_GAP;
    const openUp = needed > below && above > below;
    const left = Math.max(
      VIEWPORT_GAP,
      Math.min(rect.left, window.innerWidth - PANEL_WIDTH - VIEWPORT_GAP),
    );
    setStyle({
      position: "fixed",
      left,
      width: PANEL_WIDTH,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [withTime]);

  useLayoutEffect(() => {
    if (open) {
      place();
    }
  }, [open, place]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        close();
      }
    };
    const onScroll = (event: Event) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    const onResize = () => close();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  function openPanel() {
    setMonth(monthStart(day));
    setTimeDraft(time || DEFAULT_TIME);
    setOpen(true);
  }

  function commit(nextDay: string, nextTime = timeDraft) {
    const next = !nextDay ? "" : withTime ? `${nextDay}T${nextTime || DEFAULT_TIME}` : nextDay;
    if (next !== value) {
      onChange(next);
    }
  }

  function chooseDay(date: Date) {
    commit(isoDay(date));
    close(true);
  }

  const shown = displayValue(day, time, withTime);
  const today = isoDay(new Date());
  const monthLabel = month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            close();
          } else {
            openPanel();
          }
        }}
        className={cn(
          "inline-flex items-center justify-between gap-1 text-left",
          !shown && "text-slate-400",
          className,
        )}
      >
        <span className="truncate">{shown || (withTime ? "jj/mm/aaaa --:--" : "jj/mm/aaaa")}</span>
        <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={ariaLabel}
              style={style}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              className="z-[200] rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl"
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Mois précédent"
                  onClick={() =>
                    setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))
                  }
                  className="rounded-lg p-1.5 hover:bg-slate-100"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-bold capitalize">{monthLabel}</span>
                <button
                  type="button"
                  aria-label="Mois suivant"
                  onClick={() =>
                    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))
                  }
                  className="rounded-lg p-1.5 hover:bg-slate-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-bold text-slate-400">
                {WEEKDAYS.map((label, index) => (
                  <span key={`${label}-${index}`} className="py-1">
                    {label}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {monthDays(month).map((date) => {
                  const iso = isoDay(date);
                  const inMonth = date.getMonth() === month.getMonth();
                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-label={date.toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      aria-pressed={iso === day}
                      onClick={() => chooseDay(date)}
                      className={cn(
                        "h-8 rounded-lg text-xs font-semibold hover:bg-violet-50",
                        !inMonth && "text-slate-300",
                        iso === today && iso !== day && "ring-1 ring-violet-300",
                        iso === day && "bg-violet-600 text-white hover:bg-violet-600",
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              {withTime ? (
                <label className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                  Heure
                  <input
                    type="time"
                    value={timeDraft}
                    onChange={(event) => {
                      setTimeDraft(event.target.value);
                      if (day && event.target.value) {
                        commit(day, event.target.value);
                      }
                    }}
                    className="h-8 rounded-lg border border-slate-200 px-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                  />
                </label>
              ) : null}
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    commit("");
                    close(true);
                  }}
                  className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
                >
                  Effacer
                </button>
                <button
                  type="button"
                  onClick={() => chooseDay(new Date())}
                  className="rounded-lg px-2 py-1 text-violet-700 hover:bg-violet-50"
                >
                  Aujourd’hui
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
