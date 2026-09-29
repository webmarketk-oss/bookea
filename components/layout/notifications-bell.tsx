"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  loadCenterNotifications,
  markAllCenterNotificationsRead,
  markCenterNotificationsRead,
  subscribeCenterNotificationSources,
  type CenterNotification,
} from "@/lib/center-notifications";

type NotificationsBellProps = {
  variant?: "light" | "dark";
  collapsed?: boolean;
};

function relativeTime(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "";
  }

  const minutes = Math.round((Date.now() - parsed) / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (minutes < 60 * 24) return `Il y a ${Math.round(minutes / 60)} h`;
  if (minutes < 60 * 48) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(new Date(parsed));
}

export function NotificationsBell({
  variant = "light",
  collapsed = false,
}: NotificationsBellProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const ignoreCloseRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<CenterNotification[]>([]);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left?: number;
    right?: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      void fetch("/api/sms/inbound").catch(() => null);
      const next = await loadCenterNotifications();
      setItems(next);
    } catch {
      // Keep the last list: a failed reload must not empty the bell.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeCenterNotificationSources(() => {
      void refresh();
    });
    const timer = window.setInterval(() => {
      void refresh();
    }, 60_000);

    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) {
        return;
      }
      setItems((list) => {
        const ids = list.filter((entry) => entry.unread).map((entry) => entry.id);
        if (ids.length > 0) {
          void markCenterNotificationsRead(ids).catch(() => null);
        }
        return list.map((entry) => ({ ...entry, unread: false }));
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, refresh]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }

    function place() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      if (collapsed) {
        setPanelPos({ top: rect.top, left: rect.right + 12 });
        return;
      }

      setPanelPos({
        top: rect.bottom + 8,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, collapsed]);

  useEffect(() => {
    if (!open) {
      return;
    }

    ignoreCloseRef.current = true;

    function handlePointer(event: MouseEvent) {
      if (ignoreCloseRef.current) {
        ignoreCloseRef.current = false;
        return;
      }

      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const unreadCount = items.filter((item) => item.unread).length;
  const isDark = variant === "dark";

  function toggleOpen() {
    setOpen((current) => !current);
  }

  function openItem(item: CenterNotification) {
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, unread: false } : entry,
      ),
    );
    setOpen(false);
    void markCenterNotificationsRead([item.id]).catch(() => null);
    router.push(item.href);
  }

  async function markAllRead() {
    const ids = items.filter((item) => item.unread).map((item) => item.id);
    if (ids.length === 0) {
      return;
    }

    setItems((current) => current.map((item) => ({ ...item, unread: false })));
    await markAllCenterNotificationsRead(items);
  }

  const panel =
    open && panelPos ? (
      <div
        ref={panelRef}
        data-sidebar-keep-open="true"
        className={`fixed z-[200] w-80 rounded-2xl border p-3 shadow-xl ${
          isDark
            ? "border-white/10 bg-[#171b38] text-white"
            : "border-slate-200 bg-white"
        }`}
        style={panelPos}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className={`font-black ${isDark ? "text-white" : "text-slate-950"}`}>
            Notifications
          </p>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className={`text-xs font-semibold ${
                  isDark
                    ? "text-white/60 hover:text-white"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Tout lu
              </button>
            )}
            <span
              className={`rounded-full px-2 py-1 text-xs font-black ${
                unreadCount > 0
                  ? "bg-rose-500 text-white"
                  : isDark
                    ? "bg-white/10 text-white/70"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {unreadCount}
            </span>
          </div>
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {!ready ? (
            <p
              className={`rounded-xl border p-3 text-sm font-semibold ${
                isDark
                  ? "border-white/10 text-white/50"
                  : "border-slate-100 text-slate-500"
              }`}
            >
              Chargement des notifications…
            </p>
          ) : items.length === 0 ? (
            <p
              className={`rounded-xl border p-3 text-sm font-semibold ${
                isDark
                  ? "border-white/10 text-white/50"
                  : "border-slate-100 text-slate-500"
              }`}
            >
              Aucune notification pour ce centre.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void openItem(item)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  item.unread
                    ? isDark
                      ? "border-white/15 bg-white/10"
                      : "border-blue-100 bg-blue-50"
                    : isDark
                      ? "border-white/10 hover:bg-white/5"
                      : "border-slate-100 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={`min-w-0 flex-1 text-sm font-black leading-5 ${
                      isDark ? "text-white" : "text-slate-950"
                    }`}
                  >
                    {item.title}
                  </p>
                  {item.unread && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                  )}
                </div>
                <p
                  className={`mt-1 line-clamp-2 text-xs font-semibold ${
                    isDark ? "text-white/65" : "text-slate-600"
                  }`}
                >
                  {item.body}
                </p>
                <p
                  className={`mt-1 text-[11px] font-medium ${
                    isDark ? "text-white/40" : "text-slate-400"
                  }`}
                >
                  {relativeTime(item.createdAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative" data-sidebar-keep-open="true">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Notifications"
        aria-expanded={open}
        className={
          isDark
            ? `relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white ${
                collapsed ? "w-full" : ""
              }`
            : "relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#dfe5f2] bg-white text-[#11152e] transition-colors hover:bg-[#e9eeff]"
        }
      >
        <Bell className="h-5 w-5" />
        <span
          className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black ${
            unreadCount > 0
              ? "bg-rose-500 text-white"
              : isDark
                ? "bg-white/20 text-white/70"
                : "bg-slate-200 text-slate-600"
          }`}
        >
          {unreadCount}
        </span>
      </button>

      {portalTarget && panel ? createPortal(panel, portalTarget) : null}
    </div>
  );
}
