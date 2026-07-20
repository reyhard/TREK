# Task 10 — Movement Statistics and Live Reservation Events

**Source plan:** `docs/superpowers/plans/upstream-3.4-sync/task-10-movement-stats-and-live-events.md`

## Objective

Preserve correct walking, driving, and cycling totals while making reservation WebSocket events update transit geometry, route visibility inputs, and derived movement state without reloads or double counting.

## Scope

- Reconcile `client/src/utils/movementStats.ts` around stable movement and reservation identity keys.
- Reconcile `client/src/store/slices/remoteEventHandler.ts` and `client/src/store/tripStore.ts` for canonical reservation events.
- Modify store selectors only where required by the existing architecture.
- Add the focused movement-statistics, remote-event, trip-store, and relevant store tests named in the source plan.

## Required Behavior

- Normalize invalid, negative, and NaN metrics to null; deduplicate contributions without summing duplicates.
- Count routes, tracks, transit walking, and hotel bookends exactly once, preserving per-mode totals and completeness flags.
- Read transit metadata from objects or JSON strings, prioritizing persisted leg distance, decoded geometry, duration-only data, and aggregate walking fallback.
- Keep non-WALK transit legs out of walking, driving, and cycling totals.
- Store complete canonical reservation objects for create/update events; preserve endpoints, day spans, metadata, and positions.
- Delete reservations and stale visibility references where the current store architecture owns that cleanup.
- Update positions without erasing canonical metadata or endpoints.
- Ensure updated transit metadata changes derived totals without a reload.

## Verification

```bash
npm --prefix client test -- client/tests/unit/utils/movementStats.test.ts
npm --prefix client run typecheck
npm --prefix client test -- \
  client/tests/unit/utils/movementStats.test.ts \
  client/tests/unit/remoteEventHandler \
  client/tests/unit/stores \
  client/tests/unit/tripStore.test.ts
```

## Handoff

Task 11 may render these totals and reservation cards, but must not derive new totals from labels or duplicate event normalization.
