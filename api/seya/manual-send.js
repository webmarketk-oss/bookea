/**
 * POST /api/seya/manual-send — l'équipe écrit à un prospect sur WhatsApp, même si Seya est éteinte.
 * Le message part du numéro Bookea, est rangé dans la conversation Seya (auteur « Centre »)
 * et noté dans l'historique du prospect.
 */
const { createClient } = require("@supabase/supabase-js");
const { message } = require("./agent");
const { readCenterSeya, writeSeyaConversations } = require("./store");
const { staffCanUseCenter } = require("./_staff-auth");
const whatsapp = require("./whatsapp");

const MAX_TEXT = 4000;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service configuration");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function relation(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function noteOnLead(supabase, lead, text) {
  const now = new Date().toISOString();
  const note = `WhatsApp (centre) : ${text}`;
  await supabase.from("lead_events").insert({
    center_id: lead.center_id,
    lead_id: lead.id,
    event_type: "comment",
    note,
  });
  const patch = { latest_comment: note, updated_at: now, last_activity_at: now };
  if (lead.status === "Nouveau") {
    patch.status = "Message WhatsApp envoyé";
    await supabase.from("lead_events").insert({
      center_id: lead.center_id,
      lead_id: lead.id,
      event_type: "status",
      from_value: "Nouveau",
      to_value: "Message WhatsApp envoyé",
      note: "Statut changé après un WhatsApp de l'équipe.",
    });
  }
  await supabase.from("leads").update(patch).eq("id", lead.id);
}

function createManualSendHandler({
  createSupabase = createServiceClient,
  send = whatsapp.sendSharedWhatsApp,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "method_not_allowed" });
    }
    const payload = parseBody(req.body);
    const leadId = String(payload.leadId || "").trim();
    const text = String(payload.text || "").trim();
    if (!leadId || !text) {
      return res.status(400).json({ ok: false, error: "Message ou prospect manquant." });
    }
    if (text.length > MAX_TEXT) {
      return res.status(400).json({ ok: false, error: "Message trop long." });
    }

    try {
      const supabase = createSupabase();
      const { data: lead, error } = await supabase
        .from("leads")
        .select("id,center_id,status,clients(first_name,last_name,phone),services(name),campaigns(name)")
        .eq("id", leadId)
        .maybeSingle();
      if (error) {
        throw new Error(error.message);
      }
      if (!lead) {
        return res.status(404).json({ ok: false, error: "Prospect introuvable." });
      }
      if (!(await staffCanUseCenter(supabase, req, lead.center_id))) {
        return res.status(401).json({ ok: false, error: "Connexion requise." });
      }
      const client = relation(lead.clients) || {};
      const phone = String(client.phone || "").trim();
      if (!phone) {
        return res.status(400).json({ ok: false, error: "Ce prospect n'a pas de téléphone." });
      }

      const { data: center } = await supabase
        .from("centers")
        .select("id,name")
        .eq("id", lead.center_id)
        .maybeSingle();
      const centerName = String(center?.name || "").trim();
      const treatment = String(relation(lead.services)?.name || "").trim();
      const campaign = String(relation(lead.campaigns)?.name || "").trim();

      const sent = await send(phone, text, {
        firstName: client.first_name,
        centerName,
        treatment,
        campaign,
      });
      if (!sent.sent) {
        return res.status(409).json({
          ok: false,
          reason: sent.reason || "send_failed",
          error: sent.error || "L'envoi WhatsApp a échoué.",
        });
      }
      // Hors fenêtre de 24 h, Meta impose un modèle : c'est son texte qui est réellement parti.
      const sentText = sent.via === "template" && sent.text ? String(sent.text).trim() : text;

      const { seya } = await readCenterSeya(supabase, lead.center_id);
      const conversations = Array.isArray(seya.conversations) ? seya.conversations : [];
      const context = {
        leadId: lead.id,
        centerId: lead.center_id,
        firstName: client.first_name || "",
        lastName: client.last_name || "",
        phone,
        treatment,
        campaign,
      };
      const thread =
        whatsapp.findThread(conversations, lead.id, phone) ||
        whatsapp.teamConversation(context, { id: lead.center_id, name: centerName }, seya);
      const next = {
        ...thread,
        leadId: thread.leadId || lead.id,
        centerId: lead.center_id,
        messages: [...(thread.messages || []), message("centre", sentText)],
        status: thread.status === "À envoyer" ? "En cours" : thread.status || "En cours",
        welcomeSendAt: null,
        sendError: null,
        sentVia: "whatsapp",
        updatedAt: new Date().toISOString(),
      };
      await writeSeyaConversations(supabase, lead.center_id, [next]);
      await noteOnLead(supabase, lead, sentText).catch((noteError) => {
        console.error("[seya/manual-send] note", noteError instanceof Error ? noteError.message : noteError);
      });

      return res.status(200).json({
        ok: true,
        via: sent.via || "text",
        text: sentText,
        conversationId: next.id,
        template: sent.via === "template" ? sent.template || null : null,
      });
    } catch (error) {
      console.error("[seya/manual-send]", error instanceof Error ? error.message : error);
      return res.status(500).json({ ok: false, error: "Envoi impossible pour le moment." });
    }
  };
}

module.exports = createManualSendHandler();
module.exports.createManualSendHandler = createManualSendHandler;
