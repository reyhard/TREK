import { describe, expect, it } from 'vitest';
import type { Reservation, ReservationEndpoint } from '../types';
import { isRoutableReservation, visibleReservationEndpointPoints, visibleRouteReservations } from './reservationRoutes';

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
  };
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
  } as Reservation;
}

describe('isRoutableReservation', () => {
  it('is false with no endpoints', () => {
    expect(isRoutableReservation(reservation())).toBe(false);
  });

  it('is false with a single endpoint', () => {
    expect(isRoutableReservation(reservation({ endpoints: [endpoint('from', 1, 2)] }))).toBe(false);
  });

  it('is true with 2+ endpoints', () => {
    expect(isRoutableReservation(reservation({ endpoints: [endpoint('from', 1, 2), endpoint('to', 3, 4)] }))).toBe(
      true
    );
  });
});

describe('visibleRouteReservations', () => {
  const twoStop = [endpoint('from', 1, 2), endpoint('to', 3, 4)];

  it('includes transit only when routing is on and its start day matches the selected day', () => {
    const r = reservation({ id: 1, type: 'transit', day_id: 10, endpoints: twoStop });
    expect(
      visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: false, selectedDayId: 10 })
    ).toEqual([]);
    expect(
      visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 10 })
    ).toEqual([r]);
    expect(
      visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 11 })
    ).toEqual([]);
  });

  it('includes a reservation whose id is in visibleConnectionIds regardless of type', () => {
    const r = reservation({ id: 5, type: 'flight', endpoints: twoStop });
    expect(
      visibleRouteReservations([r], { visibleConnectionIds: [5], showTransitRoutes: false, selectedDayId: 1 })
    ).toEqual([r]);
  });

  it('excludes a routable reservation when neither rule applies', () => {
    const r = reservation({ id: 7, type: 'flight', endpoints: twoStop });
    expect(
      visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: false, selectedDayId: 1 })
    ).toEqual([]);
  });

  it('does not let visible connection ids reveal transit from another day', () => {
    const r = reservation({ id: 5, type: 'transit', day_id: 10, endpoints: twoStop });
    expect(
      visibleRouteReservations([r], { visibleConnectionIds: [5], showTransitRoutes: true, selectedDayId: 11 })
    ).toEqual([]);
  });

  it('does not let visible connection ids reveal transit while routing is off', () => {
    const r = reservation({ id: 5, type: 'transit', day_id: 10, endpoints: twoStop });
    expect(
      visibleRouteReservations([r], { visibleConnectionIds: [5], showTransitRoutes: false, selectedDayId: 10 })
    ).toEqual([]);
  });

  it('hides transit when no day is selected', () => {
    const r = reservation({ type: 'transit', day_id: 10, endpoints: twoStop });
    expect(
      visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: null })
    ).toEqual([]);
  });

  it('shows overnight transit only on its starting day', () => {
    const r = reservation({ type: 'transit', day_id: 10, end_day_id: 11, endpoints: twoStop });
    expect(
      visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 10 })
    ).toEqual([r]);
    expect(
      visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 11 })
    ).toEqual([]);
  });

  it.each(['flight', 'train', 'bus'])(
    'keeps %s visibility controlled by visible connection ids regardless of selected day',
    (type) => {
      const r = reservation({ id: 9, type, day_id: 10, endpoints: twoStop });
      expect(
        visibleRouteReservations([r], { visibleConnectionIds: [9], showTransitRoutes: false, selectedDayId: 99 })
      ).toEqual([r]);
      expect(
        visibleRouteReservations([r], { visibleConnectionIds: [], showTransitRoutes: true, selectedDayId: 10 })
      ).toEqual([]);
    }
  );
});

describe('visibleReservationEndpointPoints', () => {
  const endpoints = [endpoint('from', 1, 2), endpoint('to', 3, 4)];

  it('returns endpoint coordinates for visible reservations', () => {
    const r = reservation({ id: 1, type: 'flight', endpoints });
    const points = visibleReservationEndpointPoints([r], {
      visibleConnectionIds: [1],
      showTransitRoutes: false,
      selectedDayId: 1,
    });
    expect(points).toEqual([
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ]);
  });

  it('excludes hidden reservations', () => {
    const r = reservation({ id: 1, type: 'flight', endpoints });
    const points = visibleReservationEndpointPoints([r], {
      visibleConnectionIds: [],
      showTransitRoutes: false,
      selectedDayId: 1,
    });
    expect(points).toEqual([]);
  });

  it('includes transit when showTransitRoutes is true and its day is selected', () => {
    const r = reservation({ id: 1, type: 'transit', day_id: 1, endpoints });
    const points = visibleReservationEndpointPoints([r], {
      visibleConnectionIds: [],
      showTransitRoutes: true,
      selectedDayId: 1,
    });
    expect(points).toEqual([
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ]);
  });

  it('filters out non-finite coordinates', () => {
    const nanEndpoint = { ...endpoints[0], lat: NaN, lng: NaN } as ReservationEndpoint;
    const r = reservation({ id: 1, type: 'flight', endpoints: [nanEndpoint, endpoints[1]] });
    const points = visibleReservationEndpointPoints([r], {
      visibleConnectionIds: [1],
      showTransitRoutes: false,
      selectedDayId: 1,
    });
    expect(points).toEqual([{ lat: 3, lng: 4 }]);
  });

  it('preserves zero coordinates as valid', () => {
    const zeroEndpoint = endpoint('from', 0, 0);
    const r = reservation({ id: 1, type: 'flight', endpoints: [zeroEndpoint, endpoints[1]] });
    const points = visibleReservationEndpointPoints([r], {
      visibleConnectionIds: [1],
      showTransitRoutes: false,
      selectedDayId: 1,
    });
    expect(points).toEqual([
      { lat: 0, lng: 0 },
      { lat: 3, lng: 4 },
    ]);
  });

  it('excludes off-day transit endpoints while preserving manually visible non-transit endpoints', () => {
    const transit = reservation({
      id: 1,
      type: 'transit',
      day_id: 10,
      endpoints: [endpoint('from', 35, 139), endpoint('to', 35.1, 139.1)],
    });
    const flight = reservation({
      id: 2,
      type: 'flight',
      day_id: 20,
      endpoints: [endpoint('from', 50, 4), endpoint('to', 51, 5)],
    });

    expect(
      visibleReservationEndpointPoints([transit, flight], {
        visibleConnectionIds: [1, 2],
        showTransitRoutes: true,
        selectedDayId: 11,
      })
    ).toEqual([
      { lat: 50, lng: 4 },
      { lat: 51, lng: 5 },
    ]);
  });
});
