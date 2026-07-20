# Task 09 — Booking Route Visibility, Maps, Sidebar, and Transit Overlays

**Source plan:** `docs/superpowers/plans/upstream-3.4-sync/task-09-route-visibility-maps-and-sidebar.md`

## Objective

Reconcile upstream per-trip booking-route visibility with Task 08's canonical movement plan. Produce equivalent Leaflet and GL geometry, correct visible bounds, and explicit sidebar connector placement without duplicate drawing or unnecessary OSRM calls.

## Scope

- Reconcile `client/src/utils/connectionsVisibility.ts` and per-trip visibility storage.
- Reconcile `client/src/utils/mapViewport.ts` and `client/src/utils/reservationRoutes.ts`.
- Update `client/src/pages/tripPlanner/useTripPlanner.ts` without adding visibility to route-request dependencies.
- Reconcile `MapView`, `MapViewGL`, `MapViewAuto`, and related types.
- Reconcile sidebar connectors and track summaries using canonical movement placements.
- Update the corresponding focused tests named in the source plan.

## Required Behavior

- Parse legacy number arrays and new `only` / `all-except` visibility shapes, including malformed input and duplicate IDs.
- Per-trip state wins after an explicit write; account-wide settings provide only the initial effective mode.
- Select only reservations with renderable booking geometry; hidden routes affect neither overlays nor bounds.
- Share normalized route geometry and preserve equivalent Leaflet/GL rendering ownership.
- Draw movement connectors, tracks, and transit overlays exactly once.
- Attach sidebar connectors and track summaries to explicit movement placements; transit breaks ordinary routing.
- Visibility changes do not trigger OSRM recalculation.

## Verification

```bash
npm --prefix client test -- \
  client/tests/unit/utils/connectionsVisibility.test.ts \
  client/tests/unit/utils/mapViewport.test.ts \
  client/tests/unit/utils/reservationRoutes.test.ts \
  client/src/components/Map/MapView.test.tsx \
  client/src/components/Map/MapViewGL.test.tsx \
  client/src/components/Planner/DayPlanSidebar.test.tsx \
  client/src/components/Planner/DayPlanSidebarRouteConnector.test.tsx
npm --prefix client run typecheck
npm --prefix client test -- client/src/components/Map client/src/components/Planner client/tests/integration/hooks/useRouteCalculation.test.ts
```

## Handoff

Task 10 receives normalized visible reservations, stable rendered geometry ownership, and canonical sidebar movement placements. Task 11 may change presentation but must not duplicate visibility or viewport logic.
