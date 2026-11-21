import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recommendItems,
  categoryAffinity,
} from "../src/utils/recommendations.js";
import { readViews, saveViews, addView } from "../src/utils/viewHistory.js";
import { demoListings, demoSellers } from "../scripts/demo-data.mjs";
import {
  productPhotos,
  productPhoto,
  illustrativePhoto,
} from "../src/data/productPhotos.js";
import { readFile } from "node:fs/promises";
const base = {
  id: "x",
  category: "Lamps",
  price: 50000,
  condition: "Good",
  residence: "Newton Kost",
  distance: 150,
  status: "AVAILABLE",
  sellerId: "seller",
  createdAt: "2026-10-01",
};
test("recommendations score category, affinity, residence, condition and price deterministically", () => {
  const rows = [
    { ...base, id: "match" },
    {
      ...base,
      id: "other",
      category: "Fans",
      price: 150000,
      residence: "Other",
      condition: "Fair",
    },
  ];
  const out = recommendItems(rows, { current: base, affinity: ["Lamps"] });
  assert.equal(out[0].id, "match");
  assert.equal(out[0].recommendationScore, 12);
  assert.match(out[0].recommendationReason, /Same category/);
  assert.deepEqual(
    out,
    recommendItems([...rows].reverse(), { current: base, affinity: ["Lamps"] }),
  );
});
test("recommendations exclude current, own, reserved, completed and archived items", () => {
  const rows = [
    base,
    { ...base, id: "own", sellerId: "me" },
    { ...base, id: "reserved", status: "RESERVED" },
    { ...base, id: "done", status: "COMPLETED" },
    { ...base, id: "hidden", archived_at: "2026-10-01" },
    { ...base, id: "keep" },
  ];
  assert.deepEqual(
    recommendItems(rows, { current: base, user: { id: "me" } }).map(
      (i) => i.id,
    ),
    ["keep"],
  );
});
test("cold start uses distance then recency then ID, and gracefully handles empty catalog", () => {
  const rows = [
    { ...base, id: "far", distance: 900 },
    { ...base, id: "old" },
    { ...base, id: "new", createdAt: "2026-10-05" },
  ];
  assert.deepEqual(
    recommendItems(rows).map((i) => i.id),
    ["new", "old", "far"],
  );
  assert.deepEqual(recommendItems([]), []);
  assert.equal(
    recommendItems([{ ...base, id: "free", price: 0 }], { current: base })[0]
      .recommendationScore,
    8,
  );
});
test("affinity uses recent views and real reservation categories", () => {
  assert.deepEqual(
    categoryAffinity(
      [{ id: "a", category: "Fans" }],
      [{ listingId: "x", createdAt: "2026-10-12" }],
      [base],
    ),
    ["Fans", "Lamps"],
  );
});
test("preference history is bounded, per-account, deduplicated and safe when storage fails", () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k),
    setItem: (k, v) => store.set(k, v),
  };
  let history = [];
  for (let i = 0; i < 30; i++)
    history = addView(history, { id: String(i), category: "Lamps" });
  history = addView(history, { id: "29", category: "Lamps" });
  assert.equal(history.length, 20);
  saveViews("a", history, storage);
  assert.equal(readViews("a", storage).length, 20);
  assert.deepEqual(readViews("b", storage), []);
  assert.deepEqual(
    readViews("a", {
      getItem() {
        throw Error("blocked");
      },
    }),
    [],
  );
  saveViews("a", [], {
    setItem() {
      throw Error("blocked");
    },
  });
});
test("demo catalog has 100 unique listings, 16 sellers, all categories and safe stable identities", () => {
  assert.equal(demoListings.length, 100);
  assert.equal(demoSellers.length, 16);
  assert.equal(new Set(demoListings.map((i) => i.seed_key)).size, 100);
  assert.equal(new Set(demoListings.map((i) => i.name)).size, 100);
  assert.equal(new Set(demoListings.map((i) => i.category)).size, 7);
  assert.equal(new Set(demoListings.map((i) => i.residence)).size, 4);
  assert.ok(demoListings.filter((i) => i.price === 0).length >= 8);
  assert.ok(
    demoListings.every(
      (i) => i.is_demo && i.description.length < 200 && i.pickup.length > 0,
    ),
  );
  assert.ok(demoSellers.every((s) => s.email.endsWith("@example.invalid")));
});

test("all curated photos exist locally as optimized JPEGs, with source and license records", async () => {
  assert.ok(productPhotos.length >= 20 && productPhotos.length <= 40);
  for (const photo of productPhotos) {
    const bytes = await readFile(
      new URL(`../public${photo.src}`, import.meta.url),
    );
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
    assert.ok(
      bytes.length < 300000,
      `${photo.key} should be compressed for web`,
    );
    assert.match(photo.source, /^https:\/\/www\.pexels\.com\/photo\//);
    assert.equal(photo.license, "https://www.pexels.com/license/");
    assert.ok(photo.photographer);
  }
});

test("photo selection preserves uploads and recommendation imagery, with deterministic type-matched demo fallbacks", () => {
  const upload = "data:image/webp;base64,KEEP_EXISTING_UPLOAD";
  assert.deepEqual(productPhoto({ ...base, image: upload }), {
    src: upload,
    illustrative: false,
    label: "Seller photo",
  });
  assert.equal(productPhoto({ ...base, image_data: upload }).src, upload);
  for (const [name, category, photo] of [
    ["Adjustable desk chair", "Furniture", "chair"],
    ["Dinner plates set", "Kitchen", "tableware"],
    ["Cable organizer box", "Storage", "storage"],
    ["USB-C laptop stand", "Electronics", "laptop-stand"],
    ["Cotton curtains pair", "Other Essentials", "curtains"],
  ])
    assert.ok(illustrativePhoto({ name, category }).key.includes(photo), name);
  for (const category of ["Lamps", "Fans"]) {
    assert.ok(
      demoListings
        .filter((i) => i.category === category)
        .every((i) =>
          illustrativePhoto(i).key.includes(
            category === "Lamps" ? "lamp" : "fan",
          ),
        ),
    );
  }
  const images = demoListings.map((i) => productPhoto(i));
  assert.ok(
    images.every(
      (photo) => photo.illustrative && photo.src.startsWith("/products/"),
    ),
  );
  assert.ok(new Set(images.map((p) => p.src)).size >= 20);
  const item = { ...base, id: "keep-upload", image: upload };
  assert.equal(productPhoto(recommendItems([item])[0]).src, upload);
  assert.equal(illustrativePhoto(base).src, illustrativePhoto({ ...base }).src);
});
