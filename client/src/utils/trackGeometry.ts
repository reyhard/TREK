import { haversineDistanceMeters, isValidGeoCoordinate } from './polyline'

export type TrackMode = 'walking' | 'cycling' | 'driving'
export type TrackDurationSource = 'poi-times' | 'estimated'

export interface TrackPlaceLike {
  id: number
  route_geometry?: string | null
  place_time?: string | null
  end_time?: string | null
  transport_mode?: string | null
}

export interface ParsedTrackGeometry {
  coordinates: [number, number][]
  elevations: Array<number | null>
  start: [number, number]
  end: [number, number]
  distance: number
  minElevation: number | null
  maxElevation: number | null
  elevationGain: number
  elevationLoss: number
}

export interface TrackMovementMetrics extends ParsedTrackGeometry {
  mode: TrackMode
  duration: number
  durationSource: TrackDurationSource
}

const SPEED_METERS_PER_SECOND: Record<TrackMode, number> = {
  walking: 5000 / 3600,
  cycling: 15000 / 3600,
  driving: 50000 / 3600,
}

function parseClockMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function normalizeTrackMode(mode: string | null | undefined): TrackMode {
  switch ((mode ?? '').trim().toLowerCase()) {
    case 'cycling':
    case 'bicycle':
    case 'bike':
      return 'cycling'
    case 'driving':
    case 'car':
      return 'driving'
    default:
      return 'walking'
  }
}

export function parseTrackGeometry(raw: string | null | undefined): ParsedTrackGeometry | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(value)) return null

  const points = value.flatMap((row) => {
    if (!Array.isArray(row) || !isValidGeoCoordinate(row)) return []
    const elevation = row.length >= 3 && Number.isFinite(row[2]) ? row[2] : null
    return [{
      coordinate: [row[0], row[1]] as [number, number],
      elevation: elevation as number | null,
    }]
  })
  if (points.length < 2) return null

  let distance = 0
  let elevationGain = 0
  let elevationLoss = 0
  let minElevation: number | null = null
  let maxElevation: number | null = null

  points.forEach((point, index) => {
    if (index > 0) {
      distance += haversineDistanceMeters(points[index - 1].coordinate, point.coordinate) ?? 0
      const previousElevation = points[index - 1].elevation
      if (previousElevation != null && point.elevation != null) {
        const delta = point.elevation - previousElevation
        if (delta > 0) elevationGain += delta
        else elevationLoss += Math.abs(delta)
      }
    }
    if (point.elevation != null) {
      minElevation = minElevation == null
        ? point.elevation
        : Math.min(minElevation, point.elevation)
      maxElevation = maxElevation == null
        ? point.elevation
        : Math.max(maxElevation, point.elevation)
    }
  })

  const coordinates = points.map(point => point.coordinate)
  return {
    coordinates,
    elevations: points.map(point => point.elevation),
    start: coordinates[0],
    end: coordinates[coordinates.length - 1],
    distance,
    minElevation,
    maxElevation,
    elevationGain,
    elevationLoss,
  }
}

export function getTrackMovement(place: TrackPlaceLike): TrackMovementMetrics | null {
  const geometry = parseTrackGeometry(place.route_geometry)
  if (!geometry) return null

  const startMinutes = parseClockMinutes(place.place_time)
  const endMinutes = parseClockMinutes(place.end_time)
  const scheduledDuration = startMinutes != null && endMinutes != null && endMinutes > startMinutes
    ? (endMinutes - startMinutes) * 60
    : null
  const mode = normalizeTrackMode(place.transport_mode)

  return {
    ...geometry,
    mode,
    duration: scheduledDuration ?? geometry.distance / SPEED_METERS_PER_SECOND[mode],
    durationSource: scheduledDuration == null ? 'estimated' : 'poi-times',
  }
}
