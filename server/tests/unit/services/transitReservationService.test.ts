import { runMigrations } from '../../../src/db/migrations';
import { createTables } from '../../../src/db/schema';
import {
  buildTransitRouteFields,
  createTransitReservation,
  mapTransitModeGroups,
  normalizeTransitItinerary,
  rankTransitItineraries,
  resolveTransitEndpoint,
  summarizeTransitItinerary,
  updateTransitReservation,
} from '../../../src/services/transitReservationService';
import type { TransitItinerary } from '../../../src/services/transitService';
import { createPlace, createTrip, createUser } from '../../helpers/factories';
import { resetTestDb } from '../../helpers/test-db';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return {
    testDb: db,
    dbMock: {
      db,
      closeDb: () => {},
      reinitialize: () => {},
    },
  };
});

vi.mock('../../../src/db/database', () => dbMock);

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});

beforeEach(() => {
  testDb.exec('DROP TRIGGER IF EXISTS fail_transit_endpoint');
  testDb.exec('DROP TRIGGER IF EXISTS fail_transit_endpoint_update');
  resetTestDb(testDb);
});

afterAll(() => {
  testDb.close();
});

function route(overrides: Partial<TransitItinerary> = {}): TransitItinerary {
  return {
    startTime: '2026-10-02T08:00:00.000Z',
    endTime: '2026-10-02T08:30:00.000Z',
    duration: 999,
    transfers: 9,
    walkSeconds: 999,
    legs: [
      {
        mode: 'WALK',
        from: {
          name: 'START',
          lat: 52.5,
          lng: 13.4,
          time: '2026-10-02T08:00:00.000Z',
          scheduledTime: null,
          track: null,
        },
        to: {
          name: 'Stop A',
          lat: 52.51,
          lng: 13.41,
          time: '2026-10-02T08:05:00.000Z',
          scheduledTime: null,
          track: null,
        },
        duration: 300,
        distance: 250,
        headsign: null,
        line: null,
        lineColor: null,
        lineTextColor: null,
        agency: null,
        intermediateStops: 0,
        geometry: 'abc',
        geometryPrecision: 6,
      },
      {
        mode: 'BUS',
        from: {
          name: 'Stop A',
          lat: 52.51,
          lng: 13.41,
          time: '2026-10-02T08:07:00.000Z',
          scheduledTime: null,
          track: '2',
        },
        to: { name: 'END', lat: 52.52, lng: 13.42, time: '2026-10-02T08:30:00.000Z', scheduledTime: null, track: null },
        duration: 1380,
        distance: 6000,
        headsign: 'City Centre',
        line: '100',
        lineColor: '#FF0000',
        lineTextColor: '#FFFFFF',
        agency: 'BVG',
        intermediateStops: 4,
        geometry: 'def',
        geometryPrecision: 6,
      },
    ],
    ...overrides,
  };
}

describe('transit itinerary normalization', () => {
  it('recomputes wall-clock duration, walking time, and transfer count', () => {
    const normalized = normalizeTransitItinerary(route());
    expect(normalized.duration).toBe(1800);
    expect(normalized.walkSeconds).toBe(300);
    expect(normalized.transfers).toBe(0);
  });

  it('rejects a recomputed wall-clock duration above the itinerary limit', () => {
    expect(() =>
      normalizeTransitItinerary(
        route({
          endTime: '2026-10-09T08:00:01.000Z',
        }),
      ),
    ).toThrow('Selected itinerary is invalid');
  });

  it('rejects recomputed walking time above the itinerary limit', () => {
    const itinerary = route();
    itinerary.legs = [
      { ...itinerary.legs[0], duration: 302_400.5 },
      { ...itinerary.legs[0], duration: 302_400.5 },
      itinerary.legs[1],
    ];

    expect(() => normalizeTransitItinerary(itinerary)).toThrow('Selected itinerary is invalid');
  });

  it('rejects a route with no transit leg', () => {
    expect(() => normalizeTransitItinerary(route({ legs: [route().legs[0]] }))).toThrow(
      'Selected itinerary must include at least one transit leg',
    );
  });

  it('rejects unsupported modes and invalid colors', () => {
    const badMode = route();
    badMode.legs[1] = { ...badMode.legs[1], mode: 'CAR' };
    expect(() => normalizeTransitItinerary(badMode)).toThrow('Selected itinerary is invalid');
    const badColor = route();
    badColor.legs[1] = { ...badColor.legs[1], lineColor: 'red' };
    expect(() => normalizeTransitItinerary(badColor)).toThrow('Selected itinerary is invalid');
  });

  it('ignores informational routeIndex and summary fields from planning results', () => {
    const normalized = normalizeTransitItinerary({ ...route(), routeIndex: 2, summary: 'Walk → Bus' });
    expect((normalized as any).routeIndex).toBeUndefined();
    expect((normalized as any).summary).toBeUndefined();
  });

  it('rejects more than 32 legs and excessive geometry', () => {
    expect(() => normalizeTransitItinerary(route({ legs: Array.from({ length: 33 }, () => route().legs[1]) }))).toThrow(
      'Selected itinerary is invalid',
    );
    const tooLarge = route();
    tooLarge.legs = [
      { ...tooLarge.legs[0], geometry: 'a'.repeat(90_000) },
      { ...tooLarge.legs[1], geometry: 'b'.repeat(90_000) },
      { ...tooLarge.legs[1], from: tooLarge.legs[1].to, geometry: 'c'.repeat(90_000) },
    ];
    expect(() => normalizeTransitItinerary(tooLarge)).toThrow('Selected itinerary geometry is too large');
  });
});

describe('transit ranking and presentation', () => {
  const fast = route({ duration: 1200, transfers: 2, walkSeconds: 600 });
  const few = route({ duration: 1800, transfers: 0, walkSeconds: 900 });
  const shortWalk = route({ duration: 1500, transfers: 1, walkSeconds: 120 });

  it('preserves provider order for best', () => {
    expect(rankTransitItineraries([fast, few, shortWalk], 'best')).toEqual([fast, few, shortWalk]);
  });

  it('ranks by transfers then duration', () => {
    expect(rankTransitItineraries([fast, shortWalk, few], 'fewer_transfers')).toEqual([few, shortWalk, fast]);
  });

  it('ranks by walking then duration', () => {
    expect(rankTransitItineraries([fast, few, shortWalk], 'less_walking')).toEqual([shortWalk, fast, few]);
  });

  it('maps friendly mode groups to the existing Transitous mode constants', () => {
    expect(mapTransitModeGroups(['rail', 'bus'])).toBe(
      'HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL,REGIONAL_RAIL,SUBURBAN,BUS,COACH',
    );
    expect(mapTransitModeGroups()).toBeUndefined();
  });

  it('builds a compact English route summary', () => {
    expect(summarizeTransitItinerary(route())).toBe('Walk 5 min → Bus 100');
  });
});

describe('transit reservation fields', () => {
  it('resolves a saved place only when it belongs to the trip and has coordinates', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const place = createPlace(testDb, trip.id, { name: 'Hotel', lat: 35.689, lng: 139.692 });

    expect(resolveTransitEndpoint(trip.id, { placeId: place.id }, 'Origin')).toEqual({
      name: 'Hotel',
      lat: 35.689,
      lng: 139.692,
    });
  });

  it('rejects a place from another trip or a place without coordinates', () => {
    const { user } = createUser(testDb);
    const first = createTrip(testDb, user.id);
    const second = createTrip(testDb, user.id);
    const foreign = createPlace(testDb, second.id);

    expect(() => resolveTransitEndpoint(first.id, { placeId: foreign.id }, 'Origin')).toThrow(
      'Place does not belong to this trip',
    );

    const missing = createPlace(testDb, first.id);
    testDb.prepare('UPDATE places SET lat = NULL, lng = NULL WHERE id = ?').run(missing.id);
    expect(() => resolveTransitEndpoint(first.id, { placeId: missing.id }, 'Origin')).toThrow(
      'Place has no usable coordinates',
    );
  });

  it('builds the exact metadata and endpoint shape rendered by the transit UI', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?').get(trip.id, '2026-10-02') as any;

    const fields = buildTransitRouteFields({
      tripId: trip.id,
      dayId: day.id,
      from: { name: 'Hotel', lat: 35.689, lng: 139.692 },
      to: { name: 'Temple', lat: 35.7148, lng: 139.7967 },
      itinerary: route({
        startTime: '2026-10-02T00:00:00.000Z',
        endTime: '2026-10-02T00:30:00.000Z',
      }),
    });

    expect(fields.type).toBe('transit');
    expect(fields.status).toBe('confirmed');
    expect(fields.reservation_time).toBe('2026-10-02T09:00');
    expect(fields.reservation_end_time).toBe('2026-10-02T09:30');
    expect(fields.endpoints[0]).toMatchObject({
      role: 'from',
      sequence: 0,
      name: 'Hotel',
      timezone: 'Asia/Tokyo',
      local_date: '2026-10-02',
      local_time: '09:00',
    });
    expect(fields.endpoints.at(-1)).toMatchObject({
      role: 'to',
      name: 'Temple',
      timezone: 'Asia/Tokyo',
      local_date: '2026-10-02',
      local_time: '09:30',
    });
    expect(fields.metadata.transit).toMatchObject({
      provider: 'transitous',
      duration: 1800,
      transfers: 0,
      walk_seconds: 300,
    });
    expect((fields.metadata.transit as any).legs[1]).toMatchObject({
      mode: 'BUS',
      line: '100',
      line_color: '#FF0000',
      line_text_color: '#FFFFFF',
      headsign: 'City Centre',
      agency: 'BVG',
      stops: 4,
      geometry: 'def',
      geometry_precision: 6,
    });
  });

  it('keeps the supplied start day when the origin-local departure date differs', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const supplied = testDb
      .prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?')
      .get(trip.id, '2026-10-03') as any;

    const fields = buildTransitRouteFields({
      tripId: trip.id,
      dayId: supplied.id,
      from: { name: 'Hotel', lat: 35.689, lng: 139.692 },
      to: { name: 'Temple', lat: 35.7148, lng: 139.7967 },
      itinerary: route({
        startTime: '2026-10-02T00:00:00.000Z',
        endTime: '2026-10-02T00:30:00.000Z',
      }),
    });

    expect(fields.day_id).toBe(supplied.id);
    expect(fields.end_day_id).toBe(supplied.id);
  });

  it('links an overnight arrival to the matching next trip day', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const departure = testDb
      .prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?')
      .get(trip.id, '2026-10-02') as any;
    const arrival = testDb
      .prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?')
      .get(trip.id, '2026-10-03') as any;

    const fields = buildTransitRouteFields({
      tripId: trip.id,
      dayId: departure.id,
      from: { name: 'Berlin', lat: 52.52, lng: 13.405 },
      to: { name: 'Warsaw', lat: 52.2297, lng: 21.0122 },
      itinerary: route({
        startTime: '2026-10-02T21:30:00.000Z',
        endTime: '2026-10-03T05:00:00.000Z',
      }),
    });

    expect(fields.day_id).toBe(departure.id);
    expect(fields.end_day_id).toBe(arrival.id);
  });

  it('falls back to the departure day when the arrival date is outside the trip', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-02' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ?').get(trip.id) as any;

    const fields = buildTransitRouteFields({
      tripId: trip.id,
      dayId: day.id,
      from: { name: 'Berlin', lat: 52.52, lng: 13.405 },
      to: { name: 'Warsaw', lat: 52.2297, lng: 21.0122 },
      itinerary: route({
        startTime: '2026-10-02T21:30:00.000Z',
        endTime: '2026-10-03T05:00:00.000Z',
      }),
    });

    expect(fields.end_day_id).toBe(day.id);
  });
});

describe('transit reservation persistence', () => {
  it('creates the default title from normalized endpoint names', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    const { reservation } = createTransitReservation({
      tripId: trip.id,
      dayId: day.id,
      from: { name: '  Hotel  ', lat: 35.689, lng: 139.692 },
      to: { name: '\tTemple\n', lat: 35.7148, lng: 139.7967 },
      itinerary: route({ startTime: '2026-10-02T00:00:00.000Z', endTime: '2026-10-02T00:30:00.000Z' }),
    }) as any;
    expect(reservation.title).toBe('Hotel → Temple');
    expect(reservation.type).toBe('transit');
    expect(reservation.status).toBe('confirmed');
    expect(reservation.endpoints.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects an explicit whitespace create title without inserting a reservation', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;

    expect(() =>
      createTransitReservation({
        tripId: trip.id,
        dayId: day.id,
        from: { name: 'A', lat: 52.52, lng: 13.405 },
        to: { name: 'B', lat: 52.5, lng: 13.4 },
        itinerary: route(),
        title: '  \t ',
      }),
    ).toThrow('Title is required');
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM reservations WHERE trip_id = ?').get(trip.id)).toEqual({
      count: 0,
    });
  });

  it('preserves title and notes on update when overrides are absent', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    const created = createTransitReservation({
      tripId: trip.id,
      dayId: day.id,
      from: { name: 'A', lat: 52.52, lng: 13.405 },
      to: { name: 'B', lat: 52.5, lng: 13.4 },
      itinerary: route(),
      title: 'My route',
      notes: 'Keep this note',
    }) as any;
    const updated = updateTransitReservation({
      tripId: trip.id,
      reservationId: created.reservation.id,
      dayId: day.id,
      from: { name: 'C', lat: 52.51, lng: 13.41 },
      to: { name: 'D', lat: 52.49, lng: 13.39 },
      itinerary: route({ endTime: '2026-10-02T08:45:00.000Z' }),
    }) as any;
    expect(updated.reservation.title).toBe('My route');
    expect(updated.reservation.notes).toBe('Keep this note');
  });

  it('rejects an explicit whitespace update title without mutating the reservation', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    const created = createTransitReservation({
      tripId: trip.id,
      dayId: day.id,
      from: { name: 'A', lat: 52.52, lng: 13.405 },
      to: { name: 'B', lat: 52.5, lng: 13.4 },
      itinerary: route(),
      title: 'Original route',
      notes: 'Original note',
    }) as any;
    const original = testDb
      .prepare('SELECT title, reservation_time, reservation_end_time, notes, metadata FROM reservations WHERE id = ?')
      .get(created.reservation.id);
    const originalEndpoints = testDb
      .prepare('SELECT role, sequence, name FROM reservation_endpoints WHERE reservation_id = ? ORDER BY sequence')
      .all(created.reservation.id);

    expect(() =>
      updateTransitReservation({
        tripId: trip.id,
        reservationId: created.reservation.id,
        dayId: day.id,
        from: { name: 'C', lat: 52.51, lng: 13.41 },
        to: { name: 'D', lat: 52.49, lng: 13.39 },
        itinerary: route({ endTime: '2026-10-02T09:00:00.000Z' }),
        title: '\n  ',
      }),
    ).toThrow('Title is required');
    expect(
      testDb
        .prepare('SELECT title, reservation_time, reservation_end_time, notes, metadata FROM reservations WHERE id = ?')
        .get(created.reservation.id),
    ).toEqual(original);
    expect(
      testDb
        .prepare('SELECT role, sequence, name FROM reservation_endpoints WHERE reservation_id = ? ORDER BY sequence')
        .all(created.reservation.id),
    ).toEqual(originalEndpoints);
  });

  it('applies explicit title and notes overrides', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    const created = createTransitReservation({
      tripId: trip.id,
      dayId: day.id,
      from: { name: 'A', lat: 52.52, lng: 13.405 },
      to: { name: 'B', lat: 52.5, lng: 13.4 },
      itinerary: route(),
      notes: 'Original note',
    }) as any;
    const updated = updateTransitReservation({
      tripId: trip.id,
      reservationId: created.reservation.id,
      dayId: day.id,
      from: { name: 'C', lat: 52.51, lng: 13.41 },
      to: { name: 'D', lat: 52.49, lng: 13.39 },
      itinerary: route(),
      title: 'Replacement route',
      notes: 'Replacement note',
    }) as any;
    expect(updated.reservation.title).toBe('Replacement route');
    expect(updated.reservation.notes).toBe('Replacement note');
  });

  it('allows explicit empty notes to clear existing notes', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    const created = createTransitReservation({
      tripId: trip.id,
      dayId: day.id,
      from: { name: 'A', lat: 52.52, lng: 13.405 },
      to: { name: 'B', lat: 52.5, lng: 13.4 },
      itinerary: route(),
      notes: 'Clear me',
    }) as any;
    const updated = updateTransitReservation({
      tripId: trip.id,
      reservationId: created.reservation.id,
      dayId: day.id,
      from: { name: 'A', lat: 52.52, lng: 13.405 },
      to: { name: 'B', lat: 52.5, lng: 13.4 },
      itinerary: route(),
      notes: '',
    }) as any;
    expect(updated.reservation.notes).toBeNull();
  });

  it('rejects updates to non-transit reservations', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    const manual = testDb
      .prepare(
        "INSERT INTO reservations (trip_id, day_id, title, type, status) VALUES (?, ?, 'Train', 'train', 'confirmed')",
      )
      .run(trip.id, day.id);
    expect(() =>
      updateTransitReservation({
        tripId: trip.id,
        reservationId: Number(manual.lastInsertRowid),
        dayId: day.id,
        from: { name: 'A', lat: 52.52, lng: 13.405 },
        to: { name: 'B', lat: 52.5, lng: 13.4 },
        itinerary: route(),
      }),
    ).toThrow('Target reservation is not an automated transit route');
  });

  it('rolls back the reservation insert when endpoint persistence fails', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    testDb.exec(
      "CREATE TRIGGER fail_transit_endpoint BEFORE INSERT ON reservation_endpoints BEGIN SELECT RAISE(FAIL, 'forced endpoint failure'); END",
    );
    expect(() =>
      createTransitReservation({
        tripId: trip.id,
        dayId: day.id,
        from: { name: 'A', lat: 52.52, lng: 13.405 },
        to: { name: 'B', lat: 52.5, lng: 13.4 },
        itinerary: route(),
      }),
    ).toThrow('forced endpoint failure');
    expect(
      testDb.prepare("SELECT COUNT(*) AS count FROM reservations WHERE trip_id = ? AND type = 'transit'").get(trip.id),
    ).toEqual({ count: 0 });
  });

  it('rolls back route fields and endpoints when an update endpoint insert fails', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    const created = createTransitReservation({
      tripId: trip.id,
      dayId: day.id,
      from: { name: 'A', lat: 52.52, lng: 13.405 },
      to: { name: 'B', lat: 52.5, lng: 13.4 },
      itinerary: route(),
      title: 'Original',
    }) as any;
    const original = testDb
      .prepare('SELECT title, reservation_end_time FROM reservations WHERE id = ?')
      .get(created.reservation.id);
    const originalEndpoints = testDb
      .prepare('SELECT role, sequence, name FROM reservation_endpoints WHERE reservation_id = ? ORDER BY sequence')
      .all(created.reservation.id);
    testDb.exec(
      "CREATE TRIGGER fail_transit_endpoint_update BEFORE INSERT ON reservation_endpoints BEGIN SELECT RAISE(FAIL, 'forced endpoint update failure'); END",
    );
    expect(() =>
      updateTransitReservation({
        tripId: trip.id,
        reservationId: created.reservation.id,
        dayId: day.id,
        from: { name: 'C', lat: 52.51, lng: 13.41 },
        to: { name: 'D', lat: 52.49, lng: 13.39 },
        itinerary: route({ endTime: '2026-10-02T09:00:00.000Z' }),
        title: 'Changed',
      }),
    ).toThrow('forced endpoint update failure');
    expect(
      testDb.prepare('SELECT title, reservation_end_time FROM reservations WHERE id = ?').get(created.reservation.id),
    ).toEqual(original);
    expect(
      testDb
        .prepare('SELECT role, sequence, name FROM reservation_endpoints WHERE reservation_id = ? ORDER BY sequence')
        .all(created.reservation.id),
    ).toEqual(originalEndpoints);
  });
});
