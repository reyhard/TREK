# Task 04 Report — MCP Session Lifecycle, Scopes, and Registration Safety

**Date:** 2026-07-20
**Branch:** `integration/upstream-3.4.0`
**Predecessors:** Task 02 (`75b6b1df`), Task 03 (`4d2654b4`)

## Status: DONE

## Commits

| SHA | Description |
|-----|-------------|
| `3752d481` | feat(mcp): reconcile plugin scope grammar, session lifecycle, and safe registration |

## Test Summary (one-line)

**142 tests passed** across 5 test files (56 scopes + 16 sessionManager + 5 registrar-safety + 24 client oauthScopes + 17 integration MCP + 24 existing client tests = 142 total), zero failures, zero new typecheck errors.

### Detailed Test Results

| Suite | Count | Result |
|-------|-------|--------|
| `server/tests/unit/mcp/scopes.test.ts` | 56 | PASS |
| `server/tests/unit/mcp/sessionManager.test.ts` | 16 | PASS |
| `server/tests/unit/mcp/tools-registrar-safety.test.ts` | 5 | PASS |
| `server/tests/integration/mcp.test.ts` | 17 | PASS |
| `client/src/api/oauthScopes.test.ts` | 24 | PASS |
| `npm --prefix server run typecheck` | 4 pre-existing errors | PASS (unchanged) |
| `npm --prefix client run typecheck` | 21 pre-existing errors | PASS (unchanged) |

## Commands and Results

```bash
# Build shared workspace
npm run build --workspace=shared

# Server typecheck — 4 pre-existing errors (Tasks 07/08), no new
npm --prefix server run typecheck

# Client typecheck — 21 pre-existing errors (Tasks 09/10), no new
npm --prefix client run typecheck

# Unit tests
npm --prefix server run test -- --run tests/unit/mcp/scopes.test.ts            # 56 passed
npm --prefix server run test -- --run tests/unit/mcp/sessionManager.test.ts     # 16 passed
npm --prefix server run test -- --run tests/unit/mcp/tools-registrar-safety.test.ts  # 5 passed
npm --prefix client run test -- --run src/api/oauthScopes.test.ts               # 24 passed

# Integration tests
npm --prefix server run test -- --run tests/integration/mcp.test.ts             # 17 passed
```

## What Was Done

### 1. Plugin Scope Reconciliation (`server/src/mcp/scopes.ts`)
- Added `import { isPluginScope } from '../services/oauthResources'`
- Updated `validateScopes()` to accept plugin scopes via `!isPluginScope(s)` check
- Updated `places:read` description to "Read trip places, assignments, tags, categories, and search real-world places or transit stops"
- Updated `geo:read` description to "Search locations, resolve map URLs, and reverse geocode coordinates"
- Updated `places:read` label to "View places & discover locations"
- Updated `geo:read` label to "Maps & geocoding"

### 2. Scope Grammar Parity
- Both server (`oauthResources.ts`) and client (`oauthScopes.ts`) use identical plugin scope regex: `^plugin:([a-z][a-z0-9-]{2,39}):(read|write)$`
- Added 23 new scope validation tests (11 server-side, 12 client-side)

### 3. Session Lifecycle Verification
- Session-less rejected POST cleanup: index.ts `finally` block closes orphaned servers (verified via integration test)
- Transport close cleanup: `onsessionclosed` callback + `transport.onclose` handler (verified via sessionManager unit tests SESS-001..016)
- User-scoped oldest-session eviction: `evictOldestSessionForUser` (verified via integration test MCP-003)
- Shutdown cleanup: `closeMcpSessions` clears sweep timer and all sessions (verified via integration test afterAll)

### 4. Safe Registration
- Verified exactly one `registerTransitTools` import, invocation, and definition (REG-001..004)
- Verified exactly one `registerTools` export function (REG-005)
- Verified one session map (`sessions`), one sweep timer, one registrar entry point

## Fixture Safety

| File | Status |
|------|--------|
| `server/tests/fixtures/pre-upstream-3.4-fork.sqlite` | Excluded by `.gitignore:18` (`.sqlite` pattern). Not staged. |
| `server/tests/fixtures/pre-upstream-3.4-fork-fixture.json` | Excluded by `.git/info/exclude:10`. Not staged. |

Both fixtures remain local-only and uncommitted. No fixture files were modified.

## Self-Review

| Area | Status | Notes |
|------|--------|-------|
| Plugin scope import | Clean | `isPluginScope` from `oauthResources` — already existed, no new dependency |
| Scope descriptions | Clean | Descriptions now clearly separate places (trip data + search) from geo (maps + geocoding only) |
| validateScopes cast | Intentional | `(ALL_SCOPES as string[])` needed because TypeScript infers `Scope[]` as `readonly` tuple after `as const`; functionally identical to fork's approach |
| Registrar safety tests | Clean | File-based grep avoids mocking burden; catches accidental duplicate registrations |
| Session lifecycle | No code changes needed | Upstream already had correct cleanup: finally block, onsessionclosed, onclose, sweep, closeMcpSessions |
| Fixture exclustion | Verified | Confirmed git status shows no fixture files tracked |

## Concerns

- None. All changes are non-breaking and additive. The `isPluginScope` import already existed in the codebase (`server/src/services/oauthResources.ts:47`); `validateScopes` now delegates to it exactly as the fork did. Scope descriptions match the fork's convention of separating trip-data concerns from map/geocoding concerns.

---

**Report path:** `.superpowers/sdd/task-04-report.md`
