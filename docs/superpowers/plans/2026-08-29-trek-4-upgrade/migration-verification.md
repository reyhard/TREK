# TREK 4.0 Fork Upgrade — Migration Verification

**Status:** schema-176 facts established in Task 00 (corrected); bridge implementation +
verification populated by Tasks 02 (schema-176 bridge) and 09 (regression + production migration).

Records the actual verification commands and their outputs for the migration/regression matrix
(spec §5.4, §9.3). Task 00 has not run the application test/build gates because it changes no
production behavior; the schema-176 collision facts recorded here were established by static
inspection of `server/src/db/migrations.ts` at each ref:

## Migration array lengths (authoritative counts)

| Ref | migrations.length | Resulting schema version |
| --- | --- | --- |
| `v3.4.1` (`a0994658`) | 175 | 175 |
| `fork-pre-4.0-2026-08-29` (`814ed86a`) | 176 | 176 |
| `v4.0.0` (`a00b84b2`) | **198** | **198** |
| `upstream/main` (`33a33e7b`) | **200** | **200** |

> Correction vs the original draft: v4.0.0 schema is **198**, not 195. Upstream owns the
> migration sequence **176–198** (not 176–195). The runner sets `schema_version` to
> `migrations.length` after the loop (`console.log('[DB] Migrations complete — schema version
> ' + migrations.length)`), so the schema version equals the array length.

## The exact distinguishing upstream migration-176 signature (spec §5.2)

The migration array is index-addressed: `migrations[i]` runs when `schema_version == i` and
sets `schema_version = i + 1`. Therefore **upstream migration 176 = array index 175**.

- **Upstream (v4.0.0 and upstream/main) migration 176 (array index 175):** "Half vacation days
  (#552)" — `ALTER TABLE vacay_entries ADD COLUMN fraction REAL NOT NULL DEFAULT 1` (guarded by
  `pragma_table_info('vacay_entries')`), so the **distinguishing artifact is the
  `vacay_entries.fraction` column** (absent before this migration runs).
- **Upstream migration 177 (array index 176):** creates the `vacay_shares` table
  (read-only vacation-calendar sharing, #444/#667) + `idx_vacay_shares_user`.
- **Fork migration 176 (array index 175):** `oauth_tokens.user_password_version` —
  a completely different operation that happens to occupy the same schema slot.

The spec §5.2 detection therefore proves, on a database reporting schema version 176:

1. `SELECT version FROM schema_version` = **176** (the legacy fork value);
2. `oauth_tokens.user_password_version` **exists** (fork signature;
   `PRAGMA table_info('oauth_tokens')`);
3. **`vacay_entries.fraction` does NOT exist** — the distinguishing effect/signature of upstream
   migration 176 is absent (`PRAGMA table_info('vacay_entries')` has no `fraction` column).

Only when all three hold is the state translated so the normal upstream 176–198 sequence runs.
This predicate is fail-closed: an unrelated schema-176 database without `user_password_version`
and/or with `vacay_entries.fraction` present is never treated as a fork DB
(`PRAGMA foreign_key_check` also guards the translation).

## Verified evidence (git commands + outputs)

```
$ git show v4.0.0:server/src/db/migrations.ts | grep -n "vacay_entries ADD COLUMN fraction"
3715:      if (!hasFraction) db.exec('ALTER TABLE vacay_entries ADD COLUMN fraction REAL NOT NULL DEFAULT 1');

$ git show v4.0.0:server/src/db/migrations.ts | sed -n '/CREATE TABLE IF NOT EXISTS vacay_shares/,/);/p'
        CREATE TABLE IF NOT EXISTS vacay_shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          hidden INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (owner_id, user_id)
        );

$ git grep -l vacay_shares v4.0.0 -- server/src     # => migrations.ts, nest/vacay/*.ts (present)
$ git grep -l vacay_shares fork-pre-4.0-2026-08-29 -- server/src   # => (none)  -> absent at fork
$ git grep -l user_password_version v4.0.0 -- server               # => (none)  -> absent at v4.0.0
$ git grep -l user_password_version fork-pre-4.0-2026-08-29 -- server
    # => db/migrations.ts, services/oauthService.ts, tests/... (fork signature)
```

Migration array length derivation (count of `migrations[i]` entries between
`const migrations: Migration[] = [` and the matching `];`):

```
v3.4.1        -> 175
fork-pre-4.0  -> 176   (last entry = oauth_tokens.user_password_version)
v4.0.0        -> 198
upstream/main -> 200
```

## Task 02 bridge requirements (unchanged TODO)

Implement + verify the compatibility bridge, including fixtures for
(1) pristine 175 → 176–198, (2) legacy fork 176 → bridge → 176–198, (3) already-198,
(4) final fork schema, (5) rerun. Detection uses the three-part predicate above. Plus
`PRAGMA foreign_key_check` and row-count comparisons for
trips/days/assignments/reservations/endpoints/costs/links on a production clone.