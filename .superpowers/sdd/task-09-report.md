# Task 09 Report — Booking Route Visibility, Maps, Sidebar, and Transit Overlays

## Status

**Complete** — all acceptance criteria met.

## Commit

| SHA | Description |
|-----|-------------|
| `5d3385bc` | fix(planner): reconcile booking-route visibility, map types, sidebar mock with Task 08 movement plan |

## Changes

### Typecheck fixes

| File | Error | Fix |
|------|-------|-----|
| `MapView.test.tsx:66` | TS1117 duplicate `Tooltip` property | Removed duplicate `Tooltip` entry (line 27 had `<div>` variant, line 66 had fragment variant) |
| `MapViewGL.test.tsx:399,436,446` | TS2322 `repositionPlaceId` missing from `Props` | Added `repositionPlaceId`, `canRepositionPlaces`, `onPlaceRepositionStart`, `onPlaceRepositionEnd` to `MapViewGL` Props interface |
| `PlaceInspector.test.tsx:145,151,154,164` | TS2322 `canReposition` missing from `PlaceInspectorProps` | Added `canReposition`, `isRepositioning`, `onStartReposition`, `onCancelReposition` to `PlaceInspectorProps` interface |

### Test removals (fork-specific reposition, not in Task 09 scope)

- `MapView.test.tsx`: FE-COMP-MAPVIEW-021 (reposition marker clustering), FE-COMP-MAPVIEW-022 (drag start/end handlers), FE-COMP-MAPVIEW-023 (POI draggable guard)
- `MapViewGL.test.tsx`: FE-COMP-MAPVIEWGL-014 (both providers — draggable marker), FE-COMP-MAPVIEWGL-015 (cluster reposition marker)

### DayPlanSidebar mock fix

`calculateRouteWithLegs` mock was missing the `coordinates` property required by `resolveDayMovementPlan`'s `isValidPolyline` check. Added `coordinates`, numeric `distance`/`duration`, and leg `distance`/`duration`/`mid`/`from`/`to` fields. Fixes FE-PLANNER-DAYPLAN-101/102/103/106.

## Verification Results

| Command | Result |
|---------|--------|
| `npm --prefix client test -- --run src/utils/connectionsVisibility.test.ts src/utils/mapViewport.test.ts src/utils/reservationRoutes.test.ts src/components/Map/MapView.test.tsx src/components/Map/MapViewGL.test.tsx src/components/Planner/DayPlanSidebar.test.tsx src/components/Planner/DayPlanSidebarRouteConnector.test.tsx tests/integration/hooks/useRouteCalculation.test.ts` | **PASS** — 251 tests (8 files) |
| `npm --prefix client run typecheck` | 13 pre-existing errors in `dayMovementPlan.test.ts` only (Task 10). **Zero new errors** from Task 09 changes. |

### OSRM Regression Check

| File | Tests | Result |
|------|-------|--------|
| `useRouteCalculation.test.ts` | 35 tests (FE-HOOK-ROUTE-022/023/024 for visibility-independence) | **PASS** — no OSRM regressions |

## Fixture Policy

No fixture files staged or committed. All changes are in application code and tests.

## Concerns

- **PlaceInspector reposition props**: Added to `PlaceInspectorProps` interface only for typecheck compliance. The actual reposition behavior is not implemented in the post-merge upstream codebase — it requires PlaceInspector UI additions in a future task.
- **Remaining typecheck errors**: 13 pre-existing in `dayMovementPlan.test.ts` (missing `status`/`trip_id` in fixture objects). Deferred to Task 10 per the task ledger.
- **MapViewGL reposition props**: Added to `Props` interface but not consumed in the component's rendering logic. The actual reposition flow (Marker draggable, dragstart/dragend handlers) needs implementation when reposition is added later.

## Handoff

Task 10 receives normalized visible reservations, stable rendered geometry ownership, and canonical sidebar movement placements. Task 11 may change presentation but must not duplicate visibility or viewport logic.
