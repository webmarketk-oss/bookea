import { createClient } from "@/lib/supabase";
import { SEYA_CONVERSATIONS_UPDATED_EVENT } from "@/lib/seya-settings";

/** En-tête de connexion pour les appels WhatsApp réservés à l'équipe du centre. */
export async function staffAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export type LeadWhatsAppSendResult =
  | { ok: true; via: string; text: string; conversationId?: string; template?: string | null }
  | { ok: false; error: string; reason?: string };

/** WhatsApp écrit par l'équipe depuis la fiche prospect (fonctionne même Seya éteinte). */
export async function sendLeadWhatsApp(leadId: string, text: string): Promise<LeadWhatsAppSendResult> {
  try {
    const response = await fetch("/api/seya/manual-send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await staffAuthHeaders()) },
      body: JSON.stringify({ leadId, text }),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || payload.ok !== true) {
      return {
        ok: false,
        error: String(payload.error || "L'envoi WhatsApp a échoué."),
        reason: payload.reason ? String(payload.reason) : undefined,
      };
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SEYA_CONVERSATIONS_UPDATED_EVENT));
    }
    return {
      ok: true,
      via: String(payload.via || "text"),
      text: String(payload.text || text),
      conversationId: payload.conversationId ? String(payload.conversationId) : undefined,
      template: payload.template ? String(payload.template) : null,
    };
  } catch {
    return { ok: false, error: "Impossible de joindre l'API WhatsApp Bookea." };
  }
}
