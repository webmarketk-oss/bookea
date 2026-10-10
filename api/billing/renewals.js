const {
  centerNotifyEmails,
  resolveNotifySender,
  sendBrevoToCenter,
} = require("../seya/center-notify");
const {
  appendRenewalNotices,
  dueRenewalNotices,
  expiredAdminAlert,
  renewalReminderCopy,
} = require("./_renewal");
const { reconcileCardPayments } = require("./_invoice-payment");
const {
  invoiceCenterAlert,
  pendingAutoInvoiceAlerts,
} = require("./_subscription-invoice");

const TARIFS_URL = "https://www.bookeai.fr/dashboard/tarifs";
const ADMIN_ALERTS_LIMIT = 200;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }
  return String(req.headers.authorization || "") === `Bearer ${secret}`;
}

function createServiceClient() {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service configuration");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function remindCenter(center, notice) {
  const settings = asRecord(center.settings);
  const emails = centerNotifyEmails(center, asRecord(settings.seya));
  if (emails.length === 0) {
    return { done: true, sent: false, reason: "no_email" };
  }
  const sender = await resolveNotifySender(center, asRecord(settings.seya));
  const copy = renewalReminderCopy({
    centerName: center.name,
    label: notice.label,
    renewsAt: notice.renewsAt,
    stage: notice.stage,
    tarifsUrl: TARIFS_URL,
  });
  let sent = false;
  for (const email of emails) {
    try {
      const result = await sendBrevoToCenter({
        to: email,
        subject: copy.subject,
        text: copy.text,
        centerName: center.name,
        senderEmail: sender.senderEmail,
        senderName: sender.senderName,
        tags: ["bookea-renewal"],
      });
      sent = sent || Boolean(result.sent);
    } catch (error) {
      console.error("[billing/renewals]", center.id, email, error);
    }
  }
  return { done: sent, sent, reason: sent ? "sent" : "send_failed" };
}

async function processCenter(supabase, center, now) {
  const notices = dueRenewalNotices(center.settings, now);
  if (notices.length === 0) {
    return [];
  }

  const doneKeys = [];
  const alerts = [];
  const results = [];
  for (const notice of notices) {
    if (notice.stage === "expired") {
      alerts.push(expiredAdminAlert({ centerName: center.name, offer: notice, now }));
      doneKeys.push(notice.key);
      results.push({ centerId: center.id, key: notice.key, adminAlert: true });
      continue;
    }
    const outcome = await remindCenter(center, notice);
    if (outcome.done || outcome.reason === "no_email") {
      doneKeys.push(notice.key);
    }
    results.push({ centerId: center.id, key: notice.key, ...outcome });
  }

  if (doneKeys.length === 0) {
    return results;
  }

  const { data, error } = await supabase
    .from("centers")
    .select("settings")
    .eq("id", center.id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  const latest = asRecord(data?.settings);
  const currentAlerts = Array.isArray(latest.adminAlerts) ? latest.adminAlerts : [];
  const { error: updateError } = await supabase
    .from("centers")
    .update({
      settings: {
        ...latest,
        renewalNotices: appendRenewalNotices(latest.renewalNotices, doneKeys),
        ...(alerts.length > 0
          ? {
              adminAlerts: [...alerts, ...currentAlerts].slice(
                0,
                ADMIN_ALERTS_LIMIT,
              ),
            }
          : {}),
      },
    })
    .eq("id", center.id);
  if (updateError) {
    throw new Error(updateError.message);
  }
  return results;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("centers")
      .select("id,name,email,settings");
    if (error) {
      throw new Error(error.message);
    }

    const now = new Date();
    const results = [];
    for (const row of data || []) {
      const center = { ...row, settings: asRecord(row.settings) };
      try {
        results.push(...(await processCenter(supabase, center, now)));
      } catch (centerError) {
        console.error("[billing/renewals]", row.id, centerError);
        results.push({ centerId: row.id, error: String(centerError?.message || centerError) });
      }
      for (const alert of pendingAutoInvoiceAlerts(center.settings, now.getTime())) {
        try {
          const invoiced = await invoiceCenterAlert(supabase, {
            centerId: row.id,
            alertId: alert.id,
          });
          results.push({ centerId: row.id, alertId: alert.id, invoice: invoiced.invoice.number });
        } catch (invoiceError) {
          console.error("[billing/renewals] invoice", row.id, invoiceError);
          results.push({ centerId: row.id, alertId: alert.id, error: String(invoiceError?.message || invoiceError) });
        }
      }
    }
    await reconcileCardPayments(supabase).catch((stripeError) =>
      console.error("[billing/renewals] stripe", stripeError),
    );

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (error) {
    console.error("[billing/renewals]", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "renewals_failed",
    });
  }
};
