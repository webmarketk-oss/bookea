"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AGENCY_COMPANIES,
  agencyInvoiceLogoSrc,
  bankTransferLines,
  billingAlerts,
  buildAgencyInvoiceHtml,
  companyLabel,
  DEFAULT_AGENCY_BANK,
  createId,
  formatEuroAmount,
  formatShortDate,
  formatLineDiscount,
  invoiceTotal,
  invoicesInRange,
  lineNet,
  issuerAddressLines,
  kpiBreakdown,
  REVERSE_CHARGE_MENTION,
  monthlyRevenue,
  pendingPaymentKpi,
  nextBillingCycleOn,
  nextInvoiceNumber,
  duplicateAgencyInvoice,
  cloneInvoiceLines,
  periodRange,
  type AgencyBillingState,
  type AgencyClient,
  type AgencyCompany,
  type AgencyInvoice,
  type AgencyInvoiceLine,
  type AgencyInvoiceStatus,
  type AgencyPeriod,
  type AgencyServiceKind,
} from "@/lib/admin-agency-billing";
import {
  loadAgencyBilling,
  loadBookeaCentersForBilling,
  saveAgencyBilling,
} from "@/lib/admin-agency-store";

const MONTHS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

type Section = "facturation" | "clients" | "prestations" | "kpi";

export function AgencyWorkspace() {
  const [company, setCompany] = useState<AgencyCompany>("webk");
  const [section, setSection] = useState<Section>("facturation");
  const [states, setStates] = useState<Record<AgencyCompany, AgencyBillingState> | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [period, setPeriod] = useState<AgencyPeriod>("mois");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [webk, bookea] = await Promise.all([
        loadAgencyBilling("webk"),
        loadAgencyBilling("bookea"),
      ]);
      if (alive) {
        setStates({ webk, bookea });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const state = states?.[company];
  const alerts = useMemo(
    () => (state ? billingAlerts(state) : []),
    [state],
  );

  async function persist(...updates: AgencyBillingState[]) {
    setSaving(true);
    const savedList = await Promise.all(updates.map((item) => saveAgencyBilling(item)));
    setStates((current) => {
      if (!current) return current;
      const next = { ...current };
      for (const saved of savedList) {
        next[saved.company] = saved;
      }
      return next;
    });
    setSaving(false);
    setNotice("Enregistré.");
  }

  function update(patch: Partial<AgencyBillingState>) {
    if (!state || !states) return;
    const next = { ...state, ...patch };
    if (patch.bank) {
      const otherId = company === "webk" ? "bookea" : "webk";
      void persist(next, { ...states[otherId], bank: patch.bank });
      return;
    }
    void persist(next);
  }

  if (!state) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500">
        Chargement du portefeuille...
      </div>
    );
  }

  const range = periodRange(period, new Date(), customFrom, customTo);
  const periodInvoices = invoicesInRange(state.invoices, range.from, range.to);
  const revenue = periodInvoices.reduce((sum, item) => sum + invoiceTotal(item), 0);
  const pending = pendingPaymentKpi(state.invoices);
  const breakdown = kpiBreakdown(periodInvoices);
  const yearBars = monthlyRevenue(
    invoicesInRange(state.invoices, `${new Date().getFullYear()}-01-01`, `${new Date().getFullYear()}-12-31`),
    new Date().getFullYear(),
  );
  const maxBar = Math.max(...yearBars, 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {AGENCY_COMPANIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCompany(item.id)}
            className={`h-11 rounded-xl px-4 text-sm font-semibold ${
              company === item.id
                ? "bg-slate-950 text-white"
                : "border border-slate-200 bg-white text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          {(
            [
              ["facturation", "Facturation"],
              ["clients", "Portefeuille"],
              ["prestations", "Prestations"],
              ["kpi", "KPI"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`h-11 rounded-xl px-4 text-sm font-semibold ${
                section === id
                  ? "bg-violet-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {alerts.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-black uppercase text-amber-800">
            Cycles à traiter · {companyLabel(company)}
          </p>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-amber-900">
            {alerts.map((alert) => (
              <li key={alert.clientId}>{alert.label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {notice ? (
        <p className="text-sm font-semibold text-emerald-700">{notice}</p>
      ) : null}
      {saving ? (
        <p className="text-sm font-semibold text-slate-400">Enregistrement...</p>
      ) : null}

      {section === "facturation" ? (
        <BillingSection state={state} onChange={update} />
      ) : null}
      {section === "clients" ? (
        <ClientsSection state={state} onChange={update} />
      ) : null}
      {section === "prestations" ? (
        <ServicesSection state={state} onChange={update} />
      ) : null}
      {section === "kpi" ? (
        <KpiSection
          company={company}
          revenue={revenue}
          pending={pending}
          breakdown={breakdown}
          yearBars={yearBars}
          maxBar={maxBar}
          period={period}
          onPeriod={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFrom={setCustomFrom}
          onCustomTo={setCustomTo}
        />
      ) : null}
    </div>
  );
}

function BillingSection({
  state,
  onChange,
}: {
  state: AgencyBillingState;
  onChange: (patch: Partial<AgencyBillingState>) => void;
}) {
  const [draft, setDraft] = useState(() => emptyInvoiceDraft(state));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AgencyInvoiceStatus | "tous">(
    "tous",
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const preview = state.invoices.find((item) => item.id === previewId);
  const filteredInvoices = useMemo(
    () =>
      state.invoices.filter((invoice) => {
        if (statusFilter !== "tous" && invoice.status !== statusFilter) {
          return false;
        }
        if (dateFrom && invoice.issuedOn < dateFrom) {
          return false;
        }
        if (dateTo && invoice.issuedOn > dateTo) {
          return false;
        }
        return true;
      }),
    [dateFrom, dateTo, state.invoices, statusFilter],
  );
  const hasInvoiceFilters =
    statusFilter !== "tous" || Boolean(dateFrom) || Boolean(dateTo);

  function addLine() {
    const service = state.services[0];
    setDraft((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          id: createId(),
          label: service?.label || "Prestation",
          kind: service?.kind || "autre",
          quantity: 1,
          unitPrice: service?.unitPrice || 0,
          discountType: "Aucune",
          discountValue: 0,
        },
      ],
    }));
  }

  function startEdit(invoice: AgencyInvoice) {
    setEditingId(invoice.id);
    setDraft({
      clientId: invoice.clientId,
      issuedOn: invoice.issuedOn,
      comments: invoice.comments,
      invoiceNote: invoice.invoiceNote,
      lines: cloneInvoiceLines(invoice.lines),
    });
    requestAnimationFrame(() => {
      document
        .getElementById("agency-invoice-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyInvoiceDraft(state));
  }

  function saveInvoice() {
    if (!draft.clientId || draft.lines.length === 0) {
      return;
    }
    const issuedOn = draft.issuedOn || new Date().toISOString().slice(0, 10);
    const nextCycleOn = nextBillingCycleOn(issuedOn);
    if (editingId) {
      onChange({
        invoices: state.invoices.map((item) =>
          item.id === editingId
            ? {
                ...item,
                clientId: draft.clientId,
                issuedOn,
                nextCycleOn,
                lines: draft.lines,
                comments: draft.comments,
                invoiceNote: draft.invoiceNote,
              }
            : item,
        ),
        clients: state.clients.map((client) =>
          client.id === draft.clientId
            ? { ...client, nextInvoiceOn: nextCycleOn }
            : client,
        ),
      });
      cancelEdit();
      return;
    }
    const invoice: AgencyInvoice = {
      id: createId(),
      number: nextInvoiceNumber(state),
      clientId: draft.clientId,
      issuedOn,
      nextCycleOn,
      status: "Émise",
      lines: draft.lines,
      comments: draft.comments,
      invoiceNote: draft.invoiceNote,
      createdAt: new Date().toISOString(),
    };
    onChange({
      invoices: [invoice, ...state.invoices],
      clients: state.clients.map((client) =>
        client.id === draft.clientId
          ? {
              ...client,
              firstInvoiceOn: client.firstInvoiceOn || issuedOn,
              nextInvoiceOn: nextCycleOn,
            }
          : client,
      ),
    });
    setDraft(emptyInvoiceDraft(state));
  }

  function duplicateInvoice(invoice: AgencyInvoice) {
    const copy = duplicateAgencyInvoice(state, invoice);
    onChange({
      invoices: [copy, ...state.invoices],
      clients: state.clients.map((client) =>
        client.id === copy.clientId
          ? {
              ...client,
              nextInvoiceOn: copy.nextCycleOn,
            }
          : client,
      ),
    });
  }

  function deleteInvoice(invoice: AgencyInvoice) {
    if (
      !window.confirm(
        `Supprimer la facture ${invoice.number} ? Cette action est définitive.`,
      )
    ) {
      return;
    }
    onChange({
      invoices: state.invoices.filter((item) => item.id !== invoice.id),
    });
    if (editingId === invoice.id) {
      cancelEdit();
    }
    if (previewId === invoice.id) {
      setPreviewId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase text-slate-400">
          Émetteur des factures {companyLabel(state.company)}
        </p>
        <p className="mt-2 text-lg font-semibold">{state.identity.name}</p>
        <div className="mt-1 space-y-0.5 text-sm font-medium text-slate-600">
          {issuerAddressLines(state.identity).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          {REVERSE_CHARGE_MENTION}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-black uppercase text-slate-500">
          Coordonnées bancaires
        </p>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Elles apparaissent sur chaque facture. Tu peux les modifier ici.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {(
            [
              ["accountName", "Nom du compte"],
              ["iban", "IBAN"],
              ["bic", "Swift / BIC"],
              ["bankName", "Banque"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm font-semibold text-slate-600">
              {label}
              <input
                value={state.bank[key]}
                onChange={(event) =>
                  onChange({
                    bank: { ...state.bank, [key]: event.target.value },
                  })
                }
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-violet-400"
              />
            </label>
          ))}
          <label className="text-sm font-semibold text-slate-600 md:col-span-2">
            Adresse de la banque
            <input
              value={state.bank.bankAddress}
              onChange={(event) =>
                onChange({
                  bank: { ...state.bank, bankAddress: event.target.value },
                })
              }
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-violet-400"
            />
          </label>
        </div>
      </section>

      <section
        id="agency-invoice-form"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <p className="text-sm font-black uppercase text-slate-500">
          {editingId}
            ? `Modifier ${state.invoices.find((item) => item.id === editingId)?.number || "la facture"}`
            : "Nouvelle facture"}
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <select
            value={draft.clientId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, clientId: event.target.value }))
            }
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
          >
            <option value="">Choisir un client</option>
            {state.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {client.active ? "" : " · inactif"}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={draft.issuedOn}
            onChange={(event) =>
              setDraft((current) => ({ ...current, issuedOn: event.target.value }))
            }
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
          />
        </div>
        <div className="mt-3 space-y-2">
          {draft.lines.map((line) => (
            <div
              key={line.id}
              className="grid gap-2 md:grid-cols-[1fr_5rem_7rem_6rem_7rem_2.5rem]"
            >
              <select
                value={line.label}
                onChange={(event) => {
                  const service = state.services.find(
                    (item) => item.label === event.target.value,
                  );
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((item) =>
                      item.id === line.id
                        ? {
                            ...item,
                            label: event.target.value,
                            kind: service?.kind || item.kind,
                            unitPrice: service?.unitPrice ?? item.unitPrice,
                          }
                        : item,
                    ),
                  }));
                }}
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
              >
                {state.services.map((service) => (
                  <option key={service.id} value={service.label}>
                    {service.label}
                  </option>
                ))}
              </select>
              <input
                inputMode="decimal"
                value={emptyableNumber(line.quantity)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((item) =>
                      item.id === line.id
                        ? { ...item, quantity: parseEmptyableNumber(event.target.value) }
                        : item,
                    ),
                  }))
                }
                placeholder="1"
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
              />
              <input
                inputMode="decimal"
                value={emptyableNumber(line.unitPrice)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((item) =>
                      item.id === line.id
                        ? { ...item, unitPrice: parseEmptyableNumber(event.target.value) }
                        : item,
                    ),
                  }))
                }
                placeholder="0"
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
              />
              <select
                value={line.discountType}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((item) =>
                      item.id === line.id
                        ? {
                            ...item,
                            discountType: event.target.value as AgencyInvoiceLine["discountType"],
                          }
                        : item,
                    ),
                  }))
                }
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
              >
                <option value="Aucune">Remise</option>
                <option value="€">€</option>
                <option value="%">%</option>
              </select>
              <input
                inputMode="decimal"
                disabled={line.discountType === "Aucune"}
                value={
                  line.discountType === "Aucune"
                    ? ""
                    : emptyableNumber(line.discountValue)
                }
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((item) =>
                      item.id === line.id
                        ? {
                            ...item,
                            discountValue: parseEmptyableNumber(event.target.value),
                          }
                        : item,
                    ),
                  }))
                }
                placeholder=""
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold disabled:bg-slate-100"
              />
              <button
                type="button"
                disabled={draft.lines.length <= 1}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.filter((item) => item.id !== line.id),
                  }))
                }
                className="h-10 rounded-xl border border-slate-200 text-sm font-bold text-slate-400 hover:border-rose-200 hover:text-rose-600 disabled:opacity-30"
                aria-label="Retirer la prestation"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <label className="mt-3 block text-sm font-semibold text-slate-600">
          Commentaire visible sur la facture
          <textarea
            value={draft.invoiceNote}
            onChange={(event) =>
              setDraft((current) => ({ ...current, invoiceNote: event.target.value }))
            }
            placeholder="Ex. Merci de régler par virement sous 8 jours."
            className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold text-slate-600">
          Commentaire interne
          <textarea
            value={draft.comments}
            onChange={(event) =>
              setDraft((current) => ({ ...current, comments: event.target.value }))
            }
            placeholder="Visible seulement par nous, jamais imprimé"
            className="mt-1 min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={addLine}
            className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold"
          >
            Ajouter une prestation
          </button>
          <div className="flex items-center gap-3">
            <p className="text-sm font-black">
              {formatEuroAmount(invoiceTotal({ lines: draft.lines }))}
            </p>
            {editingId ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold"
              >
                Annuler
              </button>
            ) : null}
            <button
              type="button"
              onClick={saveInvoice}
              className="h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white"
            >
              {editingId ? "Enregistrer" : "Émettre la facture"}
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-4">
          <label>
            <span className="mb-1.5 block text-xs font-black uppercase text-slate-500">
              Statut
            </span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as AgencyInvoiceStatus | "tous")
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400"
            >
              <option value="tous">Tous les statuts</option>
              {["Brouillon", "Émise", "Payée", "En retard", "Annulée"].map(
                (status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ),
              )}
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
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400"
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
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400"
            />
          </label>
          {hasInvoiceFilters ? (
            <button
              type="button"
              onClick={() => {
                setStatusFilter("tous");
                setDateFrom("");
                setDateTo("");
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Réinitialiser
            </button>
          ) : null}
        </div>
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">N°</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Prochain cycle</th>
              <th className="px-4 py-3">Montant</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Commentaire</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {state.invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center font-semibold text-slate-400">
                  Aucune facture pour {companyLabel(state.company)}.
                </td>
              </tr>
            ) : filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center font-semibold text-slate-400">
                  Aucune facture ne correspond à ces filtres.
                </td>
              </tr>
            ) : (
              filteredInvoices.map((invoice) => {
                const client = state.clients.find((item) => item.id === invoice.clientId);
                return (
                  <tr
                    key={invoice.id}
                    className={`border-b last:border-0 ${invoiceRowTone(invoice.status)}`}
                  >
                    <td className="px-4 py-3 font-semibold">{invoice.number}</td>
                    <td className="px-4 py-3">{client?.name || "—"}</td>
                    <td className="px-4 py-3">{formatShortDate(invoice.issuedOn)}</td>
                    <td className="px-4 py-3">{formatShortDate(invoice.nextCycleOn)}</td>
                    <td className="px-4 py-3 font-black">
                      {formatEuroAmount(invoiceTotal(invoice))}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={invoice.status}
                        onChange={(event) =>
                          onChange({
                            invoices: state.invoices.map((item) =>
                              item.id === invoice.id
                                ? {
                                    ...item,
                                    status: event.target.value as AgencyInvoice["status"],
                                  }
                                : item,
                            ),
                          })
                        }
                        className="h-9 rounded-lg border border-black/10 bg-white/70 px-2 text-xs font-bold"
                      >
                        {["Brouillon", "Émise", "Payée", "En retard", "Annulée"].map(
                          (status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ),
                        )}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{invoice.comments || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewId(invoice.id)}
                          className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold"
                        >
                          Voir
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadAgencyInvoice(state, invoice)}
                          className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold"
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(invoice)}
                          className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateInvoice(invoice)}
                          className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold"
                        >
                          Dupliquer
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteInvoice(invoice)}
                          className="h-9 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {preview ? (
        <InvoiceDocument
          state={state}
          invoice={preview}
          onClose={() => setPreviewId(null)}
        />
      ) : null}
    </div>
  );
}

function InvoiceDocument({
  state,
  invoice,
  onClose,
}: {
  state: AgencyBillingState;
  invoice: AgencyInvoice;
  onClose: () => void;
}) {
  const client = state.clients.find((item) => item.id === invoice.clientId);
  const total = invoiceTotal(invoice);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 print:static print:bg-white print:p-0">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-8 shadow-xl print:max-h-none print:rounded-none print:shadow-none">
        <div className="flex items-start justify-between gap-4 print:hidden">
          <p className="text-sm font-black uppercase text-slate-400">Facture</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void downloadAgencyInvoice(state, invoice)}
              className="h-10 rounded-xl bg-violet-600 px-3 text-sm font-semibold text-white"
            >
              Télécharger le PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="h-10 rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white"
            >
              Imprimer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
            >
              Fermer
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-between gap-6">
          <div>
            <img
              src={agencyInvoiceLogoSrc(state.company)}
              alt={state.identity.name}
              className="mb-3 h-14 w-auto max-w-[220px] object-contain"
            />
            <div className="space-y-0.5 text-sm font-medium text-slate-600">
              {issuerAddressLines(state.identity).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-black uppercase text-slate-400">Facture</p>
            <p className="text-xl font-black">{invoice.number}</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              Date : {formatShortDate(invoice.issuedOn)}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-black uppercase text-slate-400">Client</p>
          <p className="mt-1 text-base font-semibold">{client?.name || "—"}</p>
          <p className="text-sm font-medium text-slate-600">
            {[client?.city, client?.email].filter(Boolean).join(" · ")}
          </p>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead className="border-b text-left text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="py-2">Prestation</th>
              <th className="py-2">Qté</th>
              <th className="py-2">Prix</th>
              <th className="py-2">Remise</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-b last:border-0">
                <td className="py-2 font-semibold">{line.label}</td>
                <td className="py-2">{line.quantity}</td>
                <td className="py-2">{formatEuroAmount(line.unitPrice)}</td>
                <td className="py-2">{formatLineDiscount(line)}</td>
                <td className="py-2 text-right font-black">
                  {formatEuroAmount(lineNet(line))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 text-right">
          <p className="text-2xl font-black">{formatEuroAmount(total)}</p>
        </div>

        {invoice.invoiceNote ? (
          <div className="mt-6 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-black uppercase text-slate-400">
              Commentaire
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">
              {invoice.invoiceNote}
            </p>
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-black uppercase text-slate-400">
            Coordonnées pour le virement
          </p>
          <div className="mt-2 space-y-0.5 text-sm font-medium text-slate-700">
            {bankTransferLines(state.bank || DEFAULT_AGENCY_BANK).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>

        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          {REVERSE_CHARGE_MENTION}
        </p>
      </div>
    </div>
  );
}

function ClientsSection({
  state,
  onChange,
}: {
  state: AgencyBillingState;
  onChange: (patch: Partial<AgencyBillingState>) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");

  async function importCenters() {
    const centers = await loadBookeaCentersForBilling();
    const existing = new Set(state.clients.map((item) => item.centerId).filter(Boolean));
    const imported: AgencyClient[] = centers
      .filter((center) => !existing.has(center.id))
      .map((center) => ({
        id: createId(),
        centerId: center.id,
        name: center.name,
        email: center.email,
        phone: "",
        city: center.city,
        active: true,
        phoningOffer: false,
        comments: "",
        firstInvoiceOn: "",
        nextInvoiceOn: "",
        createdAt: new Date().toISOString(),
      }));
    if (imported.length > 0) {
      onChange({ clients: [...imported, ...state.clients] });
    }
  }

  function addClient() {
    if (!name.trim()) return;
    onChange({
      clients: [
        {
          id: createId(),
          centerId: "",
          name: name.trim(),
          email: email.trim(),
          phone: "",
          city: city.trim(),
          active: true,
          phoningOffer: false,
          comments: "",
          firstInvoiceOn: "",
          nextInvoiceOn: "",
          createdAt: new Date().toISOString(),
        },
        ...state.clients,
      ],
    });
    setName("");
    setEmail("");
    setCity("");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nom du client / centre"
            className="h-11 min-w-[14rem] flex-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="h-11 min-w-[12rem] rounded-xl border border-slate-200 px-3 text-sm font-semibold"
          />
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Ville"
            className="h-11 w-40 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
          />
          <button
            type="button"
            onClick={addClient}
            className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"
          >
            Ajouter
          </button>
          <button
            type="button"
            onClick={() => void importCenters()}
            className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold"
          >
            Importer les centres Bookea
          </button>
        </div>
      </section>

      <div className="space-y-3">
        {state.clients.map((client) => (
          <article
            key={client.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold">{client.name}</p>
                <p className="text-sm font-medium text-slate-500">
                  {[client.city, client.email].filter(Boolean).join(" · ") ||
                    "Fiche à compléter"}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {client.nextInvoiceOn
                    ? `Prochain cycle ${formatShortDate(client.nextInvoiceOn)}`
                    : "Pas encore de cycle"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      clients: state.clients.map((item) =>
                        item.id === client.id
                          ? { ...item, active: !item.active }
                          : item,
                      ),
                    })
                  }
                  className={`h-10 rounded-xl px-3 text-sm font-semibold ${
                    client.active
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {client.active ? "Actif" : "Inactif"}
                </button>
                {state.company === "webk" ? (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        clients: state.clients.map((item) =>
                          item.id === client.id
                            ? { ...item, phoningOffer: !item.phoningOffer }
                            : item,
                        ),
                      })
                    }
                    className={`h-10 rounded-xl px-3 text-sm font-semibold ${
                      client.phoningOffer
                        ? "bg-violet-50 text-violet-800"
                        : "border border-slate-200 text-slate-600"
                    }`}
                  >
                    {client.phoningOffer
                      ? "Avec offre phoning"
                      : "Sans offre phoning"}
                  </button>
                ) : null}
              </div>
            </div>
            <textarea
              value={client.comments}
              onChange={(event) =>
                onChange({
                  clients: state.clients.map((item) =>
                    item.id === client.id
                      ? { ...item, comments: event.target.value }
                      : item,
                  ),
                })
              }
              placeholder="Commentaire interne"
              className="mt-3 min-h-16 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
            />
          </article>
        ))}
      </div>
    </div>
  );
}

function ServicesSection({
  state,
  onChange,
}: {
  state: AgencyBillingState;
  onChange: (patch: Partial<AgencyBillingState>) => void;
}) {
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap gap-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Nouvelle prestation"
          className="h-11 min-w-[14rem] flex-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
        />
        <input
          type="number"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          placeholder="Prix €"
          className="h-11 w-32 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
        />
        <button
          type="button"
          onClick={() => {
            if (!label.trim()) return;
            onChange({
              services: [
                ...state.services,
                {
                  id: createId(),
                  label: label.trim(),
                  unitPrice: Number(price) || 0,
                  kind: "autre",
                },
              ],
            });
            setLabel("");
            setPrice("");
          }}
          className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"
        >
          Ajouter
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {state.services.map((service) => (
          <div
            key={service.id}
            className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2"
          >
            <p className="text-sm font-semibold">{service.label}</p>
            <p className="text-sm font-black">{formatEuroAmount(service.unitPrice)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function KpiSection({
  company,
  revenue,
  pending,
  breakdown,
  yearBars,
  maxBar,
  period,
  onPeriod,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
}: {
  company: AgencyCompany;
  revenue: number;
  pending: { count: number; amount: number };
  breakdown: Record<AgencyServiceKind, number>;
  yearBars: number[];
  maxBar: number;
  period: AgencyPeriod;
  onPeriod: (value: AgencyPeriod) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
}) {
  const rows =
    company === "webk"
      ? [
          ["Budget Meta", breakdown.meta],
          ["Phoning", breakdown.phoning],
          ["Réseaux", breakdown.reseaux],
          ["RDV WhatsApp", breakdown.rdv_wa],
          ["Frais de gestion", breakdown.gestion],
          ["Annexes", breakdown.autre],
        ]
      : [
          ["Formule WhatsApp", breakdown.whatsapp],
          ["Formule CRM + SMS", breakdown.crm_sms],
          ["Formule SMS", breakdown.sms],
          ["Annexes", breakdown.autre],
        ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["semaine", "mois", "trimestre", "annee", "custom"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPeriod(item)}
            className={`h-10 rounded-xl px-3 text-sm font-semibold ${
              period === item
                ? "bg-slate-950 text-white"
                : "border border-slate-200 bg-white"
            }`}
          >
            {item === "custom" ? "Calendrier" : item}
          </button>
        ))}
        {period === "custom" ? (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(event) => onCustomFrom(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
            />
            <input
              type="date"
              value={customTo}
              onChange={(event) => onCustomTo(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400">
            Chiffre d’affaires
          </p>
          <p className="mt-2 text-3xl font-black">{formatEuroAmount(revenue)}</p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-black uppercase text-amber-800">
            Factures en attente de règlement
          </p>
          <p className="mt-2 text-3xl font-black text-amber-950">
            {formatEuroAmount(pending.amount)}
          </p>
          <p className="mt-1 text-sm font-semibold text-amber-800">
            {pending.count} facture{pending.count > 1 ? "s" : ""}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400">
            Tendance annuelle
          </p>
          <div className="mt-4 flex h-28 items-end gap-1">
            {yearBars.map((value, index) => (
              <div key={MONTHS[index]} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-violet-500"
                  style={{ height: `${Math.max(6, (value / maxBar) * 100)}%` }}
                  title={`${MONTHS[index]} ${formatEuroAmount(value)}`}
                />
                <span className="text-[10px] font-bold text-slate-400">
                  {MONTHS[index]}
                </span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <article
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-black uppercase text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-black">
              {formatEuroAmount(Number(value))}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

async function downloadAgencyInvoice(
  state: AgencyBillingState,
  invoice: AgencyInvoice,
) {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasModule.default;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "794px";
  iframe.style.height = "1123px";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentDocument;
  if (!frameDoc) {
    iframe.remove();
    throw new Error("Impossible de préparer le PDF.");
  }

  frameDoc.open();
  frameDoc.write(buildAgencyInvoiceHtml(state, invoice));
  frameDoc.close();

  await waitForInvoiceImages(frameDoc);
  const canvas = await html2canvas(frameDoc.body, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: 794,
  });
  iframe.remove();

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pageWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;
  const image = canvas.toDataURL("image/png");
  let remaining = imageHeight;
  let offset = 0;

  pdf.addImage(image, "PNG", 0, offset, imageWidth, imageHeight);
  remaining -= pageHeight;
  while (remaining > 0) {
    offset -= pageHeight;
    pdf.addPage();
    pdf.addImage(image, "PNG", 0, offset, imageWidth, imageHeight);
    remaining -= pageHeight;
  }
  pdf.save(`${invoice.number}.pdf`);
}

function waitForInvoiceImages(doc: Document) {
  const images = Array.from(doc.images);
  if (images.length === 0) {
    return Promise.resolve();
  }
  return Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.onload = () => resolve();
          image.onerror = () => resolve();
        }),
    ),
  ).then(() => undefined);
}

function emptyInvoiceDraft(state: AgencyBillingState) {
  const service = state.services[0];
  const line: AgencyInvoiceLine = {
    id: createId(),
    label: service?.label || "Prestation",
    kind: service?.kind || "autre",
    quantity: 1,
    unitPrice: service?.unitPrice || 0,
    discountType: "Aucune",
    discountValue: 0,
  };
  return {
    clientId: state.clients[0]?.id || "",
    issuedOn: new Date().toISOString().slice(0, 10),
    comments: "",
    invoiceNote: "",
    lines: [line],
  };
}

function invoiceRowTone(status: AgencyInvoice["status"]) {
  if (status === "Payée") {
    return "bg-emerald-50 text-emerald-950";
  }
  if (status === "En retard") {
    return "bg-rose-50 text-rose-950";
  }
  if (status === "Émise") {
    return "bg-orange-50 text-orange-950";
  }
  if (status === "Brouillon") {
    return "bg-blue-50 text-blue-950";
  }
  if (status === "Annulée") {
    return "bg-yellow-50 text-yellow-950";
  }
  return "";
}

function emptyableNumber(value: number) {
  return value ? String(value) : "";
}

function parseEmptyableNumber(raw: string) {
  const normalized = raw.replace(",", ".").replace(/[^\d.]/g, "");
  if (!normalized) {
    return 0;
  }
  const next = Number(normalized);
  return Number.isFinite(next) && next >= 0 ? next : 0;
}
