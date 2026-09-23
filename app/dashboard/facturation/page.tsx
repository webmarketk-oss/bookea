"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeEuro,
  CheckCircle2,
  ChevronDown,
  X,
  CreditCard,
  Download,
  Eye,
  FileCheck2,
  FilePlus2,
  Mail,
  Package,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  defaultCenterProducts,
  defaultCenterServices,
  loadPublicCenterProfile,
  mergeCenterSettings,
  mergeProductCategories,
  mergeServiceCategories,
  readCenterSettings,
  savePublicCenterProfile,
  sortServicesByCategory,
  type CenterProductSetting,
  type CenterServiceSetting,
} from "@/lib/center-settings";
import {
  createBillingInvoice,
  deleteBillingInvoice,
  loadBillingInvoices,
  registerBillingPayment,
  updateBillingInvoice,
  type BillingInvoice,
} from "@/lib/billing-supabase";
import { loadCrmClients } from "@/lib/crm-supabase";

type InvoiceType = "Devis" | "Acompte" | "Facture finale" | "Avoir";
type InvoiceStatus = "Payée" | "En attente de paiement" | "Envoyée" | "Annulée";
type DiscountType = "Aucune" | "€" | "%";

type InvoiceLine = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  discountType?: DiscountType;
  discountValue?: number;
};

type BillingService = {
  id: string;
  name: string;
  category: string;
  color: string;
  duration: string;
  price: number;
  vatRate: number;
  deposit: number;
};

const billingServiceColorPresets = [
  "#2563eb",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
];

const billingServiceColorFallback = (index: number) =>
  billingServiceColorPresets[index % billingServiceColorPresets.length];

type BillingProduct = {
  id: string;
  name: string;
  category: string;
  reference: string;
  stock: number;
  price: number;
  vatRate: number;
};

type Invoice = {
  id: string;
  number: string;
  date: string;
  client: string;
  email: string;
  care: string;
  type: InvoiceType;
  status: InvoiceStatus;
  total: number;
  paid: number;
  lines?: InvoiceLine[];
  discountType?: DiscountType;
  discountValue?: number;
  paymentMethod: "Stripe" | "CB centre" | "Espèces" | "Virement";
};

const initialBillingServices: BillingService[] = [
  {
    id: "service-laser",
    name: "Épilation Laser",
    category: "Laser",
    color: "#2563eb",
    duration: "60 min",
    price: 120,
    vatRate: 20,
    deposit: 30,
  },
  {
    id: "service-hydrafacial",
    name: "Hydrafacial",
    category: "Soin visage",
    color: "#06b6d4",
    duration: "45 min",
    price: 95,
    vatRate: 20,
    deposit: 25,
  },
  {
    id: "service-cryo",
    name: "Cryolipolyse",
    category: "Silhouette",
    color: "#8b5cf6",
    duration: "75 min",
    price: 180,
    vatRate: 20,
    deposit: 50,
  },
];

const initialBillingProducts: BillingProduct[] = [
  {
    id: "product-serum",
    name: "Sérum hydratant",
    category: "Visage",
    reference: "HYD-001",
    stock: 18,
    price: 39,
    vatRate: 20,
  },
  {
    id: "product-creme",
    name: "Crème post laser",
    category: "Laser",
    reference: "LAS-002",
    stock: 12,
    price: 29,
    vatRate: 20,
  },
];

const initialBillingCategories = [
  "Laser",
  "Soin visage",
  "Silhouette",
  "Consultation",
  "Produits visage",
  "Produits corps",
];

const statusStyles: Record<InvoiceStatus, string> = {
  Payée: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "En attente de paiement": "border-orange-200 bg-orange-50 text-orange-700",
  Envoyée: "border-blue-200 bg-blue-50 text-blue-700",
  Annulée: "border-slate-200 bg-slate-100 text-slate-600",
};

const typeStyles: Record<InvoiceType, string> = {
  Devis: "border-amber-200 bg-amber-50 text-amber-700",
  Acompte: "border-violet-200 bg-violet-50 text-violet-700",
  "Facture finale": "border-blue-200 bg-blue-50 text-blue-700",
  Avoir: "border-rose-200 bg-rose-50 text-rose-700",
};

const emptyInvoice: Invoice = {
  id: "",
  number: "",
  date: "",
  client: "",
  email: "",
  care: "",
  type: "Devis",
  status: "Envoyée",
  total: 0,
  paid: 0,
  lines: [],
  discountType: "Aucune",
  discountValue: 0,
  paymentMethod: "CB centre",
};

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingClients, setBillingClients] = useState<string[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(true);
  const [billingError, setBillingError] = useState("");
  const [billingNotice, setBillingNotice] = useState("");
  const [pendingFinalInvoice, setPendingFinalInvoice] = useState<Invoice | null>(
    null,
  );
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [isInvoiceDetailOpen, setIsInvoiceDetailOpen] = useState(true);
  const creationRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"factures" | "reglages">(
    "factures",
  );
  const [billingCategories, setBillingCategories] = useState(
    initialBillingCategories,
  );
  const [billingServices, setBillingServices] = useState(initialBillingServices);
  const [billingProducts, setBillingProducts] = useState(initialBillingProducts);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"Toutes" | InvoiceType>("Toutes");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [draft, setDraft] = useState({
    client: "",
    email: "",
    care: "",
    type: "Acompte" as InvoiceType,
    lines: [
      {
        id: "draft-line-1",
        label: "Épilation Laser",
        quantity: 1,
        unitPrice: 30,
        vatRate: 20,
        discountType: "Aucune",
        discountValue: 0,
      },
    ] as InvoiceLine[],
    discountType: "Aucune" as DiscountType,
    discountValue: 0,
    paid: 30,
    paymentMethod: "CB centre" as Invoice["paymentMethod"],
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const persistCatalogTimer = useRef(0);

  async function refreshInvoices() {
    setBillingError("");

    try {
      const [loadedInvoices, clientData] = await Promise.all([
        loadBillingInvoices(),
        loadCrmClients(),
      ]);
      const nextInvoices = loadedInvoices as Invoice[];

      setBillingClients(
        clientData.clients
          .map((client) => `${client.firstName} ${client.lastName}`.trim())
          .filter(Boolean),
      );
      setInvoices(nextInvoices);
      setSelectedInvoiceId((currentId) =>
        nextInvoices.some((invoice) => invoice.id === currentId)
          ? currentId
          : nextInvoices[0]?.id ?? "",
      );
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Impossible de charger les factures.",
      );
      setInvoices([]);
      setSelectedInvoiceId("");
    } finally {
      setIsLoadingBilling(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshInvoices();
  }, []);

  useEffect(() => {
    function applyCatalog(settings: ReturnType<typeof readCenterSettings>) {
      const centerServices = settings?.services ?? defaultCenterServices;
      const centerProducts = settings?.products ?? defaultCenterProducts;
      const serviceCategories = mergeServiceCategories(
        settings?.serviceCategories,
        centerServices,
      );
      const productCategories = mergeProductCategories(
        settings?.productCategories,
        centerProducts,
      );

      setBillingServices(
        sortServicesByCategory(centerServices, serviceCategories).map(
          (service, index) => ({
            id: String(service.id),
            name: service.name,
            category: service.category,
            color: service.color ?? billingServiceColorFallback(index),
            duration: `${service.duration} min`,
            price: service.price,
            vatRate: service.vatRate ?? 20,
            deposit: service.depositEnabled ? service.depositAmount : 0,
          }),
        ),
      );
      setBillingProducts(
        sortServicesByCategory(centerProducts, productCategories).map(
          (product) => ({
            id: String(product.id),
            name: product.name,
            category: product.category,
            reference: product.sku,
            stock: product.stock,
            price: product.price,
            vatRate: product.vatRate ?? 20,
          }),
        ),
      );
      setBillingCategories(
        Array.from(new Set([...serviceCategories, ...productCategories])),
      );
    }

    applyCatalog(readCenterSettings());

    void loadPublicCenterProfile().then((loaded) => {
      applyCatalog(loaded.settings ?? readCenterSettings());
      setSettingsLoaded(true);
    });

    const refresh = () => applyCatalog(readCenterSettings());
    window.addEventListener("bookea-center-settings-updated", refresh);
    return () => {
      window.removeEventListener("bookea-center-settings-updated", refresh);
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    const current = readCenterSettings();
    const nextServices = billingServices.map((service, index) =>
      toStoredBillingService(
        service,
        index,
        current?.services?.find(
          (item) =>
            String(item.id) === service.id ||
            item.name.trim().toLowerCase() === service.name.trim().toLowerCase(),
        ),
      ),
    );
    const nextProducts = billingProducts.map((product) =>
      toStoredBillingProduct(
        product,
        current?.products?.find(
          (item) =>
            String(item.id) === product.id ||
            item.name.trim().toLowerCase() === product.name.trim().toLowerCase(),
        ),
      ),
    );
    const nextSettings = {
      services: nextServices,
      products: nextProducts,
      serviceCategories: mergeServiceCategories(
        [...(current?.serviceCategories ?? []), ...billingCategories],
        nextServices,
      ),
      productCategories: mergeProductCategories(
        [...(current?.productCategories ?? []), ...billingCategories],
        nextProducts,
      ),
    };

    mergeCenterSettings(nextSettings, { emit: false });

    window.clearTimeout(persistCatalogTimer.current);
    persistCatalogTimer.current = window.setTimeout(() => {
      const latest = readCenterSettings();
      if (!latest?.center) {
        return;
      }
      void savePublicCenterProfile({
        ...latest,
        ...nextSettings,
      }).catch(() => undefined);
    }, 1200);

    return () => window.clearTimeout(persistCatalogTimer.current);
  }, [billingCategories, billingProducts, billingServices, settingsLoaded]);

  const draftSubtotal = calculateSubtotal(draft.lines);
  const draftDiscount = calculateDiscount(
    draftSubtotal,
    draft.discountType,
    draft.discountValue,
  );
  const draftTotal =
    draft.type === "Avoir"
      ? -Math.abs(Math.max(draftSubtotal - draftDiscount, 0))
      : Math.max(draftSubtotal - draftDiscount, 0);
  const draftVat =
    draft.type === "Avoir"
      ? -calculateVatTotal(draft.lines, draftDiscount)
      : calculateVatTotal(draft.lines, draftDiscount);
  const draftHt = draftTotal - draftVat;

  const filteredInvoices = invoices.filter((invoice) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      invoice.client.toLowerCase().includes(query) ||
      invoice.number.toLowerCase().includes(query) ||
      invoice.care.toLowerCase().includes(query) ||
      invoice.email.toLowerCase().includes(query);
    const matchesType = typeFilter === "Toutes" || invoice.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const invoiceClientOptions = useMemo(() => {
    const names = new Set(billingClients);
    invoices.forEach((invoice) => {
      if (invoice.client.trim()) {
        names.add(invoice.client.trim());
      }
    });
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [billingClients, invoices]);
  const invoiceCareOptions = useMemo(() => {
    const names = new Set(billingServices.map((service) => service.name));
    invoices.forEach((invoice) => {
      if (invoice.care.trim()) {
        names.add(invoice.care.trim());
      }
    });
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [billingServices, invoices]);
  const selectedInvoice =
    invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? emptyInvoice;
  const selectedAmounts = calculateInvoiceAmounts(selectedInvoice);
  const selectedRemaining = Math.max(
    selectedInvoice.total - selectedInvoice.paid,
    0,
  );
  const creationTitle =
    editingQuoteId
      ? "Modifier le devis"
      : draft.type === "Devis"
      ? "Créer un devis"
      : draft.type === "Acompte"
        ? "Créer une facture d'acompte"
        : draft.type === "Avoir"
          ? "Créer un avoir"
          : "Créer une facture finale";
  const creationAction =
    editingQuoteId
      ? "Mettre à jour le devis"
      : draft.type === "Devis"
      ? "Enregistrer le devis"
      : draft.type === "Acompte"
        ? "Générer la facture d'acompte"
        : draft.type === "Avoir"
          ? "Générer l'avoir"
          : "Générer la facture finale";

  const stats = useMemo(() => {
    const paid = invoices
      .filter((invoice) => invoice.status === "Payée")
      .reduce((sum, invoice) => sum + invoice.paid, 0);
    const pending = invoices.reduce(
      (sum, invoice) => sum + Math.max(invoice.total - invoice.paid, 0),
      0,
    );
    const deposits = invoices.filter((invoice) => invoice.type === "Acompte");
    const credits = invoices.filter((invoice) => invoice.type === "Avoir");
    return { paid, pending, deposits: deposits.length, credits: credits.length };
  }, [invoices]);

  async function createInvoice(type: InvoiceType = draft.type) {
    const prefix = type === "Avoir" ? "AVR" : type === "Devis" ? "DEV" : "FAC";
    const nextNumber = `${prefix}-2026-${String(invoices.length + 8).padStart(4, "0")}`;
    const lines = draft.lines
      .filter((line) => line.label.trim())
      .map((line) => ({
        ...line,
        quantity: Math.max(Number(line.quantity) || 0, 0),
        unitPrice: Number(line.unitPrice) || 0,
        vatRate: Math.max(Number(line.vatRate) || 0, 0),
        discountType: line.discountType ?? "Aucune",
        discountValue: Math.max(Number(line.discountValue) || 0, 0),
      }));
    if (lines.length === 0) {
      return;
    }
    const subtotal = calculateSubtotal(lines);
    const discount = calculateDiscount(
      subtotal,
      draft.discountType,
      draft.discountValue,
    );
    const total =
      type === "Avoir"
        ? -Math.abs(Math.max(subtotal - discount, 0))
        : Math.max(subtotal - discount, 0);
    const paid =
      type === "Devis"
        ? 0
        : type === "Avoir"
          ? total
          : Math.min(Math.max(Number(draft.paid) || 0, 0), total);
    const status =
      type === "Devis"
        ? "Envoyée"
        : type === "Avoir" || paid >= total
          ? "Payée"
          : "En attente de paiement";

    if (type === "Devis" && editingQuoteId) {
      const updatedInvoice = invoices.find((invoice) => invoice.id === editingQuoteId);

      if (!updatedInvoice) {
        return;
      }

      const nextInvoice: Invoice = {
        ...updatedInvoice,
        client: draft.client,
        email: draft.email,
        care:
          lines.length === 1
            ? lines[0].label
            : `${lines.length} prestations`,
        total,
        paid,
        lines,
        discountType: draft.discountType,
        discountValue: draft.discountValue,
        paymentMethod: draft.paymentMethod,
        status,
      };

      try {
        await updateBillingInvoice(nextInvoice as BillingInvoice);
      } catch (error) {
        setBillingError(
          error instanceof Error
            ? error.message
            : "Le devis n'a pas pu être mis à jour.",
        );
        return;
      }

      setInvoices((current) =>
        current.map((invoice) =>
          invoice.id === editingQuoteId ? nextInvoice : invoice,
        ),
      );
      setSelectedInvoiceId(editingQuoteId);
      setPreviewInvoiceId(editingQuoteId);
      setEditingQuoteId(null);
      setPaymentAmount(0);
      return;
    }

    const invoice: Invoice = {
      id: `${prefix.toLowerCase()}-${Date.now()}`,
      number: nextNumber,
      date: "28/07/2026",
      client: draft.client,
      email: draft.email,
      care:
        lines.length === 1
          ? lines[0].label
          : `${lines.length} prestations`,
      type,
      status,
      total,
      paid,
      lines,
      discountType: draft.discountType,
      discountValue: draft.discountValue,
      paymentMethod: draft.paymentMethod,
    };

    if (type === "Facture finale") {
      setPendingFinalInvoice(invoice);
      setPreviewInvoiceId(invoice.id);
      setIsInvoiceDetailOpen(true);
      setEditingQuoteId(null);
      setPaymentAmount(0);
      return;
    }

    try {
      const savedInvoice = await createBillingInvoice(invoice as BillingInvoice);

      setInvoices((current) => [savedInvoice as Invoice, ...current]);
      setSelectedInvoiceId(savedInvoice.id);
      setPreviewInvoiceId(savedInvoice.id);
      setBillingNotice("Document enregistré.");
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Le document n'a pas pu être enregistré.",
      );
      return;
    }

    setIsInvoiceDetailOpen(true);
    setEditingQuoteId(null);
    setPaymentAmount(0);
  }

  async function validatePendingFinalInvoice() {
    if (!pendingFinalInvoice) {
      return;
    }

    let savedInvoice: BillingInvoice;

    try {
      savedInvoice = await createBillingInvoice(pendingFinalInvoice as BillingInvoice);
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "La facture finale n'a pas pu être enregistrée.",
      );
      return;
    }

    setInvoices((current) => [savedInvoice as Invoice, ...current]);
    setSelectedInvoiceId(savedInvoice.id);
    setPreviewInvoiceId(savedInvoice.id);
    setIsInvoiceDetailOpen(true);
    setPendingFinalInvoice(null);
    setPaymentAmount(0);
    setBillingNotice("Facture finale enregistrée.");
  }

  function cancelPendingFinalInvoice() {
    setPendingFinalInvoice(null);
    setPreviewInvoiceId(null);
  }

  function saveQuoteFromPreview(invoiceId: string) {
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === invoiceId && invoice.type === "Devis"
          ? { ...invoice, paid: 0, status: "Envoyée" }
          : invoice,
      ),
    );
    setSelectedInvoiceId(invoiceId);
    setPreviewInvoiceId(null);
  }

  async function deleteQuote(invoiceId: string) {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce devis ?")) {
      return;
    }

    const nextInvoice = invoices.find((invoice) => invoice.id !== invoiceId);
    const previousInvoices = invoices;

    setInvoices((current) =>
      current.filter((invoice) => invoice.id !== invoiceId),
    );
    if (nextInvoice) {
      setSelectedInvoiceId(nextInvoice.id);
    }
    setPreviewInvoiceId(null);
    setEditingQuoteId((current) => (current === invoiceId ? null : current));

    try {
      await deleteBillingInvoice(invoiceId);
      setBillingNotice("Devis supprimé.");
    } catch (error) {
      setInvoices(previousInvoices);
      setBillingError(
        error instanceof Error
          ? error.message
          : "Le devis n'a pas pu être supprimé.",
      );
    }
  }

  async function convertQuoteToFinalInvoice(invoice: Invoice) {
    if (invoice.type !== "Devis") {
      return;
    }

    const finalInvoice: Invoice = {
      ...invoice,
      id: `fac-${Date.now()}`,
      number: `FAC-2026-${String(invoices.length + 8).padStart(4, "0")}`,
      type: "Facture finale",
      paid: 0,
      status: "En attente de paiement",
    };

    try {
      const savedInvoice = await createBillingInvoice(finalInvoice as BillingInvoice);

      setInvoices((current) => [savedInvoice as Invoice, ...current]);
      setSelectedInvoiceId(savedInvoice.id);
      setPreviewInvoiceId(savedInvoice.id);
      setBillingNotice("Devis transformé en facture finale.");
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Le devis n'a pas pu être transformé en facture.",
      );
      return;
    }

    setIsInvoiceDetailOpen(true);
    setEditingQuoteId(null);
    setPaymentAmount(0);
  }

  function openInvoiceCreation(type: InvoiceType) {
    setActiveTab("factures");
    setEditingQuoteId(null);
    setDraft((current) => ({
      ...current,
      type,
      paid:
        type === "Devis"
          ? 0
          : type === "Acompte"
            ? Number(current.paid) > 0
              ? current.paid
              : 30
            : current.paid,
    }));
    window.setTimeout(() => {
      creationRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 40);
  }

  function editQuote(invoice: Invoice) {
    setActiveTab("factures");
    setEditingQuoteId(invoice.id);
    setSelectedInvoiceId(invoice.id);
    setIsInvoiceDetailOpen(true);
    setPreviewInvoiceId(null);
    setDraft({
      client: invoice.client,
      email: invoice.email,
      care: invoice.care,
      type: "Devis",
      lines: getInvoiceLines(invoice).map((line) => ({
        ...line,
        id: `draft-${line.id}-${Date.now()}`,
        discountType: (line.discountType ?? "Aucune") as DiscountType,
        discountValue: line.discountValue ?? 0,
      })),
      discountType: (invoice.discountType ?? "Aucune") as DiscountType,
      discountValue: invoice.discountValue ?? 0,
      paid: 0,
      paymentMethod: invoice.paymentMethod,
    });
    window.setTimeout(() => {
      creationRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 40);
  }

  function fillMariePaymentExample() {
    setEditingQuoteId(null);
    setDraft((current) => ({
      ...current,
      client: "Marie Dubois",
      email: "marie@email.com",
      care: "Cure cryolipolyse + pressothérapie",
      type: "Facture finale",
      lines: [
        {
          id: `draft-cryo-${Date.now()}`,
          label: "Cure 5 séances cryolipolyse",
          quantity: 1,
          unitPrice: 900,
          vatRate: 20,
          discountType: "Aucune",
          discountValue: 0,
        },
        {
          id: `draft-presso-${Date.now()}`,
          label: "Cure 5 séances pressothérapie",
          quantity: 1,
          unitPrice: 500,
          vatRate: 20,
          discountType: "Aucune",
          discountValue: 0,
        },
      ],
      discountType: "Aucune",
      discountValue: 0,
      paid: 500,
      paymentMethod: "CB centre",
    }));
  }

  function updateDraftLine(
    lineId: string,
    field: keyof InvoiceLine,
    value: string | number | DiscountType,
  ) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === lineId ? { ...line, [field]: value } : line,
      ),
    }));
  }

  function addDraftLine() {
    setDraft((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          id: `draft-line-${Date.now()}`,
          label: "Nouvelle prestation",
          quantity: 1,
          unitPrice: 0,
          vatRate: 20,
          discountType: "Aucune",
          discountValue: 0,
        },
      ],
    }));
  }

  function removeDraftLine(lineId: string) {
    setDraft((current) => ({
      ...current,
      lines:
        current.lines.length === 1
          ? current.lines
          : current.lines.filter((line) => line.id !== lineId),
    }));
  }

  function addBillingService() {
    const service: BillingService = {
      id: `service-${Date.now()}`,
      name: "Nouvelle prestation",
      category: "À classer",
      color: billingServiceColorFallback(billingServices.length),
      duration: "60 min",
      price: 0,
      vatRate: 20,
      deposit: 0,
    };
    setBillingServices((current) => [service, ...current]);
  }

  function updateBillingService(
    serviceId: string,
    field: keyof BillingService,
    value: string | number,
  ) {
    setBillingServices((current) =>
      current.map((service) =>
        service.id === serviceId ? { ...service, [field]: value } : service,
      ),
    );
  }

  function removeBillingService(serviceId: string) {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette prestation ?")) {
      return;
    }
    setBillingServices((current) =>
      current.filter((service) => service.id !== serviceId),
    );
  }

  function addBillingProduct() {
    const product: BillingProduct = {
      id: `product-${Date.now()}`,
      name: "Nouveau produit",
      category: "À classer",
      reference: "",
      stock: 0,
      price: 0,
      vatRate: 20,
    };
    setBillingProducts((current) => [product, ...current]);
  }

  function updateBillingProduct(
    productId: string,
    field: keyof BillingProduct,
    value: string | number,
  ) {
    setBillingProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, [field]: value } : product,
      ),
    );
  }

  function removeBillingProduct(productId: string) {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce produit ?")) {
      return;
    }
    setBillingProducts((current) =>
      current.filter((product) => product.id !== productId),
    );
  }

  function addBillingCategory() {
    const name = window.prompt("Nom de la nouvelle catégorie");
    const category = name?.trim();
    if (!category) {
      return;
    }
    setBillingCategories((current) =>
      current.includes(category) ? current : [...current, category],
    );
  }

  function removeBillingCategory(category: string) {
    const isUsed =
      billingServices.some((service) => service.category === category) ||
      billingProducts.some((product) => product.category === category);
    const message = isUsed
      ? `Cette catégorie est utilisée. La supprimer remettra les éléments concernés dans "À classer". Continuer ?`
      : `Êtes-vous sûr de vouloir supprimer la catégorie "${category}" ?`;
    if (!window.confirm(message)) {
      return;
    }
    setBillingCategories((current) =>
      current.filter((item) => item !== category),
    );
    if (isUsed) {
      setBillingServices((current) =>
        current.map((service) =>
          service.category === category
            ? { ...service, category: "À classer" }
            : service,
        ),
      );
      setBillingProducts((current) =>
        current.map((product) =>
          product.category === category
            ? { ...product, category: "À classer" }
            : product,
        ),
      );
      setBillingCategories((current) =>
        current.includes("À classer") ? current : [...current, "À classer"],
      );
    }
  }

  async function markAsPaid(invoiceId: string) {
    const invoiceToPay = invoices.find((invoice) => invoice.id === invoiceId);

    if (!invoiceToPay || invoiceToPay.type === "Devis") {
      return;
    }

    const amount = Math.max(invoiceToPay.total - invoiceToPay.paid, 0);

    try {
      await registerBillingPayment(
        invoiceToPay as BillingInvoice,
        amount,
        invoiceToPay.paymentMethod,
      );
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Le paiement n'a pas pu être enregistré.",
      );
      return;
    }

    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === invoiceId && invoice.type !== "Devis"
          ? { ...invoice, paid: invoice.total, status: "Payée" }
          : invoice,
      ),
    );
    setBillingNotice("Paiement enregistré.");
  }

  async function registerPayment(invoiceId: string) {
    const amount = Math.max(Number(paymentAmount) || 0, 0);
    if (amount <= 0) {
      return;
    }

    const invoiceToPay = invoices.find((invoice) => invoice.id === invoiceId);

    if (!invoiceToPay || invoiceToPay.type === "Devis") {
      return;
    }

    let paidInvoice: BillingInvoice;

    try {
      paidInvoice = await registerBillingPayment(
        invoiceToPay as BillingInvoice,
        amount,
        invoiceToPay.paymentMethod,
      );
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Le règlement n'a pas pu être enregistré.",
      );
      return;
    }

    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === invoiceId ? (paidInvoice as Invoice) : invoice,
      ),
    );
    setPaymentAmount(0);
    setBillingNotice("Règlement enregistré.");
  }

  async function registerInvoicePayment(
    invoiceId: string,
    amount: number,
    paymentMethod: Invoice["paymentMethod"],
  ) {
    const payment = Math.max(Number(amount) || 0, 0);
    if (payment <= 0) {
      return;
    }

    const persistedInvoice = invoices.find((invoice) => invoice.id === invoiceId);

    if (persistedInvoice) {
      try {
        await registerBillingPayment(
          persistedInvoice as BillingInvoice,
          payment,
          paymentMethod,
        );
      } catch (error) {
        setBillingError(
          error instanceof Error
            ? error.message
            : "Le règlement n'a pas pu être enregistré.",
        );
        return;
      }
    }

    const applyPayment = (invoice: Invoice): Invoice => {
      const nextPaid = Math.min(invoice.total, invoice.paid + payment);
      return {
        ...invoice,
        paid: nextPaid,
        paymentMethod,
        status:
          nextPaid >= invoice.total ? "Payée" : "En attente de paiement",
      };
    };

    setPendingFinalInvoice((current) =>
      current?.id === invoiceId ? applyPayment(current) : current,
    );
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === invoiceId ? applyPayment(invoice) : invoice,
      ),
    );
    setBillingNotice("Règlement enregistré.");
  }

  function downloadInvoice(invoice: Invoice) {
    const content = buildInvoiceHtml(invoice);
    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.number}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function sendInvoiceByEmail(invoice: Invoice) {
    const subject = encodeURIComponent(`Votre facture Bookea ${invoice.number}`);
    const body = encodeURIComponent(
      `Bonjour ${invoice.client},\n\nVoici le détail de votre facture.\n\n${buildInvoiceText(invoice)}\n\nCordialement,\nBookea`,
    );
    window.location.href = `mailto:${invoice.email}?subject=${subject}&body=${body}`;
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1800px] space-y-6 p-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">
              Bookea Facturation
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Facturation
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-500">
              Factures d&apos;acompte, factures finales, avoirs et suivi des
              encaissements du centre.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void refreshInvoices()}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 shadow-sm"
              disabled={isLoadingBilling}
            >
              <RotateCcw className="h-5 w-5" />
              Actualiser
            </button>
            <button
              type="button"
              onClick={() => openInvoiceCreation("Devis")}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 font-semibold text-white shadow-sm"
            >
              <FileCheck2 className="h-5 w-5" />
              Devis
            </button>
            <button
              type="button"
              onClick={() => openInvoiceCreation("Acompte")}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white shadow-sm"
            >
              <CreditCard className="h-5 w-5" />
              Facture acompte
            </button>
            <button
              type="button"
              onClick={() => openInvoiceCreation("Facture finale")}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white shadow-sm"
            >
              <FilePlus2 className="h-5 w-5" />
              Facture finale
            </button>
          </div>
        </header>

        {billingError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {billingError}
          </div>
        )}

        {billingNotice && !billingError && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            {billingNotice}
          </div>
        )}

        {isLoadingBilling && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-700">
            Chargement des factures...
          </div>
        )}

        <div className="flex flex-wrap gap-3 border-b border-slate-200 pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("factures")}
            className={`border-b-4 px-4 py-3 font-semibold transition ${
              activeTab === "factures"
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            Factures
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reglages")}
            className={`inline-flex items-center gap-2 border-b-4 px-4 py-3 font-semibold transition ${
              activeTab === "reglages"
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Settings2 className="h-5 w-5" />
            Réglages
          </button>
        </div>

        {activeTab === "factures" ? (
          <>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <BillingMetric
            title="CA encaissé"
            value={formatCurrency(stats.paid)}
            detail="Paiements validés"
            icon={<BadgeEuro />}
            color="text-emerald-600"
          />
          <BillingMetric
            title="Reste à encaisser"
            value={formatCurrency(stats.pending)}
            detail="Solde client à suivre"
            icon={<AlertTriangle />}
            color="text-orange-600"
          />
          <BillingMetric
            title="Acomptes"
            value={stats.deposits.toString()}
            detail="Factures générées"
            icon={<CreditCard />}
            color="text-violet-600"
          />
          <BillingMetric
            title="Avoirs"
            value={stats.credits.toString()}
            detail="Remboursements / annulations"
            icon={<RotateCcw />}
            color="text-rose-600"
          />
        </section>

        <section
          className={`grid gap-6 transition-all ${
            isInvoiceDetailOpen
              ? "xl:grid-cols-[minmax(0,1fr)_460px]"
              : "xl:grid-cols-[minmax(0,1fr)_260px]"
          }`}
        >
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">
                  Journal des factures
                </h2>
                <p className="mt-1 font-semibold text-slate-500">
                  Numérotation chronologique, acompte, solde et statut.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex h-12 min-w-80 items-center rounded-2xl border border-slate-200 px-4">
                  <Search className="h-5 w-5 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher facture, cliente, soin..."
                    className="ml-3 w-full bg-transparent font-bold outline-none"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(event) =>
                    setTypeFilter(event.target.value as "Toutes" | InvoiceType)
                  }
                  className="h-12 rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none"
                >
                  <option>Toutes</option>
                  <option>Devis</option>
                  <option>Acompte</option>
                  <option>Facture finale</option>
                  <option>Avoir</option>
                </select>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
              <div className="grid grid-cols-[150px_1.1fr_1fr_150px_120px_130px_150px] bg-slate-50 px-5 py-4 text-xs font-medium text-slate-500">
                <span>Numéro</span>
                <span>Cliente</span>
                <span>Soin</span>
                <span>Type</span>
                <span>Montant</span>
                <span>Statut</span>
                <span className="text-right">Actions</span>
              </div>
              {filteredInvoices.length === 0 ? (
                <p className="border-t border-slate-100 px-5 py-6 text-sm font-semibold text-slate-500">
                  {isLoadingBilling
                    ? "Chargement des factures du centre…"
                    : "Aucune facture pour ce centre."}
                </p>
              ) : null}
              {filteredInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  onClick={() => {
                    if (invoice.type === "Devis") {
                      editQuote(invoice);
                      return;
                    }
                    setSelectedInvoiceId(invoice.id);
                    setIsInvoiceDetailOpen(true);
                    setPreviewInvoiceId(invoice.id);
                  }}
                  className={`grid w-full cursor-pointer grid-cols-[150px_1.1fr_1fr_150px_120px_130px_150px] items-center border-t border-slate-100 px-5 py-4 text-left transition hover:bg-blue-50 ${
                    selectedInvoice.id === invoice.id ? "bg-blue-50" : "bg-white"
                  }`}
                >
                  <span className="font-semibold text-slate-950">
                    {invoice.number}
                  </span>
                  <span>
                    <strong className="block text-slate-950">
                      {invoice.client}
                    </strong>
                    <span className="text-sm font-semibold text-slate-500">
                      {invoice.date}
                    </span>
                  </span>
                  <span className="font-bold text-slate-700">{invoice.care}</span>
                  <span>
                    <InvoicePill className={typeStyles[invoice.type]}>
                      {invoice.type}
                    </InvoicePill>
                  </span>
                  <span className="font-semibold text-slate-950">
                    {formatCurrency(invoice.total)}
                  </span>
                  <span>
                    <InvoicePill className={statusStyles[invoice.status]}>
                      {invoice.status}
                    </InvoicePill>
                  </span>
                  <span className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedInvoiceId(invoice.id);
                        setIsInvoiceDetailOpen(true);
                        setPreviewInvoiceId(invoice.id);
                      }}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 transition hover:bg-blue-100"
                      aria-label={`Voir ${invoice.number}`}
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        downloadInvoice(invoice);
                      }}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
                      aria-label={`Télécharger ${invoice.number}`}
                    >
                      <Download className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        sendInvoiceByEmail(invoice);
                      }}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-violet-100 bg-violet-50 text-violet-600 transition hover:bg-violet-100"
                      aria-label={`Envoyer ${invoice.number} par mail`}
                    >
                      <Mail className="h-5 w-5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <button
                type="button"
                onClick={() => setIsInvoiceDetailOpen((open) => !open)}
                className="flex w-full items-start justify-between gap-4 text-left"
                aria-expanded={isInvoiceDetailOpen}
              >
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {selectedInvoice.type === "Devis"
                      ? "Devis sélectionné"
                      : "Facture sélectionnée"}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">
                    {selectedInvoice.number}
                  </h2>
                  {!isInvoiceDetailOpen && (
                    <div className="mt-3 space-y-1">
                      <p className="font-semibold text-slate-950">
                        {selectedInvoice.client}
                      </p>
                      <p className="font-bold text-slate-500">
                        {formatCurrency(selectedInvoice.total)}
                      </p>
                    </div>
                  )}
                </div>
                <span className="flex flex-col items-end gap-2">
                  {isInvoiceDetailOpen && (
                    <InvoicePill
                      className={
                        selectedInvoice.type === "Devis"
                          ? typeStyles.Devis
                          : statusStyles[selectedInvoice.status]
                      }
                    >
                      {selectedInvoice.type === "Devis"
                        ? "Devis"
                        : selectedInvoice.status}
                    </InvoicePill>
                  )}
                  <span className="grid h-10 w-10 place-items-center rounded-2xl border border-slate-200 text-slate-500">
                    <ChevronDown
                      className={`h-5 w-5 transition ${
                        isInvoiceDetailOpen ? "rotate-180" : ""
                      }`}
                    />
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    {isInvoiceDetailOpen ? "Fermer" : "Ouvrir"}
                  </span>
                </span>
              </button>

              {isInvoiceDetailOpen && (
                <>
                  <div className="mt-5 grid gap-3 rounded-3xl bg-slate-50 p-4">
                    <DetailLine label="Cliente" value={selectedInvoice.client} />
                    <DetailLine label="Email" value={selectedInvoice.email} />
                    <DetailLine label="Prestation" value={selectedInvoice.care} />
                    <DetailLine label="Type" value={selectedInvoice.type} />
                    <DetailLine
                      label="Total HT"
                      value={formatCurrency(selectedAmounts.ht)}
                    />
                    <DetailLine
                      label="TVA"
                      value={formatCurrency(selectedAmounts.vat)}
                    />
                    <DetailLine
                      label="Total TTC"
                      value={formatCurrency(selectedInvoice.total)}
                    />
                    {selectedInvoice.type !== "Devis" && (
                      <>
                        <DetailLine
                          label="Payé"
                          value={formatCurrency(selectedInvoice.paid)}
                        />
                        <DetailLine
                          label="Reste dû"
                          value={formatCurrency(selectedRemaining)}
                        />
                        <DetailLine
                          label="Paiement"
                          value={selectedInvoice.paymentMethod}
                        />
                      </>
                    )}
                  </div>

                  {selectedRemaining > 0 && selectedInvoice.type !== "Devis" && (
                    <div className="mt-5 rounded-3xl border border-orange-100 bg-orange-50 p-4">
                      <p className="text-xs font-medium text-orange-700">
                        Ajouter un règlement
                      </p>
                      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                        <input
                          type="number"
                          min={0}
                          max={selectedRemaining}
                          value={paymentAmount}
                          onChange={(event) =>
                            setPaymentAmount(Number(event.target.value))
                          }
                          placeholder="Montant encaissé"
                          className="h-12 rounded-2xl border border-orange-200 bg-white px-4 font-semibold outline-none focus:border-orange-500"
                        />
                        <button
                          type="button"
                          onClick={() => registerPayment(selectedInvoice.id)}
                          className="rounded-2xl bg-orange-600 px-4 font-semibold text-white"
                        >
                          Enregistrer
                        </button>
                      </div>
                      <p className="mt-2 text-sm font-bold text-orange-700">
                        Reste à encaisser : {formatCurrency(selectedRemaining)}
                      </p>
                    </div>
                  )}

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {selectedInvoice.type === "Devis" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => editQuote(selectedInvoice)}
                          className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 font-semibold text-white"
                        >
                          <FileCheck2 className="h-5 w-5" />
                          Modifier le devis
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteQuote(selectedInvoice.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white"
                        >
                          <Trash2 className="h-5 w-5" />
                          Supprimer
                        </button>
                        <button
                          type="button"
                          onClick={() => convertQuoteToFinalInvoice(selectedInvoice)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-semibold text-white"
                        >
                          <FilePlus2 className="h-5 w-5" />
                          Convertir
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => markAsPaid(selectedInvoice.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white"
                        >
                          <CheckCircle2 className="h-5 w-5" />
                          Encaisser
                        </button>
                        <button
                          type="button"
                          onClick={() => createInvoice("Avoir")}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 font-semibold text-white"
                        >
                          <RotateCcw className="h-5 w-5" />
                          Avoir
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setPreviewInvoiceId(selectedInvoice.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800"
                    >
                      <Eye className="h-5 w-5" />
                      Voir
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadInvoice(selectedInvoice)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800"
                    >
                      <Download className="h-5 w-5" />
                      Télécharger
                    </button>
                    <button
                      type="button"
                      onClick={() => sendInvoiceByEmail(selectedInvoice)}
                      className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 font-semibold text-violet-700"
                    >
                      <Mail className="h-5 w-5" />
                      Envoyer
                    </button>
                  </div>
                </>
              )}
            </div>

            <div
              ref={creationRef}
              className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-5 flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <FilePlus2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-medium text-blue-600">
                    Fiche de création
                  </p>
                  <h2 className="text-lg font-semibold">{creationTitle}</h2>
                  <p className="text-sm font-semibold text-slate-500">
                    {editingQuoteId
                      ? "Modifiez les prestations, remises et informations du devis sélectionné."
                      : "Ajoutez plusieurs prestations, un acompte ou un paiement partiel."}
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={fillMariePaymentExample}
                  className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-left font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  Exemple : Marie Dubois, cryo 900 € + pressothérapie 500 €, 500 € réglés
                </button>
                <FormSelect
                  label="Cliente"
                  value={draft.client}
                  options={invoiceClientOptions}
                  onChange={(client) =>
                    setDraft((current) => ({
                      ...current,
                      client,
                    }))
                  }
                />
                <FormSelect
                  label="Type"
                  value={draft.type}
                  options={["Devis", "Acompte", "Facture finale", "Avoir"]}
                  onChange={(type) => {
                    const nextType = type as InvoiceType;
                    if (nextType !== "Devis") {
                      setEditingQuoteId(null);
                    }
                    setDraft((current) => ({ ...current, type: nextType }));
                  }}
                />
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-slate-500">
                      Prestations
                    </p>
                    <button
                      type="button"
                      onClick={addDraftLine}
                      className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                    >
                      + Ajouter
                    </button>
                  </div>
                  <div className="space-y-3">
                    {draft.lines.map((line) => (
                      <div
                        key={line.id}
                        className="grid gap-2 rounded-2xl bg-white p-3"
                      >
                        <select
                          value={line.label}
                          onChange={(event) => {
                            const label = event.target.value;
                            const service = billingServices.find(
                              (item) => item.name === label,
                            );
                            updateDraftLine(line.id, "label", label);
                            if (service) {
                              updateDraftLine(line.id, "unitPrice", service.price);
                              updateDraftLine(line.id, "vatRate", service.vatRate);
                            }
                          }}
                          className="h-11 rounded-xl border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-blue-500"
                        >
                          {billingServices.map((care) => (
                            <option key={care.id}>{care.name}</option>
                          ))}
                          {invoiceCareOptions
                            .filter(
                              (care) =>
                                !billingServices.some(
                                  (service) => service.name === care,
                                ),
                            )
                            .map((care) => (
                              <option key={care}>{care}</option>
                            ))}
                          <option>Nouvelle prestation</option>
                        </select>
                        <input
                          value={line.label}
                          onChange={(event) =>
                            updateDraftLine(line.id, "label", event.target.value)
                          }
                          className="h-11 rounded-xl border border-slate-200 px-3 font-semibold outline-none focus:border-blue-500"
                          placeholder="Nom affiché sur la facture"
                        />
                        <div className="grid grid-cols-[1fr_1fr_0.8fr_auto] gap-2">
                          <label className="space-y-1">
                            <span className="text-xs font-medium text-slate-400">
                              Qté
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={line.quantity}
                              onChange={(event) =>
                                updateDraftLine(
                                  line.id,
                                  "quantity",
                                  Number(event.target.value),
                                )
                              }
                              className="h-11 w-full rounded-xl border border-slate-200 px-3 font-semibold outline-none focus:border-blue-500"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs font-medium text-slate-400">
                              Prix TTC
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={line.unitPrice}
                              onChange={(event) =>
                                updateDraftLine(
                                  line.id,
                                  "unitPrice",
                                  Number(event.target.value),
                                )
                              }
                              className="h-11 w-full rounded-xl border border-slate-200 px-3 font-semibold outline-none focus:border-blue-500"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs font-medium text-slate-400">
                              TVA
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={line.vatRate}
                              onChange={(event) =>
                                updateDraftLine(
                                  line.id,
                                  "vatRate",
                                  Number(event.target.value),
                                )
                              }
                              className="h-11 w-full rounded-xl border border-slate-200 px-3 font-semibold outline-none focus:border-blue-500"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => removeDraftLine(line.id)}
                            className="mt-6 h-11 rounded-xl border border-rose-100 px-3 text-sm font-medium text-rose-500 hover:bg-rose-50"
                          >
                            Suppr.
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                          <label className="space-y-1">
                            <span className="text-xs font-medium text-slate-400">
                              Remise prestation
                            </span>
                            <select
                              value={line.discountType ?? "Aucune"}
                              onChange={(event) =>
                                updateDraftLine(
                                  line.id,
                                  "discountType",
                                  event.target.value as DiscountType,
                                )
                              }
                              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-blue-500"
                            >
                              <option>Aucune</option>
                              <option>€</option>
                              <option>%</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs font-medium text-slate-400">
                              Valeur remise
                            </span>
                            <input
                              type="number"
                              min={0}
                              disabled={(line.discountType ?? "Aucune") === "Aucune"}
                              value={line.discountValue ?? 0}
                              onChange={(event) =>
                                updateDraftLine(
                                  line.id,
                                  "discountValue",
                                  Number(event.target.value),
                                )
                              }
                              className="h-11 w-full rounded-xl border border-slate-200 px-3 font-semibold outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </label>
                          <p className="rounded-xl bg-white px-3 py-3 text-sm font-medium text-slate-600">
                            Net ligne : {formatCurrency(calculateLineTotal(line))}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormSelect
                    label="Remise globale"
                    value={draft.discountType}
                    options={["Aucune", "€", "%"]}
                    onChange={(discountType) =>
                      setDraft((current) => ({
                        ...current,
                        discountType: discountType as DiscountType,
                      }))
                    }
                  />
                  <label className="space-y-2">
                    <span className="text-xs font-medium text-slate-500">
                      Valeur remise globale
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={draft.discountValue}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          discountValue: Number(event.target.value),
                        }))
                      }
                      className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-blue-500"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-xs font-medium text-slate-500">
                    Déjà payé
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={draft.paid}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        paid: Number(event.target.value),
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-semibold outline-none focus:border-blue-500"
                  />
                </label>

                <FormSelect
                  label="Mode de paiement"
                  value={draft.paymentMethod}
                  options={["CB centre", "Espèces", "Virement", "Stripe"]}
                  onChange={(paymentMethod) =>
                    setDraft((current) => ({
                      ...current,
                      paymentMethod: paymentMethod as Invoice["paymentMethod"],
                    }))
                  }
                />

                <div className="grid gap-2 rounded-3xl bg-blue-50 p-4">
                  <DetailLine
                    label="Sous-total TTC"
                    value={formatCurrency(draftSubtotal)}
                  />
                  <DetailLine
                    label="Remise globale"
                    value={formatCurrency(draftDiscount)}
                  />
                  <DetailLine label="Total HT" value={formatCurrency(draftHt)} />
                  <DetailLine label="TVA" value={formatCurrency(draftVat)} />
                  <DetailLine label="Total TTC" value={formatCurrency(draftTotal)} />
                </div>
                <button
                  type="button"
                  onClick={() => createInvoice()}
                  className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white"
                >
                  <ReceiptText className="h-5 w-5" />
                  {creationAction}
                </button>
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          {[
            {
              title: "Acompte Stripe",
              text: "Quand une cliente paie l'acompte en ligne, Bookea crée automatiquement une facture d'acompte.",
              icon: <CreditCard />,
            },
            {
              title: "Facture finale",
              text: "Après le rendez-vous, le centre encaisse le solde et génère la facture finale rattachée à la fiche cliente.",
              icon: <FileCheck2 />,
            },
            {
              title: "Conformité française",
              text: "Numéros chronologiques, PDF conservés, avoirs pour remboursements et future connexion PDP.",
              icon: <ShieldCheck />,
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700">
                {item.icon}
              </div>
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-2 font-semibold leading-7 text-slate-500">
                {item.text}
              </p>
            </div>
          ))}
        </section>
          </>
        ) : (
          <BillingSettings
            categories={billingCategories}
            services={sortServicesByCategory(billingServices, billingCategories)}
            products={sortServicesByCategory(billingProducts, billingCategories)}
            onAddCategory={addBillingCategory}
            onRemoveCategory={removeBillingCategory}
            onAddService={addBillingService}
            onUpdateService={updateBillingService}
            onRemoveService={removeBillingService}
            onAddProduct={addBillingProduct}
            onUpdateProduct={updateBillingProduct}
            onRemoveProduct={removeBillingProduct}
          />
        )}
      </div>

      {previewInvoiceId && (
        <InvoicePreview
          invoice={
            pendingFinalInvoice ??
            invoices.find((invoice) => invoice.id === previewInvoiceId) ??
            selectedInvoice
          }
          isPendingFinal={pendingFinalInvoice?.id === previewInvoiceId}
          onClose={() => {
            if (pendingFinalInvoice?.id === previewInvoiceId) {
              cancelPendingFinalInvoice();
              return;
            }
            setPreviewInvoiceId(null);
          }}
          onCancelPending={cancelPendingFinalInvoice}
          onValidateFinal={validatePendingFinalInvoice}
          onRegisterPayment={registerInvoicePayment}
          onSaveQuote={saveQuoteFromPreview}
          onDeleteQuote={deleteQuote}
          onConvertQuote={convertQuoteToFinalInvoice}
          onDownload={downloadInvoice}
          onSend={sendInvoiceByEmail}
        />
      )}
    </main>
  );
}

function BillingSettings({
  categories,
  services,
  products,
  onAddCategory,
  onRemoveCategory,
  onAddService,
  onUpdateService,
  onRemoveService,
  onAddProduct,
  onUpdateProduct,
  onRemoveProduct,
}: {
  categories: string[];
  services: BillingService[];
  products: BillingProduct[];
  onAddCategory: () => void;
  onRemoveCategory: (category: string) => void;
  onAddService: () => void;
  onUpdateService: (
    serviceId: string,
    field: keyof BillingService,
    value: string | number,
  ) => void;
  onRemoveService: (serviceId: string) => void;
  onAddProduct: () => void;
  onUpdateProduct: (
    productId: string,
    field: keyof BillingProduct,
    value: string | number,
  ) => void;
  onRemoveProduct: (productId: string) => void;
}) {
  return (
    <section className="space-y-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Catégories de facturation
            </h2>
            <p className="mt-1 font-semibold text-slate-500">
              Elles servent à classer les prestations et les produits.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddCategory}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-semibold text-white"
          >
            <Plus className="h-5 w-5" />
            Ajouter une catégorie
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((category) => (
            <span
              key={category}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
            >
              {category}
              <button
                type="button"
                onClick={() => onRemoveCategory(category)}
                className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                aria-label={`Supprimer ${category}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700">
              <ReceiptText className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-slate-950">
              Prestations facturables
            </h2>
            <p className="mt-1 font-semibold text-slate-500">
              Ces prestations remontent dans la création de facture.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddService}
            className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 font-semibold text-white"
          >
            <Plus className="h-5 w-5" />
            Ajouter
          </button>
        </div>

        <div className="space-y-3">
          {services.map((service) => (
            <div
              key={service.id}
              className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
                <SettingsInput
                  label="Nom"
                  value={service.name}
                  onChange={(value) =>
                    onUpdateService(service.id, "name", value)
                  }
                />
                <SettingsSelect
                  label="Catégorie"
                  value={service.category}
                  options={categories}
                  onChange={(value) =>
                    onUpdateService(service.id, "category", value)
                  }
                />
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_0.8fr_1fr_auto]">
                <SettingsInput
                  label="Durée"
                  value={service.duration}
                  onChange={(value) =>
                    onUpdateService(service.id, "duration", value)
                  }
                />
                <SettingsInput
                  label="Prix TTC"
                  type="number"
                  value={service.price}
                  onChange={(value) =>
                    onUpdateService(service.id, "price", Number(value))
                  }
                />
                <SettingsInput
                  label="TVA %"
                  type="number"
                  value={service.vatRate}
                  onChange={(value) =>
                    onUpdateService(service.id, "vatRate", Number(value))
                  }
                />
                <SettingsInput
                  label="Acompte"
                  type="number"
                  value={service.deposit}
                  onChange={(value) =>
                    onUpdateService(service.id, "deposit", Number(value))
                  }
                />
                <button
                  type="button"
                  onClick={() => onRemoveService(service.id)}
                  className="mt-7 grid h-11 w-11 place-items-center rounded-xl border border-rose-100 bg-white text-rose-500 hover:bg-rose-50"
                  aria-label={`Supprimer ${service.name}`}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
              <Package className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-slate-950">
              Produits facturables
            </h2>
            <p className="mt-1 font-semibold text-slate-500">
              Produits vendus au centre, références, prix et stock.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddProduct}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white"
          >
            <Plus className="h-5 w-5" />
            Ajouter
          </button>
        </div>

        <div className="space-y-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
                <SettingsInput
                  label="Nom"
                  value={product.name}
                  onChange={(value) =>
                    onUpdateProduct(product.id, "name", value)
                  }
                />
                <SettingsSelect
                  label="Catégorie"
                  value={product.category}
                  options={categories}
                  onChange={(value) =>
                    onUpdateProduct(product.id, "category", value)
                  }
                />
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_0.8fr_1fr_auto]">
                <SettingsInput
                  label="Référence"
                  value={product.reference}
                  onChange={(value) =>
                    onUpdateProduct(product.id, "reference", value)
                  }
                />
                <SettingsInput
                  label="Prix TTC"
                  type="number"
                  value={product.price}
                  onChange={(value) =>
                    onUpdateProduct(product.id, "price", Number(value))
                  }
                />
                <SettingsInput
                  label="TVA %"
                  type="number"
                  value={product.vatRate}
                  onChange={(value) =>
                    onUpdateProduct(product.id, "vatRate", Number(value))
                  }
                />
                <SettingsInput
                  label="Stock"
                  type="number"
                  value={product.stock}
                  onChange={(value) =>
                    onUpdateProduct(product.id, "stock", Number(value))
                  }
                />
                <button
                  type="button"
                  onClick={() => onRemoveProduct(product.id)}
                  className="mt-7 grid h-11 w-11 place-items-center rounded-xl border border-rose-100 bg-white text-rose-500 hover:bg-rose-50"
                  aria-label={`Supprimer ${product.name}`}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </section>
  );
}

function SettingsSelect({
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
  const selectOptions = options.includes(value) ? options : [value, ...options];

  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-blue-500"
      >
        {selectOptions.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SettingsInput({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string | number;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-blue-500"
      />
    </label>
  );
}

function InvoicePreview({
  invoice,
  isPendingFinal = false,
  onClose,
  onCancelPending,
  onValidateFinal,
  onRegisterPayment,
  onSaveQuote,
  onDeleteQuote,
  onConvertQuote,
  onDownload,
  onSend,
}: {
  invoice: Invoice;
  isPendingFinal?: boolean;
  onClose: () => void;
  onCancelPending?: () => void;
  onValidateFinal?: () => void;
  onRegisterPayment: (
    invoiceId: string,
    amount: number,
    paymentMethod: Invoice["paymentMethod"],
  ) => void;
  onSaveQuote: (invoiceId: string) => void;
  onDeleteQuote: (invoiceId: string) => void;
  onConvertQuote: (invoice: Invoice) => void;
  onDownload: (invoice: Invoice) => void;
  onSend: (invoice: Invoice) => void;
}) {
  const amounts = calculateInvoiceAmounts(invoice);
  const remaining = Math.max(invoice.total - invoice.paid, 0);
  const [previewPaymentAmount, setPreviewPaymentAmount] = useState(remaining);
  const [previewPaymentMethod, setPreviewPaymentMethod] =
    useState<Invoice["paymentMethod"]>(invoice.paymentMethod);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewPaymentAmount(Math.max(invoice.total - invoice.paid, 0));
    setPreviewPaymentMethod(invoice.paymentMethod);
  }, [invoice.id, invoice.paid, invoice.paymentMethod, invoice.total]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-6 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[32px] bg-white p-8 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="sticky top-0 float-right z-10 -mr-2 -mt-2 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          aria-label="Fermer l'aperçu facture"
        >
          <X className="h-5 w-5" />
          Fermer
        </button>
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium text-blue-600">
              Aperçu facture
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              {invoice.number}
            </h2>
            <p className="mt-2 font-bold text-slate-500">{invoice.date}</p>
          </div>
          <InvoicePill className={statusStyles[invoice.status]}>
            {invoice.status}
          </InvoicePill>
        </div>

        <div className="grid gap-5 py-6 sm:grid-cols-2">
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-xs font-medium text-slate-500">
              Cliente
            </p>
            <p className="mt-3 text-lg font-semibold text-slate-950">
              {invoice.client}
            </p>
            <p className="mt-1 font-bold text-slate-500">{invoice.email}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5">
            <p className="text-xs font-medium text-slate-500">
              Centre
            </p>
            <p className="mt-3 text-lg font-semibold text-slate-950">
              JFG Clinique Clermont
            </p>
            <p className="mt-1 font-bold text-slate-500">Bookea Pro</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200">
          <div className="grid grid-cols-[1fr_60px_95px_75px_115px] bg-slate-50 px-5 py-4 text-xs font-medium text-slate-500">
            <span>Description</span>
            <span className="text-right">Qté</span>
            <span className="text-right">Prix</span>
            <span className="text-right">TVA</span>
            <span className="text-right">Total</span>
          </div>
          {getInvoiceLines(invoice).map((line) => {
            const lineDiscount = calculateLineDiscount(line);
            return (
              <div
                key={line.id}
                className="grid grid-cols-[1fr_60px_95px_75px_115px] border-t border-slate-100 px-5 py-5"
              >
                <span>
                  <strong className="block text-sm font-medium text-slate-950">
                    {line.label}
                  </strong>
                  <span className="mt-1 block font-bold text-slate-500">
                    {invoice.type}
                  </span>
                  {lineDiscount > 0 ? (
                    <span className="mt-1 block text-sm font-medium text-emerald-600">
                      Remise prestation : -{formatCurrency(lineDiscount)}
                    </span>
                  ) : null}
                </span>
                <span className="text-right font-semibold text-slate-700">
                  {line.quantity}
                </span>
                <span className="text-right font-semibold text-slate-700">
                  {formatCurrency(line.unitPrice)}
                </span>
                <span className="text-right font-semibold text-slate-700">
                  {line.vatRate} %
                </span>
                <span className="text-right text-sm font-medium text-slate-950">
                  {formatCurrency(calculateLineTotal(line))}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-3 rounded-3xl bg-blue-50 p-5">
          <DetailLine
            label="Sous-total TTC"
            value={formatCurrency(amounts.subtotal)}
          />
          <DetailLine
            label="Remises prestations"
            value={formatCurrency(amounts.lineDiscount)}
          />
          <DetailLine
            label="Remise globale"
            value={formatCurrency(amounts.discount)}
          />
          <DetailLine label="Total HT" value={formatCurrency(amounts.ht)} />
          <DetailLine label="TVA" value={formatCurrency(amounts.vat)} />
          <DetailLine label="Montant total TTC" value={formatCurrency(invoice.total)} />
          <DetailLine label="Déjà payé" value={formatCurrency(invoice.paid)} />
          <DetailLine
            label="Reste dû"
            value={formatCurrency(remaining)}
          />
        </div>

        {remaining > 0 && invoice.type !== "Devis" ? (
          <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-700">
                  Ajouter un paiement
                </p>
                <p className="mt-1 font-semibold text-emerald-900/70">
                  Encaisser une partie ou le solde restant de cette facture.
                </p>
              </div>
              <p className="font-semibold text-emerald-700">
                Reste dû : {formatCurrency(remaining)}
              </p>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-emerald-700">
                  Montant encaissé
                </span>
                <input
                  type="number"
                  min={0}
                  max={remaining}
                  value={previewPaymentAmount}
                  onChange={(event) =>
                    setPreviewPaymentAmount(Number(event.target.value) || 0)
                  }
                  className="h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 font-semibold text-slate-950 outline-none focus:border-emerald-500"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-emerald-700">
                  Mode de paiement
                </span>
                <select
                  value={previewPaymentMethod}
                  onChange={(event) =>
                    setPreviewPaymentMethod(
                      event.target.value as Invoice["paymentMethod"],
                    )
                  }
                  className="h-12 w-full rounded-2xl border border-emerald-200 bg-white px-4 font-semibold text-slate-950 outline-none focus:border-emerald-500"
                >
                  <option>CB centre</option>
                  <option>Espèces</option>
                  <option>Virement</option>
                  <option>Stripe</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  onRegisterPayment(
                    invoice.id,
                    previewPaymentAmount,
                    previewPaymentMethod,
                  );
                }}
                disabled={previewPaymentAmount <= 0}
                className="self-end rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Ajouter le paiement
              </button>
            </div>
          </div>
        ) : null}

        {isPendingFinal ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-start">
            <button
              type="button"
              onClick={onCancelPending}
              className="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={onValidateFinal}
              className="rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
            >
              Valider la facture finale
            </button>
          </div>
        ) : invoice.type === "Devis" ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => onSaveQuote(invoice.id)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 font-semibold text-white transition hover:bg-amber-600"
            >
              <FileCheck2 className="h-5 w-5" />
              Enregistrer le devis
            </button>
            <button
              type="button"
              onClick={() => onDeleteQuote(invoice.id)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white transition hover:bg-rose-700"
            >
              <Trash2 className="h-5 w-5" />
              Supprimer le devis
            </button>
            <button
              type="button"
              onClick={() => onConvertQuote(invoice)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
            >
              <FilePlus2 className="h-5 w-5" />
              Convertir en facture
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 px-5 py-3 font-semibold text-slate-700"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={() => onDownload(invoice)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-semibold text-white"
            >
              <Download className="h-5 w-5" />
              Télécharger
            </button>
            <button
              type="button"
              onClick={() => onSend(invoice)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white"
            >
              <Mail className="h-5 w-5" />
              Envoyer par mail
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BillingMetric({
  title,
  value,
  detail,
  icon,
  color,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`mt-3 text-2xl font-semibold ${color}`}>{value}</p>
          <p className="mt-2 font-bold text-slate-500">{detail}</p>
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-50 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function InvoicePill({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function FormSelect({
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
    <label className="space-y-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-blue-500"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function buildInvoiceText(invoice: Invoice) {
  const lines = getInvoiceLines(invoice);
  const documentLabel = getBillingDocumentLabel(invoice.type);
  const amounts = calculateInvoiceAmounts(invoice);
  return [
    `${documentLabel} ${invoice.number}`,
    `Date : ${invoice.date}`,
    "",
    `Cliente : ${invoice.client}`,
    `Email : ${invoice.email}`,
    "",
    "Prestations :",
    ...lines.map((line) => {
      const lineDiscount = calculateLineDiscount(line);
      return `- ${line.label} x${line.quantity} : ${formatCurrency(
        calculateLineTotal(line),
      )} TTC${lineDiscount > 0 ? ` (remise prestation ${formatCurrency(lineDiscount)})` : ""} - TVA ${line.vatRate}%`;
    }),
    `Type : ${invoice.type}`,
    `Paiement : ${invoice.paymentMethod}`,
    "",
    `Sous-total TTC : ${formatCurrency(amounts.subtotal)}`,
    `Remises prestations : ${formatCurrency(amounts.lineDiscount)}`,
    `Remise globale : ${formatCurrency(amounts.discount)}`,
    `Total HT : ${formatCurrency(amounts.ht)}`,
    `TVA : ${formatCurrency(amounts.vat)}`,
    `Montant TTC : ${formatCurrency(invoice.total)}`,
    `Montant payé : ${formatCurrency(invoice.paid)}`,
    `Reste dû : ${formatCurrency(Math.max(invoice.total - invoice.paid, 0))}`,
    `Statut : ${invoice.status}`,
    "",
    `JFG Clinique Clermont - ${documentLabel} généré par Bookea`,
  ].join("\n");
}

function buildInvoiceHtml(invoice: Invoice) {
  const lines = getInvoiceLines(invoice);
  const documentLabel = getBillingDocumentLabel(invoice.type);
  const amounts = calculateInvoiceAmounts(invoice);
  const remaining = Math.max(invoice.total - invoice.paid, 0);
  const generatedAt = new Date().toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(invoice.number)} - ${escapeHtml(documentLabel)} Bookea</title>
  <style>
    :root {
      color: #0f172a;
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.45;
    }
    body {
      margin: 0;
      background: #f1f5f9;
      padding: 32px;
    }
    .invoice {
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #dbe4ef;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.10);
    }
    .top {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding: 36px;
      border-bottom: 1px solid #e2e8f0;
      background: linear-gradient(135deg, #f8fbff, #f5f3ff);
    }
    .brand {
      color: #2563eb;
      font-size: 30px;
      font-weight: 900;
      margin: 0;
    }
    .subtitle {
      color: #64748b;
      font-weight: 700;
      margin: 6px 0 0;
    }
    .number {
      text-align: right;
    }
    .number h1 {
      margin: 0;
      font-size: 34px;
      letter-spacing: -0.03em;
    }
    .pill {
      display: inline-block;
      margin-top: 10px;
      border-radius: 999px;
      background: #ecfdf5;
      color: #047857;
      padding: 7px 14px;
      font-weight: 900;
    }
    .section {
      padding: 28px 36px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }
    .box {
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      padding: 18px;
      background: #f8fafc;
    }
    .label {
      color: #64748b;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin: 0 0 10px;
    }
    .strong {
      font-size: 20px;
      font-weight: 900;
      margin: 0;
    }
    .muted {
      color: #64748b;
      font-weight: 700;
      margin: 4px 0 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      overflow: hidden;
      border-radius: 18px;
    }
    th {
      background: #eff6ff;
      color: #475569;
      font-size: 12px;
      text-align: left;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 14px;
    }
    td {
      border-bottom: 1px solid #e2e8f0;
      padding: 16px 14px;
      font-weight: 700;
      vertical-align: top;
    }
    .right {
      text-align: right;
    }
    .totals {
      width: min(390px, 100%);
      margin-left: auto;
      margin-top: 22px;
      border: 1px solid #dbeafe;
      border-radius: 18px;
      background: #eff6ff;
      padding: 16px;
    }
    .total-line {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      padding: 8px 0;
      color: #334155;
      font-weight: 800;
    }
    .grand-total {
      border-top: 1px solid #bfdbfe;
      margin-top: 8px;
      padding-top: 14px;
      color: #111827;
      font-size: 20px;
      font-weight: 900;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #64748b;
      font-size: 12px;
      font-weight: 700;
      padding: 22px 36px;
    }
    @media print {
      body {
        background: white;
        padding: 0;
      }
      .invoice {
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <article class="invoice">
    <header class="top">
      <div>
        <p class="brand">Bookea</p>
        <p class="subtitle">${escapeHtml(documentLabel)} généré pour JFG Clinique Clermont</p>
      </div>
      <div class="number">
        <h1>${escapeHtml(documentLabel)}</h1>
        <p class="strong">${escapeHtml(invoice.number)}</p>
        <p class="muted">Date : ${escapeHtml(invoice.date)}</p>
        <span class="pill">${escapeHtml(invoice.status)}</span>
      </div>
    </header>

    <section class="section grid">
      <div class="box">
        <p class="label">Émetteur</p>
        <p class="strong">JFG Clinique Clermont</p>
        <p class="muted">Facturation via Bookea</p>
      </div>
      <div class="box">
        <p class="label">Cliente</p>
        <p class="strong">${escapeHtml(invoice.client)}</p>
        <p class="muted">${escapeHtml(invoice.email)}</p>
      </div>
    </section>

    <section class="section">
      <p class="label">Détail</p>
      <table>
        <thead>
          <tr>
            <th>Prestation / produit</th>
            <th class="right">Qté</th>
            <th class="right">Prix unitaire TTC</th>
            <th class="right">TVA</th>
            <th class="right">Total TTC</th>
          </tr>
        </thead>
        <tbody>
          ${lines
            .map((line) => {
              const lineDiscount = calculateLineDiscount(line);
              return `<tr>
            <td>${escapeHtml(line.label)}<br /><span class="muted">${escapeHtml(
              invoice.type,
            )}</span>${
              lineDiscount > 0
                ? `<br /><span class="muted">Remise prestation : -${formatCurrency(
                    lineDiscount,
                  )}</span>`
                : ""
            }</td>
            <td class="right">${line.quantity}</td>
            <td class="right">${formatCurrency(line.unitPrice)}</td>
            <td class="right">${line.vatRate}%</td>
            <td class="right">${formatCurrency(calculateLineTotal(line))}</td>
          </tr>`;
            })
            .join("")}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-line"><span>Sous-total TTC</span><span>${formatCurrency(
          amounts.subtotal,
        )}</span></div>
        <div class="total-line"><span>Remises prestations</span><span>-${formatCurrency(
          amounts.lineDiscount,
        )}</span></div>
        <div class="total-line"><span>Remise globale</span><span>-${formatCurrency(
          amounts.discount,
        )}</span></div>
        <div class="total-line"><span>Total HT</span><span>${formatCurrency(
          amounts.ht,
        )}</span></div>
        <div class="total-line"><span>TVA</span><span>${formatCurrency(
          amounts.vat,
        )}</span></div>
        <div class="total-line grand-total"><span>Montant total TTC</span><span>${formatCurrency(
          invoice.total,
        )}</span></div>
        <div class="total-line"><span>Montant payé</span><span>${formatCurrency(
          invoice.paid,
        )}</span></div>
        <div class="total-line"><span>Reste dû</span><span>${formatCurrency(
          remaining,
        )}</span></div>
      </div>
    </section>

    <footer class="footer">
      <p>Document généré par Bookea le ${escapeHtml(generatedAt)}.</p>
      <p>Montants affichés en euros TTC. Numérotation chronologique : ${escapeHtml(
        invoice.number,
      )}. Mode de paiement : ${escapeHtml(invoice.paymentMethod)}.</p>
    </footer>
  </article>
</body>
</html>`;
}

function getBillingDocumentLabel(type: InvoiceType) {
  if (type === "Devis") {
    return "Devis";
  }
  if (type === "Avoir") {
    return "Avoir";
  }
  return "Facture";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getInvoiceLines(invoice: Invoice): InvoiceLine[] {
  return invoice.lines && invoice.lines.length > 0
    ? invoice.lines.map((line) => ({
        ...line,
        vatRate: line.vatRate ?? 20,
        discountType: line.discountType ?? "Aucune",
        discountValue: line.discountValue ?? 0,
      }))
    : [
        {
          id: `${invoice.id}-line`,
          label: invoice.care,
          quantity: 1,
          unitPrice: invoice.total,
          vatRate: 20,
          discountType: "Aucune",
          discountValue: 0,
        },
      ];
}

function calculateLineGross(line: InvoiceLine) {
  return Number(line.quantity || 0) * Number(line.unitPrice || 0);
}

function calculateLineDiscount(line: InvoiceLine) {
  return calculateDiscount(
    calculateLineGross(line),
    line.discountType ?? "Aucune",
    line.discountValue ?? 0,
  );
}

function calculateLineTotal(line: InvoiceLine) {
  return Math.max(calculateLineGross(line) - calculateLineDiscount(line), 0);
}

function calculateLineDiscountTotal(lines: InvoiceLine[]) {
  return lines.reduce((sum, line) => sum + calculateLineDiscount(line), 0);
}

function calculateSubtotal(lines: InvoiceLine[]) {
  return lines.reduce((sum, line) => sum + calculateLineTotal(line), 0);
}

function calculateDiscount(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number,
) {
  if (discountType === "%") {
    return Math.min(subtotal, subtotal * (Math.max(discountValue, 0) / 100));
  }
  if (discountType === "€") {
    return Math.min(subtotal, Math.max(discountValue, 0));
  }
  return 0;
}

function calculateVatTotal(lines: InvoiceLine[], discount = 0) {
  const subtotal = calculateSubtotal(lines);
  const discountRatio =
    subtotal > 0 ? Math.min(Math.max(discount, 0), subtotal) / subtotal : 0;

  return lines.reduce((sum, line) => {
    const lineTotal = calculateLineTotal(line);
    const discountedLineTotal = lineTotal * (1 - discountRatio);
    const rate = Math.max(Number(line.vatRate ?? 0), 0) / 100;
    const vatAmount =
      rate > 0
        ? discountedLineTotal - discountedLineTotal / (1 + rate)
        : 0;

    return sum + vatAmount;
  }, 0);
}

function calculateInvoiceAmounts(invoice: Invoice) {
  const lines = getInvoiceLines(invoice);
  const subtotal = calculateSubtotal(lines);
  const lineDiscount = calculateLineDiscountTotal(lines);
  const discount = calculateDiscount(
    subtotal,
    invoice.discountType ?? "Aucune",
    invoice.discountValue ?? 0,
  );
  const unsignedVat = calculateVatTotal(lines, discount);
  const vat = invoice.type === "Avoir" ? -Math.abs(unsignedVat) : unsignedVat;
  const ht = invoice.total - vat;

  return { lines, subtotal, lineDiscount, discount, vat, ht };
}

function toStoredBillingService(
  service: BillingService,
  index: number,
  existing?: CenterServiceSetting,
): CenterServiceSetting {
  return {
    id: existing?.id ?? (Number(service.id.replace(/\D/g, "")) || Date.now() + index),
    name: service.name,
    category: service.category,
    color: service.color || existing?.color || billingServiceColorFallback(index),
    price: service.price,
    onQuote: existing?.onQuote === true,
    vatRate: service.vatRate,
    duration: parseDurationMinutes(service.duration),
    depositEnabled: service.deposit > 0 || existing?.depositEnabled === true,
    depositAmount: service.deposit,
    visible: existing?.visible ?? true,
    topListed: existing?.topListed ?? false,
    cabins: existing?.cabins || "Toutes",
    practitioners: existing?.practitioners || "Toutes",
  };
}

function toStoredBillingProduct(
  product: BillingProduct,
  existing?: CenterProductSetting,
): CenterProductSetting {
  return {
    id: existing?.id ?? (Number(product.id.replace(/\D/g, "")) || Date.now()),
    name: product.name,
    category: product.category,
    price: product.price,
    vatRate: product.vatRate,
    stock: product.stock,
    sku: product.reference,
    visible: existing?.visible ?? true,
  };
}

function parseDurationMinutes(value: string) {
  const hours = value.match(/(\d+)\s*h/i);
  const minutes = value.match(/(\d+)\s*min/i);
  const numericValue = Number(value);

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue;
  }

  const parsedDuration =
    (hours ? Number(hours[1]) * 60 : 0) +
    (minutes ? Number(minutes[1]) : 0);

  return parsedDuration > 0 ? parsedDuration : 60;
}
