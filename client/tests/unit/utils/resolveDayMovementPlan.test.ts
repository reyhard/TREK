import { describe, expect, it, vi } from 'vitest'
import { resolveDayMovementPlan } from '../../../src/utils/resolveDayMovementPlan'
import type { DayMovementPlan } from '../../../src/utils/dayMovementPlan'

vi.mock('../../../src/components/Map/RouteCalculator', () => ({
  calculateRouteWithLegs: vi.fn(async (waypoints: { lat: number; lng: number }[], options?: { profile?: string }) => ({
    coordinates: waypoints.map(point => [point.lat, point.lng] as [number, number]),
    distance: 100,
    duration: 60,
    legs: waypoints.slice(0, -1).map((from, index) => ({
      mid: [from.lat, from.lng] as [number, number],
      from: [from.lat, from.lng] as [number, number],
      to: [waypoints[index + 1]!.lat, waypoints[index + 1]!.lng] as [number, number],
      distance: 100,
      duration: 60,
      distanceText: '100 m',
      durationText: '1 min',
      walkingText: '1 min',
      drivingText: '1 min',
      mode: options?.profile,
    })),
  })),
}))

const anchor = (lat: number, lng: number, extra: Record<string, unknown> = {}) => ({
  lat,
  lng,
  source: 'place' as const,
  isPlace: true,
  ...extra,
})

describe('resolveDayMovementPlan — TDD 4 (canonical per-leg modes)', () => {
  it('routes adjacent connectors in mode-resolved groups and tags each segment', async () => {
    const plan: DayMovementPlan = {
      dayId: 1,
      hasRoutedConnectors: true,
      hasTracks: false,
      hasTransit: false,
      parts: [
        {
          kind: 'routed',
          key: 'one',
          from: anchor(1, 1, { leg_transport_mode: 'walking' }),
          to: anchor(2, 2),
          placement: { kind: 'after-assignment', assignmentId: 10 },
        },
        {
           kind: 'routed',
           key: 'two',
           // A non-place arrival anchor uses the destination's incoming mode;
           // this is the other branch of the canonical resolver.
           from: anchor(2, 2, { source: 'transport-to', isPlace: false }),
          to: anchor(3, 3, { incoming_leg_transport_mode: 'cycling' }),
          placement: { kind: 'after-assignment', assignmentId: 11 },
        },
      ],
    }

    const resolved = await resolveDayMovementPlan(plan, 'driving')
    const routed = resolved.parts.filter(part => part.kind === 'routed')

    expect(routed.map(part => part.profile)).toEqual(['walking', 'cycling'])
    expect(routed.map(part => part.routeSegment?.mode)).toEqual(['walking', 'cycling'])
    expect(resolved.routedPolylines).toHaveLength(2)
  })
})
