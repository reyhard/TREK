import { calculatePolylineDistanceMeters, isValidGeoCoordinate } from './polyline'

export interface TrackStats {
  points: number[][]
  distanceMeters: number
  hasElevation: boolean
  elevations: number[]
  minElevationMeters: number | null
  maxElevationMeters: number | null
  elevationGainMeters: number
  elevationLossMeters: number
}

function parseTrackGeometry(routeGeometry: string | null | undefined): number[][] | null {
  if (typeof routeGeometry !== 'string' || routeGeometry.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(routeGeometry)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length < 2) return null

  const points: number[][] = []
  for (const rawPoint of parsed) {
    if (!Array.isArray(rawPoint) || !isValidGeoCoordinate(rawPoint)) return null
    const [lat, lng] = rawPoint
    const elevation = rawPoint.length >= 3 && Number.isFinite(rawPoint[2]) ? Number(rawPoint[2]) : null
    points.push(elevation == null ? [lat, lng] : [lat, lng, elevation])
  }
  return points
}

export function calculateTrackStats(routeGeometry: string | null | undefined): TrackStats | null {
  const points = parseTrackGeometry(routeGeometry)
  if (!points) return null
  const distanceMeters = calculatePolylineDistanceMeters(points)
  if (distanceMeters == null) return null

  const hasElevation = points.every(point => point.length >= 3 && Number.isFinite(point[2]))
  const elevations = hasElevation ? points.map(point => point[2]) : []
  let elevationGainMeters = 0
  let elevationLossMeters = 0
  if (hasElevation) {
    for (let index = 1; index < elevations.length; index += 1) {
      const delta = elevations[index] - elevations[index - 1]
      if (delta > 0) elevationGainMeters += delta
      else elevationLossMeters += Math.abs(delta)
    }
  }

  return {
    points,
    distanceMeters,
    hasElevation,
    elevations,
    minElevationMeters: hasElevation ? Math.min(...elevations) : null,
    maxElevationMeters: hasElevation ? Math.max(...elevations) : null,
    elevationGainMeters,
    elevationLossMeters,
  }
}
