const test = require("node:test");
const assert = require("node:assert/strict");

const { applyAgentSettings, createAgentSettingsHandler } = require("./agent-settings");
const { clearConversationSourceCache } = require("./conversation-source");

const CENTER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN = "staff-admin";

function jsonRes() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {},
  };
}

function fakeDb({ settings, admin = true } = {}) {
  const db = {
    center: { id: CENTER, name: "Institut Gaillard", public_slug: "gaillard", settings },
    settingsWrites: 0,
    conversationReads: 0,
  };

  function table(name) {
    const filters = {};
    let mode = "select";
    let patch = null;
    let wantsSelect = false;
    const builder = {
      select() {
        wantsSelect = true;
        return builder;
      },
      eq(column, value) {
        filters[column] = value;
        return builder;
      },
      update(value) {
        mode = "update";
        patch = value;
        return builder;
      },
      async maybeSingle() {
        if (name === "bookea_admins") {
          return {
            data: admin && filters.profile_id === ADMIN ? { profile_id: ADMIN } : null,
            error: null,
          };
        }
        if (name === "center_members") {
          return { data: null, error: null };
        }
        if (name === "seya_conversation_backfills") {
          return { data: { read_source: "table" }, error: null };
        }
        if (name === "seya_conversations") {
          db.conversationReads += 1;
          throw new Error("les conversations ne doivent pas être lues pour un soin");
        }
        if (name === "centers" && mode === "update") {
          if (
            filters.settings &&
            JSON.stringify(filters.settings) !== JSON.stringify(db.center.settings)
          ) {
            return { data: null, error: null };
          }
          db.center.settings = patch.settings;
          db.settingsWrites += 1;
          return { data: wantsSelect ? { id: CENTER } : null, error: null };
        }
        if (name === "centers") {
          return { data: db.center, error: null };
        }
        return { data: null, error: null };
      },
    };
    return builder;
  }

  return {
    db,
    from: table,
    rpc: async (fn) => ({
      data: null,
      error: { message: `Could not find the function public.${fn}` },
    }),
    auth: {
      getUser: async (token) =>
        token === "good-token"
          ? { data: { user: { id: ADMIN } }, error: null }
          : { data: { user: null }, error: new Error("bad token") },
    },
  };
}

test.beforeEach(() => {
  clearConversationSourceCache();
});

test("ajouter un soin ne vide pas les briefs déjà en fiche", () => {
  const next = applyAgentSettings(
    {
      seya: {
        brief: "Consignes centre",
        treatmentBriefs: [{ name: "Hydrafacial", brief: "Visage" }],
      },
    },
    {
      settings: {
        brief: "Consignes centre",
        treatmentBriefs: [
          { name: "Hydrafacial", brief: "Visage" },
          { name: "Nouveau soin", brief: "Prix seulement si on te le demande." },
        ],
      },
      changedKeys: ["treatmentBriefs"],
    },
    { id: CENTER, name: "Laxou" },
  );

  assert.equal(next.seya.brief, "Consignes centre");
  assert.equal(next.seya.treatmentBriefs.length, 2);
  assert.equal(next.seya.treatmentBriefs[0].name, "Hydrafacial");
  assert.equal(next.seya.treatmentBriefs[1].name, "Nouveau soin");
});

test("retirer un soin n’enlève que celui demandé", () => {
  const next = applyAgentSettings(
    {
      seya: {
        treatmentBriefs: [
          { name: "Hydrafacial", brief: "Visage" },
          { name: "Soin minceur", brief: "Minceur" },
        ],
      },
    },
    {
      settings: {
        treatmentBriefs: [{ name: "Soin minceur", brief: "Minceur" }],
      },
      changedKeys: ["treatmentBriefs"],
      removedTreatmentNames: ["Hydrafacial"],
    },
    { id: CENTER, name: "Laxou" },
  );

  assert.equal(next.seya.treatmentBriefs.length, 1);
  assert.equal(next.seya.treatmentBriefs[0].name, "Soin minceur");
});

test("sans jeton, l’enregistrement est refusé", async () => {
  const supabase = fakeDb({
    settings: { seya: { treatmentBriefs: [] } },
  });
  const handler = createAgentSettingsHandler({ createSupabase: () => supabase });
  const res = jsonRes();
  await handler(
    {
      method: "POST",
      headers: {},
      body: {
        centerId: CENTER,
        settings: { treatmentBriefs: [{ name: "Nouveau soin" }] },
        changedKeys: ["treatmentBriefs"],
      },
    },
    res,
  );
  assert.equal(res.statusCode, 401);
  assert.equal(supabase.db.settingsWrites, 0);
});

test("un formulaire vide ne remplace pas une fiche Gaillard déjà en base", () => {
  const next = applyAgentSettings(
    {
      seya: {
        brief: "Consignes Gaillard",
        centerProfile: { activity: "Minceur, laser, visage" },
        treatmentBriefs: [
          { name: "Soin minceur", brief: "Cryo et radiofréquence." },
          { name: "Épilation définitive", brief: "Laser." },
        ],
        offerMaps: [{ match: "laser", label: "Épilation laser" }],
      },
    },
    {
      settings: {
        brief: "",
        centerProfile: {},
        treatmentBriefs: [],
        offerMaps: [],
      },
    },
    { id: CENTER, name: "JFG Clinic Gaillard" },
  );
  assert.equal(next.seya.treatmentBriefs.length, 2);
  assert.equal(next.seya.offerMaps.length, 1);
  assert.equal(next.seya.brief, "Consignes Gaillard");
  assert.equal(next.seya.centerProfile.activity, "Minceur, laser, visage");
});

test("un patch de soins vide ne remplace pas les fiches déjà en base", () => {
  const next = applyAgentSettings(
    {
      seya: {
        brief: "Consignes",
        treatmentBriefs: [{ name: "Hydrafacial", brief: "Visage" }],
      },
    },
    {
      settings: { treatmentBriefs: [] },
      changedKeys: ["treatmentBriefs"],
    },
    { id: CENTER, name: "Laxou" },
  );
  assert.equal(next.seya.treatmentBriefs.length, 1);
  assert.equal(next.seya.treatmentBriefs[0].name, "Hydrafacial");
});

test("un admin Bookea enregistre un soin via le rôle service", async () => {
  const supabase = fakeDb({
    settings: {
      seya: {
        brief: "Consignes",
        treatmentBriefs: [{ name: "Hydrafacial", brief: "Visage" }],
      },
    },
  });
  const handler = createAgentSettingsHandler({ createSupabase: () => supabase });
  const res = jsonRes();
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer good-token" },
      body: {
        centerId: CENTER,
        settings: {
          brief: "Consignes",
          treatmentBriefs: [
            { name: "Hydrafacial", brief: "Visage" },
            { name: "Nouveau soin", brief: "Prix seulement si on te le demande." },
          ],
        },
        changedKeys: ["treatmentBriefs"],
      },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.centerId, CENTER);
  assert.equal(supabase.db.settingsWrites, 1);
  assert.equal(supabase.db.center.settings.seya.treatmentBriefs.length, 2);
  assert.equal(supabase.db.center.settings.seya.treatmentBriefs[1].name, "Nouveau soin");
  assert.equal(supabase.db.center.settings.seya.brief, "Consignes");
  assert.equal(supabase.db.conversationReads, 0);
});
