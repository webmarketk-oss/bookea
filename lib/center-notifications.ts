import { addDaysIso, todayIso } from "@/lib/crm-stats";
import { getActiveCenterContext, readActiveCenterId } from "@/lib/center-access";
import {
  loadPublicCenterProfile,
  readCenterSettings,
  type CenterExternalReview,
} from "@/lib/center-settings";
import { loadCrmLeads } from "@/lib/crm-supabase";
import { inactiveLeadStatuses } from "@/lib/lead-statuses";
import {
  PUBLIC_BOOKINGS_UPDATED_EVENT,
  readPublicBookings,
  readPublicBookingsForCenter,
  type PublicBookingRecord,
} from "@/lib/public-bookings";
import { loadSmsInbox, type SmsInboxItem } from "@/lib/sms-settings";
import { createClient } from "@/lib/supabase";
import type { Lead, LeadActivity } from "@/types/lead";

export const NOTIFICATIONS_UPDATED_EVENT = "bookea-notifications-updated";

const CLIENT_CANCELLED = "annuler";
const LOOKBACK_DAYS = 14;
const MAX_ITEMS = 40;

export type CenterNotificationKind =
  | "new_online_booking"
  | "new_lead"
  | "appointment_cancelled"
  | "appointment_moved"
  | "message_reply"
  | "new_review"
  | "confirm_tomorrow"
  | "recall_today";

export type CenterNotification = {
  id: string;
  kind: CenterNotificationKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  unread: boolean;
};

type NotificationState = {
  readIds: string[];
  bookingSlots: Record<string, string>;
};

type StatusHistoryEntry = {
  at?: string;
  source?: string;
  action?: string;
  from?: string;
  to?: string;
};

type NotificationAppointment = {
  id: string;
  date: string;
  start: string;
  status: string;
  origin: string;
  notes: string;
  cancelledAt: string | null;
  clientResponse: string | null;
  tokenSlot: string | null;
  statusHistory: StatusHistoryEntry[];
  updatedAt: string | null;
  createdAt: string | null;
  personName: string;
  treatment: string;
};

type Relation<T> = T | T[] | null;

function relationObject<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function notificationStorageKey(centerId: string) {
  return `bookea-center-notifications:${centerId}`;
}

function emptyState(): NotificationState {
  return { readIds: [], bookingSlots: {} };
}

function readNotificationState(centerId: string): NotificationState {
  if (typeof window === "undefined") {
    return emptyState();
  }

  try {
    const stored = window.localStorage.getItem(notificationStorageKey(centerId));
    if (!stored) {
      return emptyState();
    }

    const parsed = JSON.parse(stored) as Partial<NotificationState>;
    return {
      readIds: Array.isArray(parsed.readIds) ? parsed.readIds : [],
      bookingSlots:
        parsed.bookingSlots && typeof parsed.bookingSlots === "object"
          ? parsed.bookingSlots
          : {},
    };
  } catch {
    return emptyState();
  }
}

function writeNotificationState(
  centerId: string,
  state: NotificationState,
  emit = true,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    notificationStorageKey(centerId),
    JSON.stringify({
      readIds: state.readIds.slice(-200),
      bookingSlots: state.bookingSlots,
    }),
  );

  if (emit) {
    window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
  }
}

function slotKey(date: string, start: string) {
  return `${date.slice(0, 10)}|${start.slice(0, 5)}`;
}

function lookbackStart() {
  return addDaysIso(todayIso(), -LOOKBACK_DAYS);
}

function isRecentIso(value?: string | null) {
  if (!value) {
    return false;
  }

  const day = value.slice(0, 10);
  return day >= lookbackStart() && day <= todayIso();
}

function isRecentInstant(value?: string | null) {
  if (!value) {
    return false;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return isRecentIso(value);
  }

  const oldest = Date.parse(`${lookbackStart()}T00:00:00`);
  return parsed >= oldest;
}

function personLabel(firstName?: string, lastName?: string, fallback = "Cliente") {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

function formatShortDate(date: string) {
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function formatDateTime(date: string, start?: string) {
  const day = formatShortDate(date);
  const time = start?.slice(0, 5);
  return time ? `${day} à ${time}` : day;
}

function appointmentSlot(date: string, start: string) {
  return slotKey(date, start);
}

function isOnlineAppointment(appointment: NotificationAppointment) {
  return (
    appointment.origin === "public_bookea" ||
    /booking:|réservation publique/i.test(appointment.notes)
  );
}

function isClientChannel(source?: string) {
  const value = String(source || "").toLowerCase();
  return (
    value === "client_link" ||
    value === "public" ||
    value === "public_bookea" ||
    value === "client" ||
    value === "sms" ||
    value === "sms_link"
  );
}

function isCancelledStatus(status: string) {
  const value = status.toLowerCase();
  return value === "cancelled" || value === "annulation";
}

function latestHistory(
  history: StatusHistoryEntry[],
  predicate: (entry: StatusHistoryEntry) => boolean,
) {
  return [...history].reverse().find(predicate);
}

async function loadNotificationAppointments(): Promise<NotificationAppointment[]> {
  const supabase = createClient();
  const context = await getActiveCenterContext(supabase);
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
        id,
        appointment_date,
        starts_at,
        status,
        origin,
        notes,
        cancelled_at,
        client_response,
        confirmation_token_slot,
        status_history,
        updated_at,
        created_at,
        clients(first_name,last_name),
        services(name)
      `,
    )
    .eq("center_id", context.centerId)
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const client = relationObject(
      row.clients as Relation<{ first_name: string | null; last_name: string | null }>,
    );
    const service = relationObject(row.services as Relation<{ name: string | null }>);
    const history = Array.isArray(row.status_history)
      ? (row.status_history as StatusHistoryEntry[])
      : [];

    return {
      id: String(row.id),
      date: String(row.appointment_date || "").slice(0, 10),
      start: String(row.starts_at || "").slice(0, 5),
      status: String(row.status || ""),
      origin: String(row.origin || ""),
      notes: String(row.notes || ""),
      cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
      clientResponse: row.client_response ? String(row.client_response) : null,
      tokenSlot: row.confirmation_token_slot
        ? String(row.confirmation_token_slot)
        : null,
      statusHistory: history,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      createdAt: row.created_at ? String(row.created_at) : null,
      personName: personLabel(client?.first_name ?? undefined, client?.last_name ?? undefined),
      treatment: String(service?.name || "Soin à préciser"),
    };
  });
}

function bookingNotifications(
  bookings: PublicBookingRecord[],
  state: NotificationState,
) {
  const items: CenterNotification[] = [];
  const nextSlots = { ...state.bookingSlots };

  for (const booking of bookings) {
    const nextSlot = slotKey(booking.date, booking.start);
    const previousSlot = state.bookingSlots[booking.id];
    const name = personLabel(booking.firstName, booking.lastName);
    const when = formatDateTime(booking.date, booking.start);

    if (previousSlot && previousSlot !== nextSlot) {
      items.push({
        id: `moved-booking-${booking.id}-${nextSlot}`,
        kind: "appointment_moved",
        title: "RDV déplacé",
        body: `${name} a déplacé son RDV au ${when} (en ligne).`,
        href: "/dashboard/agenda",
        createdAt: booking.createdAt,
        unread: true,
      });
    } else if (isRecentInstant(booking.createdAt)) {
      items.push({
        id: `booking-${booking.id}`,
        kind: "new_online_booking",
        title: "Nouveau RDV en ligne",
        body: `${name} · ${booking.treatment} · ${when}`,
        href: "/dashboard/agenda",
        createdAt: booking.createdAt,
        unread: true,
      });
    }

    nextSlots[booking.id] = nextSlot;
  }

  state.bookingSlots = nextSlots;
  return items;
}

function bookingIdFromNotes(notes: string) {
  return notes.match(/booking:([^\s.]+)/)?.[1];
}

function onlineAppointmentBookings(
  appointments: NotificationAppointment[],
  existingIds: Set<string>,
) {
  const items: CenterNotification[] = [];

  for (const appointment of appointments) {
    if (
      !isOnlineAppointment(appointment) ||
      isCancelledStatus(appointment.status) ||
      !isRecentInstant(appointment.createdAt)
    ) {
      continue;
    }

    const bookingId = bookingIdFromNotes(appointment.notes);
    const id = bookingId ? `booking-${bookingId}` : `booking-apt-${appointment.id}`;
    if (existingIds.has(id)) {
      continue;
    }

    items.push({
      id,
      kind: "new_online_booking",
      title: "Nouveau RDV en ligne",
      body: `${appointment.personName} · ${appointment.treatment} · ${formatDateTime(appointment.date, appointment.start)}`,
      href: "/dashboard/agenda",
      createdAt: appointment.createdAt || new Date().toISOString(),
      unread: true,
    });
  }

  return items;
}

function appointmentNotifications(appointments: NotificationAppointment[]) {
  const items: CenterNotification[] = [];
  const tomorrow = addDaysIso(todayIso(), 1);
  const toConfirmTomorrow = appointments.filter(
    (appointment) =>
      appointment.date === tomorrow &&
      (appointment.status === "to_confirm" || appointment.status === "À confirmer"),
  );

  if (toConfirmTomorrow.length > 0) {
    const count = toConfirmTomorrow.length;
    items.push({
      id: `digest-confirm-${tomorrow}-${count}`,
      kind: "confirm_tomorrow",
      title:
        count === 1
          ? "1 RDV à confirmer pour demain"
          : `${count} RDV à confirmer pour demain`,
      body:
        count === 1
          ? `${toConfirmTomorrow[0].personName} · ${formatDateTime(toConfirmTomorrow[0].date, toConfirmTomorrow[0].start)}`
          : "Passez-les en revue avant demain pour limiter les absences.",
      href: "/dashboard/agenda",
      createdAt: `${todayIso()}T08:00:00`,
      unread: true,
    });
  }

  for (const appointment of appointments) {
    const cancelEntry = latestHistory(
      appointment.statusHistory,
      (entry) =>
        entry.action === "cancel" && isClientChannel(entry.source),
    );
    const cancelledByClient =
      isCancelledStatus(appointment.status) &&
      (appointment.clientResponse === CLIENT_CANCELLED ||
        Boolean(cancelEntry) ||
        (isOnlineAppointment(appointment) && Boolean(appointment.cancelledAt)));

    if (
      cancelledByClient &&
      (isRecentInstant(appointment.cancelledAt) ||
        isRecentInstant(cancelEntry?.at) ||
        isRecentInstant(appointment.updatedAt))
    ) {
      const via =
        cancelEntry?.source === "client_link" ||
        appointment.clientResponse === CLIENT_CANCELLED
          ? "lien SMS"
          : "en ligne";
      items.push({
        id: `cancel-${appointment.id}`,
        kind: "appointment_cancelled",
        title: "RDV annulé",
        body: `${appointment.personName} a annulé son RDV du ${formatDateTime(appointment.date, appointment.start)} (${via}).`,
        href: "/dashboard/agenda",
        createdAt:
          appointment.cancelledAt ||
          cancelEntry?.at ||
          appointment.updatedAt ||
          appointment.createdAt ||
          new Date().toISOString(),
        unread: true,
      });
    }

    const moveEntry = latestHistory(
      appointment.statusHistory,
      (entry) =>
        entry.action === "move" ||
        entry.action === "moved" ||
        entry.action === "reschedule",
    );
    const currentSlot = appointmentSlot(appointment.date, appointment.start);
    const smsMoved = Boolean(
      appointment.tokenSlot && appointment.tokenSlot !== currentSlot,
    );
    const movedOnlineOrSms =
      (moveEntry &&
        (isClientChannel(moveEntry.source) ||
          isOnlineAppointment(appointment) ||
          Boolean(appointment.tokenSlot))) ||
      (smsMoved && (isOnlineAppointment(appointment) || Boolean(appointment.tokenSlot)));

    if (
      movedOnlineOrSms &&
      isRecentInstant(moveEntry?.at || appointment.updatedAt)
    ) {
      const via =
        moveEntry?.source === "client_link" ||
        moveEntry?.source === "sms_link" ||
        smsMoved
          ? "lien SMS"
          : "en ligne";
      items.push({
        id: `moved-${appointment.id}-${currentSlot}`,
        kind: "appointment_moved",
        title: "RDV déplacé",
        body: `${appointment.personName} a déplacé son RDV au ${formatDateTime(appointment.date, appointment.start)} (${via}).`,
        href: "/dashboard/agenda",
        createdAt: moveEntry?.at || appointment.updatedAt || new Date().toISOString(),
        unread: true,
      });
    }
  }

  return items;
}

function leadNotifications(leads: Lead[]) {
  const items: CenterNotification[] = [];
  const today = todayIso();
  const recallLeads = leads.filter(
    (lead) =>
      lead.reminderDate === today && !inactiveLeadStatuses.includes(lead.status),
  );

  if (recallLeads.length > 0) {
    const count = recallLeads.length;
    items.push({
      id: `digest-recall-${today}-${count}`,
      kind: "recall_today",
      title:
        count === 1
          ? "1 lead a demandé à être recontacté aujourd'hui"
          : `${count} leads ont demandé à être recontactés aujourd'hui`,
      body:
        count === 1
          ? `${personLabel(recallLeads[0].firstName, recallLeads[0].lastName)} · ${recallLeads[0].treatment}`
          : "Ouvrez les prospects pour les relancer dans la journée.",
      href: "/dashboard/crm-leads",
      createdAt: `${today}T08:15:00`,
      unread: true,
    });
  }

  for (const lead of leads) {
    if (lead.status !== "Nouveau" || !isRecentIso(lead.createdDate)) {
      continue;
    }

    items.push({
      id: `lead-${lead.id}`,
      kind: "new_lead",
      title: "Nouveau lead à contacter",
      body: `${personLabel(lead.firstName, lead.lastName)} · ${lead.treatment}`,
      href: "/dashboard/crm-leads",
      createdAt: lead.lastActivityAt || `${lead.createdDate}T09:00:00`,
      unread: true,
    });
  }

  return items;
}

function replyChannel(text: string): "SMS" | "Mail" | "WA" | null {
  const value = text.toLowerCase();
  if (/réponse\s+(whatsapp|wa)\b/.test(value) || /\bwhatsapp\b/.test(value) && /réponse/.test(value)) {
    return "WA";
  }
  if (/réponse\s+(mail|e-?mail)\b/.test(value) || /réponse mail/.test(value)) {
    return "Mail";
  }
  if (/réponse\s+sms\b/.test(value)) {
    return "SMS";
  }
  return null;
}

function replyHref(channel: "SMS" | "Mail" | "WA") {
  if (channel === "SMS") {
    return "/dashboard/sms";
  }
  if (channel === "Mail") {
    return "/dashboard/mailing";
  }
  return "/dashboard/messagerie";
}

function replyNotifications(leads: Lead[], inbox: SmsInboxItem[]) {
  const items: CenterNotification[] = [];
  const seen = new Set<string>();

  for (const item of inbox) {
    if (!isRecentInstant(item.at)) {
      continue;
    }

    const id = `sms-inbox-${item.id}`;
    seen.add(id);
    items.push({
      id,
      kind: "message_reply",
      title: "Réponse SMS",
      body: `${item.clientName || item.phone} : ${item.text}`,
      href: "/dashboard/sms",
      createdAt: item.at,
      unread: item.unread !== false,
    });
  }

  for (const lead of leads) {
    for (const activity of lead.activityLog) {
      const channel = replyChannel(activity.text);
      if (!channel || !isRecentActivity(activity)) {
        continue;
      }

      const id = `reply-${activity.id}`;
      if (seen.has(id) || seen.has(`sms-inbox-${activity.id}`)) {
        continue;
      }
      if (channel === "SMS" && items.some((item) => item.body.includes(activity.text.replace(/^Réponse SMS\s*:\s*/i, "")))) {
        continue;
      }

      items.push({
        id,
        kind: "message_reply",
        title: `Réponse ${channel}`,
        body: `${personLabel(lead.firstName, lead.lastName)} : ${activity.text.replace(/^Réponse\s+(SMS|Mail|e-?mail|WA|WhatsApp)\s*:\s*/i, "")}`,
        href: replyHref(channel),
        createdAt: activity.occurredAt || `${lead.createdDate}T12:00:00`,
        unread: true,
      });
    }
  }

  return items;
}

function isRecentActivity(activity: LeadActivity) {
  if (activity.occurredAt) {
    return isRecentInstant(activity.occurredAt);
  }

  return /aujourd/i.test(activity.date);
}

function reviewNotifications(reviews: CenterExternalReview[]) {
  return reviews
    .filter((review) => isRecentIso(review.date))
    .map((review) => ({
      id: `review-${review.id}-${review.date}`,
      kind: "new_review" as const,
      title: "Nouvel avis client",
      body: `${review.author} · ${review.rating}/5 · ${review.source}`,
      href: "/dashboard/parametres-centre",
      createdAt: `${review.date}T12:00:00`,
      unread: true,
    }));
}

function sortNotifications(items: CenterNotification[]) {
  const rank: Record<CenterNotificationKind, number> = {
    confirm_tomorrow: 0,
    recall_today: 1,
    appointment_cancelled: 2,
    appointment_moved: 3,
    new_online_booking: 4,
    new_lead: 5,
    message_reply: 6,
    new_review: 7,
  };

  return items
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt) || 0;
      const rightTime = Date.parse(right.createdAt) || 0;
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return rank[left.kind] - rank[right.kind];
    })
    .slice(0, MAX_ITEMS);
}

function applyReadState(
  items: CenterNotification[],
  state: NotificationState,
): CenterNotification[] {
  const read = new Set(state.readIds);
  return items.map((item) => ({
    ...item,
    unread: item.unread && !read.has(item.id),
  }));
}

let notificationsCache: {
  at: number;
  centerId: string;
  items: CenterNotification[];
} | null = null;

function invalidateNotificationsCache() {
  notificationsCache = null;
}

async function resolveNotificationContext() {
  try {
    return await getActiveCenterContext();
  } catch {
    const settings = readCenterSettings();
    return {
      centerId: readActiveCenterId() || "local",
      centerName: settings?.center?.name || "",
      centerSlug: settings?.center?.slug || "",
    };
  }
}

function bookingsForCenter(centerName: string) {
  const named = readPublicBookingsForCenter(centerName);
  if (named.length > 0 || centerName.trim()) {
    return named;
  }

  return readPublicBookings();
}

export async function loadCenterNotifications(): Promise<CenterNotification[]> {
  const context = await resolveNotificationContext();
  const state = readNotificationState(context.centerId);

  if (
    notificationsCache &&
    notificationsCache.centerId === context.centerId &&
    Date.now() - notificationsCache.at < 8_000
  ) {
    return applyReadState(notificationsCache.items, state);
  }

  const [leads, appointments, inbox, profile] = await Promise.all([
    loadCrmLeads()
      .then((result) => result.leads)
      .catch(() => [] as Lead[]),
    loadNotificationAppointments().catch(() => [] as NotificationAppointment[]),
    loadSmsInbox().catch(() => [] as SmsInboxItem[]),
    loadPublicCenterProfile().catch(() => ({
      settings: readCenterSettings(),
    })),
  ]);

  const bookings = bookingsForCenter(context.centerName);
  const reviews =
    profile.settings?.externalReviews ??
    readCenterSettings()?.externalReviews ??
    [];

  const fromBookings = bookingNotifications(bookings, state);
  const items = sortNotifications([
    ...fromBookings,
    ...onlineAppointmentBookings(
      appointments,
      new Set(fromBookings.map((item) => item.id)),
    ),
    ...appointmentNotifications(appointments),
    ...leadNotifications(leads),
    ...replyNotifications(leads, inbox),
    ...reviewNotifications(reviews),
  ]);

  const previousSlots = JSON.stringify(readNotificationState(context.centerId).bookingSlots);
  if (JSON.stringify(state.bookingSlots) !== previousSlots) {
    writeNotificationState(context.centerId, state, false);
  }

  notificationsCache = {
    at: Date.now(),
    centerId: context.centerId,
    items,
  };

  return applyReadState(items, state);
}

export async function markCenterNotificationsRead(ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  const context = await resolveNotificationContext();
  const state = readNotificationState(context.centerId);
  const nextIds = Array.from(new Set([...state.readIds, ...ids]));
  invalidateNotificationsCache();
  writeNotificationState(context.centerId, {
    ...state,
    readIds: nextIds,
  });
}

export async function markAllCenterNotificationsRead(
  notifications: CenterNotification[],
) {
  await markCenterNotificationsRead(notifications.map((item) => item.id));
}

export function subscribeCenterNotificationSources(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const events = [
    PUBLIC_BOOKINGS_UPDATED_EVENT,
    "bookea-center-settings-updated",
    "bookea-active-center-changed",
    "bookea-appointment-status-updated",
    NOTIFICATIONS_UPDATED_EVENT,
  ];

  const handle = () => {
    invalidateNotificationsCache();
    onChange();
  };

  for (const event of events) {
    window.addEventListener(event, handle);
  }

  window.addEventListener("storage", handle);
  window.addEventListener("focus", handle);
  document.addEventListener("visibilitychange", handle);

  return () => {
    for (const event of events) {
      window.removeEventListener(event, handle);
    }
    window.removeEventListener("storage", handle);
    window.removeEventListener("focus", handle);
    document.removeEventListener("visibilitychange", handle);
  };
}
