import type { RouteSegment } from '../../../src/types'
import {
  aggregateMovementContributions,
  createHotelBookendContributions,
  createRouteContributions,
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
