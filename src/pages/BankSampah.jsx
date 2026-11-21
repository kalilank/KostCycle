import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Clock,
  LocateFixed,
  MapPin,
  Navigation,
  Recycle,
  RefreshCw,
} from "lucide-react";
import BackButton from "../components/BackButton";
import {
  CACHE_TTL_MS,
  DEFAULT_CENTRE,
  directionsUrl,
  fetchPlaces,
  formatDistance,
  fromCache,
  mapsSearchUrl,
  pickRadius,
  readCache,
  writeCache,
} from "../utils/bankSampah";

const savedTime = (ms) =>
  new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function mapEmbedUrl({ lat, lng }) {
  const d = 0.006;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

export default function BankSampah() {
  const [origin, setOrigin] = useState(null);
  const [status, setStatus] = useState("idle");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState({ places: [], radius: 0 });
  const [savedAt, setSavedAt] = useState(null);
  const request = useRef(null);

  useEffect(() => () => request.current?.abort(), []);

  function show(found, cachedAt = null) {
    setResult(found);
    setSavedAt(cachedAt);
    setStatus(found.places.length ? "done" : "empty");
  }

  async function search(centre, { fresh = false } = {}) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setOrigin(centre);
    const cached = readCache(centre);
    if (cached && !fresh && Date.now() - cached.savedAt < CACHE_TTL_MS) {
      show(fromCache(cached, centre), cached.savedAt);
      return;
    }
    setStatus("loading");
    try {
      const places = await fetchPlaces(centre, { signal: controller.signal });
      if (controller.signal.aborted) return;
      writeCache(centre, places);
      show(pickRadius(places));
    } catch {
      if (controller.signal.aborted) return;
      if (cached) {
        setNotice(
          "OpenStreetMap is busy right now, so these are the last results we found here.",
        );
        show(fromCache(cached, centre), cached.savedAt);
      } else setStatus("error");
    }
  }

  function fallBack(reason) {
    setNotice(`${reason} Showing places near ${DEFAULT_CENTRE.label} instead.`);
    search(DEFAULT_CENTRE);
  }

  function locate() {
    setNotice("");
    if (!navigator.geolocation) {
      fallBack("Location isn't available in this browser.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        search({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "your location",
        }),
      (err) =>
        fallBack(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied."
            : "We couldn't get your location.",
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const busy = status === "locating" || status === "loading";
  const closest = result.places[0];

  return (
    <div className="container page bank-page">
      <BackButton fallback="/impact" />
      <div className="page-heading">
        <span className="eyebrow muted">WHEN AN ITEM CAN'T BE REUSED</span>
        <h1>
          Find a Bank Sampah<span className="yellow-dot">.</span>
        </h1>
        <p>
          Community waste banks sort and recycle what can't find another home.
          Find the nearest one and drop it off.
        </p>
      </div>

      <section className="bank-controls">
        <button
          className="button primary"
          onClick={locate}
          disabled={busy}
          type="button"
        >
          <LocateFixed size={18} /> Use my location
        </button>
        <button
          className="button secondary"
          onClick={() => {
            setNotice("");
            search(DEFAULT_CENTRE);
          }}
          disabled={busy}
          type="button"
        >
          <MapPin size={18} /> Near {DEFAULT_CENTRE.label}
        </button>
      </section>
      {notice && (
        <p className="bank-notice" role="status">
          {notice}
        </p>
      )}

      {status === "idle" && (
        <div className="bank-state">
          <Recycle size={40} strokeWidth={1.4} />
          <p>
            Share your location to see real Bank Sampah and recycling centres
            near you, sorted by distance. Your location stays in your browser.
          </p>
        </div>
      )}
      {busy && (
        <div className="bank-state" role="status">
          <RefreshCw className="spin" size={32} />
          <p>
            {status === "locating"
              ? "Finding your location…"
              : `Searching OpenStreetMap near ${origin?.label}…`}
            <br />
            <small>
              This can take up to a minute when the public map servers are busy.
            </small>
          </p>
        </div>
      )}
      {(status === "error" || status === "empty") && (
        <div className="bank-state" role="alert">
          <Recycle size={40} strokeWidth={1.4} />
          <p>
            {status === "error"
              ? "We couldn't reach the OpenStreetMap service right now."
              : "No Bank Sampah is mapped on OpenStreetMap within 25 km yet."}{" "}
            Try searching Google Maps instead.
          </p>
          <div className="button-row">
            <a
              className="button primary"
              href={mapsSearchUrl(origin || DEFAULT_CENTRE)}
              target="_blank"
              rel="noreferrer"
            >
              Search Google Maps <ArrowUpRight size={17} />
            </a>
            {status === "error" && (
              <button
                className="button secondary"
                type="button"
                onClick={() => search(origin || DEFAULT_CENTRE)}
              >
                <RefreshCw size={17} /> Try again
              </button>
            )}
          </div>
        </div>
      )}

      {status === "done" && closest && (
        <>
          <div className="section-heading">
            <h2>Nearest to {origin.label}</h2>
            <span className="muted">
              {result.places.length}{" "}
              {result.places.length === 1 ? "place" : "places"} within{" "}
              {result.radius / 1000} km
            </span>
          </div>
          <div className="bank-layout">
            <ol className="bank-list">
              {result.places.map((place, index) => (
                <li
                  key={place.id}
                  className={`bank-card ${index === 0 ? "closest" : ""}`}
                >
                  <div className="bank-card-main">
                    {index === 0 && (
                      <span className="bank-badge">Closest to you</span>
                    )}
                    <h3>{place.name}</h3>
                    <span className="bank-kind">{place.kind}</span>
                    {place.address && (
                      <p>
                        <MapPin size={14} /> {place.address}
                      </p>
                    )}
                    {place.openingHours && (
                      <p>
                        <Clock size={14} /> {place.openingHours}
                      </p>
                    )}
                  </div>
                  <div className="bank-card-side">
                    <strong>{formatDistance(place.distance)}</strong>
                    <a
                      className={`button ${index === 0 ? "primary" : "secondary"}`}
                      href={directionsUrl(place)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Navigation size={16} /> Directions
                    </a>
                  </div>
                </li>
              ))}
            </ol>
            <aside className="bank-map">
              <iframe
                title={`Map of ${closest.name}`}
                src={mapEmbedUrl(closest)}
                loading="lazy"
              />
              <a href={closest.osmUrl} target="_blank" rel="noreferrer">
                View {closest.name} on OpenStreetMap <ArrowUpRight size={14} />
              </a>
            </aside>
          </div>
          {savedAt && (
            <p className="bank-saved">
              Saved results from {savedTime(savedAt)}.{" "}
              <button
                type="button"
                onClick={() => search(origin, { fresh: true })}
              >
                <RefreshCw size={13} /> Refresh
              </button>
            </p>
          )}
          <p className="bank-search-more">
            Not listed?{" "}
            <a href={mapsSearchUrl(origin)} target="_blank" rel="noreferrer">
              Search Google Maps for more Bank Sampah
            </a>
            .
          </p>
        </>
      )}

      <p className="impact-disclaimer">
        Data ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap contributors
        </a>
        . Distances are straight-line estimates; check opening hours before
        visiting.
      </p>
    </div>
  );
}
