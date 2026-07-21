# Task 05 Report — Per-User ntfy Topic Isolation

**Date:** 2026-07-21
**Branch:** `integration/upstream-3.4.1`

## Status: DONE

## Commit

```
TODO (will fill after commit)
```

## What Was Done

### 1. Verifying isolation (already present from merge)

The upstream 3.4.1 merge already brought `resolveNtfyUrl()` which returns `null` when the user has no personal topic — no fallback to the admin topic. Verified:

- `resolveNtfyUrl()`: `const topic = userCfg?.topic; if (!topic) return null;` → already correct
- `sendToUser()` in `builtins.ts`: checks `if (!url) return false;` → double-check pattern
- `isConfiguredFor()` in `builtins.ts`: `!!resolveNtfyUrl(getAdminNtfyConfig(), getUserNtfyConfig(userId))` → returns false when no personal topic

### 2. Security invariant verified

No code path allows a per-user ntfy send to fall back to the admin topic. The admin topic is resolved _only_ in `resolveAdminNtfyUrl()` which is called exclusively from `sendGlobal()` in the ntfy channel.

### 3. Added `.trim()` to topic in `resolveNtfyUrl()`

Whitespace-only topics (`'   '`) are now treated as unset and return `null`. Previously a whitespace topic would produce `https://ntfy.sh/%20%20%20`.

### 4. Fixed duplicate import in `notifications.test.ts`

The test file had two identical `import` blocks (lines 1–10 and 39–41). Removed the duplicate. The second block also had `resolveAdminNtfyUrl` which was not in the first — added it to the single import.

### 5. Added tests

| ID | Description | Type |
|----|-------------|------|
| `resolveNtfyUrl` | Returns null when user topic is whitespace-only | Unit (RED → GREEN) |
| `NTFY-SVCB-006` | One user's topic is never reused for another user | Integration |

### 6. Logging privacy verified

When a personal send is skipped (no user topic), no log message is emitted — the channel simply returns `false`. `sendNtfy()` logs only: event name, URL (topic path, no credentials), priority, tags. Notification body, tokens, and credential-bearing URLs are never logged.

## Tests

| Suite | Count | Result |
|-------|-------|--------|
| `notifications.test.ts` | 53 | PASS |
| `notificationService.test.ts` | 33 | PASS |
| **Total** | **86** | **PASS** |

## Commands and Results

```bash
npm --prefix server run typecheck
# → exit 0, no output

npm --prefix server test -- \
  tests/unit/services/notificationService.test.ts \
  tests/unit/services/notifications.test.ts
# → 2 files, 86 tests, all passed
```

## Fixture Safety

- No fixture files modified or staged
- No `.sqlite` or JSON fixture files appear in `git status`

## Concerns

- `sendNtfy()` logs the HTTP error response body on non-2xx (`logError(\`Ntfy HTTP ${res.status}: ${errBody}\`)`). If the ntfy server echoes the sent payload in its error response, the notification body could appear in logs. This is pre-existing behavior unchanged by this task.
- The `userCfg?.token ?? adminCfg.token` fallback in `sendToUser()` uses the admin token when the user has no personal token. This is authentication-only (not content routing) and was intentionally preserved.

## Report path

`.superpowers/sdd/task-05-report.md`
