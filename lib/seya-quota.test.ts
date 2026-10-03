import assert from "node:assert/strict";
import test from "node:test";

import {
  isNewSeyaConversationBlocked,
  normalizeSeyaQuota,
  seyaRemainingConversations,
} from "./seya-quota.ts";

test("sans pack Seya, les nouvelles conversations restent ouvertes", () => {
  assert.equal(normalizeSeyaQuota(undefined).conversationLimit, null);
  assert.equal(
    isNewSeyaConversationBlocked({ seyaQuota: {} }, [{ leadId: "1" }]),
    false,
  );
});

test("un plafond atteint bloque seulement les nouveaux fils", () => {
  const settings = { seyaQuota: { conversationLimit: 2 } };
  const conversations = [{ leadId: "1" }, { leadId: "2" }];

  assert.equal(isNewSeyaConversationBlocked(settings, conversations), true);
  assert.equal(
    isNewSeyaConversationBlocked(settings, conversations, conversations[0]),
    false,
  );
  assert.equal(seyaRemainingConversations(2, 2), 0);
});

test("bloqué à 0 empêche toute nouvelle conversation", () => {
  assert.equal(
    isNewSeyaConversationBlocked({ seyaQuota: { conversationLimit: 0 } }, []),
    true,
  );
});
