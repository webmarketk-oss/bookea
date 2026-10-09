const test = require("node:test");
const assert = require("node:assert/strict");
const {
  exactPhoneRows,
  filterOwnedConversations,
  ownershipFromRows,
  pickPhoneHome,
  planRehome,
} = require("./center-route");

const clermont = "center-clermont";
const gaillard = "center-gaillard";

test("un numéro approchant ne sert pas de fiche", () => {
  const rows = [
    { phone: "06124556750", center_id: gaillard },
    { phone: "0612455675", center_id: clermont },
  ];
  const matched = exactPhoneRows(rows, "612455675");
  assert.equal(matched.length, 1);
  assert.equal(matched[0].center_id, clermont);
});

test("sans fiche exacte, on ne prend pas le premier lead venu", () => {
  const homes = ownershipFromRows({
    clients: [{ id: "c1", center_id: gaillard, phone: "0699999999" }],
    leads: [{ id: "l1", center_id: gaillard, phone: "0699999999" }],
  });
  assert.equal(pickPhoneHome(homes.get("612455675")), null);
  assert.equal((homes.get("699999999") || []).length, 1);
});

test("Claudine sans fiche Gaillard revient à Clermont", () => {
  const ownership = ownershipFromRows({
    clients: [
      {
        id: "cli-claudine",
        center_id: clermont,
        phone: "0612455675",
        updated_at: "2026-10-01T10:00:00.000Z",
      },
    ],
    leads: [
      {
        id: "lead-claudine",
        center_id: clermont,
        client_id: "cli-claudine",
        phone: "33612455675",
        last_activity_at: "2026-10-08T10:00:00.000Z",
      },
    ],
  });
  const planned = planRehome(
    new Map([
      [
        gaillard,
        [
          {
            phone: "33612455675",
            firstName: "Claudine",
            lastName: "Kaminski",
            centerId: gaillard,
            messages: [
              { author: "lead", text: "Je suis éleveuse", at: "2026-10-09T10:00:00.000Z" },
            ],
          },
        ],
      ],
      [clermont, []],
    ]),
    ownership,
  );
  assert.equal(planned.moved.length, 1);
  assert.equal(planned.moved[0].from, gaillard);
  assert.equal(planned.moved[0].to, clermont);
  const gaillardNext = planned.updates.find((item) => item.centerId === gaillard);
  const clermontNext = planned.updates.find((item) => item.centerId === clermont);
  assert.equal(gaillardNext.conversations.length, 0);
  assert.equal(clermontNext.conversations.length, 1);
  assert.equal(clermontNext.conversations[0].centerId, clermont);
  assert.match(clermontNext.conversations[0].firstName, /Claudine/i);
});

test("Gaillard n’affiche pas un fil dont la fiche est ailleurs", () => {
  const kept = filterOwnedConversations(
    [
      {
        phone: "0612455675",
        centerId: gaillard,
        firstName: "Claudine",
      },
      {
        phone: "0611223344",
        centerId: gaillard,
        firstName: "Corinne",
      },
    ],
    gaillard,
    new Set(["611223344"]),
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].firstName, "Corinne");
});

test("si la fiche existe dans les deux centres, on ne déplace pas", () => {
  const ownership = ownershipFromRows({
    clients: [
      { id: "a", center_id: clermont, phone: "0611223344" },
      { id: "b", center_id: gaillard, phone: "0611223344" },
    ],
  });
  const thread = {
    phone: "0611223344",
    centerId: gaillard,
    messages: [{ author: "lead", text: "hello", at: "2026-10-09T10:00:00.000Z" }],
  };
  const planned = planRehome(
    new Map([
      [gaillard, [thread]],
      [clermont, []],
    ]),
    ownership,
  );
  assert.equal(planned.moved.length, 0);
});
