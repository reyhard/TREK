import { calculatePolylineDistanceMeters, decodePolyline } from '../../../src/utils/polyline'

describe('polyline helpers', () => {
  it('decodes a standard Google encoded polyline', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ])
  })

  it('calculates Haversine distance for valid coordinates', () => {
    const distance = calculatePolylineDistanceMeters([[0, 0], [0, 0.01]])
    expect(distance).not.toBeNull()
    expect(distance!).toBeCloseTo(1111.95, 0)
  })

  it.each([
    [],
    [[0, 0]],
    [[Number.NaN, 0], [0, 1]],
    [[91, 0], [0, 1]],
    [[0, 181], [0, 1]],
  ])('rejects an unusable coordinate sequence %#', (points) => {
    expect(calculatePolylineDistanceMeters(points as unknown as readonly (readonly number[])[])).toBeNull()
  })
})
