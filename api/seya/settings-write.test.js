const test = require("node:test");
const assert = require("node:assert/strict");
const { mutateCenterSettings, patchCenterSeya } = require("./settings-write");

function createCasDb(initial) {
  const centers = new Map([[initial.id, { settings: structuredClone(initial.settings) }]]);
  let forceConflict = 0;

  const api = {
    centers,
    forceConflicts(n) {
      forceConflict = n;
    },
    from() {
      let centerId = null;
      let filters = [];
      let payload = null;
      let wantsSelect = false;
      const builder = {
        select() {
          wantsSelect = true;
          return builder;
        },
        eq(key, value) {
          if (key === "id") {
            centerId = value;
          } else {
            filters.push([key, value]);
          }
          return builder;
        },
        update(next) {
          payload = next;
          return builder;
        },
        async maybeSingle() {
          const row = centers.get(centerId);
          if (!payload) {
            return {
              data: row ? { settings: structuredClone(row.settings) } : null,
              error: null,
            };
          }
          for (const [key, value] of filters) {
            if (key === "settings") {
              if (forceConflict > 0) {
                forceConflict -= 1;
                return { data: null, error: null };
              }
              if (
                JSON.stringify(row?.settings ?? null) !== JSON.stringify(value)
              ) {
                return { data: null, error: null };
              }
            }
          }
          centers.set(centerId, { settings: structuredClone(payload.settings) });
          return {
            data: wantsSelect ? { id: centerId } : null,
            error: null,
          };
        },
      };
      return builder;
    },
  };
  return api;
}

test("une écriture conversations ne peut pas écraser les fiches d’un autre save", async () => {
  const db = createCasDb({
    id: "clermont",
    settings: {
      seya: {
        treatmentBriefs: [
          { name: "Soin visage", brief: "Visage Clermont", opening: "Ouverture visage" },
          { name: "Soin minceur", brief: "Minceur Clermont" },
        ],
        conversations: [{ id: "c1", centerId: "clermont" }],
      },
    },
  });

  // Simule : la 1re tentative conversations voit encore l’ancienne version.
  db.forceConflicts(1);

  const settingsWrite = mutateCenterSettings(db, "clermont", (settings) => ({
    ...settings,
    seya: {
      ...settings.seya,
      treatmentBriefs: [
        {
          name: "Soin visage",
          brief: "Visage Clermont mis à jour",
          opening: "Ouverture visage",
        },
        { name: "Soin minceur", brief: "Minceur Clermont" },
      ],
    },
  }));

  const conversationsWrite = patchCenterSeya(db, "clermont", (seya) => ({
    ...seya,
    conversations: [
      ...(Array.isArray(seya.conversations) ? seya.conversations : []),
      { id: "c2", centerId: "clermont" },
    ],
  }));

  await Promise.all([settingsWrite, conversationsWrite]);

  const seya = db.centers.get("clermont").settings.seya;
  assert.equal(seya.treatmentBriefs[0].brief, "Visage Clermont mis à jour");
  assert.equal(seya.treatmentBriefs[1].brief, "Minceur Clermont");
  assert.equal(seya.conversations.length, 2);
});
test("le client Supabase thenable attend le filtre settings avant d’écrire", async () => {
  let stored = {
    seya: {
      brief: "Consignes La Brède",
      treatmentBriefs: [{ name: "Soin minceur", brief: "fiche" }],
      conversations: [{ id: "c1" }],
    },
  };
  let wroteWithoutSettingsFilter = false;

  const db = {
    from() {
      const filters = [];
      let payload = null;
      const builder = {
        select() {
          return builder;
        },
        eq(key, value) {
          filters.push([key, value]);
          return builder;
        },
        update(next) {
          payload = next;
          return builder;
        },
        then(resolve, reject) {
          return Promise.resolve(run()).then(resolve, reject);
        },
        maybeSingle() {
          return Promise.resolve(run());
        },
      };

      function run() {
        if (!payload) {
          return { data: { settings: structuredClone(stored) }, error: null };
        }
        const settingsFilter = filters.find(([key]) => key === "settings");
        if (!settingsFilter) {
          wroteWithoutSettingsFilter = true;
          stored = structuredClone(payload.settings);
          return { error: null };
        }
        if (JSON.stringify(stored) !== JSON.stringify(settingsFilter[1])) {
          return { data: null, error: null };
        }
        stored = structuredClone(payload.settings);
        return { data: { id: "labrede" }, error: null };
      }

      return builder;
    },
  };

  let read = structuredClone(stored);
  const settingsWrite = mutateCenterSettings(db, "labrede", () => ({
    ...read,
    seya: {
      ...read.seya,
      treatmentBriefs: [{ name: "Soin minceur", brief: "fiche modifiée" }],
    },
  }));
  const conversationsWrite = patchCenterSeya(db, "labrede", (seya) => ({
    ...seya,
    conversations: [...seya.conversations, { id: "c2" }],
  }));
  await settingsWrite;
  read = structuredClone(stored);
  await conversationsWrite;

  assert.equal(wroteWithoutSettingsFilter, false);
  assert.equal(stored.seya.treatmentBriefs[0].brief, "fiche modifiée");
  assert.equal(stored.seya.brief, "Consignes La Brède");
  assert.deepEqual(
    stored.seya.conversations.map((item) => item.id),
    ["c1", "c2"],
  );
});

test("tous les réglages d’un centre restent siens pendant une écriture de conversation", async () => {
  const db = createCasDb({
    id: "labrede",
    settings: {
      seya: {
        seyaMission: "book",
        brief: "Consignes La Brède",
        centerProfile: { supportEmail: "labrede@centre.fr" },
        relances: [{ afterDays: 2, message: "Relance La Brède" }],
        offerMaps: [{ match: "79", label: "Bilan 79", template: "seya_minceur_79_relance" }],
        treatmentBriefs: [{ name: "Soin minceur", brief: "Fiche La Brède" }],
        conversations: [{ id: "c1", centerId: "labrede" }],
      },
    },
  });
  db.centers.set("autre", {
    settings: {
      seya: {
        seyaMission: "qualify_callback",
        brief: "Consignes autre centre",
        offerMaps: [{ match: "laser", label: "Laser" }],
        treatmentBriefs: [{ name: "Épilation laser", brief: "Fiche autre" }],
        conversations: [],
      },
    },
  });
  db.forceConflicts(1);

  const settingsWrite = mutateCenterSettings(db, "labrede", (settings) => ({
    ...settings,
    seya: {
      ...settings.seya,
      seyaMission: "qualify_callback",
      brief: "Consignes La Brède mises à jour",
      centerProfile: { supportEmail: "accueil@labrede.fr" },
      relances: [{ afterDays: 3, message: "Nouveau texte" }],
      offerMaps: [{ match: "79", label: "Bilan + séance", template: "seya_minceur_79_relance" }],
      treatmentBriefs: [{ name: "Soin minceur", brief: "Fiche La Brède mise à jour" }],
    },
  }));
  const conversationsWrite = patchCenterSeya(db, "labrede", (seya) => ({
    ...seya,
    conversations: [...(seya.conversations || []), { id: "c2", centerId: "labrede" }],
  }));

  await Promise.all([settingsWrite, conversationsWrite]);

  const seya = db.centers.get("labrede").settings.seya;
  assert.equal(seya.seyaMission, "qualify_callback");
  assert.equal(seya.brief, "Consignes La Brède mises à jour");
  assert.equal(seya.centerProfile.supportEmail, "accueil@labrede.fr");
  assert.equal(seya.relances[0].message, "Nouveau texte");
  assert.equal(seya.offerMaps[0].label, "Bilan + séance");
  assert.equal(seya.treatmentBriefs[0].brief, "Fiche La Brède mise à jour");
  assert.deepEqual(
    seya.conversations.map((item) => item.id),
    ["c1", "c2"],
  );
  assert.equal(db.centers.get("autre").settings.seya.brief, "Consignes autre centre");
  assert.equal(db.centers.get("autre").settings.seya.offerMaps[0].label, "Laser");
});

test("patchCenterSeya ne touche qu’au centre demandé", async () => {
  const db = createCasDb({
    id: "gaillard",
    settings: {
      seya: {
        treatmentBriefs: [{ name: "Soin visage", brief: "Gaillard" }],
        conversations: [],
      },
    },
  });
  db.centers.set("clermont", {
    settings: {
      seya: {
        treatmentBriefs: [{ name: "Soin visage", brief: "Clermont" }],
        conversations: [],
      },
    },
  });

  await patchCenterSeya(db, "gaillard", (seya) => ({
    ...seya,
    treatmentBriefs: [{ name: "Soin visage", brief: "Gaillard modifié" }],
  }));

  assert.equal(
    db.centers.get("gaillard").settings.seya.treatmentBriefs[0].brief,
    "Gaillard modifié",
  );
  assert.equal(
    db.centers.get("clermont").settings.seya.treatmentBriefs[0].brief,
    "Clermont",
  );
});
