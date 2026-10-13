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
