# Task 04 — MCP Session Lifecycle, Scopes, and Registration Safety

**Source plan:** `docs/superpowers/plans/upstream-3.4-sync/task-04-mcp-session-and-scope-reconciliation.md`

## Objective

Reconcile the upstream MCP SDK 1.29 session lifecycle with TREK's plugin-scope support, align server/client scope definitions, and guarantee deterministic, duplicate-free tool registration.

## Inputs And Constraints

- Consume Task 03's reconciled migrations at v176 and verified bootstrap behavior.
- Preserve fork plugin scopes using the exact grammar `^plugin:([a-z][a-z0-9-]{2,39}):(read|write)$`.
- Keep one session map, one sweep timer, and one deterministic tool registrar entry point.
- Do not add duplicate registrars, validators, stores, metadata builders, or movement calculations.
- Do not mask failures with broad type casts, disabled tests, or unrelated refactors.

## Scope

- Reconcile `server/src/mcp/index.ts`, `sessionManager.ts`, `scopes.ts`, `tools.ts`, and `tools/_shared.ts`.
- Reconcile `client/src/api/oauthScopes.ts` and its tests.
- Add focused session, integration, scope, and unique-registration coverage under `server/tests` and `client/src/api`.

## Required Verification

- Session-less rejected POST cleanup, transport close cleanup, user-scoped oldest-session eviction, and shutdown cleanup.
- Static and plugin scope grammar validation with server/client parity.
- `geo:read` and `places:read` descriptions reflect provider-access boundaries.
- Full-access MCP tool names are unique and duplicate diagnostics are useful.
- Exactly one `registerTransitTools` import, invocation, and definition.
- `npm --prefix server run typecheck`.
- `npm --prefix client run typecheck`.
- Focused MCP server/client tests and the relevant integration suite.

## Handoff

Record session cleanup behavior, accepted scope grammar, registrar ownership, commands, commit SHA, review status, and unresolved notes in `.superpowers/sdd/progress.md`. Task 06 consumes the registrar and scope gates; Task 07 consumes the plugin-scope parser and session invalidation hooks.
