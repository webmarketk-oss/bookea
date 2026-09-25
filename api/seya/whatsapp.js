/* eslint-disable @typescript-eslint/no-require-imports */
const { createClient } = require("@supabase/supabase-js");
const { generateSeyaReply, hasAiKey } = require("./ai");
const {
  readHours,
  startConversation,
  suggestAvailableSlots,
} = require("./agent");

const GRAPH_VERSION = "v21.0";

async function handler(req, res) {
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

    let graph = null;
    try {
      graph = await diagnoseGraph();
    } catch {
      graph = { reachable: false, error: "probe_failed", diagnosis: "probe_failed" };
    }
    return res.status(200).json({
      ok: true,
      sharedNumber: true,
      number: displayNumber(),
      connected: Boolean(
        process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
      ),
      webhook: "/api/seya/whatsapp",
      graph,
      ai: hasAiKey(),
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = parseBody(req.body);
    if (payload.action === "send" || payload.type === "outbound") {
      const result = await sendSharedWhatsApp(payload.phone, payload.text, {
        firstName: payload.firstName,
        centerName: payload.centerName,
        treatment: payload.treatment,
      });
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
    "0629926249"
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
  const appointments = await loadCenterAppointments(supabase, center.id);
  const slots = suggestAvailableSlots(appointments, readHours(center.settings));
  const result = await generateSeyaReply({
    conversation: existing,
    text: incoming.text,
    seya,
    slots,
    centerName: center.name,
  });
  const next = result.conversation;
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

  if (result.shouldBook) {
    await bookSeyaAppointment(supabase, center.id, context, next, result.shouldBook).catch(
      (bookError) => {
        console.error("[seya/whatsapp] book failed", bookError);
      },
    );
  }

  const reply = [...next.messages].reverse().find((item) => item.author === "seya");
  if (reply?.text) {
    await sendSharedWhatsApp(incoming.phone, reply.text, {
      firstName: context.firstName,
      centerName: center.name,
      treatment: next.qualification?.need || context.treatment || "",
    }).catch((sendError) => {
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
    booked: Boolean(result.shouldBook),
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
      .select("id,status,next_action,latest_comment,service_id,updated_at,last_activity_at,campaigns(name)")
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
        campaign: Array.isArray(lead.campaigns)
          ? lead.campaigns[0]?.name || ""
          : lead.campaigns?.name || "",
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

async function loadCenterAppointments(supabase, centerId) {
  const { data, error } = await supabase
    .from("appointments")
    .select("appointment_date,starts_at,duration_minutes,status")
    .eq("center_id", centerId)
    .gte("appointment_date", new Date().toISOString().slice(0, 10));

  if (error) {
    console.error("[seya/whatsapp] appointments", error.message);
    return [];
  }

  return (data || []).map((row) => ({
    date: row.appointment_date,
    start: String(row.starts_at || "").slice(0, 5),
    duration: row.duration_minutes || 60,
    status: row.status || "",
  }));
}

async function bookSeyaAppointment(supabase, centerId, context, conversation, slot) {
  const [{ data: rooms }, { data: practitioners }] = await Promise.all([
    supabase.from("rooms").select("id").eq("center_id", centerId).limit(1),
    supabase.from("practitioners").select("id").eq("center_id", centerId).limit(1),
  ]);

  const start = slot.time;
  const [hours, minutes] = start.split(":").map(Number);
  const endMinutes = hours * 60 + minutes + 60;
  const endsAt = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

  const { error } = await supabase.from("appointments").insert({
    center_id: centerId,
    client_id: context.clientId || null,
    lead_id: context.leadId || null,
    room_id: rooms?.[0]?.id || null,
    practitioner_id: practitioners?.[0]?.id || null,
    appointment_date: slot.date,
    starts_at: start,
    ends_at: endsAt,
    duration_minutes: 60,
    status: "to_confirm",
    origin: "seya",
    notes: `RDV Seya WhatsApp · ${conversation.qualification?.need || context.treatment || "soin"}`,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  if (context.leadId) {
    await supabase
      .from("leads")
      .update({
        status: "RDV pris",
        next_action: "RDV Seya à confirmer",
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.leadId);

    await supabase.from("lead_events").insert({
      center_id: centerId,
      lead_id: context.leadId,
      event_type: "status",
      from_value: context.status || "",
      to_value: "RDV pris",
      note: `RDV Seya posé le ${slot.label}.`,
    });
  }
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function wabaId() {
  return (
    process.env.WHATSAPP_WABA_ID ||
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
    "20162664690279331"
  ).trim();
}

async function graphGet(path) {
  const token = process.env.WHATSAPP_TOKEN;
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${path}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function graphError(result) {
  return {
    ok: Boolean(result?.ok),
    code: result?.data?.error?.code || null,
    error: result?.data?.error?.message || null,
    type: result?.data?.error?.type || null,
  };
}

function idSuffix(value) {
  const text = String(value || "");
  return text ? text.slice(-4) : null;
}

async function debugAccessToken(token) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return { available: false, reason: "no_app_secret" };
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(
      token,
    )}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
  );
  const data = await response.json().catch(() => ({}));
  const info = data?.data || {};
  if (!response.ok || data?.error) {
    return {
      available: true,
      ok: false,
      error: data?.error?.message || "debug_token_failed",
      code: data?.error?.code || null,
    };
  }

  return {
    available: true,
    ok: Boolean(info.is_valid),
    isValid: Boolean(info.is_valid),
    type: info.type || null,
    appId: info.app_id || null,
    expiresAt: info.expires_at || 0,
    scopes: Array.isArray(info.scopes) ? info.scopes : [],
    granularScopes: Array.isArray(info.granular_scopes)
      ? info.granular_scopes.map((item) => item.scope).filter(Boolean)
      : [],
  };
}

function diagnoseFromParts({ me, debug, phone, waba, phones }) {
  if (me.code === 190 || debug.code === 190 || debug.isValid === false) {
    return "token_invalide_ou_expire";
  }
  if (waba.ok === false && (waba.code === 100 || waba.code === 10)) {
    return "jeton_sans_acces_waba";
  }
  if (phone.ok === false && (phone.code === 100 || phone.code === 10)) {
    if (phones.length === 0) {
      return "jeton_sans_whatsapp";
    }
    return "mauvais_phone_number_id";
  }
  if (phone.ok && waba.ok) {
    return "ok";
  }
  return "graph_partiel";
}

async function diagnoseGraph() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { reachable: false, reason: "not_connected", diagnosis: "not_connected" };
  }

  const waba = wabaId();
  const [me, debug, phone, wabaInfo, phoneList] = await Promise.all([
    graphGet("me?fields=id,name"),
    debugAccessToken(token),
    graphGet(
      `${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`,
    ),
    graphGet(
      `${waba}?fields=id,name,currency,ownership_type,account_review_status`,
    ),
    graphGet(
      `${waba}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`,
    ),
  ]);

  const phonesOnWaba = Array.isArray(phoneList.data?.data)
    ? phoneList.data.data.map((item) => ({
        idSuffix: idSuffix(item.id),
        displayPhoneNumber: item.display_phone_number || null,
        verifiedName: item.verified_name || null,
        matchesConfigured: String(item.id) === String(phoneNumberId),
      }))
    : [];

  const phonePart = graphError(phone);
  const wabaPart = graphError(wabaInfo);
  const diagnosis = diagnoseFromParts({
    me: graphError(me),
    debug,
    phone: phonePart,
    waba: wabaPart,
    phones: phonesOnWaba,
  });

  const templates = phone.ok
    ? await graphGet(
        `${waba}/message_templates?limit=80&fields=name,status,language,category`,
      )
    : { ok: false, data: {} };

  return {
    reachable: Boolean(phone.ok),
    diagnosis,
    phoneNumberIdSuffix: idSuffix(phoneNumberId),
    wabaIdSuffix: idSuffix(waba),
    token: {
      ok: Boolean(me.ok),
      name: me.data?.name || null,
      idSuffix: idSuffix(me.data?.id),
      ...graphError(me),
    },
    debug,
    phone: {
      ...phonePart,
      displayPhoneNumber: phone.data?.display_phone_number || null,
      verifiedName: phone.data?.verified_name || null,
      qualityRating: phone.data?.quality_rating || null,
      codeVerificationStatus: phone.data?.code_verification_status || null,
    },
    waba: {
      ...wabaPart,
      name: wabaInfo.data?.name || null,
      review: wabaInfo.data?.account_review_status || null,
    },
    phonesOnWaba,
    phonesOnWabaError: phoneList.ok
      ? null
      : phoneList.data?.error?.message || "phones_failed",
    templates: Array.isArray(templates.data?.data)
      ? templates.data.data.map((item) => ({
          name: item.name,
          status: item.status,
          language: item.language,
          category: item.category,
        }))
      : [],
    templatesError: templates.ok
      ? null
      : templates.data?.error?.message || null,
    error: phonePart.error,
    code: phonePart.code,
  };
}

function templateVarCount(template) {
  const body = (template.components || []).find(
    (item) => String(item.type || "").toUpperCase() === "BODY",
  );
  return ((body?.text || "").match(/\{\{\d+\}\}/g) || []).length;
}

function isTemplateRequired(error) {
  const code = error?.code;
  const message = `${error?.message || ""} ${error?.error_data?.details || ""}`;
  return (
    code === 131047 ||
    code === 131051 ||
    /template|24 hour|re-engagement|must be a template/i.test(message)
  );
}

function frenchSendError(error, fallback) {
  const code = error?.code;
  const message = error?.message || fallback || "WhatsApp send failed";
  if (code === 190) {
    return "Le jeton WhatsApp a expiré. Il faut en recréer un dans Meta.";
  }
  if (
    code === 10 ||
    (code === 100 && /permission|does not exist|unsupported/i.test(message))
  ) {
    return "Le jeton n’a pas le droit d’envoyer depuis ce numéro Bookea.";
  }
  if (code === 133010 || /not registered|hors ligne|offline/i.test(message)) {
    return "Le numéro Bookea n’est pas encore en ligne sur l’API Cloud.";
  }
  if (code === 131030) {
    return "Ce numéro destinataire n’est pas autorisé (mode test Meta).";
  }
  if (isTemplateRequired(error)) {
    return "Meta bloque le premier message tant qu’un modèle WhatsApp n’est pas approuvé.";
  }
  return message;
}

async function sendGraphMessage(phoneNumberId, token, body) {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[seya/whatsapp] graph send", {
      status: response.status,
      code: data?.error?.code || null,
      message: data?.error?.message || null,
    });
  }
  return { ok: response.ok, data };
}

async function listTemplates() {
  const listed = await graphGet(
    `${wabaId()}/message_templates?limit=80&fields=name,status,language,category,components`,
  );
  if (!listed.ok) {
    return { templates: [], error: listed.data?.error || { message: "templates_failed" } };
  }
  return {
    templates: Array.isArray(listed.data?.data) ? listed.data.data : [],
    error: null,
  };
}

async function ensureSeyaTemplate() {
  const { templates, error } = await listTemplates();
  if (error) {
    return { template: null, error };
  }

  const approved = templates.find(
    (item) =>
      item.name === "seya_accueil" &&
      String(item.status || "").toUpperCase() === "APPROVED",
  );
  if (approved) {
    return { template: approved, error: null };
  }

  const existing = templates.find((item) => item.name === "seya_accueil");
  if (existing) {
    return { template: existing, error: null };
  }

  const token = process.env.WHATSAPP_TOKEN;
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId()}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "seya_accueil",
        language: "fr",
        category: "UTILITY",
        components: [
          {
            type: "BODY",
            text: "Bonjour {{1}}, merci pour votre inscription chez {{2}}. Je suis Seya. Vous avez indiqué {{3}}. Répondez-moi ici pour que je vous propose un créneau.",
            example: {
              body_text: [["Sam", "le centre", "votre soin"]],
            },
          },
        ],
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { template: null, error: data?.error || { message: "template_create_failed" } };
  }
  return {
    template: {
      name: "seya_accueil",
      status: data.status || "PENDING",
      language: "fr",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text: "Bonjour {{1}}, merci pour votre inscription chez {{2}}. Je suis Seya. Vous avez indiqué {{3}}.",
        },
      ],
    },
    error: null,
  };
}

function pickApprovedTemplate(templates) {
  const approved = templates.filter(
    (item) => String(item.status || "").toUpperCase() === "APPROVED",
  );
  return (
    approved.find((item) => item.name === "seya_accueil") ||
    approved.find((item) => item.name === "hello_world") ||
    approved[0] ||
    null
  );
}

async function sendTemplateMessage(phoneNumberId, token, intl, template, vars) {
  const count = templateVarCount(template);
  const parameters = [vars.firstName, vars.centerName, vars.treatment]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const padded = [
    parameters[0] || "bonjour",
    parameters[1] || "notre centre",
    parameters[2] || "votre soin",
  ].slice(0, Math.max(count, 0));

  const body = {
    messaging_product: "whatsapp",
    to: intl,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language || "fr" },
    },
  };
  if (count > 0) {
    body.template.components = [
      {
        type: "body",
        parameters: padded.slice(0, count).map((text) => ({ type: "text", text })),
      },
    ];
  }

  return sendGraphMessage(phoneNumberId, token, body);
}

async function sendSharedWhatsApp(phone, text, extras = {}) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { sent: false, reason: "not_connected" };
  }

  const to = last9Phone(phone);
  const intl = to.length === 9 ? `33${to}` : String(phone).replace(/\D/g, "");
  const vars = {
    firstName: extras.firstName || "bonjour",
    centerName: extras.centerName || "notre centre",
    treatment: extras.treatment || "votre soin",
  };

  const textResult = await sendGraphMessage(phoneNumberId, token, {
    messaging_product: "whatsapp",
    to: intl,
    type: "text",
    text: { body: String(text || "").trim() },
  });
  if (textResult.ok) {
    return { sent: true, id: textResult.data?.messages?.[0]?.id || null, via: "text" };
  }

  const textError = textResult.data?.error || {};
  if (!isTemplateRequired(textError)) {
    return {
      sent: false,
      reason: "send_failed",
      code: textError.code || null,
      error: frenchSendError(textError),
    };
  }

  const listed = await listTemplates();
  let template = pickApprovedTemplate(listed.templates);
  if (!template) {
    const ensured = await ensureSeyaTemplate();
    if (ensured.template && String(ensured.template.status || "").toUpperCase() === "APPROVED") {
      template = ensured.template;
    } else {
      return {
        sent: false,
        reason: "template_required",
        code: textError.code || null,
        error:
          ensured.template
            ? "Le modèle seya_accueil est envoyé à Meta. Dès qu’il est Approuvé, le premier message partira."
            : frenchSendError(ensured.error || textError),
        templateStatus: ensured.template?.status || null,
      };
    }
  }

  const templateResult = await sendTemplateMessage(
    phoneNumberId,
    token,
    intl,
    template,
    vars,
  );
  if (templateResult.ok) {
    return {
      sent: true,
      id: templateResult.data?.messages?.[0]?.id || null,
      via: "template",
      template: template.name,
    };
  }

  return {
    sent: false,
    reason: "template_failed",
    code: templateResult.data?.error?.code || null,
    error: frenchSendError(templateResult.data?.error, textError.message),
    template: template.name,
  };
}

handler.sendSharedWhatsApp = sendSharedWhatsApp;
module.exports = handler;
