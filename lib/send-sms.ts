import { getActiveCenterContext } from "@/lib/center-access";
import {
  APPOINTMENT_REMINDER_HOURS,
  getSmsTemplate,
  loadCenterSmsSettings,
  toBirthDateIso,
  type AppointmentReminderKind,
  type SmsTemplateVars,
} from "@/lib/sms-settings";

export type SendSmsInput = SmsTemplateVars & {
  phone: string;
  message: string;
  type?: "transactional" | "marketing";
  centerId?: string;
  appointmentId?: string;
};

export type SendSmsResult = {
  ok: boolean;
  sent: number;
  failed: number;
  remainingCredits: number | null;
  skipped?: boolean;
  scheduled?: boolean;
  sendAt?: string | null;
  error?: string;
};

export async function sendBookeaSms(input: SendSmsInput): Promise<SendSmsResult> {
  const phone = input.phone.trim();

  if (!phone) {
    return {
      ok: false,
      sent: 0,
      failed: 1,
      remainingCredits: null,
      error: "missing_phone",
    };
  }

  let centerId = input.centerId || "";

  if (!centerId) {
    try {
      const context = await getActiveCenterContext();
      centerId = context.centerId;
    } catch {
      centerId = "";
    }
  }

  const response = await fetch("/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: input.message,
      type: input.type || "transactional",
      centerId,
      centerName: input.centerName || "",
      appointmentId: input.appointmentId || "",
      recipients: [
        {
          phone,
          firstName: input.firstName || "vous",
          lastName: input.lastName || "",
          date: input.date || "",
          time: input.time || "",
          treatment: input.treatment || "",
          centerName: input.centerName || "",
          confirmationLink: input.confirmationLink || "",
        },
      ],
    }),
  });

  const result = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    sent?: number;
    failed?: number;
    remainingCredits?: number | null;
    error?: string;
    results?: Array<{ error?: string }>;
  };

  if (!response.ok || !result.ok) {
    return {
      ok: false,
      sent: result.sent ?? 0,
      failed: result.failed ?? 1,
      remainingCredits:
        typeof result.remainingCredits === "number" ? result.remainingCredits : null,
      error: result.error || result.results?.[0]?.error || "Envoi SMS refusé",
    };
  }

  return {
    ok: true,
    sent: result.sent ?? 1,
    failed: result.failed ?? 0,
    remainingCredits:
      typeof result.remainingCredits === "number" ? result.remainingCredits : null,
  };
}

export async function sendSavedTemplateSms(
  templateId: string | undefined,
  recipient: Omit<SendSmsInput, "message">,
) {
  const { settings, centerName } = await loadCenterSmsSettings();
  const template = getSmsTemplate(settings, templateId);
  const vars = {
    ...recipient,
    centerName: recipient.centerName || centerName,
  };

  return sendBookeaSms({
    ...vars,
    message: template.body,
  });
}

export async function syncBirthdaySms(input: {
  clientId?: string;
  birthDate?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
}): Promise<SendSmsResult> {
  const { settings, centerName, centerId } = await loadCenterSmsSettings();
  const enabled = input.enabled !== false && settings.birthdaySmsEnabled !== false;
  const template = getSmsTemplate(
    settings,
    settings.birthdayTemplateId || "anniversaire",
  );
  const vars = {
    phone: input.phone || "",
    firstName: input.firstName || "vous",
    lastName: input.lastName || "",
    centerName,
  };

  const response = await fetch("/api/sms/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: enabled ? "schedule" : "cancel",
      kind: "birthday",
      clientId: input.clientId,
      centerId,
      birthDate: toBirthDateIso(input.birthDate),
      phone: vars.phone,
      message: template.body,
      enabled,
      vars,
    }),
  });

  const result = (await response.json().catch(() => ({}))) as SendSmsResult & {
    sendAt?: string;
  };

  if (!response.ok || !result.ok) {
    return {
      ok: false,
      sent: result.sent ?? 0,
      failed: 1,
      remainingCredits: null,
      error: result.error || "Impossible de programmer le SMS anniversaire",
    } satisfies SendSmsResult;
  }

  return {
    ok: true,
    sent: result.sent ?? 0,
    failed: 0,
    remainingCredits: result.remainingCredits ?? null,
    scheduled: result.scheduled,
    sendAt: result.sendAt ?? null,
  } satisfies SendSmsResult;
}

const REMINDER_LABELS: Record<AppointmentReminderKind, string> = {
  reminder_j7: "J-7 laser",
  reminder_j5: "J-5",
  reminder_48h: "48h",
  reminder_24h: "24h",
};

function reminderTemplateId(
  settings: Awaited<ReturnType<typeof loadCenterSmsSettings>>["settings"],
  kind: AppointmentReminderKind,
  templateId?: string,
) {
  if (templateId) {
    return templateId;
  }

  if (kind === "reminder_j7") {
    return settings.reminderJ7TemplateId;
  }

  if (kind === "reminder_j5") {
    return settings.reminderJ5TemplateId;
  }

  if (kind === "reminder_24h") {
    return settings.reminder24hTemplateId;
  }

  return settings.reminder48hTemplateId;
}

export async function scheduleAppointmentReminderSms(input: {
  appointmentId: string;
  templateId?: string;
  kind?: AppointmentReminderKind;
  vars: SmsTemplateVars & { phone: string };
}) {
  const kind = input.kind || "reminder_48h";
  const { settings, centerName } = await loadCenterSmsSettings();
  const template = getSmsTemplate(
    settings,
    reminderTemplateId(settings, kind, input.templateId),
  );
  const vars = {
    ...input.vars,
    centerName: input.vars.centerName || centerName,
  };

  const response = await fetch("/api/sms/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "schedule",
      appointmentId: input.appointmentId,
      kind,
      hoursBefore: APPOINTMENT_REMINDER_HOURS[kind],
      message: template.body,
      vars,
    }),
  });

  const result = (await response.json().catch(() => ({}))) as SendSmsResult & {
    sendAt?: string;
  };
  const label = REMINDER_LABELS[kind];

  if (!response.ok || !result.ok) {
    return {
      ok: false,
      sent: result.sent ?? 0,
      failed: 1,
      remainingCredits: null,
      error: result.error || `Impossible de programmer le SMS ${label}`,
    } satisfies SendSmsResult;
  }

  return {
    ok: true,
    sent: result.sent ?? 0,
    failed: 0,
    remainingCredits: result.remainingCredits ?? null,
    scheduled: result.scheduled,
    sendAt: result.sendAt ?? null,
  } satisfies SendSmsResult;
}

export async function cancelAppointmentSmsJobs(appointmentId: string) {
  await fetch("/api/sms/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "cancel",
      appointmentId,
    }),
  }).catch(() => null);
}

export async function rescheduleAppointmentSmsJobs(appointmentId: string) {
  await fetch("/api/sms/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "reschedule",
      appointmentId,
    }),
  }).catch(() => null);
}
