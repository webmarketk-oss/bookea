const test = require("node:test");
const assert = require("node:assert/strict");
const {
  favoriteId,
  parseFavorites,
  toggleFavorite,
  unreadOfferNotices,
} = require("./favorites-lib");

test("un favori se ajoute puis se retire, et une offre non vue devient une notification", () => {
  const id = favoriteId({ centerId: "11111111-1111-1111-1111-111111111111", name: "JFG" });
  assert.equal(id, "11111111-1111-1111-1111-111111111111");
  assert.equal(favoriteId({ name: "Studio Belle Peau" }), "name:studio belle peau");

  const added = toggleFavorite([], {
    id,
    name: "JFG Clinique",
    city: "Clermont-Ferrand",
  });
  assert.equal(added.length, 1);
  const removed = toggleFavorite(added, { id, name: "JFG Clinique" });
  assert.deepEqual(removed, []);

  const notices = unreadOfferNotices(
    added,
    [
      {
        id,
        name: "JFG Clinique",
        settings: {
          public: {
            offers: [
              { id: 4, title: "Hydrafacial découverte", price: 49, visible: true },
              { id: 5, title: "Offre finie", price: 10, visible: true, timerEnabled: true, endsAt: "2020-01-01" },
            ],
          },
        },
      },
    ],
    [],
    Date.parse("2026-11-27T10:00:00Z"),
  );
  assert.equal(notices.length, 1);
  assert.equal(notices[0].title, "Hydrafacial découverte");
  assert.equal(
    unreadOfferNotices(added, [{ id, name: "JFG", settings: { public: { offers: [{ id: 4, title: "Hydrafacial découverte", price: 49 }] } } }], [notices[0].id]).length,
    0,
  );
  assert.deepEqual(parseFavorites([{ id: "", name: "X" }, { name: "Sans id" }]), []);
});
