import { runMigrations, reconcileAtlasRegions } from '../../../src/db/migrations';
import { createTables } from '../../../src/db/schema';
import { createUser } from '../../helpers/factories';

import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';

function freshDb() {
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  createTables(db);
  runMigrations(db);
  return db;
}

function mark(db: Database.Database, userId: number, code: string, name: string, country = 'NO') {
  db.prepare('INSERT INTO visited_regions (user_id, region_code, region_name, country_code) VALUES (?, ?, ?, ?)').run(
    userId,
    code,
    name,
    country,
  );
}

describe('Atlas region-code reconciliation migration', () => {
  it('CROSSWALK-001: remaps a renamed-merge county via the curated crosswalk', () => {
    const db = freshDb();
    const { user } = createUser(db);
    mark(db, user.id, 'NO-05', 'Oppland');

    reconcileAtlasRegions(db);

    const rows = db.prepare('SELECT region_code, region_name FROM visited_regions WHERE user_id = ?').all(user.id);
    expect(rows).toEqual([{ region_code: 'NO-34', region_name: 'Innlandet' }]);
    db.close();
  });

  it('CROSSWALK-002: merges two old counties that map to the same new region (no UNIQUE clash)', () => {
    const db = freshDb();
    const { user } = createUser(db);
    mark(db, user.id, 'NO-04', 'Hedmark');
    mark(db, user.id, 'NO-05', 'Oppland');

    reconcileAtlasRegions(db);

    const rows = db.prepare('SELECT region_code FROM visited_regions WHERE user_id = ?').all(user.id);
    expect(rows).toEqual([{ region_code: 'NO-34' }]);
    db.close();
  });

  it('CROSSWALK-003: leaves a still-valid code untouched', () => {
    const db = freshDb();
    const { user } = createUser(db);
    mark(db, user.id, 'NO-03', 'Oslo');

    reconcileAtlasRegions(db);

    const rows = db.prepare('SELECT region_code, region_name FROM visited_regions WHERE user_id = ?').all(user.id);
    expect(rows).toEqual([{ region_code: 'NO-03', region_name: 'Oslo' }]);
    db.close();
  });

  it('CROSSWALK-004: re-codes a stale code whose region NAME still matches the bundle', () => {
    const db = freshDb();
    const { user } = createUser(db);
    mark(db, user.id, 'NO-99', 'Oslo');

    reconcileAtlasRegions(db);

    const rows = db.prepare('SELECT region_code, region_name FROM visited_regions WHERE user_id = ?').all(user.id);
    expect(rows).toEqual([{ region_code: 'NO-03', region_name: 'Oslo' }]);
    db.close();
  });

  it('CROSSWALK-005: leaves an unresolvable row as-is (no code, no name, no crosswalk match)', () => {
    const db = freshDb();
    const { user } = createUser(db);
    mark(db, user.id, 'ZZ-99', 'Nowhere', 'ZZ');

    reconcileAtlasRegions(db);

    const rows = db.prepare('SELECT region_code, region_name FROM visited_regions WHERE user_id = ?').all(user.id);
    expect(rows).toEqual([{ region_code: 'ZZ-99', region_name: 'Nowhere' }]);
    db.close();
  });

  it('CROSSWALK-006: does not touch bucket_list or visited_countries (no region identifier there)', () => {
    const db = freshDb();
    const { user } = createUser(db);
    db.prepare('INSERT INTO bucket_list (user_id, name, country_code) VALUES (?, ?, ?)').run(user.id, 'Oppland', 'NO');
    db.prepare('INSERT INTO visited_countries (user_id, country_code) VALUES (?, ?)').run(user.id, 'NO');
    mark(db, user.id, 'NO-05', 'Oppland');

    reconcileAtlasRegions(db);

    const bucket = db.prepare('SELECT name, country_code FROM bucket_list WHERE user_id = ?').all(user.id);
    expect(bucket).toEqual([{ name: 'Oppland', country_code: 'NO' }]);
    const countries = db.prepare('SELECT country_code FROM visited_countries WHERE user_id = ?').all(user.id);
    expect(countries).toEqual([{ country_code: 'NO' }]);
    db.close();
  });
});
