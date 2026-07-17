const EARTH_RADIUS_METERS = 6_371_000

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180
}

export function isValidGeoCoordinate(point: readonly number[]): boolean {
  if (!Array.isArray(point) || point.length < 2) return false
  const [lat, lng] = point
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

export function haversineDistanceMeters(a: readonly number[], b: readonly number[]): number | null {
  if (!isValidGeoCoordinate(a) || !isValidGeoCoordinate(b)) return null
  const [lat1, lng1] = a
  const [lat2, lng2] = b
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinLng ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function calculatePolylineDistanceMeters(points: readonly (readonly number[])[]): number | null {
  if (!Array.isArray(points) || points.length < 2 || !points.every(isValidGeoCoordinate)) return null
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const segment = haversineDistanceMeters(points[index - 1], points[index])
    if (segment == null) return null
    total += segment
  }
  return total
}

/** Google encoded-polyline decoding with configurable precision; MOTIS normally uses 6. */
export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  if (typeof encoded !== 'string' || encoded.length === 0 || !Number.isInteger(precision) || precision < 0) return []
  const factor = 10 ** precision
  const coords: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    for (const axis of [0, 1] as const) {
      let result = 0
      let shift = 0
      let byte = 0x20
      while (byte >= 0x20) {
        if (index >= encoded.length) return coords
        byte = encoded.charCodeAt(index++) - 63
        if (byte < 0) return coords
        result |= (byte & 0x1f) << shift
        shift += 5
      }
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (axis === 0) lat += delta
      else lng += delta
    }
    coords.push([lat / factor, lng / factor])
  }

  return coords
}
