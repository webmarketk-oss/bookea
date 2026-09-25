const { createClient } = require("@supabase/supabase-js");
const {
  agentSettings,
  daysSince,
  lastLeadAt,
  lastSeyaAt,
  message,
  relanceCopy,
} = require("./agent");
const { sendSharedWhatsApp } = require("./whatsapp");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const supabase = createServiceClient();
    const { data: centers, error } = await supabase
      .from("centers")
      .select("id,name,settings");
    if (error) {
      throw new Error(error.message);
    }

    const sent = [];
    for (const center of centers || []) {
      const result = await relanceCenter(supabase, center);
      sent.push(...result);
    }

    return res.status(200).json({ ok: true, sent: sent.length, results: sent });
  } catch (error) {
    console.error("[seya/relance]", error);
    return res.status(500).json({ error: "relance_failed" });
  }
};

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }
  return String(req.headers.authorization || "") === `Bearer ${secret}`;
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

async function relanceCenter(supabase, center) {
  const settings = center.settings && typeof center.settings === "object" ? center.settings : {};
  const seya = settings.seya && typeof settings.seya === "object" ? settings.seya : {};
  const agent = agentSettings(seya);
  if (!agent.relanceEnabled || seya.whatsappAgentEnabled === false) {
    return [];
  }

  const conversations = Array.isArray(seya.conversations) ? seya.conversations : [];
  const nextConversations = [];
  const sent = [];

  for (const conversation of conversations) {
    const updated = { ...conversation };
    const status = String(conversation.status || "");
    if (/rdv pris|rdv confirm|terminé|termine|pas int[eé]ress|recontacter/i.test(status)) {
      nextConversations.push(updated);
      continue;
    }

    const idleDays = Math.min(
      daysSince(lastLeadAt(conversation) || lastSeyaAt(conversation)),
      daysSince(lastSeyaAt(conversation)),
    );
    const already = Number(conversation.relanceCount || 0);
    const wanted = agent.relanceDays.find((days) => idleDays >= days && already < relanceIndex(days));
    if (!wanted) {
      nextConversations.push(updated);
      continue;
    }

    const text = relanceCopy(conversation, wanted);
    const result = await sendSharedWhatsApp(conversation.phone, text, {
      firstName: conversation.firstName,
      centerName: center.name,
      treatment: conversation.qualification?.need || conversation.treatment || "",
    });

    if (result.sent) {
      updated.messages = [...(updated.messages || []), message("seya", text)];
      updated.lastRelanceAt = new Date().toISOString();
      updated.relanceCount = already + 1;
      updated.updatedAt = updated.lastRelanceAt;
      sent.push({
        centerId: center.id,
        leadId: conversation.leadId,
        days: wanted,
        via: result.via || "whatsapp",
      });
    }

    nextConversations.push(updated);
  }

  if (sent.length > 0) {
    await supabase
      .from("centers")
      .update({
        settings: {
          ...settings,
          seya: {
            ...seya,
            conversations: nextConversations,
          },
        },
      })
      .eq("id", center.id);
  }

  return sent;
}

function relanceIndex(days) {
  if (days >= 28) {
    return 3;
  }
  if (days >= 5) {
    return 2;
  }
  return 1;
}
