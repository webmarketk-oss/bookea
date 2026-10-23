/* eslint-disable @typescript-eslint/no-require-imports */
const { centerSlugCandidates } = require("../meta/center-slug");
const { resolveNotifySender, sendBrevoToCenter } = require("../seya/center-notify");

// Centres pour lesquels la notification « Nouveau prospect » peut être activée.
const LEAD_NOTIFY_CENTER_SLUGS = ["jfg-clinic-chambly"];
const LEAD_NOTIFY_EVENT = "lead_notify";
const MAX_RECIPIENTS = 10;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function cleanEmails(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[\s,;]+/);
  const seen = new Set();
  const emails = [];
  for (const item of raw) {
    const email = String(item || "").trim().toLowerCase();
    if (!isValidEmail(email) || seen.has(email)) {
      continue;
    }
    seen.add(email);
    emails.push(email);
  }
  return emails.slice(0, MAX_RECIPIENTS);
}

function leadNotifyAllowed(center) {
  const candidates = centerSlugCandidates(center?.slug);
  return candidates.some((slug) => LEAD_NOTIFY_CENTER_SLUGS.includes(slug));
}

function leadNotifyConfig(settings) {
  const stored = asRecord(asRecord(settings).leadNotify);
  return {
    enabled: stored.enabled === true,
    emails: cleanEmails(stored.emails),
  };
}

function siteOrigin() {
  return String(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.bookeai.fr",
  ).replace(/\/+$/, "");
}

function leadFicheUrl(leadId, centerId) {
  const params = new URLSearchParams({ lead: String(leadId || "") });
  if (centerId) {
    params.set("center", String(centerId));
  }
  return `${siteOrigin()}/dashboard/crm-leads?${params.toString()}`;
}

function formatReceivedAt(value) {
  const stamp = Date.parse(String(value || ""));
  const date = Number.isNaN(stamp) ? new Date() : new Date(stamp);
  const day = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(":", "h");
  return `${day} à ${time}`;
}

function shown(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim() || "Non renseigné";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function leadNotifyCopy({ centerName, lead, receivedAt, url }) {
  const centre = String(centerName || "").trim() || "votre centre";
  const rows = [
    ["Nom", shown(lead?.lastName)],
    ["Prénom", shown(lead?.firstName)],
    ["Téléphone", shown(lead?.phone)],
    ["E-mail", shown(lead?.email)],
    ["Offre demandée", shown(lead?.offer)],
    ["Date de réception", formatReceivedAt(receivedAt)],
  ];
  const text = [
    `Un nouveau prospect vient d’arriver dans Bookea pour ${centre}.`,
    "",
    ...rows.map(([label, value]) => `${label} : ${value}`),
    "",
    "Consulter le prospect :",
    url,
  ].join("\n");
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#64748b;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;color:#0f172a;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f172a;max-width:560px">
<p style="margin:0 0 16px">Un nouveau prospect vient d’arriver dans Bookea pour <strong>${escapeHtml(centre)}</strong>.</p>
<table style="border-collapse:collapse;margin:0 0 24px">${htmlRows}</table>
<a href="${escapeHtml(url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Consulter le prospect</a>
</div>`;
  return {
    subject: `Nouveau prospect – ${centre}`,
    text,
    html,
  };
}

async function findNotifyEvent(supabase, leadId) {
  const { data, error } = await supabase
    .from("lead_events")
    .select("id")
    .eq("lead_id", leadId)
    .eq("event_type", LEAD_NOTIFY_EVENT)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.id || null;
}

async function claimNotify(supabase, centerId, leadId) {
  if (await findNotifyEvent(supabase, leadId)) {
    return { claimed: false };
  }
  const { data, error } = await supabase
    .from("lead_events")
    .insert({
      center_id: centerId,
      lead_id: leadId,
      event_type: LEAD_NOTIFY_EVENT,
      note: "Notification e-mail « Nouveau prospect » en cours d’envoi.",
    })
    .select("id")
    .single();
  if (error) {
    // Index unique (0008) : un autre envoi a déjà réservé ce prospect.
    if (error.code === "23505") {
      return { claimed: false };
    }
    throw new Error(error.message);
  }
  return { claimed: true, eventId: data?.id || null };
}

async function recordNotifyResult(supabase, eventId, note) {
  if (!eventId) {
    return;
  }
  await supabase.from("lead_events").update({ note }).eq("id", eventId);
}

/**
 * Envoie « Nouveau prospect – centre » aux adresses du centre, une seule fois par prospect.
 * Ne lève jamais : une erreur d’envoi ne doit pas bloquer l’enregistrement du lead.
 */
async function notifyNewLead(supabase, { center, leadId, lead, receivedAt } = {}) {
  try {
    const id = String(leadId || "").trim();
    if (!id || !center?.id) {
      return { sent: false, reason: "missing_lead" };
    }
    if (!leadNotifyAllowed(center)) {
      return { sent: false, reason: "center_not_allowed" };
    }
    const config = leadNotifyConfig(center.settings);
    if (!config.enabled) {
      return { sent: false, reason: "disabled" };
    }
    if (!config.emails.length) {
      return { sent: false, reason: "no_recipient" };
    }

    const claim = await claimNotify(supabase, center.id, id);
    if (!claim.claimed) {
      return { sent: false, reason: "already" };
    }

    const copy = leadNotifyCopy({
      centerName: center.name,
      lead,
      receivedAt: receivedAt || new Date().toISOString(),
      url: leadFicheUrl(id, center.id),
    });
    const sender = await resolveNotifySender(center, {});
    const results = [];
    for (const to of config.emails) {
      try {
        results.push(
          await sendBrevoToCenter({
            to,
            subject: copy.subject,
            text: copy.text,
            html: copy.html,
            centerName: center.name,
            senderEmail: sender.senderEmail,
            senderName: sender.senderName,
            tags: ["bookea-new-lead"],
          }),
        );
      } catch (error) {
        console.error("[center/lead-notify] send", error);
        results.push({ sent: false, to, error: String(error?.message || error) });
      }
    }
    const delivered = results.filter((item) => item.sent).map((item) => item.to);
    const failed = results.filter((item) => !item.sent);
    await recordNotifyResult(
      supabase,
      claim.eventId,
      delivered.length
        ? `Notification e-mail « Nouveau prospect » envoyée à ${delivered.join(", ")}.${failed.length ? ` Échec pour ${failed.map((item) => item.to).join(", ")}.` : ""}`
        : `Notification e-mail « Nouveau prospect » non envoyée (${failed[0]?.reason || failed[0]?.error || "erreur d’envoi"}).`,
    ).catch((error) => console.error("[center/lead-notify] record", error));
    return {
      sent: delivered.length > 0,
      reason: delivered.length ? "sent" : "send_failed",
      recipients: config.emails,
      delivered,
    };
  } catch (error) {
    console.error("[center/lead-notify]", error);
    return { sent: false, reason: "error", error: String(error?.message || error) };
  }
}

async function loadCenterForLeadNotify(supabase, centerId) {
  const { data, error } = await supabase
    .from("centers")
    .select("id,name,slug,email,settings")
    .eq("id", centerId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data || null;
}

module.exports = {
  LEAD_NOTIFY_CENTER_SLUGS,
  LEAD_NOTIFY_EVENT,
  cleanEmails,
  formatReceivedAt,
  leadFicheUrl,
  leadNotifyAllowed,
  leadNotifyConfig,
  leadNotifyCopy,
  loadCenterForLeadNotify,
  notifyNewLead,
};
