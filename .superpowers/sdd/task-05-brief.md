# Task 05 — Canonical Transit Validation and Persistence Services

**Source plan:** `docs/superpowers/plans/upstream-3.4-sync/task-05-canonical-transit-services.md`

## Objective

Consolidate provider normalization, itinerary validation, timezone conversion, endpoint construction, metadata construction, and route-derived reservation patches into one canonical transit service layer.

## Inputs And Constraints

- Consume Task 03's reconciled database/day/reservation contracts and Task 04's unique transit registrar and scope gates.
- Preserve upstream lazy user-agent initialization, scheduled modes, bounded provider cache, `deriveTransitStats`, and status normalization.
- Keep provider response leg modes broad; do not restrict them to the request whitelist.
- Do not add duplicate validators, metadata builders, transit services, or movement calculations.
- Preserve unrelated reservation metadata and avoid broad casts, disabled tests, or unrelated refactors.
- Keep `pre-upstream-3.4-fork.sqlite` and `pre-upstream-3.4-fork-fixture.json` local-only and uncommitted.

## Scope

- Reconcile `server/src/services/transitService.ts`.
- Reconcile `server/src/services/transitItineraryService.ts` and `server/src/services/timezoneService.ts`.
- Modify `server/src/services/reservationService.ts` only when required for transactional metadata/endpoints preservation.
- Delete `server/src/services/transitReservationService.ts` and `server/src/services/transitTime.ts` after consumers are migrated.
- Add or update `server/tests/unit/services/transitItineraryService.test.ts` and `server/tests/unit/services/transitService.test.ts`.

## Required Behavior

- Define one strict itinerary schema with effective stop time fallback: `time ?? scheduledTime ?? null`.
- Validate chronology, effective times, leg bounds, adjacent-leg distance, itinerary anchors, endpoint proximity, geometry cap, and duration tolerance.
- Accept uppercase provider response modes beyond the request whitelist.
- Build `buildTransitJourneyPatch(tripId, dayId, from, to, itinerary, existingMetadata?)` containing day IDs, local reservation times, ordered endpoints, canonical metadata, and `needs_review: false`.
- Support same-day and overnight journeys, endpoint timezones, optional intermediate stops, metadata merge, and additive leg distance.
- Remove all production references to the duplicate fork transit services.

## Verification

```bash
npm --prefix server run typecheck
npm --prefix server test -- tests/unit/services/transitItineraryService.test.ts tests/unit/services/transitService.test.ts
git grep -n 'transitReservationService\|transitTime' server/src server/tests
```

Expected grep result: no production references. Commit the independently reviewable change as:

```text
refactor(transit): unify itinerary validation and persistence mapping
```

## Handoff

Task 06 must call `buildTransitJourneyPatch()` for both transit create and update paths, rather than rebuilding transit fields manually.
