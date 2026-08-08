# Task 6 report — Draggable selected-day timeline

## Implementation

- Added a persisted List/Timeline switch keyed by `day-plan-mode-${tripId}` while preserving the existing list hook and toolbar exclusively in List mode.
- Added a selected-day timeline with an hourly grid, scheduled blocks, overlap warnings, an Unscheduled tray, POI drops, scheduled/unscheduled movement, and remove-time support.
- Added dedicated mouse/touch pointer handles and keyboard movement in 15/60-minute increments with instructions, proposed-time announcements, save, and cancel behavior.
- Added optimistic handling for newly assigned places, midnight validation, API failure toasts, read-only rendering, place edit/select callbacks, and day-scoped local assignment cleanup.
- Added compact recommended-duration labels to place rows and complete strict-parity timeline labels for every locale.

## TDD evidence

### RED

- The initial component run failed because `DayPlanModeSwitch` and `DayTimelinePlanner` did not exist.
- Integration tests failed before the sidebar mode wrapper and place-duration label were connected.
- Focused review tests reproduced local-assignment leakage across day changes, an unhandled rejected assignment, and a pointer preview surviving `pointercancel`.

### GREEN verification

- Focused regression: 5 files, 256 tests passed.
- Timeline component: 1 file, 15 tests passed after the final type correction.
- `npm run i18n:parity:strict --workspace=shared`: file parity and key parity passed.
- `git diff --check`: passed with no whitespace errors.
- `npm run typecheck --workspace=client`: the Task 6 mismatch is fixed; the command remains blocked by two existing `Object.hasOwn` target-library errors at `client/src/store/slices/assignmentsSlice.ts:217-218`, introduced by commit `531dad84` from Task 5.

## Independent review

- The reviewer found no critical issues.
- Three important edge cases were fixed with regression tests: local state is reset per selected day, `onAssignToDay` rejection is caught and toasted, and pointer cancellation clears the preview while handles opt out of browser touch gestures.
- Follow-up review found no remaining Critical or Important issues in the reviewed scope.

## Concerns

- Full client typecheck cannot be green until the pre-existing Task 5 `Object.hasOwn` calls are made compatible with the client's current TypeScript library target.
- Existing planner-page tests emit non-fatal MSW and React Router warnings; all focused regression tests pass.

## Fix round 1/5 — Important review findings

### Implementation

- A successful timing mutation now follows the updated assignment with `assignmentsApi.list` and replaces the whole authoritative day, preserving the server's auto-sorted order and unique `order_index` values. A per-day generation prevents an older full-day response from overwriting a newer timing request for another assignment.
- Store optimism now updates top-level assignment times and embedded effective place times. The timeline also owns temporary timing overrides, so Unscheduled scheduling, new-POI scheduling, scheduled movement, and remove-time immediately re-partition the grid/tray and recompute overlap lanes while the request is pending; failures restore the prior partition.
- Conflicting blocks now have visible warning-icon/ring treatment plus an activity-specific accessible conflict name while retaining the global overlap count.
- Place and timeline drag sources clear `window.__dragData` on `dragend`, and timeline drop targets clear the consumed payload before read-only or unrelated early returns.
- Minimum-height scheduled blocks use a one-line compact layout that retains the real interval and focusable move/edit/remove controls without increasing the 30px block height.
- Replaced ES2022-only `Object.hasOwn` calls with `Object.prototype.hasOwnProperty.call`, preserving omitted-versus-explicit-null request semantics and clearing the Task 5 client typecheck blocker.

### RED evidence

- `npm test --workspace=client -- src/store/slices/assignmentsSlice.test.ts src/components/Planner/DayTimelinePlanner.test.tsx src/components/Planner/PlacesSidebar.test.tsx`
  - Failed as expected: 9 regressions reproduced missing whole-day reconciliation, pending schedule/move/remove partition changes, per-block overlap identification, both drag-end cleanup paths/read-only cleanup, and the clipped short-block layout.
- A same-day concurrency regression was written before the implementation. Mutation verification with the day-generation guard disabled failed exactly as expected (`expected 98 to be 99`), proving an older full-day response would overwrite the newer assignment order without the guard.
- `npm run typecheck --workspace=client`
  - Failed before the fix on the two ES2022-only `Object.hasOwn` calls.

### GREEN verification

- Required focused regression: 6 files, 274 tests passed.
- Store timing suite after concurrency mutation restore: 1 file, 11 tests passed.
- `npm run typecheck --workspace=client`: passed (`tsc --noEmit`, exit 0).
- `npm run i18n:parity:strict --workspace=shared`: file parity and key parity passed.
- Prettier check passed for every changed source/test/locale file.
- ESLint passed with 0 errors; remaining warnings are pre-existing in the touched legacy files.
- `git diff --check`: passed with no whitespace errors.

### Concerns

- The earlier typecheck concern above is resolved by this round.
- Existing planner/page/place suites continue to emit non-fatal MSW, React Router, and `act(...)` warnings; all requested tests pass.

## Fix round 2/5 — Guaranteed whole-day timing reconciliation

### Implementation

- Successful timing mutations now mark their request day as needing authoritative reconciliation. A superseded refresh leaves that obligation in place so the current same-day request inherits it, including when that newer mutation fails.
- Authoritative day refreshes are generation-guarded before and after the request, preventing stale responses from overwriting newer timing work. The current request retries one transient list failure; the two-attempt bound prevents an infinite retry loop.
- If both authoritative refresh attempts fail after a successful mutation, the store retains the confirmed assignment row but rejects the operation instead of reporting row-only success. A successful full-day response also removes cross-day copies of its authoritative assignment IDs.
- Existing per-assignment confirmed-version and rollback semantics remain intact.

### RED evidence

- `npm test --workspace=client -- src/store/slices/assignmentsSlice.test.ts`
  - After restoring the worktree-local shared-package link, 2 new regressions failed while the existing 11 tests passed.
  - The older-success/newer-failure case retained stale sibling order because the newer failure never replaced the invalidated refresh.
  - The transient list-failure case retained only the changed row and never consumed the second authoritative full-day response.
- A third bounded-failure regression required two failed list attempts to reject, protecting against both silent row-only success and unbounded retries.

### GREEN verification

- `npm test --workspace=client -- src/store/slices/assignmentsSlice.test.ts`: 1 file, 14 tests passed.
- `npm run typecheck --workspace=client`: passed (`tsc --noEmit`).
- Prettier formatted both changed TypeScript files.
- `git diff --check`: passed with no whitespace errors.

### Concerns

- None in the requested fix-round scope.
