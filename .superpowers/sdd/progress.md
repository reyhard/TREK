# Track-Aware Routing SDD Progress

- Worktree: `/opt/trek/worktrees/track-aware-routing`
- Branch: `feat/track-aware-routing`
- Base: `ab1e913dd4af9e0bc5bfe01b26480fd94a3c8ede`
- Baseline: affected client tests passed (5 files, 248 tests).
- Plan command adjustment: client test paths must be workspace-relative (omit the leading `client/`).
- Current-HEAD note: movement totals already include partial track/transit behavior in `movementStats.ts` and sidebar tests; preserve newer working behavior while introducing the approved shared movement-plan interfaces.

## Tasks

- [x] Task 1: Shared track geometry and duration utility
- [x] Task 2: Pure ordered day movement planner
- [x] Task 3: OSRM movement resolver
- [x] Task 4: Refactor `useRouteCalculation`
- [x] Task 5: Refactor sidebar routing and add track summary
- [x] Task 6: Route eligibility, transit-only routing, export, optimization
- [x] Task 7: Inspector metric reuse and single-track rendering
- [x] Task 8: Full verification and documentation

## Task 1 evidence

- Base: `ab1e913dd4af9e0bc5bfe01b26480fd94a3c8ede`
- RED: `npm run test --workspace=client -- tests/unit/utils/trackGeometry.test.ts` failed because the module did not exist.
- GREEN: the same command passed 14 tests; client typecheck passed.
- Implementation: `a5d52b0dc82d2115f7591e0d60ec74e19f23e00b` (`feat(planner): add shared track movement metrics`).
- Review fix: `e5117a2bf1350019d2cf34513beb49f08b2e0e8b` adds positive invalid-row filtering coverage; focused suite passes 15 tests.
- Specification review: APPROVED with no findings.
- Code-quality review: APPROVED after the test-only review fix.

## Task 2 evidence

- Base: `e5117a2bf1350019d2cf34513beb49f08b2e0e8b`
- RED: focused planner suite failed because `dayMovementPlan` did not exist.
- GREEN: planner suite passed 14 tests; existing hook regression passed 20 tests; typecheck and targeted lint passed.
- Implementation: `5783fee` (`feat(planner): add ordered day movement plan`).
- Reviews found two Important contract issues: missing `geometry` and sequence-derived keys.
- Review fix: `99a160e` (`fix(planner): stabilize movement part contract`); focused suite passes 16 tests.
- Eligibility decision: retained lone-track eligibility per execution-prompt non-negotiable #12 and current-HEAD safeguard, overriding the contradictory older helper snippet.
- Specification and code-quality re-reviews: APPROVED.

## Task 4 evidence

- Base: `920259e`.
- RED: five new hook tests failed while 20 legacy tests passed.
- Implementation: `7c80902` (`fix(map): route around imported track geometry`); initial focused hook/planner/resolver suite passed 53 tests.
- Reviews found cancellation, disabled eligibility, reservation scoping/signature, legacy-position, and pending-shape issues.
- Lifecycle review fix: `9be50ee` (`fix(map): harden movement route lifecycle`); focused suite passed 62 tests, typecheck/lint/diff checks passed.
- Final signature fix: `1a0567f` (`fix(map): refresh routes for transport timing`); hook suite passes 32 tests.
- Shared planner now filters real transport types and honors current-day legacy positions; hook plans while disabled, aborts on null/unmount, and exposes resolved-shaped pending parts.
- Specification and code-quality final re-reviews: APPROVED.

## Task 5 evidence

- Base: `1a0567f`.
- RED: focused sidebar tests failed on absent track summaries.
- Implementation: `be0282b` (`feat(planner): show track movement in day routes`); sidebar/hook passed 159 tests, RouteCalculator/movementStats passed 51 tests, typecheck/lint/diff passed.
- Quality review found legacy track-total divergence and silent unexpected resolver rejection.
- Review fix: `f426430` (`fix(planner): preserve shared movement metrics`); requested five-file matrix passed 219 tests.
- Movement totals now use `getTrackMovement`; unexpected sidebar resolver failures retain intrinsic tracks and mark connector metrics partial.
- Specification and code-quality final reviews: APPROVED.

## Task 7 evidence

- Base: `7bb8092`.
- RED: inspector shared-metric parity failed because the old path rejected filterable invalid rows.
- Implementation: `a871cf9` (`refactor(planner): share track geometry statistics`).
- Inspector + Leaflet + Mapbox/MapLibre tests passed 96 tests; lint and diff check passed.
- Specification and code-quality reviews: APPROVED.
- Fresh parent typecheck exposed cumulative earlier-task errors outside Task 7; these are explicitly deferred to Task 8 and must be resolved before completion.

## Task 6 evidence

- Base: `f426430`.
- RED: transit-only tools, track endpoint export, and optimizer locking tests failed as expected.
- Implementation: `6238423` (`fix(planner): preserve track and transit route behavior`); 250 focused tests, typecheck/lint/diff passed.
- Quality review found loop endpoint collapse and a transit-only no-op Google action.
- Review fix: `7bb8092` (`fix(planner): harden movement waypoint export`); planner/sidebar passed 153 tests, typecheck/lint/diff passed.
- Transit-only retains route controls but hides Google export with fewer than two external anchors; transit-internal geometry is never exported.
- Loop tracks preserve both semantic endpoints while shared boundaries remain deduplicated.
- Specification and code-quality final reviews: APPROVED.

## Task 3 evidence

- Base: `99a160e`.
- RED: focused resolver suite failed because the module did not exist; strengthened abort and malformed-success tests subsequently exposed expected failures.
- Implementation: `cd3a02c` (`feat(planner): resolve movement connectors through OSRM`).
- Initial GREEN: resolver suite passed 6 tests; typecheck/lint/diff checks passed.
- Quality review Important: fulfilled malformed OSRM coordinates bypassed the old straight-line safeguard.
- Review fix: `920259e` (`fix(planner): harden movement route resolution`); resolver suite passes 11 tests.
- Partial leg policy: keep valid group geometry while missing leg metrics remain null, preserving current partial-metrics behavior.
- Specification and code-quality re-reviews: APPROVED.

## Task 8 evidence

- Type-hardening fix: `d96e040` (`fix(planner): harden movement plan types`) narrows full-place geometry access, removes `Array.at` from affected tests, types planner options directly, and pins resolver coordinate tuples.
- Type-fix regression matrix: sidebar, planner, resolver, and hook suites passed 196 tests; client typecheck passed.
- Documentation: `34eab8c` (`docs(planner): document track-aware routing`) adds the supplied design and implementation plan unchanged. Both repository copies match their supplied artifacts byte-for-byte (`cmp` exit 0; SHA-256 `847a1a8c...` and `9c59f77c...`).
- Focused feature matrix with workspace-relative paths: passed 7 files and 289 tests in 26.3 seconds.
- Full client suite: passed (exit 0) in about 22 seconds; existing React `act`, React Router future-flag, and MSW unhandled-request warnings remain non-failing.
- Client typecheck: passed in about 26 seconds.
- Client lint: passed in about 27 seconds.
- Client production build: passed, 2,344 modules transformed and built in 23.99 seconds; existing large-chunk and ineffective-dynamic-import warnings remain non-failing.
- Repository `npm test`: shared passed 32 files / 137 tests, then server failed two pre-existing wall-clock ReDoS thresholds on the loaded Raspberry Pi (`MAPS-024`: 758 ms; `MAPS-026`: 569 ms; threshold 500 ms), so the chained client step did not run. An isolated retry of that server file reproduced only those two timing failures (`590 ms`, `558 ms`) with 117 tests passing. The full client suite was run and passed independently.
- Map-provider regression: Leaflet plus Mapbox GL and MapLibre GL suites passed 2 files / 44 tests in 23.0 seconds, including separate stored-GPX and connector-route assertions.
- Manual application matrix: not exercised because no local application server was listening on ports 5173 or 4173 and no authenticated fixture trip/browser session was available. Automated tests cover every requested movement arrangement and both GL providers.
- Scope check: branch diff contains only client and requested documentation paths; no server, shared schema, database, or migration changes.
- `git diff --check` reports only three intentional two-space Markdown hard breaks in the supplied design document lines 3-5. They are preserved because the execution prompt requires exact supplied content; all other changed files pass the whitespace check.

## Final whole-branch review

- Specification review: APPROVED. Loop tracks retain both semantic endpoints per execution-prompt non-negotiable #14; equal coordinates are deduplicated only across movement-part boundaries.
- Code-quality review: no Critical or Important findings. The only Minor is the exact supplied design's intentional Markdown hard-break whitespace, retained to satisfy the byte-for-byte preservation requirement.
- No push, pull request, merge, server/schema change, migration, or persistence redesign was performed.
