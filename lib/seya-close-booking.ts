import { persistableConversations } from "@/api/seya/conversation-key";
import { closeConversationsForBooking } from "@/api/seya/booking-close";
import {
  mergeSeyaConversations,
  readLocalSeyaConversations,
  writeLocalSeyaConversations,
} from "@/lib/seya-settings";
import { createClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createClient>;

export async function closeSeyaThreadsForBookedLead(
  supabase: SupabaseClient,
  centerId: string,
  match: {
    leadId?: string | null;
    phone?: string | null;
    date?: string;
    start?: string;
  },
) {
  try {
    const { data, error } = await supabase
      .from("centers")
      .select("settings")
      .eq("id", centerId)
      .maybeSingle();
    if (error || !data) {
      return;
    }

    const settings =
      data.settings && typeof data.settings === "object"
        ? (data.settings as Record<string, unknown>)
        : {};
    const seya =
      settings.seya && typeof settings.seya === "object"
        ? (settings.seya as Record<string, unknown>)
        : {};
    const conversations = Array.isArray(seya.conversations)
      ? seya.conversations
      : [];
    const next = closeConversationsForBooking(
      conversations,
      { leadId: match.leadId, phone: match.phone },
      { date: match.date, start: match.start },
    );
    const changed = next.some((item, index) => item !== conversations[index]);
    if (!changed) {
      return;
    }

    const persistable = persistableConversations(next);
    const { error: writeError } = await supabase
      .from("centers")
      .update({
        settings: {
          ...settings,
          seya: {
            ...seya,
            conversations: persistable,
          },
        },
      })
      .eq("id", centerId);
    if (writeError) {
      throw new Error(writeError.message);
    }

    if (typeof window !== "undefined") {
      writeLocalSeyaConversations(
        centerId,
        mergeSeyaConversations(
          readLocalSeyaConversations(centerId),
          persistable,
        ),
        { notify: false },
      );
    }
  } catch (error) {
    console.error("[seya] close after CRM booking skipped", error);
  }
}
