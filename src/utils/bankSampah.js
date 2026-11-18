// Pure helpers for finding real Bank Sampah / recycling centres via OpenStreetMap.
// No locations are hardcoded: everything shown comes from the Overpass API.
export const DEFAULT_CENTRE = {
  lat: -6.223,
  lng: 106.649,
  label: "BINUS Alam Sutera",
};
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
// Public Overpass servers can take 30-40 s under load.
export const REQUEST_TIMEOUT_MS = 45000;
export const SEARCH_RADII = [10000, 25000];
export const MIN_RESULTS = 3;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const EARTH_RADIUS_M = 6371000;
const rad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in metres.
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(metres) {
  if (!Number.isFinite(metres)) return "";
  return metres < 1000
    ? `${Math.round(metres / 10) * 10} m`
    : `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

// A bounding box is much faster for Overpass than around:, results are
// trimmed to the true radius afterwards.
export function boundingBox({ lat, lng }, radius) {
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos(rad(lat)));
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map((n) =>
    Number(n.toFixed(5)),
  );
}

export function buildOverpassQuery(origin, radius) {
  const bbox = `(${boundingBox(origin, radius).join(",")})`;
  return `[out:json][timeout:40];
(
  nwr${bbox}["name"~"bank ?sampah",i];
  nwr${bbox}["amenity"="recycling"]["recycling_type"="centre"];
);
out center tags;`;
}

function addressFrom(tags) {
  if (tags["addr:full"]) return tags["addr:full"];
  const street = [tags["addr:street"], tags["addr:housenumber"]]
    .filter(Boolean)
    .join(" ");
  const parts = [
    street,
    tags["addr:suburb"] || tags["addr:village"],
    tags["addr:city"] || tags["addr:district"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

// Turns raw Overpass elements into sorted, de-duplicated places.
export function normaliseElements(elements, origin) {
  const seen = new Set();
  const places = [];
  for (const el of elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = el.tags || {};
    const isBankSampah = /bank\s*sampah/i.test(tags.name || "");
    places.push({
      id,
      name:
        tags.name ||
        (tags.amenity === "recycling"
          ? "Recycling centre (unnamed)"
          : "Unnamed"),
      kind: isBankSampah ? "Bank Sampah" : "Recycling centre",
      lat,
      lng,
      address: addressFrom(tags),
      openingHours: tags.opening_hours || "",
      phone: tags.phone || tags["contact:phone"] || "",
      distance: haversine(origin, { lat, lng }),
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    });
  }
  return sortByDistance(places);
}

export function withinRadius(places, radius) {
  return places.filter((place) => place.distance <= radius);
}

export function sortByDistance(places) {
  return [...places].sort((a, b) => a.distance - b.distance);
}

export function directionsUrl({ lat, lng }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
export function mapsSearchUrl({ lat, lng }) {
  return `https://www.google.com/maps/search/bank+sampah/@${lat},${lng},14z`;
}

async function queryOverpass(query, fetchImpl, signal) {
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
      const json = await response.json();
      return json.elements || [];
    } catch (e) {
      // A user abort stops everything; a timeout or HTTP error tries the next mirror.
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError || new Error("Overpass request failed");
}

// Pick the smallest radius with enough places, falling back to the widest.
export function pickRadius(places, radii = SEARCH_RADII, min = MIN_RESULTS) {
  for (const radius of radii) {
    const nearby = withinRadius(places, radius);
    if (nearby.length >= min || radius === radii.at(-1))
      return { places: nearby, radius };
  }
}

// One request for the widest radius (25 km); every place found, nearest first.
export async function fetchPlaces(origin, { fetchImpl = fetch, signal } = {}) {
  const elements = await queryOverpass(
    buildOverpassQuery(origin, SEARCH_RADII.at(-1)),
    fetchImpl,
    signal,
  );
  return withinRadius(normaliseElements(elements, origin), SEARCH_RADII.at(-1));
}

// Shows 10 km when it has enough places, otherwise widens to 25 km.
// Same result as two requests, half the waiting.
export async function findBankSampah(origin, options) {
  return pickRadius(await fetchPlaces(origin, options));
}

// Results are cached per ~1 km cell so repeat searches are instant and a
// slow or offline Overpass can still show the last real results.
export const cacheKey = ({ lat, lng }) =>
  `kostcycle-bank-sampah-v1:${lat.toFixed(2)},${lng.toFixed(2)}`;

export function readCache(origin, storage) {
  try {
    const row = JSON.parse(
      (storage ?? window.localStorage).getItem(cacheKey(origin)) || "null",
    );
    return Array.isArray(row?.places) && Number.isFinite(row.savedAt)
      ? row
      : null;
  } catch {
    return null;
  }
}

export function writeCache(origin, places, storage, now = Date.now()) {
  try {
    (storage ?? window.localStorage).setItem(
      cacheKey(origin),
      JSON.stringify({ places, savedAt: now }),
    );
  } catch {
    // Storage may be unavailable (private mode); caching is optional.
  }
}

// Distances are recomputed so a cached cell still sorts from the exact origin.
export function fromCache(row, origin) {
  return pickRadius(
    sortByDistance(
      row.places.map((place) => ({
        ...place,
        distance: haversine(origin, place),
      })),
    ),
  );
}
