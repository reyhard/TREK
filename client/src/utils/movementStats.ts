import type { RouteSegment } from '../types'

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
