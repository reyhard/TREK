import { runMigrations } from '../../../src/db/migrations';
import { createTables } from '../../../src/db/schema';
import {
  linkExistingBudgetItemToReservation,
  unlinkBudgetItemFromReservation,
} from '../../../src/services/budgetService';
import { addTripMember, createBudgetItem, createReservation, createTrip, createUser } from '../../helpers/factories';
import { resetTestDb } from '../../helpers/test-db';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  JWT_SECRET: 'test-secret',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));

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

describe('linkExistingBudgetItemToReservation', () => {
  it('links an unlinked budget item and returns a hydrated item', () => {
    const { user: owner } = createUser(testDb);
    const { user: member } = createUser(testDb);
    const trip = createTrip(testDb, owner.id);
    addTripMember(testDb, trip.id, member.id);
    const reservation = createReservation(testDb, trip.id, { title: 'Ryokan', type: 'hotel' });

    const item = createBudgetItem(testDb, trip.id, {
      name: 'Ryokan deposit',
      category: 'accommodation',
      total_price: 120,
    });
    testDb
      .prepare('INSERT INTO budget_item_members (budget_item_id, user_id, paid) VALUES (?, ?, 0)')
      .run(item.id, member.id);
    testDb
      .prepare('INSERT INTO budget_item_payers (budget_item_id, user_id, amount) VALUES (?, ?, ?)')
      .run(item.id, owner.id, 120);

    const result = linkExistingBudgetItemToReservation(trip.id, item.id, reservation.id);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.changed).toBe(true);
    expect(result.item.reservation_id).toBe(reservation.id);
    expect(result.item.members?.map((m) => m.user_id)).toEqual([member.id]);
    expect(result.item.payers?.map((p) => p.user_id)).toEqual([owner.id]);
  });

  it('treats linking to the same reservation as an idempotent no-op', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const item = createBudgetItem(testDb, trip.id);
    testDb.prepare('UPDATE budget_items SET reservation_id = ? WHERE id = ?').run(reservation.id, item.id);

    const result = linkExistingBudgetItemToReservation(trip.id, item.id, reservation.id);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.changed).toBe(false);
    expect(result.item.reservation_id).toBe(reservation.id);
  });

  it('rejects moving an item that is linked to another reservation', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const first = createReservation(testDb, trip.id, { title: 'First' });
    const second = createReservation(testDb, trip.id, { title: 'Second' });
    const item = createBudgetItem(testDb, trip.id);
    testDb.prepare('UPDATE budget_items SET reservation_id = ? WHERE id = ?').run(first.id, item.id);

    const result = linkExistingBudgetItemToReservation(trip.id, item.id, second.id);

    expect(result).toEqual({
      ok: false,
      error: 'already_linked',
      linkedReservationId: first.id,
    });
    expect(
      (testDb.prepare('SELECT reservation_id FROM budget_items WHERE id = ?').get(item.id) as any).reservation_id,
    ).toBe(first.id);
  });

  it('returns budget_item_not_found for a missing item', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);

    expect(linkExistingBudgetItemToReservation(trip.id, 999999, reservation.id)).toEqual({
      ok: false,
      error: 'budget_item_not_found',
    });
  });

  it('returns reservation_not_found for a missing reservation', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, trip.id);

    expect(linkExistingBudgetItemToReservation(trip.id, item.id, 999999)).toEqual({
      ok: false,
      error: 'reservation_not_found',
    });
  });

  it('maps an item from another trip to budget_item_not_found', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const other = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const item = createBudgetItem(testDb, other.id);

    expect(linkExistingBudgetItemToReservation(trip.id, item.id, reservation.id)).toEqual({
      ok: false,
      error: 'budget_item_not_found',
    });
  });

  it('maps a reservation from another trip to reservation_not_found', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const other = createTrip(testDb, user.id);
    const otherReservation = createReservation(testDb, other.id);
    const item = createBudgetItem(testDb, trip.id);

    expect(linkExistingBudgetItemToReservation(trip.id, item.id, otherReservation.id)).toEqual({
      ok: false,
      error: 'reservation_not_found',
    });
  });

  it('allows multiple budget items to link to one reservation', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const deposit = createBudgetItem(testDb, trip.id, { name: 'Deposit', total_price: 100 });
    const balance = createBudgetItem(testDb, trip.id, { name: 'Balance', total_price: 300 });

    expect(linkExistingBudgetItemToReservation(trip.id, deposit.id, reservation.id).ok).toBe(true);
    expect(linkExistingBudgetItemToReservation(trip.id, balance.id, reservation.id).ok).toBe(true);

    const linked = testDb
      .prepare('SELECT id FROM budget_items WHERE trip_id = ? AND reservation_id = ? ORDER BY id')
      .all(trip.id, reservation.id) as { id: number }[];
    expect(linked.map((row) => row.id)).toEqual([deposit.id, balance.id]);
  });
});

describe('unlinkBudgetItemFromReservation', () => {
  it('unlinks the item while preserving all cost data', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const item = createBudgetItem(testDb, trip.id, {
      name: 'Rail pass',
      category: 'transport',
      total_price: 88,
    });
    testDb
      .prepare('UPDATE budget_items SET reservation_id = ?, note = ?, currency = ?, expense_date = ? WHERE id = ?')
      .run(reservation.id, 'Non-refundable', 'EUR', '2026-10-01', item.id);

    const result = unlinkBudgetItemFromReservation(trip.id, item.id);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.changed).toBe(true);
    expect(result.item).toMatchObject({
      id: item.id,
      reservation_id: null,
      name: 'Rail pass',
      category: 'transport',
      total_price: 88,
      note: 'Non-refundable',
      currency: 'EUR',
      expense_date: '2026-10-01',
    });
    expect(testDb.prepare('SELECT id FROM reservations WHERE id = ?').get(reservation.id)).toBeDefined();
  });

  it('treats unlinking an unlinked item as an idempotent no-op', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, trip.id);

    const result = unlinkBudgetItemFromReservation(trip.id, item.id);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.changed).toBe(false);
    expect(result.item.reservation_id).toBeNull();
  });

  it('returns budget_item_not_found for a missing item', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);

    expect(unlinkBudgetItemFromReservation(trip.id, 999999)).toEqual({
      ok: false,
      error: 'budget_item_not_found',
    });
  });

  it('maps an item from another trip to budget_item_not_found', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const other = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, other.id);

    expect(unlinkBudgetItemFromReservation(trip.id, item.id)).toEqual({
      ok: false,
      error: 'budget_item_not_found',
    });
  });
});
