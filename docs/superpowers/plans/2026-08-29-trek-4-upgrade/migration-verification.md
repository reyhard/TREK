# TREK 4.0 Fork Upgrade — Migration Verification

**Status:** placeholder — populated by Tasks 02 (schema-176 bridge) and 09 (regression +
production migration).

Records the actual verification commands and their outputs for the migration/regression matrix
(spec §5.4, §9.3). Task 00 has not run the application test/build gates because it changes no
production behavior; the schema-176 collision facts recorded here were established by static
inspection:

- Fork schema version = **176**; last fork migration = `oauth_tokens.user_password_version`
  (`server/src/db/migrations.ts`, array index 175).
- Upstream 3.4 schema = **175**; upstream 4.0 schema = **195** (upstream owns 176–195).
- `v4.0.0:server/src/db/migrations.ts` has no `user_password_version` migration.

TODO (Task 02): implement + verify the compatibility bridge, including fixtures for
(1) pristine 175 → 176–195, (2) legacy fork 176 → bridge → 176–195, (3) already-195,
(4) final fork schema, (5) rerun. Plus `PRAGMA foreign_key_check` and row-count comparisons
for trips/days/assignments/reservations/endpoints/costs/links on a production clone.
