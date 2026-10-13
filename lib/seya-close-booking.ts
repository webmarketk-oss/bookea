import { persistableConversations } from "@/api/seya/conversation-key";
import {
  closeConversationsForBooking,
  syncConversationsCrmStatus,
} from "@/api/seya/booking-close";
import { patchCenterSeya } from "@/api/seya/settings-write";
import {
  mergeSeyaConversations,
  readLocalSeyaConversations,
  writeLocalSeyaConversations,
} from "@/lib/seya-settings";
import { createClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createClient>;

type LeadMatch = {
  leadId?: string | null;
  phone?: string | null;
};

async function updateSeyaThreads(
  supabase: SupabaseClient,
  centerId: string,
  update: (conversations: unknown[]) => unknown[],
) {
  let persistable: unknown[] | null = null;
  await patchCenterSeya(supabase, centerId, (seya) => {
    const conversations = Array.isArray(seya.conversations)
      ? seya.conversations
      : [];
    const next = update(conversations);
    const changed =
      next.length !== conversations.length ||
      next.some((item, index) => item !== conversations[index]);
    if (!changed) {
      persistable = null;
      return seya;
    }
    persistable = persistableConversations(next);
    return {
      ...seya,
      conversations: persistable,
    };
  });

  if (persistable && typeof window !== "undefined") {
    writeLocalSeyaConversations(
      centerId,
      mergeSeyaConversations(
        readLocalSeyaConversations(centerId),
        persistable as Parameters<typeof mergeSeyaConversations>[0],
      ),
      { notify: false },
    );
  }
}

export async function closeSeyaThreadsForBookedLead(
  supabase: SupabaseClient,
  centerId: string,
  match: LeadMatch & {
    date?: string;
    start?: string;
  },
) {
  try {
    await updateSeyaThreads(supabase, centerId, (conversations) =>
      closeConversationsForBooking(
        conversations,
        { leadId: match.leadId, phone: match.phone },
        { date: match.date, start: match.start },
      ),
    );
  } catch (error) {
    console.error("[seya] close after CRM booking skipped", error);
  }
}

export async function closeSeyaThreadsForCrmStatus(
  supabase: SupabaseClient,
  centerId: string,
  match: LeadMatch,
  crmStatus: string,
  recallDate?: string | null,
) {
  try {
    await updateSeyaThreads(supabase, centerId, (conversations) =>
      syncConversationsCrmStatus(conversations, match, crmStatus, recallDate),
    );
  } catch (error) {
    console.error("[seya] close after CRM status skipped", error);
  }
}
