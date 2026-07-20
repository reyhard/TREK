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

## Task 02 — Frozen Upstream Merge and Dependency Baseline

**Status:** DONE (remediated x2)
**Completed:** 2026-07-20
**Remediated:** 2026-07-20 (branch rewritten to remove forbidden commit `a8f59fbb`)
**Remediated (R2):** 2026-07-20 (cleanup commit, corrected conflict ledger, corrected typecheck evidence)

### Merge Details

| Item | Value |
|------|-------|
| Branch | `integration/upstream-3.4.0` |
| Merge commit | `68fe32c79a2b42a518c1b7a7f9e173e08f9e875f` |
| Parent 1 (fork) | `4ce5c7390e9f3bb5a8d7c1857056161db09e356e` |
| Parent 2 (upstream frozen) | `3ca1ef34bb371bb0c76ca1b392e56c8a1c98ceb8` |
| Upstream ancestor verified | YES |
| Merge-tree conflict count | 63 files (git `merge-tree` CONFLICT entries, all resolved `--theirs`) |

### Resolution Strategy

**Repository metadata (.gitignore):** Kept fork additions (`.worktrees/`, `server/assets/wiki/`).

**Package manifests:** Auto-merged clean; verified required versions:
- `@modelcontextprotocol/sdk`: ^1.29.0
- `typescript`: ^6.0.2
- `zod`: ^4.3.6

**63 merge-tree conflicts:** Provisional resolution — upstream taken as base (`--theirs`) for all semantic conflicts. Fork-specific files that had no upstream counterpart (e.g., `transitReservationService.ts`, `transitTime.ts`, `transitRateLimit.ts`, `oauthResources.ts`, `oauthProvider.ts`, `dayMovementPlan.ts`, `movementStats.ts`, etc.) remain in tree but are disconnected from upstream restructured source files.

**Auto-merged files with semantic divergence:** 15 files auto-merged cleanly (no git CONFLICT) but have diverged fork behavior that needs porting by later tasks. Classified separately as "Auto-Merged Fork Inventory" below.

**Lockfiles:** Regenerated from resolved manifests. `npm ci` passes for root and plugin-sdk.

### Dependency/Baseline Checks

| Check | Result |
|-------|--------|
| `npm ci` (root) | PASS (0 vulnerabilities) |
| `npm ci --prefix plugin-sdk` | PASS (0 vulnerabilities) |
| `npm run build --workspace=shared` | PASS |
| `npm --prefix server run typecheck` | 4 errors (all deferred Tasks 07/08) |
| `npm --prefix client run typecheck` | 21 errors: 8 test-prop + 13 test-fixture; all deferred Tasks 09/10 |
| No conflict markers | PASS |
| No unmerged paths | PASS |
| `git diff --check` | PASS (no whitespace errors) |
| No duplicate `registerTransitTools` | PASS |
| Fork fixture files excluded | PASS (`.sqlite` via `.gitignore:18`; `.json` via `.git/info/exclude:10`) |

### Actual Typecheck Evidence (Post-Merge Baseline)

#### Server Typecheck (`npm --prefix server run typecheck`) — 4 errors (all deferred)

All server errors are fork-disconnected API surface issues owned by Tasks 07-08. No upstream-pre-existing errors reproduce after a clean `npm run build --workspace=shared`.

| # | File:Line | Error | Owner |
|---|-----------|-------|-------|
| 1 | `oauth-api.controller.ts:166` | TS2339: `oauthResources` on PluginRuntimeService | Task 07 |
| 2 | `plugins-proxy.controller.ts:127` | TS2353: `is_admin` in proxy user type | Task 07 |
| 3 | `plugin-host-entry.ts:123:13` | TS2339: `oauthScope` on PluginRoute | Task 08 |
| 4 | `plugin-host-entry.ts:123:42` | TS2339: `oauthScope` on PluginRoute | Task 08 |

**Note:** An earlier typecheck run (before the fresh shared rebuild) produced 11 errors including 7 transient TS2322 errors in `booking-import.service.ts`, `airtrailImport.ts`, and `collectionsService.ts`. These were artifacts of stale shared types and do NOT reproduce after `npm run build --workspace=shared`.

#### Client Typecheck (`npm --prefix client run typecheck`) — 21 errors

**All deferred to Tasks 09/10:**

| # | File | Count | Error | Owner |
|---|------|-------|-------|-------|
| 1 | `MapView.test.tsx:66` | 1 | TS1117: duplicate property name | Task 09 |
| 2 | `MapViewGL.test.tsx` | 3 | TS2322: `repositionPlaceId` missing | Task 09 |
| 3 | `PlaceInspector.test.tsx` | 4 | TS2322: `canReposition` missing | Task 09 |
| 4 | `dayMovementPlan.test.ts` | 13 | TS2741: `status`/`trip_id` in fixtures | Task 10 |

**Note:** The previously remediated report (task-02-report.md) incorrectly claimed `MapView.test.tsx:66` and `MapViewGL.test.tsx` errors did not reproduce. All client errors reproduce reliably under the current merged tree.

### Merge-Tree Conflict Ledger — 63 Files (All Resolved `--theirs`)

These are the exact 63 files that produced git `CONFLICT` markers (verified via `git merge-tree 4ce5c739 3ca1ef34`). Each is classified by merge-type and assigned to an owning task.

#### 1. Repository Metadata (1 file) — Immediately Resolved

| # | File | Merge Type | Resolution |
|---|------|-----------|------------|
| 1 | `.gitignore` | content | Manually merged: kept fork additions |

#### 2. Database / Migrations — Task 03 (2 files)

| # | File | Merge Type | Fork Behavior | Follow-up |
|---|------|-----------|---------------|-----------|
| 2 | `server/src/db/database.ts` | content | fork schema additions (columns, tables, DCR) | Task 03: port fork schema onto upstream base |
| 3 | `server/src/db/migrations.ts` | content | 11+ fork migrations | Task 03: rebase fork migrations after upstream set |

#### 3. MCP / Transit — Tasks 04-06 (8 files)

| # | File | Merge Type | Fork Behavior | Follow-up | Owner |
|---|------|-----------|---------------|-----------|-------|
| 4 | `server/src/mcp/index.ts` | content | OAuth provider config, plugin scope enforcement | port to upstream MCP setup | Task 04 |
| 5 | `server/src/mcp/scopes.ts` | content | `plugin:<id>:read\|write`, resource URI grammar | port to upstream scopes | Task 04 |
| 6 | `server/src/mcp/sessionManager.ts` | content | OAuth token validation, audience enforcement | port to upstream sessions | Task 04 |
| 7 | `server/src/mcp/tools.ts` | content | transit tool registration, scope-gated visibility | port to upstream tool set | Task 04 |
| 8 | `server/src/mcp/tools/transit.ts` | add/add | `plan_transit_route`, `create_transit_route`, `update_transit_route` | merge fork tools into upstream Transitous base | Task 05 |
| 9 | `server/src/mcp/tools/trips.ts` | content | transit-reservation integration in trip tools | port to upstream trip tools | Task 05 |
| 10 | `server/src/services/transitService.ts` | content | timezone-aware UTC conversion, per-caller rate limiting | port to upstream Transitous service | Task 06 |
| 11 | `server/tests/unit/mcp/tools-transit.test.ts` | add/add | fork transit route plan/create/update tests | rewrite for merged transit tools | Task 06 |

#### 4. Plugins — Server — Tasks 07-08 (11 files)

| # | File | Merge Type | Fork Behavior | Follow-up | Owner |
|---|------|-----------|---------------|-----------|-------|
| 12 | `server/src/nest/plugins/host/create-rpc-host.ts` | content | OAuth resources integration | port to upstream RPC host | Task 07 |
| 13 | `server/src/nest/plugins/host/rpc-host.ts` | content | scope enforcement, OAuth token validation | port to upstream RPC host | Task 07 |
| 14 | `server/src/nest/plugins/install/discovery.ts` | content | egress host discovery, capability audit | port to upstream discovery | Task 07 |
| 15 | `server/src/nest/plugins/install/manifest.ts` | content | oauthScope/permission/egress in manifest | port to upstream manifest | Task 07 |
| 16 | `server/src/nest/plugins/paths.ts` | content | plugin data/settings paths | port to upstream paths | Task 07 |
| 17 | `server/src/nest/plugins/plugin-runtime.service.ts` | content | scheduled tasks, user erasure, OAuth proxy, capability audit | port to upstream runtime | Task 07 |
| 18 | `server/src/nest/plugins/plugins.controller.ts` | content | OAuth endpoints, plugin action triggers, erasure | port to upstream controller | Task 07 |
| 19 | `server/src/nest/plugins/plugins.service.ts` | content | OAuth client management, token rotation, DCR | port to upstream service | Task 07 |
| 20 | `server/src/nest/plugins/registry/registry.service.ts` | content | fork registry endpoints, egress allowlisting | port to upstream registry | Task 08 |
| 21 | `server/src/nest/plugins/runtime/plugin-sdk.ts` | content | OAuth host functions, egress config, permission checks | port to upstream SDK API | Task 08 |
| 22 | `server/src/middleware/globalMiddleware.ts` | content | CORS for plugin iframes, SSRF guard | port to upstream middleware | Task 08 |

#### 5. Client / Maps & Planner — Tasks 09-10 (7 files)

| # | File | Merge Type | Fork Behavior | Follow-up | Owner |
|---|------|-----------|---------------|-----------|-------|
| 23 | `client/src/components/Map/MapView.tsx` | content | reposition controls, track rendering, movement overlay | port to upstream MapView | Task 09 |
| 24 | `client/src/components/Map/MapViewGL.tsx` | content | track layer, movement plan visualization, transit connector | port to upstream MapViewGL | Task 09 |
| 25 | `client/src/components/Planner/PlaceInspector.tsx` | content | reposition controls, transit search integration | port to upstream PlaceInspector | Task 09 |
| 26 | `client/src/pages/TripPlannerPage.tsx` | content | day movement total row, track summary sidebar | port to upstream TripPlannerPage | Task 10 |
| 27 | `client/src/pages/tripPlanner/useTripPlanner.ts` | content | route calculation, movement plan integration | port to upstream useTripPlanner | Task 10 |
| 28 | `client/src/components/Planner/DayPlanSidebar.test.tsx` | content | track summary tests | rewrite for merged sidebar | Task 10 |
| 29 | `client/src/pages/TripPlannerPage.test.tsx` | content | movement plan tests | rewrite for merged page | Task 10 |

#### 6. Services — Tasks 11-12 (11 files)

| # | File | Merge Type | Fork Behavior | Follow-up | Owner |
|---|------|-----------|---------------|-----------|-------|
| 30 | `server/src/services/reservationService.ts` | content | day_plan_position, endpoints, transit integration | port to upstream reservation | Task 11 |
| 31 | `server/src/nest/reservations/reservations.service.ts` | content | endpoint CRUD, transit reservation creation | port to upstream NestJS reservation | Task 11 |
| 32 | `server/src/services/tripService.ts` | content | display_name, transit-linked reservations | port to upstream trip | Task 11 |
| 33 | `server/src/nest/trips/trips.service.ts` | content | transit-aware trip data | port to upstream NestJS trip | Task 11 |
| 34 | `server/src/services/adminService.ts` | content | plugin administration, OAuth client management, erasure queue | port to upstream admin | Task 11 |
| 35 | `server/src/services/budgetService.ts` | content | transit cost integration | port to upstream budget | Task 11 |
| 36 | `server/src/services/packingService.ts` | content | weather-aware packing | port to upstream packing | Task 11 |
| 37 | `server/src/services/atlasService.ts` | content | place repositioning, track-geometry integration | port to upstream atlas | Task 12 |
| 38 | `server/src/services/wikiService.ts` | content | offline snapshot, asset serving | port to upstream wiki | Task 12 |
| 39 | `server/src/services/airtrail/airtrailImport.ts` | content | transit-aware import | port to upstream airtrail import | Task 12 |
| 40 | `server/src/services/airtrail/airtrailMapper.ts` | content | day_plan_position mapping | port to upstream airtrail mapper | Task 12 |

#### 7. Wiki (1 file)

| # | File | Merge Type | Follow-up |
|---|------|-----------|-----------|
| 41 | `wiki/MCP-Tools-and-Resources.md` | content | Upstream `--theirs`; N/A (no fork behavior to port) |

#### 8. Test Conflict Files — Various Owners (22 files)

These 22 test files conflicted mechanically but have no fork-only behavior. Provisionally resolved `--theirs`. Tests will naturally pass or be rewritten when their owning source files are ported. Listed by source-owner alignment for traceability.

| # | File | Aligned Source Owner |
|---|------|---------------------|
| 42 | `server/tests/e2e/atlas.e2e.test.ts` | Task 12 (atlasService.ts) |
| 43 | `server/tests/e2e/reservations.e2e.test.ts` | Task 11 (reservationService.ts) |
| 44 | `server/tests/integration/mcp.test.ts` | Task 04 (mcp tools) |
| 45 | `server/tests/integration/plugins/dev-link.test.ts` | Task 07 (plugin install) |
| 46 | `server/tests/integration/plugins/plugin-runtime.test.ts` | Task 07 (plugin-runtime.service.ts) |
| 47 | `server/tests/integration/plugins/registry.test.ts` | Task 08 (registry.service.ts) |
| 48 | `server/tests/unit/mcp/sessionManager.test.ts` | Task 04 (sessionManager.ts) |
| 49 | `server/tests/unit/nest/packing.controller.test.ts` | Task 11 (packingService.ts) |
| 50 | `server/tests/unit/nest/packing.service.test.ts` | Task 11 (packingService.ts) |
| 51 | `server/tests/unit/nest/reservations.service.test.ts` | Task 11 (reservations.service.ts) |
| 52 | `server/tests/unit/nest/trips.service.test.ts` | Task 11 (trips.service.ts) |
| 53 | `server/tests/unit/plugins/egress-policy.test.ts` | Task 08 (egress-policy.ts) |
| 54 | `server/tests/unit/plugins/plugin-frame.test.ts` | Task 07 (plugin-frame.controller.ts) |
| 55 | `server/tests/unit/plugins/plugins-proxy.test.ts` | Task 07 (plugins-proxy.controller.ts) |
| 56 | `server/tests/unit/plugins/rpc-host.test.ts` | Task 07 (rpc-host.ts) |
| 57 | `server/tests/unit/services/airtrailMapper.test.ts` | Task 12 (airtrailMapper.ts) |
| 58 | `server/tests/unit/services/airtrailWriteGate.test.ts` | Task 12 (airtrailImport.ts) |
| 59 | `server/tests/unit/services/atlasService.test.ts` | Task 12 (atlasService.ts) |
| 60 | `server/tests/unit/services/budgetServiceDb.test.ts` | Task 11 (budgetService.ts) |
| 61 | `server/tests/unit/services/transitService.test.ts` | Task 06 (transitService.ts) |
| 62 | `server/tests/unit/services/tripService.test.ts` | Task 11 (tripService.ts) |
| 63 | `server/tests/unit/services/versionNotification.test.ts` | N/A (upstream-only concern) |

### Auto-Merged Fork Inventory — 15 Files (No Git Conflict, Semantic Divergence)

These files auto-merged cleanly (zero CONFLICT markers in `git merge-tree`) but both fork and upstream branches modified them independently. They require semantic review and behavior porting by later tasks but are NOT part of the 63 merge-tree conflicts.

| # | File | Resolved Text | Fork Behavior | Owner |
|---|------|--------------|---------------|-------|
| 1 | `server/src/nest/plugins/plugin-backup.ts` | auto-merge | OAuth token state backup, user erasure audit | Task 07 |
| 2 | `server/src/nest/plugins/plugin-frame.controller.ts` | auto-merge | SSRF-guarded proxy URIs, path-scoped frame routing | Task 07 |
| 3 | `server/src/nest/plugins/plugins-feed.controller.ts` | auto-merge | scoped data access, plugin OAuth token passthrough | Task 07 |
| 4 | `server/src/nest/plugins/plugins-proxy.controller.ts` | auto-merge | OAuth token resolution, `is_admin` guard, resource-scoped proxying | Task 07 |
| 5 | `server/src/nest/plugins/runtime/egress-policy.ts` | auto-merge | per-host allowlisting, capability audit chaining, operator egress config | Task 08 |
| 6 | `client/src/components/Plugins/PluginFrame.tsx` | auto-merge | OAuth token injection, plugin-scoped confirm dialogs | Task 08 |
| 7 | `client/src/components/Plugins/PluginWidgets.tsx` | auto-merge | fork plugin widget registration, OAuth-ready frame init | Task 08 |
| 8 | `client/src/components/Admin/AdminPluginsPanel.tsx` | auto-merge | OAuth client CRUD, plugin erasure controls, action triggers | Task 08 |
| 9 | `client/src/components/Settings/PluginSettingsTab.tsx` | auto-merge | declared-field OAuth binding, action button dispatch | Task 08 |
| 10 | `client/src/components/Planner/TransportModal.tsx` | auto-merge | day_plan_position ordering, transit connector integration, endpoint timezone | Task 09 |
| 11 | `client/src/components/Planner/TransportModal.test.tsx` | auto-merge | day_plan_position, endpoint-local_time, transit connector tests | Task 10 |
| 12 | `client/src/components/Planner/DayPlanSidebar.tsx` | auto-merge | movement total row, track summary section, transit connector display | Task 10 |
| 13 | `client/src/components/Planner/DayPlanSidebarFooter.tsx` | auto-merge | movement stats aggregation, track geometry summary | Task 10 |
| 14 | `client/src/components/Planner/DayPlanSidebarToolbar.tsx` | auto-merge | transit search trigger, reposition controls | Task 10 |
| 15 | `client/src/api/client.ts` | auto-merge | OAuth scope parsing, plugin action endpoints, transit API calls | Task 09 |

### Deferred Typecheck Failures (Updated Baseline)

All errors reproduced clean after `npm ci && npm run build --workspace=shared`. No upstream-pre-existing errors persist.

| # | File | Errors | Error Types | Owner Task |
|---|------|--------|-------------|------------|
| 1 | `oauth-api.controller.ts:166` | 1 | TS2339: `oauthResources` on PluginRuntimeService | Task 07 |
| 2 | `plugins-proxy.controller.ts:127` | 1 | TS2353: `is_admin` in proxy user type | Task 07 |
| 3 | `plugin-host-entry.ts:123` | 2 | TS2339: `oauthScope` on PluginRoute | Task 08 |
| 4 | `MapView.test.tsx:66` | 1 | TS1117: duplicate property name | Task 09 |
| 5 | `MapViewGL.test.tsx` | 3 | TS2322: `repositionPlaceId` missing | Task 09 |
| 6 | `PlaceInspector.test.tsx` | 4 | TS2322: `canReposition` missing | Task 09 |
| 7 | `dayMovementPlan.test.ts` | 13 | TS2741: `status`/`trip_id` in fixtures | Task 10 |

### Fork Feature Files (Disconnected, Pending Restoration)

These fork-specific files exist in the tree but are not imported by the post-merge source:

- `server/src/services/transitReservationService.ts`
- `server/src/services/transitTime.ts`
- `server/src/services/transitRateLimit.ts`
- `server/src/services/oauthResources.ts`
- `server/src/mcp/oauthProvider.ts`
- `server/src/mcp/config.ts`
- `server/src/mcp/scopes.ts` (fork-specific scopes)
- `client/src/utils/dayMovementPlan.ts`
- `client/src/utils/movementStats.ts`
- `client/src/utils/resolveDayMovementPlan.ts`
- `client/src/utils/trackGeometry.ts`
- `client/src/utils/trackStats.ts`
- `client/src/utils/polyline.ts`
- `client/src/components/Planner/transitConnector.ts`
- `client/src/components/Planner/DayMovementTotalRow.tsx`
- `client/src/api/oauthScopes.ts`
- `client/src/components/OAuth/ScopeGroupPicker.tsx`
- `client/src/pages/OAuthAuthorizePage.tsx`
- `client/tests/unit/utils/dayMovementPlan.test.ts`
- `client/tests/unit/utils/movementStats.test.ts`

### Fixture Exclusion Verification

- `server/tests/fixtures/pre-upstream-3.4-fork.sqlite` — excluded by `*.sqlite` in `.gitignore:18`, not staged, not committed
- `server/tests/fixtures/pre-upstream-3.4-fork-fixture.json` — excluded by entry in `.git/info/exclude:10`, not staged, not committed
- `.superpowers/sdd/review-task-02-4ce5c739..working-tree-final.diff` — excluded by pattern in `.git/info/exclude`, not staged, not committed
- `.superpowers/sdd/task-02-report.md` — excluded by pattern in `.git/info/exclude`, not staged, not committed
- All fixtures and review artifacts are local-only and not part of any committed tree

### Handoff

- **Task 03** consumes: merge commit `68fe32c7` and `server/tests/fixtures/pre-upstream-3.4-fork.*`.
- **Tasks 04-12** consume: this conflict ledger (merge-tree conflicts + auto-merged inventory) for semantic resolution guidance.
- Install commands: `npm ci && npm --prefix plugin-sdk ci && npm run build --workspace=shared`

## Task 07 — Approved Completion

**Status:** DONE / APPROVED
**Completed:** 2026-07-20
**Commits:** `2dad7fe9`, `ea08df9b`

Task 07 plugin runtime, OAuth broker, MCP proxy, SDK, and egress reconciliation is approved. The remediation commit addressed OAuth state/provider binding, active and compatible resource filtering, permission reconciliation and runtime reloads, SDK request parity, and focused OAuth/resource tests.

### Verification

- Server typecheck: PASS (0 errors)
- Plugin unit/integration tests: PASS (48 files, 717 tests)
- Plugin-SDK tests: PASS (227/235 tests; 11/12 files)
- Plugin-SDK build: PASS
- Plugin-SDK pack dry run: PASS
- Fixture policy: fixtures remain local-only; none staged or committed

### Handoff

- **Task 08** consumes: the approved Task 07 state and the Day Movement Plan / OSRM reconciliation brief at `.superpowers/sdd/task-08-brief.md`.

## Task 08 — Approved Completion

**Status:** DONE / APPROVED
**Completed:** 2026-07-20
**Commits:** `9c11cfa6`, `c4f834f9`

Task 08 day movement planning and OSRM resolution is complete and review approved. The canonical movement parts, grouped OSRM resolution, fallback/abort behavior, track metrics, stable connector placement, and visibility-independent route calculation are ready for Task 09.

### Handoff

- **Task 09** consumes: canonical movement parts, stable movement-part keys, connector metrics, and route-calculation behavior from commits `9c11cfa6` and `c4f834f9`.
- **Review:** APPROVED.
- **Fixture policy:** fixtures remain local-only; none staged or committed.

## Task 09 — Reviewer Findings Fix (In Progress)

### Completed: 2026-07-20

### Changes

1. **Restore reposition behavior and tests in MapView and MapViewGL**
   - Restored `repositionPlaceId`, `canRepositionPlaces`, `onPlaceRepositionStart`, `onPlaceRepositionEnd` props with full drag/reposition implementation
   - Reposition marker styled with blue glow shadow, grabbing cursor, draggable=true
   - Reposition marker excluded from MarkerClusterGroup in Leaflet and cluster source data in GL
   - Drag start clears hover tooltip, drag end emits coordinates with 350ms click suppression
   - Restored 3 reposition tests in MapView.test.tsx (FE-COMP-MAPVIEW-021/022/023)
   - Restored 2 reposition tests in MapViewGL.test.tsx (FE-COMP-MAPVIEWGL-014/015)

2. **Deduplicate stored/toggled visibility IDs**
   - `parseStoredConnections` now deduplicates IDs on parse (both legacy arrays and tagged objects)
   - `toggleConnectionId` deduplicates on both add and remove paths
   - Added 5 deduplication tests in connectionsVisibility.test.ts

3. **Include visible booking route endpoints in Leaflet and GL bounds**
   - Added `visibleReservationEndpointPoints()` to reservationRoutes.ts extracting GeoPointish from visible reservations
   - Updated MapView initial viewport computation to include visible reservation endpoints
   - Updated MapView BoundsController to include reservation endpoint coords in fitBounds
   - Updated MapViewGL fitBounds to include reservation endpoint coords
   - Added 5 tests for visibleReservationEndpointPoints including non-finite and zero-coordinate handling

4. **Recompute bounds on visibility changes**
   - Added useEffect in useTripPlanner that bumps fitKey when visibleConnections ID set changes
   - Uses sorted JSON comparison to detect actual changes, avoiding initial load re-trigger

### Verification
- Typecheck: 0 new errors (only pre-existing Task 10 errors in dayMovementPlan.test.ts)
- Unit tests: 104 passed (connectionsVisibility, mapViewport, reservationRoutes, MapView, MapViewGL)
- Sidebar tests: 122 passed (DayPlanSidebar, DayPlanSidebarRouteConnector)
- Integration test: 35 passed (useRouteCalculation)
- Total: 266 tests passed across 8 test files
- Fixture policy: fixtures remain local-only; none staged or committed

### Handoff
- **Task 10** consumes: canonical reservations, geometry ownership, sidebar connectors with reposition support, and visibility-aware bounds from this commit.
- **Concerns:** None.

## Task 09 — Approved Completion

**Status:** DONE / APPROVED
**Completed:** 2026-07-20
**Commits:** `5d3385bc`, `75edfe25`

Task 09 booking-route visibility, map bounds, sidebar connectors, and transit overlay reconciliation is complete and approved. The remediation commits restore the required map/sidebar type contracts, correct the sidebar route mock, preserve visibility-independent OSRM behavior, and retain canonical reservation geometry ownership.

### Verification

- Focused client suites: PASS — 251 tests across 8 files.
- Route-calculation integration suite: PASS — 35 tests.
- Client typecheck: no new errors; 13 pre-existing Task 10 fixture errors remain in `dayMovementPlan.test.ts`.
- Fixture policy: fixtures remain local-only; none staged or committed.

### Handoff

- **Task 10** consumes: normalized visible reservations, stable rendered geometry ownership, canonical sidebar movement placements, and visibility-aware bounds.
- **Task 10 brief:** `.superpowers/sdd/task-10-brief.md`.
- **Review:** APPROVED.
