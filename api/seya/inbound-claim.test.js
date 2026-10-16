/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const { claimInboundMessage } = require("./inbound-claim");

function receiptDb() {
  const rows = [];
  function from() {
    const state = { mode: "select", payload: null, filters: [] };
    function matches(row) {
      return state.filters.every(
        (filter) => String(row[filter.column]) === String(filter.value),
      );
    }
    function run() {
      if (state.mode === "insert") {
        const row = { ...state.payload };
        if (rows.some((item) => item.message_id === row.message_id)) {
          return {
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          };
        }
        rows.push(row);
        return { data: [row], error: null };
      }
      if (state.mode === "update") {
        const found = rows.filter(matches);
        for (const row of found) {
          Object.assign(row, state.payload);
        }
        return { data: found.map((row) => ({ ...row })), error: null };
      }
      return { data: rows.filter(matches).map((row) => ({ ...row })), error: null };
    }
    const builder = {
      select() {
        return builder;
      },
      eq(column, value) {
        state.filters.push({ column, value });
        return builder;
      },
      insert(payload) {
        state.mode = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload) {
        state.mode = "update";
        state.payload = payload;
        return builder;
      },
      maybeSingle() {
        const result = run();
        return Promise.resolve({
          data: result.data?.[0] ?? null,
          error: result.error,
        });
      },
      then(resolve, reject) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return builder;
  }
  return { from, rows };
}

test("deux prises du même message : une seule gagne", async () => {
  const db = receiptDb();
  const [first, second] = await Promise.all([
    claimInboundMessage(db, { messageId: "wamid.same", centerId: "center-1" }),
    claimInboundMessage(db, { messageId: "wamid.same", centerId: "center-1" }),
  ]);
  const states = [first.state, second.state].sort();
  assert.deepEqual(states, ["claimed", "duplicate"]);
  assert.equal(db.rows.length, 1);
});

test("un envoi échoué peut être repris, un envoi en cours non", async () => {
  const db = receiptDb();
  await claimInboundMessage(db, { messageId: "wamid.busy", centerId: "center-1" });
  const busy = await claimInboundMessage(db, {
    messageId: "wamid.busy",
    centerId: "center-1",
  });
  assert.equal(busy.state, "duplicate");

  db.rows[0].status = "failed";
  const retry = await claimInboundMessage(db, {
    messageId: "wamid.busy",
    centerId: "center-1",
  });
  assert.equal(retry.state, "claimed");
  assert.equal(db.rows[0].status, "processing");
});

test("table absente : le verrou dans les réglages ne laisse passer qu’un envoi, sans toucher au reste", async () => {
  const row = {
    id: "center-1",
    settings: {
      seya: {
        brief: "consigne du centre",
        conversations: [{ id: "thread-1" }],
      },
    },
  };
  let chain = Promise.resolve();
  function locked(run) {
    const next = chain.then(run, run);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  const db = {
    from(table) {
      if (table !== "centers") {
        const missing = {
          select() {
            return missing;
          },
          insert() {
            return missing;
          },
          maybeSingle() {
            return Promise.resolve({
              data: null,
              error: { code: "PGRST205", message: "Could not find the table" },
            });
          },
        };
        return missing;
      }
      const state = { mode: "select", payload: null, filters: [] };
      const builder = {
        select() {
          return builder;
        },
        eq(column, value) {
          state.filters.push({ column, value });
          return builder;
        },
        update(payload) {
          state.mode = "update";
          state.payload = payload;
          return builder;
        },
        maybeSingle() {
          return locked(() => {
            if (state.mode === "select") {
              return {
                data: {
                  id: row.id,
                  settings: JSON.parse(JSON.stringify(row.settings)),
                },
                error: null,
              };
            }
            const same = state.filters.some(
              (filter) =>
                filter.column === "settings" &&
                JSON.stringify(filter.value) === JSON.stringify(row.settings),
            );
            if (!same) {
              return { data: null, error: null };
            }
            row.settings = JSON.parse(JSON.stringify(state.payload.settings));
            return { data: { id: row.id }, error: null };
          });
        },
      };
      return builder;
    },
  };
  const [first, second] = await Promise.all([
    claimInboundMessage(db, { messageId: "wamid.laura", centerId: "center-1" }),
    claimInboundMessage(db, { messageId: "wamid.laura", centerId: "center-1" }),
  ]);
  const states = [first.state, second.state].sort();
  assert.deepEqual(states, ["claimed", "duplicate"]);
  assert.equal(row.settings.seya.brief, "consigne du centre");
  assert.equal(row.settings.seya.conversations.length, 1);
  assert.equal(row.settings.seya.inboundClaims["wamid.laura"].status, "processing");
});

test("table absente : on n’bloque pas la réponse", async () => {
  const db = {
    from() {
      const builder = {
        select() {
          return builder;
        },
        insert() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({
            data: null,
            error: { code: "PGRST205", message: "Could not find the table" },
          });
        },
      };
      return builder;
    },
  };
  const result = await claimInboundMessage(db, {
    messageId: "wamid.x",
    centerId: "center-1",
  });
  assert.equal(result.state, "unavailable");
});
