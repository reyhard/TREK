import { describe, expect, it } from 'vitest'
import {
  aggregateMovementContributions,
  calculateDayMovementTotals,
  calculateDayMovementStats,
  combineMovementTotals,
  createRouteContributions,
  createTrackContributions,
  createTransitWalkContributions,
  normalizeMovementMode,
  type MovementContribution,
} from '../../../src/utils/movementStats'

const assignment = (id: number, dayId: number, place: { id: number; route_geometry?: string | null; transport_mode?: string | null; place_time?: string | null; end_time?: string | null }) => ({
  id, day_id: dayId, place_id: place.id, order_index: 0, place,
} as any)

describe('movement aggregation core — TDD 3 (connector contribution by mode)', () => {
  it('normalizes a resolved per-leg mode to the movement modes', () => {
    expect(normalizeMovementMode('driving')).toBe('driving')
    expect(normalizeMovementMode('car')).toBe('driving')
    expect(normalizeMovementMode('bicycle')).toBe('cycling')
    expect(normalizeMovementMode('WALK')).toBe('walking')
  })

  it('creates one contribution per numeric route leg and sums by mode', () => {
    const legs = { 1: { duration: 600, distance: 1000 } as any, 2: { duration: 300, distance: 500 } as any }
    const contributions = createRouteContributions(7, 'walking', legs)
    expect(contributions).toHaveLength(2)
    const total = aggregateMovementContributions('walking', contributions)
    expect(total.durationSeconds).toBe(900)
    expect(total.distanceMeters).toBe(1500)
    expect(total.contributionCount).toBe(2)
  })

  it('uses each resolved route leg mode instead of attributing every leg to the active profile', () => {
    const legs = {
      1: { duration: 600, distance: 1000, mode: 'walking' } as any,
      2: { duration: 300, distance: 500, mode: 'driving' } as any,
    }

    expect(createRouteContributions(7, 'driving', legs).map(contribution => contribution.mode))
      .toEqual(['walking', 'driving'])
    expect(aggregateMovementContributions('walking', createRouteContributions(7, 'driving', legs)).distanceMeters)
      .toBe(1000)
    expect(aggregateMovementContributions('driving', createRouteContributions(7, 'driving', legs)).distanceMeters)
      .toBe(500)
  })

  it('deduplicates by key and sums only the selected mode', () => {
    const dup: MovementContribution[] = [
      { key: 'route:7:1', mode: 'walking', source: 'route', sourceId: 1, durationSeconds: 600, distanceMeters: 1000 },
      { key: 'route:7:1', mode: 'walking', source: 'route', sourceId: 1, durationSeconds: 600, distanceMeters: 1000 },
      { key: 'route:7:2', mode: 'driving', source: 'route', sourceId: 2, durationSeconds: 60, distanceMeters: 500 },
    ]
    const walking = aggregateMovementContributions('walking', dup)
    expect(walking.contributionCount).toBe(1)
    expect(walking.durationSeconds).toBe(600)
    const driving = aggregateMovementContributions('driving', dup)
    expect(driving.contributionCount).toBe(1)
    expect(driving.durationSeconds).toBe(60)
  })

  it('marks a metric incomplete when a contribution lacks it', () => {
    const total = aggregateMovementContributions('walking', [
      { key: 'route:7:1', mode: 'walking', source: 'route', sourceId: 1, durationSeconds: null, distanceMeters: 1000 },
    ])
    expect(total.durationComplete).toBe(false)
    expect(total.distanceComplete).toBe(true)
  })
})

describe('track contributions — TDD 2 (track distance/duration exactly once)', () => {
  it('uses the authoritative full place for geometry, timing, and mode', () => {
    const t = {
      id: 3, route_geometry: JSON.stringify([[52, 5], [52.01, 5.01]]),
      place_time: '10:00', end_time: '11:00', transport_mode: 'walking',
    }
    const contributions = createTrackContributions(7, [assignment(11, 7, t)], [t as never])
    expect(contributions).toHaveLength(1)
    expect(contributions[0]!.mode).toBe('walking')
    expect(contributions[0]!.durationSeconds).toBe(3600)
    expect(contributions[0]!.distanceMeters).toBeGreaterThan(0)
  })

  it('defaults an unsupported track mode to walking', () => {
    const t = { id: 3, route_geometry: JSON.stringify([[52, 5], [52.01, 5.01]]), transport_mode: 'sky-diving' }
    const contributions = createTrackContributions(7, [assignment(11, 7, t)], [t as never])
    expect(contributions[0]!.mode).toBe('walking')
  })

  it('contributes exactly one track part even with a full place list', () => {
    const t = { id: 3, route_geometry: JSON.stringify([[52, 5], [52.01, 5.01]]), transport_mode: 'cycling' }
    const full = { ...t, trip_id: 1, name: 'Track', lat: 52, lng: 5, place_time: null, end_time: null }
    const contributions = createTrackContributions(7, [assignment(11, 7, t)], [full as never])
    expect(contributions).toHaveLength(1)
    expect(contributions[0]!.mode).toBe('cycling')
  })
})

describe('transit walking contributions — TDD 5 (transit legs in a mixed day)', () => {
  const walkLeg = { mode: 'WALK', duration: 600, distance: 800 }
  const railLeg = { mode: 'RAIL', duration: 1800, distance: 25000 }
const reservation = (id: number, legs: unknown[], extra = {}) => ({
  id, trip_id: 1, type: 'transit', title: `R${id}`, day_id: 7, end_day_id: 7, status: 'confirmed',
  metadata: { transit: { legs, walk_seconds: 600 } }, ...extra,
} as any)

  it('includes WALK legs and excludes in-vehicle legs and walk_seconds duplication', () => {
    const contributions = createTransitWalkContributions(7, [reservation(20, [walkLeg, railLeg])])
    expect(contributions).toHaveLength(1)
    expect(contributions[0]!.mode).toBe('walking')
    expect(contributions[0]!.durationSeconds).toBe(600)
    expect(contributions[0]!.distanceMeters).toBe(800)
  })

  it('uses walk_seconds only when individual WALK legs are absent', () => {
    const contributions = createTransitWalkContributions(7, [reservation(21, [railLeg])])
    expect(contributions).toHaveLength(1)
    expect(contributions[0]!.key).toContain('fallback')
    expect(contributions[0]!.durationSeconds).toBe(600)
  })

  it('attributes a multi-day transit journey only to its start day', () => {
    const r = { ...reservation(22, [walkLeg]), day_id: 10 }
    expect(createTransitWalkContributions(10, [r])).toHaveLength(1)
    expect(createTransitWalkContributions(11, [r])).toEqual([])
  })
})

describe('calculateDayMovementStats + combineMovementTotals — TDD 5 (mixed day totals)', () => {
  it('returns independent totals for every movement mode', () => {
    const totals = calculateDayMovementTotals({
      dayId: 7,
      activeProfile: 'driving',
      routeLegs: {
        1: { duration: 300, distance: 1000, mode: 'driving' } as any,
        2: { duration: 600, distance: 800, mode: 'walking' } as any,
      },
      hotelLegs: { top: { duration: 120, distance: 500 } as any },
      assignments: [],
      places: [],
      reservations: [],
      routeMetricsComplete: true,
      routeMetricsExpected: true,
    })

    expect(totals.driving.distanceMeters).toBe(1500)
    expect(totals.walking.distanceMeters).toBe(800)
    expect(totals.cycling.contributionCount).toBe(0)
  })

  it('combines route + transit-walk + track without double counting', () => {
    const t = { id: 3, route_geometry: JSON.stringify([[52, 5], [52.01, 5.01]]), place_time: '10:00', end_time: '11:00', transport_mode: 'walking' }
    const transit = { id: 30, trip_id: 1, type: 'transit', day_id: 7, end_day_id: 7, status: 'confirmed', metadata: { transit: { legs: [{ mode: 'WALK', duration: 600, distance: 800 }] } } }
    const driving = calculateDayMovementStats({
      dayId: 7,
      activeProfile: 'driving',
      routeLegs: { 1: { duration: 300, distance: 1000 } as any },
      assignments: [assignment(11, 7, t)],
      places: [t as never],
      reservations: [transit as any],
      routeMetricsComplete: true,
      routeMetricsExpected: true,
    })
    const walking = calculateDayMovementStats({
      dayId: 7,
      activeProfile: 'walking',
      routeLegs: {},
      assignments: [assignment(11, 7, t)],
      places: [t as never],
      reservations: [transit as any],
      routeMetricsComplete: true,
      routeMetricsExpected: false,
    })
    const combined = combineMovementTotals([driving, walking])
    // Driving = the one route leg; walking = track (3600s) + transit-walk (600s).
    expect(combined.driving.distanceMeters).toBe(1000)
    expect(combined.walking.durationSeconds).toBe(3600 + 600)
    expect(combined.walking.contributionCount).toBe(2)
  })

  it('flags incomplete route metrics when the route did not resolve', () => {
    const total = calculateDayMovementStats({
      dayId: 7,
      activeProfile: 'driving',
      routeLegs: {},
      assignments: [],
      places: [],
      reservations: [],
      routeMetricsComplete: false,
      routeMetricsExpected: true,
    })
    expect(total.durationComplete).toBe(false)
  })

  it('uses only transit reservations represented by canonical movement parts', () => {
    const included = { id: 31, type: 'transit', day_id: 7, metadata: { transit: { legs: [{ mode: 'WALK', duration: 600, distance: 800 }] } } } as any
    const excluded = { id: 32, type: 'transit', day_id: 7, metadata: { transit: { legs: [{ mode: 'WALK', duration: 600, distance: 800 }] } } } as any
    const totals = calculateDayMovementTotals({
      dayId: 7,
      activeProfile: 'walking',
      routeLegs: {},
      assignments: [],
      places: [],
      reservations: [included, excluded],
      movementParts: [{ kind: 'transit', key: 'transit:reservation-31', reservationId: 31 }],
      routeMetricsComplete: true,
      routeMetricsExpected: false,
    })

    expect(totals.walking.distanceMeters).toBe(800)
    expect(totals.walking.contributionCount).toBe(1)
  })
})
