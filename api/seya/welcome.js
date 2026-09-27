const { startConversation } = require("./agent");
const { sendSharedWhatsApp } = require("./whatsapp");

async function welcomeNewLead(supabase, center, context) {
  if (!center?.id || !context?.phone) {
    return { sent: false, skipped: "no_phone" };
  }

  const settings = asRecord(center.settings);
  const seya = asRecord(settings.seya);
  if (seya.whatsappAgentEnabled === false) {
    return { sent: false, skipped: "disabled" };
  }
  if (seya.autoMessageOnNewLead === false) {
    return { sent: false, skipped: "auto_off" };
  }

  const conversations = Array.isArray(seya.conversations) ? seya.conversations : [];
  const phoneKey = last9(context.phone);
  const already = conversations.some(
    (item) =>
      item.leadId === context.leadId ||
      (phoneKey && last9(item.phone) === phoneKey),
  );
  if (already) {
    return { sent: false, skipped: "already_messaged" };
  }

  const conversation = startConversation(
    {
      leadId: context.leadId,
      firstName: context.firstName,
      lastName: context.lastName,
      phone: context.phone,
      treatment: context.treatment,
      campaign: context.campaign,
    },
    center.name,
    seya,
  );
  const opening =
    [...conversation.messages].reverse().find((item) => item.author === "seya")
      ?.text || "";

  const result = await sendSharedWhatsApp(context.phone, opening, {
    firstName: context.firstName,
    centerName: center.name,
    treatment:
      conversation.offerLabel || context.treatment || context.campaign || "",
    preferTemplate: true,
  });

  const next = {
    ...conversation,
    status: result.sent ? "En cours" : conversation.status,
    sendError: result.sent ? null : result.error || result.reason || "échec WhatsApp",
    sentVia: result.via || null,
    updatedAt: new Date().toISOString(),
  };

  await supabase
    .from("centers")
    .update({
      settings: {
        ...settings,
        seya: {
          ...seya,
          conversations: [next, ...conversations.filter((item) => item.leadId !== next.leadId)].slice(
            0,
            80,
          ),
        },
      },
    })
    .eq("id", center.id);

  if (context.leadId) {
    await supabase.from("lead_events").insert({
      center_id: center.id,
      lead_id: context.leadId,
      event_type: "system",
      note: result.sent
        ? `Seya a envoyé le premier WhatsApp (${result.via || "whatsapp"}).`
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

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function last9(value) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

module.exports = { welcomeNewLead };
