// Buyer interests picked during onboarding. Kept on this device only, like
// viewHistory.js; the database schema (7 categories) is not changed.
import { categories } from "../data/catalog.js";

export const INTERESTS = [
  {
    id: "cooling",
    label: "Fans & cooling",
    hint: "Desk, standing, clip-on fans",
    category: "Fans",
    keywords: ["fan", "kipas", "cooling", "angin"],
  },
  {
    id: "lighting",
    label: "Lamps & lighting",
    hint: "Study, bedside, reading lamps",
    category: "Lamps",
    keywords: ["lamp", "light", "lampu", "led", "senter"],
  },
  {
    id: "storage",
    label: "Storage & organizers",
    hint: "Boxes, drawers, racks",
    category: "Storage",
    keywords: [
      "storage",
      "box",
      "drawer",
      "organizer",
      "rak",
      "kotak",
      "laci",
      "keranjang",
      "basket",
    ],
  },
  {
    id: "furniture",
    label: "Furniture",
    hint: "Desks, chairs, shelves",
    category: "Furniture",
    keywords: [
      "desk",
      "chair",
      "table",
      "shelf",
      "bed",
      "meja",
      "kursi",
      "lemari",
      "kasur",
    ],
  },
  {
    id: "appliances",
    label: "Kitchen appliances",
    hint: "Rice cookers, kettles",
    category: "Kitchen",
    keywords: [
      "rice cooker",
      "magic com",
      "kettle",
      "blender",
      "toaster",
      "pan",
      "pot",
      "teko",
      "panci",
      "wajan",
    ],
  },
  {
    id: "tableware",
    label: "Silverware & tableware",
    hint: "Plates, cutlery, mugs",
    category: "Kitchen",
    keywords: [
      "spoon",
      "fork",
      "cutlery",
      "plate",
      "bowl",
      "mug",
      "glass",
      "sendok",
      "garpu",
      "piring",
      "mangkok",
      "gelas",
    ],
  },
  {
    id: "gadgets",
    label: "Electronics & gadgets",
    hint: "Keyboards, speakers, webcams",
    category: "Electronics",
    keywords: [
      "keyboard",
      "mouse",
      "speaker",
      "webcam",
      "laptop",
      "usb",
      "monitor",
      "headphone",
      "clock",
    ],
  },
  {
    id: "cables",
    label: "Cables & power strips",
    hint: "Chargers, extensions, hubs",
    category: "Electronics",
    keywords: [
      "cable",
      "extension",
      "power strip",
      "socket",
      "charger",
      "hub",
      "hdmi",
      "colokan",
      "kabel",
      "stopkontak",
    ],
  },
  {
    id: "study",
    label: "Study essentials",
    hint: "Calculators, binders, boards",
    category: "Other Essentials",
    keywords: [
      "calculator",
      "binder",
      "notebook",
      "ruler",
      "whiteboard",
      "book",
      "kalkulator",
      "buku",
      "penggaris",
    ],
  },
  {
    id: "decor",
    label: "Room decor & bedding",
    hint: "Pillows, curtains, rugs",
    category: "Other Essentials",
    keywords: [
      "pillow",
      "curtain",
      "rug",
      "mat",
      "hanger",
      "bantal",
      "gorden",
      "karpet",
      "sprei",
      "selimut",
    ],
  },
  {
    id: "browsing",
    label: "Just browsing",
    hint: "Show me a bit of everything",
    category: null,
    keywords: [],
  },
];

export const BUDGETS = [
  { id: "free", label: "Free only", max: 0 },
  { id: "under50", label: "Under Rp50.000", max: 49999 },
  { id: "50to100", label: "Rp50.000 – Rp100.000", min: 50000, max: 100000 },
  { id: "any", label: "Any price" },
];

export const SPECIFIC_SUGGESTIONS = [
  "desk lamp",
  "rice cooker",
  "standing fan",
  "storage box",
  "cutlery set",
  "power strip",
];

export const SPECIFIC_MAX = 80;
const key = (id) => `kostcycle-interests-v1:${id || "guest"}`;
const byId = new Map(INTERESTS.map((interest) => [interest.id, interest]));

/** Returns a clean preferences object, or null when the input is not usable. */
export function normaliseInterests(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ids = Array.isArray(raw.interests)
    ? [...new Set(raw.interests.filter((id) => byId.has(id)))]
    : [];
  const specific =
    typeof raw.specific === "string"
      ? raw.specific.trim().replace(/\s+/g, " ").slice(0, SPECIFIC_MAX)
      : "";
  const budget = BUDGETS.some((b) => b.id === raw.budget) ? raw.budget : "any";
  const skipped = raw.skipped === true;
  if (!skipped && !ids.length && !specific) return null;
  return { interests: ids, specific, budget, skipped };
}

export function readInterests(id, storage) {
  try {
    const store = storage ?? window.localStorage;
    return normaliseInterests(JSON.parse(store.getItem(key(id)) || "null"));
  } catch {
    return null;
  }
}

export function saveInterests(id, prefs, storage) {
  const clean = normaliseInterests(prefs);
  try {
    const store = storage ?? window.localStorage;
    if (clean) store.setItem(key(id), JSON.stringify(clean));
    else store.removeItem(key(id));
  } catch {
    /* Private mode may disallow preference storage. */
  }
  return clean;
}

/** Database categories the buyer cares about, e.g. ["Kitchen", "Fans"]. */
export function interestCategories(prefs) {
  const out = (prefs?.interests || [])
    .map((id) => byId.get(id)?.category)
    .filter((category) => category && categories.includes(category));
  return [...new Set(out)];
}

/** Lowercase search terms: the typed request plus every chosen interest's keywords. */
export function interestKeywords(prefs) {
  const words = (prefs?.interests || []).flatMap(
    (id) => byId.get(id)?.keywords || [],
  );
  const specific = prefs?.specific?.toLowerCase().trim();
  return [...new Set([...(specific ? [specific] : []), ...words])];
}

export function withinBudget(price, budgetId) {
  const budget = BUDGETS.find((b) => b.id === budgetId);
  if (!budget || budget.id === "any") return true;
  return price >= (budget.min ?? 0) && price <= budget.max;
}

const escape = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const textMatches = (text, word) =>
  new RegExp(`(^|[^a-z])${escape(word)}`, "i").test(text);

/**
 * Deterministic interest score for one listing.
 * +3 category match, +4 keyword/specific match, +1 within a set budget.
 */
export function interestScore(item, prefs) {
  if (!prefs || prefs.skipped) return { score: 0, reasons: [] };
  let score = 0;
  const reasons = [];
  if (interestCategories(prefs).includes(item.category)) {
    score += 3;
    reasons.push("Matches your interests");
  }
  const text = `${item.name || ""} ${item.description || ""}`;
  if (interestKeywords(prefs).some((word) => textMatches(text, word))) {
    score += 4;
    reasons.push("What you're looking for");
  }
  if (prefs.budget !== "any" && withinBudget(item.price, prefs.budget)) {
    score += 1;
    reasons.push("In your budget");
  }
  return { score, reasons };
}

/**
 * Where to send a buyer after finishing onboarding. Only the search text or a
 * single category becomes a hard Browse filter; the budget stays a soft boost
 * in recommendations so a narrow combination never lands on an empty page.
 */
export function feedLink(prefs) {
  const params = new URLSearchParams();
  if (prefs?.specific) params.set("q", prefs.specific);
  else {
    const cats = interestCategories(prefs);
    if (cats.length === 1) params.set("category", cats[0]);
  }
  params.set("available", "1");
  return `/browse?${params}`;
}
