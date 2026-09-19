"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { appointments, cabins, practitioners } from "@/lib/agenda-data";
import { agendaContacts } from "@/lib/agenda-data";
import {
  createCrmAppointment,
  deleteCrmAppointment,
  loadCrmAppointments,
  updateCrmAppointment,
} from "@/lib/agenda-supabase";
import { saveAppointmentStatusOverride } from "@/lib/appointment-crm-sync";
import {
  cancelAppointmentSmsJobs,
  rescheduleAppointmentSmsJobs,
  scheduleAppointmentReminderSms,
  sendSavedTemplateSms,
} from "@/lib/send-sms";
import {
  formatSmsDate,
  loadCenterSmsSettings,
  splitPersonName,
  type CenterSmsSettings,
} from "@/lib/sms-settings";
import {
  mergePublicBookingsIntoAppointments,
  PUBLIC_BOOKINGS_UPDATED_EVENT,
  readPublicBookings,
} from "@/lib/public-bookings";
import {
  Appointment,
  AppointmentKind,
  AppointmentSource,
  AppointmentStatus,
  Cabin,
} from "@/types/agenda";
import {
  Bot,
  CalendarClock,
  CalendarDays,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
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
const SLOT_ROW_HEIGHT_REM = 5;

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

type TeamAbsence = {
  id: string;
  date: string;
  type: "Vacance" | "Repos exceptionnel";
};

type TeamSchedule = {
  practitionerId: string;
  startDate: string;
  months: 1 | 3 | 6;
  workingDays: number[];
  startTime: string;
  endTime: string;
  absenceDate: string;
  absences: TeamAbsence[];
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

const defaultTeamSchedules: TeamSchedule[] = [
  {
    practitionerId: "samantha",
    startDate: todayIso(),
    months: 6,
    workingDays: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "18:00",
    absenceDate: todayIso(),
    absences: [],
  },
  {
    practitionerId: "marie",
    startDate: todayIso(),
    months: 3,
    workingDays: [1, 2, 3, 5],
    startTime: "09:00",
    endTime: "17:00",
    absenceDate: todayIso(),
    absences: [],
  },
  {
    practitionerId: "camille",
    startDate: todayIso(),
    months: 3,
    workingDays: [2, 3, 4, 5, 6],
    startTime: "10:00",
    endTime: "19:00",
    absenceDate: todayIso(),
    absences: [],
  },
  {
    practitionerId: "ines",
    startDate: todayIso(),
    months: 1,
    workingDays: [1, 3, 5],
    startTime: "09:30",
    endTime: "16:30",
    absenceDate: todayIso(),
    absences: [],
  },
  {
    practitionerId: "aurelie",
    startDate: todayIso(),
    months: 6,
    workingDays: [1, 2, 3, 5, 6],
    startTime: "09:00",
    endTime: "18:00",
    absenceDate: todayIso(),
    absences: [],
  },
];

export default function AgendaBoard() {
  const searchParams = useSearchParams();
  const rdvPrefill = getRdvPrefill(searchParams);
  const [appointmentList, setAppointmentList] = useState(appointments);
  const [cabinList, setCabinList] = useState(cabins);
  const [isLoadingAgenda, setIsLoadingAgenda] = useState(true);
  const [agendaError, setAgendaError] = useState("");
  const [agendaNotice, setAgendaNotice] = useState("");
  const [activeTab, setActiveTab] = useState<AgendaTab>("agenda");
  const [agendaView, setAgendaView] = useState<AgendaView>("day");
  const [teamSchedules, setTeamSchedules] = useState(defaultTeamSchedules);
  const [selectedDate, setSelectedDate] = useState(
    rdvPrefill?.date ?? todayIso()
  );
  const [selectedCabin, setSelectedCabin] = useState("Toutes");
  const [selectedPractitioner, setSelectedPractitioner] = useState("Toutes");
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
  const [isModalOpen, setIsModalOpen] = useState(Boolean(rdvPrefill));
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);
  const [movingAppointmentId, setMovingAppointmentId] = useState<string | null>(
    null
  );
  const [appointmentForm, setAppointmentForm] = useState(() => ({
    ...emptyAppointment,
    ...rdvPrefill,
  }));
  const [sendSmsNow, setSendSmsNow] = useState(false);
  const [sendSms48h, setSendSms48h] = useState(false);
  const [smsSettings, setSmsSettings] = useState<CenterSmsSettings | null>(null);
  const [contactSearch, setContactSearch] = useState(
    rdvPrefill?.personName ?? ""
  );

  async function refreshAgenda() {
    setAgendaError("");

    try {
      const loadedAppointments = await loadCrmAppointments();

      setAppointmentList(
        loadedAppointments.length > 0
          ? mergePublicBookingsIntoAppointments(
              loadedAppointments,
              readPublicBookings(),
            )
          : appointments,
      );
    } catch (error) {
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Impossible de charger l'agenda.",
      );
      setAppointmentList(appointments);
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
    function syncPublicBookings() {
      setAppointmentList((currentAppointments) =>
        mergePublicBookingsIntoAppointments(
          currentAppointments,
          readPublicBookings()
        )
      );
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAgenda();
    window.addEventListener(PUBLIC_BOOKINGS_UPDATED_EVENT, syncPublicBookings);
    window.addEventListener("storage", syncPublicBookings);

    return () => {
      window.removeEventListener(
        PUBLIC_BOOKINGS_UPDATED_EVENT,
        syncPublicBookings
      );
      window.removeEventListener("storage", syncPublicBookings);
    };
  }, []);

  useEffect(() => {
    void loadCenterSmsSettings()
      .then((result) => setSmsSettings(result.settings))
      .catch(() => null);
    void fetch("/api/sms/dispatch").catch(() => null);
  }, []);

  const visibleAppointments = useMemo(
    () =>
      appointmentList.filter((appointment) => {
        const dateMatch = appointment.date === selectedDate;
        const cabinMatch =
          selectedCabin === "Toutes" || appointment.cabinId === selectedCabin;
        const practitionerMatch =
          selectedPractitioner === "Toutes" ||
          appointment.practitionerId === selectedPractitioner;

        return dateMatch && cabinMatch && practitionerMatch;
      }),
    [appointmentList, selectedCabin, selectedDate, selectedPractitioner]
  );

  const practitionersOfDay = practitioners.filter((practitioner) => {
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

  function changeSelectedDateByDays(amount: number) {
    setSelectedDate((currentDate) => addDaysIso(currentDate, amount));
    setDailyInfoSavedDate(null);
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

  const stats = useMemo(() => {
    const confirmed = visibleAppointments.filter(
      (appointment) => appointment.status === "Confirmé"
    ).length;
    const toConfirm = visibleAppointments.filter(
      (appointment) => appointment.status === "À confirmer"
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
        value: toConfirm,
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

      if (selectedCabin === cabinToRemove.id) {
        setSelectedCabin("Toutes");
      }

      return currentCabins.slice(0, -1);
    });
  }

  function updateTeamSchedule(
    practitionerId: string,
    updates: Partial<TeamSchedule>
  ) {
    setTeamSchedules((currentSchedules) =>
      currentSchedules.map((schedule) =>
        schedule.practitionerId === practitionerId
          ? { ...schedule, ...updates }
          : schedule
      )
    );
  }

  function openAppointmentModal() {
    setAppointmentForm({ ...emptyAppointment, date: selectedDate });
    setContactSearch("");
    setSendSmsNow(false);
    setSendSms48h(false);
    setIsModalOpen(true);
  }

  async function addAppointment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    };

    try {
      const savedAppointment = await createCrmAppointment(appointment);
      const smsVars = {
        phone: savedAppointment.phone,
        ...splitPersonName(savedAppointment.personName),
        date: formatSmsDate(savedAppointment.date),
        time: savedAppointment.start,
        treatment: savedAppointment.treatment,
      };
      const notices = ["RDV enregistré."];

      if (
        appointment.kind !== "Pause" &&
        appointment.kind !== "Formation" &&
        appointment.kind !== "Indisponible" &&
        savedAppointment.phone
      ) {
        if (sendSmsNow) {
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

        if (sendSms48h) {
          const reminder = await scheduleAppointmentReminderSms({
            appointmentId: savedAppointment.id,
            templateId: smsSettings?.reminder48hTemplateId,
            vars: smsVars,
          });
          notices.push(
            reminder.ok
              ? reminder.scheduled
                ? "SMS 48h programmé."
                : "SMS 48h envoyé."
              : "Le SMS 48h n'a pas pu être programmé.",
          );
        }
      }

      setAppointmentList((currentAppointments) => [
        ...currentAppointments,
        savedAppointment,
      ]);
      setSelectedDate(savedAppointment.date);
      setAgendaNotice(notices.join(" "));
      setSendSmsNow(false);
      setSendSms48h(false);
      setIsModalOpen(false);
    } catch (error) {
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Le RDV n'a pas pu être enregistré.",
      );
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
          ? {
              ...appointment,
              cabinId,
              date: selectedDate,
              start,
              treatment:
                appointment.kind && appointment.kind !== "Rendez-vous"
                  ? appointment.treatment
                  : cabinTreatment,
            }
          : appointment
      )
    );

    if (!appointmentBeforeMove) {
      return;
    }

    const updatedAppointment: Appointment = {
      ...appointmentBeforeMove,
      cabinId,
      date: selectedDate,
      start,
      treatment:
        appointmentBeforeMove.kind && appointmentBeforeMove.kind !== "Rendez-vous"
          ? appointmentBeforeMove.treatment
          : cabinTreatment,
    };

    updateCrmAppointment(updatedAppointment)
      .then(() => rescheduleAppointmentSmsJobs(updatedAppointment.id))
      .catch((error) => {
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Le déplacement du RDV n'a pas pu être sauvegardé.",
      );
      void refreshAgenda();
    });
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
      return;
    }

    const previousAppointments = appointmentList;
    setAppointmentList((currentAppointments) =>
      currentAppointments.filter((appointment) => appointment.id !== appointmentId)
    );

    if (selectedAppointmentId === appointmentId) {
      setSelectedAppointmentId(null);
    }

    try {
      await cancelAppointmentSmsJobs(appointmentId);
      await deleteCrmAppointment(appointmentId);
      setAgendaNotice("RDV supprimé. Les SMS 48h prévus pour ce rendez-vous sont annulés.");
    } catch (error) {
      setAppointmentList(previousAppointments);
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Le RDV n'a pas pu être supprimé.",
      );
    }
  }

  async function updateAppointment(updatedAppointment: Appointment) {
    const previousAppointments = appointmentList;
    setAppointmentList((currentAppointments) =>
      currentAppointments.map((appointment) =>
        appointment.id === updatedAppointment.id ? updatedAppointment : appointment
      )
    );
    saveAppointmentStatusOverride(updatedAppointment);
    setSelectedDate(updatedAppointment.date);

    try {
      await updateCrmAppointment(updatedAppointment);
      if (updatedAppointment.status === "Annulation") {
        await cancelAppointmentSmsJobs(updatedAppointment.id);
        setAgendaNotice("RDV mis à jour. Les SMS 48h prévus sont annulés.");
      } else {
        await rescheduleAppointmentSmsJobs(updatedAppointment.id);
        setAgendaNotice("RDV mis à jour.");
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

  function updateAppointmentStatus(
    appointment: Appointment,
    status: AppointmentStatus
  ) {
    const updatedAppointment = { ...appointment, status };
    const previousAppointments = appointmentList;

    setAppointmentList((currentAppointments) =>
      currentAppointments.map((currentAppointment) =>
        currentAppointment.id === appointment.id
          ? updatedAppointment
          : currentAppointment
      )
    );
    saveAppointmentStatusOverride(updatedAppointment);

    updateCrmAppointment(updatedAppointment).catch((error) => {
      setAppointmentList(previousAppointments);
      setAgendaError(
        error instanceof Error
          ? error.message
          : "Le statut du RDV n'a pas pu être sauvegardé.",
      );
    });
  }

  const contactMatches =
    contactSearch.trim().length >= 2
      ? agendaContacts
          .filter((contact) => {
            const query = normalize(contactSearch);

            return (
              normalize(contact.name).includes(query) ||
              normalize(contact.phone).includes(query) ||
              normalize(contact.email).includes(query)
            );
          })
          .slice(0, 5)
      : [];

  function selectContact(contact: (typeof agendaContacts)[number]) {
    setContactSearch(contact.name);
    setAppointmentForm((form) => ({
      ...form,
      personName: contact.name,
      phone: contact.phone,
      treatment: contact.treatment,
      source: contact.type,
      email: contact.email,
      kind: "Rendez-vous",
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
          practitioners[0]?.id ??
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

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1800px] space-y-6 p-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-600">
              Bookea Agenda
            </p>
            <h1 className="mt-1 text-4xl font-black tracking-tight text-slate-950">
              Agenda
            </h1>
            <p className="mt-2 text-slate-500">
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

            <select
              value={selectedCabin}
              onChange={(event) => setSelectedCabin(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option>Toutes</option>
              {cabinList.map((cabin) => (
                <option key={cabin.id} value={cabin.id}>
                  {cabin.name}
                </option>
              ))}
            </select>

            <select
              value={selectedPractitioner}
              onChange={(event) =>
                setSelectedPractitioner(event.target.value)
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option>Toutes</option>
              {practitioners.map((practitioner) => (
                <option key={practitioner.id} value={practitioner.id}>
                  {practitioner.name}
                </option>
              ))}
            </select>

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
                <p className="text-xs font-black uppercase text-slate-400">
                  Horaires du jour
                </p>
                <p className="text-base font-black text-slate-950">
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
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
            >
              Modifier les horaires
            </button>
          </CardContent>
        </Card>

        <Card className="border-amber-100 bg-amber-50 py-0 shadow-sm">
          <CardContent className="grid gap-4 p-5 lg:grid-cols-[240px_1fr] lg:items-start">
            <div>
              <p className="text-xs font-black uppercase text-amber-700">
                À lire avant la journée
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
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

            return (
              <Card key={stat.label} className="border-slate-200 py-0 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">
                      {stat.label}
                    </p>
                    <p className={`mt-2 text-3xl font-black ${stat.color}`}>
                      {stat.value}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <Icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
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
                <h2 className="font-black">Seya Agenda</h2>
              </div>
              <p className="text-sm leading-6 text-violet-800">
                Seya pourra proposer automatiquement un créneau selon la
                cabine, la praticienne, le soin et les disponibilités.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Suggestion text="Julie Martin peut être placée mardi à 10:30 en Cabine 2." />
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

        <Card className="border-slate-200 py-0 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="mr-2 text-sm font-black uppercase text-slate-500">
                Praticiennes du jour
              </p>
              {practitionersOfDay.map((practitioner) => (
                <div
                  key={practitioner.id}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2"
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

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => changeSelectedDateByDays(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
                aria-label="Jour précédent"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="min-w-48 px-2 text-center">
                <p className="text-sm font-black text-slate-950">
                  {formatAgendaDateLong(selectedDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => changeSelectedDateByDays(1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950"
                aria-label="Jour suivant"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(todayIso());
                  setDailyInfoSavedDate(null);
                }}
                className="h-9 rounded-lg px-3 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-50"
              >
                Aujourd&apos;hui
              </button>
            </div>
          </CardContent>
        </Card>

        {agendaView === "day" ? (
        <section>
          <Card className="overflow-hidden border-slate-200 py-0 shadow-sm">
            <CardContent className="relative p-0">
              <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-xl bg-white/95 p-1 shadow-sm ring-1 ring-slate-200">
                <button
                  type="button"
                  onClick={removeCabin}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  aria-label="Retirer une cabine"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={addCabin}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-700"
                  aria-label="Ajouter une cabine"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div
                className="grid border-b border-slate-100 bg-white text-sm font-bold text-slate-500"
                style={{
                  gridTemplateColumns: `92px repeat(${cabinList.length}, minmax(240px, 1fr))`,
                }}
              >
                <div className="border-r border-slate-100 p-4">Heure</div>
                {cabinList.map((cabin) => (
                  <div
                    key={cabin.id}
                    className={`border-r border-slate-100 bg-gradient-to-br ${cabin.color} p-4 text-white last:border-r-0`}
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
                    <p className="text-lg font-black text-slate-900">
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
                    gridTemplateColumns: `92px repeat(${cabinList.length}, minmax(240px, 1fr))`,
                    gridTemplateRows: `repeat(${agendaSlots.length}, ${SLOT_ROW_HEIGHT_REM}rem)`,
                  }}
                >
                  {agendaSlots.map((hour, slotIndex) => (
                    <div
                      key={`hour-${hour}`}
                      className="border-r border-b border-slate-100 bg-slate-50 p-4 text-sm font-bold text-slate-400"
                      style={{
                        gridColumn: 1,
                        gridRow: slotIndex + 1,
                      }}
                    >
                      {hour}
                    </div>
                  ))}

                  {cabinList.flatMap((cabin, cabinIndex) =>
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
                          className={`border-r border-b border-slate-100 p-2 last:border-r-0 ${cabin.softColor}`}
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

                                setAppointmentForm({
                                  ...emptyAppointment,
                                  cabinId: cabin.id,
                                  date: selectedDate,
                                  start: hour,
                                  treatment: getCabinTreatment(
                                    cabinList,
                                    cabin.id
                                  ),
                                });
                                setIsModalOpen(true);
                              }}
                              className="flex h-full min-h-12 w-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-[11px] font-semibold text-slate-300 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                            >
                              Créneau libre
                            </button>
                          ) : null}
                        </div>
                      );
                    })
                  )}

                  {visibleAppointments.map((appointment) => {
                    const cabinIndex = cabinList.findIndex(
                      (cabin) => cabin.id === appointment.cabinId
                    );
                    const slotIndex = agendaSlots.findIndex(
                      (slot) => slot === appointment.start
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
                        className="z-10 p-2"
                        style={{
                          gridColumn: cabinIndex + 2,
                          gridRow: `${slotIndex + 1} / span ${slotSpan}`,
                        }}
                      >
                        <AppointmentCard
                          appointment={appointment}
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
            </CardContent>
          </Card>
        </section>
        ) : (
          <WeekSchedule
            appointmentList={appointmentList}
            cabinList={cabinList}
            selectedCabin={selectedCabin}
            selectedDate={selectedDate}
            selectedPractitioner={selectedPractitioner}
            onDelete={deleteAppointment}
            onOpen={setSelectedAppointmentId}
          />
        )}
          </>
        ) : (
          <TeamPlanning
            schedules={teamSchedules}
            onScheduleChange={updateTeamSchedule}
          />
        )}
      </div>

      {isHoursModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase text-blue-600">
                  Paramètres agenda
                </p>
                <h2 className="mt-1 text-3xl font-black text-slate-950">
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
                  <p className="text-lg font-black text-slate-900">
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
                      className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black outline-none disabled:opacity-40"
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
                      className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black outline-none disabled:opacity-40"
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
                    className={`h-11 rounded-xl px-4 text-sm font-black ${
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
                onClick={() => setIsHoursModalOpen(false)}
                className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white"
              >
                Valider les horaires
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-sm">
          <form
            onSubmit={addAppointment}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-950">
                  Nouveau rendez-vous
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  À terme, ce formulaire pourra être ouvert directement depuis
                  un prospect ou une fiche client.
                </p>
              </div>
              <Bot className="h-6 w-6 text-violet-600" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="relative sm:col-span-2">
                <Field label="Rechercher prospect ou client">
                  <Input
                    placeholder="Tapez 2 lettres, un téléphone ou un email..."
                    value={contactSearch}
                    onChange={(event) => {
                      const value = event.target.value;
                      setContactSearch(value);
                      setAppointmentForm((form) => ({
                        ...form,
                        personName: value,
                      }));
                    }}
                  />
                </Field>

                {contactMatches.length > 0 && (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    {contactMatches.map((contact) => (
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
                    ))}
                  </div>
                )}
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
                />
              </Field>

              <Field label="Nom">
                <Input
                  required
                  value={appointmentForm.personName}
                  onChange={(event) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      personName: event.target.value,
                    }))
                  }
                />
              </Field>

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

              <Field label="Soin ou motif">
                <Input
                  required
                  value={appointmentForm.treatment}
                  onChange={(event) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      treatment: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field label="Provenance">
                <Select
                  value={appointmentForm.source}
                  options={["Client", "Prospect", "Seya", "Organique"]}
                  onChange={(value) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      source: value as AppointmentSource,
                    }))
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
                      treatment: getCabinTreatment(cabinList, value),
                    }))
                  }
                />
              </Field>

              <Field label="Praticienne">
                <Select
                  value={appointmentForm.practitionerId}
                  options={practitioners.map((practitioner) => practitioner.id)}
                  labels={Object.fromEntries(
                    practitioners.map((practitioner) => [
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

              <Field label="Date">
                <Input
                  required
                  type="date"
                  value={appointmentForm.date}
                  onChange={(event) =>
                    setAppointmentForm((form) => ({
                      ...form,
                      date: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field label="Heure">
                <Select
                  value={appointmentForm.start}
                  options={agendaSlots}
                  onChange={(value) =>
                    setAppointmentForm((form) => ({ ...form, start: value }))
                  }
                />
              </Field>

              <Field label="Durée">
                <Select
                  value={String(appointmentForm.duration)}
                  options={[
                    "15",
                    "30",
                    "45",
                    "60",
                    "75",
                    "90",
                    "105",
                    "120",
                    "720",
                  ]}
                  labels={{
                    "15": "15 min",
                    "30": "30 min",
                    "45": "45 min",
                    "60": "1 h",
                    "75": "1 h 15",
                    "90": "1 h 30",
                    "105": "1 h 45",
                    "120": "2 h",
                    "720": "Toute la journée",
                  }}
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

            <div className="mt-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={sendSmsNow}
                  disabled={!appointmentForm.phone.trim()}
                  onChange={(event) => setSendSmsNow(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Envoyer un SMS de confirmation maintenant
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    Utilise le modèle enregistré pour ce centre. Décoche pour ne rien envoyer.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={sendSms48h}
                  disabled={!appointmentForm.phone.trim()}
                  onChange={(event) => setSendSms48h(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  Envoyer un SMS de confirmation 48h avant
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    Programmé seulement si tu coches. Si le RDV est supprimé avant, le SMS ne part pas.
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit">Créer le RDV</Button>
            </div>
          </form>
        </div>
      )}

      {selectedAppointment && (
        <AppointmentDetailsModal
          appointment={selectedAppointment}
          agendaSlots={agendaSlots}
          cabinList={cabinList}
          onClose={() => setSelectedAppointmentId(null)}
          onDelete={() => deleteAppointment(selectedAppointment.id)}
          onSave={updateAppointment}
        />
      )}
    </main>
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
  onDelete,
  onOpen,
  selectedCabin,
  selectedDate,
  selectedPractitioner,
}: {
  appointmentList: Appointment[];
  cabinList: Cabin[];
  onDelete: (appointmentId: string) => void;
  onOpen: (appointmentId: string) => void;
  selectedCabin: string;
  selectedDate: string;
  selectedPractitioner: string;
}) {
  const weekDates = getWeekDates(selectedDate);
  const appointmentsByDate = weekDates.map((date) => {
    const dayAppointments = appointmentList
      .filter((appointment) => {
        const dateMatch = appointment.date === date;
        const cabinMatch =
          selectedCabin === "Toutes" || appointment.cabinId === selectedCabin;
        const practitionerMatch =
          selectedPractitioner === "Toutes" ||
          appointment.practitionerId === selectedPractitioner;

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
            <h2 className="text-xl font-black text-slate-950">Vue semaine</h2>
            <p className="text-sm font-semibold text-slate-500">
              Du {formatAgendaDate(weekDates[0])} au{" "}
              {formatAgendaDate(weekDates[6])}
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

        <div className="grid gap-3 lg:grid-cols-7">
          {appointmentsByDate.map(({ date, appointments: dayAppointments }) => (
            <div
              key={date}
              className="min-h-72 rounded-2xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="mb-3 rounded-xl bg-white p-3">
                <p className="text-sm font-black text-slate-950">
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

                    return (
                      <article
                        key={appointment.id}
                        onClick={() => onOpen(appointment.id)}
                        className={`w-full rounded-xl border p-3 text-left text-sm shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md ${
                          statusClasses[appointment.status]
                        }`}
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
                            <p className="font-black">
                              {appointment.start} · {appointment.personName}
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
  schedules,
  onScheduleChange,
}: {
  schedules: TeamSchedule[];
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
              <h2 className="text-xl font-black text-slate-950">
                Planning équipe
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Remplissez les jours travaillés pour 1, 3 ou 6 mois. Le bandeau
              “Praticiennes du jour” de l’agenda se met à jour avec ces règles.
            </p>
          </div>
          <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
            Les praticiennes cochées aujourd&apos;hui remontent automatiquement
            dans l&apos;agenda.
          </div>
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
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-3.5 w-3.5 rounded-full ${practitioner.color}`}
                    />
                    <div>
                      <p className="text-lg font-black text-slate-950">
                        {practitioner.name}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                    {activeDays.length} j / semaine
                  </span>
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
                                : [...schedule.workingDays, day.value].sort(),
                            })
                          }
                          className={`min-h-16 rounded-xl border text-sm font-black transition-colors ${
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
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                    <Field label="Absence ponctuelle">
                      <Input
                        type="date"
                        value={schedule.absenceDate}
                        onChange={(event) =>
                          onScheduleChange(schedule.practitionerId, {
                            absenceDate: event.target.value,
                          })
                        }
                        className="bg-white"
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          addTeamAbsence(
                            schedule,
                            "Vacance",
                            onScheduleChange
                          )
                        }
                        className="rounded-lg bg-sky-100 px-3 py-2 text-xs font-black text-sky-700 transition-colors hover:bg-sky-200"
                      >
                        Vacance
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          addTeamAbsence(
                            schedule,
                            "Repos exceptionnel",
                            onScheduleChange
                          )
                        }
                        className="rounded-lg bg-rose-100 px-3 py-2 text-xs font-black text-rose-700 transition-colors hover:bg-rose-200"
                      >
                        Repos exceptionnel
                      </button>
                    </div>
                  </div>

                  {schedule.absences.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {schedule.absences
                        .slice()
                        .sort((current, next) =>
                          current.date.localeCompare(next.date)
                        )
                        .map((absence) => (
                          <button
                            key={absence.id}
                            type="button"
                            onClick={() =>
                              onScheduleChange(schedule.practitionerId, {
                                absences: schedule.absences.filter(
                                  (item) => item.id !== absence.id
                                ),
                              })
                            }
                            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
                              absence.type === "Vacance"
                                ? "bg-sky-100 text-sky-700"
                                : "bg-rose-100 text-rose-700"
                            }`}
                            title="Supprimer cette absence"
                          >
                            {absence.type} · {formatAgendaDate(absence.date)}
                            <X className="h-3.5 w-3.5" />
                          </button>
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

function addTeamAbsence(
  schedule: TeamSchedule,
  type: TeamAbsence["type"],
  onScheduleChange: (
    practitionerId: string,
    updates: Partial<TeamSchedule>
  ) => void
) {
  if (!schedule.absenceDate) {
    return;
  }

  const nextAbsence: TeamAbsence = {
    id: `${schedule.practitionerId}-${schedule.absenceDate}-${type}`,
    date: schedule.absenceDate,
    type,
  };
  const absences = [
    ...schedule.absences.filter(
      (absence) =>
        !(absence.date === nextAbsence.date && absence.type === nextAbsence.type)
    ),
    nextAbsence,
  ];

  onScheduleChange(schedule.practitionerId, { absences });
}

function isPractitionerWorkingOnDate(schedule: TeamSchedule, date: string) {
  const day = new Date(`${date}T00:00:00`).getDay();
  const hasException = schedule.absences.some(
    (absence) => absence.date === date
  );

  return schedule.workingDays.includes(day) && !hasException;
}

function isAppointmentSource(value: string): value is AppointmentSource {
  return ["Prospect", "Client", "Seya", "Organique"].includes(value);
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
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day);
  nextDate.setDate(nextDate.getDate() + amount);

  return formatDateInput(nextDate);
}

function getWeekdayFromIso(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(year, month - 1, day).getDay();
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
  return new Date().toISOString().slice(0, 10);
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
  onDelete,
  onMove,
  onOpen,
  onStatusChange,
  selectedForMove,
}: {
  appointment: Appointment;
  onDelete: () => void;
  onMove: () => void;
  onOpen: () => void;
  onStatusChange: (status: AppointmentStatus) => void;
  selectedForMove: boolean;
}) {
  const practitioner = practitioners.find(
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
      className={`relative z-10 flex h-full cursor-grab flex-col overflow-hidden rounded-xl border p-3 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
        statusClasses[appointment.status]
      } ${selectedForMove ? "ring-2 ring-blue-500" : ""}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words font-black leading-tight">
            {appointment.personName}
          </p>
          <p className="text-xs font-semibold opacity-75">
            {appointment.start} · {appointment.duration} min
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <div className="flex flex-col items-end gap-1">
            <span
              className={`mt-1 h-3 w-3 rounded-full ${
                statusDotClasses[appointment.status]
              }`}
              aria-label={`Statut ${appointment.status}`}
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

function getAppointmentSlotSpan(duration: number) {
  return Math.max(1, Math.ceil(duration / 15));
}

function AppointmentDetailsModal({
  agendaSlots,
  appointment,
  cabinList,
  onClose,
  onDelete,
  onSave,
}: {
  agendaSlots: string[];
  appointment: Appointment;
  cabinList: Cabin[];
  onClose: () => void;
  onDelete: () => void;
  onSave: (appointment: Appointment) => void;
}) {
  const [form, setForm] = useState({
    ...appointment,
    email: appointment.email ?? "",
    kind: appointment.kind ?? "Rendez-vous",
    notes: appointment.notes ?? "",
  });

  function saveAppointment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onSave({
      ...appointment,
      ...form,
      personName: form.personName.trim(),
      phone: form.phone.trim(),
      treatment: form.treatment.trim(),
      email: form.email.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-sm">
      <form
        onSubmit={saveAppointment}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-950">
              Modifier le rendez-vous
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Changez la date, l&apos;heure, la cabine, la durée, le statut ou le
              commentaire.
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
            />
          </Field>

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

          <Field label="Téléphone">
            <Input
              value={form.phone}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  phone: event.target.value,
                }))
              }
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
            />
          </Field>

          <Field label="Soin ou motif">
            <Input
              required
              value={form.treatment}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  treatment: event.target.value,
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
              options={["15", "30", "45", "60", "75", "90", "105", "120", "720"]}
              labels={{
                "15": "15 min",
                "30": "30 min",
                "45": "45 min",
                "60": "1 h",
                "75": "1 h 15",
                "90": "1 h 30",
                "105": "1 h 45",
                "120": "2 h",
                "720": "Toute la journée",
              }}
              onChange={(value) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  duration: Number(value),
                }))
              }
            />
          </Field>

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
                      : getCabinTreatment(cabinList, value),
                }))
              }
            />
          </Field>

          <Field label="Praticienne">
            <Select
              value={form.practitionerId}
              options={practitioners.map((practitioner) => practitioner.id)}
              labels={Object.fromEntries(
                practitioners.map((practitioner) => [
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

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button
            variant="destructive"
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer
          </Button>
          <Button type="submit">Enregistrer</Button>
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

function Field({
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
  labels,
  onChange,
}: {
  value: string;
  options: string[];
  labels?: Record<string, string>;
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
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}
