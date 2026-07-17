import { calculateTrackStats } from '../../../src/utils/trackStats'

describe('calculateTrackStats', () => {
  it('returns distance for a valid 2D track', () => {
    const stats = calculateTrackStats(JSON.stringify([[0, 0], [0, 0.01]]))
    expect(stats).not.toBeNull()
    expect(stats!.distanceMeters).toBeCloseTo(1111.95, 0)
    expect(stats!.hasElevation).toBe(false)
    expect(stats!.elevations).toEqual([])
  })

  it('returns elevation extrema, gain, and loss for a valid 3D track', () => {
    const stats = calculateTrackStats(JSON.stringify([
      [48.8584, 2.2945, 100],
      [48.86, 2.3, 120],
      [48.862, 2.305, 110],
      [48.864, 2.31, 130],
    ]))
    expect(stats).toMatchObject({
      hasElevation: true,
      minElevationMeters: 100,
      maxElevationMeters: 130,
      elevationGainMeters: 40,
      elevationLossMeters: 10,
    })
    expect(stats!.elevations).toEqual([100, 120, 110, 130])
  })

  it.each([
    null,
    '',
    '{bad json',
    '[]',
    '[[0,0]]',
    '[[0,0],[91,0]]',
    '[[0,0],[0,null]]',
  ])('returns null for malformed or unusable geometry %#', (geometry) => {
    expect(calculateTrackStats(geometry)).toBeNull()
  })
})
