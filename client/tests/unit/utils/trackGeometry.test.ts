import { describe, expect, it } from 'vitest'

import {
  getTrackMovement,
  normalizeTrackMode,
  parseTrackGeometry,
} from '../../../src/utils/trackGeometry'

describe('trackGeometry', () => {
  it('parses coordinates and calculates distance/elevation', () => {
    const parsed = parseTrackGeometry(JSON.stringify([
      [52, 5, 10],
      [52, 5.01, 25],
      [52, 5.02, 20],
    ]))

    expect(parsed).not.toBeNull()
    expect(parsed?.coordinates).toEqual([
      [52, 5],
      [52, 5.01],
      [52, 5.02],
    ])
    expect(parsed?.distance).toBeGreaterThan(1300)
    expect(parsed?.distance).toBeLessThan(1400)
    expect(parsed?.elevationGain).toBe(15)
    expect(parsed?.elevationLoss).toBe(5)
    expect(parsed?.minElevation).toBe(10)
    expect(parsed?.maxElevation).toBe(25)
  })

  it('filters invalid rows when at least two valid coordinates remain', () => {
    const parsed = parseTrackGeometry(JSON.stringify([
      [52, 5],
      [null, 5.005],
      [52, 5.01],
    ]))

    expect(parsed?.coordinates).toEqual([
      [52, 5],
      [52, 5.01],
    ])
    expect(parsed?.distance).toBeGreaterThan(680)
    expect(parsed?.distance).toBeLessThan(690)
  })

  it('filters rows with non-numeric (string) coordinates', () => {
    const parsed = parseTrackGeometry(JSON.stringify([
      [48.8584, 2.2945, 100],
      ['invalid', 2.2975, 999],
      [48.86, 2.3, 120],
      [48.862, 2.305, 110],
      [48.864, 2.31, 130],
    ]))

    expect(parsed?.coordinates).toEqual([
      [48.8584, 2.2945],
      [48.86, 2.3],
      [48.862, 2.305],
      [48.864, 2.31],
    ])
    expect(parsed?.distance).toBeGreaterThan(0)
    expect(parsed?.minElevation).toBe(100)
    expect(parsed?.maxElevation).toBe(130)
  })

  it.each([
    null,
    '',
    'not-json',
    '[]',
    JSON.stringify([[52, 5]]),
    JSON.stringify([[null, 5], [52, 5]]),
  ])('rejects malformed or insufficient geometry: %s', (raw) => {
    expect(parseTrackGeometry(raw)).toBeNull()
  })

  it('uses a positive POI interval', () => {
    const movement = getTrackMovement({
      id: 9,
      route_geometry: JSON.stringify([[52, 5], [52, 5.01]]),
      place_time: '09:15',
      end_time: '11:45',
      transport_mode: 'walking',
    })
    expect(movement?.duration).toBe(2.5 * 3600)
    expect(movement?.durationSource).toBe('poi-times')
  })

  it.each([
    { place_time: null, end_time: null },
    { place_time: '09:00', end_time: null },
    { place_time: '12:00', end_time: '09:00' },
    { place_time: '09:00', end_time: '09:00' },
  ])('estimates invalid or missing intervals: %o', (times) => {
    const movement = getTrackMovement({
      id: 10,
      route_geometry: JSON.stringify([[52, 5], [52, 5.01]]),
      transport_mode: 'walking',
      ...times,
    })
    expect(movement?.durationSource).toBe('estimated')
    expect(movement?.duration).toBeGreaterThan(0)
  })

  it('normalizes modes and defaults unknown to walking', () => {
    expect(normalizeTrackMode('walking')).toBe('walking')
    expect(normalizeTrackMode('bike')).toBe('cycling')
    expect(normalizeTrackMode('bicycle')).toBe('cycling')
    expect(normalizeTrackMode('car')).toBe('driving')
    expect(normalizeTrackMode('spaceship')).toBe('walking')
    expect(normalizeTrackMode(null)).toBe('walking')
  })

  it('uses track mode for fallback duration', () => {
    const geometry = JSON.stringify([[52, 5], [52, 5.01]])
    const walking = getTrackMovement({
      id: 1,
      route_geometry: geometry,
      transport_mode: 'walking',
    })
    const cycling = getTrackMovement({
      id: 2,
      route_geometry: geometry,
      transport_mode: 'cycling',
    })
    expect(walking?.duration).toBeGreaterThan(cycling?.duration ?? Infinity)
  })
})
