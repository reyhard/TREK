# Task 05 Report — Per-User ntfy Topic Isolation

**Date:** 2026-07-21
**Branch:** `integration/upstream-3.4.1`

## Status: DONE (review findings corrected)

## Commits

```
151d5934 fix(notifications): isolate per-user ntfy topics
c8950368 fix(notifications): remove admin token fallback from per-user ntfy sends, add TDD coverage for ntfy opt-out
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

### 7. Review findings corrections

#### 7a. Admin token fallback removed from per-user ntfy sends

**File:** `server/src/services/notifications/builtins.ts:98`
**Problem:** `ntfyChannel.sendToUser()` used `userCfg?.token ?? adminCfg.token`, allowing the admin token to be transmitted in per-user ntfy sends when the user had no personal token.
**Fix:** Changed to `userCfg?.token ?? null`. Personal sends now never transmit the admin token. Admin credentials are used _only_ in `sendGlobal()`.

#### 7b. TDD coverage for user ntfy opt-out

**Test:** `NTFY-SVCB-006a` — ntfy skipped when user disabled event on ntfy channel via `disableNotificationPref`
- User has ntfy topic configured and ntfy channel active
- User disables `trip_invite` on `ntfy` channel via `disableNotificationPref(testDb, userId, 'trip_invite', 'ntfy')`
- Assert: no ntfy fetch calls fire

**Test:** `NTFY-SVCB-005b` — ntfy does not fall back to admin token when user has no token
- Admin ntfy token is set to a known value; user has topic but no token
- Assert: ntfy send fires but the `Authorization` header is **absent** (admin token not leaked)

#### 7c. Controller test-ntfy admin token leak — corrected

**File:** `server/src/nest/notifications/notifications.controller.ts:96`

**Problem:** The `test-ntfy` endpoint resolved `token` with `userCfg?.token ?? adminCfg.token ?? null`, leaking the admin's bearer token to a user's ntfy server/topic when the user had no personal token and sent the masked placeholder.

**Fix:** Changed to `userCfg?.token ?? null`. The test-ntfy endpoint never transmits the admin token, even when the user has no saved token. Admin credentials are used only in explicitly admin-scoped paths (test-smtp, sendGlobal).

**TDD coverage added** (`server/tests/unit/nest/notifications.controller.test.ts`):

| Test ID | Description |
|---------|-------------|
| NTFY-CTRL-001 | User with no token does NOT leak admin token on MASKED placeholder |
| NTFY-CTRL-002 | User with own saved token sends user token, not admin token |
| NTFY-CTRL-003 | Explicit body token is used, not admin fallback |

## Tests

| Suite | Count | Result |
|-------|-------|--------|
| `notifications.test.ts` | 53 | PASS |
| `notificationService.test.ts` | 35 | PASS |
| `notifications.controller.test.ts` | 25 | PASS |
| **Total** | **113** | **PASS** |

## Commands and Results

```bash
npm --prefix server run typecheck
# → exit 0, no output

npm --prefix server test -- \
  tests/unit/nest/notifications.controller.test.ts \
  tests/unit/services/notificationService.test.ts \
  tests/unit/services/notifications.test.ts
# → 3 files, 113 tests, all passed
```

## Fixture Safety

- No fixture files modified or staged
- No `.sqlite` or JSON fixture files appear in `git status`
- Only `server/src/nest/notifications/notifications.controller.ts`, `server/tests/unit/nest/notifications.controller.test.ts`, and `.superpowers/sdd/task-05-report.md` modified

## Concerns

- `sendNtfy()` logs the HTTP error response body on non-2xx (`logError(\`Ntfy HTTP ${res.status}: ${errBody}\`)`). If the ntfy server echoes the sent payload in its error response, the notification body could appear in logs. This is pre-existing behavior unchanged by this task.

## Report path

`.superpowers/sdd/task-05-report.md`
