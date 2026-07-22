# Task 7 Report: Reservation Map Regression Coverage

## TDD Summary

### RED phases

**Focused test (before production changes):**
```bash
npm run test --workspace=client -- src/components/Map/ReservationOverlay.test.tsx
```
Result: All 3 tests passed against the current renderer — no production changes needed.

### GREEN phases

No production changes required. The renderer already uses `reservation.endpoints` for:
- Marker positions (via `waypoints` → `wp.lat`/`wp.lng`)
- Polyline fallback arcs (via `item.arcs` derived from endpoint coords)
- Provider geometry independence (via `getTransitMapSegments` which reads `metadata.transit.legs`)

### Test cases created

1. **uses saved endpoint coordinates for markers and the no-geometry fallback line** — No-geometry transit: markers and polyline at endpoint coords
2. **keeps provider geometry independent from edited endpoint coordinates** — Transit with encoded polyline: markers at endpoints, polylines at decoded coords, endpoint pair NOT in polylines
3. **renders an untouched route with its stored endpoint coordinates** — Legacy transit (null metadata): markers and polyline at original endpoint coords

## Verification

| Check | Status |
|-------|--------|
| ReservationOverlay tests | 3/3 passed |
| reservationRoutes tests | 12/12 passed |
| TransitJourneyModal tests | 12/12 passed |
| All related tests | 27/27 passed |
| Production changes | None required |

## Commit

| SHA | Message |
|-----|---------|
| `(pending commit)` | `test(map): lock transit endpoint rendering` |

## Files

| File | Action |
|------|--------|
| `client/src/components/Map/ReservationOverlay.test.tsx` | Created |
| `.superpowers/sdd/progress.md` | Task 6 entry appended |
| `.superpowers/sdd/task-7-report.md` | Created |

## Concerns

- None. Test harness mirrors existing MapView.test.tsx patterns. All coordinates chosen to exceed the pixel-distance declutter threshold in the map mock.
