"use client";

import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Loader2,
  PowerOff,
  Mail,
  MessageCircle,
  Smartphone,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  billingAlerts,
  companyLabel,
  type AgencyCompany,
} from "@/lib/admin-agency-billing";
import { loadAgencyBilling } from "@/lib/admin-agency-store";
import {
  fulfillSubscriptionInvoice,
  subscriptionInvoiceHref,
} from "@/lib/admin-subscription-invoice";
import { isInvoiceableAdminAlert } from "@/lib/admin-alerts";
import {
  loadAdminInbox,
  markCenterAdminAlertRead,
  setCenterSeyaQuota,
  type AdminInboxItem,
} from "@/lib/center-billing";
import { loadIsBookeaAdmin } from "@/lib/center-access";
import { createClient } from "@/lib/supabase";
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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [items, setItems] = useState<AdminInboxItem[]>([]);
  const [cycleAlerts, setCycleAlerts] = useState<
    Array<{ company: AgencyCompany; label: string; overdue: boolean }>
  >([]);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);
  const [cuttingId, setCuttingId] = useState<string | null>(null);
  const [cutIds, setCutIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [centerFilter, setCenterFilter] = useState("tous");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [senderEmail, setSenderEmail] = useState("info@bookeai.fr");
  const [senderOtp, setSenderOtp] = useState("");
  const [senderBusy, setSenderBusy] = useState(false);
  const [senderNotice, setSenderNotice] = useState("");
  const [senderError, setSenderError] = useState("");
  const [sender, setSender] = useState({
    connected: false,
    pending: false,
    brevoReady: false,
    email: "info@bookeai.fr",
  });

  async function refresh() {
    const [inbox, webk, bookea] = await Promise.all([
      loadAdminInbox(),
      loadAgencyBilling("webk"),
      loadAgencyBilling("bookea"),
    ]);
    setItems(inbox);
    setCycleAlerts(
      (["webk", "bookea"] as const).flatMap((company) =>
        billingAlerts(company === "webk" ? webk : bookea).map((alert) => ({
          company,
          label: alert.label,
          overdue: alert.overdue,
        })),
      ),
    );
    await loadBookeaSender();
  }

  async function senderAuthHeaders() {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    };
  }

  async function loadBookeaSender() {
    const response = await fetch("/api/mailing/bookea-sender", {
      headers: await senderAuthHeaders(),
    });
    const result = (await response.json().catch(() => ({}))) as {
      connected?: boolean;
      pending?: boolean;
      brevoReady?: boolean;
      email?: string;
      error?: string;
    };
    if (!response.ok) {
      setSenderError(result.error || "Impossible de lire la boîte Bookea.");
      return;
    }
    setSender({
      connected: Boolean(result.connected),
      pending: Boolean(result.pending),
      brevoReady: Boolean(result.brevoReady),
      email: result.email || "info@bookeai.fr",
    });
    if (result.email) {
      setSenderEmail(result.email);
    }
  }

  async function postBookeaSender(body: {
    action: "connect" | "validate" | "disconnect";
    email?: string;
    otp?: string;
  }) {
    setSenderBusy(true);
    setSenderError("");
    setSenderNotice("");
    try {
      const response = await fetch("/api/mailing/bookea-sender", {
        method: "POST",
        headers: await senderAuthHeaders(),
        body: JSON.stringify({
          ...body,
          name: "Bookea",
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        connected?: boolean;
        pending?: boolean;
        brevoReady?: boolean;
        email?: string;
        error?: string;
        notice?: string;
      };
      setSender({
        connected: Boolean(result.connected),
        pending: Boolean(result.pending),
        brevoReady: Boolean(result.brevoReady),
        email: result.email || senderEmail,
      });
      if (result.email) {
        setSenderEmail(result.email);
      }
      if (!response.ok) {
        setSenderError(
          result.error || `Impossible de connecter la boîte (${response.status}).`,
        );
        return;
      }
      setSenderNotice(result.notice || "");
      if (result.connected) {
        setSenderOtp("");
      }
    } catch {
      setSenderError("Impossible de connecter la boîte Bookea.");
    } finally {
      setSenderBusy(false);
    }
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

  async function handleOpenInvoice(item: AdminInboxItem) {
    if (fulfillingId) {
      return;
    }
    setFulfillingId(item.id);
    setError("");
    try {
      const result = await fulfillSubscriptionInvoice(item);
      if (!item.readAt) {
        await markCenterAdminAlertRead(item.centerId, item.id).catch(() => undefined);
      }
      setItems((current) =>
        current.map((alert) =>
          alert.id === item.id
            ? {
                ...alert,
                readAt: alert.readAt || new Date().toISOString(),
                billingStatus: "invoiced",
                invoiceId: result.invoice.id,
                emailedAt: result.emailedAt,
                emailedTo: result.emailedTo,
              }
            : alert,
        ),
      );
      router.push(
        subscriptionInvoiceHref(result.invoice.id, Boolean(result.emailedAt)),
      );
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Impossible de préparer la facture.",
      );
    } finally {
      setFulfillingId(null);
    }
  }

  async function handleCutSeya(item: AdminInboxItem) {
    if (
      !window.confirm(
        `Couper Seya pour ${item.centerName} ? Plus aucune nouvelle conversation ne sera ouverte.`,
      )
    ) {
      return;
    }
    setCuttingId(item.id);
    setError("");
    try {
      await setCenterSeyaQuota(item.centerId, 0);
      await markCenterAdminAlertRead(item.centerId, item.id);
      setItems((current) =>
        current.map((alert) =>
          alert.id === item.id
            ? { ...alert, readAt: alert.readAt || new Date().toISOString() }
            : alert,
        ),
      );
      setCutIds((current) => [...current, item.id]);
    } catch (cutError) {
      setError(
        cutError instanceof Error
          ? cutError.message
          : "Impossible de couper Seya pour ce centre.",
      );
    } finally {
      setCuttingId(null);
    }
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

            <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600">
                  <Mail className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold">
                    Boîte mail Bookea
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Connectez info@bookeai.fr. C’est cette adresse qui envoie
                    les mails quand Seya pose un RDV ou qu’un prospect doit
                    être rappelé. Les centres reçoivent dans leur boîte.
                  </p>
                </div>
              </div>
              {sender.connected ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                    Connectée · {sender.email}
                  </p>
                  <button
                    type="button"
                    disabled={senderBusy}
                    onClick={() =>
                      void postBookeaSender({ action: "disconnect" })
                    }
                    className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 disabled:opacity-60"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                  <input
                    value={senderEmail}
                    onChange={(event) => setSenderEmail(event.target.value)}
                    placeholder="info@bookeai.fr"
                    className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-violet-500"
                  />
                  <button
                    type="button"
                    disabled={senderBusy}
                    onClick={() =>
                      void postBookeaSender({
                        action: "connect",
                        email: senderEmail || "info@bookeai.fr",
                      })
                    }
                    className="h-11 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {senderBusy ? "Envoi…" : "Recevoir le code"}
                  </button>
                  {sender.pending ? (
                    <>
                      <input
                        value={senderOtp}
                        onChange={(event) => setSenderOtp(event.target.value)}
                        placeholder="Code à 6 chiffres"
                        inputMode="numeric"
                        className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-violet-500"
                      />
                      <button
                        type="button"
                        disabled={senderBusy}
                        onClick={() =>
                          void postBookeaSender({
                            action: "validate",
                            otp: senderOtp,
                          })
                        }
                        className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Valider
                      </button>
                    </>
                  ) : null}
                </div>
              )}
              {senderNotice ? (
                <p className="mt-3 text-xs font-medium text-emerald-700">
                  {senderNotice}
                </p>
              ) : null}
              {senderError ? (
                <p className="mt-3 text-xs font-medium text-rose-700">
                  {senderError}
                </p>
              ) : null}
              {!sender.brevoReady ? (
                <p className="mt-3 text-xs font-medium text-amber-700">
                  L’envoi n’est pas encore branché côté Bookea.
                </p>
              ) : null}
            </section>

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

            {cycleAlerts.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-black uppercase text-amber-800">
                  Factures à émettre
                </p>
                <ul className="mt-2 space-y-1 text-sm font-semibold text-amber-950">
                  {cycleAlerts.map((alert) => (
                    <li key={`${alert.company}-${alert.label}`}>
                      {companyLabel(alert.company)} · {alert.label}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/dashboard/admin-gestion"
                  className="mt-3 inline-flex h-10 items-center rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white"
                >
                  Ouvrir la facturation
                </Link>
              </div>
            ) : null}

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
                  const invoiceable = isInvoiceableAdminAlert(item);
                  const Icon = !invoiceable
                    ? CalendarClock
                    : item.kind === "seya_pack"
                      ? MessageCircle
                      : item.kind === "crm_pack"
                        ? Users
                        : Smartphone;
                  const billed = item.billingStatus === "invoiced";

                  return (
                    <article
                      key={`${item.centerId}:${item.id}`}
                      role={invoiceable ? "button" : undefined}
                      tabIndex={invoiceable ? 0 : undefined}
                      onClick={
                        invoiceable
                          ? () => void handleOpenInvoice(item)
                          : undefined
                      }
                      onKeyDown={(event) => {
                        if (
                          invoiceable &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          void handleOpenInvoice(item);
                        }
                      }}
                      className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition ${
                        invoiceable ? "cursor-pointer hover:border-violet-300" : ""
                      } ${
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
                              {formatEuro(item.amountEuros)} ·{" "}
                              {!invoiceable
                                ? cutIds.includes(item.id)
                                  ? "Seya coupé"
                                  : "non renouvelé"
                                : billed
                                  ? item.emailedTo
                                    ? `envoyée à ${item.emailedTo}`
                                    : "facturée"
                                  : "à facturer"}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Link
                            href={`/dashboard/admin-centres#center-${item.centerId}`}
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Fiche centre
                          </Link>
                          {invoiceable ? (
                            <button
                              type="button"
                              disabled={fulfillingId === item.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleOpenInvoice(item);
                              }}
                              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                            >
                              {fulfillingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Mail className="h-4 w-4" />
                              )}
                              {billed ? "Ouvrir la facture" : "Facturer et envoyer"}
                            </button>
                          ) : item.offer === "seya" && !cutIds.includes(item.id) ? (
                            <button
                              type="button"
                              disabled={cuttingId === item.id}
                              onClick={() => void handleCutSeya(item)}
                              className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                            >
                              {cuttingId === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <PowerOff className="h-4 w-4" />
                              )}
                              Couper Seya
                            </button>
                          ) : null}
                          {!item.readAt ? (
                            <button
                              type="button"
                              disabled={markingId === item.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleMarkRead(item);
                              }}
                              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
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
