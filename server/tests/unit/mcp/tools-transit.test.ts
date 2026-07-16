import { runMigrations } from '../../../src/db/migrations';
import { createTables } from '../../../src/db/schema';
import { ALL_SCOPES, SCOPE_INFO } from '../../../src/mcp/scopes';
import { resetTransitUsageLimits } from '../../../src/services/transitRateLimit';
import type { TransitItinerary } from '../../../src/services/transitService';
import { invalidatePermissionsCache } from '../../../src/services/permissions';
import { addTripMember, createDay, createPlace, createReservation, createTrip, createUser } from '../../helpers/factories';
import { createMcpHarness, parseToolResult, type McpHarness } from '../../helpers/mcp-harness';
import { resetTestDb } from '../../helpers/test-db';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  const canAccessTrip = (tripId: number, userId: number) =>
    db
      .prepare(
        `SELECT t.id FROM trips t LEFT JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ? WHERE t.id = ? AND (t.user_id = ? OR m.user_id IS NOT NULL)`,
      )
      .get(userId, tripId, userId);
  return {
    testDb: db,
    dbMock: {
      db,
      closeDb: () => {},
      reinitialize: () => {},
      getPlaceWithTags: () => null,
      canAccessTrip: vi.fn(canAccessTrip),
      canAccessTripImplementation: canAccessTrip,
      isOwner: (tripId: number, userId: number) =>
        !!db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId),
    },
  };
});

vi.mock('../../../src/db/database', () => dbMock);
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-trek-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));

const transitMock = vi.hoisted(() => ({ geocode: vi.fn(), plan: vi.fn() }));
vi.mock('../../../src/services/transitService', () => ({
  geocode: transitMock.geocode,
  plan: transitMock.plan,
}));

const { broadcastMock } = vi.hoisted(() => ({ broadcastMock: vi.fn() }));
vi.mock('../../../src/websocket', () => ({ broadcast: broadcastMock }));

const ALL_MODE_GROUPS = ['rail', 'subway', 'tram', 'bus', 'ferry', 'cable_car'];

it('describes transit-stop discovery through places:read without adding transit scopes', () => {
  expect(SCOPE_INFO['places:read'].description).toContain('transit stops');
  expect(ALL_SCOPES).not.toContain('transit:read' as any);
  expect(ALL_SCOPES).not.toContain('transit:write' as any);
});

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});

beforeEach(() => {
  resetTestDb(testDb);
  transitMock.geocode.mockReset();
  transitMock.plan.mockReset();
  broadcastMock.mockReset();
  dbMock.canAccessTrip.mockReset().mockImplementation(dbMock.canAccessTripImplementation);
  resetTransitUsageLimits();
  invalidatePermissionsCache();
  delete process.env.DEMO_MODE;
});

afterEach(() => {
  testDb.exec('DROP TRIGGER IF EXISTS fail_transit_insert');
  vi.restoreAllMocks();
});

afterAll(() => testDb.close());

async function withHarness(
  userId: number,
  scopes: string[] | null,
  fn: (h: McpHarness) => Promise<void>,
): Promise<void> {
  const h = await createMcpHarness({ userId, scopes, withResources: false });
  try {
    await fn(h);
  } finally {
    await h.cleanup();
  }
}

function route(overrides: Partial<TransitItinerary> = {}): TransitItinerary {
  return {
    startTime: '2026-10-02T08:00:00.000Z',
    endTime: '2026-10-02T08:30:00.000Z',
    duration: 1800,
    transfers: 0,
    walkSeconds: 300,
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

function datedTrip(userId: number) {
  const trip = createTrip(testDb, userId, { start_date: '2026-10-02', end_date: '2026-10-02' });
  const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ?').get(trip.id) as { id: number; date: string };
  return { trip, day };
}

function planArguments(tripId: number, dayId: number) {
  return {
    tripId,
    dayId,
    from: { name: 'A', lat: 52.5, lng: 13.4 },
    to: { name: 'B', lat: 52.6, lng: 13.5 },
    time: '09:00',
  };
}

function providerError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

describe('MCP transit read-tool registration', () => {
  it('registers read tools for places:read but not write tools', async () => {
    const { user } = createUser(testDb);
    await withHarness(user.id, ['places:read'], async (h) => {
      const names = (await h.client.listTools()).tools.map((tool) => tool.name);
      expect(names).toContain('search_transit_stops');
      expect(names).toContain('plan_transit_route');
      expect(names).not.toContain('create_transit_route');
      expect(names).not.toContain('update_transit_route');
    });
  });

  it('registers read tools for places:write and static full access', async () => {
    const { user } = createUser(testDb);
    for (const scopes of [['places:write'], null]) {
      await withHarness(user.id, scopes, async (h) => {
        const names = (await h.client.listTools()).tools.map((tool) => tool.name);
        expect(names).toContain('search_transit_stops');
        expect(names).toContain('plan_transit_route');
      });
    }
  });

  it('does not register read tools for reservations:write alone', async () => {
    const { user } = createUser(testDb);
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const names = (await h.client.listTools()).tools.map((tool) => tool.name);
      expect(names).not.toContain('search_transit_stops');
      expect(names).not.toContain('plan_transit_route');
    });
  });
});

describe('Tool: search_transit_stops', () => {
  it('searches transit stops without requiring a trip', async () => {
    const { user } = createUser(testDb);
    transitMock.geocode.mockResolvedValue({
      results: [{ name: 'Alexanderplatz', lat: 52.52, lng: 13.41, type: 'STOP', area: 'Berlin' }],
    });
    await withHarness(user.id, ['places:read'], async (h) => {
      const result = parseToolResult(
        await h.client.callTool({
          name: 'search_transit_stops',
          arguments: { query: 'Alexanderplatz', language: 'de', near: { lat: 52.5, lng: 13.4 } },
        }),
      ) as any;
      expect(result.results).toHaveLength(1);
      expect(transitMock.geocode).toHaveBeenCalledWith('Alexanderplatz', 'de', '52.5,13.4');
    });
  });

  it('returns the provider error message as an MCP error', async () => {
    const { user } = createUser(testDb);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    transitMock.geocode.mockRejectedValue(providerError('Transit geocoder unavailable', 502));
    await withHarness(user.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({ name: 'search_transit_stops', arguments: { query: 'Berlin' } });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Transit geocoder unavailable');
      expect(errorSpy).not.toHaveBeenCalled();
    });
    errorSpy.mockRestore();
  });

  it('logs unexpected search failures without exposing internal details', async () => {
    const { user } = createUser(testDb);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    transitMock.geocode.mockRejectedValue(new Error('database password appeared in an internal stack'));
    await withHarness(user.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({ name: 'search_transit_stops', arguments: { query: 'Berlin' } });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Failed to search transit stops.');
      expect((result.content[0] as any).text).not.toContain('database password');
      expect(errorSpy).toHaveBeenCalledWith('[MCP] transit stop search failed:', expect.any(Error));
    });
    errorSpy.mockRestore();
  });

  it('rate-limits the 301st stop search in the per-user geocode bucket before another provider call', async () => {
    const first = createUser(testDb).user;
    const second = createUser(testDb).user;
    transitMock.geocode.mockResolvedValue({ results: [] });
    await withHarness(first.id, ['places:read'], async (h) => {
      for (let index = 0; index < 300; index += 1) {
        const result = await h.client.callTool({ name: 'search_transit_stops', arguments: { query: 'Berlin' } });
        expect(result.isError).not.toBe(true);
      }
      const limited = await h.client.callTool({ name: 'search_transit_stops', arguments: { query: 'Berlin' } });
      expect(limited.isError).toBe(true);
      expect((limited.content[0] as any).text).toBe('Transit provider rate limit exceeded. Try again later.');
      expect(transitMock.geocode).toHaveBeenCalledTimes(300);
    });
    await withHarness(second.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({ name: 'search_transit_stops', arguments: { query: 'Berlin' } });
      expect(result.isError).not.toBe(true);
      expect(transitMock.geocode).toHaveBeenCalledTimes(301);
    });
  });
});

describe('Tool: plan_transit_route', () => {
  it('plans from a saved place ID and explicit destination using the trip day date', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    const hotel = createPlace(testDb, trip.id, { name: 'Hotel', lat: 35.689, lng: 139.692 });
    transitMock.plan.mockResolvedValue({ itineraries: [route()] });
    await withHarness(user.id, ['places:read'], async (h) => {
      const data = parseToolResult(
        await h.client.callTool({
          name: 'plan_transit_route',
          arguments: {
            tripId: trip.id,
            dayId: day.id,
            from: { placeId: hotel.id },
            to: { name: 'Temple', lat: 35.7148, lng: 139.7967 },
            time: '09:00',
            timeMode: 'depart_at',
            modes: ['rail', 'bus'],
            preference: 'less_walking',
            maxTransfers: 2,
          },
        }),
      ) as any;
      expect(transitMock.plan).toHaveBeenCalledWith({
        from: '35.689,139.692',
        to: '35.7148,139.7967',
        time: '2026-10-02T00:00:00.000Z',
        arriveBy: false,
        modes: 'HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL,REGIONAL_RAIL,SUBURBAN,BUS,COACH',
        maxTransfers: 2,
      });
      expect(data.query).toEqual({
        tripId: trip.id,
        dayId: day.id,
        date: '2026-10-02',
        time: '09:00',
        timeMode: 'depart_at',
        preference: 'less_walking',
        modes: ['rail', 'bus'],
        maxTransfers: 2,
      });
      expect(data.from.name).toBe('Hotel');
      expect(data.itineraries[0].routeIndex).toBe(0);
      expect(data.itineraries[0].summary).toBeTypeOf('string');
      expect(data.itineraries[0].legs[0].from.name).toBe('Hotel');
      expect(data.itineraries[0].legs.at(-1).to.name).toBe('Temple');
      expect(broadcastMock).not.toHaveBeenCalled();
    });
  });

  it('uses all friendly mode groups and omits maxTransfers from the query by default', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    transitMock.plan.mockResolvedValue({ itineraries: [] });
    await withHarness(user.id, ['places:read'], async (h) => {
      const data = parseToolResult(
        await h.client.callTool({
          name: 'plan_transit_route',
          arguments: planArguments(trip.id, day.id),
        }),
      ) as any;
      expect(data.query).toEqual({
        tripId: trip.id,
        dayId: day.id,
        date: '2026-10-02',
        time: '09:00',
        timeMode: 'depart_at',
        preference: 'best',
        modes: ALL_MODE_GROUPS,
      });
      expect(data.query).not.toHaveProperty('maxTransfers');
      expect(transitMock.plan).toHaveBeenCalledWith({
        from: '52.5,13.4',
        to: '52.6,13.5',
        time: '2026-10-02T07:00:00.000Z',
        arriveBy: false,
        modes: undefined,
      });
    });
  });

  it('anchors arrive-by time to the destination timezone', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    transitMock.plan.mockResolvedValue({ itineraries: [] });
    await withHarness(user.id, ['places:read'], async (h) => {
      await h.client.callTool({
        name: 'plan_transit_route',
        arguments: {
          tripId: trip.id,
          dayId: day.id,
          from: { name: 'London', lat: 51.5074, lng: -0.1278 },
          to: { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
          time: '09:00',
          timeMode: 'arrive_by',
        },
      });
      expect(transitMock.plan).toHaveBeenCalledWith(
        expect.objectContaining({ time: '2026-10-02T00:00:00.000Z', arriveBy: true }),
      );
    });
  });

  it('returns every normalized candidate ranked according to preference', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    const mediumWalk = route({ legs: [{ ...route().legs[0], duration: 500 }, route().legs[1]] });
    const longWalk = route({ legs: [{ ...route().legs[0], duration: 800 }, route().legs[1]] });
    const shortWalk = route({ legs: [{ ...route().legs[0], duration: 100 }, route().legs[1]] });
    transitMock.plan.mockResolvedValue({ itineraries: [mediumWalk, longWalk, shortWalk] });
    await withHarness(user.id, ['places:read'], async (h) => {
      const data = parseToolResult(
        await h.client.callTool({
          name: 'plan_transit_route',
          arguments: { ...planArguments(trip.id, day.id), preference: 'less_walking' },
        }),
      ) as any;
      expect(data.itineraries).toHaveLength(3);
      expect(data.itineraries.map((item: any) => item.routeIndex)).toEqual([0, 1, 2]);
      expect(data.itineraries.map((item: any) => item.walkSeconds)).toEqual([100, 500, 800]);
    });
  });

  it('rejects an inaccessible trip before calling the provider', async () => {
    const owner = createUser(testDb).user;
    const stranger = createUser(testDb).user;
    const { trip, day } = datedTrip(owner.id);
    await withHarness(stranger.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({ name: 'plan_transit_route', arguments: planArguments(trip.id, day.id) });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Trip not found or access denied.');
      expect(transitMock.plan).not.toHaveBeenCalled();
    });
  });

  it('logs access-check failures without exposing internal details', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbMock.canAccessTrip.mockImplementationOnce(() => {
      throw providerError('database password appeared in an access-check stack', 500);
    });

    await withHarness(user.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({ name: 'plan_transit_route', arguments: planArguments(trip.id, day.id) });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Failed to plan transit route.');
      expect((result.content[0] as any).text).not.toContain('database password');
      expect(errorSpy).toHaveBeenCalledWith('[MCP] transit route planning failed:', expect.any(Error));
      expect(transitMock.plan).not.toHaveBeenCalled();
    });
  });

  it('rejects a day from another trip', async () => {
    const { user } = createUser(testDb);
    const first = datedTrip(user.id);
    const second = datedTrip(user.id);
    await withHarness(user.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({
        name: 'plan_transit_route',
        arguments: planArguments(first.trip.id, second.day.id),
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Day does not belong to this trip.');
    });
  });

  it('rejects a day without a date', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const day = createDay(testDb, trip.id);
    await withHarness(user.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({ name: 'plan_transit_route', arguments: planArguments(trip.id, day.id) });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('The selected day has no date.');
    });
  });

  it('rejects a saved place from another trip', async () => {
    const { user } = createUser(testDb);
    const first = datedTrip(user.id);
    const second = datedTrip(user.id);
    const place = createPlace(testDb, second.trip.id);
    await withHarness(user.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({
        name: 'plan_transit_route',
        arguments: { ...planArguments(first.trip.id, first.day.id), from: { placeId: place.id } },
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Place does not belong to this trip');
    });
  });

  it('rejects invalid local time and empty modes during input validation', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    await withHarness(user.id, ['places:read'], async (h) => {
      for (const patch of [{ time: '9:00' }, { modes: [] }]) {
        const result = await h.client.callTool({
          name: 'plan_transit_route',
          arguments: { ...planArguments(trip.id, day.id), ...patch },
        });
        expect(result.isError).toBe(true);
      }
      expect(transitMock.plan).not.toHaveBeenCalled();
    });
  });

  it('returns an empty provider itinerary list as a successful response', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    transitMock.plan.mockResolvedValue({ itineraries: [] });
    await withHarness(user.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({ name: 'plan_transit_route', arguments: planArguments(trip.id, day.id) });
      expect(result.isError).not.toBe(true);
      expect((parseToolResult(result) as any).itineraries).toEqual([]);
    });
  });

  it('returns the provider error message as an MCP error', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    transitMock.plan.mockRejectedValue(providerError('Transit planner unavailable', 502));
    await withHarness(user.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({ name: 'plan_transit_route', arguments: planArguments(trip.id, day.id) });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Transit planner unavailable');
      expect(errorSpy).not.toHaveBeenCalled();
    });
    errorSpy.mockRestore();
  });

  it('logs unexpected planning failures without exposing internal details', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    transitMock.plan.mockRejectedValue(new Error('database password appeared in an internal stack'));
    await withHarness(user.id, ['places:read'], async (h) => {
      const result = await h.client.callTool({ name: 'plan_transit_route', arguments: planArguments(trip.id, day.id) });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Failed to plan transit route.');
      expect((result.content[0] as any).text).not.toContain('database password');
      expect(errorSpy).toHaveBeenCalledWith('[MCP] transit route planning failed:', expect.any(Error));
    });
    errorSpy.mockRestore();
  });

  it('rate-limits the 61st plan call before making another provider call', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    transitMock.plan.mockResolvedValue({ itineraries: [] });
    await withHarness(user.id, ['places:read'], async (h) => {
      for (let index = 0; index < 60; index += 1) {
        const result = await h.client.callTool({
          name: 'plan_transit_route',
          arguments: planArguments(trip.id, day.id),
        });
        expect(result.isError).not.toBe(true);
      }
      const limited = await h.client.callTool({
        name: 'plan_transit_route',
        arguments: planArguments(trip.id, day.id),
      });
      expect(limited.isError).toBe(true);
      expect((limited.content[0] as any).text).toBe('Transit provider rate limit exceeded. Try again later.');
      expect(transitMock.plan).toHaveBeenCalledTimes(60);
    });
  });
});

function writeArguments(tripId: number, dayId: number, overrides: Record<string, unknown> = {}) {
  return {
    tripId,
    dayId,
    from: { name: 'Station A', lat: 52.52, lng: 13.405 },
    to: { name: 'Station B', lat: 52.5, lng: 13.4 },
    itinerary: route(),
    ...overrides,
  };
}

describe('MCP transit write-tool registration', () => {
  it('registers write tools for reservations:write independently from read tools', async () => {
    const { user } = createUser(testDb);
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const tools = (await h.client.listTools()).tools;
      const names = tools.map((tool) => tool.name);
      expect(names).toContain('create_transit_route');
      expect(names).toContain('update_transit_route');
      expect(names).not.toContain('search_transit_stops');
      expect(names).not.toContain('plan_transit_route');

      for (const name of ['create_transit_route', 'update_transit_route']) {
        const tool = tools.find((candidate) => candidate.name === name)!;
        const schema = tool.inputSchema as any;
        expect(schema.properties).not.toHaveProperty('status');
        expect(schema.properties).not.toHaveProperty('booking');
        expect(schema.properties).not.toHaveProperty('ticket');
        expect(schema.properties).not.toHaveProperty('price');
        expect(tool.annotations?.readOnlyHint).toBe(false);
        expect(tool.annotations?.idempotentHint).toBe(name === 'update_transit_route');
      }
    });
  });

  it('registers write tools for static full access but not reservations:read', async () => {
    const { user } = createUser(testDb);
    await withHarness(user.id, null, async (h) => {
      const names = (await h.client.listTools()).tools.map((tool) => tool.name);
      expect(names).toContain('create_transit_route');
      expect(names).toContain('update_transit_route');
    });
    await withHarness(user.id, ['reservations:read'], async (h) => {
      const names = (await h.client.listTools()).tools.map((tool) => tool.name);
      expect(names).not.toContain('create_transit_route');
      expect(names).not.toContain('update_transit_route');
    });
  });
});

describe('Tool: create_transit_route', () => {
  it('creates a selected itinerary without contacting Transitous', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const data = parseToolResult(
        await h.client.callTool({
          name: 'create_transit_route',
          arguments: writeArguments(trip.id, day.id, {
            from: { name: 'Hotel', lat: 35.689, lng: 139.692 },
            to: { name: 'Temple', lat: 35.7148, lng: 139.7967 },
            itinerary: route({
              startTime: '2026-10-02T00:00:00.000Z',
              endTime: '2026-10-02T00:30:00.000Z',
            }),
          }),
        }),
      ) as any;
      expect(data.reservation.type).toBe('transit');
      expect(data.reservation.status).toBe('confirmed');
      expect(transitMock.plan).not.toHaveBeenCalled();
      expect(transitMock.geocode).not.toHaveBeenCalled();
      expect(broadcastMock).toHaveBeenCalledWith(
        trip.id,
        'reservation:created',
        expect.objectContaining({ _source: 'mcp' }),
      );
    });
  });

  it('uses explicit title and notes overrides', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const data = parseToolResult(
        await h.client.callTool({
          name: 'create_transit_route',
          arguments: writeArguments(trip.id, day.id, { title: '  Morning metro  ', notes: 'Window side' }),
        }),
      ) as any;
      expect(data.reservation.title).toBe('Morning metro');
      expect(data.reservation.notes).toBe('Window side');
    });
  });

  it('rejects demo mode before mutation', async () => {
    const { user } = createUser(testDb, { email: 'demo@trek.app' });
    const { trip, day } = datedTrip(user.id);
    process.env.DEMO_MODE = 'true';
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const result = await h.client.callTool({
        name: 'create_transit_route',
        arguments: writeArguments(trip.id, day.id),
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Write operations are disabled in demo mode.');
    });
    expect(testDb.prepare('SELECT COUNT(*) count FROM reservations').get()).toEqual({ count: 0 });
  });

  it('rejects an inaccessible trip before mutation', async () => {
    const owner = createUser(testDb).user;
    const outsider = createUser(testDb).user;
    const { trip, day } = datedTrip(owner.id);
    await withHarness(outsider.id, ['reservations:write'], async (h) => {
      const result = await h.client.callTool({
        name: 'create_transit_route',
        arguments: writeArguments(trip.id, day.id),
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Trip not found or access denied.');
    });
    expect(testDb.prepare('SELECT COUNT(*) count FROM reservations').get()).toEqual({ count: 0 });
  });

  it('rejects reservation_edit permission before mutation', async () => {
    const owner = createUser(testDb).user;
    const member = createUser(testDb).user;
    const { trip, day } = datedTrip(owner.id);
    addTripMember(testDb, trip.id, member.id);
    testDb.prepare("INSERT INTO app_settings (key, value) VALUES ('perm_reservation_edit', 'trip_owner')").run();
    invalidatePermissionsCache();
    await withHarness(member.id, ['reservations:write'], async (h) => {
      const result = await h.client.callTool({
        name: 'create_transit_route',
        arguments: writeArguments(trip.id, day.id),
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe(
        'You do not have permission to perform this action on this trip.',
      );
    });
    expect(testDb.prepare('SELECT COUNT(*) count FROM reservations').get()).toEqual({ count: 0 });
  });

  it('rejects a foreign day and malformed itinerary without database mutation', async () => {
    const { user } = createUser(testDb);
    const first = datedTrip(user.id);
    const second = datedTrip(user.id);
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const foreignDay = await h.client.callTool({
        name: 'create_transit_route',
        arguments: writeArguments(first.trip.id, second.day.id),
      });
      expect(foreignDay.isError).toBe(true);
      expect((foreignDay.content[0] as any).text).toBe('Day does not belong to this trip.');

      const malformed = await h.client.callTool({
        name: 'create_transit_route',
        arguments: writeArguments(first.trip.id, first.day.id, { itinerary: { ...route(), legs: [] } }),
      });
      expect(malformed.isError).toBe(true);
    });
    expect(testDb.prepare('SELECT COUNT(*) count FROM reservations').get()).toEqual({ count: 0 });
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it('logs unexpected write failures and returns a generic MCP error', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    testDb.exec("CREATE TRIGGER fail_transit_insert BEFORE INSERT ON reservations BEGIN SELECT RAISE(ABORT, 'database password leaked'); END");
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const result = await h.client.callTool({
        name: 'create_transit_route',
        arguments: writeArguments(trip.id, day.id),
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Failed to create automated transit route.');
      expect((result.content[0] as any).text).not.toContain('database password');
      expect(errorSpy).toHaveBeenCalledWith('[MCP] transit route creation failed:', expect.any(Error));
      expect(broadcastMock).not.toHaveBeenCalled();
    });
    testDb.exec('DROP TRIGGER fail_transit_insert');
    errorSpy.mockRestore();
  });
});

describe('Tool: update_transit_route', () => {
  it('updates route-derived data while preserving title and notes', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const created = parseToolResult(
        await h.client.callTool({
          name: 'create_transit_route',
          arguments: writeArguments(trip.id, day.id, { title: 'Custom title', notes: 'Custom note' }),
        }),
      ) as any;
      broadcastMock.mockClear();
      const updated = parseToolResult(
        await h.client.callTool({
          name: 'update_transit_route',
          arguments: writeArguments(trip.id, day.id, {
            reservationId: created.reservation.id,
            from: { name: 'C', lat: 52.51, lng: 13.41 },
            to: { name: 'D', lat: 52.49, lng: 13.39 },
            itinerary: route({ endTime: '2026-10-02T08:45:00.000Z' }),
          }),
        }),
      ) as any;
      expect(updated.reservation.title).toBe('Custom title');
      expect(updated.reservation.notes).toBe('Custom note');
      expect(updated.reservation.endpoints[0].name).toBe('C');
      expect(transitMock.plan).not.toHaveBeenCalled();
      expect(transitMock.geocode).not.toHaveBeenCalled();
      expect(broadcastMock).toHaveBeenCalledWith(
        trip.id,
        'reservation:updated',
        expect.objectContaining({ _source: 'mcp' }),
      );
    });
  });

  it('applies explicit title and empty-notes overrides', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const created = parseToolResult(
        await h.client.callTool({
          name: 'create_transit_route',
          arguments: writeArguments(trip.id, day.id, { title: 'Old', notes: 'Remove me' }),
        }),
      ) as any;
      const updated = parseToolResult(
        await h.client.callTool({
          name: 'update_transit_route',
          arguments: writeArguments(trip.id, day.id, {
            reservationId: created.reservation.id,
            title: '  New title  ',
            notes: '',
          }),
        }),
      ) as any;
      expect(updated.reservation.title).toBe('New title');
      expect(updated.reservation.notes).toBeNull();
    });
  });

  it('rejects a non-transit target before mutation', async () => {
    const { user } = createUser(testDb);
    const { trip, day } = datedTrip(user.id);
    const manual = createReservation(testDb, trip.id, { title: 'Manual train', type: 'train', day_id: day.id });
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const result = await h.client.callTool({
        name: 'update_transit_route',
        arguments: writeArguments(trip.id, day.id, { reservationId: manual.id }),
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Target reservation is not an automated transit route');
    });
    expect(testDb.prepare('SELECT title, type FROM reservations WHERE id = ?').get(manual.id)).toEqual({
      title: 'Manual train',
      type: 'train',
    });
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it('rejects a foreign day before changing an automated route', async () => {
    const { user } = createUser(testDb);
    const first = datedTrip(user.id);
    const second = datedTrip(user.id);
    await withHarness(user.id, ['reservations:write'], async (h) => {
      const created = parseToolResult(
        await h.client.callTool({
          name: 'create_transit_route',
          arguments: writeArguments(first.trip.id, first.day.id, { title: 'Unchanged' }),
        }),
      ) as any;
      broadcastMock.mockClear();
      const result = await h.client.callTool({
        name: 'update_transit_route',
        arguments: writeArguments(first.trip.id, second.day.id, { reservationId: created.reservation.id }),
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as any).text).toBe('Day does not belong to this trip.');
      expect(testDb.prepare('SELECT title FROM reservations WHERE id = ?').get(created.reservation.id)).toEqual({
        title: 'Unchanged',
      });
      expect(broadcastMock).not.toHaveBeenCalled();
    });
  });
});

describe('automated and manual transit coexistence', () => {
  it('keeps manual train creation independent from automated transit creation', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id, { start_date: '2026-10-02', end_date: '2026-10-03' });
    const day = testDb.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number').get(trip.id) as any;
    await withHarness(user.id, null, async (h) => {
      await h.client.callTool({
        name: 'create_transport',
        arguments: {
          tripId: trip.id,
          type: 'train',
          title: 'Manual night train',
          start_day_id: day.id,
          endpoints: [
            { role: 'from', sequence: 0, name: 'Manual A', lat: 52.52, lng: 13.405 },
            { role: 'to', sequence: 1, name: 'Manual B', lat: 50.06, lng: 19.94 },
          ],
        },
      });
      await h.client.callTool({
        name: 'create_transit_route',
        arguments: writeArguments(trip.id, day.id),
      });
    });
    const rows = testDb.prepare('SELECT title, type FROM reservations WHERE trip_id = ? ORDER BY id').all(trip.id);
    expect(rows).toEqual([
      { title: 'Manual night train', type: 'train' },
      { title: 'Station A → Station B', type: 'transit' },
    ]);
  });
});
