const { familyFromTreatment, inferFamily, persistableConversations, startConversation } = require("./agent");
const { isSeyaOff, isSeyaWelcomeOff, readCenterSeya, writeSeyaConversations } = require("./store");
const { sendSharedWhatsApp } = require("./whatsapp");

const ACTIVE_THREAD_HOURS = 24;
const WELCOME_DELAY_MS = 4 * 60 * 1000;

async function welcomeNewLead(supabase, center, context, now = new Date()) {
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
  if (existing && isActiveWhatsAppThread(existing) && !isPendingWelcome(existing)) {
    return { sent: false, skipped: "already_messaged" };
  }
  if (isPendingWelcome(existing)) {
    return {
      sent: false,
      skipped: "scheduled",
      sendAt: existing.welcomeSendAt,
    };
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
  const sendAt = new Date(now.getTime() + WELCOME_DELAY_MS).toISOString();
  const next = {
    ...started,
    ...(existing || {}),
    ...started,
    leadId: context.leadId || existing?.leadId,
    phone: context.phone,
    messages: existing
      ? [...(existing.messages || []), ...(started.messages || [])]
      : started.messages,
    status: "À envoyer",
    welcomeSendAt: sendAt,
    sendError: null,
    sentVia: null,
    relanceCount: 0,
    lastRelanceAt: null,
    updatedAt: now.toISOString(),
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

  return {
    sent: false,
    skipped: "scheduled",
    sendAt,
  };
}

async function sendDueWelcomes(
  supabase,
  center,
  sendWhatsApp = sendSharedWhatsApp,
  now = new Date(),
) {
  if (!center?.id) {
    return [];
  }

  const latest = await readCenterSeya(supabase, center.id);
  if (isSeyaWelcomeOff(latest.seya)) {
    return [];
  }

  const conversations = Array.isArray(latest.seya.conversations)
    ? latest.seya.conversations
    : [];
  const sent = [];
  const nextConversations = [];
  let changed = false;

  for (const conversation of conversations) {
    const updated = { ...conversation };
    if (!isWelcomeDue(updated, now)) {
      nextConversations.push(updated);
      continue;
    }
    if ((updated.messages || []).some((item) => item.author === "lead")) {
      updated.welcomeSendAt = null;
      nextConversations.push(updated);
      changed = true;
      continue;
    }

    const again = await readCenterSeya(supabase, center.id);
    if (isSeyaWelcomeOff(again.seya)) {
      nextConversations.push(updated);
      continue;
    }

    const opening =
      [...(updated.messages || [])]
        .reverse()
        .find((item) => item.author === "seya")?.text || "";
    if (!opening) {
      nextConversations.push(updated);
      continue;
    }

    const family =
      inferFamily(again.seya, updated.campaign, updated.treatment) ||
      familyFromTreatment(
        `${updated.campaign || ""} ${updated.treatment || ""} ${updated.offerLabel || ""}`,
      );
    const result = await sendWhatsApp(updated.phone, opening, {
      firstName: updated.firstName,
      centerName: center.name,
      treatment: updated.treatment || updated.offerLabel || "",
      campaign: updated.campaign || "",
      offerLabel: updated.offerLabel || "",
      family,
      preferTemplate: true,
    });

    if (result.sent) {
      updated.status = "En cours";
      updated.welcomeSendAt = null;
      updated.sendError = null;
      updated.sentVia = result.via || "whatsapp";
      updated.updatedAt = now.toISOString();
      sent.push({
        centerId: center.id,
        leadId: updated.leadId,
        via: result.via || "whatsapp",
      });
      changed = true;
      if (updated.leadId) {
        await supabase.from("lead_events").insert({
          center_id: center.id,
          lead_id: updated.leadId,
          event_type: "system",
          note: `Seya a envoyé le premier WhatsApp (${result.via || "whatsapp"}), 4 min après l’inscription.`,
        });
      }
    } else {
      updated.sendError = result.error || result.reason || "échec WhatsApp";
      changed = true;
    }
    nextConversations.push(updated);
  }

  if (changed) {
    await writeSeyaConversations(
      supabase,
      center.id,
      persistableConversations(nextConversations),
    );
  }

  return sent;
}

function isPendingWelcome(conversation) {
  return Boolean(
    conversation &&
      conversation.status === "À envoyer" &&
      conversation.welcomeSendAt,
  );
}

function isWelcomeDue(conversation, now = new Date()) {
  if (!isPendingWelcome(conversation)) {
    return false;
  }
  const at = Date.parse(conversation.welcomeSendAt);
  return Number.isFinite(at) && now.getTime() >= at;
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

function last9(value) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

module.exports = {
  WELCOME_DELAY_MS,
  welcomeNewLead,
  sendDueWelcomes,
  isActiveWhatsAppThread,
  isPendingWelcome,
  isWelcomeDue,
};
