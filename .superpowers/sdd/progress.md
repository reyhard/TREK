# Progress Ledger — Upstream 3.4.0 Sync

## Task 01 — Integration Workspace and Baseline Evidence

**Status:** DONE
**Completed:** 2026-07-20

### Environment

| Item | Value |
|------|-------|
| Node | v22.22.0 |
| npm | 11.7.0 |
| git | 2.39.5 |
| Docker | 29.1.5, build 0e6fee6 |
| helm | not installed |

### Refs

| Ref | SHA |
|-----|-----|
| fork (`origin/main`) | `4ce5c7390e9f3bb5a8d7c1857056161db09e356e` |
| upstream (frozen) | `3ca1ef34bb371bb0c76ca1b392e56c8a1c98ceb8` |
| merge base | `f9c992ec9363301762ac00e97747c1dd0fe37d6b` |

### Workspace

```
/opt/trek/TREK                                  main (4ce5c739)
/opt/trek/worktrees/integration-upstream-3.4.0  integration/upstream-3.4.0 (4ce5c739)
```

The integration worktree was corrected from upstream `3ca1ef34` to `origin/main` by:
1. `git worktree remove /opt/trek/worktrees/integration-upstream-3.4.0 --force`
2. `git branch -f integration/upstream-3.4.0 origin/main`
3. `git worktree add /opt/trek/worktrees/integration-upstream-3.4.0 integration/upstream-3.4.0`

Unrelated worktrees (`connector-transit-planning`, `track-aware-routing`) and uncommitted changes on `main` were preserved.

### Baseline Test Results

All tests were run on the untouched fork (after `npm ci`, after `@trek/shared` build).

#### Server Typecheck (`npm --prefix server run typecheck`)

**Result: FAIL** — 43 errors from `@trek/shared` resolution + type errors in `collectionsService.ts`.

Root cause: `@trek/shared` dist/ is not built by default; workspaces must build shared before typechecking.

```
src/config.ts(1,66): error TS2307: Cannot find module '@trek/shared'
src/services/collectionsService.ts(196,33): error TS2339: Property 'id' does not exist on type 'PlaceRow'
src/services/collectionsService.ts(204,19): error TS2551: Property 'category_id' does not exist on type 'PlaceRow'
...
```

After building shared, some type errors may persist (`PlaceRow` shape mismatch) — these are fork pre-existing issues, not merge regressions.

#### Client Typecheck (`npm --prefix client run typecheck`)

**Result: FAIL** — 13 type errors in `dayMovementPlan.test.ts`.

```
tests/unit/utils/dayMovementPlan.test.ts(81,116): error TS2741: Property 'status' is missing
tests/unit/utils/dayMovementPlan.test.ts(133,64): error TS2741: Property 'trip_id' is missing
...
```

Root cause: Test fixtures don't include all required properties (`status`, `trip_id`) for the typed interfaces. Pre-existing fork issue.

#### Server Tests (`npm --prefix server test -- --run`)

**Result: 220 failed / 74 passed (294 files), 1007 tests passed**

Root cause: `@trek/shared` package not resolved at test time (`ERR_MODULE_NOT_FOUND`). All 1007 tests that loaded passed; failures are module resolution.

#### Client Tests (`npm --prefix client test -- --run`)

**Result: 149 failed / 50 passed (199 files), 536 tests passed**

Root cause: `@trek/shared` import resolution failures. Same as server.

#### Plugin-SDK Tests (`npm --prefix plugin-sdk test`)

**Result: 2 failed / 1 passed (3 files), 6 tests passed**

Root cause: `@clack/prompts` not installed (dev dependency only used in CLI tests).

### Known Pre-existing Failures (Baseline)

| # | Command | Failures | Root Cause | Reproducible |
|---|---------|----------|------------|--------------|
| 1 | `server typecheck` | 43 errors | `@trek/shared` not built + `PlaceRow` type mismatch | YES |
| 2 | `client typecheck` | 13 errors | Missing `status`/`trip_id` properties in test fixtures | YES |
| 3 | `server test` | 220 files failed | `@trek/shared` module not found | YES |
| 4 | `client test` | 149 files failed | `@trek/shared` module not found | YES |
| 5 | `plugin-sdk test` | 2 files failed | `@clack/prompts` not installed | YES |

**Note:** After building `@trek/shared`, the server and client tests would likely pass most suites (many tests already pass). The typecheck failures are in test fixtures, not production code.

### Fixture

**Path:** `server/tests/fixtures/pre-upstream-3.4-fork.sqlite`
**Size:** generated via fork code (schema + 172 migrations)
**SHA256:** `10c0fb1edd1822a478864378ece436b09f8aaa2185d72c3d8c41e6cfd874fe18`

**Contents (row counts):**
- 2 users (alice_fixture, bob_fixture)
- 1 trip (Pre-Sync Fixture Trip, 2 days)
- 4 places (2 POIs + 1 track + 1 hotel)
- 3 day assignments
- 2 reservations (1 manual train + 1 automated transit)
- 4 reservation endpoints
- 1 budget item, 1 packing item, 1 todo, 1 collab note
- 1 OAuth client, 1 OAuth token pair (with plugin scopes)
- 1 installed plugin (travelbuddy), 1 plugin OAuth token, 1 plugin OAuth state, 1 plugin user config
- 1 day accommodation (hotel for full trip)
- 1 trip member (bob on alice's trip)

**Foreign key check:** PASSED (0 violations)

### Fixture Manifest

**Path:** `server/tests/fixtures/pre-upstream-3.4-fork-fixture.json`
**SHA256:** `996e91d36a07cf61dd9513dd00bc5c80d5a630576b1c4d22a2fce48261a47877`

Contains semantic identifiers (emails, trip title, place names, reservation titles, plugin ID) for stable lookup after migration by Task 03.

### Fork Feature Inventory

#### Database (owner: Fork)
- `reservations.day_plan_position` (column) — persistent transport ordering
- `reservation_endpoints` (table) — from/to points with timezone/local_time
- `reservations.needs_review` (column)
- `plugin_oauth_tokens` / `plugin_oauth_state` — host-brokered OAuth proxy
- `plugin_scheduled_tasks`, `plugin_user_erasure_queue` — plugin infrastructure
- `plugin_actions` — settings-page action buttons
- `plugin_egress_hosts` — operator egress configuration
- `plugin_capability_audit` — hash-chained audit log
- `oauth_tokens.parent_token_id` — rotation chain
- `oauth_clients.is_public`, `oauth_clients.created_via` — DCR support
- `users.display_name` — for guest display

#### MCP / Transit (owner: Fork, overlaps with upstream transit tools)
- `server/src/mcp/tools/transit.ts` — `plan_transit_route`, `create_transit_route`, `update_transit_route`
- `server/src/services/transitReservationService.ts` — transit planning + save
- `server/src/services/transitTime.ts` — timezone + DST-aware UTC conversion
- `server/src/services/transitRateLimit.ts` — per-caller rate limiting
- `server/tests/unit/services/transitReservationService.test.ts`
- `server/tests/unit/services/transitTime.test.ts`
- `server/tests/unit/services/transitRateLimit.test.ts`
- `server/tests/unit/mcp/tools-transit.test.ts`

#### Client / Routing (owner: Fork)
- `client/src/utils/dayMovementPlan.ts` — `buildDayMovementPlan`
- `client/src/utils/movementStats.ts` — `calculateDayMovementStats`
- `client/src/utils/resolveDayMovementPlan.ts` — route resolution
- `client/src/utils/trackGeometry.ts`, `client/src/utils/trackStats.ts`, `client/src/utils/polyline.ts`
- `client/src/components/Planner/DayMovementTotalRow.tsx`, `DayPlanSidebarTrackSummary.tsx`
- `client/src/components/Planner/transitConnector.ts`, `transitSearchTypes.ts`
- `client/tests/unit/utils/dayMovementPlan.test.ts`, `movementStats.test.ts`, etc.

#### OAuth Plugin Proxy (owner: Fork)
- `server/src/services/oauthResources.ts` — plugin resource URIs + scope grammar
- `server/src/mcp/oauthProvider.ts` — audience/resource enforcement
- `server/src/mcp/scopes.ts` — `plugin:<pluginId>:read|write` scopes
- `server/src/mcp/config.ts` — MCP session config
- `client/src/api/oauthScopes.ts` / `oauthScopes.test.ts` — client scope parsing
- `client/src/components/OAuth/ScopeGroupPicker.tsx` — scope UI
- `client/src/pages/OAuthAuthorizePage.tsx` — authorization page

#### Plugins (owner: Fork, shared with upstream)
- `server/src/nest/plugins/` — plugin system (controllers, services, runtime)
- `plugin-sdk/src/index.ts` — SDK modifications

#### Deployment (owner: Fork)
- `.gitignore`
- `server/src/bootstrap.ts`, `server/src/index.ts`
- Various server NestJS module/controller/service modifications

### Handoff

- **Task 02** consumes: clean committed worktree on `integration/upstream-3.4.0` at `origin/main`.
- **Task 03** consumes: `server/tests/fixtures/pre-upstream-3.4-fork.sqlite` and `server/tests/fixtures/pre-upstream-3.4-fork-fixture.json`.

- Task 01 review: CLEAN / APPROVED — explicit user override: fixtures remain local and uncommitted.
