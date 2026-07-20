# Upstream 3.4.1 — Progress Ledger

## Worktree

- Path: `/opt/trek/worktrees/integration-upstream-3.4.1`
- Branch: `integration/upstream-3.4.1`
- Fork SHA: `a3ff9b45b2ec615ba5fd8023f153b13ff02dae29`

## Topology verification

| Metric | Value |
|---|---|
| Merge base | `3ca1ef34bb371bb0c76ca1b392e56c8a1c98ceb8` |
| Fork ahead (reconciliation) | 2 |
| Fork behind (upstream 3.4.1) | 94 |
| Upstream target | `a0994658890eae96624fb9cbe7f55867f047fea2` |
| Excluded upstream commit | `adbee5aa132f77ff57fdae5af61ff3078ea82435` |

Status: merge complete.

## Baseline (fork SHA a3ff9b45)

| Check | Result | Details |
|---|---|---|
| Server typecheck | PASS | tsc --noEmit (after shared build) |
| Client typecheck | PASS | tsc --noEmit |
| Shared tests | PASS | 33 files, 139 tests passed |
| Server tests (unit) | PASS | 225 files, 4039 tests passed |
| Server tests (integration) | PASS (1 setup skip) | 42 files, 1102 passed, 11 skipped. 1 file failed at beforeAll (missing Task 03 fixture `pre-upstream-3.4-fork.sqlite` — expected) |
| Client tests | PASS (24 pre-existing) | 209 files passed, 3 files failed (24 tests). Failures: i18n locale key parity (20), PlaceInspector reposition/GPX (3), TransitJourneyModal field payload (2) |

**Baseline client failures are pre-existing fork reconciliation gaps, not merge regressions. They are assigned to their owning tasks per the plan.**

## Merge result

| Metric | Value |
|---|---|
| Merge commit | `12fc8de26d48ec977ef2343f46bdb53ac5420d3f` |
| Upstream ancestor? | Yes |
| Conflict ledger | `.superpowers/sdd/upstream-3.4.1-conflicts.md` (7 entries) |
| Unresolved regression tests | `server/tests/integration/upstream-3.4-migration.test.ts` (missing Task 03 fixture — expected); 24 client tests (pre-existing fork gaps) |

### File assignment by owning task

| Task | Files |
|---|---|
| Task 03 | `server/tests/fixtures/pre-upstream-3.4-fork.sqlite` (fixture needed) |
| Task 04 | `client/src/components/Journey/JourneyDetailPageGalleryView.tsx`, `client/src/components/Planner/AirTrailImportModal.tsx`, `client/src/components/Planner/TransitSearchPanel.tsx`, `client/src/pages/JourneyDetailPage.test.tsx` |
| Task 05 | `server/src/services/memories/helpersService.ts`, `server/src/services/memories/synologyService.ts`, `server/tests/unit/services/notifications.test.ts` |
| Task 06 | `server/assets/atlas/admin0.geojson.gz` (auto-merged, regeneration TBD) |
| Task 09 | `README.md`, `charts/trek/values.yaml`, `docker-compose.yml`, `wiki/*.md`, `charts/README.md`, `SECURITY.md`, `unraid-template.xml` (deployment identity) |
| Task 10 | `package-lock.json`, `client/package.json`, `server/package.json`, `shared/package.json`, `package.json` (lockfile regeneration) |
| Task 02+ | Auto-merged upstream features (Synology Photos rename, Atlas Geo changes, notifications/builtins, memories tests, i18n additions, etc.) |

### Unexpected upstream files

None — all affected paths are accounted for in the plan.

### Typecheck after merge

| Check | Result |
|---|---|
| Server typecheck | PASS |
| Client typecheck | PASS |
