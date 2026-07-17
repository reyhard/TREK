import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calculateRouteWithLegs } from '../../../src/components/Map/RouteCalculator'
import type {
  DayMovementPlan,
  MovementAnchor,
  PlannedRoutedPart,
  TrackMovementPart,
} from '../../../src/utils/dayMovementPlan'
import { resolveDayMovementPlan } from '../../../src/utils/resolveDayMovementPlan'
import type { RouteSegment } from '../../../src/types'

vi.mock('../../../src/components/Map/RouteCalculator', () => ({
  calculateRouteWithLegs: vi.fn(),
}))

const anchor = (lat: number, lng: number, assignmentId: number): MovementAnchor => ({
  lat,
  lng,
  assignmentId,
  placeId: assignmentId,
  source: 'place',
})

const routed = (key: string, from: MovementAnchor, to: MovementAnchor): PlannedRoutedPart => ({
  kind: 'routed',
  key,
  from,
  to,
  placement: { kind: 'after-assignment', assignmentId: from.assignmentId! },
})

const segment = (from: MovementAnchor, to: MovementAnchor, distance: number, duration: number): RouteSegment => ({
  from: [from.lat, from.lng],
  to: [to.lat, to.lng],
  mid: [(from.lat + to.lat) / 2, (from.lng + to.lng) / 2],
  distance,
  duration,
  walkingText: 'walking',
  drivingText: 'driving',
  distanceText: 'distance',
  durationText: 'duration',
})

const a = anchor(1, 1, 11)
const b = anchor(2, 2, 12)
const c = anchor(3, 3, 13)
const first = routed('a-b', a, b)
const second = routed('b-c', b, c)
const track: TrackMovementPart = {
  kind: 'track',
  key: 'track-b',
  assignmentId: 12,
  placeId: 12,
  from: { ...b, source: 'track-start' },
  to: { ...b, lat: 2.5, lng: 2.5, source: 'track-end' },
  geometry: [[2, 2], [2.5, 2.5]],
  elevations: [10, 20],
  distance: 750,
  minElevation: 10,
  maxElevation: 20,
  elevationGain: 10,
  elevationLoss: 0,
  mode: 'walking',
  duration: 540,
  durationSource: 'estimated',
}

const plan = (parts: DayMovementPlan['parts']): DayMovementPlan => ({
  dayId: 7,
  parts,
  hasRoutedConnectors: parts.some(part => part.kind === 'routed'),
  hasTracks: parts.some(part => part.kind === 'track'),
  hasTransit: parts.some(part => part.kind === 'transit'),
})

describe('resolveDayMovementPlan', () => {
  beforeEach(() => {
    vi.mocked(calculateRouteWithLegs).mockReset()
  })

  it('groups adjacent routed parts in one OSRM call and maps its legs back to each part', async () => {
    vi.mocked(calculateRouteWithLegs).mockResolvedValue({
      coordinates: [[1, 1], [2, 2], [3, 3]],
      distance: 3000,
      duration: 600,
      legs: [segment(a, b, 1000, 200), segment(b, c, 2000, 400)],
    })

    const resolved = await resolveDayMovementPlan(plan([first, second]), 'driving')

    expect(calculateRouteWithLegs).toHaveBeenCalledOnce()
    expect(calculateRouteWithLegs).toHaveBeenCalledWith(
      [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }],
      { signal: undefined, profile: 'driving' },
    )
    expect(resolved.routedPolylines).toEqual([[[1, 1], [2, 2], [3, 3]]])
    expect(resolved.parts[0]).toMatchObject({ kind: 'routed', key: 'a-b', distance: 1000, duration: 200 })
    expect(resolved.parts[1]).toMatchObject({ kind: 'routed', key: 'b-c', distance: 2000, duration: 400 })
  })

  it('splits routed groups at track parts', async () => {
    vi.mocked(calculateRouteWithLegs)
      .mockResolvedValueOnce({ coordinates: [[1, 1], [2, 2]], distance: 1, duration: 1, legs: [segment(a, b, 1, 1)] })
      .mockResolvedValueOnce({ coordinates: [[2.5, 2.5], [3, 3]], distance: 2, duration: 2, legs: [segment(track.to, c, 2, 2)] })
    const afterTrack = routed('track-c', track.to, c)

    await resolveDayMovementPlan(plan([first, track, afterTrack]), 'driving')

    expect(calculateRouteWithLegs).toHaveBeenCalledTimes(2)
    expect(calculateRouteWithLegs).toHaveBeenNthCalledWith(1, [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], expect.any(Object))
    expect(calculateRouteWithLegs).toHaveBeenNthCalledWith(2, [{ lat: 2.5, lng: 2.5 }, { lat: 3, lng: 3 }], expect.any(Object))
  })

  it('keeps the same track object and metrics across connector profiles', async () => {
    const driving = await resolveDayMovementPlan(plan([track]), 'driving')
    const walking = await resolveDayMovementPlan(plan([track]), 'walking')

    expect(driving.parts[0]).toBe(track)
    expect(walking.parts[0]).toBe(track)
    expect(walking.parts[0]).toMatchObject({ mode: 'walking', distance: 750, duration: 540 })
  })

  it('falls back to straight geometry and null connector stats after a non-abort failure', async () => {
    vi.mocked(calculateRouteWithLegs).mockRejectedValue(new Error('offline'))

    const resolved = await resolveDayMovementPlan(plan([first, second]), 'cycling')

    expect(resolved.routedPolylines).toEqual([[[1, 1], [2, 2], [3, 3]]])
    expect(resolved.parts.slice(0, 2)).toEqual([
      expect.objectContaining({ geometry: [[1, 1], [2, 2]], routeSegment: null, distance: null, duration: null }),
      expect.objectContaining({ geometry: [[2, 2], [3, 3]], routeSegment: null, distance: null, duration: null }),
    ])
  })

  it.each([
    ['empty', []],
    ['single-point', [[1, 1]]],
    ['non-finite', [[1, 1], [Number.NaN, 2]]],
  ])('falls back when OSRM returns %s coordinates', async (_label, coordinates) => {
    vi.mocked(calculateRouteWithLegs).mockResolvedValue({
      coordinates,
      distance: 3000,
      duration: 600,
      legs: [segment(a, b, 1000, 200), segment(b, c, 2000, 400)],
    })

    const resolved = await resolveDayMovementPlan(plan([first, second]), 'driving')

    expect(resolved.routedPolylines).toEqual([[[1, 1], [2, 2], [3, 3]]])
    expect(resolved.parts.slice(0, 2)).toEqual([
      expect.objectContaining({ routeSegment: null, distance: null, duration: null }),
      expect.objectContaining({ routeSegment: null, distance: null, duration: null }),
    ])
  })

  it('rethrows abort errors', async () => {
    const error = new DOMException('cancelled', 'AbortError')
    vi.mocked(calculateRouteWithLegs).mockRejectedValue(error)

    await expect(resolveDayMovementPlan(plan([first]), 'driving')).rejects.toBe(error)
  })

  it('rethrows a custom abort reason when the supplied signal is aborted', async () => {
    const controller = new AbortController()
    const reason = { code: 'superseded' }
    controller.abort(reason)
    vi.mocked(calculateRouteWithLegs).mockRejectedValue(reason)

    await expect(resolveDayMovementPlan(plan([first]), 'driving', controller.signal)).rejects.toBe(reason)
  })

  it('keeps a valid group polyline when fewer route legs are returned', async () => {
    vi.mocked(calculateRouteWithLegs).mockResolvedValue({
      coordinates: [[1, 1], [1.5, 1.5], [3, 3]],
      distance: 1000,
      duration: 200,
      legs: [segment(a, b, 1000, 200)],
    })

    const resolved = await resolveDayMovementPlan(plan([first, second]), 'driving')

    expect(resolved.routedPolylines).toEqual([[[1, 1], [1.5, 1.5], [3, 3]]])
    expect(resolved.parts[0]).toMatchObject({ routeSegment: expect.any(Object), distance: 1000, duration: 200 })
    expect(resolved.parts[1]).toMatchObject({ routeSegment: null, distance: null, duration: null })
  })

  it('exposes kind, owner, profile, endpoints, distance and duration on a routed metric part', async () => {
    vi.mocked(calculateRouteWithLegs).mockResolvedValue({
      coordinates: [[1, 1], [2, 2]],
      distance: 1000,
      duration: 200,
      legs: [segment(a, b, 1000, 200)],
    })

    const resolved = await resolveDayMovementPlan(plan([first]), 'walking')

    expect(resolved.parts[0]).toMatchObject({
      kind: 'routed',
      placement: { kind: 'after-assignment', assignmentId: 11 },
      profile: 'walking',
      from: { lat: 1, lng: 1 },
      to: { lat: 2, lng: 2 },
      distance: 1000,
      duration: 200,
    })
  })
})
