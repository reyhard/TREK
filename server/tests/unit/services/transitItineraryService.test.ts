import { runMigrations } from '../../../src/db/migrations';
import { createTables } from '../../../src/db/schema';
import {
  buildTransitJourneyPatch,
  cleanTransitItineraryNames,
  effectiveTransitStopTime,
  transitCoordinatesMatch,
  transitItinerarySchema,
} from '../../../src/services/transitItineraryService';
import { deriveTransitStats, type TransitItinerary, type TransitLeg } from '../../../src/services/transitService';
import { createTrip, createUser } from '../../helpers/factories';
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
  resetTestDb(testDb);
});

afterAll(() => {
  testDb.close();
});

function validLeg(overrides: Partial<TransitLeg> = {}): TransitLeg {
  return {
    mode: 'BUS',
    from: {
      name: 'Station A',
      lat: 52.52,
      lng: 13.405,
      time: '2026-10-02T08:00:00.000Z',
      scheduledTime: null,
      track: '1',
    },
    to: {
      name: 'Station B',
      lat: 52.53,
      lng: 13.415,
      time: '2026-10-02T08:30:00.000Z',
      scheduledTime: null,
      track: null,
    },
    duration: 1800,
    distance: 5000,
    headsign: 'City Centre',
    line: '100',
    lineColor: '#FF0000',
    lineTextColor: '#FFFFFF',
    agency: 'BVG',
    intermediateStops: 2,
    geometry: null,
    geometryPrecision: 6,
    ...overrides,
  };
}

function validItinerary(overrides: Partial<TransitItinerary> = {}): TransitItinerary {
  return {
    startTime: '2026-10-02T08:00:00.000Z',
    endTime: '2026-10-02T08:30:00.000Z',
    duration: 1800,
    transfers: 0,
    walkSeconds: 0,
    legs: [validLeg()],
    ...overrides,
  };
}

// ── effectiveTransitStopTime ──────────────────────────────────────────────────

describe('effectiveTransitStopTime', () => {
  it('ITI-VAL-001: uses real-time when both real and scheduled are present', () => {
    expect(effectiveTransitStopTime({ time: '2026-10-02T08:00:00Z', scheduledTime: '2026-10-02T08:05:00Z' })).toBe(
      '2026-10-02T08:00:00Z',
    );
  });

  it('ITI-VAL-002: falls back to scheduled time when real-time is null', () => {
    expect(effectiveTransitStopTime({ time: null, scheduledTime: '2026-10-02T08:05:00Z' })).toBe(
      '2026-10-02T08:05:00Z',
    );
  });

  it('ITI-VAL-003: returns null when both times are absent', () => {
    expect(effectiveTransitStopTime({ time: null, scheduledTime: null })).toBeNull();
    expect(effectiveTransitStopTime({})).toBeNull();
  });
});

// ── Schema validation ────────────────────────────────────────────────────────

describe('transitItinerarySchema', () => {
  it('ITI-VAL-004: accepts a valid itinerary', () => {
    const result = transitItinerarySchema.safeParse(validItinerary());
    expect(result.success).toBe(true);
  });

  it('ITI-VAL-005: rejects endTime before startTime', () => {
    const result = transitItinerarySchema.safeParse(
      validItinerary({ startTime: '2026-10-02T09:00:00.000Z', endTime: '2026-10-02T08:00:00.000Z' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('endTime must be after startTime'))).toBe(true);
    }
  });

  it('ITI-VAL-006: requires at least one non-WALK leg', () => {
    const result = transitItinerarySchema.safeParse(validItinerary({ legs: [{ ...validLeg(), mode: 'WALK' }] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('scheduled transit leg'))).toBe(true);
    }
  });

  it('ITI-VAL-007: every leg requires departure and arrival times', () => {
    const result = transitItinerarySchema.safeParse(
      validItinerary({
        legs: [
          {
            ...validLeg(),
            from: { ...validLeg().from, time: null, scheduledTime: null },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('requires departure'))).toBe(true);
    }
  });

  it('ITI-VAL-008: leg duration matches its times within one minute tolerance', () => {
    const result = transitItinerarySchema.safeParse(
      validItinerary({
        legs: [{ ...validLeg(), duration: 90000 }], // 25h but times are 30min apart
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('duration does not match'))).toBe(true);
    }
  });

  it('ITI-VAL-009: legs stay within itinerary bounds', () => {
    const result = transitItinerarySchema.safeParse(
      validItinerary({
        legs: [
          {
            ...validLeg(),
            from: { ...validLeg().from, time: '2026-10-02T07:00:00.000Z' },
            to: { ...validLeg().to, time: '2026-10-02T07:30:00.000Z' },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('stay within the itinerary'))).toBe(true);
    }
  });

  it('ITI-VAL-010: adjacent legs are chronological and within 1 km', () => {
    const result = transitItinerarySchema.safeParse(
      validItinerary({
        legs: [
          validLeg({
            mode: 'BUS',
            from: {
              name: 'A',
              lat: 52.52,
              lng: 13.405,
              time: '2026-10-02T08:00:00.000Z',
              scheduledTime: null,
              track: null,
            },
            to: {
              name: 'B',
              lat: 52.53,
              lng: 13.415,
              time: '2026-10-02T08:30:00.000Z',
              scheduledTime: null,
              track: null,
            },
            duration: 1800,
          }),
          validLeg({
            mode: 'TRAM',
            from: {
              name: 'Far',
              lat: 53.0,
              lng: 14.0,
              time: '2026-10-02T08:35:00.000Z',
              scheduledTime: null,
              track: null,
            },
            to: {
              name: 'C',
              lat: 53.01,
              lng: 14.01,
              time: '2026-10-02T09:00:00.000Z',
              scheduledTime: null,
              track: null,
            },
            duration: 1500,
          }),
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('not connected'))).toBe(true);
    }
  });

  it('ITI-VAL-011: first leg anchors the itinerary start', () => {
    const result = transitItinerarySchema.safeParse(
      validItinerary({
        legs: [
          {
            ...validLeg(),
            from: { ...validLeg().from, time: '2026-10-02T10:00:00.000Z' },
            to: { ...validLeg().to, time: '2026-10-02T10:30:00.000Z' },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('First leg must start'))).toBe(true);
    }
  });

  it('ITI-VAL-012: last leg anchors the itinerary end', () => {
    const result = transitItinerarySchema.safeParse(
      validItinerary({
        endTime: '2026-10-02T08:30:00.000Z',
        legs: [
          {
            ...validLeg(),
            to: { ...validLeg().to, time: '2026-10-02T10:30:00.000Z' },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('Last leg must end'))).toBe(true);
    }
  });

  it('ITI-VAL-013: requested endpoint within 100m of first/last leg', () => {
    const itinerary = validItinerary();
    expect(transitCoordinatesMatch({ name: 'A', lat: 52.52, lng: 13.405 }, itinerary.legs[0].from)).toBe(true);
    expect(transitCoordinatesMatch({ name: 'Far', lat: 53.0, lng: 14.0 }, itinerary.legs[0].from)).toBe(false);
  });

  it('ITI-VAL-014: rejects combined geometry over 60KB', () => {
    const longGeo = 'a'.repeat(61_000);
    const result = transitItinerarySchema.safeParse(
      validItinerary({
        legs: [
          { ...validLeg(), geometry: longGeo },
          { ...validLeg(), geometry: longGeo },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('geometry is too large'))).toBe(true);
    }
  });

  it('ITI-VAL-015: accepts uppercase provider modes beyond request whitelist', () => {
    const result = transitItinerarySchema.safeParse(
      validItinerary({
        legs: [{ ...validLeg(), mode: 'AIRPLANE' }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('ITI-VAL-016: accepts OTHER mode from provider response', () => {
    const result = transitItinerarySchema.safeParse(
      validItinerary({
        legs: [{ ...validLeg(), mode: 'OTHER' }],
      }),
    );
    expect(result.success).toBe(true);
  });
});

// ── buildTransitJourneyPatch ──────────────────────────────────────────────────

describe('buildTransitJourneyPatch', () => {
  it('ITI-PATCH-001: builds a same-day patch with default metadata', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?').get(trip.id, '2026-10-02') as any;

    const patch = buildTransitJourneyPatch(
      trip.id,
      day.id,
      { name: 'Berlin Hbf', lat: 52.52, lng: 13.405 },
      { name: 'Hamburg Hbf', lat: 53.55, lng: 10.0 },
      validItinerary({
        startTime: '2026-10-02T06:00:00.000Z',
        endTime: '2026-10-02T08:00:00.000Z',
      }),
    );

    expect(patch.day_id).toBe(day.id);
    expect(patch.end_day_id).toBe(day.id);
    expect(patch.needs_review).toBe(false);
    expect(patch.reservation_time).toMatch(/^2026-10-02T/);
    expect(patch.reservation_end_time).toMatch(/^2026-10-02T/);
    expect(patch.endpoints).toHaveLength(2);
    expect(patch.endpoints[0].role).toBe('from');
    expect(patch.endpoints[0].name).toBe('Berlin Hbf');
    expect(patch.endpoints[patch.endpoints.length - 1].role).toBe('to');
    expect(patch.endpoints[patch.endpoints.length - 1].name).toBe('Hamburg Hbf');
    expect(patch.metadata.transit).toBeDefined();
    expect(patch.metadata.transit.provider).toBe('transitous');
  });

  it('ITI-PATCH-002: builds an overnight patch with separate end_day_id', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-04' });
    const depDay = testDb
      .prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?')
      .get(trip.id, '2026-10-02') as any;
    const arrDay = testDb
      .prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?')
      .get(trip.id, '2026-10-03') as any;

    const patch = buildTransitJourneyPatch(
      trip.id,
      depDay.id,
      { name: 'London', lat: 51.5074, lng: -0.1278 },
      { name: 'Paris Est', lat: 48.87, lng: 2.36 },
      validItinerary({
        startTime: '2026-10-02T22:00:00.000Z',
        endTime: '2026-10-03T05:00:00.000Z',
      }),
    );

    expect(patch.day_id).toBe(depDay.id);
    expect(patch.end_day_id).toBe(arrDay.id);
  });

  it('ITI-PATCH-003: includes intermediate stops in endpoints', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?').get(trip.id, '2026-10-02') as any;

    const patch = buildTransitJourneyPatch(
      trip.id,
      day.id,
      { name: 'A', lat: 52.52, lng: 13.405 },
      { name: 'D', lat: 52.55, lng: 13.43 },
      validItinerary({
        legs: [
          validLeg({
            mode: 'BUS',
            from: {
              name: 'A',
              lat: 52.52,
              lng: 13.405,
              time: '2026-10-02T08:00:00.000Z',
              scheduledTime: null,
              track: null,
            },
            to: {
              name: 'B',
              lat: 52.53,
              lng: 13.415,
              time: '2026-10-02T08:15:00.000Z',
              scheduledTime: null,
              track: null,
            },
            duration: 900,
          }),
          validLeg({
            mode: 'BUS',
            from: {
              name: 'B',
              lat: 52.53,
              lng: 13.415,
              time: '2026-10-02T08:20:00.000Z',
              scheduledTime: null,
              track: null,
            },
            to: {
              name: 'C',
              lat: 52.54,
              lng: 13.42,
              time: '2026-10-02T08:35:00.000Z',
              scheduledTime: null,
              track: null,
            },
            duration: 900,
          }),
          validLeg({
            mode: 'BUS',
            from: {
              name: 'C',
              lat: 52.54,
              lng: 13.42,
              time: '2026-10-02T08:40:00.000Z',
              scheduledTime: null,
              track: null,
            },
            to: {
              name: 'D',
              lat: 52.55,
              lng: 13.43,
              time: '2026-10-02T09:00:00.000Z',
              scheduledTime: null,
              track: null,
            },
            duration: 1200,
          }),
        ],
      }),
    );

    const roles = patch.endpoints.map((e) => e.role);
    expect(roles).toEqual(['from', 'stop', 'stop', 'to']);
    expect(patch.endpoints.length).toBe(4);
  });

  it('ITI-PATCH-004: merges existing metadata preserving unrelated fields', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?').get(trip.id, '2026-10-02') as any;

    const patch = buildTransitJourneyPatch(
      trip.id,
      day.id,
      { name: 'A', lat: 52.52, lng: 13.405 },
      { name: 'B', lat: 52.53, lng: 13.415 },
      validItinerary(),
      { plugin_extension: { retained: true }, unrelated: 'keep' },
    );

    expect(patch.metadata.plugin_extension).toEqual({ retained: true });
    expect(patch.metadata.unrelated).toBe('keep');
    expect(patch.metadata.transit.provider).toBe('transitous');
  });

  it('ITI-PATCH-005: includes optional leg distance in metadata', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?').get(trip.id, '2026-10-02') as any;

    const patch = buildTransitJourneyPatch(
      trip.id,
      day.id,
      { name: 'A', lat: 52.52, lng: 13.405 },
      { name: 'B', lat: 52.53, lng: 13.415 },
      validItinerary(),
    );

    const transit = patch.metadata.transit as any;
    expect(transit.legs[0].distance).toBe(5000);
  });

  it('ITI-PATCH-006: stores duration, transfers, walk_seconds in metadata', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?').get(trip.id, '2026-10-02') as any;

    const patch = buildTransitJourneyPatch(
      trip.id,
      day.id,
      { name: 'A', lat: 52.52, lng: 13.405 },
      { name: 'B', lat: 52.53, lng: 13.415 },
      validItinerary(),
    );

    expect(patch.metadata.transit).toMatchObject({
      provider: 'transitous',
      duration: 1800,
      transfers: 0,
      walk_seconds: 0,
    });
  });

  it('ITI-PATCH-007: rejects a day that does not belong to the trip', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const otherTrip = createTrip(testDb, user.id);
    const otherDay = testDb.prepare('SELECT * FROM days WHERE trip_id = ?').get(otherTrip.id) as any;
    if (!otherDay) return;

    expect(() =>
      buildTransitJourneyPatch(
        trip.id,
        otherDay.id,
        { name: 'A', lat: 52.52, lng: 13.405 },
        { name: 'B', lat: 52.53, lng: 13.415 },
        validItinerary(),
      ),
    ).toThrow('Day does not belong to this trip');
  });

  it('ITI-PATCH-008: rejects a day without a date', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    testDb.prepare('UPDATE days SET date = NULL WHERE trip_id = ?').run(trip.id);
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ?').get(trip.id) as any;

    expect(() =>
      buildTransitJourneyPatch(
        trip.id,
        day.id,
        { name: 'A', lat: 52.52, lng: 13.405 },
        { name: 'B', lat: 52.53, lng: 13.415 },
        validItinerary(),
      ),
    ).toThrow('has no date');
  });

  it('ITI-PATCH-009: rejects departure date mismatch with selected day', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-05' });
    const wrongDay = testDb
      .prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?')
      .get(trip.id, '2026-10-03') as any;

    expect(() =>
      buildTransitJourneyPatch(
        trip.id,
        wrongDay.id,
        { name: 'Berlin Hbf', lat: 52.52, lng: 13.405 },
        { name: 'Hamburg Hbf', lat: 53.55, lng: 10.0 },
        validItinerary({
          startTime: '2026-10-02T06:00:00.000Z',
        }),
      ),
    ).toThrow('departs on');
  });

  it('ITI-PATCH-010: rejects arrival date with no trip day', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-02' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ?').get(trip.id) as any;

    expect(() =>
      buildTransitJourneyPatch(
        trip.id,
        day.id,
        { name: 'London', lat: 51.5074, lng: -0.1278 },
        { name: 'Paris Est', lat: 48.87, lng: 2.36 },
        validItinerary({
          startTime: '2026-10-02T22:00:00.000Z',
          endTime: '2026-10-03T01:00:00.000Z',
        }),
      ),
    ).toThrow('arrival date');
  });

  it('ITI-PATCH-011: endpoints have timezone and local times', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?').get(trip.id, '2026-10-02') as any;

    const patch = buildTransitJourneyPatch(
      trip.id,
      day.id,
      { name: 'Berlin Hbf', lat: 52.52, lng: 13.405 },
      { name: 'Paris Est', lat: 48.87, lng: 2.36 },
      validItinerary({
        startTime: '2026-10-02T06:00:00.000Z',
        endTime: '2026-10-02T08:00:00.000Z',
      }),
    );

    expect(patch.endpoints[0].timezone).toBe('Europe/Berlin');
    expect(patch.endpoints[0].local_date).toBe('2026-10-02');
    expect(patch.endpoints[0].local_time).toMatch(/^\d{2}:\d{2}$/);
    expect(patch.endpoints[patch.endpoints.length - 1].timezone).toBe('Europe/Paris');
  });

  it('ITI-PATCH-012: existingMetadata null/undefined is handled safely', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? AND date = ?').get(trip.id, '2026-10-02') as any;

    const patch = buildTransitJourneyPatch(
      trip.id,
      day.id,
      { name: 'A', lat: 52.52, lng: 13.405 },
      { name: 'B', lat: 52.53, lng: 13.415 },
      validItinerary(),
      null,
    );

    expect(patch.metadata.transit).toBeDefined();
    expect(Object.keys(patch.metadata)).toEqual(['transit']);
  });
});
