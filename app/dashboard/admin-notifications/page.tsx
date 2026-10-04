"use client";

import {
  Bell,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Smartphone,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  loadAdminInbox,
  markCenterAdminAlertRead,
  type AdminInboxItem,
} from "@/lib/center-billing";
import { loadIsBookeaAdmin } from "@/lib/center-access";
import { formatEuro } from "@/lib/bookea-tarifs";

function toLocalIsoDate(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return "";
  }
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWhen(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(time));
}

export default function AdminNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [items, setItems] = useState<AdminInboxItem[]>([]);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [centerFilter, setCenterFilter] = useState("tous");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function refresh() {
    const inbox = await loadAdminInbox();
    setItems(inbox);
  }

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const isAdmin = await loadIsBookeaAdmin();
        if (!alive) return;
        setAllowed(isAdmin);
        if (isAdmin) {
          await refresh();
        }
      } catch (loadError) {
        if (!alive) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger les notifications.",
        );
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const centers = useMemo(() => {
    const byId = new Map<string, string>();
    for (const item of items) {
      if (item.centerId && !byId.has(item.centerId)) {
        byId.set(item.centerId, item.centerName);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, "fr"));
  }, [items]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (centerFilter !== "tous" && item.centerId !== centerFilter) {
          return false;
        }
        const day = toLocalIsoDate(item.createdAt);
        if (dateFrom && day < dateFrom) {
          return false;
        }
        if (dateTo && day > dateTo) {
          return false;
        }
        return true;
      }),
    [centerFilter, dateFrom, dateTo, items],
  );

  const unreadCount = useMemo(
    () => filteredItems.filter((item) => !item.readAt).length,
    [filteredItems],
  );

  const hasActiveFilters =
    centerFilter !== "tous" || Boolean(dateFrom) || Boolean(dateTo);

  function resetFilters() {
    setCenterFilter("tous");
    setDateFrom("");
    setDateTo("");
  }

  async function handleMarkRead(item: AdminInboxItem) {
    setMarkingId(item.id);
    setError("");
    try {
      await markCenterAdminAlertRead(item.centerId, item.id);
      setItems((current) =>
        current.map((alert) =>
          alert.id === item.id
            ? { ...alert, readAt: new Date().toISOString() }
            : alert,
        ),
      );
    } catch (markError) {
      setError(
        markError instanceof Error
          ? markError.message
          : "Impossible de marquer cette notification.",
      );
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <div className="mx-auto max-w-5xl space-y-6 p-8">
        <header>
          <p className="text-sm font-medium text-violet-600">Bookea Admin</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Centre de notifications
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-500">
            Souscriptions WhatsApp et recharges SMS des centres. À facturer, à
            recharger côté opérateur si besoin.
          </p>
        </header>

        {loading ? (
          <div className="grid min-h-56 place-items-center rounded-[2rem] border border-slate-200 bg-white text-slate-500">
            <div className="flex items-center gap-3 font-semibold">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement...
            </div>
          </div>
        ) : !allowed ? (
          <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center">
            <Bell className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 text-base font-semibold">Accès réservé</p>
            <p className="mt-2 font-medium text-slate-500">
              Cet espace est réservé à l’équipe Bookea.
            </p>
          </div>
        ) : (
          <>
            {error ? (
              <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
              <label className="min-w-[12rem] flex-1">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-500">
                  Centre
                </span>
                <select
                  value={centerFilter}
                  onChange={(event) => setCenterFilter(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                >
                  <option value="tous">Tous les centres</option>
                  {centers.map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-500">
                  Du
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-500">
                  Au
                </span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </label>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Réinitialiser
                </button>
              ) : null}
            </div>

            <p className="text-sm font-medium text-slate-500">
              {unreadCount} non lue{unreadCount > 1 ? "s" : ""} ·{" "}
              {filteredItems.length} affichée
              {filteredItems.length > 1 ? "s" : ""}
              {hasActiveFilters ? ` · ${items.length} au total` : ""}
            </p>

            {items.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center">
                <Bell className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-4 text-base font-semibold">
                  Aucune notification
                </p>
                <p className="mt-2 font-medium text-slate-500">
                  Les souscriptions Tarifs apparaîtront ici.
                </p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center">
                <Bell className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-4 text-base font-semibold">
                  Aucune notification pour ces filtres
                </p>
                <p className="mt-2 font-medium text-slate-500">
                  Changez le centre ou la période, ou réinitialisez.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => {
                  const Icon =
                    item.kind === "seya_pack"
                      ? MessageCircle
                      : item.kind === "crm_pack"
                        ? Users
                        : Smartphone;

                  return (
                    <article
                      key={`${item.centerId}:${item.id}`}
                      className={`rounded-2xl border bg-white p-5 shadow-sm ${
                        item.readAt
                          ? "border-slate-200"
                          : "border-violet-200 ring-1 ring-violet-100"
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex gap-3">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-600">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-base font-semibold">
                              {item.title}
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-600">
                              {item.message}
                            </p>
                            <p className="mt-2 text-xs font-medium text-slate-400">
                              {formatWhen(item.createdAt)} · {item.centerName} ·{" "}
                              {formatEuro(item.amountEuros)} · à facturer
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Link
                            href={`/dashboard/admin-centres#center-${item.centerId}`}
                            className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Fiche centre
                          </Link>
                          {!item.readAt ? (
                            <button
                              type="button"
                              disabled={markingId === item.id}
                              onClick={() => void handleMarkRead(item)}
                              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                            >
                              {markingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              Marquer lu
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
