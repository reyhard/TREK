import type { Assignment, Place, Reservation, RouteSegment } from '../types'
import { calculatePolylineDistanceMeters, decodePolyline } from './polyline'
import { calculateTrackStats } from './trackStats'

export type MovementMode = 'walking' | 'driving' | 'cycling'
export type MovementSource = 'route' | 'hotel-bookend' | 'transit-walk' | 'track'

export interface MovementContribution {
  key: string
  mode: MovementMode
  source: MovementSource
  sourceId: number | string
  durationSeconds: number | null
  distanceMeters: number | null
}

export interface MovementTotal {
  mode: MovementMode
  durationSeconds: number
  distanceMeters: number
  durationComplete: boolean
  distanceComplete: boolean
  contributionCount: number
}

export interface HotelMovementLegs {
  top?: RouteSegment
  bottom?: RouteSegment
}

export function normalizeMovementMode(value: unknown): MovementMode {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (mode === 'driving' || mode === 'car') return 'driving'
  if (mode === 'cycling' || mode === 'bicycle' || mode === 'bike') return 'cycling'
  return 'walking'
}

function metricOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function normalizeContribution(contribution: MovementContribution): MovementContribution {
  return {
    ...contribution,
    durationSeconds: metricOrNull(contribution.durationSeconds),
    distanceMeters: metricOrNull(contribution.distanceMeters),
  }
}

export function createRouteContributions(
  dayId: number,
  mode: MovementMode,
  routeLegs: Record<number, RouteSegment>,
): MovementContribution[] {
  return Object.entries(routeLegs).map(([legId, leg]) => ({
    key: `route:${dayId}:${legId}`,
    mode,
    source: 'route',
    sourceId: legId,
    durationSeconds: metricOrNull(leg.duration),
    distanceMeters: metricOrNull(leg.distance),
  }))
}

export function createHotelBookendContributions(
  dayId: number,
  mode: MovementMode,
  hotelLegs?: HotelMovementLegs,
): MovementContribution[] {
  if (!hotelLegs) return []
  const out: MovementContribution[] = []
  for (const placement of ['top', 'bottom'] as const) {
    const leg = hotelLegs[placement]
    if (!leg) continue
    out.push({
      key: `hotel-bookend:${dayId}:${placement}`,
      mode,
      source: 'hotel-bookend',
      sourceId: placement,
      durationSeconds: metricOrNull(leg.duration),
      distanceMeters: metricOrNull(leg.distance),
    })
  }
  return out
}

export function aggregateMovementContributions(
  mode: MovementMode,
  contributions: MovementContribution[],
): MovementTotal {
  const unique = new Map<string, MovementContribution>()
  for (const raw of contributions) {
    if (raw.mode !== mode) continue
    const contribution = normalizeContribution(raw)
    const existing = unique.get(contribution.key)
    if (!existing) {
      unique.set(contribution.key, contribution)
      continue
    }
    unique.set(contribution.key, {
      ...existing,
      durationSeconds: existing.durationSeconds ?? contribution.durationSeconds,
      distanceMeters: existing.distanceMeters ?? contribution.distanceMeters,
    })
  }

  const selected = [...unique.values()]
  return {
    mode,
    durationSeconds: selected.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0),
    distanceMeters: selected.reduce((sum, item) => sum + (item.distanceMeters ?? 0), 0),
    durationComplete: selected.every(item => item.durationSeconds != null),
    distanceComplete: selected.every(item => item.distanceMeters != null),
    contributionCount: selected.length,
  }
}

interface TransitMetadataLeg {
  mode?: unknown
  duration?: unknown
  distance?: unknown
  geometry?: unknown
  geometry_precision?: unknown
}

function parseMetadata(reservation: Reservation): Record<string, any> | null {
  const raw: unknown = (reservation as Reservation & { metadata?: unknown }).metadata
  if (raw == null) return null
  if (typeof raw === 'object') return raw as Record<string, any>
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function transitGeometryDistance(leg: TransitMetadataLeg): number | null {
  if (typeof leg.geometry !== 'string' || leg.geometry.length === 0) return null
  const precision = typeof leg.geometry_precision === 'number' && Number.isInteger(leg.geometry_precision)
    ? leg.geometry_precision
    : 6
  return calculatePolylineDistanceMeters(decodePolyline(leg.geometry, precision))
}

export function createTransitWalkContributions(
  dayId: number,
  reservations: Reservation[],
): MovementContribution[] {
  const out: MovementContribution[] = []
  for (const reservation of reservations) {
    if (reservation.type !== 'transit' || reservation.day_id !== dayId) continue
    const transit = parseMetadata(reservation)?.transit
    if (!transit || typeof transit !== 'object') continue
    const legs = Array.isArray(transit.legs) ? transit.legs as TransitMetadataLeg[] : []
    const walkLegs = legs
      .map((leg, index) => ({ leg, index }))
      .filter(({ leg }) => typeof leg?.mode === 'string' && leg.mode.trim().toUpperCase() === 'WALK')

    if (walkLegs.length > 0) {
      for (const { leg, index } of walkLegs) {
        const persistedDistance = metricOrNull(leg.distance)
        out.push({
          key: `transit-walk:${reservation.id}:${index}`,
          mode: 'walking',
          source: 'transit-walk',
          sourceId: `${reservation.id}:${index}`,
          durationSeconds: metricOrNull(leg.duration),
          distanceMeters: persistedDistance ?? transitGeometryDistance(leg),
        })
      }
      continue
    }

    const fallbackDuration = metricOrNull(transit.walk_seconds)
    if (fallbackDuration != null && fallbackDuration > 0) {
      out.push({
        key: `transit-walk:${reservation.id}:fallback`,
        mode: 'walking',
        source: 'transit-walk',
        sourceId: reservation.id,
        durationSeconds: fallbackDuration,
        distanceMeters: null,
      })
    }
  }
  return out
}

function parseTimeOfDayMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function assignmentDurationSeconds(assignment: Assignment): number | null {
  const start = parseTimeOfDayMinutes(assignment.place?.place_time)
  const end = parseTimeOfDayMinutes(assignment.place?.end_time)
  if (start == null || end == null || end <= start) return null
  return (end - start) * 60
}

export function createTrackContributions(
  dayId: number,
  assignments: Assignment[],
  places: Place[],
): MovementContribution[] {
  const fullPlaces = new Map(places.map(place => [place.id, place]))
  const out: MovementContribution[] = []
  for (const assignment of assignments) {
    if (assignment.day_id !== dayId) continue
    const placeId = assignment.place_id ?? assignment.place?.id
    if (placeId == null) continue
    const fullPlace = fullPlaces.get(placeId)
    if (!fullPlace?.route_geometry) continue
    const stats = calculateTrackStats(fullPlace.route_geometry)
    if (!stats) continue
    out.push({
      key: `track:${dayId}:${assignment.id}`,
      mode: normalizeMovementMode(fullPlace.transport_mode ?? assignment.place?.transport_mode),
      source: 'track',
      sourceId: assignment.id,
      durationSeconds: assignmentDurationSeconds(assignment),
      distanceMeters: stats.distanceMeters,
    })
  }
  return out
}

export interface CalculateDayMovementInput {
  dayId: number
  activeProfile: 'walking' | 'driving'
  routeLegs: Record<number, RouteSegment>
  hotelLegs?: HotelMovementLegs
  assignments: Assignment[]
  places: Place[]
  reservations: Reservation[]
  routeMetricsComplete: boolean
  routeMetricsExpected: boolean
}

export function calculateDayMovementStats(input: CalculateDayMovementInput): MovementTotal {
  const mode: MovementMode = input.activeProfile
  const contributions = [
    ...createRouteContributions(input.dayId, mode, input.routeLegs),
    ...createHotelBookendContributions(input.dayId, mode, input.hotelLegs),
    ...createTransitWalkContributions(input.dayId, input.reservations),
    ...createTrackContributions(input.dayId, input.assignments, input.places),
  ]
  if (input.routeMetricsExpected && !input.routeMetricsComplete) {
    contributions.push({
      key: `route:${input.dayId}:missing`,
      mode,
      source: 'route',
      sourceId: 'missing',
      durationSeconds: null,
      distanceMeters: null,
    })
  }
  return aggregateMovementContributions(mode, contributions)
}

function emptyTotal(mode: MovementMode): MovementTotal {
  return {
    mode,
    durationSeconds: 0,
    distanceMeters: 0,
    durationComplete: true,
    distanceComplete: true,
    contributionCount: 0,
  }
}

export function combineMovementTotals(
  totals: MovementTotal[],
): Record<MovementMode, MovementTotal> {
  const combined: Record<MovementMode, MovementTotal> = {
    walking: emptyTotal('walking'),
    driving: emptyTotal('driving'),
    cycling: emptyTotal('cycling'),
  }
  for (const total of totals) {
    const target = combined[total.mode]
    target.durationSeconds += total.durationSeconds
    target.distanceMeters += total.distanceMeters
    target.durationComplete = target.durationComplete && total.durationComplete
    target.distanceComplete = target.distanceComplete && total.distanceComplete
    target.contributionCount += total.contributionCount
  }
  return combined
}
