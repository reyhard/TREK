# Task 05 Report — Canonical Transit Validation and Persistence Services

## Status

**Complete** — all acceptance criteria met.

## Commit

`5a5ab75c` on `integration/upstream-3.4.0`:
`refactor(transit): unify itinerary validation and persistence mapping`

## Files modified

| File | Action |
|------|--------|
| `server/src/services/transitItineraryService.ts` | Added `buildTransitJourneyPatch()`, `metadataObject()`, `TransitJourneyPatch` type, `getDay`/`listDays` imports |
| `server/tests/unit/services/transitItineraryService.test.ts` | **New** — 28 tests across validation (ITI-VAL-*), patch builder (ITI-PATCH-*) |
| `server/src/services/transitReservationService.ts` | **Deleted** — fork duplicate, all consumers migrated |
| `server/src/services/transitTime.ts` | **Deleted** — fork duplicate, all consumers migrated |
| `server/tests/unit/services/transitReservationService.test.ts` | **Deleted** — tests for removed fork service |
| `server/tests/unit/services/transitTime.test.ts` | **Deleted** — tests for removed fork service |

**Not modified:** `server/src/services/transitService.ts`, `server/src/services/timezoneService.ts`, `server/src/services/reservationService.ts` — all already reconciled with upstream.

## Commands and results

```bash
npm --prefix server run typecheck
# → 4 pre-existing plugin errors (oauthResources, is_admin, oauthScope) — 0 transit errors

npm --prefix server test -- tests/unit/services/transitItineraryService.test.ts tests/unit/services/transitService.test.ts
# → 2 test files, 39 tests, all passed

git grep -n 'transitReservationService\|transitTime' server/src server/tests
# → (no output) — zero production references
```

## Full test suite (all transit tests)

```bash
npm --prefix server test -- tests/unit/services/transitItineraryService.test.ts tests/unit/services/transitService.test.ts tests/unit/services/transitRateLimit.test.ts
# → 3 test files, 43 tests, all passed
```

## Fixture safety check

- `server/tests/fixtures/pre-upstream-3.4-fork.sqlite` — gitignored, not staged
- `server/tests/fixtures/pre-upstream-3.4-fork-fixture.json` — gitignored, not staged
- No fixture files appear in `git status --short`
- Only changes committed: application code + tests

## Self-review

- **One itinerary schema** (`transitItinerarySchema`) owns all cross-field validation via `superRefine` — chronology, leg bounds, adjacent-leg distance, itinerary anchors, geometry cap, duration tolerance.
- **One patch builder** (`buildTransitJourneyPatch`) owns endpoints, times, metadata — replaces `buildTransitReservationParts` pattern.
- **effectiveTransitStopTime** implements `time ?? scheduledTime ?? null` fallback.
- **metadataObject** safely parses JSON strings, objects, null/undefined.
- **Metadata merge** preserves `plugin_extension` and unrelated fields, overwrites only `metadata.transit`.
- **Optional leg distance** (`leg.distance`) included in metadata; readers must tolerate absent value.
- **Broad provider response modes** (AIRPLANE, OTHER, etc.) accepted — mode regex only checks `[A-Z_]+`, no request-whitelist restriction.
- **No production imports** of `transitReservationService` or `transitTime` remain.
- **Pre-existing typecheck errors** (4 plugin-oauth errors) unrelated, unchanged.
- **Handoff contract**: Task 06 should call `buildTransitJourneyPatch()` for both create and update paths.

## Concerns

- `buildTransitJourneyPatch()` has a DB dependency (`getDay`, `listDays`) — this is consistent with the replaced `buildTransitRouteFields` pattern.
- The `distance` field in leg metadata is additive after the upstream schema; old records without it are tolerated but consumers should use optional chaining (`leg.distance ?? undefined`).
- The MCP tool `create_transit_journey` (`mcp/tools/transit.ts`) still uses the old `buildTransitReservationParts` helper — migrating it to `buildTransitJourneyPatch` is deferred to Task 06 per the handoff contract.

## Report path

`.superpowers/sdd/task-05-report.md`
