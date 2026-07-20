# Task 06 Report — MCP Transit Tools and `update_transit_journey`

## Status

**Complete** — all acceptance criteria met.

## Commit

`97ee89a5` on `integration/upstream-3.4.0`:
`feat(mcp): reconcile transit tools and add journey updates`

## Files modified

| File | Action |
|------|--------|
| `server/src/mcp/tools/transit.ts` | Refactored `create_transit_journey` to use `buildTransitJourneyPatch`; removed `buildTransitReservationParts` import; added `update_transit_journey` tool with demo/trip/permission/type/ownership validation |
| `server/src/services/transitItineraryService.ts` | Removed obsolete `buildTransitReservationParts` (replaced by `buildTransitJourneyPatch`) |
| `server/tests/unit/mcp/tools-transit.test.ts` | Added 4 new tests (13 total, all pass): registration includes update; create stores leg distance; update emits events + preserves unrelated metadata; update enforces permissions/type |
| `MCP.md` | Replaced old `plan_transit_route`/`create_transit_route`/`update_transit_route` docs with new `search_transit_routes`/`create_transit_journey`/`update_transit_journey`; fixed scope annotations |

## Commands and results

```bash
npm --prefix server run typecheck
# → 4 pre-existing plugin errors (unchanged, Tasks 07/08) — 0 transit errors

npm --prefix server test -- tests/unit/mcp/tools-transit.test.ts tests/integration/mcp.test.ts
# → 2 test files, 30 tests, all passed

git grep -n 'plan_transit_route\|create_transit_route\|update_transit_route' -- server client MCP.md README.md
# → (no output) — zero production references
```

## Key changes

- **Removed** `buildTransitReservationParts` — all transit persistence now runs through `buildTransitJourneyPatch()` from Task 05.
- **Added** `update_transit_journey` MCP tool accepting `tripId`, `reservationId`, `dayId`, `from`, `to`, `itinerary`.
- **Create and update** both call `buildTransitJourneyPatch()` with canonical validation — no duplicate timezone/endpoint/metadata logic in MCP handlers.
- **Leg distance** stored in metadata on create (`leg.distance`).
- **Unrelated metadata** preserved on update via `metadataObject()` merge in `buildTransitJourneyPatch`.
- **Scoping:** `geo:read` gates searches; `reservations:write` gates writes; full access sees all four.
- **Validation:** demo, trip access, `reservation_edit`, reservation ownership, transit type, foreign days, missing arrival days.
- **Database failures** emit no broadcast and return generic error message.
- **Events:** create emits `reservation:created`; update emits `reservation:updated` + `notifyBookingChange`.

## Self-review

- Exactly four tools registered: `search_transit_stops`, `search_transit_routes`, `create_transit_journey`, `update_transit_journey`.
- No duplicate registrars, validators, or metadata builders.
- `buildTransitReservationParts` fully removed from both transit.ts and transitItineraryService.ts.
- No production references to `plan_transit_route`, `create_transit_route`, or `update_transit_route` remain.
- Pre-existing typecheck errors (4 plugin-oauth errors) unrelated, unchanged.
- Fixture files remain local-only, uncommitted, and unstaged.

## Concerns

- `buildTransitJourneyPatch()` depends on `getDay`/`listDays` — consistent with replaced `buildTransitReservationParts` pattern.
- Legacy fork-created transit metadata is accepted without pre-validation; `metadataObject()` safely handles string/object/null.
- Neither create nor update makes provider calls (consistent with spec).

## Report path

`.superpowers/sdd/task-06-report.md`

---

## Reviewer Findings — Fix Applied

**Commit:** `c4209c57` on `integration/upstream-3.4.0`

### Finding 1: `update_transit_journey` now preserves generic fields

**Before:** The update call passed `title` and `needs_review: false`, causing every update to overwrite the user's custom title and mark the reservation as reviewed.

**After:** Removed `title` and `needs_review` from the `updateReservation()` call. The update now only sends route-derived fields:
- `day_id`, `end_day_id`, `reservation_time`, `reservation_end_time` (patch-derived)
- `metadata` (transit route metadata merged with existing)
- `endpoints` (route stop endpoints)

The underlying `updateReservation()` uses `COALESCE` for `title`, `status`, `type`, and `needs_review` — when these fields are absent from the data object, the existing database values are preserved. The `notes`, `confirmation_number`, and `day_plan_position` fields are also preserved because they are never passed in the update data.

### Finding 2: Annotations replaced with `TOOL_ANNOTATIONS_WRITE`

**Before:** Both `create_transit_journey` and `update_transit_journey` used `TOOL_ANNOTATIONS_OPEN_WORLD_NON_IDEMPOTENT` (`openWorldHint: true, idempotentHint: false`). These tools only write to the local database, not to external services, so open-world semantics are incorrect.

**After:** Both tools now use `TOOL_ANNOTATIONS_WRITE` (`readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false`), consistent with every other write tool in the codebase (todos.ts, assignments.ts, reservations.ts, etc.). The search tools (`search_transit_stops`, `search_transit_routes`) correctly retain `TOOL_ANNOTATIONS_OPEN_WORLD_READONLY` as they call an external Transitous provider.

### Finding 3: TDD coverage added

9 new test cases added (21 total, all passing):

| # | Test | Coverage |
|---|------|----------|
| 1 | Preserves generic fields (notes, status, confirmation, position) | Verifies title, notes, status, confirmation_number, day_plan_position survive update |
| 2 | Exact 4-tool registration + legacy names absent | Verifies `search_transit_stops`, `search_transit_routes`, `create_transit_journey`, `update_transit_journey` are the only transit tools; `plan_transit_route`, `create_transit_route`, `update_transit_route` are not registered |
| 3 | `places:read` scope denial | Verifies no transit tools are registered with `places:read` scope |
| 4 | Legacy string metadata merge | Stores old-format string metadata, verifies extra fields survive `metadataObject()` merge during update |
| 5 | Invalid dayId rejection | Verifies update with a dayId from a different trip returns error |
| 6 | DB failure without broadcast | Spies on `updateReservation` to simulate throw, verifies error response + no broadcast/notify |
| 7 | No provider calls on update | Verifies `geocode` and `plan` are never called during update |
| 8 | Annotation correctness | Verifies `create_transit_journey` and `update_transit_journey` have `TOOL_ANNOTATIONS_WRITE` semantics |
| 9 | Title preservation (existing test fixed) | Changed assertion from `'Namba Upd → Umeda Upd'` to `'Namba → Umeda'` |

### Verification

```bash
npm --prefix server run typecheck
# → 4 pre-existing plugin errors (unchanged) — 0 transit errors

npm --prefix server test -- tests/unit/mcp/tools-transit.test.ts
# → 1 file, 21 tests, all passed

npm --prefix server test -- tests/integration/mcp.test.ts
# → 1 file, 17 tests, all passed

git grep -n 'plan_transit_route\|create_transit_route\|update_transit_route' -- server client MCP.md README.md
# → Only test assertions confirming absence
```
