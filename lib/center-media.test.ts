import assert from "node:assert/strict";
import test from "node:test";
import {
  coverPositionCss,
  mergePublicMedia,
  normalizeCoverPosition,
  parseExternalReviewsCsv,
  persistableMediaUrl,
  retainPublicMedia,
  servicePhotoByName,
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

test("un enregistrement sans URL persistable ne gomme pas les photos déjà en ligne", () => {
  const kept = retainPublicMedia(
    {
      coverPreview: "",
      logoPreview: "",
      photoPreviews: [],
      services: [{ name: "Hydrafacial", photo: "" }],
    },
    {
      coverPreview: `data:image/jpeg;base64,${"a".repeat(300000)}`,
      logoPreview: `data:image/png;base64,${"b".repeat(300000)}`,
      photoPreviews: [`data:image/jpeg;base64,${"c".repeat(300000)}`],
      services: [
        {
          name: "Hydrafacial",
          photo: `data:image/jpeg;base64,${"d".repeat(300000)}`,
        },
      ],
    },
    {
      coverPreview: "https://cdn.example/cover.jpg",
      logoPreview: "https://cdn.example/logo.png",
      photoPreviews: ["https://cdn.example/p1.jpg"],
      services: [{ name: "Hydrafacial", photo: "https://cdn.example/hydra.jpg" }],
    },
  );

  assert.equal(kept.coverPreview, "https://cdn.example/cover.jpg");
  assert.equal(kept.logoPreview, "https://cdn.example/logo.png");
  assert.deepEqual(kept.photoPreviews, ["https://cdn.example/p1.jpg"]);
  assert.equal(kept.services?.[0]?.photo, "https://cdn.example/hydra.jpg");
});

test("une suppression volontaire de photo reste vide", () => {
  const cleared = retainPublicMedia(
    { coverPreview: "", logoPreview: "", photoPreviews: [] },
    { coverPreview: "", logoPreview: "", photoPreviews: [] },
    {
      coverPreview: "https://cdn.example/cover.jpg",
      logoPreview: "https://cdn.example/logo.png",
      photoPreviews: ["https://cdn.example/p1.jpg"],
    },
  );

  assert.equal(cleared.coverPreview, "");
  assert.equal(cleared.logoPreview, "");
  assert.deepEqual(cleared.photoPreviews, []);
});

test("la photo d'une prestation se retrouve par son nom", () => {
  assert.equal(
    servicePhotoByName(
      [
        { name: "Hydrafacial", photo: "https://cdn.example/hydra.jpg" },
        { name: "Laser", photo: "https://cdn.example/laser.jpg" },
      ],
      "hydrafacial",
    ),
    "https://cdn.example/hydra.jpg",
  );
  assert.equal(servicePhotoByName([{ name: "Laser" }], "Hydrafacial"), "");
});
