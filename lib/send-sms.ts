import {
  fillSmsTemplate,
  getSmsTemplate,
  loadCenterSmsSettings,
  toBirthDateIso,
  type SmsTemplateVars,
} from "@/lib/sms-settings";

export type SendSmsInput = SmsTemplateVars & {
  phone: string;
  message: string;
  type?: "transactional" | "marketing";
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

  const response = await fetch("/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: input.message,
      type: input.type || "transactional",
      recipients: [
        {
          phone,
          firstName: input.firstName || "vous",
          lastName: input.lastName || "",
          date: input.date || "",
          time: input.time || "",
          treatment: input.treatment || "",
          centerName: input.centerName || "",
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
    message: fillSmsTemplate(template.body, vars),
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

export async function scheduleAppointmentReminderSms(input: {
  appointmentId: string;
  templateId?: string;
  vars: SmsTemplateVars & { phone: string };
}) {
  const { settings, centerName } = await loadCenterSmsSettings();
  const template = getSmsTemplate(
    settings,
    input.templateId || settings.reminder48hTemplateId,
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
      kind: "reminder_48h",
      message: template.body,
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
      error: result.error || "Impossible de programmer le SMS 48h",
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
