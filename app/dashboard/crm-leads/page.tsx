"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import CRMHeader from "@/components/crm/crm-header";
import DashboardCards from "@/components/crm/dashboard-cards";
import Filters, {
  defaultProspectFilters,
  ProspectFilters,
} from "@/components/crm/filters";
import KPIDashboard from "@/components/crm/kpi-dashboard";
import LeadDetails from "@/components/crm/lead-details";
import ProspectsTable from "@/components/crm/prospects-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { readActiveCenterId, saveActiveCenterId } from "@/lib/center-access";
import { importPelissanneOctoberLeads } from "@/lib/pelissanne-october-import";
import { followUpLeadStatuses, inactiveLeadStatuses, leadStatuses } from "@/lib/lead-statuses";
import { matchesPersonSearch } from "@/lib/person-search";
import {
  addDaysIso,
  matchesCrmQuickFilter,
  rdvBookedStatusList,
  reminderDateAfterStatusChange,
  todayIso,
  type CrmQuickFilter,
} from "@/lib/crm-stats";
import {
  addCrmLeadActivity,
  createCrmLead,
  deleteCrmLeadComment,
  loadBookedCrmLeads,
  loadCrmLeads,
  loadCrmWhatsAppThreads,
  mergeCrmDuplicateLeads,
  readCrmLeadsSnapshot,
  saveCrmLeadsSnapshot,
  setCrmLeadImportOrigin,
  updateCrmLeadAmount,
  updateCrmLeadDepositReminder,
  updateCrmLeadCommercial,
  updateCrmLeadDetails,
  updateCrmLeadReminder,
  updateCrmLeadStatus,
  updateCrmLeadVisitDate,
} from "@/lib/crm-supabase";
import {
  practitionerLabel,
  practitionerNamesMatch,
} from "@/lib/lead-practitioner";
import {
  compareBookedLeads,
  displayVisitDate,
  isEverBookedLead,
  leadWithVisitDate,
} from "@/lib/crm-rdv";
import {
  fromDatetimeLocalValue,
  isDepositManagedLead,
  matchesDepositPhaseFilter,
  type DepositPhaseFilter,
  type DepositReminderIndex,
} from "@/lib/crm-deposit";
import { syncBirthdaySms } from "@/lib/send-sms";
import {
  APPOINTMENT_STATUS_UPDATED_EVENT,
  applyAppointmentStatusOverrides,
  readAppointmentStatusOverrides,
} from "@/lib/appointment-crm-sync";
import {
  duplicateLeadGroupKey,
  findDuplicateLeadGroups,
  leadsAreSureDuplicates,
  mergeDuplicateLeads,
  mergePublicBookingsIntoLeads,
  PUBLIC_BOOKINGS_UPDATED_EVENT,
  readPublicBookingsForCenter,
} from "@/lib/public-bookings";
import {
  getSourceNames,
  readCenterSettings,
} from "@/lib/center-settings";
import {
  commercialNamesFromTeam,
  commercialSelectOptions,
  loadTeamPlanning,
} from "@/lib/team-planning";
import { SEYA_CONVERSATIONS_UPDATED_EVENT } from "@/lib/seya-settings";
import { leadWhatsAppSummaries, type WhatsAppThread } from "@/lib/lead-whatsapp";
import { Lead, LeadStatus } from "@/types/lead";

const emptyLeadForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  treatment: "",
  source: "Facebook" as Lead["source"],
  campaign: "",
  commercial: "Équipe",
  status: "Nouveau" as LeadStatus,
  dealAmount: 0,
  nextAction: "À contacter",
  reminderDate: "",
};

type CRMTab = "prospects" | "booked" | "imports" | "deposits" | "kpi";
type KpiScope = "campaigns" | "imports";
type FicheBox = {
  top: number;
  left: number;
  width: number;
};

const FICHE_BOTTOM_GAP = 12;
const CATEGORY_KEEP_SELECTOR = [
  "[data-lead-fiche]",
  "[data-lead-row]",
  "[data-lead-form]",
  "table",
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "[role='button']",
  "[role='listbox']",
  "[role='option']",
  "[role='dialog']",
  "[role='alert']",
  "[contenteditable='true']",
].join(",");
const CRM_DISMISSED_DUPLICATES_KEY = "bookea-crm-dismissed-duplicates";

function readDismissedDuplicateKeys() {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CRM_DISMISSED_DUPLICATES_KEY) || "[]"
    );
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

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
  "À relancer": followUpLeadStatuses,
  "RDV pris": rdvBookedStatusList,
  "Client converti": ["Client converti", "Vendu"],
  "Prospect perdu": [...inactiveLeadStatuses, "Annulation"],
};

function leadMatchesStatusFilter(leadStatus: LeadStatus, filter: LeadStatus) {
  const group = statusGroups[filter];
  return group ? group.includes(leadStatus) : leadStatus === filter;
}

export default function CRMLeadsPage() {
  const [initialSnapshot] = useState(readCrmLeadsSnapshot);
  const [leadList, setLeadList] = useState<Lead[]>(
    () => initialSnapshot?.leads ?? [],
  );
  const [selectedLeadId, setSelectedLeadId] = useState(
    () => initialSnapshot?.leads[0]?.id ?? "",
  );
  const [isLoadingCrm, setIsLoadingCrm] = useState(!initialSnapshot);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [crmNotice, setCrmNotice] = useState<string | null>(null);
  const [statusSaveError, setStatusSaveError] = useState<string | null>(null);
  const [isLeadDetailsOpen, setIsLeadDetailsOpen] = useState(false);
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const [isMergingDuplicates, setIsMergingDuplicates] = useState(false);
  const [dismissedDuplicateKeys, setDismissedDuplicateKeys] = useState<string[]>(
    []
  );
  const [newLeadForm, setNewLeadForm] = useState(emptyLeadForm);
  const [activeTab, setActiveTab] = useState<CRMTab>("prospects");
  const [bookedLeads, setBookedLeads] = useState<Lead[] | null>(null);
  const [bookedCenterId, setBookedCenterId] = useState("");
  const [bookedLoading, setBookedLoading] = useState(false);
  const [bookedError, setBookedError] = useState<string | null>(null);
  const bookedRequestRef = useRef(0);
  const [depositPhaseFilter, setDepositPhaseFilter] =
    useState<DepositPhaseFilter>("Tous");
  const [kpiScope, setKpiScope] = useState<KpiScope>("campaigns");
  const [quickDateFilter, setQuickDateFilter] =
    useState<QuickDateFilter>("Tous");
  const centerNameRef = useRef(initialSnapshot?.centerName ?? "");
  const centerIdRef = useRef(initialSnapshot?.centerId ?? "");
  const [leadsCenterId, setLeadsCenterId] = useState(
    initialSnapshot?.centerId ?? "",
  );
  const [whatsAppThreads, setWhatsAppThreads] = useState<{
    centerId: string;
    threads: WhatsAppThread[];
  } | null>(null);
  const [whatsAppLoadFailed, setWhatsAppLoadFailed] = useState(false);
  const whatsAppSeqRef = useRef(0);
  const refreshesInFlightRef = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const ficheRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const ficheColumnRef = useRef<HTMLDivElement>(null);
  const [ficheBox, setFicheBox] = useState<FicheBox | null>(null);
  const openedLeadFromQuery = useRef(false);
  const listImportRan = useRef(false);
  const [filters, setFilters] = useState<ProspectFilters>(defaultProspectFilters);
  const [commercialNames, setCommercialNames] = useState<string[]>([]);
  const commercialOptions = useMemo(
    () => commercialSelectOptions(commercialNames),
    [commercialNames],
  );
  const duplicateLeadGroups = useMemo(
    () => findDuplicateLeadGroups(leadList),
    [leadList]
  );
  const visibleDuplicateGroups = useMemo(
    () =>
      duplicateLeadGroups.filter(
        (group) =>
          !dismissedDuplicateKeys.includes(duplicateLeadGroupKey(group))
      ),
    [dismissedDuplicateKeys, duplicateLeadGroups]
  );

  const editSeqRef = useRef(0);
  const pendingSavesRef = useRef(0);
  const refreshAfterSavesRef = useRef(false);

  async function trackSave<T>(save: () => Promise<T>) {
    editSeqRef.current += 1;
    pendingSavesRef.current += 1;
    try {
      return await save();
    } finally {
      pendingSavesRef.current -= 1;
      editSeqRef.current += 1;
      if (pendingSavesRef.current === 0 && refreshAfterSavesRef.current) {
        refreshAfterSavesRef.current = false;
        void refreshCrmLeads();
      }
    }
  }

  async function refreshCrmLeads() {
    setCrmError(null);
    const editSeqAtStart = editSeqRef.current;
    refreshesInFlightRef.current += 1;
    lastRefreshAtRef.current = Date.now();
    void refreshWhatsAppThreads();

    try {
      const { leads: loadedLeads, center } = await loadCrmLeads();
      if (center.centerId !== centerIdRef.current) {
        setBookedLeads(null);
        setBookedCenterId("");
      }
      centerNameRef.current = center.centerName;
      centerIdRef.current = center.centerId;

      // Une liste lue avant une modification de l’équipe écraserait le statut ou le commentaire saisi.
      if (pendingSavesRef.current > 0) {
        refreshAfterSavesRef.current = true;
        return;
      }
      if (editSeqRef.current !== editSeqAtStart) {
        void refreshCrmLeads();
        return;
      }

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
      setLeadsCenterId(center.centerId);
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
      refreshesInFlightRef.current -= 1;
      setIsLoadingCrm(false);
    }
  }

  async function refreshWhatsAppThreads() {
    const seq = ++whatsAppSeqRef.current;
    try {
      const result = await loadCrmWhatsAppThreads();
      if (seq !== whatsAppSeqRef.current) {
        return;
      }
      setWhatsAppThreads(result);
      setWhatsAppLoadFailed(false);
    } catch {
      if (seq === whatsAppSeqRef.current) {
        setWhatsAppLoadFailed(true);
      }
    }
  }

  function refreshOnReturn() {
    // Retour sur l’onglet : focus et visibilitychange arrivent ensemble.
    if (
      refreshesInFlightRef.current > 0 ||
      Date.now() - lastRefreshAtRef.current < 2000
    ) {
      return;
    }
    void refreshCrmLeads();
  }

  useEffect(() => {
    if (!centerIdRef.current) {
      return;
    }
    saveCrmLeadsSnapshot({
      centerId: centerIdRef.current,
      centerName: centerNameRef.current,
      leads: leadList,
    });
  }, [leadList]);

  function scrollToLeadList() {
    window.setTimeout(() => {
      document
        .getElementById("crm-leads-results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  useEffect(() => {
    // Lien « Consulter le prospect » : ouvre le centre du prospect (ignoré si le compte n’y a pas accès).
    const linkedCenterId = String(
      new URLSearchParams(window.location.search).get("center") || "",
    ).trim();
    if (linkedCenterId && linkedCenterId !== readActiveCenterId()) {
      saveActiveCenterId(linkedCenterId);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCrmLeads();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadTeamPlanning()
      .then((team) => {
        if (cancelled || !team?.practitioners?.length) {
          return;
        }
        setCommercialNames(commercialNamesFromTeam(team.practitioners));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDismissedDuplicateKeys(readDismissedDuplicateKeys());
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
        refreshOnReturn();
      }
    }

    window.addEventListener(PUBLIC_BOOKINGS_UPDATED_EVENT, syncPublicBookings);
    window.addEventListener(
      APPOINTMENT_STATUS_UPDATED_EVENT,
      syncAppointmentStatuses
    );
    window.addEventListener("storage", syncPublicBookings);
    window.addEventListener(
      SEYA_CONVERSATIONS_UPDATED_EVENT,
      refreshWhatsAppThreads,
    );
    window.addEventListener("focus", refreshOnReturn);
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
      window.removeEventListener(
        SEYA_CONVERSATIONS_UPDATED_EVENT,
        refreshWhatsAppThreads,
      );
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const status = searchParams.get("status");
    const quick = searchParams.get("quick");
    if (searchParams.get("importListe") === "octobre" && !listImportRan.current) {
      listImportRan.current = true;
      setCrmNotice("Import Pélissanne en cours…");
      void importPelissanneOctoberLeads()
        .then((result) => {
          setCrmNotice(
            `Import Pélissanne : ${result.created} créés, ${result.skipped} déjà là${
              result.errors.length ? `, ${result.errors.length} erreur(s)` : ""
            }.`,
          );
          if (result.created > 0) {
            void loadCrmLeads().then(({ leads, centerId, centerName }) => {
              centerIdRef.current = centerId;
              centerNameRef.current = centerName;
              setLeadsCenterId(centerId);
              setLeadList(leads);
              saveCrmLeadsSnapshot({ leads, centerId, centerName });
            });
          }
        })
        .catch((error) => {
          setCrmError(error instanceof Error ? error.message : "Import impossible.");
        });
    }

    if (searchParams.get("tab") === "imports") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab("imports");
    }

    if (status && isLeadStatusFilter(status)) {
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

  useEffect(() => {
    if (openedLeadFromQuery.current || leadList.length === 0) {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const leadId = String(searchParams.get("lead") || "").trim();
    const phone = String(searchParams.get("phone") || "").replace(/\D/g, "");
    const match =
      (leadId && leadList.find((item) => item.id === leadId)) ||
      (phone &&
        leadList.find((item) => {
          const digits = String(item.phone || "").replace(/\D/g, "");
          return (
            Boolean(digits) &&
            (digits === phone || digits.endsWith(phone) || phone.endsWith(digits))
          );
        }));

    if (!match) {
      return;
    }

    openedLeadFromQuery.current = true;
    setActiveTab(match.imported ? "imports" : "prospects");
    setSelectedLeadId(match.id);
    setIsLeadDetailsOpen(true);
  }, [leadList]);

  const campaignLeads = useMemo(
    () => leadList.filter((lead) => !lead.imported),
    [leadList],
  );
  const importedLeads = useMemo(
    () => leadList.filter((lead) => lead.imported),
    [leadList],
  );
  const depositLeads = useMemo(
    () => leadList.filter((lead) => isDepositManagedLead(lead)),
    [leadList],
  );
  const importCandidates = useMemo(
    () => campaignLeads.filter((lead) => lead.importCandidate),
    [campaignLeads],
  );
  const scopeLeads =
    activeTab === "imports"
      ? importedLeads
      : activeTab === "deposits"
        ? depositLeads
        : campaignLeads;
  const selectedLead =
    scopeLeads.find((lead) => lead.id === selectedLeadId) ??
    scopeLeads[0] ??
    leadList[0];
  const centerWhatsAppThreads =
    whatsAppThreads && whatsAppThreads.centerId === leadsCenterId
      ? whatsAppThreads.threads
      : null;
  const whatsAppByLead = useMemo(
    () =>
      centerWhatsAppThreads
        ? leadWhatsAppSummaries(leadList, centerWhatsAppThreads)
        : new Map(),
    [leadList, centerWhatsAppThreads],
  );
  const isRecontactCategory =
    filters.status === "À relancer" || filters.statuses.includes("À relancer");
  const whatsAppState = centerWhatsAppThreads
    ? "ready"
    : whatsAppLoadFailed
      ? "error"
      : "loading";

  useEffect(() => {
    if (!isRecontactCategory) {
      return;
    }
    // Seya envoie aussi depuis le serveur : on relit les messages tant que la catégorie est ouverte.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshWhatsAppThreads();
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [isRecontactCategory]);
  const newLeadSourceOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...getSourceNames(readCenterSettings()),
          "Facebook",
          "Instagram",
          "Google",
          "Site Web",
          "Organique",
          newLeadForm.source,
        ]),
      ).filter(Boolean),
    [newLeadForm.source],
  );
  const newLeadCampaignOptions = useMemo(
    () =>
      Array.from(
        new Set(
          leadList
            .map((lead) => lead.campaign.trim())
            .filter(
              (campaign) => campaign && campaign.toLowerCase() !== "crm manuel",
            ),
        ),
      ),
    [leadList],
  );

  const filterSourceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            "Facebook",
            "Instagram",
            "Google",
            "Site Web",
            "Organique",
            ...leadList.map((lead) => lead.source.trim()),
          ].filter(Boolean),
        ),
      ),
    [leadList],
  );
  const filterCampaignOptions = useMemo(
    () =>
      Array.from(
        new Set(leadList.map((lead) => lead.campaign.trim()).filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right, "fr")),
    [leadList],
  );

  const tablePageResetKey = JSON.stringify([
    activeTab,
    quickDateFilter,
    depositPhaseFilter,
    { ...filters, sortBy: undefined },
  ]);

  const filteredLeads = scopeLeads.filter((lead) => {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch =
      search.length === 0 ||
      matchesPersonSearch(search, lead.firstName, lead.lastName) ||
      lead.phone.toLowerCase().includes(search) ||
      lead.email.toLowerCase().includes(search) ||
      lead.treatment.toLowerCase().includes(search);

    const matchesSource =
      filters.sources.length === 0 ||
      filters.sources.includes(lead.source.trim());
    const matchesCommercial =
      filters.commercials.length === 0 ||
      filters.commercials.includes(lead.commercial.trim());
    const matchesStatus =
      (filters.status === "Tous" ||
        leadMatchesStatusFilter(lead.status, filters.status)) &&
      (filters.statuses.length === 0 ||
        filters.statuses.some((status) =>
          leadMatchesStatusFilter(lead.status, status),
        ));
    const matchesCampaign =
      filters.campaigns.length === 0 ||
      filters.campaigns.includes(lead.campaign.trim());
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
    const matchesDepositPhase =
      activeTab !== "deposits" ||
      matchesDepositPhaseFilter(lead, depositPhaseFilter);

    return (
      matchesSearch &&
      matchesSource &&
      matchesCommercial &&
      matchesStatus &&
      matchesCampaign &&
      matchesQuickDate &&
      matchesCreatedDate &&
      matchesUpdatedDate &&
      matchesDepositPhase
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

  useEffect(() => {
    if (!isLeadDetailsOpen) {
      return;
    }

    function closeFicheOnEmptySpace(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (
        target.closest("[data-lead-fiche]") ||
        target.closest("[data-lead-row]") ||
        target.closest("[data-lead-form]") ||
        target.closest("button") ||
        target.closest("a") ||
        target.closest("input") ||
        target.closest("select") ||
        target.closest("textarea") ||
        target.closest("label") ||
        target.closest("[role='button']")
      ) {
        return;
      }

      setIsLeadDetailsOpen(false);
    }

    document.addEventListener("pointerdown", closeFicheOnEmptySpace);
    return () => {
      document.removeEventListener("pointerdown", closeFicheOnEmptySpace);
    };
  }, [isLeadDetailsOpen]);

  const isCategorySelected =
    filters.status !== "Tous" || quickDateFilter !== "Tous";

  useEffect(() => {
    if (!isCategorySelected || activeTab === "kpi" || isNewLeadOpen) {
      return;
    }

    let pressedTarget: EventTarget | null = null;

    function rememberPressedTarget(event: PointerEvent) {
      pressedTarget = event.target;
    }

    // « click » plutôt que « pointerdown » : faire défiler au doigt ne doit pas vider la catégorie.
    function clearCategoryOnEmptySpace(event: MouseEvent) {
      const target = event.target;

      if (
        event.button !== 0 ||
        target !== pressedTarget ||
        !(target instanceof HTMLElement) ||
        !mainRef.current?.contains(target) ||
        target.closest(CATEGORY_KEEP_SELECTOR)
      ) {
        return;
      }

      // Clic sur la barre de défilement d’un bloc : ce n’est pas une zone vide.
      if (
        event.offsetX > target.clientWidth ||
        event.offsetY > target.clientHeight
      ) {
        return;
      }

      setQuickDateFilter("Tous");
      setFilters((currentFilters) =>
        currentFilters.status === "Tous"
          ? currentFilters
          : { ...currentFilters, status: "Tous" },
      );
    }

    document.addEventListener("pointerdown", rememberPressedTarget);
    document.addEventListener("click", clearCategoryOnEmptySpace);
    return () => {
      document.removeEventListener("pointerdown", rememberPressedTarget);
      document.removeEventListener("click", clearCategoryOnEmptySpace);
    };
  }, [isCategorySelected, activeTab, isNewLeadOpen]);

  async function handleStatusChange(leadId: string, status: LeadStatus) {
    const leadBeforeUpdate = leadList.find((lead) => lead.id === leadId);

    setLeadList((currentLeads) =>
      currentLeads.map((lead) => {
        if (lead.id !== leadId || lead.status === status) {
          return lead;
        }

        const nextReminder = reminderDateAfterStatusChange(
          lead.reminderDate,
          lead.reminderDate,
        );

        return {
          ...lead,
          status,
          reminderDate: nextReminder,
          depositTracked:
            lead.depositTracked ||
            status === "Acompte envoyé" ||
            status === "Acompte en attente" ||
            status === "Acompte reçu" ||
            lead.status === "Acompte envoyé" ||
            lead.status === "Acompte en attente" ||
            lead.status === "Acompte reçu"
              ? true
              : lead.depositTracked,
          activityLog: [
            {
              id: crypto.randomUUID(),
              author: practitionerLabel(lead.commercial),
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
      await trackSave(() => updateCrmLeadStatus(leadBeforeUpdate, status));
      setStatusSaveError(null);
      setCrmNotice(
        ["Vendu", "Client converti"].includes(status)
          ? "Statut enregistré et fiche client synchronisée."
          : "Statut enregistré."
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Le statut n'a pas pu être enregistré.";
      setCrmNotice(null);
      // Le rechargement efface crmError : l’erreur est posée après.
      await refreshCrmLeads();
      setCrmError(message);
      setStatusSaveError(
        `Échec de l'enregistrement du statut « ${status} » pour ${leadBeforeUpdate.firstName} ${leadBeforeUpdate.lastName}`.trim() +
          ` : ${message}`,
      );
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
      await trackSave(() => addCrmLeadActivity(leadId, text));
      setCrmNotice(text.startsWith("SMS envoyé") ? "SMS envoyé." : "Commentaire enregistré.");
      await refreshCrmLeads();
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Le commentaire n'a pas pu être enregistré.";
      setCrmNotice(null);
      await refreshCrmLeads();
      setCrmError(message);
      setStatusSaveError(`Commentaire non enregistré : ${message}`);
      return false;
    }
  }

  async function handleImportOrigin(leadIds: string[], imported: boolean) {
    const ids = new Set(leadIds);
    setLeadList((currentLeads) =>
      currentLeads.map((lead) =>
        ids.has(lead.id)
          ? { ...lead, imported, importCandidate: undefined }
          : lead
      )
    );

    try {
      await trackSave(async () => {
        for (const leadId of leadIds) {
          await setCrmLeadImportOrigin(leadId, imported);
        }
      });
      setCrmNotice(
        imported
          ? `${leadIds.length} prospect${leadIds.length > 1 ? "s" : ""} classé${leadIds.length > 1 ? "s" : ""} dans CRM Imports.`
          : `${leadIds.length} prospect${leadIds.length > 1 ? "s" : ""} laissé${leadIds.length > 1 ? "s" : ""} dans CRM Leads.`
      );
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "Le classement n'a pas pu être enregistré."
      );
      await refreshCrmLeads();
    }
  }

  async function handleQuickComment(leadId: string, text: string) {
    const comment = text.trim();

    if (!comment) {
      return true;
    }

    return handleAddActivity(leadId, comment);
  }

  async function handleDeleteActivity(leadId: string, activityId: string) {
    setLeadList((currentLeads) =>
      currentLeads.map((lead) => {
        if (lead.id !== leadId) {
          return lead;
        }
        const activityLog = lead.activityLog.filter(
          (activity) => activity.id !== activityId
        );
        return {
          ...lead,
          updatedDate: todayIso(),
          activityLog,
          latestComment:
            activityLog.find(
              (activity) => activity.type === "comment" && activity.text.trim()
            )?.text ?? "",
        };
      })
    );

    try {
      await trackSave(() => deleteCrmLeadComment(leadId, activityId));
      setCrmNotice("Activité supprimée.");
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "L'activité n'a pas pu être supprimée.";
      setCrmNotice(null);
      await refreshCrmLeads();
      setCrmError(message);
      setStatusSaveError(`Commentaire non supprimé : ${message}`);
      return false;
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
      await trackSave(() => updateCrmLeadAmount(leadId, amount));
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

  async function refreshBookedLeads() {
    const request = bookedRequestRef.current + 1;
    bookedRequestRef.current = request;
    setBookedLoading(true);
    setBookedError(null);
    try {
      const loaded = await loadBookedCrmLeads();
      if (
        bookedRequestRef.current === request &&
        loaded.centerId === centerIdRef.current
      ) {
        setBookedLeads(loaded.leads);
        setBookedCenterId(loaded.centerId);
      }
    } catch (error) {
      if (bookedRequestRef.current === request) {
        setBookedError(
          error instanceof Error
            ? error.message
            : "Les rendez-vous n'ont pas pu être chargés.",
        );
      }
    } finally {
      if (bookedRequestRef.current === request) {
        setBookedLoading(false);
      }
    }
  }

  useEffect(() => {
    if (
      activeTab !== "booked" ||
      (bookedLeads && bookedCenterId === leadsCenterId)
    ) {
      return;
    }
    void refreshBookedLeads();
  }, [activeTab, bookedLeads, bookedCenterId, leadsCenterId]);

  function patchVisitDate(leadId: string, date: string) {
    setLeadList((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === leadId ? leadWithVisitDate(lead, date) : lead,
      ),
    );
    setBookedLeads((currentLeads) => {
      if (!currentLeads) {
        return currentLeads;
      }
      const known =
        currentLeads.find((lead) => lead.id === leadId) ||
        leadList.find((lead) => lead.id === leadId);
      const next = known
        ? currentLeads.some((lead) => lead.id === leadId)
          ? currentLeads.map((lead) =>
              lead.id === leadId ? leadWithVisitDate(lead, date) : lead,
            )
          : [...currentLeads, leadWithVisitDate(known, date)]
        : currentLeads.map((lead) =>
            lead.id === leadId ? leadWithVisitDate(lead, date) : lead,
          );
      return next.filter(isEverBookedLead).sort(compareBookedLeads);
    });
  }

  async function handleVisitDateChange(leadId: string, date: string) {
    const current =
      leadList.find((lead) => lead.id === leadId) ||
      bookedLeads?.find((lead) => lead.id === leadId);
    patchVisitDate(leadId, date);
    try {
      await trackSave(() =>
        updateCrmLeadVisitDate(
          leadId,
          date,
          current ? displayVisitDate(current) : "",
          current?.appointments,
        ),
      );
      setCrmNotice("Date du rendez-vous enregistrée.");
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "La date du rendez-vous n'a pas pu être enregistrée.",
      );
      await refreshCrmLeads();
      if (bookedLeads) {
        await refreshBookedLeads();
      }
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
      await trackSave(() => updateCrmLeadReminder(leadId, reminderDate));
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

  async function handleDepositReminderChange(
    leadId: string,
    index: DepositReminderIndex,
    datetimeLocal: string,
    comment = "",
  ) {
    const isoDatetime = fromDatetimeLocalValue(datetimeLocal);
    const note = comment.trim().slice(0, 500);
    setLeadList((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === leadId
          ? {
              ...lead,
              depositTracked: true,
              depositReminders: {
                ...(lead.depositReminders || {}),
                [index]: isoDatetime,
              },
              depositReminderNotes: {
                ...(lead.depositReminderNotes || {}),
                [index]: note,
              },
              updatedDate: todayIso(),
            }
          : lead,
      ),
    );

    try {
      await trackSave(() =>
        updateCrmLeadDepositReminder(leadId, index, isoDatetime, note),
      );
      setCrmNotice(`Relance acompte ${index} enregistrée.`);
    } catch (error) {
      setCrmError(
        error instanceof Error
          ? error.message
          : "La relance acompte n'a pas pu être enregistrée.",
      );
      await refreshCrmLeads();
    }
  }

  function handleCommercialChange(leadId: string, commercial: string) {
    const lead = leadList.find((item) => item.id === leadId);
    setLeadList((currentLeads) =>
      currentLeads.map((item) =>
        item.id === leadId
          ? { ...item, commercial, updatedDate: todayIso() }
          : item
      )
    );
    if (!lead) {
      return;
    }
    void trackSave(() => updateCrmLeadCommercial(lead, commercial)).catch((error) => {
      setCrmError(
        error instanceof Error
          ? error.message
          : "La praticienne n'a pas pu être enregistrée.",
      );
      void refreshCrmLeads();
    });
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
    const commercialChanged = !practitionerNamesMatch(
      patch.commercial,
      leadBeforeUpdate.commercial,
    );
    const nextCommercial = commercialChanged
      ? patch.commercial
      : leadBeforeUpdate.commercial;
    const nextReminder = statusChanged
      ? reminderDateAfterStatusChange(
          leadBeforeUpdate.reminderDate,
          patch.reminderDate,
        )
      : patch.reminderDate || undefined;

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
          commercial: commercialChanged ? patch.commercial : lead.commercial,
          status: nextStatus,
          dealAmount: Number.isFinite(dealAmount) ? dealAmount : lead.dealAmount,
          reminderDate: nextReminder,
          nextAction: patch.nextAction,
          updatedDate: statusChanged ? lead.updatedDate : todayIso(),
          activityLog: statusChanged
            ? [
                {
                  id: crypto.randomUUID(),
                  author: practitionerLabel(nextCommercial),
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
      await trackSave(() => updateCrmLeadDetails(leadBeforeUpdate, {
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
        commercial: nextCommercial,
        status: nextStatus,
        dealAmount: Number.isFinite(dealAmount) ? dealAmount : leadBeforeUpdate.dealAmount,
        nextAction: patch.nextAction,
        reminderDate: nextReminder || "",
      }));
      if (patch.phone) {
        void syncBirthdaySms({
          birthDate: patch.birthDate,
          phone: patch.phone,
          firstName: patch.firstName,
          lastName: patch.lastName,
          enabled: Boolean(patch.birthDate),
        }).catch(() => null);
      }
      if (statusChanged) {
        setStatusSaveError(null);
      }
      setCrmNotice("Fiche prospect enregistrée.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "La fiche n'a pas pu être enregistrée.";
      setCrmNotice(null);
      await refreshCrmLeads();
      setCrmError(message);
      if (statusChanged) {
        setStatusSaveError(
          `Échec de l'enregistrement du statut « ${nextStatus} » pour ${leadBeforeUpdate.firstName} ${leadBeforeUpdate.lastName}`.trim() +
            ` : ${message}`,
        );
      }
      throw error;
    }
  }

  async function handleMergeDuplicate(group: Lead[]) {
    const primaryLead = group[0];
    const duplicateLeads = group.slice(1);

    if (!primaryLead || duplicateLeads.length === 0 || isMergingDuplicates) {
      return;
    }

    if (!leadsAreSureDuplicates(group)) {
      setCrmError(
        "Fusion refusée : ces fiches n'ont pas le même téléphone ni le même email."
      );
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

  function handleDismissDuplicate(group: Lead[]) {
    const key = duplicateLeadGroupKey(group);

    setDismissedDuplicateKeys((current) => {
      if (current.includes(key)) {
        return current;
      }

      const next = [...current, key];

      try {
        window.localStorage.setItem(
          CRM_DISMISSED_DUPLICATES_KEY,
          JSON.stringify(next)
        );
      } catch {
        // ignore quota / private mode
      }

      return next;
    });
  }

  function openNewLeadModal() {
    setNewLeadForm({
      ...emptyLeadForm,
      commercial: commercialNames[0] || "Équipe",
    });
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
      source: newLeadForm.source.trim(),
      campaign: newLeadForm.campaign.trim(),
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
        source: newLeadForm.source.trim(),
        campaign: newLeadForm.campaign.trim(),
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
    <main
      ref={mainRef}
      className="min-h-screen bg-slate-100"
      data-sidebar-collapse-area="true"
    >
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
            onClick={() => {
              setActiveTab("prospects");
              setIsLeadDetailsOpen(false);
            }}
          >
            Prospects
          </CRMTabButton>
          <CRMTabButton
            active={activeTab === "imports"}
            onClick={() => {
              setActiveTab("imports");
              setIsLeadDetailsOpen(false);
            }}
          >
            CRM Imports
            {importedLeads.length > 0 ? ` (${importedLeads.length})` : ""}
          </CRMTabButton>
          <CRMTabButton
            active={activeTab === "deposits"}
            onClick={() => {
              setActiveTab("deposits");
              setIsLeadDetailsOpen(false);
            }}
          >
            Gestion des acomptes
            {depositLeads.length > 0 ? ` (${depositLeads.length})` : ""}
          </CRMTabButton>
          <CRMTabButton
            active={activeTab === "kpi"}
            onClick={() => setActiveTab("kpi")}
          >
            KPI
          </CRMTabButton>
        </div>

        {activeTab === "prospects" && importCandidates.length > 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {importCandidates.length} prospect{importCandidates.length > 1 ? "s" : ""} ressemble{importCandidates.length > 1 ? "nt" : ""} à d’anciens imports, sans origine d’import enregistrée.{" "}
            <button
              type="button"
              className="font-black underline"
              onClick={() => {
                setActiveTab("imports");
                setIsLeadDetailsOpen(false);
              }}
            >
              Les vérifier dans CRM Imports
            </button>
          </p>
        ) : null}

        {activeTab === "imports" && importCandidates.length > 0 ? (
          <ImportCandidatesPanel
            leads={importCandidates}
            onClassify={handleImportOrigin}
          />
        ) : null}

        {activeTab === "prospects" ||
        activeTab === "imports" ||
        activeTab === "deposits" ? (
          <>
            <DashboardCards
              leads={scopeLeads}
              activeStatus={filters.status}
              activeQuickFilter={quickDateFilter}
              onQuickFilter={(quickFilter) => {
                const sameCategory =
                  quickDateFilter === quickFilter && filters.status === "Tous";
                setQuickDateFilter(quickFilter);
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  status: "Tous",
                  search: sameCategory ? currentFilters.search : "",
                }));
                scrollToLeadList();
              }}
              onStatusFilter={(status) => {
                const sameCategory =
                  filters.status === status && quickDateFilter === "Tous";
                setQuickDateFilter("Tous");
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  status,
                  search: sameCategory ? currentFilters.search : "",
                }));
                scrollToLeadList();
              }}
            />

            <Filters
              filters={filters}
              commercialOptions={commercialNames}
              sourceOptions={filterSourceOptions}
              campaignOptions={filterCampaignOptions}
              onFiltersChange={(nextFilters) => {
                setFilters((currentFilters) => {
                  const resolved =
                    typeof nextFilters === "function"
                      ? nextFilters(currentFilters)
                      : nextFilters;
                  if (resolved.status === currentFilters.status) {
                    return resolved;
                  }
                  return { ...resolved, search: "" };
                });
              }}
              onReset={() => setQuickDateFilter("Tous")}
              onNewLead={openNewLeadModal}
            />

            {activeTab === "deposits" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-slate-600">
                  Phase acompte
                </span>
                {(
                  [
                    "Tous",
                    "En attente",
                    "Reçus",
                  ] as DepositPhaseFilter[]
                ).map((phase) => (
                  <button
                    key={phase}
                    type="button"
                    onClick={() => setDepositPhaseFilter(phase)}
                    className={
                      depositPhaseFilter === phase
                        ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
                        : "rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-slate-300"
                    }
                  >
                    {phase}
                  </button>
                ))}
              </div>
            ) : null}

            {isLoadingCrm ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="text-lg font-black text-slate-950">
                  Chargement du CRM...
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Bookea récupère les prospects du centre.
                </p>
              </div>
            ) : activeTab === "imports" && importedLeads.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="text-lg font-black text-slate-950">
                  Aucun prospect importé pour le moment
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Les prospects ajoutés par import de fichier apparaîtront ici,
                  séparés des prospects des campagnes.
                </p>
              </div>
            ) : activeTab === "deposits" && depositLeads.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="text-lg font-black text-slate-950">
                  Aucun acompte à suivre
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Les prospects passés en « Acompte envoyé » apparaissent ici
                  automatiquement, sans doublon avec le CRM.
                </p>
              </div>
            ) : scopeLeads.length === 0 ? (
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
            {visibleDuplicateGroups.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-slate-900 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase text-amber-700">
                      Doublons confirmés
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">
                      Même téléphone ou même email, même si les prestations
                      diffèrent. La fusion garde les infos des deux fiches.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {visibleDuplicateGroups[0].map((lead, index) => (
                      <span
                        key={lead.id}
                        className="rounded-full bg-white px-3 py-2 text-sm font-bold text-slate-700"
                      >
                        {index + 1}. {lead.firstName} {lead.lastName}
                        {lead.treatment ? ` · ${lead.treatment}` : ""}
                        {lead.campaign && lead.campaign !== lead.treatment
                          ? ` · ${lead.campaign}`
                          : ""}
                        {lead.createdAt ? ` · ${lead.createdAt}` : ""}
                      </span>
                    ))}
                    <Button
                      type="button"
                      disabled={isMergingDuplicates}
                      onClick={() =>
                        handleMergeDuplicate(visibleDuplicateGroups[0])
                      }
                    >
                      {isMergingDuplicates
                        ? "Fusion en cours..."
                        : "Fusionner vers la fiche 1"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isMergingDuplicates}
                      onClick={() =>
                        handleDismissDuplicate(visibleDuplicateGroups[0])
                      }
                    >
                      Non merci
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
                  sortBy={filters.sortBy}
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
                  commercialOptions={commercialOptions}
                  showDepositReminders={activeTab === "deposits"}
                  onDepositReminderChange={handleDepositReminderChange}
                  showVisitDate={activeTab === "prospects"}
                  onVisitDateChange={handleVisitDateChange}
                  whatsApp={
                    isRecontactCategory
                      ? { state: whatsAppState, byLead: whatsAppByLead }
                      : undefined
                  }
                  resetKey={tablePageResetKey}
                />
              </section>

              {isLeadDetailsOpen && (
              <div ref={ficheColumnRef} className="relative min-h-[50vh] min-w-0">
                <aside
                  ref={ficheRef}
                  data-lead-fiche="true"
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
                    commercialOptions={commercialOptions}
                    whatsAppMessages={
                      whatsAppState === "ready"
                        ? whatsAppByLead.get(selectedLead.id)?.messages ?? []
                        : whatsAppState
                    }
                  />
                </aside>
              </div>
              )}
            </div>
              </>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {(
                [
                  ["campaigns", "Campagnes"],
                  ["imports", "Imports"],
                ] as const
              ).map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setKpiScope(scope)}
                  className={
                    kpiScope === scope
                      ? "rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-bold text-white"
                      : "rounded-lg px-3 py-1.5 text-sm font-bold text-slate-500 hover:text-slate-900"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <KPIDashboard
              key={kpiScope}
              leads={kpiScope === "imports" ? importedLeads : campaignLeads}
            />
          </div>
        )}
      </div>

      {isNewLeadOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-sm"
          data-lead-form="true"
        >
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
                      source: value,
                    }))
                  }
                  options={newLeadSourceOptions}
                />
              </FormField>

              <FormField label="Campagne">
                <Input
                  value={newLeadForm.campaign}
                  placeholder="Nom de la campagne"
                  list="new-lead-campaigns"
                  onChange={(event) =>
                    setNewLeadForm((form) => ({
                      ...form,
                      campaign: event.target.value,
                    }))
                  }
                />
                <datalist id="new-lead-campaigns">
                  {newLeadCampaignOptions.map((campaign) => (
                    <option key={campaign} value={campaign} />
                  ))}
                </datalist>
              </FormField>

              <FormField label="Commercial">
                <Select
                  value={newLeadForm.commercial}
                  onChange={(value) =>
                    setNewLeadForm((form) => ({ ...form, commercial: value }))
                  }
                  options={commercialSelectOptions(
                    commercialNames,
                    newLeadForm.commercial,
                  )}
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

      {statusSaveError ? (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[300] flex max-w-sm items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 shadow-xl"
        >
          <p className="flex-1">{statusSaveError}</p>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setStatusSaveError(null)}
            className="shrink-0 text-rose-500 hover:text-rose-700"
          >
            ×
          </button>
        </div>
      ) : null}
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

function ImportCandidatesPanel({
  leads,
  onClassify,
}: {
  leads: Lead[];
  onClassify: (leadIds: string[], imported: boolean) => void;
}) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-slate-900 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase text-amber-700">
            À vérifier avant classement
          </p>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-600">
            Ces prospects ressemblent à d’anciens imports, mais aucune origine
            d’import n’a été enregistrée pour eux. Ils restent dans CRM Leads
            tant que vous ne les avez pas classés.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => onClassify(leads.map((lead) => lead.id), true)}
        >
          Tout classer dans Imports ({leads.length})
        </Button>
      </div>
      <ul className="mt-3 max-h-72 divide-y divide-amber-100 overflow-y-auto rounded-xl bg-white">
        {leads.map((lead) => (
          <li
            key={lead.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <span className="font-bold text-slate-900">
                {lead.firstName} {lead.lastName}
              </span>
              <span className="text-slate-500">
                {lead.phone ? ` · ${lead.phone}` : ""} · reçu le {lead.createdAt}
                {lead.campaign ? ` · ${lead.campaign}` : ""}
              </span>
              <span className="block text-xs font-semibold text-amber-700">
                {lead.importCandidate}
              </span>
            </span>
            <span className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => onClassify([lead.id], true)}
              >
                Classer dans Imports
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onClassify([lead.id], false)}
              >
                Laisser dans Leads
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
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
    value === "RDV 7 jours" ||
    value === "Acompte reçu aujourd'hui"
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
