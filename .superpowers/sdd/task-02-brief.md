# Task 02 — Frozen Upstream Merge and Dependency Baseline

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Use `superpowers:test-driven-development` for behavioral changes and `superpowers:systematic-debugging` for failures.

**Parent design:** `docs/superpowers/specs/2026-07-20-upstream-3.4-sync-design.md`  
**Overview:** `docs/superpowers/plans/upstream-3.4-sync/README.md`

**Context discipline:** Read the parent design once at the start of the overall project. For this task, load this file and only the source/test files named below. Do not preload the other task plans. Record the task result and handoff contract in `.superpowers/sdd/progress.md`.

## Project constraints inherited by this task

- Frozen upstream target: `liketrek/TREK@3ca1ef34bb371bb0c76ca1b392e56c8a1c98ceb8`.
- Integration branch: `integration/upstream-3.4.0` based on current `reyhard/main`.
- Preserve fork behavior unless upstream replaced the owning architecture.
- Do not add duplicate registrars, validators, stores, metadata builders, or movement calculations.
- Do not merge a newer upstream commit.
- Do not mask failures with broad type casts, disabled tests, or unrelated refactors.
- End every independently reviewable behavior change with focused tests and a commit.

## Goal

Create the history-preserving merge with the frozen upstream commit, resolve repository-level conflicts, regenerate generated lockfiles, and leave an installable tree with a conflict ledger for later semantic tasks.

## Deliverables

- A real two-parent merge commit containing upstream `3ca1ef34...`.
- Installable root and plugin SDK lockfiles regenerated from resolved manifests.
- No conflict markers or unmerged paths.
- `.superpowers/sdd/progress.md` conflict ledger mapping semantic conflicts to Tasks 03–12.

## Files

- Modify: `package.json`, `package-lock.json`
- Modify: `server/package.json`, `client/package.json`
- Modify: `plugin-sdk/package.json`, `plugin-sdk/package-lock.json`
- Modify: `.github/workflows/*`, `.gitignore`, `.dockerignore`
- Modify: `Dockerfile`, `docker-compose.yml`, `charts/trek/**`
- Provisional resolution only: conflicted server/client files assigned to later tasks
- Modify: `.superpowers/sdd/progress.md`

## Interfaces

- **Consumes:** Task 01 committed worktree and baseline evidence.
- **Produces:** merged source tree and exact unresolved semantic obligations for each later task.
- **Does not produce:** final transit, plugin, planner, or migration behavior.

## Steps

- [ ] **Step 1: Confirm the integration branch contains the Task 01 fixture commit**

```bash
git status --short
git branch --show-current
git log -3 --oneline
```

Expected branch: `integration/upstream-3.4.0`; status clean.

- [ ] **Step 2: Start the merge without automatically committing**

```bash
git merge --no-ff --no-commit 3ca1ef34bb371bb0c76ca1b392e56c8a1c98ceb8
```

Capture:

```bash
git diff --name-only --diff-filter=U | tee /tmp/trek-upstream-3.4-conflicts.txt
```

Append the list to the progress file before resolving anything.

- [ ] **Step 3: Resolve repository metadata first**

For `.github`, ignore files, README metadata, Docker metadata, and Helm chart versioning:

- keep upstream 3.4 release/version and workflow security fixes;
- preserve fork-specific `docs/superpowers`, local environment ignores, and any deployment variable still read by production code;
- do not delete fork plans/specs because upstream lacks them.

After each file:

```bash
git add <resolved-path>
```

- [ ] **Step 4: Resolve package manifests with an explicit dependency rule**

Use upstream versions for dependencies present on both sides. Retain a fork-only dependency only after confirming a production/test import:

```bash
git grep -n "from '<package-name>'\|require('<package-name>')" -- server client plugin-sdk
```

Required resolved versions include:

```json
{
  "@modelcontextprotocol/sdk": "^1.29.0",
  "typescript": "^6.0.2",
  "zod": "^4.3.6"
}
```

Do not copy these values into unrelated workspaces if upstream uses a different workspace contract.

- [ ] **Step 5: Regenerate lockfiles from manifests**

```bash
rm -f package-lock.json plugin-sdk/package-lock.json
npm install --package-lock-only
npm --prefix plugin-sdk install --package-lock-only
npm ci
```

Expected: install succeeds without manually edited integrity hashes.

- [ ] **Step 6: Resolve semantic files provisionally and record ownership**

For every conflict in MCP/transit, plugins, migrations, planner, maps, settings, or stores:

1. choose upstream file structure and public interfaces as the provisional base;
2. preserve fork exports when later tasks need them to keep the tree typecheckable;
3. do not register both transit implementations;
4. write a conflict-ledger entry containing path, classification, preserved fork behavior, upstream baseline, and owning later task.

Example progress entry:

```markdown
- `server/src/mcp/tools/transit.ts`
  - Classification: semantic overlap
  - Upstream owner: Transitous search/create journey
  - Fork behavior to port: update route only
  - Task: 06
```

- [ ] **Step 7: Confirm the merge tree has no unresolved paths**

```bash
git diff --name-only --diff-filter=U
git grep -n '<<<<<<<\|=======\|>>>>>>>' -- ':!package-lock.json' ':!plugin-sdk/package-lock.json'
git diff --check
```

Expected: no unmerged paths, no markers, no whitespace errors.

- [ ] **Step 8: Run install-level checks only**

```bash
npm ci
npm --prefix plugin-sdk ci
npm --prefix server run typecheck || true
npm --prefix client run typecheck || true
```

Typecheck failures are allowed only when each is listed in the conflict ledger with a later task owner. Dependency-resolution or module-not-found failures are not deferrable.

- [ ] **Step 9: Create the merge commit and verify two parents**

```bash
git add -A
git commit -m 'merge: synchronize frozen upstream TREK 3.4'
git show --no-patch --pretty='%H %P' HEAD
```

Expected: the commit reports two parent SHAs, one descending from Task 01 and one equal to the frozen upstream commit.

## Acceptance checklist

- [ ] Merge commit has two parents.
- [ ] Frozen upstream SHA is an ancestor of `HEAD`.
- [ ] `npm ci` succeeds.
- [ ] No unmerged paths or conflict markers.
- [ ] Every deferred type/test failure has a named owner task.
- [ ] No duplicate `registerTransitTools` invocation was introduced.

## Handoff

Record the merge commit SHA, final conflict ledger, and install commands in the progress file. Task 03 begins with database/bootstrap ownership; Tasks 04–12 must use the ledger rather than rediscovering conflict intent.
