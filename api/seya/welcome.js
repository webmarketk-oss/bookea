const { familyFromTreatment, inferFamily, persistableConversations, startConversation } = require("./agent");
const { isSeyaOff, isSeyaWelcomeOff, readCenterSeya, writeSeyaConversations } = require("./store");
const { sendSharedWhatsApp } = require("./whatsapp");

const ACTIVE_THREAD_HOURS = 24;

async function welcomeNewLead(supabase, center, context) {
  if (!center?.id || !context?.phone) {
    return { sent: false, skipped: "no_phone" };
  }

  const latest = await readCenterSeya(supabase, center.id);
  const seya = latest.seya;
  if (isSeyaWelcomeOff(seya)) {
    return { sent: false, skipped: isSeyaOff(seya) ? "disabled" : "auto_off" };
  }

  const conversations = Array.isArray(seya.conversations) ? seya.conversations : [];
  const phoneKey = last9(context.phone);
  const existing = conversations.find(
    (item) =>
      item.leadId === context.leadId ||
      (phoneKey && last9(item.phone) === phoneKey),
  );
  if (existing && isActiveWhatsAppThread(existing)) {
    return { sent: false, skipped: "already_messaged" };
  }

  const started = startConversation(
    {
      leadId: context.leadId || existing?.leadId,
      firstName: context.firstName || existing?.firstName,
      lastName: context.lastName || existing?.lastName,
      phone: context.phone,
      treatment: context.treatment || existing?.treatment,
      campaign: context.campaign || existing?.campaign,
      centerId: center.id,
    },
    center.name,
    seya,
  );
  const opening =
    [...(started.messages || [])].reverse().find((item) => item.author === "seya")
      ?.text || "";

  const family =
    inferFamily(seya, context.campaign, context.treatment) ||
    familyFromTreatment(
      `${context.campaign || ""} ${context.treatment || ""} ${started.treatment || ""} ${started.offerLabel || ""}`,
    );
  const again = await readCenterSeya(supabase, center.id);
  if (isSeyaWelcomeOff(again.seya)) {
    return { sent: false, skipped: isSeyaOff(again.seya) ? "disabled" : "auto_off" };
  }

  const result = await sendSharedWhatsApp(context.phone, opening, {
    firstName: context.firstName || existing?.firstName,
    centerName: center.name,
    treatment:
      started.treatment ||
      started.offerLabel ||
      context.treatment ||
      "",
    campaign: context.campaign || started.campaign || "",
    offerLabel: started.offerLabel || "",
    family,
    preferTemplate: true,
  });

  const next = {
    ...started,
    ...(existing || {}),
    ...started,
    leadId: context.leadId || existing?.leadId,
    phone: context.phone,
    messages: existing
      ? [...(existing.messages || []), ...(started.messages || [])]
      : started.messages,
    status: result.sent ? "En cours" : started.status,
    sendError: result.sent ? null : result.error || result.reason || "échec WhatsApp",
    sentVia: result.via || null,
    relanceCount: 0,
    lastRelanceAt: null,
    updatedAt: new Date().toISOString(),
  };

  await writeSeyaConversations(
    supabase,
    center.id,
    persistableConversations([
      next,
      ...conversations.filter(
        (item) =>
          item.leadId !== next.leadId &&
          !(phoneKey && last9(item.phone) === phoneKey),
      ),
    ]),
  );

  if (context.leadId) {
    await supabase.from("lead_events").insert({
      center_id: center.id,
      lead_id: context.leadId,
      event_type: "system",
      note: result.sent
        ? existing
          ? `Seya a renvoyé un WhatsApp (réinscription, ${result.via || "whatsapp"}).`
          : `Seya a envoyé le premier WhatsApp (${result.via || "whatsapp"}).`
        : `Seya n’a pas pu envoyer le premier WhatsApp : ${result.error || result.reason || "échec"}.`,
    });
  }

  return {
    sent: Boolean(result.sent),
    via: result.via || null,
    skipped: result.sent ? null : result.reason || "send_failed",
    error: result.error || null,
  };
}

function isActiveWhatsAppThread(conversation) {
  const last = [...(conversation?.messages || [])].reverse()[0];
  const at = last?.at || conversation?.updatedAt;
  if (!at) {
    return false;
  }
  const hours = (Date.now() - new Date(at).getTime()) / 3600000;
  if (!Number.isFinite(hours) || hours >= ACTIVE_THREAD_HOURS) {
    return false;
  }
  const closed = /pas int[eé]ress|terminé|termine/i.test(
    String(conversation?.status || ""),
  );
  return !closed;
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function last9(value) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

module.exports = {
  welcomeNewLead,
  isActiveWhatsAppThread,
};
