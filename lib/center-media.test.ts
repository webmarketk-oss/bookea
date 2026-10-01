import assert from "node:assert/strict";
import test from "node:test";
import {
  coverPositionCss,
  mergePublicMedia,
  normalizeCoverPosition,
  parseExternalReviewsCsv,
  persistableMediaUrl,
} from "./center-media.ts";

test("CSV avis ignore l'en-tête et lit Nom;note;commentaire", () => {
  const reviews = parseExternalReviewsCsv(
    "Nom;5;Commentaire\nLéa;5;Super soin\nMarie;4;Accueil nickel",
    "Google",
  );

  assert.equal(reviews.length, 2);
  assert.equal(reviews[0].author, "Léa");
  assert.equal(reviews[0].rating, 5);
  assert.equal(reviews[0].comment, "Super soin");
  assert.equal(reviews[0].source, "Google");
  assert.equal(reviews[1].author, "Marie");
  assert.equal(reviews[1].rating, 4);
});

test("CSV avis accepte aussi les virgules", () => {
  const reviews = parseExternalReviewsCsv(
    "Camille,5,Très pro",
    "Facebook",
  );
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].author, "Camille");
  assert.equal(reviews[0].source, "Facebook");
});

test("une URL http est conservée, une data URL trop lourde est retirée", () => {
  assert.equal(
    persistableMediaUrl("https://cdn.example/cover.jpg"),
    "https://cdn.example/cover.jpg",
  );
  assert.equal(persistableMediaUrl(""), "");
  assert.equal(persistableMediaUrl(`data:image/jpeg;base64,${"a".repeat(80)}`), `data:image/jpeg;base64,${"a".repeat(80)}`);
  assert.equal(persistableMediaUrl(`data:image/jpeg;base64,${"a".repeat(300000)}`), "");
});

test("supprimer une photo locale vide bien le champ si le remote est vide aussi", () => {
  const kept = mergePublicMedia(
    { coverPreview: "data:image/jpeg;base64,abc", logoPreview: "", photoPreviews: ["p1"] },
    { coverPreview: "", logoPreview: "", photoPreviews: [] },
  );
  assert.equal(kept.coverPreview, "data:image/jpeg;base64,abc");
  assert.deepEqual(kept.photoPreviews, ["p1"]);

  const cleared = mergePublicMedia(
    { coverPreview: "", logoPreview: "", photoPreviews: [] },
    { coverPreview: "", logoPreview: "", photoPreviews: [] },
  );
  assert.equal(cleared.coverPreview, "");
  assert.deepEqual(cleared.photoPreviews, []);
});

test("le cadrage de couverture reste entre 0 et 100", () => {
  assert.deepEqual(normalizeCoverPosition({ x: -20, y: 140 }), { x: 0, y: 100 });
  assert.equal(coverPositionCss({ x: 20, y: 80 }), "20% 80%");
  assert.equal(coverPositionCss(undefined), "50% 50%");
});
