import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTERESTS,
  BUDGETS,
  normaliseInterests,
  readInterests,
  saveInterests,
  interestCategories,
  interestKeywords,
  interestScore,
  withinBudget,
  feedLink,
} from "../src/utils/interests.js";
import { recommendItems } from "../src/utils/recommendations.js";
import { categories } from "../src/data/catalog.js";

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}
const item = (over) => ({
  id: "x",
  name: "Thing",
  description: "",
  category: "Other Essentials",
  price: 75000,
  condition: "Good",
  residence: "Other",
  distance: 500,
  status: "AVAILABLE",
  sellerId: "seller",
  createdAt: "2026-10-01",
  ...over,
});

test("every interest maps to an existing database category (or none for browsing)", () => {
  for (const interest of INTERESTS) {
    if (interest.id === "browsing") assert.equal(interest.category, null);
    else assert.ok(categories.includes(interest.category), interest.id);
  }
  assert.equal(new Set(INTERESTS.map((i) => i.id)).size, INTERESTS.length);
  const silver = INTERESTS.find((i) => i.id === "tableware");
  assert.equal(silver.category, "Kitchen");
  assert.ok(
    silver.keywords.includes("sendok") && silver.keywords.includes("fork"),
  );
});

test("interestCategories de-duplicates and ignores just-browsing", () => {
  assert.deepEqual(
    interestCategories({ interests: ["appliances", "tableware", "browsing"] }),
    ["Kitchen"],
  );
  assert.deepEqual(interestCategories(null), []);
});

test("save and read round-trip per user, with guest fallback", () => {
  const storage = fakeStorage();
  saveInterests(
    "u1",
    {
      interests: ["cooling", "cooling", "nope"],
      specific: "  desk   fan ",
      budget: "under50",
    },
    storage,
  );
  assert.deepEqual(readInterests("u1", storage), {
    interests: ["cooling"],
    specific: "desk fan",
    budget: "under50",
    skipped: false,
  });
  assert.equal(readInterests("u2", storage), null);
  saveInterests(null, { skipped: true }, storage);
  assert.equal(readInterests(undefined, storage).skipped, true);
  assert.ok("kostcycle-interests-v1:guest" in storage.data);
});

test("invalid stored data reads as null and never throws", () => {
  const key = "kostcycle-interests-v1:u1";
  for (const bad of ["{oops", "42", '"text"', "[]", '{"interests":["zzz"]}']) {
    assert.equal(readInterests("u1", fakeStorage({ [key]: bad })), null, bad);
  }
  const throwing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readInterests("u1", throwing), null);
  assert.doesNotThrow(() =>
    saveInterests("u1", { interests: ["study"] }, throwing),
  );
});

test("normalise clamps specific text and falls back to any budget", () => {
  const out = normaliseInterests({ specific: "a".repeat(200), budget: "rich" });
  assert.equal(out.specific.length, 80);
  assert.equal(out.budget, "any");
  assert.equal(normaliseInterests({ interests: [] }), null);
});

test("keywords include the typed request first, then interest keywords", () => {
  const words = interestKeywords({
    interests: ["cables"],
    specific: "Mini Fridge",
  });
  assert.equal(words[0], "mini fridge");
  assert.ok(words.includes("colokan"));
});

test("budget ranges match the Browse price filters", () => {
  assert.deepEqual(
    BUDGETS.map((b) => b.id),
    ["free", "under50", "50to100", "any"],
  );
  assert.ok(withinBudget(0, "free") && !withinBudget(1, "free"));
  assert.ok(withinBudget(49999, "under50") && !withinBudget(50000, "under50"));
  assert.ok(
    withinBudget(100000, "50to100") && !withinBudget(100001, "50to100"),
  );
  assert.ok(withinBudget(999999, "any"));
});

test("interestScore adds +3 category, +4 keyword, +1 budget", () => {
  const prefs = {
    interests: ["tableware"],
    specific: "",
    budget: "50to100",
    skipped: false,
  };
  const cutlery = item({ name: "Cutlery starter set", category: "Kitchen" });
  assert.deepEqual(interestScore(cutlery, prefs), {
    score: 8,
    reasons: [
      "Matches your interests",
      "What you're looking for",
      "In your budget",
    ],
  });
  assert.equal(
    interestScore(
      item({ name: "Rice cooker", category: "Kitchen", price: 500000 }),
      prefs,
    ).score,
    3,
  );
  assert.equal(interestScore(cutlery, { ...prefs, skipped: true }).score, 0);
  assert.equal(interestScore(cutlery, null).score, 0);
  // Word-start matching: "pan" must not match "Japan".
  const pan = {
    interests: ["appliances"],
    specific: "",
    budget: "any",
    skipped: false,
  };
  assert.equal(
    interestScore(item({ name: "Japan travel guide" }), pan).score,
    0,
  );
});

test("recommendItems ranks picked interests first and stays deterministic", () => {
  const rows = [
    item({ id: "lamp", name: "Desk lamp", category: "Lamps", distance: 100 }),
    item({
      id: "fork",
      name: "Fork and spoon set",
      category: "Kitchen",
      distance: 900,
    }),
    item({ id: "pot", name: "Small pot", category: "Kitchen", distance: 800 }),
  ];
  const interests = {
    interests: ["tableware"],
    specific: "",
    budget: "any",
    skipped: false,
  };
  const out = recommendItems(rows, { interests });
  assert.deepEqual(
    out.map((i) => i.id),
    ["fork", "pot", "lamp"],
  );
  assert.match(out[0].recommendationReason, /Matches your interests/);
  assert.deepEqual(out, recommendItems([...rows].reverse(), { interests }));
  // Without interests, ordering falls back to distance as before.
  assert.equal(recommendItems(rows)[0].id, "lamp");
});

test("feedLink pre-fills Browse sensibly", () => {
  assert.equal(
    feedLink({ interests: ["cooling"], specific: "", budget: "free" }),
    "/browse?category=Fans&available=1",
  );
  assert.equal(
    feedLink({
      interests: ["cooling", "study"],
      specific: "rice cooker",
      budget: "any",
    }),
    "/browse?q=rice+cooker&available=1",
  );
});
