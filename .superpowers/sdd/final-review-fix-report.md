# Final Review Fix Report

## Root Cause / Hypothesis

### Finding 1: REST transit endpoint update does not deny demo-user writes

**Observation:** The MCP `update_transit_route_endpoints` tool (server/src/mcp/tools/transit.ts:283) guards against demo users via `if (isDemoUser(userId)) return demoDenied()`. The REST `PUT /:id/transit-endpoints` handler (server/src/nest/reservations/reservations.controller.ts:101-122) only checks `requireEdit()` (i.e., `reservation_edit` permission) but has no demo-user guard.

**Pattern analysis:** Other NestJS write endpoints in this codebase (trips.controller.ts:220, collections.controller.ts:398, auth.controller.ts:147, files.controller.ts:138) use the pattern:
```ts
if (process.env.DEMO_MODE?.toLowerCase() === 'true' && isDemoEmail(user.email)) {
  throw new HttpException({ error: '...' }, 403);
}
```
The `isDemoUser(userId)` function used by MCP (authService.ts:1939) is equivalent: it checks `DEMO_MODE !== 'true'` first, then `isDemoEmail(user?.email)`. Both paths gate on the same env var and the same email set (`DEMO_EMAILS`).

**Hypothesis:** The REST `updateTransitEndpoints` handler is missing a demo-user denial check that exists in every other write-path controller. The fix is to add the standard `DEMO_MODE && isDemoEmail(user.email)` guard before calling the domain service, matching the established Nest pattern.

### Finding 2: Service test coverage gaps — simultaneous from+to update and duplicate role rejection

**Observation:** The domain service test (server/tests/unit/services/transitRouteEndpointService.test.ts) covers single-endpoint update, invalid input, missing/non-transit reservations, and rollback on missing target role. It does not test:
- Successful simultaneous update of both `from` and `to` endpoints
- Rejection when `reservation_endpoints` has duplicate rows for the same role (e.g., two `from` rows), which would cause the `rows.length !== 1` structural-integrity check to fire

**Hypothesis:** Both scenarios exercise existing production code paths (the transaction loop at service.ts:54-65 iterates over multiple updates; the `findEndpoint` query returns all rows for a role). The test gap does not indicate a production defect — the code handles both cases correctly. Tests should be added for coverage completeness.

### Finding 3: MCP `listTools` schema provenance

**Observation:** The schema artifact at `.superpowers/sdd/mcp-schema-capture.json` and the implementation report both state it was "Generated using the same `zod/v4-mini.toJSONSchema` converter that the MCP SDK uses internally." However, the correct provenance path — as required by the plan — is to capture it from the actual runtime MCP `listTools` call using the `McpHarness` test infrastructure, not from a standalone converter.

**Hypothesis:** The existing `McpHarness` (`createMcpHarness` in server/tests/helpers/mcp-harness.ts) connects an `McpServer` to an `InMemoryTransport` and provides a `Client` that can call `listTools()`. Writing a focused test that calls `client.listTools()` and serializes the `update_transit_route_endpoints` tool schema proves the actual runtime output. The captured JSON can then replace the converter-derived artifact.

### Finding 4: Stale document facts

**Observation:** The implementation report at `docs/superpowers/reports/2026-07-21-transit-route-endpoint-editing-implementation.md` references HEAD as `e591075a` and the schema section claims a converter provenance. After Tasks 1-3, HEAD will move. The report needs a factual update pass to reflect the current state.

**Hypothesis:** Updating the report with the correct HEAD ref, accurate schema provenance, and correct test counts resolves the stale-fact claims. The report must not claim final all-green gates since the known pre-existing client i18n parity failures persist.
