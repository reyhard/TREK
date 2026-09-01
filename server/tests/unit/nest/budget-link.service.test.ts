/**
 * DB-backed unit tests for BudgetService cost↔reservation linking
 * (BUDGET-LINK-001+). Links/unlinks an EXISTING budget item to/from a
 * reservation WITHOUT recreating the expense. The unlink must clear only the
 * reservation_id column and deep-preserve every other cost field — financial
 * totals, currency, exchange rate, category, note, date, members, payers,
 * persons, days, and unrelated reservation links.
 */
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
    canAccessTrip: () => null,
    isOwner: () => false,
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../../src/db/database', () => dbMock);
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test-secret',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));
vi.mock('../../../src/websocket', () => ({ broadcast: vi.fn() }));

import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { resetTestDb } from '../../helpers/test-db';
import { createUser, createTrip, createBudgetItem, createReservation, addTripMember } from '../../helpers/factories';
import { BudgetService } from '../../../src/nest/budget/budget.service';
import { DatabaseService } from '../../../src/nest/database/database.service';
import { PermissionsService } from '../../../src/nest/permissions/permissions.service';
import { ExchangeRatesService } from '../../../src/nest/budget/exchange-rates.service';
import { RealtimeService } from '../../../src/nest/realtime/realtime.service';

const budget = new BudgetService(
  new DatabaseService(testDb),
  new PermissionsService(new DatabaseService(testDb)),
  new ExchangeRatesService(),
  new RealtimeService(),
);

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

/** A fully-populated cost row: financial + split + category/date state. */
function richItem(tripId: number) {
  const { user: owner } = createUser(testDb);
  const { user: member } = createUser(testDb);
  addTripMember(testDb, tripId, member.id);
  const item = createBudgetItem(testDb, tripId, {
    name: 'Rail pass',
    category: 'transport',
    total_price: 88,
  });
  testDb.prepare(
    'UPDATE budget_items SET currency = ?, exchange_rate = ?, note = ?, persons = ?, days = ?, expense_date = ? WHERE id = ?',
  ).run('EUR', 1.0, 'Non-refundable, keep receipt', 2, 3, '2026-10-01', item.id);
  testDb.prepare('INSERT INTO budget_item_members (budget_item_id, user_id, paid, amount) VALUES (?, ?, 0, 44)').run(item.id, owner.id);
  testDb.prepare('INSERT INTO budget_item_members (budget_item_id, user_id, paid, amount) VALUES (?, ?, 0, 44)').run(item.id, member.id);
  testDb.prepare('INSERT INTO budget_item_payers (budget_item_id, user_id, amount) VALUES (?, ?, ?)').run(item.id, owner.id, 88);
  return { owner, member, item };
}

describe('BudgetService linkExistingBudgetItemToReservation', () => {
  it('BUDGET-LINK-001: links an unlinked existing cost without recreating it', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const { owner, item } = richItem(trip.id);
    const before = budget.getBudgetItem(item.id, trip.id)!;

    const result = budget.linkExistingBudgetItemToReservation(trip.id, item.id, reservation.id);

    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error(result.error);
    expect(result.changed).toBe(true);
    expect(result.item.id).toBe(item.id);
    expect(result.item.reservation_id).toBe(reservation.id);
    // The same row — nothing recreated, id unchanged, members/payers preserved.
    const after = budget.getBudgetItem(item.id, trip.id)!;
    expect(after.id).toBe(before.id);
    expect(after.members?.map(m => m.user_id).sort()).toEqual(before.members?.map(m => m.user_id).sort());
    expect(after.payers?.map(p => p.user_id).sort()).toEqual(before.payers?.map(p => p.user_id).sort());
    expect(owner.id).toBeGreaterThan(0);
  });

  it('BUDGET-LINK-002: allows multiple costs to link to one reservation (cardinality)', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const a = createBudgetItem(testDb, trip.id, { name: 'Deposit', total_price: 100 });
    const b = createBudgetItem(testDb, trip.id, { name: 'Balance', total_price: 300 });

    expect(budget.linkExistingBudgetItemToReservation(trip.id, a.id, reservation.id).ok).toBe(true);
    expect(budget.linkExistingBudgetItemToReservation(trip.id, b.id, reservation.id).ok).toBe(true);

    const linked = testDb
      .prepare('SELECT id FROM budget_items WHERE trip_id = ? AND reservation_id = ? ORDER BY id')
      .all(trip.id, reservation.id) as { id: number }[];
    expect(linked.map(r => r.id)).toEqual([a.id, b.id]);
  });

  it('BUDGET-LINK-003: treating the same link as an idempotent no-op', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const item = createBudgetItem(testDb, trip.id);
    testDb.prepare('UPDATE budget_items SET reservation_id = ? WHERE id = ?').run(reservation.id, item.id);

    const result = budget.linkExistingBudgetItemToReservation(trip.id, item.id, reservation.id);
    expect(result).toMatchObject({ ok: true, changed: false });
  });

  it('BUDGET-LINK-004: rejects relinking an item already linked to another reservation', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const first = createReservation(testDb, trip.id);
    const second = createReservation(testDb, trip.id);
    const item = createBudgetItem(testDb, trip.id);
    testDb.prepare('UPDATE budget_items SET reservation_id = ? WHERE id = ?').run(first.id, item.id);

    const result = budget.linkExistingBudgetItemToReservation(trip.id, item.id, second.id);
    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error('expected failure');
    expect(result.error).toBe('already_linked');
    expect(result.linkedReservationId).toBe(first.id);
    expect((testDb.prepare('SELECT reservation_id FROM budget_items WHERE id = ?').get(item.id) as any).reservation_id).toBe(first.id);
  });

  it('BUDGET-LINK-005: rejects a wrong-trip item (budget_item_not_found)', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const other = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const item = createBudgetItem(testDb, other.id);

    const result = budget.linkExistingBudgetItemToReservation(trip.id, item.id, reservation.id);
    expect(result).toEqual({ ok: false, error: 'budget_item_not_found' });
  });

  it('BUDGET-LINK-006: rejects a wrong-trip reservation (reservation_not_found)', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const other = createTrip(testDb, user.id);
    const otherReservation = createReservation(testDb, other.id);
    const item = createBudgetItem(testDb, trip.id);

    const result = budget.linkExistingBudgetItemToReservation(trip.id, item.id, otherReservation.id);
    expect(result).toEqual({ ok: false, error: 'reservation_not_found' });
  });
});

describe('BudgetService updateBudgetItem reservation_id routing (REST/service path)', () => {
  it('BUDGET-LINK-012: updateBudgetItem with reservation_id links an existing cost via the canonical method', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const { item } = richItem(trip.id);

    const updated = budget.updateBudgetItem(item.id, trip.id, { reservation_id: reservation.id } as any);

    expect(updated).not.toBeNull();
    expect((updated as any).reservation_id).toBe(reservation.id);
    // Members/payers preserved through the link path.
    expect((updated as any).members?.length).toBe(2);
    expect((updated as any).payers?.length).toBe(1);
  });

  it('BUDGET-LINK-013: updateBudgetItem with reservation_id null unlinks via the canonical method', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const { item } = richItem(trip.id);
    testDb.prepare('UPDATE budget_items SET reservation_id = ? WHERE id = ?').run(reservation.id, item.id);
    const before = budget.getBudgetItem(item.id, trip.id)!;

    const updated = budget.updateBudgetItem(item.id, trip.id, { reservation_id: null } as any);

    expect(updated).not.toBeNull();
    const after = updated as any;
    expect(after.reservation_id).toBeNull();
    // Deep-preserve every financial/split field (same invariants as BUDGET-LINK-007).
    expect(after.name).toBe(before.name);
    expect(after.category).toBe(before.category);
    expect(after.total_price).toBe(before.total_price);
    expect(after.currency).toBe(before.currency);
    expect(after.note).toBe(before.note);
    expect(after.members).toEqual(before.members);
    expect(after.payers).toEqual(before.payers);
  });

  it('BUDGET-LINK-014: updateBudgetItem with an invalid reservation_id resolves through the canonical reject (no partial write)', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const other = createTrip(testDb, user.id);
    const otherReservation = createReservation(testDb, other.id);
    const item = createBudgetItem(testDb, trip.id);

    expect(() => budget.updateBudgetItem(item.id, trip.id, { reservation_id: otherReservation.id } as any)).toThrow();
    // Nothing written.
    expect((testDb.prepare('SELECT reservation_id FROM budget_items WHERE id = ?').get(item.id) as any).reservation_id).toBeNull();
  });
});

describe('BudgetService unlinkBudgetItemFromReservation', () => {
  it('BUDGET-LINK-007: unlinks a cost and deep-preserves every financial/split field', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const { item } = richItem(trip.id);
    testDb.prepare('UPDATE budget_items SET reservation_id = ? WHERE id = ?').run(reservation.id, item.id);

    const before = budget.getBudgetItem(item.id, trip.id)!;
    const result = budget.unlinkBudgetItemFromReservation(trip.id, item.id);

    expect(result.ok).toBe(true);
    if (result.ok === false) throw new Error(result.error);
    expect(result.changed).toBe(true);
    const after = budget.getBudgetItem(item.id, trip.id)!;
    expect(after.id).toBe(before.id);
    // The link column is cleared.
    expect(after.reservation_id).toBeNull();
    // Every other field deep-equals: name, category, financials, split, metadata.
    expect(after.name).toBe(before.name);
    expect(after.category).toBe(before.category);
    expect(after.total_price).toBe(before.total_price);
    expect(after.currency).toBe(before.currency);
    expect(after.exchange_rate).toBe(before.exchange_rate);
    expect(after.note).toBe(before.note);
    expect(after.persons).toBe(before.persons);
    expect(after.days).toBe(before.days);
    expect(after.expense_date).toBe(before.expense_date);
    expect(after.members).toEqual(before.members);
    expect(after.payers).toEqual(before.payers);
  });

  it('BUDGET-LINK-008: unlink keeps other costs linked to the same reservation', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const linked = createBudgetItem(testDb, trip.id, { name: 'Linked', total_price: 90 });
    const sibling = createBudgetItem(testDb, trip.id, { name: 'Sibling', total_price: 10 });
    testDb.prepare('UPDATE budget_items SET reservation_id = ? WHERE id IN (?, ?)').run(reservation.id, linked.id, sibling.id);

    budget.unlinkBudgetItemFromReservation(trip.id, linked.id);

    const siblingRow = testDb.prepare('SELECT reservation_id FROM budget_items WHERE id = ?').get(sibling.id) as any;
    expect(siblingRow.reservation_id).toBe(reservation.id);
    expect(testDb.prepare('SELECT id FROM reservations WHERE id = ?').get(reservation.id)).toBeDefined();
  });

  it('BUDGET-LINK-009: unlink never deletes the reservation or the cost', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const reservation = createReservation(testDb, trip.id);
    const { item } = richItem(trip.id);
    testDb.prepare('UPDATE budget_items SET reservation_id = ? WHERE id = ?').run(reservation.id, item.id);

    budget.unlinkBudgetItemFromReservation(trip.id, item.id);

    expect(testDb.prepare('SELECT id FROM budget_items WHERE id = ?').get(item.id)).toBeDefined();
    expect(testDb.prepare('SELECT id FROM reservations WHERE id = ?').get(reservation.id)).toBeDefined();
  });

  it('BUDGET-LINK-010: unlinking an already-unlinked item is an idempotent no-op', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, trip.id);

    const result = budget.unlinkBudgetItemFromReservation(trip.id, item.id);
    expect(result).toMatchObject({ ok: true, changed: false });
  });

  it('BUDGET-LINK-011: returns budget_item_not_found for a missing / wrong-trip item', () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const other = createTrip(testDb, user.id);
    const item = createBudgetItem(testDb, other.id);

    expect(budget.unlinkBudgetItemFromReservation(trip.id, 999999)).toEqual({ ok: false, error: 'budget_item_not_found' });
    expect(budget.unlinkBudgetItemFromReservation(trip.id, item.id)).toEqual({ ok: false, error: 'budget_item_not_found' });
  });
});
