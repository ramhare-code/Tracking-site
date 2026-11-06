"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";
import type { GeoPoint } from "../../../lib/geo";
import { haversineKm } from "../../../lib/geo";

export type Viewer = {
  lat: number;
  lon: number;
  accuracy: number;
};

export type RouteInfo = {
  distanceKm: number;
  durationMin: number;
};

type MapStyleKey = "streets" | "light" | "satellite";

// Free vector map styles (no API key needed) + Esri satellite imagery.
const STYLES: Record<MapStyleKey, any> = {
  streets: "https://tiles.openfreemap.org/styles/liberty",
  light: "https://tiles.openfreemap.org/styles/positron",
  satellite: {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      sat: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Imagery © Esri"
      },
      labels: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        maxzoom: 19
      }
    },
    layers: [
      { id: "sat", type: "raster", source: "sat" },
      { id: "labels", type: "raster", source: "labels" }
    ]
  }
};

// Plain OpenStreetMap tiles, used if the vector style cannot load.
const FALLBACK_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

const BLUE = "#1a73e8";
const ROUTE = "#111827";

function circlePolygon(lat: number, lon: number, radiusM: number) {
  const coords: [number, number][] = [];
  const steps = 48;
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));

  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] }
  };
}

function line(coords: [number, number][]) {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords }
  };
}

function bearing(a: GeoPoint, b: GeoPoint) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y =
    Math.sin(toRad(b.longitude - a.longitude)) * Math.cos(toRad(b.latitude));
  const x =
    Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude)) -
    Math.sin(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.cos(toRad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export default function LiveMap({
  points,
  viewer,
  name,
  live,
  onRoute
}: {
  points: GeoPoint[];
  viewer: Viewer | null;
  name: string;
  live: boolean;
  onRoute?: (route: RouteInfo | null) => void;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const lib = useRef<any>(null);
  const map = useRef<any>(null);
  const target = useRef<any>(null);
  const targetEl = useRef<HTMLDivElement | null>(null);
  const me = useRef<any>(null);
  const shown = useRef<[number, number] | null>(null);
  const anim = useRef<number | null>(null);
  const routeCoords = useRef<[number, number][]>([]);
  const routeKey = useRef<{ a: [number, number]; b: [number, number]; at: number } | null>(null);
  const centered = useRef(false);

  const [ready, setReady] = useState(false);
  const [styleKey, setStyleKey] = useState<MapStyleKey>("streets");
  const [follow, setFollow] = useState(true);
  const [tilt, setTilt] = useState(false);

  const latest = points[0];

  // ---- Create the map --------------------------------------------
  useEffect(() => {
    let disposed = false;

    import("maplibre-gl").then((mod) => {
      if (disposed || !el.current || map.current) return;

      const maplibre: any = (mod as any).default || mod;
      lib.current = maplibre;

      const m = new maplibre.Map({
        container: el.current,
        style: STYLES.streets,
        center: [78.9, 20.6],
        zoom: 4,
        attributionControl: { compact: true }
      });

      m.addControl(new maplibre.NavigationControl({ visualizePitch: true }), "top-right");
      m.addControl(new maplibre.ScaleControl({ unit: "metric" }), "bottom-left");

      // Stop auto-follow when the user drags the map themselves.
      m.on("dragstart", () => setFollow(false));

      let loaded = false;

      m.on("style.load", () => {
        loaded = true;
        addOverlays(m);
        setReady(true);
      });

      // If the vector map can't load (blocked network etc.), fall back
      // to simple OpenStreetMap tiles so the location is still shown.
      setTimeout(() => {
        if (!loaded && !disposed && map.current === m) {
          m.setStyle(FALLBACK_STYLE);
        }
      }, 8000);

      map.current = m;
    });

    return () => {
      disposed = true;
      if (anim.current) cancelAnimationFrame(anim.current);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Sources/layers are cleared whenever the style changes, so they are
  // (re)added here after every style load.
  function addOverlays(m: any) {
    const empty = { type: "FeatureCollection", features: [] };

    const addLayer = (layer: any) => {
      if (!m.getLayer(layer.id)) m.addLayer(layer);
    };

    const add = (id: string, layer: any) => {
      if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty });
      addLayer({ source: id, ...layer });
    };

    // 3D buildings for the vector styles.
    if (m.getSource("openmaptiles") && !m.getLayer("buildings-3d")) {
      const firstSymbol = m
        .getStyle()
        .layers.find((l: any) => l.type === "symbol")?.id;

      m.addLayer(
        {
          id: "buildings-3d",
          type: "fill-extrusion",
          source: "openmaptiles",
          "source-layer": "building",
          minzoom: 15,
          paint: {
            "fill-extrusion-color": "#d6d9e0",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.7
          }
        },
        firstSymbol
      );
    }

    add("route", {
      id: "route-casing",
      type: "line",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 9 }
    });
    addLayer({
      id: "route-line",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ROUTE, "line-width": 5 }
    });

    add("trail", {
      id: "trail-line",
      type: "line",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": BLUE,
        "line-width": 5,
        "line-opacity": 0.75
      }
    });

    add("accuracy", {
      id: "accuracy-fill",
      type: "fill",
      paint: { "fill-color": BLUE, "fill-opacity": 0.12 }
    });
    addLayer({
      id: "accuracy-outline",
      type: "line",
      source: "accuracy",
      paint: { "line-color": BLUE, "line-width": 1, "line-opacity": 0.4 }
    });

    // Restore whatever data we already had before the style switch.
    if (routeCoords.current.length) {
      m.getSource("route").setData(line(routeCoords.current));
    }
  }

  // ---- Switch style ------------------------------------------------
  useEffect(() => {
    if (!map.current) return;
    setReady(false);
    map.current.setStyle(STYLES[styleKey]);
  }, [styleKey]);

  // ---- Tracked person's marker, trail and accuracy -----------------
  useEffect(() => {
    if (!ready || !latest || !map.current) return;

    const m = map.current;
    const maplibre = lib.current;
    const pos: [number, number] = [latest.longitude, latest.latitude];

    if (!target.current) {
      const div = document.createElement("div");
      div.className = "rider-marker";
      div.innerHTML = `
        <div class="rider-pulse"></div>
        <div class="rider-arrow"></div>
        <div class="rider-dot">${(name || "?").trim().charAt(0).toUpperCase()}</div>
      `;
      targetEl.current = div;
      target.current = new maplibre.Marker({ element: div })
        .setLngLat(pos)
        .addTo(m);
      shown.current = pos;
    }

    targetEl.current?.classList.toggle("is-live", live);

    // Heading: phone-reported, or calculated from the previous point.
    const prev = points.find(
      (p) =>
        haversineKm(p.latitude, p.longitude, latest.latitude, latest.longitude) >
        0.005
    );
    const heading =
      latest.heading != null && Number.isFinite(latest.heading)
        ? latest.heading
        : prev
        ? bearing(prev, latest)
        : null;

    const arrow = targetEl.current?.querySelector<HTMLDivElement>(".rider-arrow");
    if (arrow) {
      arrow.style.display = heading == null ? "none" : "block";
      arrow.style.transform = `rotate(${heading ?? 0}deg)`;
    }

    // Glide the marker to its new position instead of jumping.
    const from = shown.current || pos;
    const start = performance.now();
    const duration = 900;
    if (anim.current) cancelAnimationFrame(anim.current);

    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = k * (2 - k);
      const cur: [number, number] = [
        from[0] + (pos[0] - from[0]) * e,
        from[1] + (pos[1] - from[1]) * e
      ];
      target.current.setLngLat(cur);
      shown.current = cur;
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);

    m.getSource("trail")?.setData(
      line([...points].reverse().map((p) => [p.longitude, p.latitude]))
    );
    m.getSource("accuracy")?.setData(
      circlePolygon(latest.latitude, latest.longitude, latest.accuracy_m || 0)
    );

    if (!centered.current) {
      centered.current = true;
      m.jumpTo({ center: pos, zoom: 16.5 });
    } else if (follow) {
      m.easeTo({ center: pos, duration: 900 });
    }
  }, [ready, latest?.latitude, latest?.longitude, latest?.heading, latest?.accuracy_m, live, follow, points]);

  // ---- Your position --------------------------------------------
  useEffect(() => {
    if (!ready || !viewer || !map.current) return;

    const pos: [number, number] = [viewer.lon, viewer.lat];

    if (!me.current) {
      const div = document.createElement("div");
      div.className = "me-marker";
      div.title = "You";
      me.current = new lib.current.Marker({ element: div })
        .setLngLat(pos)
        .addTo(map.current);
    } else {
      me.current.setLngLat(pos);
    }
  }, [ready, viewer?.lat, viewer?.lon]);

  // ---- Road route between you and them (with ETA) ---------------
  useEffect(() => {
    if (!ready || !viewer || !latest) return;

    const a: [number, number] = [viewer.lon, viewer.lat];
    const b: [number, number] = [latest.longitude, latest.latitude];
    const prev = routeKey.current;

    // Recalculate only after ~50 m of movement or every 30 s.
    if (
      prev &&
      haversineKm(prev.a[1], prev.a[0], a[1], a[0]) < 0.05 &&
      haversineKm(prev.b[1], prev.b[0], b[1], b[0]) < 0.05 &&
      Date.now() - prev.at < 30000
    ) {
      return;
    }

    routeKey.current = { a, b, at: Date.now() };

    const controller = new AbortController();

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((json) => {
        const r = json?.routes?.[0];
        if (!r) throw new Error("no route");

        routeCoords.current = r.geometry.coordinates;
        map.current?.getSource("route")?.setData(line(routeCoords.current));
        onRoute?.({ distanceKm: r.distance / 1000, durationMin: r.duration / 60 });
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        // Fall back to a straight line if routing is unavailable.
        routeCoords.current = [a, b];
        map.current?.getSource("route")?.setData(line(routeCoords.current));
        onRoute?.(null);
      });

    return () => controller.abort();
  }, [ready, viewer?.lat, viewer?.lon, latest?.latitude, latest?.longitude]);

  // ---- Controls --------------------------------------------------
  function recenter() {
    if (!latest || !map.current) return;
    setFollow(true);
    map.current.easeTo({
      center: [latest.longitude, latest.latitude],
      zoom: Math.max(map.current.getZoom(), 16),
      duration: 700
    });
  }

  function fitBoth() {
    if (!latest || !viewer || !map.current) return;
    setFollow(false);
    const bounds = new lib.current.LngLatBounds();
    bounds.extend([latest.longitude, latest.latitude]);
    bounds.extend([viewer.lon, viewer.lat]);
    routeCoords.current.forEach((c) => bounds.extend(c));
    map.current.fitBounds(bounds, { padding: 70, maxZoom: 17, duration: 800 });
  }

  function toggleTilt() {
    if (!map.current) return;
    const next = !tilt;
    setTilt(next);
    map.current.easeTo({ pitch: next ? 60 : 0, duration: 600 });
  }

  return (
    <div className="map-wrap">
      <div ref={el} className="map" />

      {!latest && (
        <div className="map-overlay">Waiting for location...</div>
      )}

      <div className="map-layers">
        {(["streets", "light", "satellite"] as MapStyleKey[]).map((k) => (
          <button
            key={k}
            type="button"
            className={styleKey === k ? "active" : ""}
            onClick={() => setStyleKey(k)}
          >
            {k === "streets" ? "Map" : k === "light" ? "Light" : "Satellite"}
          </button>
        ))}
      </div>

      <div className="map-actions">
        <button type="button" onClick={recenter} title="Center on tracked phone" className={follow ? "active" : ""}>
          ◎
        </button>
        <button type="button" onClick={fitBoth} title="Show both of you" disabled={!viewer}>
          ⤢
        </button>
        <button type="button" onClick={toggleTilt} title="3D view" className={tilt ? "active" : ""}>
          3D
        </button>
      </div>
    </div>
  );
}
