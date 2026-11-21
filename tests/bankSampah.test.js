import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CENTRE,
  boundingBox,
  buildOverpassQuery,
  findBankSampah,
  fromCache,
  pickRadius,
  readCache,
  writeCache,
  formatDistance,
  haversine,
  normaliseElements,
  sortByDistance,
  withinRadius,
} from "../src/utils/bankSampah.js";

test("haversine returns zero for the same point and known distances otherwise", () => {
  assert.equal(haversine(DEFAULT_CENTRE, DEFAULT_CENTRE), 0);
  // One degree of latitude is ~111.2 km.
  const d = haversine({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(Math.abs(d - 111195) < 50, `got ${d}`);
  // Symmetric.
  const a = { lat: -6.223, lng: 106.649 };
  const b = { lat: -6.2, lng: 106.68 };
  assert.equal(haversine(a, b), haversine(b, a));
  assert.ok(haversine(a, b) > 4000 && haversine(a, b) < 4300);
});

test("sortByDistance orders nearest first without mutating the input", () => {
  const input = [
    { id: "far", distance: 5000 },
    { id: "near", distance: 120 },
    { id: "mid", distance: 900 },
  ];
  assert.deepEqual(
    sortByDistance(input).map((p) => p.id),
    ["near", "mid", "far"],
  );
  assert.equal(input[0].id, "far");
});

test("normaliseElements handles nodes and way centres, dedupes and sorts", () => {
  const origin = { lat: -6.223, lng: 106.649 };
  const places = normaliseElements(
    [
      {
        type: "way",
        id: 2,
        center: { lat: -6.25, lon: 106.649 },
        tags: { name: "Bank Sampah Far", opening_hours: "Mo-Fr 08:00-12:00" },
      },
      {
        type: "node",
        id: 1,
        lat: -6.224,
        lon: 106.649,
        tags: {
          amenity: "recycling",
          recycling_type: "centre",
          "addr:street": "Jalan Contoh",
          "addr:city": "Tangerang",
        },
      },
      { type: "node", id: 1, lat: -6.224, lon: 106.649, tags: {} },
      { type: "relation", id: 3, tags: { name: "No coordinates" } },
    ],
    origin,
  );
  assert.equal(places.length, 2);
  assert.equal(places[0].id, "node/1");
  assert.equal(places[0].kind, "Recycling centre");
  assert.equal(places[0].address, "Jalan Contoh, Tangerang");
  assert.equal(places[1].kind, "Bank Sampah");
  assert.equal(places[1].openingHours, "Mo-Fr 08:00-12:00");
  assert.ok(places[0].distance < places[1].distance);
});

test("formatDistance uses metres below 1 km and kilometres above", () => {
  assert.equal(formatDistance(234), "230 m");
  assert.equal(formatDistance(1530), "1.5 km");
  assert.equal(formatDistance(12400), "12 km");
});

test("Overpass query searches by name and recycling centres with centres", () => {
  const q = buildOverpassQuery({ lat: -6.2, lng: 106.6 }, 10000);
  assert.ok(q.includes('["name"~"bank ?sampah",i]'));
  assert.match(q, /\["recycling_type"="centre"\]/);
  const [south, west, north, east] = boundingBox(
    { lat: -6.2, lng: 106.6 },
    10000,
  );
  assert.ok(q.includes(`(${south},${west},${north},${east})`));
  // The box half-width matches the radius on both axes.
  assert.ok(
    Math.abs(
      haversine({ lat: south, lng: 106.6 }, { lat: -6.2, lng: 106.6 }) - 10000,
    ) < 20,
  );
  assert.ok(
    Math.abs(
      haversine({ lat: -6.2, lng: east }, { lat: -6.2, lng: 106.6 }) - 10000,
    ) < 20,
  );
  assert.match(q, /out center tags;/);
});

test("findBankSampah makes one 25 km request and falls back to the next mirror", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("overpass-api.de")) return { ok: false, status: 504 };
    return {
      ok: true,
      json: async () => ({
        elements: [
          {
            type: "node",
            id: 1,
            lat: -6.233,
            lon: 106.649,
            tags: { name: "Bank Sampah 1" },
          },
          {
            type: "node",
            id: 2,
            lat: -6.243,
            lon: 106.649,
            tags: { name: "Bank Sampah 2" },
          },
          {
            type: "node",
            id: 3,
            lat: -6.253,
            lon: 106.649,
            tags: { name: "Bank Sampah 3" },
          },
          {
            type: "node",
            id: 4,
            lat: -6.4,
            lon: 106.649,
            tags: { name: "Bank Sampah 4" },
          },
        ],
      }),
    };
  };
  const { places, radius } = await findBankSampah(DEFAULT_CENTRE, {
    fetchImpl,
  });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes("kumi.systems"));
  // Three places within 10 km, so the far one (~20 km) is left out.
  assert.equal(radius, 10000);
  assert.deepEqual(
    places.map((p) => p.name),
    ["Bank Sampah 1", "Bank Sampah 2", "Bank Sampah 3"],
  );
});

test("pickRadius widens to 25 km when fewer than three places are within 10 km", () => {
  const rows = [{ distance: 900 }, { distance: 15000 }, { distance: 24000 }];
  assert.deepEqual(pickRadius(rows), { places: rows, radius: 25000 });
  assert.deepEqual(pickRadius([]), { places: [], radius: 25000 });
});

test("withinRadius drops bbox corners outside the circle", () => {
  const rows = [{ distance: 9000 }, { distance: 12000 }];
  assert.deepEqual(withinRadius(rows, 10000), [{ distance: 9000 }]);
});

test("cache round-trips places and recomputes distance from the exact origin", () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  const place = {
    id: "node/1",
    name: "Bank Sampah 1",
    lat: -6.233,
    lng: 106.649,
    distance: 1,
  };
  writeCache(DEFAULT_CENTRE, [place], storage, 1000);
  const nearby = { lat: -6.2231, lng: 106.6491 };
  const row = readCache(nearby, storage);
  assert.equal(row.savedAt, 1000);
  const { places } = fromCache(row, nearby);
  assert.equal(places[0].name, "Bank Sampah 1");
  assert.ok(Math.abs(places[0].distance - haversine(nearby, place)) < 1e-6);
  assert.equal(readCache({ lat: 0, lng: 0 }, storage), null);
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readCache(DEFAULT_CENTRE, broken), null);
});

test("findBankSampah stops when the caller aborts", async () => {
  const controller = new AbortController();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    controller.abort();
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  };
  await assert.rejects(
    findBankSampah(DEFAULT_CENTRE, { fetchImpl, signal: controller.signal }),
  );
  assert.equal(calls, 1);
});
