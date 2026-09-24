/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");

const GRAPH_VERSION = "v21.0";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const mode = firstQueryValue(req.query["hub.mode"]);
    const token = firstQueryValue(req.query["hub.verify_token"]);
    const challenge = firstQueryValue(req.query["hub.challenge"]);
    const accepted = new Set(
      [process.env.WHATSAPP_VERIFY_TOKEN, process.env.META_VERIFY_TOKEN].filter(
        Boolean,
      ),
    );

    if (mode === "subscribe" && challenge && accepted.has(token)) {
      return res.status(200).send(challenge);
    }

    return res.status(200).json({
      ok: true,
      sharedNumber: true,
      number: displayNumber(),
      connected: Boolean(
        process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
      ),
      webhook: "/api/seya/whatsapp",
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = parseBody(req.body);
    if (payload.action === "send" || payload.type === "outbound") {
      const result = await sendSharedWhatsApp(payload.phone, payload.text);
      return res.status(result.sent ? 200 : 409).json(result);
    }

    const incoming = extractIncomingMessages(payload);
    if (incoming.length === 0) {
      return res.status(200).json({ received: true, handled: 0 });
    }

    const supabase = createServiceClient();
    const results = [];

    for (const message of incoming) {
      results.push(await handleIncoming(supabase, message));
    }

    return res.status(200).json({ received: true, handled: results.length, results });
  } catch (error) {
    console.error("[seya/whatsapp]", error);
    return res.status(500).json({ error: "Unable to handle WhatsApp message" });
  }
};

function parseBody(body) {
  if (!body) {
    return {};
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function displayNumber() {
  return (
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    process.env.WHATSAPP_DISPLAY_NUMBER ||
    "0623165061"
  ).trim();
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service configuration");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function last9Phone(value) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

function extractIncomingMessages(body) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  return entries.flatMap((entry) =>
    (Array.isArray(entry.changes) ? entry.changes : []).flatMap((change) =>
      (Array.isArray(change?.value?.messages) ? change.value.messages : [])
        .filter((message) => message?.from && message?.text?.body)
        .map((message) => ({
          phone: message.from,
          text: String(message.text.body || "").trim(),
          messageId: message.id,
        })),
    ),
  );
}

async function handleIncoming(supabase, incoming) {
  const context = await resolveCenterFromPhone(supabase, incoming.phone);
  if (!context) {
    return { phone: incoming.phone, routed: false, reason: "unknown_contact" };
  }

  const { data: center, error } = await supabase
    .from("centers")
    .select("id,name,settings")
    .eq("id", context.centerId)
    .maybeSingle();

  if (error || !center) {
    throw new Error(error?.message || "Center not found");
  }

  const seya = asRecord(asRecord(center.settings).seya);
  if (seya.whatsappAgentEnabled === false) {
    return {
      phone: incoming.phone,
      routed: true,
      centerId: center.id,
      skipped: "agent_disabled",
    };
  }

  const conversations = Array.isArray(seya.conversations) ? seya.conversations : [];
  const existing =
    conversations.find((item) => item.leadId === context.leadId) ||
    startConversation(context, center.name, seya);
  const next = appendLeadReply(existing, incoming.text, seya);
  const saved = [
    next,
    ...conversations.filter((item) => item.leadId !== next.leadId),
  ].slice(0, 80);

  await supabase
    .from("centers")
    .update({
      settings: {
        ...asRecord(center.settings),
        seya: {
          ...seya,
          conversations: saved,
        },
      },
    })
    .eq("id", center.id);

  const reply = [...next.messages].reverse().find((item) => item.author === "seya");
  if (reply?.text) {
    await sendSharedWhatsApp(incoming.phone, reply.text).catch((sendError) => {
      console.error("[seya/whatsapp] send failed", sendError);
    });
  }

  return {
    phone: incoming.phone,
    routed: true,
    centerId: center.id,
    centerName: center.name,
    leadId: context.leadId,
    status: next.status,
  };
}

async function resolveCenterFromPhone(supabase, phone) {
  const last9 = last9Phone(phone);
  if (last9.length < 9) {
    return null;
  }

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id,center_id,first_name,last_name,phone,updated_at")
    .or(`phone.eq.${phone},phone.eq.0${last9},phone.ilike.%${last9}%`)
    .order("updated_at", { ascending: false })
    .limit(12);

  if (error) {
    throw new Error(error.message);
  }

  const matched = (clients ?? []).filter(
    (row) => last9Phone(row.phone) === last9,
  );
  if (matched.length === 0) {
    return null;
  }

  for (const client of matched) {
    const { data: lead } = await supabase
      .from("leads")
      .select("id,status,next_action,latest_comment,service_id,updated_at,last_activity_at")
      .eq("center_id", client.center_id)
      .eq("client_id", client.id)
      .order("last_activity_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lead?.id) {
      const { data: service } = lead.service_id
        ? await supabase
            .from("services")
            .select("name")
            .eq("id", lead.service_id)
            .maybeSingle()
        : { data: null };

      return {
        centerId: client.center_id,
        clientId: client.id,
        leadId: lead.id,
        firstName: client.first_name || "bonjour",
        lastName: client.last_name || "",
        phone: client.phone || phone,
        treatment: service?.name || "",
        status: lead.status || "Nouveau",
      };
    }
  }

  const client = matched[0];
  return {
    centerId: client.center_id,
    clientId: client.id,
    leadId: client.id,
    firstName: client.first_name || "bonjour",
    lastName: client.last_name || "",
    phone: client.phone || phone,
    treatment: "",
    status: "Nouveau",
  };
}

function startConversation(context, centerName, seya) {
  const treatment = context.treatment || "";
  const brief = resolveTreatmentBrief(seya, treatment);
  const opening =
    treatment && !/soin à préciser|lead meta/i.test(treatment)
      ? `Bonjour ${context.firstName}, merci pour votre inscription chez ${centerName}. Je suis Seya. Vous avez indiqué « ${treatment} ». ${brief || "Dites-moi la zone ou l’objectif, et quels jours vous iraient."}`
      : `Bonjour ${context.firstName}, merci pour votre inscription chez ${centerName}. Je suis Seya. Quel soin souhaitez-vous, et quels jours vous iraient ?`;

  return {
    id: context.leadId,
    leadId: context.leadId,
    firstName: context.firstName,
    lastName: context.lastName,
    phone: context.phone,
    treatment,
    status: "En cours",
    qualification: { need: treatment, zone: "", delay: "", availability: "" },
    proposedSlots: [],
    messages: [message("seya", opening)],
    updatedAt: new Date().toISOString(),
  };
}

function appendLeadReply(conversation, text, seya) {
  const brief = resolveTreatmentBrief(
    seya,
    conversation.qualification?.need || conversation.treatment,
  );
  const reply =
    /^(1|2|3|oui|ok|d['’]?accord)$/i.test(text.trim()) &&
    conversation.proposedSlots?.length
      ? `Parfait, je transmets ce créneau à ${conversation.firstName ? "l’équipe" : "l’équipe"} du centre.`
      : brief ||
        "Merci. Précisez le soin ou la zone, puis un jour qui vous arrange. Je vous proposerai un vrai créneau de ce centre.";

  return {
    ...conversation,
    status: conversation.proposedSlots?.length ? "RDV proposé" : "En cours",
    messages: [
      ...(conversation.messages || []),
      message("lead", text),
      message("seya", reply),
    ],
    updatedAt: new Date().toISOString(),
  };
}

function resolveTreatmentBrief(seya, treatment) {
  const briefs = Array.isArray(seya.treatmentBriefs) ? seya.treatmentBriefs : [];
  const needle = normalize(treatment);
  if (!needle) {
    return "";
  }
  const found = briefs.find((item) => {
    const name = normalize(item?.name);
    return name && (needle.includes(name) || name.includes(needle));
  });
  return String(found?.brief || "").trim();
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function message(author, text) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    author,
    text: String(text || "").trim(),
    at: new Date().toISOString(),
  };
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

async function sendSharedWhatsApp(phone, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { sent: false, reason: "not_connected" };
  }

  const to = last9Phone(phone);
  const intl = to.length === 9 ? `33${to}` : String(phone).replace(/\D/g, "");
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: intl,
        type: "text",
        text: { body: text },
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      sent: false,
      reason: data?.error?.code === 131030 || /template|24/i.test(data?.error?.message || "")
        ? "template_required"
        : "send_failed",
      error: data?.error?.message || "WhatsApp send failed",
    };
  }
  return { sent: true, id: data?.messages?.[0]?.id || null };
}
