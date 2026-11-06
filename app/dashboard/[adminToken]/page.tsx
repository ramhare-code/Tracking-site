"use client";

import {
  use,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  currentSpeedKmh,
  formatDistance,
  GeoPoint,
  haversineKm,
  pathLengthKm
} from "../../../lib/geo";

import LiveMap, { RouteInfo, Viewer } from "./LiveMap";

// How often the dashboard asks the server for the newest location.
const POLL_MS = 1000;
// A location newer than this counts as "Live".
const LIVE_WINDOW_MS = 15000;

export default function Dashboard({
  params
}: {
  params: Promise<{
    adminToken: string;
  }>;
}) {
  const { adminToken } = use(params);

  const [data, setData] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(Date.now());

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [viewerError, setViewerError] = useState("");
  const [route, setRoute] = useState<RouteInfo | null>(null);

  const [address, setAddress] = useState("Waiting for location...");
  const lastGeocode = useRef<{ lat: number; lon: number; at: number } | null>(
    null
  );

  // ---- Poll the server every second -------------------------------
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function refresh() {
      if (inFlight) return;
      inFlight = true;

      try {
        const response = await fetch(`/api/dashboard/${adminToken}`, {
          cache: "no-store"
        });
        const json = await response.json();

        if (cancelled) return;

        if (response.ok) {
          setData(json);
          setLoadError("");
          if (json.serverTime) {
            setClockOffset(new Date(json.serverTime).getTime() - Date.now());
          }
        } else {
          setLoadError(json.error || "Could not load dashboard.");
        }
      } catch {
        if (!cancelled) setLoadError("Connection problem, retrying...");
      } finally {
        inFlight = false;
      }
    }

    refresh();
    const poll = setInterval(refresh, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [adminToken]);

  // ---- Your own location (for "distance from you") ---------------
  useEffect(() => {
    if (!navigator.geolocation) {
      setViewerError("Your browser does not support location.");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        setViewerError("");
        setViewer({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        setViewerError(
          error.code === error.PERMISSION_DENIED
            ? "Allow location in this browser to see the distance from you."
            : "Finding your location..."
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000
      }
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const points: GeoPoint[] = data?.recent || [];
  const latest: GeoPoint | null = data?.latest || null;

  // ---- Address (throttled: Nominatim allows ~1 request/second) ---
  useEffect(() => {
    if (!latest) return;

    const prev = lastGeocode.current;
    const moved = prev
      ? haversineKm(prev.lat, prev.lon, latest.latitude, latest.longitude)
      : Infinity;

    // Look the address up again only after moving ~30 m or every 60 s.
    if (prev && moved < 0.03 && Date.now() - prev.at < 60000) {
      return;
    }

    lastGeocode.current = {
      lat: latest.latitude,
      lon: latest.longitude,
      at: Date.now()
    };

    fetch(`/api/reverse-geocode?lat=${latest.latitude}&lon=${latest.longitude}`)
      .then(async (response) => {
        const json = await response.json();
        setAddress(json.address || "Address unavailable");
      })
      .catch(() => setAddress("Address unavailable"));
  }, [latest?.latitude, latest?.longitude]);

  const ageMs = latest
    ? now + clockOffset - new Date(latest.captured_at).getTime()
    : null;

  const status = useMemo(() => {
    if (!data) return "Loading";

    if (data.consentStatus === "pending") return "Waiting for permission";

    if (
      data.consentStatus === "revoked" ||
      data.consentStatus === "disagreed"
    ) {
      return "Sharing stopped";
    }

    if (!latest) return "Waiting for location";

    if (ageMs !== null && ageMs < LIVE_WINDOW_MS) return "Live";

    return "Last known location";
  }, [data, latest, ageMs]);

  const distanceKm =
    viewer && latest
      ? haversineKm(viewer.lat, viewer.lon, latest.latitude, latest.longitude)
      : null;

  const speedKmh = useMemo(() => currentSpeedKmh(points), [points]);

  // Distance moved in the last 5 minutes of received points.
  const travelledKm = useMemo(() => {
    if (!latest) return 0;
    const cutoff = new Date(latest.captured_at).getTime() - 5 * 60 * 1000;
    const window = points
      .filter((p) => new Date(p.captured_at).getTime() >= cutoff)
      .reverse();
    return pathLengthKm(window);
  }, [points, latest]);

  const accuracy =
    latest?.accuracy_m == null ? null : Math.round(latest.accuracy_m);

  const accuracyQuality =
    accuracy === null
      ? "Unknown"
      : accuracy <= 20
      ? "High"
      : accuracy <= 100
      ? "Medium"
      : "Low";

  return (
    <main className="dashboard">
      <div className="topbar">
        <div>
          <h1>{data?.name || "Tracking Dashboard"}</h1>

          <span
            className={
              status === "Live"
                ? "badge live"
                : status === "Sharing stopped"
                ? "badge stopped"
                : "badge offline"
            }
          >
            {status === "Live" && <span className="pulse" />}
            {status}
          </span>
        </div>

        <div className="muted">
          {ageMs !== null ? `Last update ${formatAge(ageMs)}` : "Updates every second"}
        </div>
      </div>

      {loadError && <div className="notice error">{loadError}</div>}

      <div className="grid">
        <section className="panel">
          <h2>Position</h2>

          <LiveMap
            points={points}
            viewer={viewer}
            name={data?.name || ""}
            live={status === "Live"}
            onRoute={setRoute}
          />

          {latest && (
            <div className="ride-card">
              <div className="ride-avatar">
                {(data?.name || "?").trim().charAt(0).toUpperCase()}
              </div>
              <div className="ride-main">
                <b>{data?.name}</b>
                <span className="muted">
                  {status === "Live" ? "Moving live" : status} •{" "}
                  {ageMs !== null ? formatAge(ageMs) : ""}
                </span>
              </div>
              <div className="ride-metric">
                <strong>
                  {route
                    ? formatEta(route.durationMin)
                    : distanceKm !== null
                    ? formatDistance(distanceKm)
                    : "—"}
                </strong>
                <span>{route ? `${formatDistance(route.distanceKm)} by road` : "away"}</span>
              </div>
              <div className="ride-metric">
                <strong>{speedKmh === null ? "—" : speedKmh.toFixed(0)}</strong>
                <span>km/h</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Location Details</h2>

          <div className="stats">
            <div className="stat wide">
              <b>Address</b>
              <strong>{address}</strong>
            </div>

            <div className="stat highlight">
              <b>Distance from you</b>
              <strong>
                {distanceKm !== null
                  ? formatDistance(distanceKm)
                  : viewerError || "Finding your location..."}
              </strong>
            </div>

            <div className="stat highlight">
              <b>Speed</b>
              <strong>
                {speedKmh === null
                  ? latest
                    ? "Calculating..."
                    : "—"
                  : `${speedKmh.toFixed(1)} km/h`}
              </strong>
            </div>

            <div className="stat">
              <b>By road / ETA</b>
              <strong>
                {route
                  ? `${formatDistance(route.distanceKm)} • ${formatEta(route.durationMin)}`
                  : "—"}
              </strong>
            </div>

            <div className="stat">
              <b>Moved (last 5 min)</b>
              <strong>{latest ? formatDistance(travelledKm) : "—"}</strong>
            </div>

            <div className="stat">
              <b>Accuracy</b>
              <strong>
                {accuracy === null
                  ? "Unknown"
                  : `±${accuracy} m • ${accuracyQuality}`}
              </strong>
            </div>

            <div className="stat">
              <b>Coordinates</b>
              <strong>
                {latest
                  ? `${latest.latitude.toFixed(6)}, ${latest.longitude.toFixed(6)}`
                  : "—"}
              </strong>
            </div>

            <div className="stat">
              <b>Last Updated</b>
              <strong>
                {latest
                  ? new Date(latest.captured_at).toLocaleTimeString()
                  : "No location received"}
              </strong>
            </div>
          </div>

          {latest && (
            <a
              className="btn btn-ghost"
              style={{ display: "inline-block", marginTop: 14, textDecoration: "none" }}
              href={`https://www.google.com/maps/dir/?api=1&destination=${latest.latitude},${latest.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Get directions
            </a>
          )}

          <div className="notice">
            Updates arrive every second while the other phone has the
            sharing page open. If the phone is switched off, offline, or
            the page is closed, the last received location stays on this
            dashboard and live updates resume when the page is reopened.
          </div>
        </section>
      </div>
    </main>
  );
}

function formatAge(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function formatEta(min: number) {
  if (min < 1) return "< 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${Math.round(min - h * 60)} min`;
}
