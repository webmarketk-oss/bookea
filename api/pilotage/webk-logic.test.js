const assert = require("node:assert/strict");
const test = require("node:test");
const { requireWebkPilotage } = require("./webk-access");
const {
  buildPilotageCenters,
  canOpenWebkPilotage,
  countCreatedLeads,
  formatActionLine,
  isPilotageAlert,
  monthPeriod,
  rdvTakenTimestamps,
  sortPilotageCenters,
} = require("./webk-logic");

const NOW = new Date("2026-11-11T16:00:00.000Z");

function hoursAgo(hours) {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function fakeSupabase({ user, admin, profile }) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: user ? null : { message: "no" } }),
    },
    from(table) {
      const data = table === "bookea_admins" ? admin : profile;
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data, error: null }) };
            },
          };
        },
      };
    },
  };
}

test("Cynthia admin ouvre le pilotage, un autre admin non", async () => {
  const cynthia = await requireWebkPilotage(
    fakeSupabase({
      user: { id: "c1", email: "cynthia@webkagency.net" },
      admin: { label: "Cynthia" },
      profile: { full_name: "Cynthia" },
    }),
    { headers: { authorization: "Bearer token" } },
  );
  assert.equal(cynthia.ok, true);

  const samantha = await requireWebkPilotage(
    fakeSupabase({
      user: { id: "s1", email: "samantha.kahlaoui@webkagency.net" },
      admin: { label: "Samantha" },
      profile: { full_name: "Samantha Kahlaoui" },
    }),
    { headers: { authorization: "Bearer token" } },
  );
  assert.equal(samantha.ok, true);
  assert.equal(samantha.authorName, "Samantha Kahlaoui");

  const otherAdmin = await requireWebkPilotage(
    fakeSupabase({
      user: { id: "a1", email: "webmarket.k@gmail.com" },
      admin: { label: "Admin Bookea" },
      profile: { full_name: "Admin Bookea" },
    }),
    { headers: { authorization: "Bearer token" } },
  );
  assert.equal(otherAdmin.ok, false);
  assert.equal(otherAdmin.status, 403);

  const namedButNotAdmin = await requireWebkPilotage(
    fakeSupabase({
      user: { id: "n1", email: "samantha@centre.fr" },
      admin: null,
      profile: { full_name: "Samantha" },
    }),
    { headers: { authorization: "Bearer token" } },
  );
  assert.equal(namedButNotAdmin.status, 403);

  const anonymous = await requireWebkPilotage(fakeSupabase({ user: null }), { headers: {} });
  assert.equal(anonymous.status, 401);
  assert.equal(
    canOpenWebkPilotage({
      isAdmin: true,
      email: "webmarket.k@gmail.com",
      fullName: "Admin Bookea",
      adminLabel: "Admin Bookea",
    }),
    false,
  );
});

test("le compteur suit la date de réception, pas une mise à jour", () => {
  const counts = countCreatedLeads(
    [
      hoursAgo(2),
      hoursAgo(24),
      hoursAgo(24 * 3),
      hoursAgo(24 * 10),
      hoursAgo(24 * 20),
    ],
    NOW,
  );
  assert.deepEqual(counts, { leads48h: 2, leads7d: 3, leadsPrev7d: 1 });
  assert.equal(isPilotageAlert(0, 1), true);
  assert.equal(isPilotageAlert(2, 5), true);
  assert.equal(isPilotageAlert(5, 5), false);
});

test("le classement et la ligne d’historique", () => {
  const rows = buildPilotageCenters({
    centers: [
      { id: "p", name: "Pélissanne", city: "Pélissanne", admin: { isActive: true } },
      { id: "off", name: "Fermé", city: "", admin: { isActive: false } },
      { id: "b", name: "Bruz", city: "Bruz" },
    ],
    counts: [{ centerId: "b", leads48h: 4, leads7d: 10, leadsPrev7d: 3 }],
    thresholds: [{ centerId: "p", minLeads48h: 2 }],
    actions: [
      {
        id: "a1",
        centerId: "p",
        actedOn: "2026-11-11",
        campaign: "Minceur",
        changeText: "Zone élargie et nouveau visuel lancé",
        reviewOn: "2026-11-13",
        authorName: "Samantha",
      },
    ],
    campaigns: [{ centerId: "p", name: "Minceur" }],
  });
  assert.deepEqual(rows.map((row) => row.name), ["Pélissanne", "Bruz"]);
  assert.equal(rows[0].alert, true);
  assert.equal(rows[0].leads7d, 0);
  assert.equal(rows[1].leads7d, 10);
  assert.equal(rows[1].delta, 7);
  assert.equal(
    formatActionLine("Pélissanne", rows[0].lastAction),
    "Pélissanne · Minceur — 11 novembre — Zone élargie et nouveau visuel lancé — À revoir le 13 novembre.",
  );
  assert.deepEqual(
    sortPilotageCenters(rows, "desc").map((row) => row.name),
    ["Bruz", "Pélissanne"],
  );
  assert.deepEqual(
    sortPilotageCenters(rows, "asc").map((row) => row.name),
    ["Pélissanne", "Bruz"],
  );
});

test("un RDV compte une fois, à la date où il a été pris", () => {
  const booked = "2026-11-02T10:00:00.000Z";
  const deposit = "2026-11-04T09:00:00.000Z";
  const later = "2026-11-06T15:00:00.000Z";

  assert.deepEqual(
    rdvTakenTimestamps({
      statusEvents: [
        { type: "status", to: "Nouveau", at: booked },
        { type: "status", to: "RDV pris", at: booked },
        { type: "status", to: "Acompte reçu", at: deposit },
      ],
      appointments: [
        { status: "confirmed", at: booked, sessionOn: "2026-11-20" },
      ],
    }),
    [booked],
  );

  assert.deepEqual(
    rdvTakenTimestamps({
      statusEvents: [
        { type: "status", to: "Acompte validé", at: deposit },
        { type: "status", to: "RDV confirmé", at: later },
      ],
      appointments: [{ status: "confirmed", at: later, sessionOn: "2026-12-01" }],
    }),
    [deposit],
  );

  assert.deepEqual(
    rdvTakenTimestamps({
      statusEvents: [{ type: "status", to: "Acompte envoyé", at: booked }],
      appointments: [],
    }),
    [],
  );
  assert.deepEqual(
    rdvTakenTimestamps({
      statusEvents: [
        { type: "status", to: "Acompte en attente", at: booked },
        { type: "comment", to: "RDV pris", at: later },
        { type: "status", to: "Appel en absence", at: later },
      ],
      appointments: [
        { status: "to_confirm", at: booked },
        { status: "quote", at: later },
      ],
    }),
    [],
  );

  const second = "2026-11-08T11:00:00.000Z";
  assert.deepEqual(
    rdvTakenTimestamps({
      statusEvents: [],
      appointments: [
        { status: "confirmed", at: booked },
        { status: "confirmed", at: second },
      ],
    }),
    [booked, second],
  );

  const taken = rdvTakenTimestamps({
    statusEvents: [{ type: "status", to: "Acompte reçu", at: hoursAgo(24 * 10) }],
    appointments: [
      { status: "confirmed", at: hoursAgo(24 * 9) },
      { status: "confirmed", at: hoursAgo(24) },
    ],
  });
  assert.deepEqual(taken, [hoursAgo(24 * 10), hoursAgo(24)]);
  assert.deepEqual(countCreatedLeads(taken, NOW), { leads48h: 1, leads7d: 1, leadsPrev7d: 1 });
});

test("le seuil RDV est indépendant du seuil de leads", () => {
  const rows = buildPilotageCenters({
    centers: [
      { id: "p", name: "Pélissanne", city: "Pélissanne" },
      { id: "b", name: "Bruz", city: "Bruz" },
    ],
    counts: [{ centerId: "p", leads48h: 4, leads7d: 4, leadsPrev7d: 1 }],
    rdvCounts: [
      { centerId: "p", rdv48h: 0, rdv7d: 2, rdvPrev7d: 6 },
      { centerId: "b", rdv48h: 3, rdv7d: 9, rdvPrev7d: 4 },
    ],
    thresholds: [
      { centerId: "p", minLeads48h: 1, minRdv48h: 2 },
      { centerId: "b", minLeads48h: 5, minRdv48h: 1 },
    ],
    actions: [],
    campaigns: [],
  });
  const pelissanne = rows.find((row) => row.id === "p");
  const bruz = rows.find((row) => row.id === "b");
  assert.equal(pelissanne.alert, false);
  assert.equal(pelissanne.rdvAlert, true);
  assert.equal(pelissanne.rdvDelta, -4);
  assert.equal(bruz.alert, true);
  assert.equal(bruz.rdvAlert, false);
  assert.deepEqual(
    sortPilotageCenters(rows, "desc", "rdv").map((row) => row.name),
    ["Bruz", "Pélissanne"],
  );
});

test("le mois en cours compare la même longueur de jours", () => {
  const november = monthPeriod("2026-11-11T15:00:00.000Z");
  assert.equal(november.currentLabel, "1–11 novembre");
  assert.equal(november.previousLabel, "1–11 octobre");

  const march = monthPeriod("2026-03-31T12:00:00.000Z");
  assert.equal(march.currentLabel, "1–31 mars");
  assert.equal(march.previousLabel, "1–28 février");

  const leap = monthPeriod("2028-03-31T12:00:00.000Z");
  assert.equal(leap.previousLabel, "1–29 février");

  const january = monthPeriod("2026-01-11T12:00:00.000Z");
  assert.equal(january.currentLabel, "1–11 janvier");
  assert.equal(january.previousLabel, "1–11 décembre");

  const rows = buildPilotageCenters({
    centers: [
      { id: "p", name: "Pélissanne", city: "Pélissanne" },
      { id: "b", name: "Bruz", city: "Bruz" },
    ],
    counts: [
      { centerId: "p", leads48h: 0, leads7d: 40, leadsPrev7d: 9, leadsMonth: 18, leadsPrevMonth: 24 },
      { centerId: "b", leads48h: 6, leads7d: 10, leadsPrev7d: 21, leadsMonth: 30, leadsPrevMonth: 22 },
    ],
    rdvCounts: [{ centerId: "p", rdv48h: 2, rdv7d: 6, rdvPrev7d: 8, rdvMonth: 5, rdvPrevMonth: 9 }],
    thresholds: [],
    actions: [],
    campaigns: [],
  });
  const pelissanne = rows.find((row) => row.id === "p");
  assert.equal(pelissanne.monthDelta, -6);
  assert.equal(pelissanne.rdvMonthDelta, -4);
  assert.equal(pelissanne.alert, true);
  assert.deepEqual(
    sortPilotageCenters(rows, "desc", "leads", "month").map((row) => row.name),
    ["Bruz", "Pélissanne"],
  );
  assert.deepEqual(
    sortPilotageCenters(rows, "desc", "leads", "week").map((row) => row.name),
    ["Pélissanne", "Bruz"],
  );
});
