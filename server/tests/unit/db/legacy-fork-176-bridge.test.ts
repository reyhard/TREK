/**
 * Legacy fork schema-176 compatibility bridge tests.
 *
 * A fork built from v3.4.1 carried its own migration 176 slot: at array index
 * 175 it added `oauth_tokens.user_password_version`, whereas upstream 4.0's
 * index 175 is the "half vacation days" migration that adds
 * `vacay_entries.fraction`. A legacy fork DB therefore reports schema version
 * 176 but has NO `vacay_entries.fraction` column. Unmodified v4.0.0 starts its
 * loop at i=176, so it silently skips index 175 and ends at schema 198 with
 * `fraction` missing — every vacay SUM(fraction) query then crashes at runtime.
 *
 * The bridge recognises the exact legacy-fork signature (version 176 +
 * user_password_version present + fraction absent) and rewinds schema_version
 * to 175 so the normal upstream 176–198 sequence runs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import {
  createUser,
  createTrip,
  createDay,
  createPlace,
  createReservation,
  createBudgetItem,
} from '../../helpers/factories';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');
  createTables(db);
});

afterEach(() => {
  db.close();
});

function hasColumn(table: string, column: string): boolean {
  return !!db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column);
}

function schemaVersion(): number {
  return (db.prepare('SELECT version FROM schema_version').get() as { version: number }).version;
}

/**
 * Builds the exact legacy-fork schema-176 state:
 *  - runs the upstream 0..174 chain (schema 175), identical to what the fork
 *    had at v3.4.1 parity;
 *  - seeds a REAL oauth_tokens row (as a genuine fork DB had): a client + token
 *    issued BEFORE the fork's migration 176, whose owner bumped `password_version`
 *    to 3 — so the backfill below binds the token to version 3;
 *  - applies the fork's index-175 migration (`oauth_tokens.user_password_version`
 *    + backfill) exactly as fork-pre-4.0 does;
 *  - leaves schema_version at 176.
 */
function buildLegacyFork176(): void {
  runMigrations(db, 175);
  const { user } = createUser(db);
  db.prepare('UPDATE users SET password_version = 3 WHERE id = ?').run(user.id);
  db.prepare(`
    INSERT INTO oauth_clients (id, user_id, name, client_id, client_secret_hash)
    VALUES (?, ?, ?, ?, ?)
  `).run('legacy-fork-client', user.id, 'Legacy Fork MCP', 'legacy-fork-client-id', 'hashed-secret');
  db.prepare(`
    INSERT INTO oauth_tokens (
      client_id, user_id, access_token_hash, refresh_token_hash,
      scopes, access_token_expires_at, refresh_token_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'legacy-fork-client-id',
    user.id,
    'legacy-fork-access-hash',
    'legacy-fork-refresh-hash',
    '[]',
    '2030-01-01T00:00:00.000Z',
    '2030-01-01T00:00:00.000Z',
  );
  db.exec('ALTER TABLE oauth_tokens ADD COLUMN user_password_version INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    UPDATE oauth_tokens
    SET user_password_version = COALESCE(
      (SELECT password_version FROM users WHERE users.id = oauth_tokens.user_id),
      0
    )
  `);
  db.prepare('UPDATE schema_version SET version = ?').run(176);
}

describe('runMigrations targetVersion support (needed to build faithful intermediate-state fixtures)', () => {
  it('TARGET-001: stops the chain at an intermediate version when targetVersion is given', () => {
    runMigrations(db, 175);
    expect(schemaVersion()).toBe(175);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(false);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(false);
  });

  it('TARGET-002: refuses an out-of-range target', () => {
    expect(() => runMigrations(db, 999)).toThrow(/Invalid migration target/);
  });

  it('TARGET-003: refuses a target below the current version', () => {
    runMigrations(db);
    expect(() => runMigrations(db, 100)).toThrow(/Invalid migration target/);
  });
});

describe('legacy fork schema-176 bridge — RED/GREEN 1 (exact signature)', () => {
  it('BRIDGE-001: legacy fork 176 migrates to 198 WITH vacay_entries.fraction applied', () => {
    buildLegacyFork176();
    // Sanity: the fixture really is the fork signature.
    expect(schemaVersion()).toBe(176);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(true);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(false);

    runMigrations(db);

    expect(schemaVersion()).toBe(198);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);
    expect(hasColumn('vacay_shares', 'id')).toBe(true);
    // The fork column is left in place (upstream never defined it; dropping it
    // would be a data loss). It is simply unused by the 4.0 schema.
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(true);
  });
});

describe('legacy fork schema-176 bridge — RED/GREEN 2 (false-positive protection)', () => {
  it('BRIDGE-002: unrelated schema 176 (fraction already present, no fork column) is NOT rewritten', () => {
    // A genuine upstream 176 DB: fraction column exists, no user_password_version.
    runMigrations(db, 176);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(false);
    expect(schemaVersion()).toBe(176);

    runMigrations(db);

    expect(schemaVersion()).toBe(198);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(false);
  });

  it('BRIDGE-003: schema 176 with BOTH signatures (fork column AND fraction) is handled deliberately — no rewind', () => {
    // Ambiguous: the fork column exists but the upstream migration-176 effect is
    // also present. Fail-closed: do NOT rewrite (no data loss, no rewind).
    runMigrations(db, 176);
    db.exec('ALTER TABLE oauth_tokens ADD COLUMN user_password_version INTEGER NOT NULL DEFAULT 0');
    expect(schemaVersion()).toBe(176);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(true);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);

    runMigrations(db);

    expect(schemaVersion()).toBe(198);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(true);
  });

  it('BRIDGE-004: missing fork column (version 176, no user_password_version) does NOT trigger legacy handling', () => {
    // A schema-176 DB that lacks the fork column must be left alone even though
    // fraction is also absent — it is not the legacy-fork signature. Build the
    // real 0..174 chain, then claim version 176 without ever adding the fork
    // column: fail-closed means the bridge must NOT rewind (fraction stays
    // absent — a rewind would have applied it).
    runMigrations(db, 175);
    db.prepare('UPDATE schema_version SET version = ?').run(176);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(false);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(false);

    runMigrations(db);

    expect(schemaVersion()).toBe(198);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(false);
    // No rewind happened: migration index 175 (fraction) was never replayed.
    expect(hasColumn('vacay_entries', 'fraction')).toBe(false);
  });

  it('BRIDGE-005: rerunning migration after the bridge is idempotent', () => {
    buildLegacyFork176();
    runMigrations(db);
    expect(schemaVersion()).toBe(198);

    runMigrations(db);
    expect(schemaVersion()).toBe(198);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);
    expect(hasColumn('vacay_shares', 'id')).toBe(true);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(true);
  });
});

describe('legacy fork schema-176 bridge — RED/GREEN 3 (complete fixture matrix)', () => {
  it('MATRIX-001: upstream 175 migrates to 198 normally (no bridge)', () => {
    runMigrations(db, 175);
    expect(schemaVersion()).toBe(175);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(false);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(false);

    runMigrations(db);

    expect(schemaVersion()).toBe(198);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);
    expect(hasColumn('vacay_shares', 'id')).toBe(true);
  });

  it('MATRIX-002: legacy fork 176 migrates to 198 with data preserved (FK + row counts)', () => {
    // Representative production data BEFORE the bridge.
    const { user } = createUser(db);
    const trip = createTrip(db, user.id);
    const day = createDay(db, trip.id);
    const place = createPlace(db, trip.id);
    const reservation = createReservation(db, trip.id, { title: 'Flight to Paris', type: 'flight' });
    const budget = createBudgetItem(db, trip.id, { name: 'Hotel', total_price: 120 });

    buildLegacyFork176();

    const countBefore = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

    const countsBefore = {
      users: countBefore('users'),
      trips: countBefore('trips'),
      days: countBefore('days'),
      places: countBefore('places'),
      reservations: countBefore('reservations'),
      budget_items: countBefore('budget_items'),
    };
    expect(countsBefore.users).toBeGreaterThan(0);

    runMigrations(db);

    // Row counts preserved exactly.
    for (const [table, n] of Object.entries(countsBefore)) {
      expect(countBefore(table), `row count preserved for ${table}`).toBe(n);
    }
    // Critical rows still readable.
    expect(db.prepare('SELECT title FROM reservations WHERE id = ?').get(reservation.id)).toEqual({
      title: 'Flight to Paris',
    });
    expect(db.prepare('SELECT total_price FROM budget_items WHERE id = ?').get(budget.id)).toEqual({
      total_price: 120,
    });
    expect(db.prepare('SELECT id FROM trips WHERE id = ?').get(trip.id)).toEqual({ id: trip.id });
    // Foreign keys intact.
    expect(db.pragma('foreign_key_check')).toEqual([]);
    // Schema advanced to 198 and the bridge effect present.
    expect(schemaVersion()).toBe(198);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);
  });

  it('MATRIX-003: upstream 195 migrates to 198 normally (no bridge)', () => {
    runMigrations(db, 195);
    expect(schemaVersion()).toBe(195);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);

    runMigrations(db);

    expect(schemaVersion()).toBe(198);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);
    expect(hasColumn('oauth_tokens', 'user_password_version')).toBe(false);
  });

  it('MATRIX-004: final fork schema (= legacy fork 176) migrates; MATRIX-005: second startup is a no-op', () => {
    buildLegacyFork176();
    const { user } = createUser(db);
    createTrip(db, user.id);

    // First startup: bridge + full chain.
    runMigrations(db);
    expect(schemaVersion()).toBe(198);
    expect(hasColumn('vacay_entries', 'fraction')).toBe(true);

    // Second startup on the final schema: nothing to run, version stays 198.
    runMigrations(db);
    expect(schemaVersion()).toBe(198);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('legacy fork schema-176 bridge — review finding 2 (real oauth_tokens preservation)', () => {
  it('OAUTH-001: a real oauth_tokens row with user_password_version survives the bridge + migration with its value intact', () => {
    // A genuine fork DB had OAuth tokens issued BEFORE the fork's migration 176,
    // whose user_password_version was backfilled from users.password_version.
    // That row and its bound version must survive the bridge + upstream 176–198.
    buildLegacyFork176();

    const tokenBefore = db
      .prepare('SELECT user_password_version FROM oauth_tokens WHERE access_token_hash = ?')
      .get('legacy-fork-access-hash') as { user_password_version: number } | undefined;
    expect(tokenBefore).toBeDefined();
    expect(tokenBefore!.user_password_version).toBe(3);

    runMigrations(db);

    const tokenAfter = db
      .prepare('SELECT id, user_id, user_password_version FROM oauth_tokens WHERE access_token_hash = ?')
      .get('legacy-fork-access-hash') as { id: number; user_id: number; user_password_version: number } | undefined;
    expect(tokenAfter).toBeDefined();
    expect(tokenAfter!.user_password_version).toBe(3);
    expect(tokenAfter!.user_id).toBeGreaterThan(0);
    // Foreign keys still reference the surviving client + user.
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('OAUTH-002: the oauth_tokens count is unchanged by the bridge + migration (no row loss)', () => {
    buildLegacyFork176();
    const countBefore = (db.prepare('SELECT COUNT(*) AS n FROM oauth_tokens').get() as { n: number }).n;
    expect(countBefore).toBeGreaterThan(0);

    runMigrations(db);

    const countAfter = (db.prepare('SELECT COUNT(*) AS n FROM oauth_tokens').get() as { n: number }).n;
    expect(countAfter).toBe(countBefore);
  });
});

describe('legacy fork schema-176 bridge — review finding 1 (file-backed production-clone fixture)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trek-fork176-clone-'));
  let fileDb: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(tmpDir, `clone-${Math.random().toString(36).slice(2)}.db`);
    fileDb = new Database(dbPath);
    fileDb.exec('PRAGMA journal_mode = WAL');
    fileDb.exec('PRAGMA busy_timeout = 5000');
    fileDb.exec('PRAGMA foreign_keys = ON');
    createTables(fileDb);
  });

  afterEach(() => {
    fileDb.close();
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    }
  });

  /** Builds a faithful file-backed legacy fork-176 clone with representative production data. */
  function buildFileBackedLegacyFork176(): void {
    runMigrations(fileDb, 175);

    const { user } = createUser(fileDb);
    fileDb.prepare('UPDATE users SET password_version = 3 WHERE id = ?').run(user.id);
    const trip = createTrip(fileDb, user.id);
    const day = createDay(fileDb, trip.id);
    const place = createPlace(fileDb, trip.id);
    const reservation = createReservation(fileDb, trip.id, { title: 'Flight to Paris', type: 'flight' });
    createBudgetItem(fileDb, trip.id, { name: 'Hotel', total_price: 120 });
    // A stored plugin (as a real fork install would have) + a reservation endpoint.
    fileDb.prepare(`
      INSERT INTO plugins (id, name, description, type, version, status, permissions, config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('flight-tracker', 'Flight Tracker', 'Live flight status', 'integration', '1.0.0', 'active', '[]', '{}');
    fileDb.prepare(`
      INSERT INTO reservation_endpoints (reservation_id, role, sequence, name, lat, lng)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(reservation.id, 'from', 0, 'Zurich', 47.3769, 8.5417);

    // Fork's index-175 migration: user_password_version + backfill.
    fileDb.exec('ALTER TABLE oauth_tokens ADD COLUMN user_password_version INTEGER NOT NULL DEFAULT 0');
    fileDb.prepare(`
      INSERT INTO oauth_clients (id, user_id, name, client_id, client_secret_hash)
      VALUES (?, ?, ?, ?, ?)
    `).run('clone-fork-client', user.id, 'Clone Fork MCP', 'clone-fork-client-id', 'hashed-secret');
    fileDb.prepare(`
      INSERT INTO oauth_tokens (
        client_id, user_id, access_token_hash, refresh_token_hash,
        scopes, access_token_expires_at, refresh_token_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'clone-fork-client-id',
      user.id,
      'clone-fork-access-hash',
      'clone-fork-refresh-hash',
      '[]',
      '2030-01-01T00:00:00.000Z',
      '2030-01-01T00:00:00.000Z',
    );
    fileDb.exec(`
      UPDATE oauth_tokens
      SET user_password_version = COALESCE(
        (SELECT password_version FROM users WHERE users.id = oauth_tokens.user_id),
        0
      )
    `);
    fileDb.prepare('UPDATE schema_version SET version = ?').run(176);
  }

  it('CLONE-001: file-backed production clone migrates legacy fork 176 preserving every representative row count + FK integrity', () => {
    buildFileBackedLegacyFork176();

    const tableCounts = [
      'users', 'trips', 'days', 'places', 'reservations', 'budget_items',
      'plugins', 'reservation_endpoints', 'oauth_clients', 'oauth_tokens',
    ];
    const countOf = (t: string) => (fileDb.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    const before = Object.fromEntries(tableCounts.map((t) => [t, countOf(t)]));
    // Every representative surface is populated in the clone.
    for (const t of ['users', 'plugins', 'oauth_tokens', 'reservation_endpoints']) {
      expect(before[t], `clone seeds ${t}`).toBeGreaterThan(0);
    }

    runMigrations(fileDb);

    const fileVersion = (fileDb.prepare('SELECT version FROM schema_version').get() as { version: number }).version;
    expect(fileVersion).toBe(198);
    for (const t of tableCounts) {
      expect(countOf(t), `row count preserved for ${t}`).toBe(before[t]);
    }
    // Plugin + token rows readable post-migration.
    expect(fileDb.prepare('SELECT id, name, status FROM plugins WHERE id = ?').get('flight-tracker')).toEqual({
      id: 'flight-tracker',
      name: 'Flight Tracker',
      status: 'active',
    });
    const token = fileDb
      .prepare('SELECT user_password_version FROM oauth_tokens WHERE access_token_hash = ?')
      .get('clone-fork-access-hash') as { user_password_version: number };
    expect(token.user_password_version).toBe(3);
    // Foreign keys intact across the whole clone.
    expect(fileDb.pragma('foreign_key_check')).toEqual([]);
  });
});