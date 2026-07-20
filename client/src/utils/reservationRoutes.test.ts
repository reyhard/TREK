import { describe, it, expect } from 'vitest'
import { isRoutableReservation, visibleRouteReservations, visibleReservationEndpointPoints } from './reservationRoutes'
import type { Reservation, ReservationEndpoint } from '../types'

function endpoint(role: 'from' | 'to', lat: number, lng: number): ReservationEndpoint {
  return { role, sequence: role === 'from' ? 0 : 1, name: role, code: null, lat, lng, timezone: null, local_time: null, local_date: null }
}

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 1, trip_id: 1, title: 'Flight', type: 'flight', status: 'confirmed',
    reservation_time: null, reservation_end_time: null, location: null,
    confirmation_number: null, notes: null, url: null,
    ...overrides,
  } as Reservation
}

describe('isRoutableReservation', () => {
  it('is false with no endpoints', () => {
    expect(isRoutableReservation(reservation())).toBe(false)
  })

  it('is false with a single endpoint', () => {
    expect(isRoutableReservation(reservation({ endpoints: [endpoint('from', 1, 2)] }))).toBe(false)
  })

  it('is true with 2+ endpoints', () => {
    expect(isRoutableReservation(reservation({ endpoints: [endpoint('from', 1, 2), endpoint('to', 3, 4)] }))).toBe(true)
  })
})

describe('visibleRouteReservations', () => {
  const twoStop = [endpoint('from', 1, 2), endpoint('to', 3, 4)]

  it('includes a transit reservation only when showTransitRoutes is on', () => {
    const r = reservation({ id: 1, type: 'transit', endpoints: twoStop })
    expect(visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: false })).toEqual([])
    expect(visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: true })).toEqual([r])
  })

  it('includes a reservation whose id is in visibleConnectionIds regardless of type', () => {
    const r = reservation({ id: 5, type: 'flight', endpoints: twoStop })
    expect(visibleRouteReservations([r], { visibleConnectionIds: [5], showTransitRoutes: false })).toEqual([r])
  })

  it('excludes a routable reservation when neither rule applies', () => {
    const r = reservation({ id: 7, type: 'flight', endpoints: twoStop })
    expect(visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: false })).toEqual([])
  })

  it('does not duplicate a reservation matched by both rules', () => {
    const r = reservation({ id: 10, type: 'transit', endpoints: twoStop })
    const result = visibleRouteReservations([r], { visibleConnectionIds: [10], showTransitRoutes: true })
    expect(result).toEqual([r])
  })
})

describe('visibleReservationEndpointPoints', () => {
  const endpoints = [endpoint('from', 1, 2), endpoint('to', 3, 4)]

  it('returns endpoint coordinates for visible reservations', () => {
    const r = reservation({ id: 1, type: 'flight', endpoints })
    const points = visibleReservationEndpointPoints([r], { visibleConnectionIds: [1], showTransitRoutes: false })
    expect(points).toEqual([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }])
  })

  it('excludes hidden reservations', () => {
    const r = reservation({ id: 1, type: 'flight', endpoints })
    const points = visibleReservationEndpointPoints([r], { visibleConnectionIds: [], showTransitRoutes: false })
    expect(points).toEqual([])
  })

  it('includes transit when showTransitRoutes is true', () => {
    const r = reservation({ id: 1, type: 'transit', endpoints })
    const points = visibleReservationEndpointPoints([r], { visibleConnectionIds: [], showTransitRoutes: true })
    expect(points).toEqual([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }])
  })

  it('filters out non-finite coordinates', () => {
    const nanEndpoint = { ...endpoints[0], lat: NaN, lng: NaN } as ReservationEndpoint
    const r = reservation({ id: 1, type: 'flight', endpoints: [nanEndpoint, endpoints[1]] })
    const points = visibleReservationEndpointPoints([r], { visibleConnectionIds: [1], showTransitRoutes: false })
    expect(points).toEqual([{ lat: 3, lng: 4 }])
  })

  it('preserves zero coordinates as valid', () => {
    const zeroEndpoint = endpoint('from', 0, 0)
    const r = reservation({ id: 1, type: 'flight', endpoints: [zeroEndpoint, endpoints[1]] })
    const points = visibleReservationEndpointPoints([r], { visibleConnectionIds: [1], showTransitRoutes: false })
    expect(points).toEqual([{ lat: 0, lng: 0 }, { lat: 3, lng: 4 }])
  })
})
