import { runMigrations } from '../../../src/db/migrations';
import { createTables } from '../../../src/db/schema';
import { createReservation } from '../../../src/services/reservationService';
import {
  TransitRouteEndpointUpdateError,
  updateTransitRouteEndpoints,
} from '../../../src/services/transitRouteEndpointService';
import { createTrip, createUser } from '../../helpers/factories';
import { resetTestDb } from '../../helpers/test-db';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return {
    testDb: db,
    dbMock: { db, closeDb: () => {}, reinitialize: () => {} },
  };
});

vi.mock('../../../src/db/database', () => dbMock);

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});
beforeEach(() => resetTestDb(testDb));
afterAll(() => testDb.close());

function seedTransit() {
  const { user } = createUser(testDb);
  const trip = createTrip(testDb, user.id, {
    start_date: '2026-10-09',
    end_date: '2026-10-10',
  });
  const day = testDb.prepare('SELECT id FROM days WHERE trip_id = ? ORDER BY date').get(trip.id) as { id: number };
  const result = createReservation(trip.id, {
    title: 'Fushimi Inari → Kiyomizu-dera',
    type: 'transit',
    status: 'confirmed',
    day_id: day.id,
    end_day_id: day.id,
    reservation_time: '2026-10-09T09:00',
    reservation_end_time: '2026-10-09T09:45',
    notes: 'Keep this note',
    metadata: {
      source_marker: 'preserve-me',
      transit: {
        provider: 'transitous',
        duration: 2700,
        transfers: 1,
        walk_seconds: 0,
        legs: [{ mode: 'RAIL', geometry: 'encoded-shape', geometry_precision: 6 }],
      },
    },
    endpoints: [
      {
        role: 'from',
        sequence: 0,
        name: 'Fushimi Inari',
        code: 'KH34',
        lat: 34.967,
        lng: 135.773,
        timezone: 'Asia/Tokyo',
        local_date: '2026-10-09',
        local_time: '09:00',
      },
      {
        role: 'stop',
        sequence: 1,
        name: 'Gion-Shijo',
        code: 'KH39',
        lat: 35.003,
        lng: 135.772,
        timezone: 'Asia/Tokyo',
        local_date: '2026-10-09',
        local_time: '09:20',
      },
      {
        role: 'to',
        sequence: 2,
        name: 'Kiyomizu-dera',
        code: null,
        lat: 34.994,
        lng: 135.785,
        timezone: 'Asia/Tokyo',
        local_date: '2026-10-09',
        local_time: '09:45',
      },
    ],
  });
  testDb.prepare('UPDATE reservations SET day_plan_position = 7 WHERE id = ?').run(result.reservation.id);
  testDb
    .prepare('INSERT INTO reservation_day_positions (reservation_id, day_id, position) VALUES (?, ?, ?)')
    .run(result.reservation.id, day.id, 3);
  return { trip, day, reservationId: result.reservation.id };
}

describe('updateTransitRouteEndpoints', () => {
  it('updates only the requested endpoint name/coordinates', () => {
    const { trip, reservationId } = seedTransit();
    const beforeReservation = testDb.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId);
    const beforeEndpoints = testDb
      .prepare('SELECT * FROM reservation_endpoints WHERE reservation_id = ? ORDER BY sequence')
      .all(reservationId) as Array<Record<string, unknown> & { role: string }>;
    const beforePositions = testDb
      .prepare('SELECT * FROM reservation_day_positions WHERE reservation_id = ? ORDER BY day_id')
      .all(reservationId);

    const updated = updateTransitRouteEndpoints(reservationId, trip.id, {
      from: {
        name: 'Keihan Fushimi-Inari Station',
        lat: 34.9685211,
        lng: 135.7691251,
      },
    });

    expect(updated.endpoints.find((endpoint: any) => endpoint.role === 'from')).toMatchObject({
      name: 'Keihan Fushimi-Inari Station',
      lat: 34.9685211,
      lng: 135.7691251,
    });

    const afterReservation = testDb.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId);
    const afterEndpoints = testDb
      .prepare('SELECT * FROM reservation_endpoints WHERE reservation_id = ? ORDER BY sequence')
      .all(reservationId) as Array<Record<string, unknown> & { role: string }>;
    const afterPositions = testDb
      .prepare('SELECT * FROM reservation_day_positions WHERE reservation_id = ? ORDER BY day_id')
      .all(reservationId);

    expect(afterReservation).toEqual(beforeReservation);
    expect(afterPositions).toEqual(beforePositions);
    expect(afterEndpoints.filter((endpoint) => endpoint.role !== 'from')).toEqual(
      beforeEndpoints.filter((endpoint) => endpoint.role !== 'from'),
    );

    const beforeFrom = beforeEndpoints.find((endpoint) => endpoint.role === 'from')!;
    const afterFrom = afterEndpoints.find((endpoint) => endpoint.role === 'from')!;
    expect(afterFrom).toEqual({
      ...beforeFrom,
      name: 'Keihan Fushimi-Inari Station',
      lat: 34.9685211,
      lng: 135.7691251,
    });
  });

  it.each([
    [{}, 'INVALID_INPUT'],
    [{ from: { name: 'X', lat: 91, lng: 0 } }, 'INVALID_INPUT'],
    [{ to: { name: 'X', lat: 0, lng: 181 } }, 'INVALID_INPUT'],
  ])('rejects invalid input %#', (input, code) => {
    const { trip, reservationId } = seedTransit();
    expect(() => updateTransitRouteEndpoints(reservationId, trip.id, input as never)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('rejects missing and non-transit reservations', () => {
    const { trip } = seedTransit();
    expect(() =>
      updateTransitRouteEndpoints(999999, trip.id, {
        from: { name: 'X', lat: 0, lng: 0 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'RESERVATION_NOT_FOUND' }));

    const manual = createReservation(trip.id, { title: 'Train', type: 'train' }).reservation;
    expect(() =>
      updateTransitRouteEndpoints(manual.id, trip.id, {
        from: { name: 'X', lat: 0, lng: 0 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'NOT_TRANSIT' }));
  });

  it('rolls back the first endpoint when the second requested role is missing', () => {
    const { trip, reservationId } = seedTransit();
    testDb.prepare("DELETE FROM reservation_endpoints WHERE reservation_id = ? AND role = 'to'").run(reservationId);
    const before = testDb
      .prepare('SELECT * FROM reservation_endpoints WHERE reservation_id = ? ORDER BY sequence')
      .all(reservationId);

    expect(() =>
      updateTransitRouteEndpoints(reservationId, trip.id, {
        from: { name: 'Changed origin', lat: 34.9, lng: 135.7 },
        to: { name: 'Missing destination', lat: 35, lng: 135.8 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'ENDPOINT_STRUCTURE_INVALID' }));

    expect(
      testDb
        .prepare('SELECT * FROM reservation_endpoints WHERE reservation_id = ? ORDER BY sequence')
        .all(reservationId),
    ).toEqual(before);
  });

  it('updates both from and to endpoints simultaneously', () => {
    const { trip, reservationId } = seedTransit();
    const newFrom = { name: 'New Origin', lat: 35.0, lng: 135.5 };
    const newTo = { name: 'New Destination', lat: 35.5, lng: 136.0 };

    const updated = updateTransitRouteEndpoints(reservationId, trip.id, {
      from: newFrom,
      to: newTo,
    });

    expect(updated.endpoints.find((endpoint: any) => endpoint.role === 'from')).toMatchObject(newFrom);
    expect(updated.endpoints.find((endpoint: any) => endpoint.role === 'to')).toMatchObject(newTo);

    const dbFrom = testDb
      .prepare("SELECT name, lat, lng FROM reservation_endpoints WHERE reservation_id = ? AND role = 'from'")
      .get(reservationId) as any;
    const dbTo = testDb
      .prepare("SELECT name, lat, lng FROM reservation_endpoints WHERE reservation_id = ? AND role = 'to'")
      .get(reservationId) as any;
    expect(dbFrom).toMatchObject(newFrom);
    expect(dbTo).toMatchObject(newTo);
  });

  it('rejects update when there are duplicate rows for the same role', () => {
    const { trip, reservationId } = seedTransit();
    testDb
      .prepare(
        "INSERT INTO reservation_endpoints (reservation_id, role, sequence, name, code, lat, lng, timezone, local_date, local_time) VALUES (?, 'from', 99, 'Duplicate', NULL, 0, 0, NULL, NULL, NULL)",
      )
      .run(reservationId);
    const before = testDb
      .prepare("SELECT name FROM reservation_endpoints WHERE reservation_id = ? AND role = 'from' ORDER BY sequence")
      .all(reservationId);

    expect(() =>
      updateTransitRouteEndpoints(reservationId, trip.id, {
        from: { name: 'Should fail', lat: 35, lng: 135 },
      }),
    ).toThrowError(expect.objectContaining({ code: 'ENDPOINT_STRUCTURE_INVALID' }));

    const after = testDb
      .prepare("SELECT name FROM reservation_endpoints WHERE reservation_id = ? AND role = 'from' ORDER BY sequence")
      .all(reservationId);
    expect(after).toEqual(before);
  });
});
