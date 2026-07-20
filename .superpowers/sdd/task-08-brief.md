# Task 08 — Day Movement Plan and OSRM Resolution

**Source plan:** `docs/superpowers/plans/upstream-3.4-sync/task-08-day-movement-plan-and-osrm.md`

## Objective

Preserve the fork's pure movement-planning architecture while adopting upstream ordering and multi-day transport behavior. One canonical plan must own connector anchors, tracks, transport breaks, route eligibility, and export waypoints.

## Scope

- Reconcile `client/src/utils/dayMovementPlan.ts`.
- Reconcile `client/src/utils/resolveDayMovementPlan.ts` with grouped OSRM calls and correct fallback/abort behavior.
- Preserve track metrics and geometry invariants in `client/src/utils/trackGeometry.ts`.
- Update `client/src/hooks/useRouteCalculation.ts` so visibility-only changes do not reroute.
- Update the named unit and integration tests in the source plan.

## Required Behavior

- Retain `PlannedRoutedPart`, `TrackMovementPart`, and `TransitMovementPart` semantics and stable connector placement types.
- Handle ordinary places, tracks in every position, loops, hotels, located and unlocated transport, multi-day transport, and automated transit with or without endpoints.
- Keep route eligibility correct for transit-only and track-only plans; deduplicate exported waypoints while retaining loop endpoints.
- Group consecutive routed parts into one `calculateRouteWithLegs` call, split at track/transport boundaries, and map returned legs to stable part keys.
- On non-abort resolver failure, return straight geometry with null metrics; propagate aborts without stale state.
- Keep track mode and metrics independent from the global connector profile; normalize unknown track modes to walking.
- Exclude booking-route visibility from route-calculation dependencies.

## Verification

```bash
npm --prefix client test -- client/tests/unit/utils/dayMovementPlan.test.ts client/tests/unit/utils/resolveDayMovementPlan.test.ts
npm --prefix client run typecheck
npm --prefix client test -- client/tests/unit/utils/dayMovementPlan.test.ts client/tests/unit/utils/resolveDayMovementPlan.test.ts client/tests/integration/hooks/useRouteCalculation.test.ts
```

## Handoff

Task 09 must render only the canonical movement parts produced here and must not recompute routing ownership from raw reservations or assignments. Task 10 consumes stable movement-part keys and connector metrics.
