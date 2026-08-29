# TREK 4.0 Fork Upgrade — Upstream Adoptions

**Status:** Task 01 complete — clean v4.0.0 base established; adoptions recorded by exact SHA.
**Task 03 update:** `aa5002b2`'s stored-transit enum split adopted semantically (see below).

Records every post-4.0 upstream commit adopted onto the `trek-4-upgrade` branch, by exact
SHA, with the fork feature it supersedes and the characterization test that proves it.

## Adopted commits

| Upstream SHA | Subject | Supersedes / purpose | Adopt method | Characterization / regression test |
| --- | --- | --- | --- | --- |
| `a9b0cccb74c2f94982149309b5cc1b05c5feed9d` | test(server): unpin three fixtures from the 3.x version window | Unblocks the 4.0.0 baseline gates: the 4.0.0 bump made the plugin-install fixtures (`>=3.2.0 <4.0.0` / `>=3.0.0 <4.0.0`) incompatible with their own host, so 23 tests failed on `TREK_VERSION_INCOMPATIBLE` instead of on what they tested; the system-notices suite named the retired `thank-you-support` notice twice | clean cherry-pick (applies cleanly to v4.0.0) | the 23 previously-failing tests themselves: `tests/integration/plugins/dev-link.test.ts` (4), `tests/integration/plugins/registry.test.ts` (17), `tests/integration/systemNotices.test.ts` (2) — all pass post-adoption |
| `f1bbd94f2b1393eb6a08d25e38a32c9a602fa90f` | feat(mcp): booking link and end time on a reservation | F09 (reservation `url` over MCP) — the REST service already persisted `url`/`reservation_end_time` but no MCP tool schema exposed them | semantic port onto 4.0.0 (cherry-pick conflicts because upstream's file drifted across ~695 intermediate commits; the tool-schema delta is self-contained) | `server/tests/unit/mcp/tools-reservations.test.ts` "Reservation tools: url and reservation_end_time" — 6 tests (create/update persist url + end_time; `javascript:` URL refused incl. control-character split; transport tools persist url) |

## Reference SHAs inspected and explicitly skipped (Task 01)

These were the mandatory Task 01 candidates. Each was inspected with its full dependency
chain and a clean-apply test against the v4.0.0 base; each is **not** adopted at Task 01.

| Upstream SHA | Subject | Supersedes | Decision | Rationale (evidence) |
| --- | --- | --- | --- | --- |
| `aa5002b2ed4b48834b61ba808636ba67692db1cc` | fix(mcp): keep transit out of the transport create enum | F06 stored-transit edit | **SKIP** | Premise absent at v4.0.0: `v4.0.0:server/src/nest/reservations/reservations.mcp.ts` has `TRANSPORT_TYPES = ['flight','train','car','cruise']` — `transit` is in **no** MCP transport enum, so "keep transit out of the create enum" has nothing to fix. The commit depends on the upstream 10-type enum expansion (`34522ad3`) and `set_reservation_travelers` (`86c0c197`), both post-4.0; cherry-pick conflicts in 4 files. The fork's `update_transit_journey` (F06) is not being ported at this base. Revisit in the transit-MCP task (Task 03/04) against current upstream. |
| `092223c25979d0af7eead1cbcbd912ba984d79e4` | feat(mcp): plugins:use OAuth scope | F16 plugin scopes (OBSOLETE per ledger) | **SKIP (confirmed at Task 03)** | Premise absent at v4.0.0: `v4.0.0:server/src/mcp/scopes.ts` is the flat pre-`ScopeMode` model (no `OPT_IN_ONLY_SCOPES`, no `AssertExact`/`McpAccessGroup`, no `ScopeMode` `'use'`). The commit depends on the post-4.0 scope-model refactor chain (incl. `c56521b4`); cherry-pick conflicts in 27 files (scopes.ts + 23 locale `oauth.ts` + client scope UI). Task 03 re-confirmed the decision: `plugins:use` gates upstream's plugin-MCP-tool surface (`plugin-mcp-tools.ts` + `mcp:tools` permission), which v4.0.0 does **not** have, and the fork never exposed plugin MCP tools — so adding the scope alone would be dead code. The fork's dynamic `plugin:<id>:read/write` scopes gated an obsolete inbound `trekoa_` resource proxy (F17, not ported). Plugin-scope default-deny pinned by PLUGIN-SCOPES-001/002/003. |
| `c56521b4a43d03300ef5dc29ff8fbf0fce18d820` | feat(server): process-level plugin MCP tool source | n/a (dependency of 092223c2) | **SKIP** | Inspected only — parent of `092223c2`; not adopted because its child is skipped and it is part of the Task 03 plugin-runtime/OAuth surface. Task 03 confirmed v4.0.0 has no plugin MCP tool surface for it to feed. |
| `ea08df9b8a8c…` | feat(plugins): harden OAuth broker (nonce + config fingerprint) | F34 plugin-OAuth broker hardening | **ADOPTED (semantic port, Task 03)** | F34 ported onto `plugins/oauth/plugin-oauth.service.ts` (commit `2431e633`): authorize `state` = nonce(16) ‖ sha256(authorizeUrl|tokenUrl|clientId)[:16] ‖ rand(24); `completeCallback` validates the baked fingerprint vs current config with `timingSafeEqual` and refuses on mismatch. TDD F34-001/002/003. |

## Reference SHAs identified during Task 00 but NOT adopted at Task 01

The Task 00 ledger's §3 reference list also named these upstream SHAs. They belong to later
tasks and were re-verified only:

| Upstream SHA | Subject | Supersedes | Where it lands |
| --- | --- | --- | --- |
| `aa5002b2` | keep transit out of the transport create enum | F06 | **ADOPTED (semantic port, Task 03)** — commit `9f82edb9` splits `TRANSPORT_TYPES` (update gate, now incl. `transit`) from `CREATABLE_TRANSPORT_TYPES` (create/update enum, excl. `transit`). |
| `f1bbd94f` | booking link + end time | F09 | **ADOPTED at Task 01** (row above) |
| `092223c2` | plugins:use scope | F16 | see skipped row above (Task 03 confirmed SKIP — no plugin MCP tool surface at v4.0.0) |

## Design decisions recorded (Task 01)

1. **Base pinning.** The branch stays on the exact `v4.0.0` commit (`a00b84b2`,
   tag `daad48d9`) + Task 00 docs + the adopted commits above. It is **not** switched to
   upstream `main` (still `33a33e7b`, v4.1.1 at Task 01 close). Post-4.0 upstream is adopted
   one reviewed commit at a time, never as broad batches.
2. **Adopt method.** Clean cherry-pick when the commit applies to the 4.0.0 base (`a9b0cccb`);
   otherwise a semantic port with attribution when the behavior is genuinely missing at 4.0.0
   and the service layer already supports it (`f1bbd94f`).
3. **Transit out of scope for Task 01.** The fork's transit MCP tooling (F06/F07/F08) and the
   scope-model surface (F16/F17) are later-task concerns; their upstream replacements are
   re-inspected at that point against then-current upstream.
4. **Test-only adoption `a9b0cccb`** touches no production code; it unblocks the baseline gate.