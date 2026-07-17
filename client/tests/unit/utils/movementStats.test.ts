import type { RouteSegment } from '../../../src/types'
import { buildAssignment, buildPlace, buildReservation } from '../../helpers/factories'
import {
  aggregateMovementContributions,
  calculateDayMovementStats,
  combineMovementTotals,
  createHotelBookendContributions,
  createRouteContributions,
  createTrackContributions,
  createTransitWalkContributions,
  normalizeMovementMode,
  type MovementContribution,
} from '../../../src/utils/movementStats'

function segment(distance: number, duration: number): RouteSegment {
  return {
    from: [0, 0],
    to: [0, 0.01],
    mid: [0, 0.005],
    distance,
    duration,
    distanceText: '',
    durationText: '',
    walkingText: '',
    drivingText: '',
  }
}

describe('movement aggregation core', () => {
  it.each([
    ['walking', 'walking'],
    [' WALKING ', 'walking'],
    ['driving', 'driving'],
    ['cycling', 'cycling'],
    ['bicycle', 'cycling'],
    ['transit', 'walking'],
    ['flight', 'walking'],
    ['', 'walking'],
    [undefined, 'walking'],
  ] as const)('normalizes %j to %s', (input, expected) => {
    expect(normalizeMovementMode(input)).toBe(expected)
  })

  it('creates one contribution per numeric route leg', () => {
    expect(createRouteContributions(10, 'walking', {
      100: segment(1200, 900),
      200: segment(800, 600),
    })).toEqual([
      expect.objectContaining({ key: 'route:10:100', source: 'route', mode: 'walking', distanceMeters: 1200, durationSeconds: 900 }),
      expect.objectContaining({ key: 'route:10:200', source: 'route', mode: 'walking', distanceMeters: 800, durationSeconds: 600 }),
    ])
  })

  it('creates separate top and bottom hotel bookend contributions', () => {
    expect(createHotelBookendContributions(10, 'driving', {
      top: segment(1000, 300),
      bottom: segment(1500, 420),
    })).toEqual([
      expect.objectContaining({ key: 'hotel-bookend:10:top', source: 'hotel-bookend', mode: 'driving' }),
      expect.objectContaining({ key: 'hotel-bookend:10:bottom', source: 'hotel-bookend', mode: 'driving' }),
    ])
  })

  it('deduplicates by key and sums only the selected mode', () => {
    const contributions: MovementContribution[] = [
      { key: 'a', source: 'route', sourceId: 1, mode: 'walking', durationSeconds: 600, distanceMeters: 1000 },
      { key: 'a', source: 'route', sourceId: 1, mode: 'walking', durationSeconds: 600, distanceMeters: 1000 },
      { key: 'b', source: 'route', sourceId: 2, mode: 'walking', durationSeconds: 300, distanceMeters: 500 },
      { key: 'c', source: 'route', sourceId: 3, mode: 'driving', durationSeconds: 120, distanceMeters: 2000 },
    ]
    expect(aggregateMovementContributions('walking', contributions)).toEqual({
      mode: 'walking',
      durationSeconds: 900,
      distanceMeters: 1500,
      durationComplete: true,
      distanceComplete: true,
      contributionCount: 2,
    })
  })

  it('rejects invalid metrics and marks that metric incomplete', () => {
    const total = aggregateMovementContributions('walking', [{
      key: 'bad',
      source: 'route',
      sourceId: 1,
      mode: 'walking',
      durationSeconds: Number.NaN,
      distanceMeters: -1,
    }])
    expect(total).toMatchObject({
      durationSeconds: 0,
      distanceMeters: 0,
      durationComplete: false,
      distanceComplete: false,
      contributionCount: 1,
    })
  })
})

describe('transit walking contributions', () => {
  it('includes WALK legs and excludes in-vehicle legs and walk_seconds duplication', () => {
    const reservation = buildReservation({
      id: 7,
      type: 'transit',
      day_id: 10,
      metadata: JSON.stringify({
        transit: {
          walk_seconds: 999,
          legs: [
            { mode: 'WALK', duration: 240, distance: 300 },
            { mode: 'SUBWAY', duration: 1200, distance: 8000 },
          ],
        },
      }),
    })
    expect(createTransitWalkContributions(10, [reservation])).toEqual([
      expect.objectContaining({
        key: 'transit-walk:7:0',
        durationSeconds: 240,
        distanceMeters: 300,
        mode: 'walking',
      }),
    ])
  })

  it('uses walk_seconds only when individual WALK legs are absent', () => {
    const reservation = buildReservation({
      id: 8,
      type: 'transit',
      day_id: 10,
      metadata: JSON.stringify({ transit: { walk_seconds: 420, legs: [{ mode: 'BUS', duration: 900 }] } }),
    })
    expect(createTransitWalkContributions(10, [reservation])).toEqual([
      expect.objectContaining({
        key: 'transit-walk:8:fallback',
        durationSeconds: 420,
        distanceMeters: null,
      }),
    ])
  })

  it('derives old WALK-leg distance from encoded geometry', () => {
    const reservation = buildReservation({
      id: 9,
      type: 'transit',
      day_id: 10,
      metadata: JSON.stringify({
        transit: {
          legs: [{
            mode: 'walk',
            duration: 600,
            geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
            geometry_precision: 5,
          }],
        },
      }),
    })
    const [contribution] = createTransitWalkContributions(10, [reservation])
    expect(contribution.distanceMeters).toBeGreaterThan(0)
    expect(contribution.durationSeconds).toBe(600)
  })

  it('keeps duration and marks distance missing when old data has no distance or geometry', () => {
    const reservation = buildReservation({
      id: 10,
      type: 'transit',
      day_id: 10,
      metadata: JSON.stringify({ transit: { legs: [{ mode: 'WALK', duration: 300 }] } }),
    })
    expect(createTransitWalkContributions(10, [reservation])[0]).toMatchObject({
      durationSeconds: 300,
      distanceMeters: null,
    })
  })

  it('attributes a multi-day transit journey only to its start day', () => {
    const reservation = buildReservation({
      id: 11,
      type: 'transit',
      day_id: 10,
      end_day_id: 11,
      metadata: JSON.stringify({ transit: { legs: [{ mode: 'WALK', duration: 300, distance: 400 }] } }),
    })
    expect(createTransitWalkContributions(10, [reservation])).toHaveLength(1)
    expect(createTransitWalkContributions(11, [reservation])).toEqual([])
  })

  it('ignores malformed transit metadata', () => {
    const reservation = buildReservation({ id: 12, type: 'transit', day_id: 10, metadata: '{bad json' })
    expect(createTransitWalkContributions(10, [reservation])).toEqual([])
  })
})

describe('track contributions', () => {
  it('uses full-place geometry and assignment-specific times', () => {
    const fullPlace = buildPlace({
      id: 20,
      route_geometry: JSON.stringify([[0, 0], [0, 0.01]]),
      transport_mode: 'walking',
    })
    const assignment = buildAssignment({
      id: 200,
      day_id: 10,
      place_id: 20,
      place: { ...fullPlace, route_geometry: undefined, place_time: '09:00', end_time: '10:30' } as any,
    })
    expect(createTrackContributions(10, [assignment], [fullPlace])).toEqual([
      expect.objectContaining({
        key: 'track:10:200',
        mode: 'walking',
        durationSeconds: 5400,
        distanceMeters: expect.any(Number),
      }),
    ])
  })

  it('defaults an unsupported track mode to walking', () => {
    const fullPlace = buildPlace({
      id: 21,
      route_geometry: JSON.stringify([[0, 0], [0, 0.01]]),
      transport_mode: 'flight',
    })
    const assignment = buildAssignment({ id: 201, day_id: 10, place_id: 21, place: { ...fullPlace, place_time: null, end_time: null } as any })
    expect(createTrackContributions(10, [assignment], [fullPlace])[0]).toMatchObject({
      mode: 'walking',
      durationSeconds: null,
    })
  })

  it('does not use duration_minutes when assignment end time is absent', () => {
    const fullPlace = buildPlace({
      id: 22,
      route_geometry: JSON.stringify([[0, 0], [0, 0.01]]),
      duration_minutes: 120,
    })
    const assignment = buildAssignment({ id: 202, day_id: 10, place_id: 22, place: { ...fullPlace, place_time: '09:00', end_time: null } as any })
    expect(createTrackContributions(10, [assignment], [fullPlace])[0].durationSeconds).toBeNull()
  })

  it('excludes a walking track from driving aggregation', () => {
    const fullPlace = buildPlace({ id: 23, route_geometry: JSON.stringify([[0, 0], [0, 0.01]]), transport_mode: 'walking' })
    const assignment = buildAssignment({ id: 203, day_id: 10, place_id: 23, place: { ...fullPlace, place_time: '09:00', end_time: '10:00' } as any })
    const driving = calculateDayMovementStats({
      dayId: 10,
      activeProfile: 'driving',
      routeLegs: {},
      assignments: [assignment],
      places: [fullPlace],
      reservations: [],
      routeMetricsComplete: true,
      routeMetricsExpected: false,
    })
    expect(driving.contributionCount).toBe(0)
  })
})

describe('calculateDayMovementStats', () => {
  it('combines route, hotel, transit walking, and matching track activity', () => {
    const fullPlace = buildPlace({ id: 30, route_geometry: JSON.stringify([[0, 0], [0, 0.01]]), transport_mode: 'walking' })
    const assignment = buildAssignment({ id: 300, day_id: 10, place_id: 30, place: { ...fullPlace, place_time: '09:00', end_time: '10:00' } as any })
    const reservation = buildReservation({
      id: 31,
      type: 'transit',
      day_id: 10,
      metadata: JSON.stringify({ transit: { legs: [{ mode: 'WALK', duration: 300, distance: 400 }] } }),
    })
    const total = calculateDayMovementStats({
      dayId: 10,
      activeProfile: 'walking',
      routeLegs: { 1: segment(1000, 600) },
      hotelLegs: { top: segment(500, 300), bottom: segment(500, 300) },
      assignments: [assignment],
      places: [fullPlace],
      reservations: [reservation],
      routeMetricsComplete: true,
      routeMetricsExpected: true,
    })
    expect(total.durationSeconds).toBe(5100)
    expect(total.distanceMeters).toBeGreaterThan(3400)
    expect(total).toMatchObject({ durationComplete: true, distanceComplete: true, contributionCount: 5 })
  })

  it('marks both route metrics incomplete when planned route calculation is partial', () => {
    const total = calculateDayMovementStats({
      dayId: 10,
      activeProfile: 'walking',
      routeLegs: { 1: segment(1000, 600) },
      assignments: [],
      places: [],
      reservations: [],
      routeMetricsComplete: false,
      routeMetricsExpected: true,
    })
    expect(total).toMatchObject({
      durationSeconds: 600,
      distanceMeters: 1000,
      durationComplete: false,
      distanceComplete: false,
    })
  })

  it('combines already-calculated day totals by mode for future trip totals', () => {
    const combined = combineMovementTotals([
      { mode: 'walking', durationSeconds: 600, distanceMeters: 1000, durationComplete: true, distanceComplete: true, contributionCount: 1 },
      { mode: 'walking', durationSeconds: 300, distanceMeters: 400, durationComplete: false, distanceComplete: true, contributionCount: 1 },
      { mode: 'driving', durationSeconds: 1200, distanceMeters: 10_000, durationComplete: true, distanceComplete: true, contributionCount: 1 },
    ])
    expect(combined.walking).toEqual({
      mode: 'walking',
      durationSeconds: 900,
      distanceMeters: 1400,
      durationComplete: false,
      distanceComplete: true,
      contributionCount: 2,
    })
    expect(combined.driving.distanceMeters).toBe(10_000)
    expect(combined.cycling.contributionCount).toBe(0)
  })
})
