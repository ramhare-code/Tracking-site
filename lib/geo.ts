export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371;

  const toRad = (deg: number) =>
    (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

export type GeoPoint = {
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading: number | null;
  captured_at: string;
};

/**
 * Speed in km/h. Uses the speed reported by the phone when available,
 * otherwise calculates it from the distance between recent fixes.
 * `points` must be sorted newest first.
 */
export function currentSpeedKmh(points: GeoPoint[]): number | null {
  if (!points.length) return null;

  const latest = points[0];

  if (latest.speed_mps != null && Number.isFinite(latest.speed_mps)) {
    return Math.max(0, latest.speed_mps * 3.6);
  }

  const latestTime = new Date(latest.captured_at).getTime();

  // Compare against a fix ~10 s older, so GPS jitter between
  // 1-second samples does not dominate the result.
  const older = points.find(
    (p) => latestTime - new Date(p.captured_at).getTime() >= 10000
  );

  if (!older) return null;

  const seconds =
    (latestTime - new Date(older.captured_at).getTime()) / 1000;

  if (seconds <= 0 || seconds > 120) return null;

  const km = haversineKm(
    older.latitude,
    older.longitude,
    latest.latitude,
    latest.longitude
  );

  // Ignore movement within GPS noise (standing still).
  if (km < noiseKm(latest, older)) return 0;

  return (km / seconds) * 3600;
}

function noiseKm(a: GeoPoint, b: GeoPoint) {
  const acc = Math.max(a.accuracy_m ?? 0, b.accuracy_m ?? 0);
  return Math.min(Math.max(acc * 0.5, 5), 25) / 1000;
}

/** Total distance travelled across points sorted oldest first, in km. */
export function pathLengthKm(points: GeoPoint[]): number {
  if (points.length < 2) return 0;

  let total = 0;
  let anchor = points[0];

  // Only count a step once the phone has moved further than GPS noise
  // from the last counted position.
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const d = haversineKm(
      anchor.latitude,
      anchor.longitude,
      p.latitude,
      p.longitude
    );

    if (d >= noiseKm(anchor, p)) {
      total += d;
      anchor = p;
    }
  }

  return total;
}

export function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 2 : 1)} km`;
}
