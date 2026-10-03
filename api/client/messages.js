const { createServiceClient, parsePayload, rateLimit } = require("../appointments/service");
const { canMessageCenter } = require("./account-lib");
const { loadAccount, requireUser } = require("./account");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createServiceClient();
    const user = await requireUser(supabase, req);
    if (!user) {
      return res.status(401).json({ error: "unauthorized" });
    }

    if (!rateLimit(`client-message:${user.id}`, 20, 60_000)) {
      return res.status(429).json({ error: "too_many_requests" });
    }

    const payload = parsePayload(req.body);
    const centerId = String(payload.centerId || "").trim();
    const text = String(payload.text || "").replace(/\s+/g, " ").trim();
    if (!centerId || !text) {
      return res.status(400).json({ error: "invalid_message" });
    }
    if (text.length > 2000) {
      return res.status(400).json({ error: "message_too_long" });
    }

    const account = await loadAccount(supabase, user);
    if (!canMessageCenter(account, centerId)) {
      return res.status(403).json({ error: "center_not_allowed" });
    }

    const center = account.centers.find((item) => item.id === centerId);
    const clientId = center?.clientId;
    if (!clientId) {
      return res.status(403).json({ error: "center_not_allowed" });
    }

    let conversationId = account.threads.find((item) => item.centerId === centerId)?.id;
    if (!conversationId) {
      const { data, error } = await supabase
        .from("conversations")
        .upsert(
          {
            center_id: centerId,
            client_id: clientId,
            last_message_at: new Date().toISOString(),
          },
          { onConflict: "center_id,client_id" },
        )
        .select("id")
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      conversationId = data?.id;
    }

    if (!conversationId) {
      throw new Error("conversation_missing");
    }

    const now = new Date().toISOString();
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        center_id: centerId,
        conversation_id: conversationId,
        sender_client_id: clientId,
        sender_profile_id: user.id,
        channel: "in_app",
        body: text,
        created_at: now,
      })
      .select("id,created_at")
      .maybeSingle();
    if (messageError) {
      throw new Error(messageError.message);
    }

    await supabase
      .from("conversations")
      .update({ last_message_at: now })
      .eq("id", conversationId);

    return res.status(200).json({
      ok: true,
      message: {
        id: message?.id || `${Date.now()}`,
        side: "client",
        author: "Vous",
        text,
        at: message?.created_at || now,
      },
    });
  } catch (error) {
    console.error("[client/messages]", error);
    return res.status(500).json({ error: "message_failed" });
  }
};
