const test = require("node:test");
const assert = require("node:assert/strict");

const {
  backfillCenterConversations,
  changedConversations,
  mirrorConversationChanges,
  mirrorConversationKey,
  resetMirrorAvailability,
  toMirrorRow,
  uniqueRows,
} = require("./conversation-mirror");
const { mutateCenterSettings } = require("./settings-write");

const LAXOU = "11111111-1111-1111-1111-111111111111";
const GAILLARD = "22222222-2222-2222-2222-222222222222";

function conversation(overrides = {}) {
  return {
    leadId: "lead-1",
    phone: "06 72 67 58 88",
    firstName: "Ana",
    status: "En cours",
    messages: [{ author: "seya", text: "Bonjour Ana", at: "2026-10-19T08:00:00.000Z" }],
    ...overrides,
  };
}

function fakeSupabase({ missingTable = false, marker = null } = {}) {
  const calls = { upserts: [], markers: [] };
  return {
    calls,
    from(table) {
      if (table === "seya_conversations") {
        return {
          upsert: async (rows, options) => {
            if (missingTable) {
              return { error: { code: "42P01", message: 'relation "seya_conversations" does not exist' } };
            }
            calls.upserts.push({ rows, options });
            return { error: null };
          },
        };
      }
      if (table === "seya_conversation_backfills") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                missingTable
                  ? { data: null, error: { code: "PGRST205", message: "Could not find the table" } }
                  : { data: marker, error: null },
            }),
          }),
          upsert: async (row) => {
            calls.markers.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`table inattendue ${table}`);
    },
  };
}

test.beforeEach(() => resetMirrorAvailability());

test("clé stable : le numéro d'abord, quel que soit son format, puis le prospect", () => {
  assert.equal(mirrorConversationKey(conversation()), "phone:672675888");
  assert.equal(mirrorConversationKey(conversation({ phone: "+33672675888" })), "phone:672675888");
  assert.equal(mirrorConversationKey(conversation({ phone: "" })), "lead:lead-1");
  assert.equal(mirrorConversationKey({ id: "c-9" }), "id:c-9");
  assert.equal(mirrorConversationKey({}), "");
});

test("ligne copiée : centre imposé, champs de recherche remplis, données complètes", () => {
  const row = toMirrorRow(LAXOU, conversation({ centerId: LAXOU, _seya: { secret: true } }));
  assert.equal(row.center_id, LAXOU);
  assert.equal(row.conversation_key, "phone:672675888");
  assert.equal(row.phone_last9, "672675888");
  assert.equal(row.lead_id, "lead-1");
  assert.equal(row.message_count, 1);
  assert.equal(row.last_activity_at, "2026-10-19T08:00:00.000Z");
  assert.equal(row.data.centerId, LAXOU);
  assert.equal(row.data._seya, undefined);
});

test("seules les conversations modifiées sont recopiées, jamais celles d'un autre centre", () => {
  const before = [conversation(), conversation({ leadId: "lead-2", phone: "0611223344" })];
  const after = [
    conversation({
      messages: [
        ...before[0].messages,
        { author: "lead", text: "Combien ?", at: "2026-10-19T09:00:00.000Z" },
      ],
    }),
    before[1],
    conversation({ leadId: "lead-3", phone: "0699887766", centerId: GAILLARD }),
  ];
  const changed = changedConversations(LAXOU, before, after);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].leadId, "lead-1");
});

test("deux copies du même numéro dans un envoi : la plus récente est gardée", () => {
  const rows = uniqueRows([
    toMirrorRow(LAXOU, conversation({ messages: [{ author: "seya", text: "a", at: "2026-10-18T08:00:00.000Z" }] })),
    toMirrorRow(LAXOU, conversation({ messages: [{ author: "seya", text: "b", at: "2026-10-19T08:00:00.000Z" }] })),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.messages[0].text, "b");
});

test("table absente : la copie ne bloque rien et ne réessaie pas à chaque message", async () => {
  const supabase = fakeSupabase({ missingTable: true });
  const first = await mirrorConversationChanges(supabase, LAXOU, [], [conversation()]);
  assert.equal(first.ok, false);
  const second = await mirrorConversationChanges(supabase, LAXOU, [], [conversation({ phone: "0611223344" })]);
  assert.equal(second.ok, false);
  assert.equal(supabase.calls.upserts.length, 0);
});

test("écriture des réglages : la conversation modifiée est copiée dans la table", async () => {
  let stored = { seya: { conversations: [conversation()] } };
  const mirror = fakeSupabase();
  const supabase = {
    from(table) {
      if (table !== "centers") {
        return mirror.from(table);
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { settings: stored }, error: null }) }),
        }),
        update: ({ settings }) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => {
                  stored = settings;
                  return { data: { id: LAXOU }, error: null };
                },
              }),
            }),
          }),
        }),
      };
    },
  };
  await mutateCenterSettings(supabase, LAXOU, (settings) => ({
    ...settings,
    seya: {
      ...settings.seya,
      conversations: [conversation({ status: "RDV pris" })],
    },
  }));
  assert.equal(mirror.calls.upserts.length, 1);
  assert.equal(mirror.calls.upserts[0].rows[0].status, "RDV pris");
  assert.equal(mirror.calls.upserts[0].options.onConflict, "center_id,conversation_key");
});

test("copie initiale : une seule fois par centre, puis marquée faite", async () => {
  const supabase = fakeSupabase();
  const list = [conversation(), conversation({ leadId: "lead-2", phone: "0611223344" })];
  const first = await backfillCenterConversations(supabase, LAXOU, list);
  assert.deepEqual(first, { done: true, written: 2 });
  assert.equal(supabase.calls.markers[0].conversation_count, 2);
  const again = await backfillCenterConversations(supabase, LAXOU, list);
  assert.equal(again.skipped, "already_done");
  assert.equal(supabase.calls.upserts.length, 1);
});

test("copie initiale déjà faite lors d'un passage précédent : rien n'est réécrit", async () => {
  const supabase = fakeSupabase({ marker: { center_id: LAXOU } });
  const result = await backfillCenterConversations(supabase, LAXOU, [conversation()]);
  assert.equal(result.skipped, "already_done");
  assert.equal(supabase.calls.upserts.length, 0);
});
