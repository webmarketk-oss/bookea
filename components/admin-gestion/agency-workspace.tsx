"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AGENCY_COMPANIES,
  billingAlerts,
  buildAgencyInvoiceHtml,
  companyLabel,
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
  nextBillingCycleOn,
  nextInvoiceNumber,
  periodRange,
  type AgencyBillingState,
  type AgencyClient,
  type AgencyCompany,
  type AgencyInvoice,
  type AgencyInvoiceLine,
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

  async function persist(next: AgencyBillingState) {
    setSaving(true);
    const saved = await saveAgencyBilling(next);
    setStates((current) =>
      current ? { ...current, [saved.company]: saved } : current,
    );
    setSaving(false);
    setNotice("Enregistré.");
  }

  function update(patch: Partial<AgencyBillingState>) {
    if (!state) return;
    void persist({ ...state, ...patch });
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
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = state.invoices.find((item) => item.id === previewId);

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

  function issueInvoice() {
    if (!draft.clientId || draft.lines.length === 0) {
      return;
    }
    const issuedOn = draft.issuedOn || new Date().toISOString().slice(0, 10);
    const invoice: AgencyInvoice = {
      id: createId(),
      number: nextInvoiceNumber(state),
      clientId: draft.clientId,
      issuedOn,
      nextCycleOn: nextBillingCycleOn(issuedOn),
      status: "Émise",
      lines: draft.lines,
      comments: draft.comments,
      createdAt: new Date().toISOString(),
    };
    onChange({
      invoices: [invoice, ...state.invoices],
      clients: state.clients.map((client) =>
        client.id === draft.clientId
          ? {
              ...client,
              firstInvoiceOn: client.firstInvoiceOn || issuedOn,
              nextInvoiceOn: nextBillingCycleOn(issuedOn),
            }
          : client,
      ),
    });
    setDraft(emptyInvoiceDraft(state));
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
          Nouvelle facture
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
              className="grid gap-2 md:grid-cols-[1fr_5rem_7rem_6rem_7rem]"
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
                type="number"
                min="0"
                value={line.quantity}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((item) =>
                      item.id === line.id
                        ? { ...item, quantity: Number(event.target.value) }
                        : item,
                    ),
                  }))
                }
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
              />
              <input
                type="number"
                min="0"
                value={line.unitPrice}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((item) =>
                      item.id === line.id
                        ? { ...item, unitPrice: Number(event.target.value) }
                        : item,
                    ),
                  }))
                }
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
                type="number"
                min="0"
                disabled={line.discountType === "Aucune"}
                value={line.discountValue}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    lines: current.lines.map((item) =>
                      item.id === line.id
                        ? { ...item, discountValue: Number(event.target.value) }
                        : item,
                    ),
                  }))
                }
                placeholder="0"
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold disabled:bg-slate-100"
              />
            </div>
          ))}
        </div>
        <textarea
          value={draft.comments}
          onChange={(event) =>
            setDraft((current) => ({ ...current, comments: event.target.value }))
          }
          placeholder="Commentaire interne, visible seulement par nous"
          className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
        />
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
            <button
              type="button"
              onClick={issueInvoice}
              className="h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white"
            >
              Émettre la facture
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
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
            ) : (
              state.invoices.map((invoice) => {
                const client = state.clients.find((item) => item.id === invoice.clientId);
                return (
                  <tr key={invoice.id} className="border-b last:border-0">
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
                        className="h-9 rounded-lg border border-slate-200 px-2 text-xs font-bold"
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
                          onClick={() => downloadAgencyInvoice(state, invoice)}
                          className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold"
                        >
                          Télécharger
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
              onClick={() => downloadAgencyInvoice(state, invoice)}
              className="h-10 rounded-xl bg-violet-600 px-3 text-sm font-semibold text-white"
            >
              Télécharger
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
            <p className="text-2xl font-black">{state.identity.name}</p>
            <div className="mt-2 space-y-0.5 text-sm font-medium text-slate-600">
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
              <th className="py-2">Prix HT</th>
              <th className="py-2">Remise</th>
              <th className="py-2 text-right">Total HT</th>
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
          <p className="text-sm font-semibold text-slate-500">TVA : 0,00 €</p>
          <p className="text-2xl font-black">{formatEuroAmount(total)} HT</p>
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

      <div className="grid gap-3 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400">
            Chiffre d’affaires
          </p>
          <p className="mt-2 text-3xl font-black">{formatEuroAmount(revenue)}</p>
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

function downloadAgencyInvoice(
  state: AgencyBillingState,
  invoice: AgencyInvoice,
) {
  const blob = new Blob([buildAgencyInvoiceHtml(state, invoice)], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${invoice.number}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
    lines: [line],
  };
}
