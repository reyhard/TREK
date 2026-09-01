/**
 * Pure geographic helpers for the movement model (Task 07, F13/F14 port).
 * Coordinates are [lat, lng] tuples; distances are in meters.
 */

export function isValidGeoCoordinate(point: readonly number[]): boolean {
  return Array.isArray(point) && point.length >= 2
    && typeof point[0] === 'number' && Number.isFinite(point[0])
    && point[0] >= -90 && point[0] <= 90
    && typeof point[1] === 'number' && Number.isFinite(point[1])
    && point[1] >= -180 && point[1] <= 180;
}

export function haversineDistanceMeters(a: readonly number[], b: readonly number[]): number | null {
  if (!isValidGeoCoordinate(a) || !isValidGeoCoordinate(b)) return null;
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function calculatePolylineDistanceMeters(points: readonly (readonly number[])[]): number | null {
  if (!points || points.length < 2) return null;
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const segment = haversineDistanceMeters(points[i]!, points[i + 1]!);
    if (segment == null) return null;
    total += segment;
  }
  return total;
}
