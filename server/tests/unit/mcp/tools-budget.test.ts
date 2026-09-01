/**
 * Unit tests for MCP budget tools: create_budget_item, update_budget_item, delete_budget_item.
 */
import { runMigrations } from '../../../src/db/migrations';
import { createTables } from '../../../src/db/schema';
import { invalidatePermissionsCache, savePermissions } from '../../../src/services/permissions';
import { addTripMember, createBudgetItem, createReservation, createTrip, createUser } from '../../helpers/factories';
import { createMcpHarness, parseToolResult, type McpHarness } from '../../helpers/mcp-harness';
import { resetTestDb } from '../../helpers/test-db';

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  const mock = {
    db,
    closeDb: () => {},
    reinitialize: () => {},
    getPlaceWithTags: () => null,
    canAccessTrip: (tripId: any, userId: number) =>
      db
        .prepare(
          `SELECT t.id, t.user_id FROM trips t LEFT JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ? WHERE t.id = ? AND (t.user_id = ? OR m.user_id IS NOT NULL)`,
        )
        .get(userId, tripId, userId),
    isOwner: (tripId: any, userId: number) =>
      !!db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId),
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../../src/db/database', () => dbMock);
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-trek-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));

const { broadcastMock } = vi.hoisted(() => ({ broadcastMock: vi.fn() }));
vi.mock('../../../src/websocket', () => ({ broadcast: broadcastMock }));

import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { resetTestDb } from '../../helpers/test-db';
import { createUser, createTrip, createBudgetItem, createReservation, addTripMember } from '../../helpers/factories';
import { createMcpHarness, parseToolResult, parseResourceResult, type McpHarness } from '../../helpers/mcp-harness';
import { PermissionsService } from '../../../src/nest/permissions/permissions.service';
import { DatabaseService } from '../../../src/nest/database/database.service';

// Permission writes go through a service instance — the permissions cache is
// module-scoped, so the MCP shared checkPermission path sees the write.
const permissionsService = new PermissionsService(new DatabaseService(testDb));
const savePermissions = permissionsService.savePermissions.bind(permissionsService);

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});

beforeEach(() => {
  resetTestDb(testDb);
  invalidatePermissionsCache();
  broadcastMock.mockClear();
  delete process.env.DEMO_MODE;
});

afterAll(() => {
  testDb.close();
});

async function withHarness(userId: number, fn: (h: McpHarness) => Promise<void>) {
  const h = await createMcpHarness({ userId, withResources: false });
  try {
    await fn(h);
  } finally {
    await h.cleanup();
  }
}

// ---------------------------------------------------------------------------
// create_budget_item
// ---------------------------------------------------------------------------

describe('Tool: create_budget_item', () => {
  it('creates a budget item with all fields', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'create_budget_item',
        arguments: {
          tripId: trip.id,
          name: 'Hotel Paris',
          category: 'Accommodation',
          total_price: 500,
          note: 'Prepaid',
        },
      });
      const data = parseToolResult(result) as any;
      expect(data.item.name).toBe('Hotel Paris');
      expect(data.item.category).toBe('Accommodation');
      expect(data.item.total_price).toBe(500);
      expect(data.item.note).toBe('Prepaid');
    });
  });

  it('defaults category to "Other" when not specified', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'create_budget_item',
        arguments: { tripId: trip.id, name: 'Misc', total_price: 10 },
      });
      const data = parseToolResult(result) as any;
      expect(data.item.category).toBe('other');
    });
  });

  it('broadcasts budget:created event', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    await withHarness(user.id, async (h) => {
      await h.client.callTool({
        name: 'create_budget_item',
        arguments: { tripId: trip.id, name: 'Taxi', total_price: 25 },
      });
      expect(broadcastMock).toHaveBeenCalledWith(trip.id, 'budget:created', expect.any(Object));
    });
  });

  // Regression for #1244: a naive create must seed members so the client save-gate
  // (participants.size > 0) passes — the entry must be saveable, not member-less.
  it('defaults members to the trip owner when member_ids omitted (solo trip)', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'create_budget_item',
        arguments: { tripId: trip.id, name: 'Dinner', total_price: 40 },
      });
      const data = parseToolResult(result) as any;
      expect(data.item.members.map((m: any) => m.user_id)).toEqual([user.id]);
      expect(data.item.persons).toBe(1);
      // saveable invariant: client requires participants.size > 0
      expect(data.item.members.length).toBeGreaterThan(0);
    });
  });

  it('defaults members to all trip members when member_ids omitted (multi-member)', async () => {
    const { user } = createUser(testDb);
    const { user: member } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    addTripMember(testDb, trip.id, member.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'create_budget_item',
        arguments: { tripId: trip.id, name: 'Group taxi', total_price: 60 },
      });
      const data = parseToolResult(result) as any;
      const ids = data.item.members.map((m: any) => m.user_id).sort();
      expect(ids).toEqual([user.id, member.id].sort());
      expect(data.item.persons).toBe(2);
    });
  });

  it('respects an explicit member_ids subset', async () => {
    const { user } = createUser(testDb);
    const { user: member } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    addTripMember(testDb, trip.id, member.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'create_budget_item',
        arguments: { tripId: trip.id, name: 'My snack', total_price: 5, member_ids: [user.id] },
      });
      const data = parseToolResult(result) as any;
      expect(data.item.members.map((m: any) => m.user_id)).toEqual([user.id]);
    });
  });

  it('treats an explicit empty member_ids as a planning-only entry (no split)', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'create_budget_item',
        arguments: { tripId: trip.id, name: 'Estimate', total_price: 100, member_ids: [] },
      });
      const data = parseToolResult(result) as any;
      expect(data.item.members).toEqual([]);
    });
  });

  it('round-trips currency, expense_date, and payers', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'create_budget_item',
        arguments: {
          tripId: trip.id,
          name: 'Museum',
          total_price: 30,
          currency: 'EUR',
          expense_date: '2026-07-01',
          payers: [{ user_id: user.id, amount: 30 }],
        },
      });
      const data = parseToolResult(result) as any;
      expect(data.item.currency).toBe('EUR');
      expect(data.item.expense_date).toBe('2026-07-01');
      expect(data.item.payers.map((p: any) => p.user_id)).toEqual([user.id]);
      // total_price derives from payer sum
      expect(data.item.total_price).toBe(30);
    });
  });

  it('returns access denied for non-member', async () => {
    const { user } = createUser(testDb);
    const { user: other } = createUser(testDb);
    const trip = createTrip(testDb, other.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'create_budget_item',
        arguments: { tripId: trip.id, name: 'Hack', total_price: 0 },
      });
      expect(result.isError).toBe(true);
    });
  });

  it('blocks demo user', async () => {
    process.env.DEMO_MODE = 'true';
    const { user } = createUser(testDb, { email: 'demo@nomad.app' });
    const trip = createTrip(testDb, user.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'create_budget_item',
        arguments: { tripId: trip.id, name: 'X', total_price: 0 },
      });
      expect(result.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// update_budget_item
// ---------------------------------------------------------------------------

describe('Tool: update_budget_item', () => {
  it('updates budget item fields', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, trip.id, { name: 'Old', category: 'Food', total_price: 50 });
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'update_budget_item',
        arguments: { tripId: trip.id, itemId: item.id, name: 'New Name', total_price: 75 },
      });
      const data = parseToolResult(result) as any;
      expect(data.item.name).toBe('New Name');
      expect(data.item.total_price).toBe(75);
      expect(data.item.category).toBe('Food'); // preserved
    });
  });

  it('broadcasts budget:updated event', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, trip.id);
    await withHarness(user.id, async (h) => {
      await h.client.callTool({
        name: 'update_budget_item',
        arguments: { tripId: trip.id, itemId: item.id, name: 'Updated' },
      });
      expect(broadcastMock).toHaveBeenCalledWith(trip.id, 'budget:updated', expect.any(Object));
    });
  });

  it('returns error for item not found', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'update_budget_item',
        arguments: { tripId: trip.id, itemId: 99999, name: 'X' },
      });
      expect(result.isError).toBe(true);
    });
  });

  it('returns access denied for non-member', async () => {
    const { user } = createUser(testDb);
    const { user: other } = createUser(testDb);
    const trip = createTrip(testDb, other.id);
    const item = createBudgetItem(testDb, trip.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'update_budget_item',
        arguments: { tripId: trip.id, itemId: item.id, name: 'X' },
      });
      expect(result.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// delete_budget_item
// ---------------------------------------------------------------------------

describe('Tool: delete_budget_item', () => {
  it('deletes an existing budget item', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, trip.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'delete_budget_item',
        arguments: { tripId: trip.id, itemId: item.id },
      });
      const data = parseToolResult(result) as any;
      expect(data.success).toBe(true);
      expect(testDb.prepare('SELECT id FROM budget_items WHERE id = ?').get(item.id)).toBeUndefined();
    });
  });

  it('broadcasts budget:deleted event', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, trip.id);
    await withHarness(user.id, async (h) => {
      await h.client.callTool({ name: 'delete_budget_item', arguments: { tripId: trip.id, itemId: item.id } });
      expect(broadcastMock).toHaveBeenCalledWith(trip.id, 'budget:deleted', expect.any(Object));
    });
  });

  it('returns error for item not found', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'delete_budget_item',
        arguments: { tripId: trip.id, itemId: 99999 },
      });
      expect(result.isError).toBe(true);
    });
  });

  it('returns access denied for non-member', async () => {
    const { user } = createUser(testDb);
    const { user: other } = createUser(testDb);
    const trip = createTrip(testDb, other.id);
    const item = createBudgetItem(testDb, trip.id);
    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'delete_budget_item',
        arguments: { tripId: trip.id, itemId: item.id },
      });
      expect(result.isError).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Resource: trek://trips/{tripId}/budget (moved from the legacy resources.ts
// registrar to the DI-discovered BudgetMcp — attached via the nest-mcp registry)
// ---------------------------------------------------------------------------

describe('Resource: trek://trips/{tripId}/budget', () => {
  it('returns budget items for a trip', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    createBudgetItem(testDb, trip.id, { name: 'Hotel', category: 'Accommodation', total_price: 200 });

    await withHarness(user.id, async (h) => {
      const result = await h.client.readResource({ uri: `trek://trips/${trip.id}/budget` });
      const items = parseResourceResult(result) as { name: string }[];
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Hotel');
    });
  });

  it('returns access denied for unauthorized trip', async () => {
    const { user } = createUser(testDb);
    const { user: other } = createUser(testDb);
    const trip = createTrip(testDb, other.id);

    await withHarness(user.id, async (h) => {
      const result = await h.client.readResource({ uri: `trek://trips/${trip.id}/budget` });
      const data = parseResourceResult(result) as { error?: string };
      expect(data.error).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// link_budget_item_to_reservation / unlink_budget_item_from_reservation
// ---------------------------------------------------------------------------

describe('Tool: link_budget_item_to_reservation', () => {
  it('links an existing budget item to an existing reservation and broadcasts budget:updated', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, trip.id, { name: 'Hotel deposit', category: 'accommodation', total_price: 150 });
    const reservation = createReservation(testDb, trip.id, { title: 'Hotel', type: 'hotel' });

    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'link_budget_item_to_reservation',
        arguments: { tripId: trip.id, itemId: item.id, reservationId: reservation.id },
      });
      expect(result.isError).toBeFalsy();
      const data = parseToolResult(result) as any;
      expect(data.changed).toBe(true);
      expect(data.item.id).toBe(item.id);
      expect(data.item.reservation_id).toBe(reservation.id);
    });

    expect(broadcastMock).toHaveBeenCalledWith(
      trip.id,
      'budget:updated',
      expect.objectContaining({ item: expect.objectContaining({ id: item.id, reservation_id: reservation.id }) }),
    );
  });

  it('allows multiple costs to link to one reservation', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const first = createBudgetItem(testDb, trip.id, { name: 'Deposit' });
    const second = createBudgetItem(testDb, trip.id, { name: 'Balance' });

    await withHarness(user.id, async (h) => {
      for (const item of [first, second]) {
        const result = await h.client.callTool({
          name: 'link_budget_item_to_reservation',
          arguments: { tripId: trip.id, itemId: item.id, reservationId: reservation.id },
        });
        expect(result.isError).toBeFalsy();
      }
    });

    const count = testDb.prepare('SELECT COUNT(*) AS count FROM budget_items WHERE reservation_id = ?').get(reservation.id) as { count: number };
    expect(count.count).toBe(2);
  });

  it('rejects a wrong-trip reservation', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const other = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, trip.id);
    const otherReservation = createReservation(testDb, other.id);

    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'link_budget_item_to_reservation',
        arguments: { tripId: trip.id, itemId: item.id, reservationId: otherReservation.id },
      });
      expect(result.isError).toBe(true);
      expect((result.content?.[0] as any)?.text).toBe('Reservation not found.');
    });
    expect((testDb.prepare('SELECT reservation_id FROM budget_items WHERE id = ?').get(item.id) as any).reservation_id).toBeNull();
  });

  it('requires reservation_edit in addition to budget_edit', async () => {
    const { user: owner } = createUser(testDb);
    const { user: member } = createUser(testDb);
    const trip = createTrip(testDb, owner.id);
    addTripMember(testDb, trip.id, member.id);
    const item = createBudgetItem(testDb, trip.id);
    const reservation = createReservation(testDb, trip.id);
    savePermissions({ budget_edit: 'trip_member', reservation_edit: 'trip_owner' });

    await withHarness(member.id, async (h) => {
      const result = await h.client.callTool({
        name: 'link_budget_item_to_reservation',
        arguments: { tripId: trip.id, itemId: item.id, reservationId: reservation.id },
      });
      expect(result.isError).toBe(true);
    });
    expect((testDb.prepare('SELECT reservation_id FROM budget_items WHERE id = ?').get(item.id) as any).reservation_id).toBeNull();
  });

  it('requires budget_edit in addition to reservation_edit', async () => {
    const { user: owner } = createUser(testDb);
    const { user: member } = createUser(testDb);
    const trip = createTrip(testDb, owner.id);
    addTripMember(testDb, trip.id, member.id);
    const item = createBudgetItem(testDb, trip.id);
    const reservation = createReservation(testDb, trip.id);
    savePermissions({ budget_edit: 'trip_owner', reservation_edit: 'trip_member' });

    await withHarness(member.id, async (h) => {
      const result = await h.client.callTool({
        name: 'link_budget_item_to_reservation',
        arguments: { tripId: trip.id, itemId: item.id, reservationId: reservation.id },
      });
      expect(result.isError).toBe(true);
    });
    expect((testDb.prepare('SELECT reservation_id FROM budget_items WHERE id = ?').get(item.id) as any).reservation_id).toBeNull();
  });
});

describe('Tool: unlink_budget_item_from_reservation', () => {
  it('clears only the selected item link, preserves the cost, and leaves siblings linked', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const linked = createBudgetItem(testDb, trip.id, { name: 'Linked', total_price: 90 });
    const sibling = createBudgetItem(testDb, trip.id, { name: 'Sibling', total_price: 10 });
    testDb.prepare('UPDATE budget_items SET reservation_id = ? WHERE id IN (?, ?)').run(reservation.id, linked.id, sibling.id);

    await withHarness(user.id, async (h) => {
      const result = await h.client.callTool({
        name: 'unlink_budget_item_from_reservation',
        arguments: { tripId: trip.id, itemId: linked.id },
      });
      expect(result.isError).toBeFalsy();
      const data = parseToolResult(result) as any;
      expect(data.changed).toBe(true);
      expect(data.item.reservation_id).toBeNull();
      expect(data.item.name).toBe('Linked');
      expect(data.item.total_price).toBe(90);
    });

    expect(broadcastMock).toHaveBeenCalledWith(trip.id, 'budget:updated', expect.objectContaining({ item: expect.objectContaining({ id: linked.id, reservation_id: null }) }));
    const siblingRow = testDb.prepare('SELECT reservation_id FROM budget_items WHERE id = ?').get(sibling.id) as any;
    expect(siblingRow.reservation_id).toBe(reservation.id);
    expect(testDb.prepare('SELECT id FROM budget_items WHERE id = ?').get(linked.id)).toBeDefined();
    expect(testDb.prepare('SELECT id FROM reservations WHERE id = ?').get(reservation.id)).toBeDefined();
  });

  it('requires reservation_edit for the unlink too', async () => {
    const { user: owner } = createUser(testDb);
    const { user: member } = createUser(testDb);
    const trip = createTrip(testDb, owner.id);
    addTripMember(testDb, trip.id, member.id);
    const reservation = createReservation(testDb, trip.id);
    const item = createBudgetItem(testDb, trip.id);
    testDb.prepare('UPDATE budget_items SET reservation_id = ? WHERE id = ?').run(reservation.id, item.id);
    savePermissions({ budget_edit: 'trip_member', reservation_edit: 'trip_owner' });

    await withHarness(member.id, async (h) => {
      const result = await h.client.callTool({
        name: 'unlink_budget_item_from_reservation',
        arguments: { tripId: trip.id, itemId: item.id },
      });
      expect(result.isError).toBe(true);
    });
    expect((testDb.prepare('SELECT reservation_id FROM budget_items WHERE id = ?').get(item.id) as any).reservation_id).toBe(reservation.id);
  });
});
