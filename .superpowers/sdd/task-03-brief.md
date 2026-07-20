# Task 03 — Database Migrations, Seeds, Bootstrap, and Shutdown

**Source plan:** `docs/superpowers/plans/upstream-3.4-sync/task-03-database-migrations-and-bootstrap.md`

## Objective

Reconcile the upstream 3.4 database and startup path so clean databases and the local pre-sync fork fixture migrate safely, preserve representative data, support repeatable migration/reset runs, and expose MCP/plugins only after migration succeeds.

## Inputs And Constraints

- Consume Task 02 merge `68fe32c7` and its conflict ledger.
- Use `server/tests/fixtures/pre-upstream-3.4-fork.sqlite` and `.json` as local-only fixtures. Copy the SQLite fixture to a unique temporary path before migration; never mutate the committed fixture in place.
- Preserve row IDs, foreign keys, representative OAuth/plugin/transit/trip data, and historic transit metadata.
- Do not add duplicate registrars, validators, stores, metadata builders, or movement calculations.
- Migration failures must abort startup; do not log and continue.

## Scope

- Reconcile `server/src/db/database.ts`, `migrations.ts`, `seeds.ts`.
- Reconcile `server/src/demo/demo-seed.ts`, `demo-reset.ts`, `bootstrap.ts`, and `index.ts`.
- Add `server/tests/integration/upstream-3.4-migration.test.ts`.

## Required Verification

- Clean database migration.
- Local fork fixture upgrade with semantic data preservation.
- Second migration run is successful and idempotent.
- SQLite foreign-key check has zero violations.
- Demo seed/reset is repeatable.
- Startup ordering keeps health/MCP/plugin exposure behind successful migration.
- `npm --prefix server run typecheck`.
- Focused migration test and full `server/tests/integration` suite.

## Handoff

Record SQL failures, final schema differences, representative preservation evidence, migration compatibility classification (backward-compatible, forward-only non-destructive, or destructive), commands, commit SHA, and unresolved notes in `.superpowers/sdd/progress.md`. Task 04 begins only after database/bootstrap behavior is stable.
