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

// La synchro réécrit tout le bloc Seya du centre : elle ne doit jamais retarder
// l’enregistrement CRM, et deux synchros d’un même centre ne doivent pas se croiser.
const seyaSyncByCenter = new Map<string, Promise<void>>();

function queueSeyaSync(centerId: string, label: string, work: () => Promise<void>) {
  const previous = seyaSyncByCenter.get(centerId) ?? Promise.resolve();
  const next = previous
    .then(work)
    .catch((error) => {
      console.error(`[seya] ${label} skipped`, error);
    });
  seyaSyncByCenter.set(centerId, next);
  void next.finally(() => {
    if (seyaSyncByCenter.get(centerId) === next) {
      seyaSyncByCenter.delete(centerId);
    }
  });
}

export async function closeSeyaThreadsForBookedLead(
  supabase: SupabaseClient,
  centerId: string,
  match: LeadMatch & {
    date?: string;
    start?: string;
  },
) {
  queueSeyaSync(centerId, "close after CRM booking", () =>
    updateSeyaThreads(supabase, centerId, (conversations) =>
      closeConversationsForBooking(
        conversations,
        { leadId: match.leadId, phone: match.phone },
        { date: match.date, start: match.start },
      ),
    ),
  );
}

export async function closeSeyaThreadsForCrmStatus(
  supabase: SupabaseClient,
  centerId: string,
  match: LeadMatch,
  crmStatus: string,
  recallDate?: string | null,
) {
  queueSeyaSync(centerId, "close after CRM status", () =>
    updateSeyaThreads(supabase, centerId, (conversations) =>
      syncConversationsCrmStatus(conversations, match, crmStatus, recallDate),
    ),
  );
}
