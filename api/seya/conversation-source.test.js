const test = require("node:test");
const assert = require("node:assert/strict");

const {
  clearConversationSourceCache,
  latestThreadForPhone,
  removeMovedThreads,
  withConversationSource,
} = require("./conversation-source");

const VICHY = "33333333-3333-3333-3333-333333333333";
const GAP = "44444444-4444-4444-4444-444444444444";

function fakeSupabase({ modes = {}, rows = [], failTable = false } = {}) {
  const calls = { deletes: [] };
  return {
    calls,
    from(table) {
      if (table === "seya_conversation_backfills") {
        return {
          select: () => ({
            eq: (_column, centerId) => ({
              maybeSingle: async () => ({
                data: modes[centerId] ? { read_source: modes[centerId] } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "seya_conversations") {
        const filters = {};
        const query = {
          select: () => query,
          eq: (column, value) => {
            filters[column] = value;
            return query;
          },
          order: () => query,
          limit: async () =>
            failTable
              ? { data: null, error: { message: "boom" } }
              : {
                  data: rows.filter((row) =>
                    Object.entries(filters).every(([key, value]) => row[key] === value),
                  ),
                  error: null,
                },
          delete: () => ({
            eq: (_c1, centerId) => ({
              eq: async (_c2, phone) => {
                calls.deletes.push({ centerId, phone });
                return { error: null };
              },
            }),
          }),
        };
        return query;
      }
      throw new Error(`table inattendue ${table}`);
    },
  };
}

const blob = { relances: [], conversations: [{ phone: "0611111111", messages: [] }] };
const tableRows = [
  {
    center_id: VICHY,
    phone_last9: "622222222",
    last_activity_at: "2026-10-19T10:00:00.000Z",
    data: { phone: "0622222222", messages: [{ author: "lead", text: "Bonjour" }] },
  },
];

test.beforeEach(() => clearConversationSourceCache());

test("centre non basculé : les conversations restent celles des réglages", async () => {
  const supabase = fakeSupabase({ rows: tableRows });
  const seya = await withConversationSource(supabase, GAP, blob);
  assert.equal(seya.conversations, blob.conversations);
});

test("centre basculé : conversations lues dans la table, réglages Seya inchangés", async () => {
  const supabase = fakeSupabase({ modes: { [VICHY]: "table" }, rows: tableRows });
  const seya = await withConversationSource(supabase, VICHY, blob);
  assert.equal(seya.conversations.length, 1);
  assert.equal(seya.conversations[0].phone, "0622222222");
  assert.equal(seya.conversations[0].centerId, VICHY);
  assert.deepEqual(seya.relances, []);
});

test("centre basculé mais table illisible : retour aux réglages, rien ne casse", async () => {
  const supabase = fakeSupabase({ modes: { [VICHY]: "table" }, failTable: true });
  const seya = await withConversationSource(supabase, VICHY, blob);
  assert.equal(seya.conversations, blob.conversations);
});

test("une conversation d'un autre centre n'est jamais lue pour ce centre", async () => {
  const supabase = fakeSupabase({
    modes: { [VICHY]: "table" },
    rows: [...tableRows, { ...tableRows[0], center_id: GAP, phone_last9: "633333333" }],
  });
  const seya = await withConversationSource(supabase, VICHY, blob);
  assert.equal(seya.conversations.length, 1);
});

test("contact inconnu du CRM : la table retrouve son centre par le numéro", async () => {
  const supabase = fakeSupabase({ rows: tableRows });
  const found = await latestThreadForPhone(supabase, "622222222");
  assert.equal(found.centerId, VICHY);
  assert.equal(await latestThreadForPhone(supabase, "699999999"), null);
});

test("conversation déplacée : sa copie est retirée du centre d'origine seulement", async () => {
  const supabase = fakeSupabase();
  await removeMovedThreads(supabase, [
    { phone: "622222222", from: GAP, to: VICHY },
    { phone: "6222", from: GAP, to: VICHY },
    { phone: "633333333", from: VICHY, to: VICHY },
  ]);
  assert.deepEqual(supabase.calls.deletes, [{ centerId: GAP, phone: "622222222" }]);
});
