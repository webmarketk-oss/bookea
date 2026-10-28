const test = require("node:test");
const assert = require("node:assert/strict");

const { clearConversationSourceCache } = require("./conversation-source");
const { resetMirrorAvailability } = require("./conversation-mirror");
const { mutateCenterSettings, patchCenterSeya } = require("./settings-write");

const CENTER = "33333333-3333-3333-3333-333333333333";

function thread(phone, text, at) {
  return {
    leadId: `lead-${phone}`,
    phone,
    status: "En cours",
    messages: [{ author: "seya", text, at }],
  };
}

/** Base minimale : réglages du centre, interrupteur table, lignes seya_conversations versionnées. */
function fakeDb({ settings, rows = [], readSource = "table" }) {
  let clock = 0;
  const db = {
    settings,
    rows: rows.map((row) => ({ ...row, updated_at: `v${(clock += 1)}` })),
    settingsWrites: 0,
    rowWrites: 0,
    beforeRowUpdate: null,
  };

  function centersTable() {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { settings: db.settings }, error: null }) }),
      }),
      update: (patch) => ({
        eq: () => ({
          eq: (_column, expected) => ({
            select: () => ({
              maybeSingle: async () => {
                if (JSON.stringify(expected) !== JSON.stringify(db.settings)) {
                  return { data: null, error: null };
                }
                db.settings = patch.settings;
                db.settingsWrites += 1;
                return { data: { id: CENTER }, error: null };
              },
            }),
          }),
        }),
      }),
    };
  }

  function conversationsTable() {
    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: db.rows.map((row) => ({
                conversation_key: row.conversation_key,
                updated_at: row.updated_at,
                data: row.data,
              })),
              error: null,
            }),
          }),
        }),
      }),
      update: (row) => {
        const filters = {};
        const chain = {
          eq(column, value) {
            filters[column] = value;
            return chain;
          },
          async select() {
            if (db.beforeRowUpdate) {
              const hook = db.beforeRowUpdate;
              db.beforeRowUpdate = null;
              hook();
            }
            const target = db.rows.find(
              (item) =>
                item.conversation_key === filters.conversation_key &&
                item.updated_at === filters.updated_at,
            );
            if (!target) {
              return { data: [], error: null };
            }
            Object.assign(target, row, { updated_at: `v${(clock += 1)}` });
            db.rowWrites += 1;
            return { data: [{ id: target.conversation_key }], error: null };
          },
        };
        return chain;
      },
      upsert: async (row) => {
        const existing = db.rows.find((item) => item.conversation_key === row.conversation_key);
        if (existing) {
          Object.assign(existing, row, { updated_at: `v${(clock += 1)}` });
        } else {
          db.rows.push({ ...row, updated_at: `v${(clock += 1)}` });
        }
        db.rowWrites += 1;
        return { error: null };
      },
    };
  }

  return {
    db,
    from(table) {
      if (table === "centers") return centersTable();
      if (table === "seya_conversations") return conversationsTable();
      if (table === "seya_conversation_backfills") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { read_source: readSource }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`table inattendue ${table}`);
    },
  };
}

function row(item) {
  const last9 = item.phone.replace(/\D/g, "").slice(-9);
  return { conversation_key: `phone:${last9}`, data: { ...item, centerId: CENTER } };
}

test.beforeEach(() => {
  clearConversationSourceCache();
  resetMirrorAvailability();
});

test("table : seule la conversation modifiée est écrite, le bloc des réglages n'est pas réécrit", async () => {
  const a = thread("0611111111", "Bonjour A", "2026-10-28T08:00:00.000Z");
  const b = thread("0622222222", "Bonjour B", "2026-10-28T08:01:00.000Z");
  const supabase = fakeDb({
    settings: { seya: { whatsappAgentEnabled: true } },
    rows: [row(a), row(b)],
  });

  const result = await patchCenterSeya(supabase, CENTER, (seya) => ({
    ...seya,
    conversations: seya.conversations.map((item) =>
      item.phone === a.phone ? { ...item, status: "RDV pris" } : item,
    ),
  }));

  assert.equal(result.changed, true);
  assert.equal(supabase.db.rowWrites, 1);
  assert.equal(supabase.db.settingsWrites, 0);
  const saved = supabase.db.rows.find((item) => item.data.phone === a.phone);
  assert.equal(saved.data.status, "RDV pris");
  assert.equal(supabase.db.settings.seya.conversations, undefined);
});

test("table : une conversation modifiée entre-temps n'est pas écrasée, on relit et on recommence", async () => {
  const a = thread("0611111111", "Bonjour A", "2026-10-28T08:00:00.000Z");
  const supabase = fakeDb({ settings: { seya: {} }, rows: [row(a)] });
  // Seya ajoute un message pendant que le CRM change le statut.
  supabase.db.beforeRowUpdate = () => {
    const target = supabase.db.rows[0];
    target.data = {
      ...target.data,
      messages: [...target.data.messages, { author: "lead", text: "Merci", at: "2026-10-28T08:05:00.000Z" }],
    };
    target.updated_at = "v-concurrent";
  };

  const result = await patchCenterSeya(supabase, CENTER, (seya) => ({
    ...seya,
    conversations: seya.conversations.map((item) => ({ ...item, status: "RDV pris" })),
  }));

  assert.ok(result.attempts >= 2);
  const saved = supabase.db.rows[0].data;
  assert.equal(saved.status, "RDV pris");
  assert.equal(saved.messages.length, 2, "le message arrivé entre-temps est conservé");
});

test("table : les anciennes conversations du bloc sont reprises dans la table, puis retirées du bloc", async () => {
  const legacy = thread("0633333333", "Ancienne", "2026-10-20T08:00:00.000Z");
  const supabase = fakeDb({
    settings: { seya: { whatsappAgentEnabled: true, conversations: [legacy] } },
    rows: [],
  });

  await mutateCenterSettings(supabase, CENTER, (settings) => settings);

  assert.equal(supabase.db.rows.length, 1);
  assert.equal(supabase.db.rows[0].data.phone, legacy.phone);
  assert.equal(supabase.db.settings.seya.conversations, undefined);
  assert.equal(supabase.db.settings.seya.whatsappAgentEnabled, true);
});

test("table : un autre réglage change sans toucher aux conversations", async () => {
  const a = thread("0611111111", "Bonjour A", "2026-10-28T08:00:00.000Z");
  const supabase = fakeDb({ settings: { seya: { relanceEnabled: false } }, rows: [row(a)] });

  await patchCenterSeya(supabase, CENTER, (seya) => ({ ...seya, relanceEnabled: true }));

  assert.equal(supabase.db.rowWrites, 0);
  assert.equal(supabase.db.settingsWrites, 1);
  assert.equal(supabase.db.settings.seya.relanceEnabled, true);
  assert.equal(supabase.db.settings.seya.conversations, undefined);
});
