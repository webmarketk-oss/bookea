"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const OPTION_HEIGHT = 32;
const LIST_PADDING = 8;
const VIEWPORT_GAP = 8;

type AdaptiveSelectProps = {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
};

export function AdaptiveSelect({
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: AdaptiveSelectProps) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [style, setStyle] = useState<CSSProperties>({});

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
    const needed = options.length * OPTION_HEIGHT + LIST_PADDING;
    const below = window.innerHeight - rect.bottom - VIEWPORT_GAP;
    const above = rect.top - VIEWPORT_GAP;
    const openUp = needed > below && above > below;
    const maxHeight = Math.max(OPTION_HEIGHT * 3, Math.min(needed, openUp ? above : below));
    setStyle({
      position: "fixed",
      left: rect.left,
      minWidth: rect.width,
      maxHeight,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    place();
  }, [open, place]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !list) {
      return;
    }
    const overflow = list.getBoundingClientRect().right - (window.innerWidth - VIEWPORT_GAP);
    if (overflow > 0) {
      list.style.left = `${Math.max(VIEWPORT_GAP, list.getBoundingClientRect().left - overflow)}px`;
    }
    list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [open, style, activeIndex]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !listRef.current?.contains(target)
      ) {
        close();
      }
    };
    const onScroll = (event: Event) => {
      if (!listRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    const onResize = () => close();
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  function openList() {
    setActiveIndex(Math.max(0, options.indexOf(value)));
    setOpen(true);
  }

  function choose(option: string) {
    if (option !== value) {
      onChange(option);
    }
    close(true);
  }

  function onKeyDown(event: KeyboardEvent) {
    event.stopPropagation();
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") {
        event.preventDefault();
      }
      close(event.key === "Escape");
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + step + options.length) % options.length);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option !== undefined) {
        choose(option);
      }
      return;
    }
    if (event.key.length === 1) {
      const letter = event.key.toLocaleLowerCase("fr");
      const start = activeIndex + 1;
      const ordered = [...options.slice(start), ...options.slice(0, start)];
      const match = ordered.find((option) =>
        option.toLocaleLowerCase("fr").startsWith(letter),
      );
      if (match !== undefined) {
        setActiveIndex(options.indexOf(match));
      }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            close();
          } else {
            openList();
          }
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "inline-flex items-center justify-between gap-1 text-left",
          className,
        )}
      >
        <span className="truncate">{value}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              style={style}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              className="z-[200] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold text-slate-800 shadow-xl"
            >
              {options.map((option, index) => (
                <li
                  key={option}
                  data-index={index}
                  role="option"
                  aria-selected={option === value}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg px-2.5",
                    index === activeIndex && "bg-slate-100",
                  )}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-violet-600",
                      option !== value && "invisible",
                    )}
                  />
                  {option}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
