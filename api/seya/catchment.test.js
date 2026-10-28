const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CATCHMENT_RADIUS_KM,
  asksNearbyCatchment,
  asksOtherSite,
  distanceBetweenPlacesKm,
  extractAreaMention,
  resolveCatchment,
} = require("./catchment");

test("rayon : Cournon ≈ 12 km de Clermont, dans les 35 km", () => {
  const km = distanceBetweenPlacesKm("Clermont-Ferrand", "Cournon");
  assert.ok(km != null && km < CATCHMENT_RADIUS_KM);
  const resolved = resolveCatchment(
    "Clermont-Ferrand",
    "2 rue Eugène Gilbert, 63000 Clermont-Ferrand",
    "Cournon",
  );
  assert.equal(resolved.within, true);
});

test("rayon : Annemasse proche de Gaillard", () => {
  const near = asksNearbyCatchment(
    "dispo demain sur secteur Annemasse",
    "Gaillard",
    "12 rue de Genève, 74240 Gaillard",
  );
  assert.ok(near);
  assert.match(near.label, /Annemasse/i);
});

test("secteur ≠ autre clinique ; centre sur X = autre clinique", () => {
  assert.equal(asksOtherSite("secteur cournon", "Clermont-Ferrand"), false);
  assert.equal(
    asksOtherSite(
      "vous avez un centre sur Cournon, possible de faire le bilan là-bas ?",
      "Clermont-Ferrand",
    ),
    true,
  );
  assert.ok(extractAreaMention("secteur Vichy", "Clermont-Ferrand"));
});

test("trop loin : Lyon hors rayon de Clermont", () => {
  const resolved = resolveCatchment(
    "Clermont-Ferrand",
    "2 rue Eugène Gilbert, 63000 Clermont-Ferrand",
    "Lyon",
  );
  assert.equal(resolved.within, false);
  assert.ok(resolved.km > CATCHMENT_RADIUS_KM);
});
