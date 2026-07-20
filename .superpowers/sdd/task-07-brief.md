# Task 07 — Plugin Runtime, OAuth Broker, MCP Proxy, SDK, and Egress

**Source plan:** `docs/superpowers/plans/upstream-3.4-sync/task-07-plugin-platform-reconciliation.md`

## Objective

Use upstream 3.4 as the single plugin runtime and security platform while preserving the fork's constrained host-brokered plugin OAuth and MCP plugin proxy extensions.

## Inputs And Constraints

- Consume Task 03's migrated plugin/OAuth data and Task 04's plugin-scope grammar.
- Preserve fork behavior unless upstream replaced the owning architecture.
- Maintain one owner for manifests, permissions, trust, runtime supervision, egress, OAuth, MCP proxying, and SDK definitions.
- Fail closed for widened permissions, incompatible hosts, missing trust/signature data, unavailable plugins, and unsafe egress.
- Do not add duplicate parsers, registrars, validators, stores, metadata builders, or movement calculations.
- Do not mask failures with broad casts, disabled tests, or unrelated refactors.

## Scope

- Reconcile the server plugin OAuth broker/controller, MCP proxy, runtime, service, manifest, host compatibility, egress policy, supervisor, RPC host, and OAuth resource files named in the plan.
- Reconcile `server/src/mcp/scopes.ts` and plugin proxy registration call sites without creating another scope parser.
- Reconcile `plugin-sdk` manifest, permissions, exports, and affected CLI checks.
- Update unit/integration plugin tests and SDK tests.

## Required Behavior

- Preserve grants for unchanged manifests; require retrust for added or widened permissions; remove phantom grants.
- Prevent activation for incompatible hosts and keep inactive plugins inactive after migration; assign conservative state when trust/signature fields are missing.
- Encrypt OAuth secrets at rest, isolate credentials per plugin, validate callback plugin/install/user/provider/redirect/state/nonce, reject replay, and revoke on disconnect.
- Expose only narrow provider-aware OAuth operations and never pass unvalidated provider URLs or reusable core TREK credentials to plugins.
- Gate MCP plugin registration and calls on the Task 04 plugin scope, plugin existence/activity/compatibility, runtime grants, and matching read/write operation scope; core MCP initialization must survive unavailable plugins.
- Enforce upstream egress as the final network gate, including redirects and private/undeclared targets; prevent worker/job leaks across reload and shutdown.
- Keep contribution timeouts, sanitization, fail-safe rendering, and SDK/server manifest/permission parity.

## Checkpoints

1. Manifest, trust, compatibility, and migration behavior.
2. OAuth broker and MCP proxy.
3. Egress, supervisor, jobs, and contributions.
4. SDK parity and packaging.

Use separate commits for independently testable checkpoints.

## Verification

```bash
npm --prefix server run typecheck
npm --prefix server test -- tests/unit/plugins tests/integration/plugins
npm --prefix plugin-sdk test
npm --prefix plugin-sdk run build
npm --prefix plugin-sdk pack --dry-run
git grep -n 'PLUGIN_SCOPE_RE\|isPluginScope' server client plugin-sdk
git grep -n 'egress' server/src/nest/plugins
git grep -n 'encrypt.*token\|decrypt.*token' server/src/nest/plugins server/src/services
```

## Handoff

Task 11 may assume stable plugin contribution and OAuth UI contracts. Task 12 packages the reconciled SDK and documents environment controls.
