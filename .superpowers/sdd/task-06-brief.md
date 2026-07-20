# Task 06 — MCP Transit Tools and `update_transit_journey`

**Source plan:** `docs/superpowers/plans/upstream-3.4-sync/task-06-mcp-transit-tools.md`

## Objective

Expose the four upstream-aligned MCP transit tools and add route-only journey updates through the canonical Task 05 service layer.

## Inputs And Constraints

- Consume Task 04's single transit registrar and scope gates.
- Consume Task 05's `buildTransitJourneyPatch()` and canonical itinerary schema.
- Remove `buildTransitReservationParts`; do not rebuild transit fields in MCP handlers.
- Route both create and update through `buildTransitJourneyPatch()`.
- Preserve route-derived leg distance and unrelated reservation metadata.
- Create/update must make no provider calls.
- Do not add duplicate registrars, validators, metadata builders, or compatibility aliases.
- Do not mask failures with broad casts, disabled tests, or unrelated refactors.

## Scope

- Reconcile `server/src/mcp/tools/transit.ts`.
- Modify `server/src/mcp/tools.ts` only to retain one registrar call.
- Modify `server/src/mcp/tools/_shared.ts` only when an existing write annotation/export must be reused.
- Update `server/tests/unit/mcp/tools-transit.test.ts`.
- Update `server/tests/integration/mcp.test.ts`.
- Read `server/src/services/transitItineraryService.ts` and `server/src/services/reservationService.ts`.

## Required Behavior

- Register exactly `search_transit_stops`, `search_transit_routes`, `create_transit_journey`, and `update_transit_journey`.
- Gate searches on `geo:read` and writes on `reservations:write`; full access sees all four.
- Preserve upstream search inputs and behavior, including named endpoints, offset timestamps, `arriveBy`, modes, `maxTransfers`, filtering, dropped counts, broad response modes, rate limits, and provider errors.
- Add `update_transit_journey` with trip/reservation/day/from/to/itinerary inputs.
- Validate demo access, trip access, `reservation_edit`, reservation ownership, transit type, foreign days, and missing arrival days.
- Accept legacy fork-created transit metadata without validating it before replacement.
- Call `buildTransitJourneyPatch(..., current.metadata)` for create and update; preserve generic fields, unrelated metadata, and additive leg distance.
- Update emits `reservation:updated` and `notifyBookingChange`; database failures emit no broadcast and return a generic error.
- Remove old `plan_transit_route`, `create_transit_route`, and `update_transit_route` production references.

## Verification

```bash
npm --prefix server run typecheck
npm --prefix server test -- tests/unit/mcp/tools-transit.test.ts tests/integration/mcp.test.ts
git grep -n 'plan_transit_route\|create_transit_route\|update_transit_route' -- server client MCP.md README.md
```

Expected: focused tests pass, typecheck has no new errors, and no old transit tool names remain in the searched production/docs paths. Commit as:

```text
feat(mcp): reconcile transit tools and add journey updates
```

## Handoff

Task 10 may rely on canonical transit metadata, including optional leg distance. Task 12 must document the final tool names without compatibility aliases.
