# Connector transit planning progress

## Task 1: Add the pure transit-connector model

- Base commit: `04629a9d592e55bcf0aa0a60c9481d87aebb469d`
- Red: `npm run test --workspace=client -- src/components/Planner/transitConnector.test.ts` — failed as expected because `./transitConnector` did not exist.
- Green: `npm run test --workspace=client -- src/components/Planner/transitConnector.test.ts` — passed, 1 file and 13 tests.
- Verification: `npm run typecheck --workspace=client` — passed.
- Commit: `feat(transit): add connector planning model`
- Status: complete
- Reviewer: APPROVED

## Task 2: Make the route label open an accessible one-action popover

- Base commit: `28920cc0c7f7df67ee346502fbb04ef355a10d96`
- Red: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebarRouteConnector.test.tsx` — failed as expected because `RouteConnector` ignored `transitAction` and rendered no accessible trigger or menu.
- Green: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebarRouteConnector.test.tsx` — passed, 1 file and 7 tests.
- Adjacent verification: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebar.test.tsx` — passed, 1 file and 105 tests.
- Typecheck: `npm run typecheck --workspace=client` — passed.
- Preservation check: `HotelRouteConnector` tail matched the base exactly (`sha256 458fa4eb388e7d3d7748624740cebfe0f083f55770505b218b98db791d7c01cd`).
- Commit: `feat(transit): add route connector action menu`
- Status: complete
- Reviewer: CHANGES REQUESTED — the portal used content-box sizing while horizontal placement assumed its nominal width, vertical placement used a hardcoded height, and explicit Enter/Space coverage was missing.

### Task 2 review fix: Clamp the connector action menu

- Base commit: `919201abb0cf9fac6a324207f701ec095eefcde6`
- Red: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebarRouteConnector.test.tsx` — failed 1 of 10 tests as expected: rendered menu bounds required `left: 12px`, `top: 36px`, and border-box sizing, but the implementation produced `left: 22px`, `top: 68px`, and content-box sizing. Explicit Enter and Space tests passed through native button behavior.
- Green: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebarRouteConnector.test.tsx` — passed, 1 file and 10 tests.
- Adjacent verification: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebar.test.tsx` — passed, 1 file and 105 tests.
- Typecheck: `npm run typecheck --workspace=client` — passed.
- Changed-file lint: `npm exec --workspace=client -- eslint src/components/Planner/DayPlanSidebarRouteConnector.tsx src/components/Planner/DayPlanSidebarRouteConnector.test.tsx` — passed.
- Diff check: `git diff --check` — passed.
- Preservation check: `HotelRouteConnector` tail matched the base exactly (`sha256 458fa4eb388e7d3d7748624740cebfe0f083f55770505b218b98db791d7c01cd`).
- Commit: `fix(transit): clamp connector action menu`
- Status: complete
- Task 2 reviewer: APPROVED; remaining Minor: popover getBoundingClientRect includes the entrance scale transform, which can slightly under-measure final dimensions and consume viewport padding; prefer offsetWidth/offsetHeight in a future cleanup.

## Task 3: Wire eligible POI connectors and suppress redundant transit connectors

- Base commit: `9f5f50c47bb2805fb61d460312d82b39cb6983d9`
- Red: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebar.test.tsx` — failed as expected, 3 failures because connector actions were not wired and transit-adjacent connectors were not suppressed.
- Green: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebar.test.tsx` — passed, 1 file and 109 tests.
- Locale parity test: `npm run test --workspace=client -- tests/unit/i18n/parity.test.ts` — passed, 1 file and 20 tests.
- Locale parity script: `node shared/scripts/i18n-parity.mjs` — passed (`File parity: OK`, `Key parity: OK`).
- Typecheck: `npm run typecheck --workspace=client` — passed.
- Regression: a first-class `transit` row without rich `metadata.transit` suppresses both adjacent route connectors.
- Status: complete
- Task 3 reviewer: APPROVED

## Task 4: Forward endpoint/time prefill and persist exact connector placement

- Base commit: `6c88158e`
- Red transit panel: `npm run test --workspace=client -- src/components/Planner/TransitSearchPanel.test.tsx` — failed as expected because the connector time stayed at `09:00`.
- Red planner page: `npm run test --workspace=client -- src/pages/TripPlannerPage.test.tsx` — failed as expected because full prefill was not forwarded and `_connectorPlacement` leaked into create/edit payloads.
- Green transit panel: `npm run test --workspace=client -- src/components/Planner/TransitSearchPanel.test.tsx` — passed, 1 file and 10 tests.
- Green planner page: `npm run test --workspace=client -- src/pages/TripPlannerPage.test.tsx` — passed, 1 file and 59 tests.
- Adjacent sidebar verification: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebar.test.tsx` — passed, 1 file and 109 tests.
- Stale-day/modal verification: `npm run test --workspace=client -- src/components/Planner/TransportModal.test.tsx` — passed, 1 file and 37 tests.
- Typecheck: `npm run typecheck --workspace=client` — passed.
- Regressions: create uses real store insertion; create/edit payloads strip the client-only hint; a changed transit day omits stale placement; manual and URL create paths reset connector state; failed positioning retains the created reservation and closes the modal.
- Status: complete
- Task 4 reviewer: APPROVED; remaining Minor: when connector positioning fails, the UI shows both the positioning error toast and the reservation-created success toast.

## Task 5: Add regression coverage, documentation, and full verification

- Base commit: `66ae2009`
- Missing-regression preflight: the day-header unprefilled, non-transit train connector preservation, and unaffected later B→C connector tests were absent, so all three were added.
- First affected-file run: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebar.test.tsx src/pages/TripPlannerPage.test.tsx` — passed immediately, 2 files and 171 tests; no production defect was exposed and no production code changed.
- Focused feature verification: `npm run test --workspace=client -- src/components/Planner/transitConnector.test.ts src/components/Planner/DayPlanSidebarRouteConnector.test.tsx src/components/Planner/TransitSearchPanel.test.tsx src/components/Planner/DayPlanSidebar.test.tsx src/pages/TripPlannerPage.test.tsx tests/unit/i18n/parity.test.ts` — passed, 6 files and 224 tests.
- Locale parity: `node shared/scripts/i18n-parity.mjs` — passed (`File parity: OK`, `Key parity: OK`).
- Typecheck: `npm run typecheck --workspace=client` — passed.
- Lint: `npm run lint --workspace=client` — passed.
- Full client test: `npm run test --workspace=client` — passed, 192 files; 3,232 passed and 38 skipped (3,270 total).
- Client build: `npm run build --workspace=client` — passed; Vite built 2,366 modules in 8.79s (existing chunk-size and ineffective-dynamic-import warnings only).
- Diff verification: `git diff --check` — passed; pre-commit status contained only the three Task 5 product/test documentation files plus this progress record.
- Status: complete

## Whole-branch review fixes

- Base commit: `fa0c1baaf910244b3ed9c95febf3429aea66cc31`
- IMPORTANT — explicit connector timeline placement was lost during final chronological ordering. Added a regression with places at 09:00/10:00 and a 13:00 first-class transit reservation at per-day position `0.5`; the final order now remains place A, transit, place B. Unpositioned transports retain the existing chronological fallback.
- MINOR — the connector menu measured transformed `getBoundingClientRect()` dimensions during its entrance animation. It now uses transform-independent `offsetWidth`/`offsetHeight`, with bounding-rect fallback only when layout dimensions are unavailable; trigger placement still uses its bounding rect.
- MINOR — a successful reservation create followed by failed connector-position persistence emitted both error and success toasts. The created reservation is still retained, returned, and the modal closes, but only the position error toast is emitted.
- Red day merge: `npm run test --workspace=client -- src/utils/dayMerge.test.ts` — failed 1 of 26 as expected (`[1, 2, 20]` instead of `[1, 20, 2]`).
- Red connector geometry: `npm run test --workspace=client -- src/components/Planner/DayPlanSidebarRouteConnector.test.tsx` — failed 1 of 10 as expected (`left: 122px; top: 74px` instead of `left: 12px; top: 36px`).
- Red toast behavior: `npm run test --workspace=client -- src/pages/TripPlannerPage.test.tsx -t "keeps the created reservation and closes when connector positioning fails"` — failed as expected because the success toast followed the error toast.
- Green direct regressions: `npm run test --workspace=client -- src/utils/dayMerge.test.ts src/components/Planner/DayPlanSidebarRouteConnector.test.tsx src/pages/TripPlannerPage.test.tsx` — passed, 3 files and 96 tests.
- Green connector/sidebar regressions: `npm run test --workspace=client -- src/components/Planner/transitConnector.test.ts src/components/Planner/DayPlanSidebarRouteConnector.test.tsx src/components/Planner/DayPlanSidebar.test.tsx` — passed, 3 files and 134 tests.
- Typecheck: `npm run typecheck --workspace=client` — passed.
- Changed-file lint: `npm exec --workspace=client -- eslint src/utils/dayMerge.ts src/utils/dayMerge.test.ts src/components/Planner/DayPlanSidebarRouteConnector.tsx src/components/Planner/DayPlanSidebarRouteConnector.test.tsx src/pages/tripPlanner/useTripPlanner.ts src/pages/TripPlannerPage.test.tsx` — passed with pre-existing warnings only and no errors.
- Diff check: `git diff --check` — passed.
- Status: all whole-branch findings resolved.
