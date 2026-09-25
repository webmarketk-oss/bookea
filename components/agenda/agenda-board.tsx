"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cabins, practitioners } from "@/lib/agenda-data";
import {
  createCrmAppointment,
  deleteCrmAppointment,
  loadCrmAppointments,
  persistCrmAppointment,
} from "@/lib/agenda-supabase";
import { issueAppointmentConfirmationUrl } from "@/lib/appointment-confirmation";
import { markPastAppointmentsPresent } from "@/lib/appointment-presence";
import {
  emptyClientBalanceDueIndex,
  getPaymentTone,
  loadClientBalanceDueIndex,
  paymentToneStyles,
} from "@/lib/client-balance";
import {
  loadCrmAgendaContacts,
  type CrmAgendaContact,
} from "@/lib/crm-supabase";
import { saveAppointmentStatusOverride } from "@/lib/appointment-crm-sync";
import { sendAppointmentConfirmationEmail } from "@/lib/send-mailing";
import {
  cancelAppointmentSmsJobs,
  rescheduleAppointmentSmsJobs,
  scheduleAppointmentReminderSms,
  sendBookeaSms,
  sendSavedTemplateSms,
  syncBirthdaySms,
} from "@/lib/send-sms";
import {
  addCenterService,
  defaultCenterDepositLinks,
  getCenterServices,
  readCenterSettings,
  type CenterDepositLinkSetting,
  type CenterServiceSetting,
} from "@/lib/center-settings";
import {
  formatSmsDate,
  isLaserTreatment,
  loadCenterSmsSettings,
  reminderFlagsFromSettings,
  splitPersonName,
  type AppointmentReminderKind,
  type CenterSmsSettings,
} from "@/lib/sms-settings";
import {
  getPublicBookingIdFromAppointment,
  mergePublicBookingsIntoAppointments,
  PUBLIC_BOOKINGS_UPDATED_EVENT,
  readPublicBookingsForCenter,
  removePublicBooking,
} from "@/lib/public-bookings";
import { getActiveCenterContext } from "@/lib/center-access";
import { loadCenterHours, saveCenterHours } from "@/lib/center-hours";
import {
  dayHoursForSchedule,
  defaultTeamSchedules,
  emptyTeamSchedule,
  isPractitionerWorkingOnDate,
  loadTeamPlanning,
  practitionerColorOptions,
  saveTeamPlanning,
  teamAbsenceTypes,
  type TeamAbsence,
  type TeamAbsenceType,
  type TeamSchedule,
} from "@/lib/team-planning";
import {
  Appointment,
  AppointmentKind,
  AppointmentSource,
  AppointmentStatus,
  Cabin,
  Practitioner,
} from "@/types/agenda";
import {
  Bot,
  CalendarClock,
  CalendarDays,
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Grip,
  Minus,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";

const timeOptions = createTimeSlots(7, 19, 15);
const SLOT_ROW_HEIGHT_REM = 1.85;
const TIME_COLUMN_PX = 92;
const CABIN_COLUMN_MIN_PX = 260;

const cabinPalette = [
  {
    color: "from-blue-500 to-cyan-400",
    softColor: "bg-blue-50 text-blue-700 border-blue-100",
  },
  {
    color: "from-violet-500 to-fuchsia-400",
    softColor: "bg-violet-50 text-violet-700 border-violet-100",
  },
  {
    color: "from-emerald-500 to-teal-400",
    softColor: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  {
    color: "from-amber-500 to-orange-400",
    softColor: "bg-amber-50 text-amber-700 border-amber-100",
  },
  {
    color: "from-rose-500 to-pink-400",
    softColor: "bg-rose-50 text-rose-700 border-rose-100",
  },
];

const appointmentDurationOptions = [
  "15",
  "30",
  "45",
  "60",
  "75",
  "90",
  "105",
  "120",
  "720",
];
const appointmentDurationLabels: Record<string, string> = {
  "15": "15 min",
  "30": "30 min",
  "45": "45 min",
  "60": "1 h",
  "75": "1 h 15",
  "90": "1 h 30",
  "105": "1 h 45",
  "120": "2 h",
  "720": "Toute la journée",
};

const emptyAppointment = {
  personName: "",
  phone: "",
  email: "",
  treatment: "",
  practitionerId: "samantha",
  cabinId: "cabine-1",
  date: todayIso(),
  start: "09:00",
  duration: 60,
  status: "Confirmé" as AppointmentStatus,
  source: "Client" as AppointmentSource,
  kind: "Rendez-vous" as AppointmentKind,
  notes: "",
  birthDate: "",
};

const statusClasses: Record<AppointmentStatus, string> = {
  Confirmé: "border-blue-100 bg-blue-50 text-blue-800",
  "À confirmer": "border-amber-100 bg-amber-50 text-amber-800",
  "En cours": "border-violet-100 bg-violet-50 text-violet-800",
  Terminé: "border-emerald-100 bg-emerald-50 text-emerald-800",
  "No show": "border-red-100 bg-red-50 text-red-800",
  Présent: "border-emerald-100 bg-emerald-50 text-emerald-800",
  Annulation: "border-orange-100 bg-orange-50 text-orange-800",
  "Pas venu pas prévenu": "border-red-100 bg-red-50 text-red-800",
  Devis: "border-cyan-100 bg-cyan-50 text-cyan-800",
  Vendu: "border-lime-100 bg-lime-50 text-lime-800",
  "Devis vendu": "border-lime-100 bg-lime-50 text-lime-800",
};

const appointmentStatusOptions: AppointmentStatus[] = [
  "Confirmé",
  "À confirmer",
  "Présent",
  "Annulation",
  "Pas venu pas prévenu",
  "Devis",
  "Vendu",
  "En cours",
  "Terminé",
  "No show",
];

const statusDotClasses: Record<AppointmentStatus, string> = {
  Confirmé: "bg-emerald-500",
  "À confirmer": "bg-amber-500",
  "En cours": "bg-violet-500",
  Terminé: "bg-emerald-600",
  "No show": "bg-red-600",
  Présent: "bg-emerald-500",
  Annulation: "bg-orange-500",
  "Pas venu pas prévenu": "bg-red-600",
  Devis: "bg-cyan-500",
  Vendu: "bg-lime-500",
  "Devis vendu": "bg-lime-500",
};

type AgendaTab = "agenda" | "team";
type AgendaView = "day" | "week";

type ParsedSeyaBlock = {
  action: "create" | "delete";
  cabinIds: string[];
  date: string;
  dates: string[];
  duration: number;
  kind: AppointmentKind;
  label: string;
  start: string;
};

type CenterDayHours = {
  weekday: number;
  label: string;
  startTime: string;
  endTime: string;
  closed: boolean;
};

const weekDays = [
  { label: "Lun", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Mer", value: 3 },
  { label: "Jeu", value: 4 },
  { label: "Ven", value: 5 },
  { label: "Sam", value: 6 },
  { label: "Dim", value: 0 },
];

const defaultCenterDayHours: CenterDayHours[] = weekDays.map((day) => ({
  weekday: day.value,
  label: day.label,
  startTime: "08:00",
  endTime: "19:00",
  closed: false,
}));

export default function AgendaBoard() {
  const searchParams = useSearchParams();
  const rdvPrefill = getRdvPrefill(searchParams);
  const agendaFocus = getAgendaFocus(searchParams);
  const [storedAppointments, setAppointmentList] = useState<Appointment[]>([]);
  const appointmentList = useMemo(
    () => markPastAppointmentsPresent(storedAppointments),
    [storedAppointments],
  );
  const [balanceDueIndex, setBalanceDueIndex] = useState(
    emptyClientBalanceDueIndex,
  );
  const [cabinList, setCabinList] = useState(cabins);
  const [practitionerList, setPractitionerList] = useState(practitioners);
  const [isLoadingAgenda, setIsLoadingAgenda] = useState(true);
  const [agendaError, setAgendaError] = useState("");
  const [agendaNotice, setAgendaNotice] = useState("");
  const [activeTab, setActiveTab] = useState<AgendaTab>("agenda");
  const [agendaView, setAgendaView] = useState<AgendaView>("day");
  const [teamSchedules, setTeamSchedules] = useState(defaultTeamSchedules);
  const [selectedDate, setSelectedDate] = useState(
    agendaFocus?.date ?? rdvPrefill?.date ?? todayIso()
  );
  const [selectedCabinIds, setSelectedCabinIds] = useState<string[]>([]);
  const [selectedPractitionerIds, setSelectedPractitionerIds] = useState<
    string[]
  >([]);
  const [centerDayHours, setCenterDayHours] = useState(defaultCenterDayHours);
  const [seyaCommand, setSeyaCommand] = useState("");
  const [seyaFeedback, setSeyaFeedback] = useState("");
  const [dailyInfoByDate, setDailyInfoByDate] = useState<
    Record<string, string>
  >(() => loadStoredDailyInfo());
  const [dailyInfoSavedDate, setDailyInfoSavedDate] = useState<string | null>(
    null
  );
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);
  const [isToConfirmOpen, setIsToConfirmOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(Boolean(rdvPrefill));
  const [agendaContacts, setAgendaContacts] = useState<CrmAgendaContact[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  const [focusedAppointmentId, setFocusedAppointmentId] = useState<
    string | null
  >(agendaFocus?.appointmentId ?? null);
  const [movingAppointmentId, setMovingAppointmentId] = useState<string | null>(
    null
  );
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const [appointmentForm, setAppointmentForm] = useState(() =>
    applyClientPositionStatus({
      ...emptyAppointment,
      ...rdvPrefill,
    }),
  );
  const [sendSmsNow, setSendSmsNow] = useState(true);
  const [sendEmailNow, setSendEmailNow] = useState(true);
  const [sendSmsJ7, setSendSmsJ7] = useState(false);
  const [sendSmsJ5, setSendSmsJ5] = useState(false);
  const [sendSms48h, setSendSms48h] = useState(false);
  const [sendSms24h, setSendSms24h] = useState(false);
  const [depositLinks, setDepositLinks] = useState<CenterDepositLinkSetting[]>(
    defaultCenterDepositLinks.filter((link) => link.active),
  );
  const [selectedDepositLinkId, setSelectedDepositLinkId] = useState("");
  const [sendBirthdaySms, setSendBirthdaySms] = useState(true);
  const [smsSettings, setSmsSettings] = useState<CenterSmsSettings | null>(null);
  const [moveNotifyAppointment, setMoveNotifyAppointment] =
    useState<Appointment | null>(null);
  const [isSendingMoveNotify, setIsSendingMoveNotify] = useState(false);
  const [contactSearch, setContactSearch] = useState(
    rdvPrefill?.personName ?? ""
  );
  const [pickedContact, setPickedContact] = useState<CrmAgendaContact | null>(
    null
  );
  const [editingClient, setEditingClient] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [isSavingAppointment, setIsSavingAppointment] = useState(false);
  const savingAppointmentRef = useRef(false);
  const centerNameRef = useRef("");
  const teamSaveTimerRef = useRef<number | null>(null);
  const teamPlanningRef = useRef({
    practitioners,
    schedules: defaultTeamSchedules(),
  });

  async function refreshAgenda() {
    setAgendaError("");

    try {
      const [loadedAppointments, center, nextBalanceDueIndex, nextHours, team] =
        await Promise.all([
          loadCrmAppointments(),
          getActiveCenterContext(),
          loadClientBalanceDueIndex().catch(() => emptyClientBalanceDueIndex()),
          loadCenterHours().catch(() => null),
          loadTeamPlanning().catch(() => null),
        ]);
      centerNameRef.current = center.centerName;
      setBalanceDueIndex(nextBalanceDueIndex);
      if (nextHours) {
        setCenterDayHours(nextHours);
      }
      if (team) {
        teamPlanningRef.current = {
          practitioners: team.practitioners,
          schedules: team.schedules,
        };
        setPractitionerList(team.practitioners);
        setTeamSchedules(team.schedules);
      }

      setAppointmentList(
        mergePublicBookingsIntoAppointments(
          loadedAppointments,
          readPublicBookingsForCenter(center.centerName),
        ),
      );
    } catch (error) {
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Impossible de charger l'agenda.",
      );
      setAppointmentList([]);
    } finally {
      setIsLoadingAgenda(false);
    }
  }
  const selectedDayHours =
    centerDayHours.find((day) => day.weekday === getWeekdayFromIso(selectedDate)) ??
    defaultCenterDayHours[0];
  const centerStartTime = selectedDayHours.startTime;
  const centerEndTime = selectedDayHours.endTime;
  const isSelectedDayClosed =
    selectedDayHours.closed ||
    timeToMinutes(centerEndTime) <= timeToMinutes(centerStartTime);
  const agendaSlots = useMemo(() => {
    if (isSelectedDayClosed) {
      return [];
    }

    return createTimeSlotsFromValues(centerStartTime, centerEndTime, 15).filter(
      (slot) => timeToMinutes(slot) < timeToMinutes(centerEndTime)
    );
  }, [centerEndTime, centerStartTime, isSelectedDayClosed]);
  const dailyInfo = dailyInfoByDate[selectedDate] ?? "";

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (isLoadingAgenda) {
      return;
    }

    if (!agendaFocus?.appointmentId && !agendaFocus?.date && !agendaFocus?.start) {
      return;
    }

    const focusedAppointment =
      (agendaFocus.appointmentId
        ? appointmentList.find(
            (appointment) => appointment.id === agendaFocus.appointmentId,
          )
        : undefined) ??
      appointmentList.find(
        (appointment) =>
          Boolean(agendaFocus.date) &&
          Boolean(agendaFocus.start) &&
          appointment.date === agendaFocus.date &&
          appointment.start === agendaFocus.start,
      );

    if (focusedAppointment && focusedAppointment.date !== selectedDate) {
      setSelectedDate(focusedAppointment.date);
      return;
    }

    if (
      !focusedAppointment &&
      agendaFocus.date &&
      agendaFocus.date !== selectedDate
    ) {
      setSelectedDate(agendaFocus.date);
      return;
    }

    if (activeTab !== "agenda") {
      setActiveTab("agenda");
      return;
    }

    if (agendaView !== "day") {
      setAgendaView("day");
      return;
    }

    if (
      focusedAppointment &&
      selectedCabinIds.length > 0 &&
      !selectedCabinIds.includes(focusedAppointment.cabinId)
    ) {
      setSelectedCabinIds([]);
      return;
    }

    if (
      focusedAppointment &&
      selectedPractitionerIds.length > 0 &&
      !selectedPractitionerIds.includes(focusedAppointment.practitionerId)
    ) {
      setSelectedPractitionerIds([]);
      return;
    }

    if (focusedAppointment && focusedAppointmentId !== focusedAppointment.id) {
      setFocusedAppointmentId(focusedAppointment.id);
    }

    const targetId = focusedAppointment?.id ?? agendaFocus.appointmentId;
    const targetStart = focusedAppointment?.start ?? agendaFocus.start;

    function scrollBoardToFocus() {
      const board = boardScrollRef.current;

      if (!board) {
        return false;
      }

      const card = targetId
        ? board.querySelector(
            `[data-appointment-id="${CSS.escape(targetId)}"]`,
          )
        : null;
      const slot = targetStart
        ? board.querySelector(`[data-agenda-slot="${CSS.escape(targetStart)}"]`)
        : null;
      const node =
        card instanceof HTMLElement
          ? card
          : slot instanceof HTMLElement
            ? slot
            : null;

      if (!node) {
        return false;
      }

      const boardRect = board.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      board.scrollTo({
        top: Math.max(
          0,
          board.scrollTop +
            (nodeRect.top - boardRect.top) -
            board.clientHeight / 2 +
            nodeRect.height / 2,
        ),
        behavior: "smooth",
      });

      return true;
    }

    const timers = [0, 80, 250, 600].map((delay) =>
      window.setTimeout(() => {
        scrollBoardToFocus();
      }, delay),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [
    activeTab,
    agendaFocus?.appointmentId,
    agendaFocus?.date,
    agendaFocus?.start,
    agendaSlots,
    agendaView,
    appointmentList,
    focusedAppointmentId,
    isLoadingAgenda,
    selectedCabinIds,
    selectedDate,
    selectedPractitionerIds,
  ]);

  useEffect(() => {
    const board = boardScrollRef.current;
    if (!board) {
      return;
    }

    function onWheel(event: WheelEvent) {
      const atTop = board.scrollTop <= 0;
      const atBottom =
        board.scrollTop + board.clientHeight >= board.scrollHeight - 1;
      const atLeft = board.scrollLeft <= 0;
      const atRight =
        board.scrollLeft + board.clientWidth >= board.scrollWidth - 1;

      if (
        (event.deltaY < 0 && atTop) ||
        (event.deltaY > 0 && atBottom) ||
        (event.deltaX < 0 && atLeft) ||
        (event.deltaX > 0 && atRight)
      ) {
        event.preventDefault();
      }
    }

    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, [activeTab, agendaView]);

  useEffect(() => {
    function syncPublicBookings() {
      setAppointmentList((currentAppointments) =>
        mergePublicBookingsIntoAppointments(
          currentAppointments,
          readPublicBookingsForCenter(centerNameRef.current),
        )
      );
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAgenda();
    function refreshIfVisible() {
      if (document.visibilityState === "visible") {
        void refreshAgenda();
      }
    }

    window.addEventListener(PUBLIC_BOOKINGS_UPDATED_EVENT, syncPublicBookings);
    window.addEventListener("storage", syncPublicBookings);
    window.addEventListener("focus", refreshAgenda);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.removeEventListener(
        PUBLIC_BOOKINGS_UPDATED_EVENT,
        syncPublicBookings
      );
      window.removeEventListener("storage", syncPublicBookings);
      window.removeEventListener("focus", refreshAgenda);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);

  const laserAppointment = useMemo(
    () =>
      isLaserRdv(
        appointmentForm.treatment,
        appointmentForm.cabinId,
        cabinList,
      ),
    [appointmentForm.cabinId, appointmentForm.treatment, cabinList],
  );

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    setSendSmsJ7(
      laserAppointment && reminderFlagsFromSettings(smsSettings).sendSmsJ7,
    );
  }, [isModalOpen, laserAppointment, smsSettings]);

  useEffect(() => {
    void loadCenterSmsSettings()
      .then((result) => setSmsSettings(result.settings))
      .catch(() => null);
    void fetch("/api/sms/dispatch").catch(() => null);
    void refreshAgendaContacts();

    function refreshDepositLinks() {
      const nextLinks = activeDepositLinks();
      setDepositLinks(nextLinks);
      setSelectedDepositLinkId((current) =>
        nextLinks.some((link) => String(link.id) === current) ? current : "",
      );
    }

    refreshDepositLinks();
    window.addEventListener("bookea-center-settings-updated", refreshDepositLinks);
    return () =>
      window.removeEventListener(
        "bookea-center-settings-updated",
        refreshDepositLinks,
      );
  }, []);

  const visibleAppointments = useMemo(
    () =>
      appointmentList.filter((appointment) => {
        const dateMatch = appointment.date === selectedDate;
        const cabinMatch = matchesMultiSelection(
          selectedCabinIds,
          appointment.cabinId,
        );
        const practitionerMatch = matchesMultiSelection(
          selectedPractitionerIds,
          appointment.practitionerId,
        );

        return dateMatch && cabinMatch && practitionerMatch;
      }),
    [appointmentList, selectedCabinIds, selectedDate, selectedPractitionerIds]
  );

  const visibleCabinList = useMemo(() => {
    if (selectedCabinIds.length === 0) {
      return cabinList;
    }

    const nextCabins = cabinList.filter((cabin) =>
      selectedCabinIds.includes(cabin.id),
    );

    return nextCabins.length > 0 ? nextCabins : cabinList;
  }, [cabinList, selectedCabinIds]);

  const practitionersOfDay = practitionerList.filter((practitioner) => {
    const schedule = teamSchedules.find(
      (item) => item.practitionerId === practitioner.id
    );

    return schedule ? isPractitionerWorkingOnDate(schedule, selectedDate) : false;
  });

  const selectedAppointment =
    appointmentList.find(
      (appointment) => appointment.id === selectedAppointmentId
    ) ?? null;

  function updateDailyInfoForSelectedDate(value: string) {
    setDailyInfoByDate((currentNotes) => ({
      ...currentNotes,
      [selectedDate]: value,
    }));
    setDailyInfoSavedDate(null);
  }

  function saveDailyInfo() {
    try {
      window.localStorage.setItem(
        "bookea-agenda-daily-info",
        JSON.stringify(dailyInfoByDate)
      );
      setDailyInfoSavedDate(selectedDate);
    } catch {
      setDailyInfoSavedDate(null);
    }
  }

  function updateCenterDayHours(
    weekday: number,
    updates: Partial<CenterDayHours>
  ) {
    setCenterDayHours((currentHours) =>
      currentHours.map((day) =>
        day.weekday === weekday ? { ...day, ...updates } : day
      )
    );
  }

  const appointmentsToConfirm = useMemo(() => {
    return appointmentList
      .filter((appointment) => {
        if (appointment.status !== "À confirmer") {
          return false;
        }

        if (appointment.kind && appointment.kind !== "Rendez-vous") {
          return false;
        }

        return isAppointmentWithinHoursAhead(
          appointment.date,
          appointment.start,
          72,
        );
      })
      .sort((current, next) => {
        const dateCompare = current.date.localeCompare(next.date);
        return dateCompare !== 0
          ? dateCompare
          : current.start.localeCompare(next.start);
      });
  }, [appointmentList]);

  const stats = useMemo(() => {
    const confirmed = visibleAppointments.filter(
      (appointment) => appointment.status === "Confirmé"
    ).length;
    const occupancy = Math.round(
      (visibleAppointments.reduce(
        (total, appointment) => total + appointment.duration,
        0
      ) /
        (cabinList.length *
          Math.max(
            1,
            timeToMinutes(centerEndTime) - timeToMinutes(centerStartTime)
          ))) *
        100
    );

    return [
      {
        label: "RDV aujourd'hui",
        value: visibleAppointments.length,
        icon: CalendarDays,
        color: "text-blue-600",
      },
      {
        label: "Confirmés",
        value: confirmed,
        icon: CheckCircle2,
        color: "text-emerald-600",
      },
      {
        label: "À confirmer",
        value: appointmentsToConfirm.length,
        icon: Clock3,
        color: "text-amber-600",
      },
      {
        label: "Taux remplissage",
        value: `${occupancy}%`,
        icon: Users,
        color: "text-violet-600",
      },
    ];
  }, [
    appointmentsToConfirm.length,
    centerEndTime,
    centerStartTime,
    visibleAppointments,
    cabinList.length,
  ]);

  function updateCabin(cabinId: string, updates: Partial<Cabin>) {
    setCabinList((currentCabins) =>
      currentCabins.map((cabin) =>
        cabin.id === cabinId ? { ...cabin, ...updates } : cabin
      )
    );
  }

  function addCabin() {
    const confirmed = window.confirm(
      "Êtes-vous sûr de vouloir ajouter une cabine ?"
    );

    if (!confirmed) {
      return;
    }

    setCabinList((currentCabins) => {
      const nextNumber = currentCabins.length + 1;
      const palette = cabinPalette[(nextNumber - 1) % cabinPalette.length];

      return [
        ...currentCabins,
        {
          id: `cabine-${crypto.randomUUID()}`,
          name: `Cabine ${nextNumber}`,
          equipment: "À configurer",
          color: palette.color,
          softColor: palette.softColor,
        },
      ];
    });
  }

  function removeCabin() {
    const confirmed = window.confirm(
      "Êtes-vous sûr de vouloir retirer une cabine ?"
    );

    if (!confirmed) {
      return;
    }

    setCabinList((currentCabins) => {
      if (currentCabins.length <= 1) {
        window.alert("Vous devez garder au moins une cabine.");
        return currentCabins;
      }

      const cabinToRemove = currentCabins[currentCabins.length - 1];

      setAppointmentList((currentAppointments) =>
        currentAppointments.filter(
          (appointment) => appointment.cabinId !== cabinToRemove.id
        )
      );

      setSelectedCabinIds((current) =>
        current.filter((id) => id !== cabinToRemove.id),
      );

      return currentCabins.slice(0, -1);
    });
  }

  function persistTeamPlanning(next?: {
    practitioners?: Practitioner[];
    schedules?: TeamSchedule[];
  }) {
    teamPlanningRef.current = {
      practitioners:
        next?.practitioners ?? teamPlanningRef.current.practitioners,
      schedules: next?.schedules ?? teamPlanningRef.current.schedules,
    };
    if (teamSaveTimerRef.current) {
      window.clearTimeout(teamSaveTimerRef.current);
    }
    teamSaveTimerRef.current = window.setTimeout(() => {
      void saveTeamPlanning(teamPlanningRef.current).catch(() => null);
    }, 400);
  }

  function updateTeamSchedule(
    practitionerId: string,
    updates: Partial<TeamSchedule>
  ) {
    setTeamSchedules((currentSchedules) => {
      const nextSchedules = currentSchedules.map((schedule) =>
        schedule.practitionerId === practitionerId
          ? { ...schedule, ...updates }
          : schedule
      );
      persistTeamPlanning({ schedules: nextSchedules });
      return nextSchedules;
    });
  }

  function updatePractitioner(
    practitionerId: string,
    updates: Partial<Practitioner>,
  ) {
    setPractitionerList((current) => {
      const next = current.map((practitioner) =>
        practitioner.id === practitionerId
          ? { ...practitioner, ...updates }
          : practitioner
      );
      persistTeamPlanning({
        practitioners: next.map((practitioner) => ({
          ...practitioner,
          name: practitioner.name.trim() || "Praticienne",
        })),
      });
      return next;
    });
  }

  function addPractitioner() {
    const usedColors = new Set(practitionerList.map((item) => item.color));
    const color =
      practitionerColorOptions.find((item) => !usedColors.has(item)) ??
      practitionerColorOptions[
        practitionerList.length % practitionerColorOptions.length
      ];
    const practitioner: Practitioner = {
      id: `praticienne-${crypto.randomUUID()}`,
      name: "Nouvelle praticienne",
      role: "Polyvalente",
      color,
    };
    const nextPractitioners = [...practitionerList, practitioner];
    const nextSchedules = [
      ...teamSchedules,
      emptyTeamSchedule(practitioner.id),
    ];
    setPractitionerList(nextPractitioners);
    setTeamSchedules(nextSchedules);
    persistTeamPlanning({
      practitioners: nextPractitioners,
      schedules: nextSchedules,
    });
  }

  function removePractitioner(practitionerId: string) {
    const nextPractitioners = practitionerList.filter(
      (practitioner) => practitioner.id !== practitionerId,
    );
    const nextSchedules = teamSchedules.filter(
      (schedule) => schedule.practitionerId !== practitionerId,
    );
    setPractitionerList(nextPractitioners);
    setTeamSchedules(nextSchedules);
    persistTeamPlanning({
      practitioners: nextPractitioners,
      schedules: nextSchedules,
    });
  }

  function refreshAgendaContacts() {
    return loadCrmAgendaContacts()
      .then(setAgendaContacts)
      .catch(() => setAgendaContacts([]));
  }

  function applyReminderDefaults(settings = smsSettings) {
    const flags = reminderFlagsFromSettings(settings);
    setSendSmsNow(flags.sendSmsNow);
    setSendEmailNow(flags.sendEmailNow);
    setSendSmsJ5(flags.sendSmsJ5);
    setSendSms48h(flags.sendSms48h);
    setSendSms24h(flags.sendSms24h);
  }

  function openAppointmentModal() {
    setAppointmentForm(
      applyClientPositionStatus({ ...emptyAppointment, date: selectedDate }),
    );
    setContactSearch("");
    setPickedContact(null);
    setEditingClient(false);
    applyReminderDefaults();
    setSelectedDepositLinkId("");
    setSendBirthdaySms(true);
    setIsModalOpen(true);
    void refreshAgendaContacts();
  }

  async function addAppointment() {
    if (savingAppointmentRef.current) {
      return;
    }

    setAgendaError("");

    const appointment: Appointment = {
      id: crypto.randomUUID(),
      personName: appointmentForm.personName.trim(),
      phone: appointmentForm.phone.trim(),
      treatment: appointmentForm.treatment.trim(),
      practitionerId: appointmentForm.practitionerId,
      cabinId: appointmentForm.cabinId,
      date: appointmentForm.date,
      start: appointmentForm.start,
      duration: appointmentForm.duration,
      status: appointmentForm.status,
      source: appointmentForm.source,
      email: appointmentForm.email.trim() || undefined,
      kind: appointmentForm.kind,
      notes: appointmentForm.notes.trim() || undefined,
      birthDate: appointmentForm.birthDate || undefined,
    };

    Object.assign(appointment, withClientPositionStatus(appointment));

    if (isAgendaBlockKind(appointment.kind)) {
      appointment.personName = appointment.personName || appointment.kind || "Pause";
      appointment.treatment = appointment.treatment || appointment.kind || "Pause";
    }

    if (!appointment.personName) {
      setAgendaError("Indiquez un nom.");
      return;
    }

    if (appointment.kind === "Rendez-vous" && !appointment.treatment) {
      setAgendaError("Choisissez une prestation.");
      return;
    }

    if (appointment.kind === "Rendez-vous" && appointment.treatment) {
      addCenterService({
        name: appointment.treatment,
        duration: appointment.duration,
      });
    }

    savingAppointmentRef.current = true;
    setIsSavingAppointment(true);

    try {
      const savedAppointment = await createCrmAppointment(appointment);
      const smsVars = {
        phone: savedAppointment.phone,
        ...splitPersonName(savedAppointment.personName),
        date: formatSmsDate(savedAppointment.date),
        time: savedAppointment.start,
        treatment: savedAppointment.treatment,
        confirmationLink: "",
        appointmentId: savedAppointment.id,
      };
      const notices = ["RDV enregistré."];
      const appointmentEmail = String(
        savedAppointment.email || appointment.email || "",
      ).trim();
      const shouldSendConfirmationEmail =
        sendEmailNow &&
        smsSettings?.confirmationEmailEnabled !== false &&
        Boolean(appointmentEmail);
      const canNotifyAppointment =
        appointment.kind !== "Pause" &&
        appointment.kind !== "Formation" &&
        appointment.kind !== "Indisponible";

      if (canNotifyAppointment && (savedAppointment.phone || shouldSendConfirmationEmail)) {
        const reminderJobs: Array<{
          kind: AppointmentReminderKind;
          templateId?: string;
          label: string;
        }> = [];

        if (
          savedAppointment.phone &&
          sendSmsJ7 &&
          smsSettings?.reminderJ7Enabled !== false &&
          isLaserRdv(
            savedAppointment.treatment,
            savedAppointment.cabinId,
            cabinList,
          )
        ) {
          reminderJobs.push({
            kind: "reminder_j7",
            templateId: smsSettings?.reminderJ7TemplateId,
            label: "J-7 laser",
          });
        }

        if (savedAppointment.phone && sendSmsJ5 && smsSettings?.reminderJ5Enabled) {
          reminderJobs.push({
            kind: "reminder_j5",
            templateId: smsSettings?.reminderJ5TemplateId,
            label: "J-5",
          });
        }

        if (savedAppointment.phone && sendSms48h && smsSettings?.reminder48hEnabled) {
          reminderJobs.push({
            kind: "reminder_48h",
            templateId: smsSettings?.reminder48hTemplateId,
            label: "48h",
          });
        }

        if (savedAppointment.phone && sendSms24h && smsSettings?.reminder24hEnabled) {
          reminderJobs.push({
            kind: "reminder_24h",
            templateId: smsSettings?.reminder24hTemplateId,
            label: "24h",
          });
        }

        if (
          (sendSmsNow &&
            smsSettings?.confirmationEnabled !== false &&
            savedAppointment.phone) ||
          shouldSendConfirmationEmail ||
          reminderJobs.length > 0
        ) {
          try {
            smsVars.confirmationLink = await issueAppointmentConfirmationUrl(
              savedAppointment.id,
            );
          } catch {
            smsVars.confirmationLink = "";
          }
        }

        if (
          savedAppointment.phone &&
          sendSmsNow &&
          smsSettings?.confirmationEnabled !== false
        ) {
          const confirmation = await sendSavedTemplateSms(
            smsSettings?.confirmationTemplateId,
            smsVars,
          );
          notices.push(
            confirmation.ok
              ? "SMS de confirmation envoyé."
              : "Le SMS de confirmation n'a pas pu partir.",
          );
        }

        if (shouldSendConfirmationEmail) {
          const confirmationEmail = await sendAppointmentConfirmationEmail({
            clientId: savedAppointment.clientId,
            email: appointmentEmail,
            firstName: smsVars.firstName,
            lastName: smsVars.lastName,
            date: smsVars.date,
            time: smsVars.time,
            treatment: smsVars.treatment,
            confirmationLink: smsVars.confirmationLink,
          });
          notices.push(
            confirmationEmail.ok
              ? "Mail de confirmation envoyé."
              : "Le mail de confirmation n'a pas pu partir.",
          );
        }

        for (const job of reminderJobs) {
          const reminder = await scheduleAppointmentReminderSms({
            appointmentId: savedAppointment.id,
            templateId: job.templateId,
            kind: job.kind,
            vars: smsVars,
          });
          notices.push(
            reminder.ok
              ? reminder.scheduled
                ? `SMS ${job.label} programmé.`
                : `SMS ${job.label} envoyé.`
              : `Le SMS ${job.label} n'a pas pu être programmé.`,
          );
        }

        if (savedAppointment.phone && selectedDepositLinkId) {
          notices.push(
            await sendSelectedDepositLinkSms(
              savedAppointment,
              selectedDepositLinkId,
              depositLinks,
              centerNameRef.current,
            ),
          );
        }

        if (savedAppointment.phone && appointment.birthDate) {
          const birthday = await syncBirthdaySms({
            clientId: savedAppointment.clientId,
            birthDate: appointment.birthDate,
            phone: savedAppointment.phone,
            firstName: smsVars.firstName,
            lastName: smsVars.lastName,
            enabled: sendBirthdaySms && smsSettings?.birthdaySmsEnabled !== false,
          });
          notices.push(
            sendBirthdaySms
              ? birthday.ok
                ? birthday.sent
                  ? "SMS anniversaire envoyé."
                  : "SMS anniversaire programmé pour le jour J."
                : "Le SMS anniversaire n'a pas pu être programmé."
              : "Date d'anniversaire enregistrée.",
          );
        }
      }

      setAppointmentList((currentAppointments) => [
        ...currentAppointments,
        savedAppointment,
      ]);
      setSelectedDate(savedAppointment.date);
      setAgendaNotice(notices.join(" "));
      applyReminderDefaults();
      setSelectedDepositLinkId("");
      setSendBirthdaySms(true);
      setIsModalOpen(false);
      void refreshAgendaContacts();
    } catch (error) {
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Le RDV n'a pas pu être enregistré.",
      );
    } finally {
      savingAppointmentRef.current = false;
      setIsSavingAppointment(false);
    }
  }

  function moveAppointment(appointmentId: string, cabinId: string, start: string) {
    const cabinTreatment = getCabinTreatment(cabinList, cabinId);
    const appointmentBeforeMove = appointmentList.find(
      (appointment) => appointment.id === appointmentId,
    );

    setAppointmentList((currentAppointments) =>
      currentAppointments.map((appointment) =>
        appointment.id === appointmentId
          ? withClientPositionStatus({
              ...appointment,
              cabinId,
              date: selectedDate,
              start,
              treatment:
                appointment.kind && appointment.kind !== "Rendez-vous"
                  ? appointment.treatment
                  : cabinTreatment,
            })
          : appointment
      )
    );

    if (!appointmentBeforeMove) {
      return;
    }

    const updatedAppointment = withClientPositionStatus({
      ...appointmentBeforeMove,
      cabinId,
      date: selectedDate,
      start,
      treatment:
        appointmentBeforeMove.kind && appointmentBeforeMove.kind !== "Rendez-vous"
          ? appointmentBeforeMove.treatment
          : cabinTreatment,
    });

    persistCrmAppointment(updatedAppointment)
      .then(async (savedAppointment) => {
        replaceAppointment(appointmentId, savedAppointment);
        unlinkPublicBooking(appointmentBeforeMove);
        await rescheduleAppointmentSmsJobs(savedAppointment.id);
        if (canOfferAppointmentNotify(savedAppointment, smsSettings)) {
          setMoveNotifyAppointment(savedAppointment);
        } else {
          setAgendaNotice("RDV déplacé.");
        }
      })
      .catch((error) => {
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Le déplacement du RDV n'a pas pu être sauvegardé.",
      );
      void refreshAgenda();
    });
  }

  async function sendSelectedConfirmations(
    appointment: Appointment,
    notify: { email: boolean; sms: boolean },
    prefix = "",
  ) {
    const notices = await sendAppointmentConfirmations(appointment, {
      ...notify,
      settings: smsSettings,
    });

    setAgendaNotice([prefix, ...notices].filter(Boolean).join(" ").trim());
  }

  function startMoveAppointment(appointmentId: string) {
    setSelectedAppointmentId(null);
    setMovingAppointmentId((currentId) =>
      currentId === appointmentId ? null : appointmentId
    );
  }

  async function deleteAppointment(appointmentId: string) {
    const confirmed = window.confirm(
      "Êtes-vous sûr de vouloir supprimer le RDV ?"
    );

    if (!confirmed) {
      return false;
    }

    const appointmentToDelete = appointmentList.find(
      (appointment) => appointment.id === appointmentId
    );
    const previousAppointments = appointmentList;
    setAppointmentList((currentAppointments) =>
      currentAppointments.filter((appointment) => appointment.id !== appointmentId)
    );

    if (selectedAppointmentId === appointmentId) {
      setSelectedAppointmentId(null);
    }

    try {
      unlinkPublicBooking(appointmentToDelete);
      await cancelAppointmentSmsJobs(appointmentId);
      await deleteCrmAppointment(appointmentId);
      setAgendaNotice("RDV supprimé. Les rappels SMS prévus pour ce rendez-vous sont annulés.");
      return true;
    } catch (error) {
      setAppointmentList(previousAppointments);
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Le RDV n'a pas pu être supprimé.",
      );
      return false;
    }
  }

  async function updateAppointment(
    updatedAppointment: Appointment,
    notify?: { email?: boolean; sms?: boolean; depositLinkId?: string },
  ) {
    const previousAppointments = appointmentList;
    const localId = updatedAppointment.id;
    const nextAppointment = withClientPositionStatus(updatedAppointment);
    setAppointmentList((currentAppointments) =>
      currentAppointments.map((appointment) =>
        appointment.id === localId ? nextAppointment : appointment
      )
    );
    saveAppointmentStatusOverride(nextAppointment);
    setSelectedDate(updatedAppointment.date);

    try {
      const savedAppointment = await persistCrmAppointment(nextAppointment);
      replaceAppointment(localId, savedAppointment);
      unlinkPublicBooking(nextAppointment);
      if (savedAppointment.status === "Annulation") {
        await cancelAppointmentSmsJobs(savedAppointment.id);
        setAgendaNotice("RDV mis à jour. Les rappels SMS prévus sont annulés.");
      } else {
        await rescheduleAppointmentSmsJobs(savedAppointment.id);
        const confirmationNotices = await sendAppointmentConfirmations(
          savedAppointment,
          {
            sms: Boolean(notify?.sms),
            email: Boolean(notify?.email),
            settings: smsSettings,
          },
        );
        const depositNotice = notify?.depositLinkId
          ? await sendSelectedDepositLinkSms(
              savedAppointment,
              notify.depositLinkId,
              depositLinks,
              centerNameRef.current,
            )
          : "";
        setAgendaNotice(
          ["RDV mis à jour.", ...confirmationNotices, depositNotice]
            .filter(Boolean)
            .join(" ")
            .trim(),
        );
      }
    } catch (error) {
      setAppointmentList(previousAppointments);
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Le RDV n'a pas pu être mis à jour.",
      );
    }
  }

  function replaceAppointment(localId: string, savedAppointment: Appointment) {
    setAppointmentList((currentAppointments) =>
      currentAppointments.map((appointment) =>
        appointment.id === localId ? savedAppointment : appointment
      )
    );
  }

  function unlinkPublicBooking(appointment?: Appointment) {
    if (!appointment) {
      return;
    }

    const bookingId = getPublicBookingIdFromAppointment(appointment);
    if (bookingId) {
      removePublicBooking(bookingId);
    }
  }

  function updateAppointmentStatus(
    appointment: Appointment,
    status: AppointmentStatus
  ) {
    const updatedAppointment = { ...appointment, status };
    const previousAppointments = appointmentList;
    const localId = appointment.id;

    setAppointmentList((currentAppointments) =>
      currentAppointments.map((currentAppointment) =>
        currentAppointment.id === localId
          ? updatedAppointment
          : currentAppointment
      )
    );
    saveAppointmentStatusOverride(updatedAppointment);

    persistCrmAppointment(updatedAppointment)
      .then((savedAppointment) => {
        replaceAppointment(localId, savedAppointment);
        unlinkPublicBooking(appointment);
      })
      .catch((error) => {
      setAppointmentList(previousAppointments);
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Le statut du RDV n'a pas pu être sauvegardé.",
      );
    });
  }

  const contactMatches =
    !pickedContact && contactSearch.trim().length >= 2
      ? agendaContacts
          .filter((contact) => matchesAgendaContact(contact, contactSearch))
          .slice(0, 8)
      : [];

  function selectContact(contact: (typeof agendaContacts)[number]) {
    setPickedContact(contact);
    setContactSearch("");
    setEditingClient(false);
    setAppointmentForm((form) =>
      applyClientPositionStatus({
        ...form,
        personName: contact.name,
        phone: contact.phone,
        treatment: contact.treatment,
        source: contact.type,
        email: contact.email,
        birthDate: contact.birthDate || "",
        kind: "Rendez-vous",
      }),
    );
  }

  function clearSelectedClient() {
    setPickedContact(null);
    setEditingClient(true);
    setContactSearch("");
    setAppointmentForm((form) => ({
      ...form,
      personName: "",
      phone: "",
      email: "",
      birthDate: "",
    }));
  }

  function createSeyaBlock() {
    const block = parseSeyaBlockCommand(
      seyaCommand,
      selectedDate,
      cabinList,
      centerStartTime,
      centerEndTime
    );

    if (!block) {
      setSeyaFeedback(
        "Je n'ai pas compris le bloc. Exemple : pause pendant 5 semaines sur toutes les cabines entre 14h et 15h."
      );
      return;
    }

    if (block.action === "delete") {
      setAppointmentList((currentAppointments) => {
        const appointmentsToKeep = currentAppointments.filter((appointment) => {
          const matchesDate = block.dates.includes(appointment.date);
          const matchesCabin = block.cabinIds.includes(appointment.cabinId);
          const matchesTime = appointmentOverlapsBlock(appointment, block);
          const matchesKind =
            appointment.kind === block.kind ||
            appointment.personName === block.label ||
            appointment.treatment === block.label ||
            appointment.source === "Seya";

          return !(
            matchesDate &&
            matchesCabin &&
            matchesTime &&
            matchesKind
          );
        });
        const deletedCount = currentAppointments.length - appointmentsToKeep.length;

        setSeyaFeedback(
          deletedCount > 0
            ? `${deletedCount} bloc${deletedCount > 1 ? "s" : ""} supprimé${deletedCount > 1 ? "s" : ""}.`
            : "Aucun bloc correspondant trouvé à supprimer."
        );

        return appointmentsToKeep;
      });
      setSeyaCommand("");
      return;
    }

    const nextAppointments = block.dates.flatMap((date) =>
      block.cabinIds.map((cabinId) => {
        const practitionerId =
          getFirstWorkingPractitionerId(teamSchedules, date) ??
          practitionerList[0]?.id ??
          "samantha";

        return {
          id: crypto.randomUUID(),
          personName: block.label,
          phone: "",
          treatment: block.label,
          practitionerId,
          cabinId,
          date,
          start: block.start,
          duration: block.duration,
          status: "Confirmé" as AppointmentStatus,
          source: "Seya" as AppointmentSource,
          kind: block.kind,
          notes: `Bloc créé par Seya : ${seyaCommand}`,
        };
      })
    );

    setAppointmentList((currentAppointments) => {
      const existingKeys = new Set(
        currentAppointments.map(
          (appointment) =>
            `${appointment.date}-${appointment.start}-${appointment.cabinId}-${appointment.kind}-${appointment.personName}`
        )
      );
      const appointmentsToAdd = nextAppointments.filter((appointment) => {
        const key = `${appointment.date}-${appointment.start}-${appointment.cabinId}-${appointment.kind}-${appointment.personName}`;

        return !existingKeys.has(key);
      });

      setSeyaFeedback(
        appointmentsToAdd.length > 0
          ? `${appointmentsToAdd.length} bloc${appointmentsToAdd.length > 1 ? "s" : ""} créé${appointmentsToAdd.length > 1 ? "s" : ""}.`
          : "Ces blocs existent déjà sur le planning."
      );

      return [...currentAppointments, ...appointmentsToAdd];
    });
    setSelectedDate(block.date);
    setSeyaCommand("");
  }

  function slideCabinBoard(direction: -1 | 1) {
    const board = boardScrollRef.current;

    if (!board) return;

    board.scrollBy({
      left: direction * CABIN_COLUMN_MIN_PX,
      behavior: "smooth",
    });
  }

  const cabinBoardMinWidth =
    TIME_COLUMN_PX + visibleCabinList.length * CABIN_COLUMN_MIN_PX;
  const cabinBoardColumns = `${TIME_COLUMN_PX}px repeat(${visibleCabinList.length}, minmax(${CABIN_COLUMN_MIN_PX}px, 1fr))`;

  return (
    <main className="min-w-0 bg-slate-100">
      <div className="mx-auto min-w-0 max-w-[1800px] space-y-6 px-8 pt-8 pb-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-600">
              Bookea Agenda
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Agenda
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Organisez les cabines, les praticiennes et les rendez-vous du
              centre.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setAgendaView("day")}
                className={`h-9 rounded-lg px-3 text-sm font-bold transition-colors ${
                  agendaView === "day"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                Jour
              </button>
              <button
                type="button"
                onClick={() => setAgendaView("week")}
                className={`h-9 rounded-lg px-3 text-sm font-bold transition-colors ${
                  agendaView === "week"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                Semaine
              </button>
            </div>

            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <MultiCheckFilter
              allLabel="Toutes les cabines"
              label="cabines"
              options={cabinList.map((cabin) => ({
                id: cabin.id,
                name: cabin.name,
              }))}
              selectedIds={selectedCabinIds}
              onChange={setSelectedCabinIds}
            />

            <MultiCheckFilter
              allLabel="Toutes les praticiennes"
              label="praticiennes"
              options={practitionerList.map((practitioner) => ({
                id: practitioner.id,
                name: practitioner.name,
              }))}
              selectedIds={selectedPractitionerIds}
              onChange={setSelectedPractitionerIds}
            />

            <Button
              variant="outline"
              className="h-11 bg-white"
              onClick={() => void refreshAgenda()}
              disabled={isLoadingAgenda}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Actualiser
            </Button>

            <Button className="h-11 bg-slate-950" onClick={openAppointmentModal}>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau RDV
            </Button>
          </div>
        </header>

        {agendaError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {agendaError}
          </div>
        )}

        {agendaNotice && !agendaError && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            {agendaNotice}
          </div>
        )}

        {isLoadingAgenda && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-700">
            Chargement de l&apos;agenda...
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
          <AgendaTabButton
            active={activeTab === "agenda"}
            onClick={() => setActiveTab("agenda")}
          >
            Agenda
          </AgendaTabButton>
          <AgendaTabButton
            active={activeTab === "team"}
            onClick={() => setActiveTab("team")}
          >
            Planning équipe
          </AgendaTabButton>
        </div>

        {activeTab === "agenda" ? (
          <>
        <Card className="border-slate-200 bg-white py-0 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">
                  Horaires du jour
                </p>
                <p className="text-sm font-medium text-slate-950">
                  {selectedDayHours.label} ·{" "}
                  {isSelectedDayClosed
                    ? "Centre fermé"
                    : `${centerStartTime} - ${centerEndTime}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsHoursModalOpen(true)}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
            >
              Modifier les horaires
            </button>
          </CardContent>
        </Card>

        <Card className="border-amber-100 bg-amber-50 py-0 shadow-sm">
          <CardContent className="grid gap-4 p-5 lg:grid-cols-[240px_1fr] lg:items-start">
            <div>
              <p className="text-xs font-medium text-amber-700">
                À lire avant la journée
              </p>
              <h2 className="mt-1 text-base font-semibold text-slate-950">
                Informations importantes
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-amber-800">
                Vous pouvez noter ici les consignes visibles par toute
                l&apos;équipe.
              </p>
            </div>
            <textarea
              value={dailyInfo}
              onChange={(event) =>
                updateDailyInfoForSelectedDate(event.target.value)
              }
              rows={3}
              className="min-h-24 w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              placeholder="Ex : Aurélie arrive à 10h, attention pause déjeuner cabine 2 de 14h à 15h..."
            />
            <div className="flex flex-wrap items-center justify-end gap-3 lg:col-start-2">
              {dailyInfoSavedDate === selectedDate ? (
                <span className="text-xs font-bold text-emerald-700">
                  Consignes enregistrées pour le {formatAgendaDate(selectedDate)}
                </span>
              ) : (
                <span className="text-xs font-semibold text-amber-700">
                  Ces consignes concernent le {formatAgendaDate(selectedDate)}
                </span>
              )}
              <Button
                type="button"
                onClick={saveDailyInfo}
                className="h-9 bg-amber-600 px-4 hover:bg-amber-700"
              >
                Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            const isToConfirm = stat.label === "À confirmer";

            return (
              <Card
                key={stat.label}
                className={`border-slate-200 py-0 shadow-sm ${
                  isToConfirm ? "ring-0" : ""
                } ${
                  isToConfirm && isToConfirmOpen
                    ? "ring-2 ring-amber-300"
                    : ""
                }`}
              >
                <CardContent className="p-5">
                  {isToConfirm ? (
                    <button
                      type="button"
                      onClick={() => setIsToConfirmOpen((open) => !open)}
                      className="flex w-full items-center justify-between text-left"
                      aria-expanded={isToConfirmOpen}
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-500">
                          {stat.label}
                        </p>
                        <p className={`mt-2 text-xl font-semibold ${stat.color}`}>
                          {stat.value}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <Icon className={`h-6 w-6 ${stat.color}`} />
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-500">
                          {stat.label}
                        </p>
                        <p className={`mt-2 text-xl font-semibold ${stat.color}`}>
                          {stat.value}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <Icon className={`h-6 w-6 ${stat.color}`} />
                      </div>
                    </div>
                  )}

                  {isToConfirm && isToConfirmOpen ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {appointmentsToConfirm.length === 0 ? (
                        <p className="text-sm font-semibold text-slate-500">
                          Personne à confirmer
                        </p>
                      ) : (
                        appointmentsToConfirm.map((appointment) => (
                          <Link
                            key={appointment.id}
                            href={clientFicheHref(appointment)}
                            className="flex flex-col rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 transition-colors hover:border-amber-300 hover:bg-amber-100"
                          >
                            <span className="text-[11px] font-semibold capitalize leading-tight text-amber-700">
                              {formatConfirmChipDay(appointment.date)}
                              {appointment.start
                                ? ` · ${appointment.start}`
                                : ""}
                            </span>
                            <span className="text-sm font-medium">
                              {appointment.personName}
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="border-violet-100 bg-violet-50 py-0 shadow-sm">
          <CardContent className="grid gap-5 p-5 xl:grid-cols-[280px_1fr] xl:items-center">
            <div>
              <div className="mb-3 flex items-center gap-2 text-violet-900">
                <Sparkles className="h-5 w-5" />
                <h2 className="font-semibold">Seya Agenda</h2>
              </div>
              <p className="text-sm leading-6 text-violet-800">
                Seya pourra proposer automatiquement un créneau selon la
                cabine, la praticienne, le soin et les disponibilités.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Suggestion text="Relancer les nouveaux leads pour placer un créneau libre cette semaine." />
              <Suggestion text="Cabine 4 libre à 14:30 pour un bilan court." />
              <Suggestion text="Samantha a 2 créneaux disponibles avant 16:00." />
            </div>
            <div className="flex flex-col gap-2 rounded-xl bg-white/70 p-3 md:flex-row xl:col-span-2">
              <Input
                value={seyaCommand}
                onChange={(event) => setSeyaCommand(event.target.value)}
                placeholder="Ex : pause pendant 5 semaines sur toutes les cabines entre 14h et 15h"
                className="bg-white"
              />
              <Button
                type="button"
                onClick={createSeyaBlock}
                className="shrink-0 bg-violet-700 hover:bg-violet-800"
              >
                Créer le bloc
              </Button>
            </div>
            {seyaFeedback && (
              <p className="rounded-xl bg-white/70 px-3 py-2 text-sm font-semibold text-violet-800 xl:col-span-2">
                {seyaFeedback}
              </p>
            )}
          </CardContent>
        </Card>

        {movingAppointmentId && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
            Déplacement activé : cliquez sur un créneau libre pour poser le RDV.
          </div>
        )}

        <Card className="relative z-40 border-slate-200 py-0 shadow-sm">
          <CardContent className="flex flex-col gap-2 px-3 py-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="mr-2 text-xs font-medium text-slate-500">
                Praticiennes du jour
              </p>
              {practitionersOfDay.map((practitioner) => (
                <div
                  key={practitioner.id}
                  className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1"
                >
                  <span
                    className={`h-3 w-3 rounded-full ${practitioner.color}`}
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {practitioner.name}
                    </p>
                  </div>
                </div>
              ))}
              {practitionersOfDay.length === 0 && (
                <p className="text-sm font-semibold text-slate-400">
                  Aucune praticienne planifiée ce jour.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              {agendaView === "day" ? (
                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => slideCabinBoard(-1)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
                    aria-label="Voir les cabines à gauche"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => slideCabinBoard(1)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
                    aria-label="Voir les cabines à droite"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={removeCabin}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                    aria-label="Retirer une cabine"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={addCabin}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700"
                    aria-label="Ajouter une cabine"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              <AgendaDateNav
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setDailyInfoSavedDate(null);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {agendaView === "week" ? (
          <WeekSchedule
            appointmentList={appointmentList}
            cabinList={cabinList}
            centerDayHours={centerDayHours}
            paymentTone={(appointment) =>
              getPaymentTone(balanceDueIndex, appointment) ?? null
            }
            selectedCabinIds={selectedCabinIds}
            selectedDate={selectedDate}
            selectedPractitionerIds={selectedPractitionerIds}
            onDelete={deleteAppointment}
            onOpen={setSelectedAppointmentId}
          />
        ) : null}
          </>
        ) : (
          <TeamPlanning
            practitioners={practitionerList}
            schedules={teamSchedules}
            onAddPractitioner={addPractitioner}
            onPractitionerChange={updatePractitioner}
            onRemovePractitioner={removePractitioner}
            onScheduleChange={updateTeamSchedule}
          />
        )}
      </div>

        {activeTab === "agenda" && agendaView === "day" ? (
        <section className="sticky top-0 z-20 h-dvh bg-slate-100 px-4 pb-3 pt-1 lg:px-8">
          <div className="mx-auto h-full min-w-0 max-w-[1800px]">
          <Card className="relative z-0 h-full overflow-hidden border-slate-200 py-0 shadow-sm">
            <CardContent className="relative h-full min-w-0 p-0">
              <div
                ref={boardScrollRef}
                className="isolate h-full overflow-auto overscroll-contain"
              >
              <div
                className="min-w-full"
                style={{ minWidth: cabinBoardMinWidth }}
              >
              <div
                className="sticky top-0 z-30 grid border-b border-slate-200 bg-white text-sm font-bold text-slate-500 shadow-[0_8px_16px_-10px_rgba(15,23,42,0.45)]"
                style={{
                  gridTemplateColumns: cabinBoardColumns,
                }}
              >
                <div className="sticky left-0 z-40 border-r border-slate-100 bg-white px-3 py-1.5">
                  Heure
                </div>
                {visibleCabinList.map((cabin) => (
                  <div
                    key={cabin.id}
                    className={`border-r border-slate-100 bg-gradient-to-br ${cabin.color} px-2.5 py-1.5 text-white last:border-r-0`}
                  >
                    <input
                      value={cabin.name}
                      onChange={(event) =>
                        updateCabin(cabin.id, { name: event.target.value })
                      }
                      className="w-full rounded-md bg-white/10 px-2 py-1 font-bold text-white outline-none placeholder:text-white/70 focus:bg-white/20"
                    />
                    <input
                      value={cabin.equipment}
                      onChange={(event) =>
                        updateCabin(cabin.id, {
                          equipment: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white/80 outline-none placeholder:text-white/60 focus:bg-white/20"
                    />
                  </div>
                ))}
              </div>

              {isSelectedDayClosed ? (
                <div className="flex min-h-60 items-center justify-center border-t border-slate-100 p-8 text-center">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Centre fermé ce jour
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-500">
                      Modifiez les horaires de {selectedDayHours.label} plus
                      haut pour afficher les créneaux.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: cabinBoardColumns,
                    gridTemplateRows: `repeat(${agendaSlots.length}, ${SLOT_ROW_HEIGHT_REM}rem)`,
                  }}
                >
                  {agendaSlots.map((hour, slotIndex) => (
                    <div
                      key={`hour-${hour}`}
                      data-agenda-slot={hour}
                      className="sticky left-0 z-20 flex items-start border-r border-b border-slate-100 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-400"
                      style={{
                        gridColumn: 1,
                        gridRow: slotIndex + 1,
                      }}
                    >
                      {hour}
                    </div>
                  ))}

                  {visibleCabinList.flatMap((cabin, cabinIndex) =>
                    agendaSlots.map((hour, slotIndex) => {
                      const slotAppointments = getAppointmentsStartingAtSlot(
                        visibleAppointments,
                        cabin.id,
                        hour
                      );
                      const coveredByDuration =
                        isSlotCoveredByEarlierAppointment(
                          visibleAppointments,
                          cabin.id,
                          hour
                        );
                      const isUnavailable =
                        slotAppointments.length > 0 || coveredByDuration;

                      return (
                        <div
                          key={`${cabin.id}-${hour}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const appointmentId =
                              event.dataTransfer.getData("appointmentId");

                            if (appointmentId && !isUnavailable) {
                              moveAppointment(appointmentId, cabin.id, hour);
                              setMovingAppointmentId(null);
                            }
                          }}
                          className={`border-r border-b border-slate-100 p-0.5 last:border-r-0 ${cabin.softColor}`}
                          style={{
                            gridColumn: cabinIndex + 2,
                            gridRow: slotIndex + 1,
                          }}
                        >
                          {!isUnavailable ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (movingAppointmentId) {
                                  moveAppointment(
                                    movingAppointmentId,
                                    cabin.id,
                                    hour
                                  );
                                  setMovingAppointmentId(null);
                                  return;
                                }

                                setAppointmentForm(
                                  applyClientPositionStatus({
                                  ...emptyAppointment,
                                  cabinId: cabin.id,
                                  date: selectedDate,
                                  start: hour,
                                  treatment: getCabinTreatment(
                                    cabinList,
                                    cabin.id
                                  ),
                                  }),
                                );
                                setContactSearch("");
                                setPickedContact(null);
                                setEditingClient(false);
                                applyReminderDefaults();
                                setSelectedDepositLinkId("");
                                setSendBirthdaySms(true);
                                setIsModalOpen(true);
                                void refreshAgendaContacts();
                              }}
                              className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-slate-200 text-[10px] font-semibold text-slate-300 transition-colors [touch-action:pan-x_pan-y] hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                            >
                              Créneau libre
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}

                  {visibleAppointments.map((appointment) => {
                    const cabinIndex = visibleCabinList.findIndex(
                      (cabin) => cabin.id === appointment.cabinId
                    );
                    const slotIndex = closestAgendaSlotIndex(
                      agendaSlots,
                      appointment.start,
                    );

                    if (cabinIndex === -1 || slotIndex === -1) {
                      return null;
                    }

                    const slotSpan = Math.min(
                      getAppointmentSlotSpan(appointment.duration),
                      agendaSlots.length - slotIndex
                    );

                    return (
                      <div
                        key={appointment.id}
                        data-appointment-id={appointment.id}
                        className="z-10 p-0.5"
                        style={{
                          gridColumn: cabinIndex + 2,
                          gridRow: `${slotIndex + 1} / span ${slotSpan}`,
                        }}
                      >
                        <AppointmentCard
                          appointment={appointment}
                          practitionerList={practitionerList}
                          paymentTone={getPaymentTone(
                            balanceDueIndex,
                            appointment,
                          )}
                          focused={focusedAppointmentId === appointment.id}
                          selectedForMove={
                            movingAppointmentId === appointment.id
                          }
                          onOpen={() =>
                            setSelectedAppointmentId(appointment.id)
                          }
                          onDelete={() => deleteAppointment(appointment.id)}
                          onMove={() => startMoveAppointment(appointment.id)}
                          onStatusChange={(status) =>
                            updateAppointmentStatus(appointment, status)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
              </div>
            </CardContent>
          </Card>
          </div>
        </section>
        ) : null}

      {isHoursModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-blue-600">
                  Paramètres agenda
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">
                  Horaires du centre
                </h2>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Modifiez chaque journée une par une. Le planning utilise
                  automatiquement l&apos;horaire du jour sélectionné.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsHoursModalOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3">
              {centerDayHours.map((day) => (
                <div
                  key={day.weekday}
                  className={`grid gap-3 rounded-2xl border p-3 sm:grid-cols-[80px_1fr_auto] sm:items-center ${
                    day.weekday === selectedDayHours.weekday
                      ? "border-blue-200 bg-blue-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-900">
                    {day.label}
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      value={day.startTime}
                      disabled={day.closed}
                      onChange={(event) =>
                        updateCenterDayHours(day.weekday, {
                          startTime: event.target.value,
                        })
                      }
                      className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none disabled:opacity-40"
                    >
                      {timeOptions
                        .filter(
                          (time) =>
                            timeToMinutes(time) < timeToMinutes(day.endTime)
                        )
                        .map((time) => (
                          <option key={time}>{time}</option>
                        ))}
                    </select>
                    <span className="text-slate-300">-</span>
                    <select
                      value={day.endTime}
                      disabled={day.closed}
                      onChange={(event) =>
                        updateCenterDayHours(day.weekday, {
                          endTime: event.target.value,
                        })
                      }
                      className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none disabled:opacity-40"
                    >
                      {timeOptions
                        .filter(
                          (time) =>
                            timeToMinutes(time) > timeToMinutes(day.startTime)
                        )
                        .map((time) => (
                          <option key={time}>{time}</option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateCenterDayHours(day.weekday, {
                        closed: !day.closed,
                      })
                    }
                    className={`h-11 rounded-xl px-4 text-sm font-medium ${
                      day.closed
                        ? "bg-red-50 text-red-600"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {day.closed ? "Fermé" : "Ouvert"}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  void saveCenterHours(centerDayHours)
                    .then((nextHours) => setCenterDayHours(nextHours))
                    .catch(() => null)
                    .finally(() => setIsHoursModalOpen(false));
                }}
                className="rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white"
              >
                Valider les horaires
              </button>
            </div>
          </div>
        </div>
      )}

        {isModalOpen &&
        portalTarget &&
        createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingAppointment) {
              setIsModalOpen(false);
            }
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void addAppointment();
            }}
            className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Nouveau rendez-vous
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  À terme, ce formulaire pourra être ouvert directement depuis
                  un prospect ou une fiche client.
                </p>
              </div>
              <Bot className="h-6 w-6 text-violet-600" />
            </div>

            {agendaError ? (
              <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {agendaError}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
              <Field label="Type">
                <Select
                  value={appointmentForm.kind}
                  options={[
                    "Rendez-vous",
                    "Pause",
                    "Formation",
                    "Indisponible",
                  ]}
                  onChange={(value) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      kind: value as AppointmentKind,
                      source: value === "Rendez-vous" ? form.source : "Seya",
                      treatment:
                        value === "Rendez-vous" ? form.treatment : value,
                      personName:
                        value === "Rendez-vous"
                          ? form.personName
                          : form.personName || value,
                    }))
                  }
                />
              </Field>
              </div>

              {!isAgendaBlockKind(appointmentForm.kind) ? (
                <>
              {appointmentForm.kind === "Rendez-vous" &&
              !contactSearch.trim() &&
              !editingClient &&
              isAgendaClientReady(appointmentForm, pickedContact) ? (
                <div className="sm:col-span-2">
                  <SelectedClientChip
                    name={appointmentForm.personName}
                    email={appointmentForm.email}
                    phone={appointmentForm.phone}
                    onClear={clearSelectedClient}
                  />
                </div>
              ) : (
                <>
              <div
                className="relative sm:col-span-2"
                onBlur={(event) => {
                  if (
                    event.currentTarget.contains(event.relatedTarget as Node)
                  ) {
                    return;
                  }

                  if (isAgendaClientReady(appointmentForm, pickedContact)) {
                    setContactSearch("");
                    setEditingClient(false);
                  }
                }}
              >
                <Field label="Rechercher prospect ou client">
                  <Input
                    placeholder="Tapez 2 lettres, un téléphone ou un email..."
                    value={contactSearch}
                    onChange={(event) => {
                      setPickedContact(null);
                      setEditingClient(true);
                      setContactSearch(event.target.value);
                    }}
                  />
                </Field>

                {contactSearch.trim().length >= 2 && !pickedContact ? (
                  <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                    {contactMatches.length > 0 ? (
                      contactMatches.map((contact) => (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => selectContact(contact)}
                          className="flex w-full items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-blue-50"
                        >
                          <div>
                            <p className="font-bold text-slate-900">
                              {contact.name}
                            </p>
                            <p className="text-sm text-slate-500">
                              {contact.phone} · {contact.email}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {contact.type}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-4 py-3 text-sm font-semibold text-slate-500">
                        Aucun prospect ou client trouvé.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>

              <Field label="Téléphone">
                <Input
                  value={appointmentForm.phone}
                  onChange={(event) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      phone: event.target.value,
                    }))
                  }
                  onBlur={() => {
                    if (isAgendaClientReady(appointmentForm, pickedContact)) {
                      setContactSearch("");
                      setEditingClient(false);
                    }
                  }}
                />
              </Field>

              <Field label="Email">
                <Input
                  type="email"
                  value={appointmentForm.email}
                  onChange={(event) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      email: event.target.value,
                    }))
                  }
                  onBlur={() => {
                    if (isAgendaClientReady(appointmentForm, pickedContact)) {
                      setContactSearch("");
                      setEditingClient(false);
                    }
                  }}
                />
              </Field>

              <Field label="Nom">
                <Input
                  required={appointmentForm.kind === "Rendez-vous"}
                  value={appointmentForm.personName}
                  onChange={(event) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      personName: event.target.value,
                    }))
                  }
                  onBlur={() => {
                    if (isAgendaClientReady(appointmentForm, pickedContact)) {
                      setContactSearch("");
                      setEditingClient(false);
                    }
                  }}
                />
              </Field>
                </>
              )}

              {!(
                appointmentForm.kind === "Rendez-vous" &&
                !contactSearch.trim() &&
                !editingClient &&
                isAgendaClientReady(appointmentForm, pickedContact)
              ) ? (
              <Field label="Date d'anniversaire">
                <Input
                  type="date"
                  value={appointmentForm.birthDate}
                  onChange={(event) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      birthDate: event.target.value,
                    }))
                  }
                />
              </Field>
              ) : null}

              <Field label="Prestation">
                  <TreatmentPicker
                    cabinList={cabinList}
                    duration={appointmentForm.duration}
                    practitionerList={practitionerList}
                    value={appointmentForm.treatment}
                    onChange={(next) =>
                      setAppointmentForm((form) => ({
                        ...form,
                        treatment: next.treatment,
                        duration: next.duration ?? form.duration,
                        cabinId:
                          next.cabinId &&
                          cabinList.some((cabin) => cabin.id === next.cabinId)
                            ? next.cabinId
                            : form.cabinId,
                        practitionerId:
                          next.practitionerId &&
                          practitionerList.some(
                            (practitioner) =>
                              practitioner.id === next.practitionerId,
                          )
                            ? next.practitionerId
                            : form.practitionerId,
                      }))
                    }
                  />
              </Field>

              <Field label="Provenance">
                <Select
                  value={appointmentForm.source}
                  options={["Client", "Prospect", "Seya", "Organique"]}
                  onChange={(value) =>
                    setAppointmentForm((form) =>
                      applyClientPositionStatus({
                        ...form,
                        source: value as AppointmentSource,
                      }),
                    )
                  }
                />
              </Field>

              <Field label="Cabine">
                <Select
                  value={appointmentForm.cabinId}
                  options={cabinList.map((cabin) => cabin.id)}
                  labels={Object.fromEntries(
                    cabinList.map((cabin) => [cabin.id, cabin.name])
                  )}
                  onChange={(value) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      cabinId: value,
                      treatment:
                        form.kind !== "Rendez-vous" || form.treatment
                          ? form.treatment
                          : getCabinTreatment(cabinList, value),
                    }))
                  }
                />
              </Field>

              <Field label="Praticienne">
                <Select
                  value={appointmentForm.practitionerId}
                  options={practitionerList.map((practitioner) => practitioner.id)}
                  labels={Object.fromEntries(
                    practitionerList.map((practitioner) => [
                      practitioner.id,
                      practitioner.name,
                    ])
                  )}
                  onChange={(value) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      practitionerId: value,
                    }))
                  }
                />
              </Field>
                </>
              ) : null}

              <Field label="Date">
                <Input
                  required
                  type="date"
                  value={appointmentForm.date}
                  onChange={(event) =>
                    setAppointmentForm((form) =>
                      applyClientPositionStatus({
                        ...form,
                        date: event.target.value,
                      }),
                    )
                  }
                />
              </Field>

              <Field label="Heure">
                <Select
                  value={appointmentForm.start}
                  options={agendaSlots}
                  onChange={(value) =>
                    setAppointmentForm((form) =>
                      applyClientPositionStatus({ ...form, start: value }),
                    )
                  }
                />
              </Field>

              <Field label="Durée">
                <Select
                  value={String(appointmentForm.duration)}
                  options={durationSelectOptions(appointmentForm.duration)}
                  labels={appointmentDurationLabels}
                  onChange={(value) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      duration: Number(value),
                    }))
                  }
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Commentaire">
                  <textarea
                    value={appointmentForm.notes}
                    onChange={(event) =>
                      setAppointmentForm((form) => ({
                        ...form,
                        notes: event.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    placeholder="Note interne, consigne, préférence cliente..."
                  />
                </Field>
              </div>
            </div>

            {!isAgendaBlockKind(appointmentForm.kind) ? (
            <div className="mt-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              {smsSettings?.confirmationEnabled !== false ? (
              <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={sendSmsNow}
                  disabled={!appointmentForm.phone.trim()}
                  onChange={(event) => setSendSmsNow(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Envoyer le SMS dès que le RDV est posé
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    Uniquement ce SMS. Les autres cases ci-dessous partent seulement si tu les coches aussi.
                  </span>
                </span>
              </label>
              ) : null}
              {smsSettings?.confirmationEmailEnabled !== false ? (
              <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={sendEmailNow}
                  disabled={!appointmentForm.email.trim()}
                  onChange={(event) => setSendEmailNow(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Envoyer le mail de confirmation
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    Part sur l’email de la fiche client. Même texte que le SMS de confirmation.
                  </span>
                </span>
              </label>
              ) : null}
              {laserAppointment && smsSettings?.reminderJ7Enabled !== false ? (
                <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={sendSmsJ7}
                    disabled={!appointmentForm.phone.trim()}
                    onChange={(event) => setSendSmsJ7(event.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    Envoyer les contre-indications laser à J-7
                    <span className="mt-1 block text-xs font-semibold text-slate-500">
                      Uniquement pour un RDV laser. Programmé 7 jours avant.
                    </span>
                  </span>
                </label>
              ) : null}
              {smsSettings?.reminderJ5Enabled ? (
              <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={sendSmsJ5}
                  disabled={!appointmentForm.phone.trim()}
                  onChange={(event) => setSendSmsJ5(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Envoyer un SMS de rappel J-5
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    5 jours avant le RDV. Pré-coché si tu l’actives dans Envoi SMS.
                  </span>
                </span>
              </label>
              ) : null}
              {smsSettings?.reminder48hEnabled ? (
              <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={sendSms48h}
                  disabled={!appointmentForm.phone.trim()}
                  onChange={(event) => setSendSms48h(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Envoyer un SMS de rappel 48h avant
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    Programmé seulement si tu coches. Si le RDV est supprimé avant, le SMS ne part pas.
                  </span>
                </span>
              </label>
              ) : null}
              {smsSettings?.reminder24hEnabled ? (
              <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={sendSms24h}
                  disabled={!appointmentForm.phone.trim()}
                  onChange={(event) => setSendSms24h(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Envoyer un SMS de rappel 24h avant / la veille
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    La veille du RDV. Pré-coché si tu l’actives dans Envoi SMS.
                  </span>
                </span>
              </label>
              ) : null}
              {smsSettings?.birthdaySmsEnabled !== false ? (
              <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={sendBirthdaySms}
                  disabled={
                    !appointmentForm.phone.trim() || !appointmentForm.birthDate
                  }
                  onChange={(event) => setSendBirthdaySms(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Envoyer le SMS anniversaire le jour J
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    Utilise le modèle Anniversaire. Envoyé automatiquement le jour de son anniversaire.
                  </span>
                </span>
              </label>
              ) : null}
              <DepositLinkChooser
                links={depositLinks}
                phone={appointmentForm.phone}
                selectedId={selectedDepositLinkId}
                onChange={setSelectedDepositLinkId}
              />
            </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={isSavingAppointment}
                onClick={() => setIsModalOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                disabled={isSavingAppointment}
                onClick={() => {
                  void addAppointment();
                }}
              >
                {isSavingAppointment ? "Création…" : "Créer le RDV"}
              </Button>
            </div>
          </form>
        </div>,
        portalTarget,
      )}

      {selectedAppointment &&
        portalTarget &&
        createPortal(
          <AppointmentDetailsModal
            appointment={selectedAppointment}
            agendaSlots={agendaSlots}
            cabinList={cabinList}
            practitionerList={practitionerList}
            depositLinks={depositLinks}
            smsSettings={smsSettings}
            onClose={() => setSelectedAppointmentId(null)}
            onDelete={() => deleteAppointment(selectedAppointment.id)}
            onSave={updateAppointment}
          />,
          portalTarget,
        )}

      {moveNotifyAppointment &&
        portalTarget &&
        createPortal(
          <MoveNotifyDialog
            appointment={moveNotifyAppointment}
            sending={isSendingMoveNotify}
            smsSettings={smsSettings}
            onClose={() => {
              if (isSendingMoveNotify) {
                return;
              }
              setMoveNotifyAppointment(null);
              setAgendaNotice("RDV déplacé.");
            }}
            onSend={async (notify) => {
              setIsSendingMoveNotify(true);
              try {
                await sendSelectedConfirmations(
                  moveNotifyAppointment,
                  notify,
                  "RDV déplacé.",
                );
              } finally {
                setIsSendingMoveNotify(false);
                setMoveNotifyAppointment(null);
              }
            }}
          />,
          portalTarget,
        )}
    </main>
  );
}

function AgendaDateNav({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    parseIsoDate(selectedDate)
  );
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const today = todayIso();
  const calendarDays = getCalendarGrid(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth()
  );

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function placePanel() {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const width = 288;
      const left = Math.min(
        Math.max(12, rect.right - width),
        window.innerWidth - width - 12,
      );

      setPanelStyle({
        position: "fixed",
        top: rect.bottom + 8,
        left,
        zIndex: 80,
      });
    }

    placePanel();
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function shiftMonth(amount: number) {
    setVisibleMonth(
      (currentMonth) =>
        new Date(currentMonth.getFullYear(), currentMonth.getMonth() + amount, 1)
    );
  }

  function chooseDate(date: string) {
    onSelectDate(date);
    setIsOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
    >
      <button
        type="button"
        onClick={() => onSelectDate(addDaysIso(selectedDate, -1))}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
        aria-label="Jour précédent"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setVisibleMonth(parseIsoDate(selectedDate));
          setIsOpen((open) => !open);
        }}
        className={`flex min-w-48 items-center justify-center gap-2 rounded-lg px-2 py-1 text-center transition-colors hover:bg-slate-50 ${
          isOpen ? "bg-violet-50" : ""
        }`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Choisir une date, actuellement ${formatAgendaDateLong(selectedDate)}`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-violet-600" />
        <p className="text-sm font-medium text-slate-950">
          {formatAgendaDateLong(selectedDate)}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onSelectDate(addDaysIso(selectedDate, 1))}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
        aria-label="Jour suivant"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => chooseDate(today)}
        className="h-9 rounded-lg px-3 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-50"
      >
        Aujourd&apos;hui
      </button>

      {isOpen && portalTarget
        ? createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choisir une date"
          style={panelStyle}
          className="w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
              aria-label="Mois précédent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-medium capitalize text-slate-950">
              {formatMonthTitle(visibleMonth)}
            </p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
              aria-label="Mois suivant"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {weekDays.map((day) => (
              <p
                key={day.label}
                className="py-1 text-center text-[11px] font-semibold uppercase text-slate-400"
              >
                {day.label}
              </p>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const isoDate = formatDateInput(day);
              const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
              const isSelected = isoDate === selectedDate;
              const isToday = isoDate === today;

              return (
                <button
                  key={isoDate}
                  type="button"
                  onClick={() => chooseDate(isoDate)}
                  className={`h-9 rounded-lg text-sm font-bold transition-colors ${
                    isSelected
                      ? "bg-violet-600 text-white shadow-sm"
                      : isToday
                        ? "text-violet-700 ring-1 ring-violet-200 hover:bg-violet-50"
                        : isCurrentMonth
                          ? "text-slate-800 hover:bg-slate-100"
                          : "text-slate-300 hover:bg-slate-50"
                  }`}
                  aria-current={isToday ? "date" : undefined}
                  aria-label={formatAgendaDateLong(isoDate)}
                  aria-pressed={isSelected}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>,
        portalTarget,
      ) : null}
    </div>
  );
}

function AgendaTabButton({
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

function WeekSchedule({
  appointmentList,
  cabinList,
  centerDayHours,
  paymentTone: appointmentPaymentTone,
  onDelete,
  onOpen,
  selectedCabinIds,
  selectedDate,
  selectedPractitionerIds,
}: {
  appointmentList: Appointment[];
  cabinList: Cabin[];
  centerDayHours: CenterDayHours[];
  paymentTone: (appointment: Appointment) => ReturnType<typeof getPaymentTone>;
  onDelete: (appointmentId: string) => void;
  onOpen: (appointmentId: string) => void;
  selectedCabinIds: string[];
  selectedDate: string;
  selectedPractitionerIds: string[];
}) {
  const weekDates = getWeekDates(selectedDate).filter(
    (date) => !isCenterDayClosed(centerDayHours, date),
  );
  const weekColClass =
    {
      1: "lg:grid-cols-1",
      2: "lg:grid-cols-2",
      3: "lg:grid-cols-3",
      4: "lg:grid-cols-4",
      5: "lg:grid-cols-5",
      6: "lg:grid-cols-6",
      7: "lg:grid-cols-7",
    }[weekDates.length] ?? "lg:grid-cols-7";
  const appointmentsByDate = weekDates.map((date) => {
    const dayAppointments = appointmentList
      .filter((appointment) => {
        const dateMatch = appointment.date === date;
        const cabinMatch = matchesMultiSelection(
          selectedCabinIds,
          appointment.cabinId,
        );
        const practitionerMatch = matchesMultiSelection(
          selectedPractitionerIds,
          appointment.practitionerId,
        );

        return dateMatch && cabinMatch && practitionerMatch;
      })
      .sort((current, next) => current.start.localeCompare(next.start));

    return { date, appointments: dayAppointments };
  });

  return (
    <Card className="border-slate-200 py-0 shadow-sm">
      <CardContent className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Vue semaine</h2>
            <p className="text-sm font-semibold text-slate-500">
              {weekDates.length > 1
                ? `Du ${formatAgendaDate(weekDates[0])} au ${formatAgendaDate(weekDates[weekDates.length - 1])}`
                : weekDates[0]
                  ? formatAgendaDate(weekDates[0])
                  : "Aucun jour ouvert cette semaine"}
            </p>
          </div>
          <div className="rounded-xl bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">
            {appointmentsByDate.reduce(
              (total, day) => total + day.appointments.length,
              0
            )}{" "}
            blocs / RDV
          </div>
        </div>

        <div className={`grid gap-3 ${weekColClass}`}>
          {appointmentsByDate.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-400">
              Aucun jour ouvert cette semaine.
            </div>
          ) : null}
          {appointmentsByDate.map(({ date, appointments: dayAppointments }) => (
            <div
              key={date}
              className="min-h-72 rounded-2xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="mb-3 rounded-xl bg-white p-3">
                <p className="text-sm font-medium text-slate-950">
                  {formatWeekday(date)}
                </p>
                <p className="text-xs font-bold text-slate-400">
                  {formatAgendaDate(date)}
                </p>
              </div>

              <div className="space-y-2">
                {dayAppointments.length > 0 ? (
                  dayAppointments.map((appointment) => {
                    const cabin = cabinList.find(
                      (item) => item.id === appointment.cabinId
                    );
                    const tone = appointmentPaymentTone(appointment);

                    return (
                      <article
                        key={appointment.id}
                        data-appointment-id={appointment.id}
                        onClick={() => onOpen(appointment.id)}
                        className={`w-full rounded-xl border p-3 text-left text-sm shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md ${
                          statusClasses[appointment.status]
                        } ${tone ? paymentToneStyles[tone].ring : ""}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            onOpen(appointment.id);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="flex items-center gap-1.5 font-semibold">
                              {appointment.start} · {appointment.personName}
                              {tone ? (
                                <CreditCard
                                  className={`h-3.5 w-3.5 shrink-0 ${paymentToneStyles[tone].icon}`}
                                  aria-label={paymentToneStyles[tone].label}
                                />
                              ) : null}
                            </p>
                            <p className="mt-1 text-xs font-semibold opacity-75">
                              {appointment.duration} min ·{" "}
                              {cabin?.name ?? appointment.cabinId}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(appointment.id);
                            }}
                            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            aria-label="Supprimer le rendez-vous"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="mt-2 text-xs font-bold">
                          {appointment.treatment}
                        </p>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-5 text-center text-xs font-bold text-slate-300">
                    Aucun bloc
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TeamPlanning({
  practitioners,
  schedules,
  onAddPractitioner,
  onPractitionerChange,
  onRemovePractitioner,
  onScheduleChange,
}: {
  practitioners: Practitioner[];
  schedules: TeamSchedule[];
  onAddPractitioner: () => void;
  onPractitionerChange: (
    practitionerId: string,
    updates: Partial<Practitioner>,
  ) => void;
  onRemovePractitioner: (practitionerId: string) => void;
  onScheduleChange: (
    practitionerId: string,
    updates: Partial<TeamSchedule>
  ) => void;
}) {
  const teamTimeOptions = timeOptions.filter((hour) => hour !== "19:00");

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 py-0 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-violet-700">
              <CalendarCheck className="h-5 w-5" />
              <h2 className="text-base font-semibold text-slate-950">
                Planning équipe
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Modifiez les noms, les couleurs et les horaires de chaque jour.
              Les absences se posent d’une date à une autre, avec un motif
              modifiable.
            </p>
          </div>
          <Button
            className="bg-violet-700 hover:bg-violet-800"
            onClick={onAddPractitioner}
          >
            <Plus className="mr-2 h-4 w-4" />
            Ajouter une praticienne
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {schedules.map((schedule) => {
          const practitioner = practitioners.find(
            (item) => item.id === schedule.practitionerId
          );
          const activeDays = weekDays.filter((day) =>
            schedule.workingDays.includes(day.value)
          );

          if (!practitioner) {
            return null;
          }

          return (
            <Card
              key={schedule.practitionerId}
              className="border-slate-200 py-0 shadow-sm"
            >
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-3.5 w-3.5 shrink-0 rounded-full ${practitioner.color}`}
                      />
                      <Input
                        value={practitioner.name}
                        onChange={(event) =>
                          onPractitionerChange(schedule.practitionerId, {
                            name: event.target.value,
                          })
                        }
                        className="h-10 font-medium"
                        aria-label="Nom de la praticienne"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {practitionerColorOptions.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() =>
                            onPractitionerChange(schedule.practitionerId, {
                              color,
                            })
                          }
                          className={`h-6 w-6 rounded-full ${color} ${
                            practitioner.color === color
                              ? "ring-2 ring-slate-900 ring-offset-2"
                              : "opacity-70 hover:opacity-100"
                          }`}
                          aria-label={`Couleur ${color}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                      {activeDays.length} j / semaine
                    </span>
                    {practitioners.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          onRemovePractitioner(schedule.practitionerId)
                        }
                        className="text-xs font-semibold text-slate-400 hover:text-rose-600"
                      >
                        Retirer
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_120px_1fr]">
                  <Field label="Début">
                    <Input
                      type="date"
                      value={schedule.startDate}
                      onChange={(event) =>
                        onScheduleChange(schedule.practitionerId, {
                          startDate: event.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field label="Période">
                    <Select
                      value={String(schedule.months)}
                      options={["1", "3", "6"]}
                      labels={{
                        "1": "1 mois",
                        "3": "3 mois",
                        "6": "6 mois",
                      }}
                      onChange={(value) =>
                        onScheduleChange(schedule.practitionerId, {
                          months: Number(value) as TeamSchedule["months"],
                        })
                      }
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Arrivée">
                      <Select
                        value={schedule.startTime}
                        options={teamTimeOptions}
                        onChange={(value) =>
                          onScheduleChange(schedule.practitionerId, {
                            startTime: value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Départ">
                      <Select
                        value={schedule.endTime}
                        options={timeOptions}
                        onChange={(value) =>
                          onScheduleChange(schedule.practitionerId, {
                            endTime: value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onScheduleChange(schedule.practitionerId, {
                          workingDays: [1, 2, 3, 4, 5],
                        })
                      }
                      className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      Semaine
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onScheduleChange(schedule.practitionerId, {
                          workingDays: [1, 2, 3, 5, 6],
                        })
                      }
                      className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100"
                    >
                      Sauf jeu/dim
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onScheduleChange(schedule.practitionerId, {
                          workingDays: [],
                        })
                      }
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-200"
                    >
                      Repos
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {weekDays.map((day) => {
                      const checked = schedule.workingDays.includes(day.value);

                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() =>
                            onScheduleChange(schedule.practitionerId, {
                              workingDays: checked
                                ? schedule.workingDays.filter(
                                    (value) => value !== day.value
                                  )
                                : [...schedule.workingDays, day.value].sort(
                                    (left, right) => left - right,
                                  ),
                              dayHours: checked
                                ? schedule.dayHours.filter(
                                    (item) => item.weekday !== day.value,
                                  )
                                : schedule.dayHours,
                            })
                          }
                          className={`min-h-16 rounded-xl border text-sm font-medium transition-colors ${
                            checked
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-50 text-slate-300"
                          }`}
                        >
                          <span className="block">{day.label}</span>
                          <span className="mt-1 block text-lg">
                            {checked ? "✓" : "—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {activeDays.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold text-slate-500">
                        Horaires par jour
                      </p>
                      {activeDays.map((day) => {
                        const hours = dayHoursForSchedule(schedule, day.value);
                        return (
                          <div
                            key={day.value}
                            className="grid grid-cols-[64px_1fr_1fr] items-center gap-2"
                          >
                            <span className="text-sm font-medium text-slate-700">
                              {day.label}
                            </span>
                            <Select
                              value={hours.startTime}
                              options={teamTimeOptions}
                              onChange={(value) =>
                                onScheduleChange(schedule.practitionerId, {
                                  dayHours: upsertDayHours(
                                    schedule.dayHours,
                                    day.value,
                                    value,
                                    hours.endTime,
                                  ),
                                })
                              }
                            />
                            <Select
                              value={hours.endTime}
                              options={timeOptions}
                              onChange={(value) =>
                                onScheduleChange(schedule.practitionerId, {
                                  dayHours: upsertDayHours(
                                    schedule.dayHours,
                                    day.value,
                                    hours.startTime,
                                    value,
                                  ),
                                })
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-3 grid gap-2 md:grid-cols-2">
                    <Field label="Du">
                      <Input
                        type="date"
                        value={schedule.absenceStartDate}
                        onChange={(event) =>
                          onScheduleChange(schedule.practitionerId, {
                            absenceStartDate: event.target.value,
                          })
                        }
                        className="bg-white"
                      />
                    </Field>
                    <Field label="Au">
                      <Input
                        type="date"
                        value={schedule.absenceEndDate}
                        onChange={(event) =>
                          onScheduleChange(schedule.practitionerId, {
                            absenceEndDate: event.target.value,
                          })
                        }
                        className="bg-white"
                      />
                    </Field>
                    <Field label="Motif">
                      <Select
                        value={schedule.absenceType}
                        options={[...teamAbsenceTypes]}
                        onChange={(value) =>
                          onScheduleChange(schedule.practitionerId, {
                            absenceType: value as TeamAbsenceType,
                          })
                        }
                      />
                    </Field>
                    <Field label="Précision (optionnel)">
                      <Input
                        value={schedule.absenceNote}
                        onChange={(event) =>
                          onScheduleChange(schedule.practitionerId, {
                            absenceNote: event.target.value,
                          })
                        }
                        placeholder="Ex. mariage, déplacement…"
                        className="bg-white"
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() => addTeamAbsence(schedule, onScheduleChange)}
                    className="mb-3 rounded-lg bg-violet-100 px-3 py-2 text-xs font-medium text-violet-800 transition-colors hover:bg-violet-200"
                  >
                    Ajouter l’absence
                  </button>

                  {schedule.absences.length > 0 ? (
                    <div className="space-y-2">
                      {schedule.absences
                        .slice()
                        .sort((current, next) =>
                          current.startDate.localeCompare(next.startDate)
                        )
                        .map((absence) => (
                          <div
                            key={absence.id}
                            className={`rounded-xl px-3 py-2 ${absenceTypeClasses(absence.type)}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-bold">
                                {formatAbsenceRange(absence)}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  onScheduleChange(schedule.practitionerId, {
                                    absences: schedule.absences.filter(
                                      (item) => item.id !== absence.id
                                    ),
                                  })
                                }
                                className="rounded-md p-1 hover:bg-white/70"
                                title="Supprimer cette absence"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <Select
                                value={absence.type}
                                options={[...teamAbsenceTypes]}
                                onChange={(value) =>
                                  onScheduleChange(schedule.practitionerId, {
                                    absences: schedule.absences.map((item) =>
                                      item.id === absence.id
                                        ? {
                                            ...item,
                                            type: value as TeamAbsenceType,
                                          }
                                        : item,
                                    ),
                                  })
                                }
                              />
                              <Input
                                value={absence.note}
                                onChange={(event) =>
                                  onScheduleChange(schedule.practitionerId, {
                                    absences: schedule.absences.map((item) =>
                                      item.id === absence.id
                                        ? {
                                            ...item,
                                            note: event.target.value,
                                          }
                                        : item,
                                    ),
                                  })
                                }
                                placeholder="Motif / précision"
                                className="bg-white"
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-slate-400">
                      Aucune absence ponctuelle prévue.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s/g, "");
}

function matchesAgendaContact(contact: CrmAgendaContact, query: string) {
  const normalizedQuery = normalize(query);
  const queryDigits = query.replace(/[^\d]/g, "");
  const name = normalize(contact.name);
  const [firstName = "", ...lastNameParts] = contact.name.trim().split(/\s+/);
  const lastName = lastNameParts.join(" ");

  return (
    name.includes(normalizedQuery) ||
    normalize(firstName).startsWith(normalizedQuery) ||
    normalize(lastName).startsWith(normalizedQuery) ||
    normalize(contact.email).includes(normalizedQuery) ||
    normalize(contact.phone).includes(normalizedQuery) ||
    (queryDigits.length >= 2 &&
      contact.phone.replace(/[^\d]/g, "").includes(queryDigits))
  );
}

function upsertDayHours(
  dayHours: TeamSchedule["dayHours"],
  weekday: number,
  startTime: string,
  endTime: string,
) {
  return [
    ...dayHours.filter((item) => item.weekday !== weekday),
    { weekday, startTime, endTime },
  ].sort((left, right) => left.weekday - right.weekday);
}

function formatAbsenceRange(absence: TeamAbsence) {
  if (absence.startDate === absence.endDate) {
    return formatAgendaDate(absence.startDate);
  }

  return `${formatAgendaDate(absence.startDate)} → ${formatAgendaDate(absence.endDate)}`;
}

function absenceTypeClasses(type: TeamAbsenceType) {
  if (type === "Congé payé") return "bg-sky-100 text-sky-800";
  if (type === "Congé sans solde") return "bg-amber-100 text-amber-800";
  if (type === "Exceptionnel") return "bg-violet-100 text-violet-800";
  if (type === "Vacance") return "bg-cyan-100 text-cyan-800";
  if (type === "Repos exceptionnel") return "bg-rose-100 text-rose-800";
  if (type === "Arrêt maladie") return "bg-orange-100 text-orange-800";
  return "bg-slate-200 text-slate-700";
}

function addTeamAbsence(
  schedule: TeamSchedule,
  onScheduleChange: (
    practitionerId: string,
    updates: Partial<TeamSchedule>
  ) => void
) {
  const start = schedule.absenceStartDate;
  const end = schedule.absenceEndDate || start;
  if (!start) {
    return;
  }

  const startDate = start <= end ? start : end;
  const endDate = end >= start ? end : start;
  const nextAbsence: TeamAbsence = {
    id: crypto.randomUUID(),
    startDate,
    endDate,
    type: schedule.absenceType,
    note: schedule.absenceNote.trim(),
  };
  const absences = [
    ...schedule.absences.filter(
      (absence) =>
        !(
          absence.startDate === nextAbsence.startDate &&
          absence.endDate === nextAbsence.endDate &&
          absence.type === nextAbsence.type
        ),
    ),
    nextAbsence,
  ];

  onScheduleChange(schedule.practitionerId, {
    absences,
    absenceNote: "",
  });
}

function isAgendaBlockKind(kind?: AppointmentKind | string) {
  return kind === "Pause" || kind === "Formation" || kind === "Indisponible";
}

function isAppointmentSource(value: string): value is AppointmentSource {
  return ["Prospect", "Client", "Seya", "Organique"].includes(value);
}

function getAgendaFocus(searchParams: Pick<URLSearchParams, "get">) {
  const date = searchParams.get("date");
  const appointmentId = searchParams.get("rdv");
  const start = searchParams.get("heure");

  if (!date && !appointmentId && !start) {
    return null;
  }

  return {
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    appointmentId: appointmentId?.trim() || null,
    start: start && /^\d{2}:\d{2}/.test(start) ? start.slice(0, 5) : null,
  };
}

function getRdvPrefill(searchParams: Pick<URLSearchParams, "get">) {
  if (searchParams.get("newRdv") !== "1") {
    return null;
  }

  const source = searchParams.get("source") ?? "Prospect";

  return {
    personName: searchParams.get("name") ?? "",
    phone: searchParams.get("phone") ?? "",
    treatment: searchParams.get("treatment") ?? "",
    date: searchParams.get("date") ?? todayIso(),
    source: isAppointmentSource(source) ? source : "Prospect",
  };
}

function isLaserRdv(treatment: string, cabinId: string, cabinList: Cabin[]) {
  const cabin = cabinList.find((cabin) => cabin.id === cabinId);
  const service = getCenterServices().find(
    (item) => item.name.trim().toLowerCase() === treatment.trim().toLowerCase(),
  );

  return isLaserTreatment(treatment, cabin?.equipment, service?.category);
}

function getCabinTreatment(cabinList: Cabin[], cabinId: string) {
  const equipment = cabinList.find((cabin) => cabin.id === cabinId)?.equipment;
  const mainEquipment = equipment?.split("/")[0]?.trim();

  if (!mainEquipment) {
    return "";
  }

  if (normalize(mainEquipment).includes("laser")) {
    return "Épilation Laser";
  }

  return mainEquipment;
}

function parseSeyaBlockCommand(
  command: string,
  fallbackDate: string,
  cabinList: Cabin[],
  centerStartTime: string,
  centerEndTime: string
): ParsedSeyaBlock | null {
  const normalized = normalize(command);

  if (!normalized) {
    return null;
  }

  const action: ParsedSeyaBlock["action"] =
    normalized.includes("supprime") ||
    normalized.includes("supprimer") ||
    normalized.includes("enleve") ||
    normalized.includes("enlever") ||
    normalized.includes("retire") ||
    normalized.includes("retirer") ||
    normalized.includes("efface") ||
    normalized.includes("effacer")
      ? "delete"
      : "create";
  const kind: AppointmentKind = normalized.includes("formation")
    ? "Formation"
    : normalized.includes("pause")
      ? "Pause"
      : "Indisponible";
  const label =
    normalized.includes("ferme") || normalized.includes("fermer")
      ? "Fermeture"
      : kind;
  const cabinMatch =
    normalized.match(/cabine(\d)/) ?? normalized.match(/bilan(\d)/);
  const allCabins =
    normalized.includes("toutelescabine") ||
    normalized.includes("touteslescabine") ||
    normalized.includes("touteslescabines") ||
    normalized.includes("toutescabines") ||
    normalized.includes("chaquecabine");
  const cabinIds = allCabins || (action === "delete" && !cabinMatch)
    ? cabinList.map((cabin) => cabin.id)
    : cabinMatch?.[1]
      ? [`cabine-${cabinMatch[1]}`]
      : [cabinList[0]?.id ?? "cabine-1"];
  const date = extractFrenchDate(command) ?? fallbackDate;
  const timeRangeMatch = normalized.match(
    /(\d{1,2})h(?:(\d{2}))?.*?(?:a|jusqua|jusquau|entre|et)(\d{1,2})h(?:(\d{2}))?/
  );
  const singleTimeMatch = normalized.match(
    /(?:apartirde|a|de|des|vers)?(\d{1,2})h(?:(\d{2}))?/
  );
  const fullDay =
    normalized.includes("toutelajournee") ||
    normalized.includes("toutelajourne") ||
    normalized.includes("toutejourne") ||
    normalized.includes("journeecomplete") ||
    normalized.includes("journeeentiere") ||
    normalized.includes("journecomplete") ||
    normalized.includes("journeentiere") ||
    normalized.includes("toutejournee") ||
    normalized.includes("fermelajournee") ||
    normalized.includes("fermeturejournee") ||
    normalized.includes("fermeturejourne");
  const startMinutes = fullDay
    ? timeToMinutes(centerStartTime)
    : timeRangeMatch
      ? Number(timeRangeMatch[1]) * 60 + Number(timeRangeMatch[2] ?? "0")
      : singleTimeMatch
        ? Number(singleTimeMatch[1]) * 60 + Number(singleTimeMatch[2] ?? "0")
        : timeToMinutes(centerStartTime);
  const endMinutes = fullDay
    ? timeToMinutes(centerEndTime)
    : timeRangeMatch
      ? Number(timeRangeMatch[3]) * 60 + Number(timeRangeMatch[4] ?? "0")
      : startMinutes + 60;
  const start = minutesToTime(startMinutes);
  const weeksMatch = normalized.match(/(\d{1,2})(?:semaine|semaines)/);
  const weekdays = extractWeekdays(normalized);
  const onlyThisMonth =
    normalized.includes("dumois") ||
    normalized.includes("surlemois") ||
    normalized.includes("cemois") ||
    normalized.includes("moisencours");
  const everyDay =
    normalized.includes("touslesjours") ||
    normalized.includes("toutlesjours") ||
    normalized.includes("chaquejour") ||
    normalized.includes("quotidien");
  const everyOtherWeek =
    normalized.includes("surdeux") ||
    normalized.includes("sur2") ||
    normalized.includes("touteslesdeuxsemaines") ||
    normalized.includes("unesemainesurdeux") ||
    normalized.includes("1semainesur2");
  const weekCount = weeksMatch ? Number(weeksMatch[1]) : weekdays.length ? 5 : 0;
  const dates = everyDay
    ? createEveryDayDates(date, {
        onlyThisMonth,
        weekCount: Math.max(1, weekCount || 1),
      })
    : weekdays.length
    ? createRecurringWeekdayDates(date, weekdays, {
        everyOtherWeek,
        onlyThisMonth,
        weekCount: Math.max(1, weekCount),
      })
    : weeksMatch
      ? Array.from({ length: Number(weeksMatch[1]) * 7 }, (_, index) =>
          addDaysIso(date, index)
        )
      : [date];

  return {
    action,
    cabinIds,
    date,
    dates,
    duration: Math.max(15, endMinutes - startMinutes),
    kind,
    label,
    start,
  };
}

function appointmentOverlapsBlock(
  appointment: Appointment,
  block: Pick<ParsedSeyaBlock, "start" | "duration">
) {
  const appointmentStart = timeToMinutes(appointment.start);
  const appointmentEnd = appointmentStart + appointment.duration;
  const blockStart = timeToMinutes(block.start);
  const blockEnd = blockStart + block.duration;

  return appointmentStart < blockEnd && appointmentEnd > blockStart;
}

function extractWeekdays(normalized: string) {
  const weekdays: Array<[string, number]> = [
    ["lundi", 1],
    ["mardi", 2],
    ["mercredi", 3],
    ["jeudi", 4],
    ["vendredi", 5],
    ["samedi", 6],
    ["dimanche", 0],
  ];

  return weekdays
    .filter(([label]) => normalized.includes(label))
    .map(([, value]) => value);
}

function createEveryDayDates(
  startDate: string,
  options: {
    onlyThisMonth: boolean;
    weekCount: number;
  }
) {
  const [year, month, day] = startDate.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(start);

  if (options.onlyThisMonth) {
    end.setMonth(start.getMonth() + 1, 0);
  } else {
    end.setDate(start.getDate() + options.weekCount * 7 - 1);
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(formatDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function createRecurringWeekdayDates(
  startDate: string,
  weekdays: number[],
  options: {
    everyOtherWeek: boolean;
    onlyThisMonth: boolean;
    weekCount: number;
  }
) {
  const [year, month, day] = startDate.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(start);

  if (options.onlyThisMonth) {
    end.setMonth(start.getMonth() + 1, 0);
  } else {
    end.setDate(start.getDate() + options.weekCount * 7 - 1);
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  const firstWeekStart = getMonday(start);

  while (cursor <= end) {
    const weekIndex = Math.floor(
      (getMonday(cursor).getTime() - firstWeekStart.getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    );

    if (
      weekdays.includes(cursor.getDay()) &&
      (!options.everyOtherWeek || weekIndex % 2 === 0)
    ) {
      dates.push(formatDateInput(cursor));
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getMonday(date: Date) {
  const monday = new Date(date);
  const dayOfWeek = monday.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  monday.setDate(monday.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  return monday;
}

function getFirstWorkingPractitionerId(
  schedules: TeamSchedule[],
  date: string
) {
  return (
    schedules.find((schedule) => isPractitionerWorkingOnDate(schedule, date))
      ?.practitionerId ?? null
  );
}

function addDaysIso(date: string, amount: number) {
  const nextDate = parseIsoDate(date);
  nextDate.setDate(nextDate.getDate() + amount);

  return formatDateInput(nextDate);
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function getCalendarGrid(year: number, monthIndex: number) {
  const start = getMonday(new Date(year, monthIndex, 1));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return date;
  });
}

function formatMonthTitle(date: Date) {
  return date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function getWeekdayFromIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(year, month - 1, day).getDay();
}

function isCenterDayClosed(centerDayHours: CenterDayHours[], date: string) {
  const hours =
    centerDayHours.find((day) => day.weekday === getWeekdayFromIso(date)) ??
    defaultCenterDayHours[0];

  return (
    hours.closed ||
    timeToMinutes(hours.endTime) <= timeToMinutes(hours.startTime)
  );
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getWeekDates(selectedDate: string) {
  const [year, month, day] = selectedDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const nextDate = new Date(monday);
    nextDate.setDate(monday.getDate() + index);

    return formatDateInput(nextDate);
  });
}

function extractFrenchDate(value: string) {
  const monthNames: Record<string, number> = {
    janvier: 1,
    fevrier: 2,
    février: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    aout: 8,
    août: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    decembre: 12,
    décembre: 12,
  };
  const numericMatch = value.match(
    /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/
  );

  if (numericMatch) {
    const day = numericMatch[1].padStart(2, "0");
    const month = numericMatch[2].padStart(2, "0");
    const parsedYear = numericMatch[3];
    const year = parsedYear
      ? parsedYear.length === 2
        ? `20${parsedYear}`
        : parsedYear
      : String(new Date().getFullYear());

    return `${year}-${month}-${day}`;
  }

  const match = value
    .toLowerCase()
    .match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)/);

  if (!match) {
    return null;
  }

  const day = match[1].padStart(2, "0");
  const month = monthNames[match[2]].toString().padStart(2, "0");
  const year = new Date().getFullYear();

  return `${year}-${month}-${day}`;
}

function createTimeSlots(startHour: number, endHour: number, stepMinutes: number) {
  const slots: string[] = [];

  for (
    let totalMinutes = startHour * 60;
    totalMinutes <= endHour * 60;
    totalMinutes += stepMinutes
  ) {
    const hour = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, "0");
    const minutes = (totalMinutes % 60).toString().padStart(2, "0");
    slots.push(`${hour}:${minutes}`);
  }

  return slots;
}

function createTimeSlotsFromValues(
  startTime: string,
  endTime: string,
  stepMinutes: number
) {
  const slots: string[] = [];
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  for (
    let totalMinutes = startMinutes;
    totalMinutes <= endMinutes;
    totalMinutes += stepMinutes
  ) {
    slots.push(minutesToTime(totalMinutes));
  }

  return slots;
}

function timeToMinutes(time: string) {
  const [hour = "0", minutes = "0"] = time.split(":");

  return Number(hour) * 60 + Number(minutes);
}

function closestAgendaSlotIndex(slots: string[], start: string) {
  const exactIndex = slots.indexOf(start);

  if (exactIndex !== -1) {
    return exactIndex;
  }

  const startMinutes = timeToMinutes(start);
  let closestIndex = -1;
  let closestDiff = Number.POSITIVE_INFINITY;

  slots.forEach((slot, index) => {
    const diff = Math.abs(timeToMinutes(slot) - startMinutes);

    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function minutesToTime(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");

  return `${hour}:${minutes}`;
}

function getAppointmentsStartingAtSlot(
  appointmentList: Appointment[],
  cabinId: string,
  slot: string
) {
  return appointmentList.filter(
    (appointment) => appointment.cabinId === cabinId && appointment.start === slot
  );
}

function isSlotCoveredByEarlierAppointment(
  appointmentList: Appointment[],
  cabinId: string,
  slot: string
) {
  const slotMinutes = timeToMinutes(slot);

  return appointmentList.some((appointment) => {
    if (appointment.cabinId !== cabinId || appointment.start === slot) {
      return false;
    }

    const appointmentStart = timeToMinutes(appointment.start);
    const appointmentEnd = appointmentStart + appointment.duration;

    return slotMinutes > appointmentStart && slotMinutes < appointmentEnd;
  });
}

function todayIso() {
  return formatDateInput(new Date());
}

function loadStoredDailyInfo() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const savedDailyInfo = window.localStorage.getItem(
      "bookea-agenda-daily-info"
    );

    return savedDailyInfo ? JSON.parse(savedDailyInfo) : {};
  } catch {
    return {};
  }
}

function formatAgendaDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Date(year, month - 1, day).toLocaleDateString("fr-FR");
}

function formatAgendaDateLong(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    weekday: "long",
    year: "numeric",
  });
}

function formatWeekday(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    weekday: "short",
  });
}

function AppointmentCard({
  appointment,
  paymentTone,
  onDelete,
  onMove,
  onOpen,
  onStatusChange,
  practitionerList,
  focused = false,
  selectedForMove,
}: {
  appointment: Appointment;
  paymentTone?: ReturnType<typeof getPaymentTone>;
  onDelete: () => void;
  onMove: () => void;
  onOpen: () => void;
  onStatusChange: (status: AppointmentStatus) => void;
  practitionerList: Practitioner[];
  focused?: boolean;
  selectedForMove: boolean;
}) {
  const practitioner = practitionerList.find(
    (item) => item.id === appointment.practitionerId
  );
  return (
    <article
      draggable
      onClick={onOpen}
      onDragStart={(event) => {
        event.dataTransfer.setData("appointmentId", appointment.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={`relative z-10 flex h-full cursor-grab flex-col overflow-hidden rounded-lg border px-2 py-1 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
        statusClasses[appointment.status]
      } ${paymentTone ? paymentToneStyles[paymentTone].ring : ""} ${
        focused ? "ring-2 ring-blue-500 ring-offset-2" : ""
      } ${selectedForMove ? "ring-2 ring-blue-500" : ""}`}
    >
      <div className="mb-1 flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <p className="flex items-start gap-1 break-words font-semibold leading-tight">
            <span className="min-w-0">{appointment.personName}</span>
            {paymentTone ? (
              <CreditCard
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${paymentToneStyles[paymentTone].icon}`}
                aria-label={paymentToneStyles[paymentTone].label}
              />
            ) : null}
          </p>
          <p className="text-xs font-semibold opacity-75">
            {appointment.start} · {appointment.duration} min
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <div className="flex flex-col items-end gap-1">
            <span
              className={`mt-1 h-3 w-3 rounded-full ${
                paymentTone === "paid"
                  ? "bg-emerald-500"
                  : paymentTone === "partial"
                    ? "bg-orange-500"
                    : paymentTone === "unpaid"
                      ? "bg-red-500"
                      : statusDotClasses[appointment.status]
              }`}
              aria-label={
                paymentTone
                  ? paymentToneStyles[paymentTone].label
                  : `Statut ${appointment.status}`
              }
            />
            <select
              value={appointment.status}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                event.stopPropagation();
                onStatusChange(event.target.value as AppointmentStatus);
              }}
              className="w-[88px] rounded-md border border-white/60 bg-white/80 px-1 py-0.5 text-[10px] font-bold text-slate-700 shadow-sm outline-none transition-colors hover:bg-white focus:border-blue-300"
              aria-label="Changer le statut du rendez-vous"
            >
              {appointmentStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMove();
            }}
            className="rounded-md p-0.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
            aria-label="Déplacer le rendez-vous"
          >
            <Grip className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="rounded-md p-0.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
            aria-label="Supprimer le rendez-vous"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="text-sm font-semibold">{appointment.treatment}</p>
      {appointment.notes && (
        <p className="mt-2 line-clamp-2 text-xs font-medium opacity-70">
          {appointment.notes}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between pt-3 text-xs font-semibold opacity-75">
        <span>{practitioner?.name}</span>
        <span>{appointment.source}</span>
      </div>
    </article>
  );
}

const CLIENT_AUTO_CONFIRM_HOURS = 48;

function appointmentLocalDate(date: string, start: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = (start || "00:00").split(":").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const when = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
  return Number.isNaN(when.getTime()) ? null : when;
}

function isAppointmentMoreThanHoursAhead(
  date: string,
  start: string,
  hours: number,
) {
  const when = appointmentLocalDate(date, start);
  if (!when) {
    return false;
  }

  return when.getTime() - Date.now() > hours * 60 * 60 * 1000;
}

function isAppointmentWithinHoursAhead(
  date: string,
  start: string,
  hours: number,
) {
  const when = appointmentLocalDate(date, start);
  if (!when) {
    return false;
  }

  const delta = when.getTime() - Date.now();
  return delta >= 0 && delta <= hours * 60 * 60 * 1000;
}

function formatConfirmChipDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    return date;
  }

  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
  });
}

function statusWhenClientAppointmentPositioned(
  date: string,
  start: string,
): AppointmentStatus {
  return isAppointmentMoreThanHoursAhead(
    date,
    start,
    CLIENT_AUTO_CONFIRM_HOURS,
  )
    ? "Confirmé"
    : "À confirmer";
}

function applyClientPositionStatus<
  T extends {
    source: AppointmentSource;
    kind?: AppointmentKind;
    date: string;
    start: string;
    status: AppointmentStatus;
    clientId?: string;
  },
>(item: T): T {
  const isClientRdv =
    item.source === "Client" || Boolean(item.clientId);

  if (!isClientRdv) {
    return item;
  }

  if ((item.kind ?? "Rendez-vous") !== "Rendez-vous") {
    return item;
  }

  if (
    item.status !== "Confirmé" &&
    item.status !== "À confirmer" &&
    item.status !== emptyAppointment.status
  ) {
    return item;
  }

  return {
    ...item,
    status: statusWhenClientAppointmentPositioned(item.date, item.start),
  };
}

function withClientPositionStatus(appointment: Appointment): Appointment {
  return applyClientPositionStatus(appointment);
}

function getAppointmentSlotSpan(duration: number) {
  return Math.max(1, Math.ceil(duration / 15));
}

function isBookableNotifyKind(appointment: Appointment) {
  const kind = appointment.kind ?? "Rendez-vous";
  return (
    kind !== "Pause" && kind !== "Formation" && kind !== "Indisponible"
  );
}

function canOfferAppointmentNotify(
  appointment: Appointment,
  settings: CenterSmsSettings | null,
) {
  if (!isBookableNotifyKind(appointment)) {
    return false;
  }

  const canSms =
    settings?.confirmationEnabled !== false && Boolean(appointment.phone?.trim());
  const canEmail =
    settings?.confirmationEmailEnabled !== false &&
    Boolean(appointment.email?.trim());

  return canSms || canEmail;
}

async function sendAppointmentConfirmations(
  appointment: Appointment,
  options: {
    email: boolean;
    settings: CenterSmsSettings | null;
    sms: boolean;
  },
) {
  if (!isBookableNotifyKind(appointment)) {
    return [];
  }

  const notices: string[] = [];
  const appointmentEmail = String(appointment.email || "").trim();
  const sendSms =
    options.sms &&
    options.settings?.confirmationEnabled !== false &&
    Boolean(appointment.phone?.trim());
  const sendEmail =
    options.email &&
    options.settings?.confirmationEmailEnabled !== false &&
    Boolean(appointmentEmail);

  if (!sendSms && !sendEmail) {
    return notices;
  }

  const vars = {
    phone: appointment.phone,
    ...splitPersonName(appointment.personName),
    date: formatSmsDate(appointment.date),
    time: appointment.start,
    treatment: appointment.treatment,
    confirmationLink: "",
    appointmentId: appointment.id,
  };

  try {
    vars.confirmationLink = await issueAppointmentConfirmationUrl(appointment.id);
  } catch {
    vars.confirmationLink = "";
  }

  if (sendSms) {
    const confirmation = await sendSavedTemplateSms(
      options.settings?.confirmationTemplateId,
      vars,
    );
    notices.push(
      confirmation.ok
        ? "SMS de confirmation envoyé."
        : "Le SMS de confirmation n'a pas pu partir.",
    );
  }

  if (sendEmail) {
    const confirmationEmail = await sendAppointmentConfirmationEmail({
      clientId: appointment.clientId,
      email: appointmentEmail,
      firstName: vars.firstName,
      lastName: vars.lastName,
      date: vars.date,
      time: vars.time,
      treatment: vars.treatment,
      confirmationLink: vars.confirmationLink,
    });
    notices.push(
      confirmationEmail.ok
        ? "Mail de confirmation envoyé."
        : "Le mail de confirmation n'a pas pu partir.",
    );
  }

  return notices;
}

function MoveNotifyDialog({
  appointment,
  sending,
  smsSettings,
  onClose,
  onSend,
}: {
  appointment: Appointment;
  sending: boolean;
  smsSettings: CenterSmsSettings | null;
  onClose: () => void;
  onSend: (notify: { email: boolean; sms: boolean }) => Promise<void>;
}) {
  const canSms =
    smsSettings?.confirmationEnabled !== false &&
    Boolean(appointment.phone?.trim());
  const canEmail =
    smsSettings?.confirmationEmailEnabled !== false &&
    Boolean(appointment.email?.trim());
  const [sendSms, setSendSms] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/40 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !sending) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              RDV déplacé
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {appointment.personName} · {formatSmsDate(appointment.date)} à{" "}
              {appointment.start}. Envoyer une confirmation ?
            </p>
          </div>
          <button
            type="button"
            disabled={sending}
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          {canSms ? (
            <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
              <input
                type="checkbox"
                checked={sendSms}
                disabled={sending}
                onChange={(event) => setSendSms(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>SMS</span>
            </label>
          ) : null}
          {canEmail ? (
            <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
              <input
                type="checkbox"
                checked={sendEmail}
                disabled={sending}
                onChange={(event) => setSendEmail(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>Email</span>
            </label>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="outline" disabled={sending} onClick={onClose}>
            Non
          </Button>
          <Button
            type="button"
            disabled={sending || (!sendSms && !sendEmail)}
            onClick={() => {
              void onSend({ sms: sendSms, email: sendEmail });
            }}
          >
            {sending ? "Envoi…" : "Envoyer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AppointmentDetailsModal({
  agendaSlots,
  appointment,
  cabinList,
  practitionerList,
  depositLinks,
  smsSettings,
  onClose,
  onDelete,
  onSave,
}: {
  agendaSlots: string[];
  appointment: Appointment;
  cabinList: Cabin[];
  practitionerList: Practitioner[];
  depositLinks: CenterDepositLinkSetting[];
  smsSettings: CenterSmsSettings | null;
  onClose: () => void;
  onDelete: () => boolean | void | Promise<boolean | void>;
  onSave: (
    appointment: Appointment,
    notify?: { email?: boolean; sms?: boolean; depositLinkId?: string },
  ) => void;
}) {
  const [form, setForm] = useState({
    ...appointment,
    email: appointment.email ?? "",
    kind: appointment.kind ?? "Rendez-vous",
    notes: appointment.notes ?? "",
  });
  const [editingClient, setEditingClient] = useState(false);
  const [sendSms, setSendSms] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [selectedDepositLinkId, setSelectedDepositLinkId] = useState("");

  function saveAppointment(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const isBlock = isAgendaBlockKind(form.kind);
    onSave(
      withClientPositionStatus({
        ...appointment,
        ...form,
        personName: form.personName.trim() || (isBlock ? form.kind : ""),
        phone: form.phone.trim(),
        treatment: form.treatment.trim() || (isBlock ? form.kind : ""),
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }),
      {
        sms: sendSms,
        email: sendEmail,
        depositLinkId: selectedDepositLinkId || undefined,
      },
    );
    if ((form.kind ?? "Rendez-vous") === "Rendez-vous" && form.treatment.trim()) {
      addCenterService({
        name: form.treatment.trim(),
        duration: form.duration,
      });
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={saveAppointment}
        className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Modifier le rendez-vous
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Changez la date, l&apos;heure ou la cabine, puis coche SMS / Email
              pour renvoyer une confirmation tout de suite.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select
              value={form.kind}
              options={["Rendez-vous", "Pause", "Formation", "Indisponible"]}
              onChange={(value) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  kind: value as AppointmentKind,
                  source: value === "Rendez-vous" ? currentForm.source : "Seya",
                  treatment:
                    value === "Rendez-vous" ? currentForm.treatment : value,
                }))
              }
            />
          </Field>

          {!isAgendaBlockKind(form.kind) ? (
            <>
          {form.kind === "Rendez-vous" &&
          !editingClient &&
          isAgendaClientReady(form) ? (
            <div className="sm:col-span-2">
              <SelectedClientChip
                name={form.personName}
                email={form.email}
                phone={form.phone}
                onClear={() => {
                  setEditingClient(true);
                  setForm((currentForm) => ({
                    ...currentForm,
                    personName: "",
                    phone: "",
                    email: "",
                  }));
                }}
              />
            </div>
          ) : (
            <>
          <Field label="Nom ou motif">
            <Input
              required
              value={form.personName}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  personName: event.target.value,
                }))
              }
              onBlur={() => {
                if (isAgendaClientReady(form)) {
                  setEditingClient(false);
                }
              }}
            />
          </Field>

          <Field label="Téléphone">
            <Input
              value={form.phone}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  phone: event.target.value,
                }))
              }
              onBlur={() => {
                if (isAgendaClientReady(form)) {
                  setEditingClient(false);
                }
              }}
            />
          </Field>

          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  email: event.target.value,
                }))
              }
              onBlur={() => {
                if (isAgendaClientReady(form)) {
                  setEditingClient(false);
                }
              }}
            />
          </Field>
            </>
          )}

          <Field label="Prestation">
              <TreatmentPicker
                cabinList={cabinList}
                duration={form.duration}
                practitionerList={practitionerList}
                value={form.treatment}
                onChange={(next) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    treatment: next.treatment,
                    duration: next.duration ?? currentForm.duration,
                    cabinId:
                      next.cabinId &&
                      cabinList.some((cabin) => cabin.id === next.cabinId)
                        ? next.cabinId
                        : currentForm.cabinId,
                    practitionerId:
                      next.practitionerId &&
                      practitionerList.some(
                        (practitioner) =>
                          practitioner.id === next.practitionerId,
                      )
                        ? next.practitionerId
                        : currentForm.practitionerId,
                  }))
                }
              />
          </Field>

          <Field label="Statut">
            <Select
              value={form.status}
              options={appointmentStatusOptions}
              onChange={(value) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  status: value as AppointmentStatus,
                }))
              }
            />
          </Field>
            </>
          ) : null}

          <Field label="Date">
            <Input
              required
              type="date"
              value={form.date}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  date: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Heure">
            <Select
              value={form.start}
              options={agendaSlots}
              onChange={(value) =>
                setForm((currentForm) => ({ ...currentForm, start: value }))
              }
            />
          </Field>

          <Field label="Durée">
            <Select
              value={String(form.duration)}
              options={durationSelectOptions(form.duration)}
              labels={appointmentDurationLabels}
              onChange={(value) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  duration: Number(value),
                }))
              }
            />
          </Field>

          {!isAgendaBlockKind(form.kind) ? (
            <>
          <Field label="Cabine">
            <Select
              value={form.cabinId}
              options={cabinList.map((cabin) => cabin.id)}
              labels={Object.fromEntries(
                cabinList.map((cabin) => [cabin.id, cabin.name])
              )}
              onChange={(value) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  cabinId: value,
                  treatment:
                    currentForm.kind && currentForm.kind !== "Rendez-vous"
                      ? currentForm.treatment
                      : currentForm.treatment ||
                        getCabinTreatment(cabinList, value),
                }))
              }
            />
          </Field>

          <Field label="Praticienne">
            <Select
              value={form.practitionerId}
              options={practitionerList.map((practitioner) => practitioner.id)}
              labels={Object.fromEntries(
                practitionerList.map((practitioner) => [
                  practitioner.id,
                  practitioner.name,
                ])
              )}
              onChange={(value) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  practitionerId: value,
                }))
              }
            />
          </Field>

          <Field label="Provenance">
            <Select
              value={form.source}
              options={["Client", "Prospect", "Seya", "Organique"]}
              onChange={(value) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  source: value as AppointmentSource,
                }))
              }
            />
          </Field>
            </>
          ) : null}

          <div className="sm:col-span-2">
            <Field label="Commentaire">
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    notes: event.target.value,
                  }))
                }
                rows={3}
                className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </Field>
          </div>
        </div>

        {(form.kind ?? "Rendez-vous") === "Rendez-vous" &&
        (smsSettings?.confirmationEnabled !== false ||
          smsSettings?.confirmationEmailEnabled !== false) ? (
          <div className="mt-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-bold text-slate-800">
              Renvoyer une confirmation
            </p>
            <p className="text-xs font-semibold text-slate-500">
              Coche SMS ou Email, puis Enregistrer : ça part tout de suite.
            </p>
            {smsSettings?.confirmationEnabled !== false ? (
              <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={sendSms}
                  disabled={!form.phone.trim()}
                  onChange={(event) => setSendSms(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  SMS
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    {form.phone.trim()
                      ? `Sur ${form.phone.trim()}`
                      : "Ajoute un téléphone pour l’envoyer."}
                  </span>
                </span>
              </label>
            ) : null}
            {smsSettings?.confirmationEmailEnabled !== false ? (
              <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  disabled={!form.email.trim()}
                  onChange={(event) => setSendEmail(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Email
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    {form.email.trim()
                      ? `Sur ${form.email.trim()}`
                      : "Ajoute un email pour l’envoyer."}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        ) : null}

        {(form.kind ?? "Rendez-vous") === "Rendez-vous" ? (
          <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <DepositLinkChooser
              links={depositLinks}
              phone={form.phone}
              selectedId={selectedDepositLinkId}
              onChange={setSelectedDepositLinkId}
            />
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button
            variant="destructive"
            type="button"
            onClick={async () => {
              const deleted = await onDelete();
              if (deleted !== false) {
                onClose();
              }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer
          </Button>
          <Button
            type="button"
            onClick={() => {
              saveAppointment();
            }}
          >
            Enregistrer
          </Button>
        </div>
      </form>
    </div>
  );
}

function Suggestion({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3 text-sm font-medium leading-5 text-violet-900">
      {text}
    </div>
  );
}

function isAgendaClientReady(
  form: { personName?: string; phone?: string },
  pickedContact?: { name?: string } | null,
) {
  if (pickedContact) {
    return true;
  }

  return (
    Boolean(form.personName?.trim()) &&
    (form.phone?.replace(/\D/g, "") ?? "").length >= 9
  );
}

function SelectedClientChip({
  name,
  email,
  phone,
  onClear,
}: {
  name: string;
  email?: string;
  phone?: string;
  onClear: () => void;
}) {
  const details = [phone?.trim(), email?.trim()].filter(Boolean).join(" • ");

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500">
        Prospect / Client
      </p>
      <div className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-sm text-slate-900">
          <span className="font-semibold">{name.trim() || "Cliente"}</span>
          {details ? (
            <span className="font-medium text-slate-500"> {details}</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-slate-800"
          aria-label="Effacer la sélection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function matchesMultiSelection(selectedIds: string[], value: string) {
  return selectedIds.length === 0 || selectedIds.includes(value);
}

function MultiCheckFilter({
  allLabel,
  label,
  options,
  selectedIds,
  onChange,
}: {
  allLabel: string;
  label: string;
  options: Array<{ id: string; name: string }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedCount = selectedIds.length;
  const summary =
    selectedCount === 0
      ? allLabel
      : selectedCount === 1
        ? (options.find((option) => option.id === selectedIds[0])?.name ??
          allLabel)
        : `${selectedCount} ${label}`;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 min-w-44 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <div className="absolute left-0 z-50 mt-1 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={selectedCount === 0}
              onChange={() => onChange([])}
              className="h-4 w-4"
            />
            {allLabel}
          </label>
          <div className="mt-1 max-h-64 overflow-y-auto">
            {options.map((option) => {
              const checked = selectedIds.includes(option.id);
              return (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onChange(
                        checked
                          ? selectedIds.filter((id) => id !== option.id)
                          : [...selectedIds, option.id],
                      )
                    }
                    className="h-4 w-4"
                  />
                  <span className="truncate">{option.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </div>
  );
}

const NEW_TREATMENT_VALUE = "__new_treatment__";
const CUSTOM_TREATMENT_VALUE = "__custom_treatment__";

function durationSelectOptions(current: number) {
  const value = String(current);

  return appointmentDurationOptions.includes(value)
    ? appointmentDurationOptions
    : [...appointmentDurationOptions, value];
}

function TreatmentPicker({
  cabinList,
  duration,
  onChange,
  practitionerList = practitioners,
  value,
}: {
  cabinList: Cabin[];
  duration: number;
  onChange: (next: {
    cabinId?: string;
    duration?: number;
    practitionerId?: string;
    treatment: string;
  }) => void;
  practitionerList?: Practitioner[];
  value: string;
}) {
  const [services, setServices] = useState(getCenterServices);
  const [mode, setMode] = useState<"list" | "new" | "custom">(() =>
    getTreatmentPickerMode(value, getCenterServices())
  );
  const [newName, setNewName] = useState(
    getTreatmentPickerMode(value, getCenterServices()) === "new" ? value : ""
  );
  const [newDuration, setNewDuration] = useState(String(duration || 60));

  useEffect(() => {
    function refreshServices() {
      setServices(getCenterServices());
    }

    refreshServices();
    window.addEventListener("bookea-center-settings-updated", refreshServices);

    return () => {
      window.removeEventListener(
        "bookea-center-settings-updated",
        refreshServices
      );
    };
  }, []);

  const matchedService = services.find((service) => service.name === value);
  const selectValue =
    mode === "new"
      ? NEW_TREATMENT_VALUE
      : mode === "custom"
        ? CUSTOM_TREATMENT_VALUE
        : matchedService?.name ?? "";

  function selectTreatment(nextValue: string) {
    if (nextValue === NEW_TREATMENT_VALUE) {
      setMode("new");
      setNewName(value && !matchedService ? value : "");
      setNewDuration(String(duration || 60));
      onChange({ treatment: "" });
      return;
    }

    if (nextValue === CUSTOM_TREATMENT_VALUE) {
      setMode("custom");
      onChange({ treatment: matchedService ? "" : value });
      return;
    }

    const service = services.find((item) => item.name === nextValue);
    setMode("list");
    onChange({
      treatment: nextValue,
      duration: service?.duration,
      cabinId: findCabinIdForService(service, cabinList),
      practitionerId: findPractitionerIdForService(service, practitionerList),
    });
  }

  function addNewTreatment() {
    const name = newName.trim();

    if (!name) {
      return;
    }

    const created = addCenterService({
      name,
      duration: Number(newDuration) || 60,
    });
    setServices(getCenterServices());
    setMode("list");
    onChange({
      treatment: created.name,
      duration: created.duration,
    });
  }

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        options={[
          "",
          ...services.map((service) => service.name),
          NEW_TREATMENT_VALUE,
          CUSTOM_TREATMENT_VALUE,
        ]}
        labels={{
          "": "Choisir une prestation",
          ...Object.fromEntries(
            services.map((service) => [
              service.name,
              `${service.name} · ${formatDurationLabel(service.duration)}`,
            ])
          ),
          [NEW_TREATMENT_VALUE]: "Nouvelle prestation…",
          [CUSTOM_TREATMENT_VALUE]: "Saisie libre",
        }}
        onChange={selectTreatment}
      />

      {mode === "new" ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_7.5rem_auto]">
          <Input
            required
            placeholder="Nom de la prestation"
            value={newName}
            onChange={(event) => {
              const nextName = event.target.value;
              setNewName(nextName);
              onChange({
                treatment: nextName,
                duration: Number(newDuration) || 60,
              });
            }}
          />
          <Select
            value={newDuration}
            options={durationSelectOptions(Number(newDuration) || 60)}
            labels={appointmentDurationLabels}
            onChange={(nextDuration) => {
              setNewDuration(nextDuration);
              onChange({
                treatment: newName,
                duration: Number(nextDuration),
              });
            }}
          />
          <Button type="button" variant="outline" onClick={addNewTreatment}>
            Ajouter
          </Button>
        </div>
      ) : null}

      {mode === "custom" ? (
        <Input
          required
          placeholder="Nom du soin ou motif"
          value={value}
          onChange={(event) => onChange({ treatment: event.target.value })}
        />
      ) : null}
    </div>
  );
}

function getTreatmentPickerMode(
  value: string,
  services: CenterServiceSetting[]
): "list" | "new" | "custom" {
  if (!value || services.some((service) => service.name === value)) {
    return "list";
  }

  return "custom";
}

function findAssignedName(value?: string) {
  const raw = value?.trim() ?? "";
  if (!raw || /^(toutes?|tous)$/i.test(raw)) {
    return undefined;
  }

  return raw.split(",")[0]?.trim() || undefined;
}

function findCabinIdForService(
  service: CenterServiceSetting | undefined,
  cabinList: Cabin[]
) {
  const cabinName = findAssignedName(service?.cabins);
  if (!cabinName) {
    return undefined;
  }

  return cabinList.find(
    (cabin) =>
      normalize(cabin.name) === normalize(cabinName) ||
      normalize(cabinName).includes(normalize(cabin.name))
  )?.id;
}

function findPractitionerIdForService(
  service: CenterServiceSetting | undefined,
  practitionerList: Practitioner[] = practitioners,
) {
  const practitionerName = findAssignedName(service?.practitioners);
  if (!practitionerName) {
    return undefined;
  }

  return practitionerList.find(
    (practitioner) =>
      normalize(practitioner.name) === normalize(practitionerName) ||
      normalize(practitionerName).includes(normalize(practitioner.name)),
  )?.id;
}

function formatDurationLabel(minutes: number) {
  return appointmentDurationLabels[String(minutes)] ?? `${minutes} min`;
}

function activeDepositLinks() {
  const settings = readCenterSettings();
  const links = settings?.depositLinks?.length
    ? settings.depositLinks
    : defaultCenterDepositLinks;
  return links.filter((link) => link.active && link.url.trim());
}

async function sendSelectedDepositLinkSms(
  appointment: Appointment,
  depositLinkId: string,
  links: CenterDepositLinkSetting[],
  centerName: string,
) {
  if (!appointment.phone.trim() || !depositLinkId) {
    return "";
  }

  const depositLink =
    links.find((link) => String(link.id) === depositLinkId) ?? null;

  if (!depositLink?.url.trim()) {
    return "Aucun lien d'acompte configuré.";
  }

  const names = splitPersonName(appointment.personName);
  const deposit = await sendBookeaSms({
    phone: appointment.phone,
    firstName: names.firstName,
    lastName: names.lastName,
    date: formatSmsDate(appointment.date),
    time: appointment.start,
    treatment: appointment.treatment,
    centerName,
    appointmentId: appointment.id,
    message: `${depositLink.message} ${depositLink.url}`.trim(),
  });

  return deposit.ok
    ? `Lien d'acompte « ${depositLink.name} » envoyé.`
    : "Le lien d'acompte n'a pas pu partir.";
}

function DepositLinkChooser({
  links,
  phone,
  selectedId,
  onChange,
}: {
  links: CenterDepositLinkSetting[];
  phone: string;
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const selectedLink =
    links.find((link) => String(link.id) === selectedId) ?? null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-slate-800">Quel acompte envoyer ?</p>
      <p className="text-xs font-semibold text-slate-500">
        Clique l’acompte voulu. Rien ne part si tu laisses « Ne pas envoyer ».
      </p>
      {!phone.trim() ? (
        <p className="text-xs font-semibold text-slate-500">
          Ajoute un téléphone pour pouvoir l’envoyer.
        </p>
      ) : null}
      {links.length === 0 ? (
        <p className="text-xs font-semibold text-slate-500">
          Aucun lien d’acompte actif dans Paramètres centre.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChange("")}
            className={`rounded-xl border px-3 py-2 text-left text-sm font-bold transition-colors ${
              selectedId === ""
                ? "border-slate-800 bg-white text-slate-950"
                : "border-slate-200 bg-white/70 text-slate-600 hover:border-slate-300"
            }`}
          >
            Ne pas envoyer
          </button>
          {links.map((link) => (
            <button
              type="button"
              key={link.id}
              disabled={!phone.trim()}
              onClick={() => onChange(String(link.id))}
              className={`rounded-xl border px-3 py-2 text-left text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                selectedId === String(link.id)
                  ? "border-amber-500 bg-white text-amber-800 ring-2 ring-amber-200"
                  : "border-slate-200 bg-white/70 text-slate-700 hover:border-amber-300"
              }`}
            >
              {link.name}
            </button>
          ))}
        </div>
      )}
      {selectedLink ? (
        <p className="text-xs font-semibold leading-5 text-slate-600">
          {selectedLink.message}{" "}
          <span className="break-all font-bold text-slate-800">
            {selectedLink.url}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function Select({
  value,
  options,
  labels,
  onChange,
  required,
}: {
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <select
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-lg border border-input bg-white px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}

function clientFicheHref(appointment: Appointment) {
  const params = new URLSearchParams();

  if (appointment.clientId) {
    params.set("client", appointment.clientId);
  }

  if (appointment.phone.trim()) {
    params.set("phone", appointment.phone.trim());
  }

  if (appointment.personName.trim()) {
    params.set("q", appointment.personName.trim());
  }

  params.set("fiche", "1");
  return `/dashboard/crm-clients?${params.toString()}`;
}
