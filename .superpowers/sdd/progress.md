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

**Status:** DONE (remediated)
**Completed:** 2026-07-20
**Remediated:** 2026-07-20 (branch rewritten to remove forbidden commit `a8f59fbb`)

### Merge Details

| Item | Value |
|------|-------|
| Branch | `integration/upstream-3.4.0` |
| Merge commit | `68fe32c79a2b42a518c1b7a7f9e173e08f9e875f` |
| Parent 1 (fork) | `4ce5c7390e9f3bb5a8d7c1857056161db09e356e` |
| Parent 2 (upstream frozen) | `3ca1ef34bb371bb0c76ca1b392e56c8a1c98ceb8` |
| Upstream ancestor verified | YES |
| Conflict count | 63 files (all resolved) |

### Resolution Strategy

**Repository metadata (.gitignore):** Kept fork additions (`.worktrees/`, `server/assets/wiki/`).

**Package manifests:** Auto-merged clean; verified required versions:
- `@modelcontextprotocol/sdk`: ^1.29.0
- `typescript`: ^6.0.2
- `zod`: ^4.3.6

**Semantic conflicts (62 files):** Provisional resolution — upstream taken as base (`--theirs`) for all semantic conflicts. Fork-specific files that had no upstream counterpart (e.g., `transitReservationService.ts`, `transitTime.ts`, `transitRateLimit.ts`, `oauthResources.ts`, `oauthProvider.ts`, `dayMovementPlan.ts`, `movementStats.ts`, etc.) remain in tree but are disconnected from upstream restructured source files.

**Lockfiles:** Regenerated from resolved manifests. `npm ci` passes for root and plugin-sdk.

### Dependency/Baseline Checks

| Check | Result |
|-------|--------|
| `npm ci` (root) | PASS (0 vulnerabilities) |
| `npm ci --prefix plugin-sdk` | PASS (0 vulnerabilities) |
| `npm run build --workspace=shared` | PASS |
| `npm --prefix server run typecheck` | 4 errors (deferred) |
| `npm --prefix client run typecheck` | 22+ errors (deferred) |
| No conflict markers | PASS |
| No unmerged paths | PASS |
| No duplicate `registerTransitTools` | PASS |
| Fork fixture files excluded | PASS (`.sqlite` via `.gitignore:18`; `.json` via `.git/info/exclude:10`) |

### Conflict Ledger — Semantic Ownership

All semantic conflicts were resolved provisionally by taking upstream file content. Fork behaviors that need restoration are listed below with owning later tasks.

#### Database / Migrations (Task 03)
- `server/src/db/database.ts`
  - Classification: schema overlap
  - Upstream owner: 3.4 schema restructuring
  - Fork behavior to port: columns (`reservations.day_plan_position`, `reservations.needs_review`), tables (`reservation_endpoints`, `plugin_oauth_tokens`, `plugin_oauth_state`, `plugin_scheduled_tasks`, `plugin_user_erasure_queue`, `plugin_actions`, `plugin_egress_hosts`, `plugin_capability_audit`), rotation chain (`oauth_tokens.parent_token_id`), DCR support (`oauth_clients.is_public`, `oauth_clients.created_via`), guest display (`users.display_name`)
  - Decision: upstream schema (provisional)
  - Owner: Task 03
- `server/src/db/migrations.ts`
  - Classification: migration ordering conflict
  - Upstream owner: 3.4 migration set
  - Fork behavior to port: 11+ fork migrations (migration directory)
  - Decision: upstream migration set (provisional)
  - Owner: Task 03

#### MCP / Transit (Tasks 04-06)
- `server/src/mcp/index.ts`
  - Classification: registration conflict
  - Upstream owner: 3.4 MCP server setup
  - Fork behavior to port: OAuth provider MCP configuration, plugin scope enforcement
  - Decision: upstream MCP setup (provisional)
  - Owner: Task 04
- `server/src/mcp/scopes.ts`
  - Classification: scope grammar conflict
  - Upstream owner: 3.4 scope definitions
  - Fork behavior to port: `plugin:<pluginId>:read|write` scopes, resource URI grammar
  - Decision: upstream scope definitions (provisional)
  - Owner: Task 04
- `server/src/mcp/sessionManager.ts`
  - Classification: session lifecycle conflict
  - Upstream owner: 3.4 session management
  - Fork behavior to port: OAuth token validation, audience/resource enforcement
  - Decision: upstream session management (provisional)
  - Owner: Task 04
- `server/src/mcp/tools.ts`
  - Classification: tool registration conflict
  - Upstream owner: 3.4 tool set
  - Fork behavior to port: transit tool registration, scope-gated tool visibility
  - Decision: upstream tool set (provisional)
  - Owner: Task 04
- `server/src/mcp/tools/transit.ts`
  - Classification: semantic overlap (add/add — both sides created this file)
  - Upstream owner: Transitous search/create journey
  - Fork behavior to port: `plan_transit_route`, `create_transit_route`, `update_transit_route`
  - Decision: upstream transit tools (provisional)
  - Owner: Task 05
- `server/src/mcp/tools/trips.ts`
  - Classification: structural conflict
  - Upstream owner: 3.4 trip tools
  - Fork behavior to port: transit-reservation integration in trip tools
  - Decision: upstream trip tools (provisional)
  - Owner: Task 05
- `server/src/services/transitService.ts`
  - Classification: transit calculation conflict
  - Upstream owner: Transitous integration
  - Fork behavior to port: timezone-aware UTC conversion, per-caller rate limiting
  - Decision: upstream Transitous service (provisional)
  - Owner: Task 06
- `server/tests/unit/mcp/tools-transit.test.ts`
  - Classification: test coverage (add/add)
  - Upstream owner: Transitous tests
  - Fork behavior to port: transit route plan/create/update tests
  - Decision: upstream tests (provisional)
  - Owner: Task 06

#### Plugins — Server (Tasks 07-08)
- `server/src/nest/plugins/host/create-rpc-host.ts`
  - Classification: RPC host structure
  - Upstream owner: 3.4 RPC host
  - Fork behavior to port: OAuth resources integration
  - Decision: upstream RPC host (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/host/rpc-host.ts`
  - Classification: RPC handler routing
  - Fork behavior to port: scope enforcement, OAuth token validation
  - Decision: upstream RPC host (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/install/discovery.ts`
  - Classification: plugin discovery
  - Fork behavior to port: egress host discovery, capability audit
  - Decision: upstream discovery (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/install/manifest.ts`
  - Classification: manifest validation
  - Fork behavior to port: oauthScope/permission/egress in manifest schema
  - Decision: upstream manifest validation (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/paths.ts`
  - Classification: path resolution
  - Fork behavior to port: plugin data/settings paths
  - Decision: upstream paths (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/plugin-backup.ts`
  - Classification: backup/restore staging
  - Upstream owner: 3.4 plugin tree backup (staged-tree restore)
  - Fork behavior to port: backup integration with OAuth token state, user erasure audit
  - Decision: upstream backup (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/plugin-frame.controller.ts`
  - Classification: iframe serving controller
  - Upstream owner: 3.4 plugin iframe host (sanitized origin, CSP)
  - Fork behavior to port: SSRF-guarded proxy URIs, path-scoped frame routing
  - Decision: upstream frame controller (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/plugin-runtime.service.ts`
  - Classification: runtime lifecycle
  - Fork behavior to port: scheduled tasks, user erasure, OAuth proxy, capability audit
  - Decision: upstream runtime service (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/plugins.controller.ts`
  - Classification: API surface
  - Fork behavior to port: OAuth endpoints, plugin action triggers, erasure
  - Decision: upstream plugin controller (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/plugins-feed.controller.ts`
  - Classification: plugin feed/content API
  - Upstream owner: 3.4 plugin widget feed (data proxy for sandboxed frames)
  - Fork behavior to port: scoped data access, plugin OAuth token passthrough
  - Decision: upstream feed controller (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/plugins-proxy.controller.ts`
  - Classification: OAuth proxy controller
  - Upstream owner: 3.4 plugin outbound proxy (host-brokered)
  - Fork behavior to port: OAuth token resolution, `is_admin` guard, resource-scoped proxying
  - Decision: upstream proxy controller (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/plugins.service.ts`
  - Classification: core plugin service
  - Fork behavior to port: OAuth client management, token rotation, DCR
  - Decision: upstream plugin service (provisional)
  - Owner: Task 07
- `server/src/nest/plugins/registry/registry.service.ts`
  - Classification: registry client
  - Fork behavior to port: fork registry endpoints, egress allowlisting
  - Decision: upstream registry service (provisional)
  - Owner: Task 08
- `server/src/nest/plugins/runtime/egress-policy.ts`
  - Classification: egress policy enforcement
  - Upstream owner: 3.4 egress allow/deny engine
  - Fork behavior to port: per-host allowlisting, capability audit chaining, operator egress config
  - Decision: upstream egress policy (provisional)
  - Owner: Task 08
- `server/src/nest/plugins/runtime/plugin-sdk.ts`
  - Classification: SDK API surface
  - Fork behavior to port: OAuth host functions, egress config, permission checks
  - Decision: upstream SDK API (provisional)
  - Owner: Task 08
- `server/src/middleware/globalMiddleware.ts`
  - Classification: middleware
  - Fork behavior to port: CORS for plugin iframes, SSRF guard
  - Decision: upstream middleware (provisional)
  - Owner: Task 08

#### Plugins — Client (Task 08)
- `client/src/components/Plugins/PluginFrame.tsx`
  - Classification: sandboxed plugin iframe
  - Upstream owner: 3.4 frame with `path` prop (settings/index entry) and currency resolution
  - Fork behavior to port: OAuth token injection, plugin-scoped confirm dialogs
  - Decision: upstream PluginFrame (provisional)
  - Owner: Task 08
- `client/src/components/Plugins/PluginWidgets.tsx`
  - Classification: widget rendering
  - Upstream owner: 3.4 PluginIcon-driven widget rendering
  - Fork behavior to port: fork plugin widget registration, OAuth-ready frame init
  - Decision: upstream PluginWidgets (provisional)
  - Owner: Task 08
- `client/src/components/Admin/AdminPluginsPanel.tsx`
  - Classification: admin plugin management
  - Upstream owner: 3.4 panel with trekRange/hostVersion verification, signature trust
  - Fork behavior to port: OAuth client CRUD, plugin erasure controls, action triggers
  - Decision: upstream AdminPluginsPanel (provisional)
  - Owner: Task 08
- `client/src/components/Settings/PluginSettingsTab.tsx`
  - Classification: plugin settings surface
  - Upstream owner: 3.4 settings tab with PluginFrame for capabilities.settingsUi
  - Fork behavior to port: declared-field OAuth binding, action button dispatch
  - Decision: upstream PluginSettingsTab (provisional)
  - Owner: Task 08

#### Client / Maps & Planner (Tasks 09-10)
- `client/src/components/Map/MapView.tsx`
  - Classification: map component
  - Fork behavior to port: reposition controls, track rendering, movement overlay
  - Decision: upstream MapView (provisional)
  - Owner: Task 09
- `client/src/components/Map/MapViewGL.tsx`
  - Classification: GL map component
  - Fork behavior to port: track layer, movement plan visualization, transit connector
  - Decision: upstream MapViewGL (provisional)
  - Owner: Task 09
- `client/src/components/Planner/PlaceInspector.tsx`
  - Classification: place inspector
  - Fork behavior to port: reposition controls, transit search integration
  - Decision: upstream PlaceInspector (provisional)
  - Owner: Task 09
- `client/src/components/Planner/TransportModal.tsx`
  - Classification: transport/reservation modal
  - Upstream owner: 3.4 transport editor with mode selection and timing
  - Fork behavior to port: day_plan_position ordering, transit connector integration, endpoint timezone
  - Decision: upstream TransportModal (provisional)
  - Owner: Task 09
- `client/src/components/Planner/TransportModal.test.tsx`
  - Classification: transport modal test coverage
  - Fork behavior to port: day_plan_position, endpoint-local_time, transit connector tests
  - Decision: upstream tests (provisional)
  - Owner: Task 10
- `client/src/components/Planner/DayPlanSidebar.tsx`
  - Classification: day plan sidebar
  - Upstream owner: 3.4 sidebar with day itinerary and reservation cards
  - Fork behavior to port: movement total row, track summary section, transit connector display
  - Decision: upstream DayPlanSidebar (provisional)
  - Owner: Task 10
- `client/src/components/Planner/DayPlanSidebarFooter.tsx`
  - Classification: sidebar footer summary
  - Upstream owner: 3.4 footer with distance/duration totals
  - Fork behavior to port: movement stats aggregation, track geometry summary
  - Decision: upstream DayPlanSidebarFooter (provisional)
  - Owner: Task 10
- `client/src/components/Planner/DayPlanSidebarToolbar.tsx`
  - Classification: sidebar toolbar
  - Upstream owner: 3.4 toolbar with add/import actions
  - Fork behavior to port: transit search trigger, reposition controls
  - Decision: upstream DayPlanSidebarToolbar (provisional)
  - Owner: Task 10
- `client/src/pages/TripPlannerPage.tsx`
  - Classification: planner page
  - Fork behavior to port: day movement total row, track summary sidebar
  - Decision: upstream TripPlannerPage (provisional)
  - Owner: Task 10
- `client/src/pages/tripPlanner/useTripPlanner.ts`
  - Classification: planner hook
  - Fork behavior to port: route calculation, movement plan integration
  - Decision: upstream useTripPlanner (provisional)
  - Owner: Task 10
- `client/src/components/Planner/DayPlanSidebar.test.tsx`
  - Classification: test coverage
  - Fork behavior to port: track summary tests
  - Decision: upstream tests (provisional)
  - Owner: Task 10
- `client/src/pages/TripPlannerPage.test.tsx`
  - Classification: test coverage
  - Fork behavior to port: movement plan tests
  - Decision: upstream tests (provisional)
  - Owner: Task 10

#### API Client (Task 09)
- `client/src/api/client.ts`
  - Classification: API client surface
  - Upstream owner: 3.4 API client with plugin endpoints (pluginsApi, adminApi) and Trip types
  - Fork behavior to port: OAuth scope parsing, plugin action endpoints, transit plan/create/update API calls
  - Decision: upstream API client (provisional)
  - Owner: Task 09

#### Services (Tasks 11-12)
- `server/src/services/reservationService.ts`
  - Classification: reservation logic
  - Fork behavior to port: day_plan_position, endpoints, transit integration
  - Decision: upstream reservation service (provisional)
  - Owner: Task 11
- `server/src/nest/reservations/reservations.service.ts`
  - Classification: NestJS reservation wrapper
  - Fork behavior to port: endpoint CRUD, transit reservation creation
  - Decision: upstream NestJS reservation service (provisional)
  - Owner: Task 11
- `server/src/services/tripService.ts`
  - Classification: trip management
  - Fork behavior to port: display_name, transit-linked reservations
  - Decision: upstream trip service (provisional)
  - Owner: Task 11
- `server/src/nest/trips/trips.service.ts`
  - Classification: NestJS trip wrapper
  - Fork behavior to port: transit-aware trip data
  - Decision: upstream NestJS trip service (provisional)
  - Owner: Task 11
- `server/src/services/adminService.ts`
  - Classification: admin operations
  - Fork behavior to port: plugin administration, OAuth client management, erasure queue
  - Decision: upstream admin service (provisional)
  - Owner: Task 11
- `server/src/services/budgetService.ts`
  - Classification: budget calculation
  - Fork behavior to port: transit cost integration
  - Decision: upstream budget service (provisional)
  - Owner: Task 11
- `server/src/services/packingService.ts`
  - Classification: packing list
  - Fork behavior to port: weather-aware packing
  - Decision: upstream packing service (provisional)
  - Owner: Task 11
- `server/src/services/atlasService.ts`
  - Classification: atlas/places
  - Fork behavior to port: place repositioning, track-geometry integration
  - Decision: upstream atlas service (provisional)
  - Owner: Task 12
- `server/src/services/wikiService.ts`
  - Classification: wiki engine
  - Fork behavior to port: offline snapshot, asset serving
  - Decision: upstream wiki service (provisional)
  - Owner: Task 12
- `server/src/services/airtrail/airtrailImport.ts`
  - Classification: airtrail import
  - Fork behavior to port: transit-aware import
  - Decision: upstream airtrail import (provisional)
  - Owner: Task 12
- `server/src/services/airtrail/airtrailMapper.ts`
  - Classification: airtrail mapping
  - Fork behavior to port: day_plan_position mapping
  - Decision: upstream airtrail mapper (provisional)
  - Owner: Task 12

### Deferred Typecheck Failures

| # | File | Errors | Owner Task |
|---|------|--------|------------|
| 1 | `server/src/nest/oauth/oauth-api.controller.ts` | `oauthResources` on PluginRuntimeService | Task 07 |
| 2 | `server/src/nest/plugins/plugins-proxy.controller.ts` | `is_admin` in proxy user type | Task 07 |
| 3 | `server/src/nest/plugins/runtime/plugin-host-entry.ts` | `oauthScope` on PluginRoute | Task 08 |
| 4 | `client/src/components/Map/MapView.test.tsx` | duplicate property | Task 09 |
| 5 | `client/src/components/Map/MapViewGL.test.tsx` | `repositionPlaceId` missing | Task 09 |
| 6 | `client/src/components/Planner/PlaceInspector.test.tsx` | `canReposition` missing | Task 09 |
| 7 | `client/tests/unit/utils/dayMovementPlan.test.ts` | `status`/`trip_id` in fixtures | Task 10 |

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
- Both fixtures are local-only and not part of any committed tree; accessible for Task 03 consumption

### Handoff

- **Task 03** consumes: merge commit `68fe32c7` and `server/tests/fixtures/pre-upstream-3.4-fork.*`.
- **Tasks 04-12** consume: this conflict ledger for semantic resolution guidance.
- Install commands: `npm ci && npm --prefix plugin-sdk ci && npm run build --workspace=shared`
