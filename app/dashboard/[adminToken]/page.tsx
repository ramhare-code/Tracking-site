"use client";

import {
  use,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  haversineKm
} from "../../../lib/geo";

export default function Dashboard({
  params
}: {
  params: Promise<{
    adminToken: string;
  }>;
}) {
  const { adminToken } = use(params);

  const [data, setData] = useState<any>(null);
  const [viewer, setViewer] = useState<any>(null);
  const [now, setNow] = useState(Date.now());

  const [address, setAddress] =
    useState("Waiting for location...");

  async function refresh() {
    const response = await fetch(
      `/api/dashboard/${adminToken}`,
      {
        cache: "no-store"
      }
    );

    const json = await response.json();

    if (response.ok) {
      setData(json);
    }
  }

  useEffect(() => {
    refresh();

    const poll = setInterval(
      refresh,
      5000
    );

    const clock = setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [adminToken]);

  useEffect(() => {
    navigator.geolocation
      ?.getCurrentPosition(
        (position) => {
          setViewer({
            lat:
              position.coords.latitude,

            lon:
              position.coords.longitude
          });
        }
      );
  }, []);

  useEffect(() => {
    if (!data?.latest) {
      return;
    }

    const lat =
      data.latest.latitude;

    const lon =
      data.latest.longitude;

    fetch(
      `/api/reverse-geocode?lat=${lat}&lon=${lon}`
    )
      .then(
        async (response) => {
          const json =
            await response.json();

          setAddress(
            json.address ||
              "Address unavailable"
          );
        }
      )
      .catch(() => {
        setAddress(
          "Address unavailable"
        );
      });

  }, [
    data?.latest?.latitude,
    data?.latest?.longitude
  ]);

  const status =
    useMemo(() => {
      if (!data) {
        return "Loading";
      }

      if (
        data.consentStatus ===
          "revoked" ||
        data.consentStatus ===
          "disagreed"
      ) {
        return "Sharing stopped";
      }

      if (!data.latest) {
        return "Waiting for location";
      }

      const age =
        now -
        new Date(
          data.latest.captured_at
        ).getTime();

      if (
        data.consentStatus ===
          "agreed" &&
        age < 30000
      ) {
        return "Live";
      }

      return "Last known location";
    }, [data, now]);

  const distance =
    useMemo(() => {
      if (
        !viewer ||
        !data?.latest
      ) {
        return null;
      }

      return haversineKm(
        viewer.lat,
        viewer.lon,
        data.latest.latitude,
        data.latest.longitude
      );
    }, [viewer, data]);

  const speedKmh =
    data?.latest?.speed_mps ==
    null
      ? null
      : Math.max(
          0,
          data.latest.speed_mps *
            3.6
        );

  const accuracy =
    data?.latest?.accuracy_m ==
    null
      ? null
      : Math.round(
          data.latest.accuracy_m
        );

  const accuracyQuality =
    accuracy === null
      ? "Unknown"
      : accuracy <= 20
      ? "High"
      : accuracy <= 100
      ? "Medium"
      : "Low";

  const mapUrl =
    data?.latest
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${
          data.latest.longitude -
          0.01
        }%2C${
          data.latest.latitude -
          0.01
        }%2C${
          data.latest.longitude +
          0.01
        }%2C${
          data.latest.latitude +
          0.01
        }&layer=mapnik&marker=${
          data.latest.latitude
        }%2C${
          data.latest.longitude
        }`
      : "";

  return (
    <main className="dashboard">

      <div className="topbar">

        <div>
          <h1>
            {data?.name ||
              "Tracking Dashboard"}
          </h1>

          <span
            className={
              status === "Live"
                ? "badge live"
                : status ===
                    "Sharing stopped"
                ? "badge stopped"
                : "badge offline"
            }
          >
            {status}
          </span>
        </div>

        <div className="muted">
          Updates every 5 seconds
        </div>

      </div>

      <div className="grid">

        <section className="panel">

          <h2>
            Position
          </h2>

          {mapUrl ? (
            <iframe
              className="map"
              title="Tracked phone location"
              src={mapUrl}
              loading="lazy"
            />
          ) : (
            <div
              className="map"
              style={{
                display: "grid",
                placeItems: "center"
              }}
            >
              Waiting for location...
            </div>
          )}

        </section>

        <section className="panel">

          <h2>
            Location Details
          </h2>

          <div className="stats">

            <div className="stat">
              <b>
                Exact Address
              </b>

              <strong>
                {address}
              </strong>
            </div>

            <div className="stat">
              <b>
                Distance
              </b>

              <strong>
                {distance === null
                  ? "Unavailable"
                  : `${distance.toFixed(
                      distance < 10
                        ? 2
                        : 1
                    )} km`}
              </strong>
            </div>

            <div className="stat">
              <b>
                Speed
              </b>

              <strong>
                {speedKmh === null
                  ? "Unavailable"
                  : `${speedKmh.toFixed(
                      1
                    )} km/h`}
              </strong>
            </div>

            <div className="stat">
              <b>
                Accuracy
              </b>

              <strong>
                {accuracy === null
                  ? "Unknown"
                  : `±${accuracy} m • ${accuracyQuality}`}
              </strong>
            </div>

            <div className="stat">
              <b>
                Coordinates
              </b>

              <strong>
                {data?.latest
                  ? `${data.latest.latitude.toFixed(
                      6
                    )}, ${data.latest.longitude.toFixed(
                      6
                    )}`
                  : "—"}
              </strong>
            </div>

            <div className="stat">
              <b>
                Last Updated
              </b>

              <strong>
                {data?.latest
                  ? new Date(
                      data.latest.captured_at
                    ).toLocaleString()
                  : "No location received"}
              </strong>
            </div>

            <div className="stat">
              <b>
                Status
              </b>

              <strong>
                {status}
              </strong>
            </div>

          </div>

          <div className="notice">
            If the tracked phone is switched off,
            loses internet, or stops sending updates,
            the dashboard shows only the last
            successfully received location.
          </div>

        </section>

      </div>

    </main>
  );
}
