import { describe, expect, it } from 'vitest'
import { calculateTrackStats, getTrackMovement, normalizeTrackMode, parseTrackGeometry } from '../../../src/utils/trackGeometry'
import { calculatePolylineDistanceMeters } from '../../../src/utils/geoDistance'

describe('calculateTrackStats — TDD 2 (track statistics)', () => {
  it('computes distance and elevation profile from route_geometry', () => {
    const stats = calculateTrackStats(JSON.stringify([[52, 5, 100], [52.01, 5.01, 120], [52.02, 5.02, 110]]))
    expect(stats).not.toBeNull()
    expect(stats!.distanceMeters).toBeGreaterThan(0)
    expect(stats!.hasElevation).toBe(true)
    expect(stats!.minElevationMeters).toBe(100)
    expect(stats!.maxElevationMeters).toBe(120)
    // 100 → 120 is +20 gain, 120 → 110 is -10 loss.
    expect(stats!.elevationGainMeters).toBeCloseTo(20, 6)
    expect(stats!.elevationLossMeters).toBeCloseTo(10, 6)
  })

  it('handles coordinate-only geometry without elevation', () => {
    const stats = calculateTrackStats(JSON.stringify([[52, 5], [52.01, 5.01]]))
    expect(stats!.hasElevation).toBe(false)
    expect(stats!.minElevationMeters).toBeNull()
    expect(stats!.distanceMeters).toBeGreaterThan(0)
  })

  it('returns null for missing or malformed geometry', () => {
    expect(calculateTrackStats(null)).toBeNull()
    expect(calculateTrackStats('not json')).toBeNull()
    expect(calculateTrackStats('[]')).toBeNull()
  })

  it('filters invalid coordinate rows while preserving valid elevation statistics', () => {
    const parsed = parseTrackGeometry(JSON.stringify([
      [52, 5, 10],
      [null, 5.005, 999],
      [52, 5.01, 25],
      [52, 5.02, 20],
    ]))

    expect(parsed?.coordinates).toEqual([[52, 5], [52, 5.01], [52, 5.02]])
    expect(parsed?.elevationGain).toBe(15)
    expect(parsed?.elevationLoss).toBe(5)
    expect(parsed?.minElevation).toBe(10)
    expect(parsed?.maxElevation).toBe(25)
  })

  it('filters coordinates outside the geographic bounds', () => {
    const parsed = parseTrackGeometry(JSON.stringify([
      [52, 5],
      [91, 5.01],
      [52, 5.02],
    ]))

    expect(parsed?.coordinates).toEqual([[52, 5], [52, 5.02]])
  })
})

describe('getTrackMovement — TDD 2 (track contribution)', () => {
  it('scheduled times win over the estimated duration', () => {
    const m = getTrackMovement({
      id: 1, route_geometry: JSON.stringify([[52, 5], [52.01, 5.01]]),
      place_time: '09:00', end_time: '09:45', transport_mode: 'walking',
    })
    expect(m!.duration).toBe(2700)
    expect(m!.durationSource).toBe('poi-times')
  })

  it('estimates from the mode speed when times are absent', () => {
    const walking = getTrackMovement({ id: 1, route_geometry: JSON.stringify([[52, 5], [52.01, 5.01]]) })
    const driving = getTrackMovement({ id: 1, route_geometry: JSON.stringify([[52, 5], [52.01, 5.01]]), transport_mode: 'driving' })
    expect(driving!.mode).toBe('driving')
    expect(driving!.duration).toBeLessThan(walking!.duration)
  })

  it('normalizes track modes', () => {
    expect(normalizeTrackMode('cycling')).toBe('cycling')
    expect(normalizeTrackMode('bike')).toBe('cycling')
    expect(normalizeTrackMode('car')).toBe('driving')
    expect(normalizeTrackMode('hike')).toBe('walking')
  })
})

describe('geoDistance — pure polyline distance', () => {
  it('sums haversine segment distances for a polyline', () => {
    const d = calculatePolylineDistanceMeters([[52, 5], [52.01, 5.01], [52.02, 5.02]])
    expect(d).toBeGreaterThan(0)
    expect(calculatePolylineDistanceMeters([[52, 5]])).toBeNull()
    expect(calculatePolylineDistanceMeters([[] as unknown as number[]])).toBeNull()
  })
})
