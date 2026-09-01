import { describe, expect, it } from 'vitest'
import type { Day, Reservation, ReservationEndpoint } from '../types'
import { isRoutableReservation, visibleReservationEndpointPoints, visibleRouteReservations } from './reservationRoutes'

function endpoint(role: 'from' | 'to', lat: number, lng: number): ReservationEndpoint {
  return {
    role,
    sequence: role === 'from' ? 0 : 1,
    name: role,
    code: null,
    lat,
    lng,
    timezone: null,
    local_time: null,
    local_date: null,
  }
}

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 1,
    trip_id: 1,
    title: 'Flight',
    type: 'flight',
    status: 'confirmed',
    reservation_time: null,
    reservation_end_time: null,
    location: null,
    confirmation_number: null,
    notes: null,
    url: null,
    ...overrides,
  } as Reservation
}

const twoStop = [endpoint('from', 1, 2), endpoint('to', 3, 4)]
const days = [
  { id: 10, trip_id: 1, day_number: 1 },
  { id: 11, trip_id: 1, day_number: 2 },
  { id: 20, trip_id: 1, day_number: 3 },
] as Day[]

describe('isRoutableReservation', () => {
  it('is false with no endpoints', () => {
    expect(isRoutableReservation(reservation())).toBe(false)
  })

  it('is false with a single endpoint', () => {
    expect(isRoutableReservation(reservation({ endpoints: [endpoint('from', 1, 2)] }))).toBe(false)
  })

  it('is true with two or more endpoints', () => {
    expect(isRoutableReservation(reservation({ endpoints: twoStop }))).toBe(true)
  })

  it('is total for missing reservation values', () => {
    expect(isRoutableReservation(null)).toBe(false)
    expect(isRoutableReservation(undefined)).toBe(false)
  })
})

describe('visibleRouteReservations', () => {
  it('includes transit only when routing is on and the journey runs on the selected day', () => {
    const transit = reservation({ id: 1, type: 'transit', day_id: 10, endpoints: twoStop })
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [], showTransitRoutes: false, selectedDayId: 10, days,
    })).toEqual([])
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 10, days,
    })).toEqual([transit])
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 20, days,
    })).toEqual([])
  })

  it('keeps non-transit visibility controlled by connection ids', () => {
    const flight = reservation({ id: 5, type: 'flight', endpoints: twoStop, day_id: 10 })
    expect(visibleRouteReservations([flight], {
      visibleConnectionIds: [5], showTransitRoutes: false, selectedDayId: 20, days,
    })).toEqual([flight])
    expect(visibleRouteReservations([flight], {
      visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 10, days,
    })).toEqual([])
  })

  it('does not let visible connection ids reveal transit while routing is off', () => {
    const transit = reservation({ id: 5, type: 'transit', day_id: 10, endpoints: twoStop })
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [5], showTransitRoutes: false, selectedDayId: 10, days,
    })).toEqual([])
  })

  it('keeps an overnight journey on both covered days', () => {
    const transit = reservation({ id: 1, type: 'transit', day_id: 10, end_day_id: 11, endpoints: twoStop })
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 10, days,
    })).toEqual([transit])
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 11, days,
    })).toEqual([transit])
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 20, days,
    })).toEqual([])
  })

  it('uses day order rather than numeric day ids', () => {
    const reordered = [
      { id: 20, trip_id: 1, day_number: 1 },
      { id: 11, trip_id: 1, day_number: 2 },
      { id: 10, trip_id: 1, day_number: 3 },
    ] as Day[]
    const transit = reservation({ id: 1, type: 'transit', day_id: 20, end_day_id: 11, endpoints: twoStop })
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 11, days: reordered,
    })).toEqual([transit])
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 10, days: reordered,
    })).toEqual([])
  })

  it('does not scope transit when there is no selected day', () => {
    const transit = reservation({ id: 1, type: 'transit', day_id: 20, endpoints: twoStop })
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [], showTransitRoutes: true, days,
    })).toEqual([transit])
    expect(visibleRouteReservations([transit], {
      visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: null, days,
    })).toEqual([transit])
  })
})

describe('visibleReservationEndpointPoints', () => {
  it('returns endpoint coordinates for visible reservations', () => {
    const flight = reservation({ id: 1, type: 'flight', endpoints: twoStop })
    expect(visibleReservationEndpointPoints([flight], {
      visibleConnectionIds: [1], showTransitRoutes: false, selectedDayId: 1,
    })).toEqual([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }])
  })

  it('filters hidden reservations and invalid coordinates', () => {
    const flight = reservation({
      id: 1,
      type: 'flight',
      endpoints: [{ ...twoStop[0], lat: NaN, lng: NaN }, twoStop[1]],
    })
    expect(visibleReservationEndpointPoints([flight], {
      visibleConnectionIds: [1], showTransitRoutes: false, selectedDayId: 1,
    })).toEqual([{ lat: 3, lng: 4 }])
    expect(visibleReservationEndpointPoints([flight], {
      visibleConnectionIds: [], showTransitRoutes: false, selectedDayId: 1,
    })).toEqual([])
  })

  it('preserves zero coordinates as valid', () => {
    const flight = reservation({
      id: 1,
      type: 'flight',
      endpoints: [endpoint('from', 0, 0), twoStop[1]],
    })
    expect(visibleReservationEndpointPoints([flight], {
      visibleConnectionIds: [1], showTransitRoutes: false, selectedDayId: 1,
    })).toEqual([{ lat: 0, lng: 0 }, { lat: 3, lng: 4 }])
  })
})
