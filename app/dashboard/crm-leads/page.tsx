"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import CRMHeader from "@/components/crm/crm-header";
import DashboardCards from "@/components/crm/dashboard-cards";
import Filters, { ProspectFilters } from "@/components/crm/filters";
import KPIDashboard from "@/components/crm/kpi-dashboard";
import LeadDetails from "@/components/crm/lead-details";
import ProspectsTable from "@/components/crm/prospects-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { inactiveLeadStatuses, leadStatuses } from "@/lib/lead-statuses";
import {
  addDaysIso,
  matchesCrmQuickFilter,
  todayIso,
  type CrmQuickFilter,
} from "@/lib/crm-stats";
import {
  addCrmLeadActivity,
  createCrmLead,
  deleteCrmLeadActivity,
  loadCrmLeads,
  mergeCrmDuplicateLeads,
  updateCrmLeadAmount,
  updateCrmLeadDetails,
  updateCrmLeadReminder,
  updateCrmLeadStatus,
} from "@/lib/crm-supabase";
import { syncBirthdaySms } from "@/lib/send-sms";
import {
  APPOINTMENT_STATUS_UPDATED_EVENT,
  applyAppointmentStatusOverrides,
  readAppointmentStatusOverrides,
} from "@/lib/appointment-crm-sync";
import {
  findDuplicateLeadGroups,
  mergeDuplicateLeads,
  mergePublicBookingsIntoLeads,
  PUBLIC_BOOKINGS_UPDATED_EVENT,
  readPublicBookingsForCenter,
} from "@/lib/public-bookings";
import { Lead, LeadStatus } from "@/types/lead";

const emptyLeadForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  treatment: "",
  source: "Facebook" as Lead["source"],
  campaign: "",
  commercial: "Samantha",
  status: "Nouveau" as LeadStatus,
  dealAmount: 0,
  nextAction: "À contacter",
  reminderDate: "",
};

type CRMTab = "prospects" | "kpi";
type FicheBox = {
  top: number;
  left: number;
  width: number;
};

const FICHE_BOTTOM_GAP = 12;

function getLeadRow(leadId: string) {
  return document.querySelector(`[data-lead-id="${leadId}"]`);
}

function ficheMinHeight() {
  return Math.round(window.innerHeight * 0.62);
}

function ensureFicheHasRoom(row: Element) {
  if (!(row instanceof HTMLElement)) {
    return;
  }

  const minHeight = ficheMinHeight();
  const room =
    window.innerHeight - row.getBoundingClientRect().top - FICHE_BOTTOM_GAP;

  if (room >= minHeight) {
    return;
  }

  window.scrollBy({
    top:
      row.getBoundingClientRect().top -
      (window.innerHeight - minHeight - FICHE_BOTTOM_GAP),
    behavior: "auto",
  });
}

function measureFicheBox(column: HTMLElement, row: Element | null): FicheBox {
  const columnRect = column.getBoundingClientRect();
  const minHeight = ficheMinHeight();
  const maxTop = window.innerHeight - minHeight - FICHE_BOTTOM_GAP;
  const rowTop =
    row instanceof HTMLElement ? row.getBoundingClientRect().top : 12;

  return {
    top: Math.min(Math.max(rowTop, 8), Math.max(8, maxTop)),
    left: columnRect.left,
    width: columnRect.width,
  };
}
type QuickDateFilter = CrmQuickFilter;

const statusGroups: Partial<Record<LeadStatus, LeadStatus[]>> = {
  "À relancer": [
    "Nouveau",
    "Apl en abs",
    "SMS envoyé",
    "Mail envoyé",
    "À relancer",
  ],
  "RDV pris": ["RDV pris", "RDV confirmé", "Acompte reçu"],
  "Client converti": ["Client converti", "Vendu"],
  "Prospect perdu": inactiveLeadStatuses,
};

export default function CRMLeadsPage() {
  const [leadList, setLeadList] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [isLoadingCrm, setIsLoadingCrm] = useState(true);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [crmNotice, setCrmNotice] = useState<string | null>(null);
  const [isLeadDetailsOpen, setIsLeadDetailsOpen] = useState(false);
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const [isMergingDuplicates, setIsMergingDuplicates] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState(emptyLeadForm);
  const [activeTab, setActiveTab] = useState<CRMTab>("prospects");
  const [quickDateFilter, setQuickDateFilter] =
    useState<QuickDateFilter>("Tous");
  const centerNameRef = useRef("");
  const ficheRef = useRef<HTMLElement>(null);
  const ficheColumnRef = useRef<HTMLDivElement>(null);
  const [ficheBox, setFicheBox] = useState<FicheBox | null>(null);
  const [filters, setFilters] = useState<ProspectFilters>({
    search: "",
    source: "Tous",
    campaign: "Toutes",
    commercial: "Tous",
    status: "Tous",
    createdFrom: "",
    createdTo: "",
    updatedFrom: "",
    updatedTo: "",
  });
  const duplicateLeadGroups = useMemo(
    () => findDuplicateLeadGroups(leadList),
    [leadList]
  );

  async function refreshCrmLeads() {
    setCrmError(null);

    try {
      const { leads: loadedLeads, center } = await loadCrmLeads();
      centerNameRef.current = center.centerName;

      const nextLeads =
        loadedLeads.length > 0
          ? applyAppointmentStatusOverrides(
              mergePublicBookingsIntoLeads(
                loadedLeads,
                readPublicBookingsForCenter(center.centerName),
              ),
              readAppointmentStatusOverrides()
            )
          : [];

      setLeadList(nextLeads);
      setSelectedLeadId((currentId) => {
        if (nextLeads.some((lead) => lead.id === currentId)) {
          return currentId;
        }

        return nextLeads[0]?.id ?? "";
      });
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "Impossible de charger les prospects CRM."
      );
    } finally {
      setIsLoadingCrm(false);
    }
  }

  function scrollToLeadList() {
    window.setTimeout(() => {
      document
        .getElementById("crm-leads-results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCrmLeads();
  }, []);

  useEffect(() => {
    function syncPublicBookings() {
      setLeadList((currentLeads) => {
        const nextLeads = mergePublicBookingsIntoLeads(
          currentLeads,
          readPublicBookingsForCenter(centerNameRef.current),
        );

        return applyAppointmentStatusOverrides(
          nextLeads,
          readAppointmentStatusOverrides()
        );
      });
    }

    function syncAppointmentStatuses() {
      setLeadList((currentLeads) =>
        applyAppointmentStatusOverrides(
          currentLeads,
          readAppointmentStatusOverrides()
        )
      );
    }

    function refreshIfVisible() {
      if (document.visibilityState === "visible") {
        void refreshCrmLeads();
      }
    }

    window.addEventListener(PUBLIC_BOOKINGS_UPDATED_EVENT, syncPublicBookings);
    window.addEventListener(
      APPOINTMENT_STATUS_UPDATED_EVENT,
      syncAppointmentStatuses
    );
    window.addEventListener("storage", syncPublicBookings);
    window.addEventListener("focus", refreshCrmLeads);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.removeEventListener(
        PUBLIC_BOOKINGS_UPDATED_EVENT,
        syncPublicBookings
      );
      window.removeEventListener(
        APPOINTMENT_STATUS_UPDATED_EVENT,
        syncAppointmentStatuses
      );
      window.removeEventListener("storage", syncPublicBookings);
      window.removeEventListener("focus", refreshCrmLeads);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const status = searchParams.get("status");
    const quick = searchParams.get("quick");

    if (status && isLeadStatusFilter(status)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab("prospects");
      setQuickDateFilter("Tous");
      setFilters((currentFilters) => ({
        ...currentFilters,
        status,
      }));
    }

    if (quick && isQuickDateFilter(quick)) {
      setActiveTab("prospects");
      setQuickDateFilter(quick);
      setFilters((currentFilters) => ({
        ...currentFilters,
        status: "Tous",
      }));
    }
  }, []);

  const selectedLead =
    leadList.find((lead) => lead.id === selectedLeadId) ?? leadList[0];

  const filteredLeads = leadList.filter((lead) => {
    const search = filters.search.trim().toLowerCase();
    const fullName = `${lead.firstName} ${lead.lastName}`.toLowerCase();
    const matchesSearch =
      search.length === 0 ||
      fullName.includes(search) ||
      lead.phone.toLowerCase().includes(search) ||
      lead.email.toLowerCase().includes(search) ||
      lead.treatment.toLowerCase().includes(search);

    const matchesSource =
      filters.source === "Tous" || lead.source === filters.source;
    const matchesCommercial =
      filters.commercial === "Tous" || lead.commercial === filters.commercial;
    const selectedStatusGroup =
      filters.status === "Tous" ? null : statusGroups[filters.status];
    const matchesStatus =
      filters.status === "Tous" ||
      (selectedStatusGroup
        ? selectedStatusGroup.includes(lead.status)
        : lead.status === filters.status);
    const matchesCampaign =
      filters.campaign === "Toutes" || lead.campaign === filters.campaign;
    const matchesQuickDate = matchesCrmQuickFilter(lead, quickDateFilter);
    const matchesCreatedDate = isDateInRange(
      lead.createdDate,
      filters.createdFrom,
      filters.createdTo
    );
    const matchesUpdatedDate = isDateInRange(
      getLeadUpdatedDate(lead),
      filters.updatedFrom,
      filters.updatedTo
    );

    return (
      matchesSearch &&
      matchesSource &&
      matchesCommercial &&
      matchesStatus &&
      matchesCampaign &&
      matchesQuickDate &&
      matchesCreatedDate &&
      matchesUpdatedDate
    );
  });

  useLayoutEffect(() => {
    if (!isLeadDetailsOpen || !selectedLeadId) {
      setFicheBox(null);
      return;
    }

    const row = getLeadRow(selectedLeadId);

    if (row) {
      ensureFicheHasRoom(row);
    }

    function placeFiche() {
      const column = ficheColumnRef.current;
      const currentRow = getLeadRow(selectedLeadId);

      if (!column) {
        return;
      }

      setFicheBox(measureFicheBox(column, currentRow));
    }

    placeFiche();
    ficheRef.current?.scrollTo({ top: 0 });

    window.addEventListener("resize", placeFiche);
    window.addEventListener("scroll", placeFiche, true);

    return () => {
      window.removeEventListener("resize", placeFiche);
      window.removeEventListener("scroll", placeFiche, true);
    };
  }, [isLeadDetailsOpen, selectedLeadId]);

  useEffect(() => {
    const node = ficheRef.current;

    if (!node || !isLeadDetailsOpen) {
      return;
    }

    const panel: HTMLElement = node;

    function lockListScroll(event: WheelEvent) {
      const canScroll = panel.scrollHeight > panel.clientHeight + 1;

      if (!canScroll) {
        event.preventDefault();
        return;
      }

      const atTop = panel.scrollTop <= 0 && event.deltaY < 0;
      const atBottom =
        panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1 &&
        event.deltaY > 0;

      if (atTop || atBottom) {
        event.preventDefault();
      }
    }

    panel.addEventListener("wheel", lockListScroll, { passive: false });

    return () => {
      panel.removeEventListener("wheel", lockListScroll);
    };
  }, [ficheBox, isLeadDetailsOpen, selectedLeadId]);

  async function handleStatusChange(leadId: string, status: LeadStatus) {
    const leadBeforeUpdate = leadList.find((lead) => lead.id === leadId);

    setLeadList((currentLeads) =>
      currentLeads.map((lead) => {
        if (lead.id !== leadId || lead.status === status) {
          return lead;
        }

        return {
          ...lead,
          status,
          updatedDate: todayIso(),
          activityLog: [
            {
              id: crypto.randomUUID(),
              author: "Samantha",
              date: formatActivityDate(),
              text: `Statut changé : ${lead.status} → ${status}.`,
              type: "status",
              occurredAt: new Date().toISOString(),
            },
            ...lead.activityLog,
          ],
        };
      })
    );

    if (!leadBeforeUpdate) {
      return;
    }

    try {
      await updateCrmLeadStatus(leadBeforeUpdate, status);
      setCrmNotice(
        ["Vendu", "Client converti"].includes(status)
          ? "Statut enregistré et fiche client synchronisée."
          : "Statut enregistré."
      );
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "Le statut n'a pas pu être enregistré."
      );
      await refreshCrmLeads();
    }
  }

  async function handleAddActivity(leadId: string, text: string) {
    setLeadList((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              updatedDate: todayIso(),
              latestComment: text,
              activityLog: [
                {
                  id: crypto.randomUUID(),
                  author: "Samantha",
                  date: formatActivityDate(),
                  text,
                  type: "comment",
                },
                ...lead.activityLog,
              ],
            }
          : lead
      )
    );

    try {
      await addCrmLeadActivity(leadId, text);
      setCrmNotice(text.startsWith("SMS envoyé") ? "SMS envoyé." : "Commentaire enregistré.");
      await refreshCrmLeads();
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "Le commentaire n'a pas pu être enregistré."
      );
      await refreshCrmLeads();
    }
  }

  function handleQuickComment(leadId: string, text: string) {
    const comment = text.trim();

    if (!comment) {
      return;
    }

    handleAddActivity(leadId, comment);
  }

  async function handleDeleteActivity(leadId: string, activityId: string) {
    setLeadList((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              updatedDate: todayIso(),
              activityLog: lead.activityLog.filter(
                (activity) => activity.id !== activityId
              ),
            }
          : lead
      )
    );

    try {
      await deleteCrmLeadActivity(activityId);
      setCrmNotice("Activité supprimée.");
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "L'activité n'a pas pu être supprimée."
      );
      await refreshCrmLeads();
    }
  }

  async function handleDealAmountChange(leadId: string, amount: number) {
    setLeadList((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === leadId
          ? { ...lead, dealAmount: amount, updatedDate: todayIso() }
          : lead
      )
    );

    try {
      await updateCrmLeadAmount(leadId, amount);
      setCrmNotice("Montant enregistré.");
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "Le montant n'a pas pu être enregistré."
      );
      await refreshCrmLeads();
    }
  }

  async function handleReminderDateChange(leadId: string, reminderDate: string) {
    setLeadList((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              reminderDate: reminderDate || undefined,
              updatedDate: todayIso(),
            }
          : lead
      )
    );

    try {
      await updateCrmLeadReminder(leadId, reminderDate);
      setCrmNotice("Rappel enregistré.");
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "La date de rappel n'a pas pu être enregistrée."
      );
      await refreshCrmLeads();
    }
  }

  function handleCommercialChange(leadId: string, commercial: string) {
    setLeadList((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === leadId
          ? { ...lead, commercial, updatedDate: todayIso() }
          : lead
      )
    );
  }

  async function handleUpdateLead(
    leadId: string,
    patch: {
      firstName: string;
      lastName: string;
      phone: string;
      email: string;
      birthDate: string;
      gender: string;
      address: string;
      postalCode: string;
      city: string;
      source: Lead["source"];
      campaign: string;
      treatment: string;
      commercial: string;
      status: LeadStatus;
      dealAmount: string;
      reminderDate: string;
      nextAction: string;
    }
  ) {
    const leadBeforeUpdate = leadList.find((lead) => lead.id === leadId);

    if (!leadBeforeUpdate) {
      return;
    }

    const dealAmount = Number(patch.dealAmount || 0);
    const nextStatus = patch.status;
    const statusChanged = leadBeforeUpdate.status !== nextStatus;

    setLeadList((currentLeads) =>
      currentLeads.map((lead) => {
        if (lead.id !== leadId) {
          return lead;
        }

        return {
          ...lead,
          firstName: patch.firstName,
          lastName: patch.lastName,
          phone: patch.phone,
          email: patch.email,
          birthDate: patch.birthDate,
          gender: patch.gender,
          address: patch.address,
          postalCode: patch.postalCode,
          city: patch.city,
          source: patch.source,
          campaign: patch.campaign,
          treatment: patch.treatment,
          commercial: patch.commercial,
          status: nextStatus,
          dealAmount: Number.isFinite(dealAmount) ? dealAmount : lead.dealAmount,
          reminderDate: patch.reminderDate || undefined,
          nextAction: patch.nextAction,
          updatedDate: todayIso(),
          activityLog: statusChanged
            ? [
                {
                  id: crypto.randomUUID(),
                  author: "Samantha",
                  date: formatActivityDate(),
                  text: `Statut changé : ${lead.status} → ${nextStatus}.`,
                  type: "status" as const,
                  occurredAt: new Date().toISOString(),
                },
                ...lead.activityLog,
              ]
            : lead.activityLog,
        };
      })
    );

    try {
      await updateCrmLeadDetails(leadBeforeUpdate, {
        firstName: patch.firstName,
        lastName: patch.lastName,
        phone: patch.phone,
        email: patch.email,
        birthDate: patch.birthDate,
        gender: patch.gender,
        address: patch.address,
        postalCode: patch.postalCode,
        city: patch.city,
        treatment: patch.treatment,
        source: patch.source,
        campaign: patch.campaign,
        commercial: patch.commercial,
        status: nextStatus,
        dealAmount: Number.isFinite(dealAmount) ? dealAmount : leadBeforeUpdate.dealAmount,
        nextAction: patch.nextAction,
        reminderDate: patch.reminderDate,
      });
      if (patch.phone) {
        void syncBirthdaySms({
          birthDate: patch.birthDate,
          phone: patch.phone,
          firstName: patch.firstName,
          lastName: patch.lastName,
          enabled: Boolean(patch.birthDate),
        }).catch(() => null);
      }
      setCrmNotice("Fiche prospect enregistrée.");
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "La fiche n'a pas pu être enregistrée."
      );
      await refreshCrmLeads();
    }
  }

  async function handleMergeDuplicate(group: Lead[]) {
    const primaryLead = group[0];
    const duplicateLeads = group.slice(1);

    if (!primaryLead || duplicateLeads.length === 0 || isMergingDuplicates) {
      return;
    }

    setIsMergingDuplicates(true);
    setCrmError(null);
    setCrmNotice(null);

    try {
      await mergeCrmDuplicateLeads(
        primaryLead.id,
        duplicateLeads.map((lead) => lead.id),
      );

      setLeadList((currentLeads) =>
        duplicateLeads.reduce(
          (leads, duplicateLead) =>
            mergeDuplicateLeads(leads, primaryLead.id, duplicateLead.id),
          currentLeads,
        ),
      );
      setSelectedLeadId(primaryLead.id);
      setCrmNotice(
        `${duplicateLeads.length + 1} fiches fusionnées vers ${primaryLead.firstName} ${primaryLead.lastName}.`,
      );
      await refreshCrmLeads();
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "Les fiches n'ont pas pu être fusionnées.",
      );
      await refreshCrmLeads();
    } finally {
      setIsMergingDuplicates(false);
    }
  }

  function openNewLeadModal() {
    setNewLeadForm(emptyLeadForm);
    setIsNewLeadOpen(true);
  }

  async function handleNewLeadSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const optimisticLead: Lead = {
      id: crypto.randomUUID(),
      firstName: newLeadForm.firstName.trim(),
      lastName: newLeadForm.lastName.trim(),
      phone: newLeadForm.phone.trim(),
      email: newLeadForm.email.trim(),
      treatment: newLeadForm.treatment.trim(),
      source: newLeadForm.source,
      campaign: newLeadForm.campaign,
      commercial: newLeadForm.commercial,
      status: newLeadForm.status,
      dealAmount: newLeadForm.dealAmount,
      createdAt: `Aujourd'hui ${new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      createdDate: new Date().toISOString().slice(0, 10),
      updatedDate: new Date().toISOString().slice(0, 10),
      nextAction: newLeadForm.nextAction.trim() || "À contacter",
      reminderDate: newLeadForm.reminderDate || undefined,
      activityLog: [
        {
          id: crypto.randomUUID(),
          author: "Système",
          date: formatActivityDate(),
          text: `Lead créé avec le statut ${newLeadForm.status}.`,
          type: "system",
        },
      ],
    };

    setLeadList((currentLeads) => [optimisticLead, ...currentLeads]);
    setSelectedLeadId(optimisticLead.id);
    setIsNewLeadOpen(false);

    try {
      const createdLead = await createCrmLead({
        firstName: newLeadForm.firstName,
        lastName: newLeadForm.lastName,
        phone: newLeadForm.phone,
        email: newLeadForm.email,
        treatment: newLeadForm.treatment,
        source: newLeadForm.source,
        campaign: newLeadForm.campaign,
        commercial: newLeadForm.commercial,
        status: newLeadForm.status,
        dealAmount: newLeadForm.dealAmount,
        nextAction: newLeadForm.nextAction,
        reminderDate: newLeadForm.reminderDate || undefined,
      });

      setLeadList((currentLeads) => [
        createdLead,
        ...currentLeads.filter((lead) => lead.id !== optimisticLead.id),
      ]);
      setSelectedLeadId(createdLead.id);
      setCrmNotice("Prospect créé.");
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "Le prospect n'a pas pu être créé."
      );
      setLeadList((currentLeads) =>
        currentLeads.filter((lead) => lead.id !== optimisticLead.id)
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-100" data-sidebar-collapse-area="true">
      <div className="w-full space-y-6 px-2 py-4 lg:px-2 lg:pt-5 lg:pb-3">
        <CRMHeader onNewLead={openNewLeadModal} />

        <section className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase text-blue-700">
                CRM connecté
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Les prospects, statuts, rappels, montants et commentaires sont
                maintenant synchronisés avec la base Bookea.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={refreshCrmLeads}
              disabled={isLoadingCrm}
            >
              {isLoadingCrm ? "Chargement..." : "Rafraîchir"}
            </Button>
          </div>

          {crmError ? (
            <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {crmError}
            </p>
          ) : null}

          {crmNotice ? (
            <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              {crmNotice}
            </p>
          ) : null}
        </section>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
          <CRMTabButton
            active={activeTab === "prospects"}
            onClick={() => setActiveTab("prospects")}
          >
            Prospects
          </CRMTabButton>
          <CRMTabButton
            active={activeTab === "kpi"}
            onClick={() => setActiveTab("kpi")}
          >
            KPI
          </CRMTabButton>
        </div>

        {activeTab === "prospects" ? (
          <>
            <DashboardCards
              leads={leadList}
              activeStatus={filters.status}
              activeQuickFilter={quickDateFilter}
              onQuickFilter={(quickFilter) => {
                setQuickDateFilter(quickFilter);
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  status: "Tous",
                }));
                scrollToLeadList();
              }}
              onStatusFilter={(status) => {
                setQuickDateFilter("Tous");
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  status,
                }));
                scrollToLeadList();
              }}
            />

            <Filters
              filters={filters}
              onFiltersChange={setFilters}
              onNewLead={openNewLeadModal}
            />

            {isLoadingCrm ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="text-lg font-black text-slate-950">
                  Chargement du CRM...
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Bookea récupère les prospects du centre.
                </p>
              </div>
            ) : leadList.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="text-lg font-black text-slate-950">
                  Aucun prospect pour le moment
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Créez le premier prospect pour tester le CRM en conditions
                  réelles.
                </p>
                <Button type="button" className="mt-5" onClick={openNewLeadModal}>
                  Ajouter un prospect
                </Button>
              </div>
            ) : (
              <>
            {duplicateLeadGroups.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-slate-900 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase text-amber-700">
                      Doublons potentiels
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      Même téléphone, même email ou même nom/prénom détecté.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {duplicateLeadGroups[0].map((lead, index) => (
                      <span
                        key={lead.id}
                        className="rounded-full bg-white px-3 py-2 text-sm font-bold text-slate-700"
                      >
                        {index + 1}. {lead.firstName} {lead.lastName}
                      </span>
                    ))}
                    <Button
                      type="button"
                      disabled={isMergingDuplicates}
                      onClick={() => handleMergeDuplicate(duplicateLeadGroups[0])}
                    >
                      {isMergingDuplicates
                        ? "Fusion en cours..."
                        : "Fusionner vers la fiche 1"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div
              id="crm-leads-results"
              className={
                isLeadDetailsOpen
                  ? "grid grid-cols-[minmax(0,1fr)_24rem] items-start gap-3"
                  : ""
              }
            >
              <section className="min-w-0">
                <ProspectsTable
                  leads={filteredLeads}
                  selectedLead={selectedLead}
                  isLeadDetailsOpen={isLeadDetailsOpen}
                  onSelectLead={(lead) => {
                    if (isLeadDetailsOpen && selectedLeadId === lead.id) {
                      setIsLeadDetailsOpen(false);
                      return;
                    }

                    setSelectedLeadId(lead.id);
                    setIsLeadDetailsOpen(true);
                  }}
                  onStatusChange={handleStatusChange}
                  onCommentAdd={handleQuickComment}
                  onCommentDelete={handleDeleteActivity}
                  onDealAmountChange={handleDealAmountChange}
                  onReminderDateChange={handleReminderDateChange}
                  onCommercialChange={handleCommercialChange}
                />
              </section>

              {isLeadDetailsOpen && (
              <div ref={ficheColumnRef} className="relative min-h-[50vh] min-w-0">
                <aside
                  ref={ficheRef}
                  className="z-30 overflow-y-auto overscroll-contain"
                  style={
                    ficheBox
                      ? {
                          position: "fixed",
                          top: ficheBox.top,
                          left: ficheBox.left,
                          width: ficheBox.width,
                          bottom: FICHE_BOTTOM_GAP,
                        }
                      : undefined
                  }
                >
                  <LeadDetails
                    lead={selectedLead}
                    onAddActivity={handleAddActivity}
                    onDeleteActivity={handleDeleteActivity}
                    onUpdateLead={handleUpdateLead}
                    onClose={() => setIsLeadDetailsOpen(false)}
                  />
                </aside>
              </div>
              )}
            </div>
              </>
            )}
          </>
        ) : (
          <KPIDashboard leads={leadList} />
        )}
      </div>

      {isNewLeadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-sm">
          <form
            onSubmit={handleNewLeadSubmit}
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-950">
                Nouveau prospect
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Ajoutez un lead dans Bookea. Il apparaîtra directement dans la
                liste.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Prénom">
                <Input
                  required
                  value={newLeadForm.firstName}
                  onChange={(event) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      firstName: event.target.value,
                    }))
                  }
                />
              </FormField>

              <FormField label="Nom">
                <Input
                  required
                  value={newLeadForm.lastName}
                  onChange={(event) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      lastName: event.target.value,
                    }))
                  }
                />
              </FormField>

              <FormField label="Téléphone">
                <Input
                  required
                  value={newLeadForm.phone}
                  onChange={(event) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      phone: event.target.value,
                    }))
                  }
                />
              </FormField>

              <FormField label="Email">
                <Input
                  type="email"
                  value={newLeadForm.email}
                  onChange={(event) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      email: event.target.value,
                    }))
                  }
                />
              </FormField>

              <FormField label="Soin demandé">
                <Input
                  required
                  value={newLeadForm.treatment}
                  onChange={(event) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      treatment: event.target.value,
                    }))
                  }
                />
              </FormField>

              <FormField label="Prochaine action">
                <Input
                  value={newLeadForm.nextAction}
                  onChange={(event) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      nextAction: event.target.value,
                    }))
                  }
                />
              </FormField>

              <FormField label="Date de rappel">
                <Input
                  type="date"
                  value={newLeadForm.reminderDate}
                  onChange={(event) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      reminderDate: event.target.value,
                    }))
                  }
                />
              </FormField>

              <FormField label="Source">
                <Select
                  value={newLeadForm.source}
                  onChange={(value) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      source: value as Lead["source"],
                    }))
                  }
                  options={[
                    "Facebook",
                    "Instagram",
                    "Google",
                    "Site Web",
                    "Organique",
                  ]}
                />
              </FormField>

              <FormField label="Campagne">
                <Input
                  value={newLeadForm.campaign}
                  placeholder="Nom de la campagne"
                  onChange={(event) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      campaign: event.target.value,
                    }))
                  }
                />
              </FormField>

              <FormField label="Commercial">
                <Select
                  value={newLeadForm.commercial}
                  onChange={(value) =>
                    setNewLeadForm((form) => ({ ...form, commercial: value }))
                  }
                  options={["Samantha", "Thomas", "Camille"]}
                />
              </FormField>

              <FormField label="Statut">
                <Select
                  value={newLeadForm.status}
                  onChange={(value) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      status: value as LeadStatus,
                    }))
                  }
                  options={leadStatuses}
                />
              </FormField>

              <FormField label="Montant de la cure (€)">
                <Input
                  min="0"
                  placeholder="0"
                  type="number"
                  value={newLeadForm.dealAmount || ""}
                  onChange={(event) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      dealAmount: Number(event.target.value),
                    }))
                  }
                />
              </FormField>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewLeadOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit">Ajouter le prospect</Button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function CRMTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
        active
          ? "border-violet-600 text-violet-700"
          : "border-transparent text-slate-500 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-lg border border-input bg-white px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function isLeadStatusFilter(value: string): value is ProspectFilters["status"] {
  return value === "Tous" || leadStatuses.includes(value as LeadStatus);
}

function isQuickDateFilter(value: string): value is QuickDateFilter {
  return (
    value === "Tous" ||
    value === "Aujourd'hui" ||
    value === "Hier" ||
    value === "7 derniers jours" ||
    value === "Ce mois" ||
    value === "RDV aujourd'hui" ||
    value === "RDV hier" ||
    value === "RDV 7 jours"
  );
}

function formatActivityDate() {
  return `Aujourd'hui ${new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function isDateInRange(date: string, startDate: string, endDate: string) {
  if (!startDate && !endDate) {
    return true;
  }

  if (startDate && date < startDate) {
    return false;
  }

  if (endDate && date > endDate) {
    return false;
  }

  return true;
}

function getLeadUpdatedDate(lead: Lead) {
  if (lead.updatedDate) {
    return lead.updatedDate;
  }

  const latestActivityDate = lead.activityLog
    .map((activity) => activityDateToIso(activity.date))
    .find(Boolean);

  return latestActivityDate ?? lead.createdDate;
}

function activityDateToIso(date: string) {
  const normalizedDate = date.toLowerCase();

  if (normalizedDate.includes("aujourd")) {
    return todayIso();
  }

  if (normalizedDate.includes("hier")) {
    return addDaysIso(todayIso(), -1);
  }

  const shortDateMatch = date.match(/^(\d{1,2})\/(\d{1,2})/);

  if (!shortDateMatch) {
    return null;
  }

  const [, day, month] = shortDateMatch;
  const year = new Date().getFullYear();

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
