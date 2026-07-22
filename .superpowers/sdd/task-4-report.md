# Task 4 Report: Transit MCP Tool

## Commands & Outcomes

### Step 1-3: Write failing tests
Added to `server/tests/unit/mcp/tools-transit.test.ts`:
- Registration assertions: tool absent for `geo:read`, present for `reservations:write` with schema/annotations checks
- `update_transit_route_endpoints preserves all fields when updating only the origin` — creates transit journey, enriches state, calls tool with only `from`, verifies reservation/positions/metadata/other endpoints unchanged, verifies `planMock` not called
- `rejects empty and invalid endpoint updates` — empty body yields at-least-one error, invalid lat yields parse error
- `rejects non-transit and inaccessible reservations` — manual reservation rejected, stranger denied
- Updated "exactly four" → "exactly five" transit tools count
- Added `update_transit_route_endpoints` to `places:read` deny list and annotations check

### Step 4: Run MCP test (red phase)
```bash
npm run test --workspace=server -- tests/unit/mcp/tools-transit.test.ts
```
**Result:** 6 failed, all with "Tool update_transit_route_endpoints not found" — correct RED.

### Step 5: Register MCP tool
Added to `server/src/mcp/tools/transit.ts`:
- Import `transitRouteEndpointInputSchema`, `transitRouteEndpointsUpdateRequestSchema` from `@trek/shared`
- Import `TransitRouteEndpointUpdateError`, `updateTransitRouteEndpoints` from `transitRouteEndpointService`
- Register `update_transit_route_endpoints` with:
  - `description` matching spec
  - `inputSchema` with `tripId` (required int), `reservationId` (required int), `from`/`to` (optional endpoint objects)
  - `TOOL_ANNOTATIONS_WRITE`
  - Demo guard, access guard, permission guard (`reservation_edit`)
  - Shared-schema parse for at-least-one constraint
  - `updateTransitRouteEndpoints` domain call with broadcast + notification
  - `TransitRouteEndpointUpdateError` mapping
  - No `dayId`, no `itinerary`, no `plan`, no `cleanTransitItineraryNames`, no generic `updateReservation`

### Step 6: Run combined tests (green phase)
```bash
npm run test --workspace=server -- \
  tests/unit/mcp/tools-transit.test.ts \
  tests/unit/services/transitRouteEndpointService.test.ts \
  tests/unit/services/transitItineraryService.test.ts
```
**Result:** 58 tests passed (24 MCP + 6 domain + 28 itinerary), exit 0

### Step 7: Verify schema
- `tripId` and `reservationId` are required positive integers
- `from` and `to` are optional objects each requiring `name`, `lat`, `lng`
- `lat` bounded `[-90, 90]`, `lng` bounded `[-180, 180]` (via `transitRouteEndpointInputSchema`)
- `openWorldHint: false`, `idempotentHint: true`
- At-least-one constraint enforced in handler via shared-schema `.refine()`

### Step 8: Commit
```bash
git add server/src/mcp/tools/transit.ts server/tests/unit/mcp/tools-transit.test.ts .superpowers/sdd/progress.md
git commit -m "feat(mcp): add transit endpoint update tool"
```
Commit: `822ff9b4`

## Concerns
- At-least-one constraint cannot be expressed in the raw MCP `inputSchema` shape (Zod optional fields); enforced at handler level via shared schema `.refine()` — documented per spec.
- Pre-existing `shared/src/place/place.schema.ts` trailing-comma diff remained uncommitted (not from this task).

## Review Fix: Restore progress.md (commit 822ff9b4)

### Finding
Commit `822ff9b4` destructively replaced `.superpowers/sdd/progress.md` (848 deletions), an out-of-scope change. The 854-line "Upstream 3.4.0 Sync" ledger was replaced with a 21-line minimal transit-route-endpoint-editing header.

### Root Cause
The `git add` in Step 8 included `.superpowers/sdd/progress.md`, which overwrote the existing upstream-sync progress ledger with a minimal feature-branch summary instead of appending to the existing ledger structure.

### Fix Applied
Restored `.superpowers/sdd/progress.md` to the parent commit state (`822ff9b4^`) — the complete 854-line upstream-sync progress ledger (Tasks 01–14) — and appended a new "Transit Route Endpoint Editing" section preserving the durable Task 1–4 completion entries.

### Verification

**`git diff --stat` (before commit):**
```
 .superpowers/sdd/progress.md     | 905 ++++++++++++++++++++++++++++++-
 shared/src/place/place.schema.ts |   2 +-
```
Only `.superpowers/sdd/progress.md` and the pre-existing trailing-comma formatting diff in `shared/src/place/place.schema.ts` (not from this task).

**`git diff -- .superpowers/sdd/progress.md` summary:**
- Restored parent commit content (854 lines of upstream-sync ledger)
- Added "Transit Route Endpoint Editing" section (~40 lines) at end
- Net: +875 lines from current HEAD, restoring full ledger + task entries

### Files Touched
- `.superpowers/sdd/progress.md` — restored+appended (intentional fix)
- `.superpowers/sdd/task-4-report.md` — this evidence appended (intentional)

### Intentionally Excluded
- `shared/src/place/place.schema.ts` — pre-existing formatting diff, unrelated, left unstaged

### Verification Commands
```bash
git diff --stat                          # only progress.md + pre-existing place.schema.ts diff
git diff -- .superpowers/sdd/progress.md # restored ledger + new transit section
git status                               # no staged product source changes
```
