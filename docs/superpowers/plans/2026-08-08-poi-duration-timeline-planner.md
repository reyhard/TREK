# POI Recommended Duration and Timeline Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let POIs carry a recommended duration, automatically derive assignment end times, and schedule POIs by dragging them on a selected-day timeline.

**Architecture:** Reuse the existing `places.duration_minutes` column, centralize same-day time arithmetic in `@trek/shared`, and make the server assignment-time service authoritative for duration preservation and end-time derivation. Add a pure client timeline model and a focused `DayTimelinePlanner` component, then expose it beside the existing list planner through a small mode wrapper.

**Tech Stack:** TypeScript, Zod, NestJS, SQLite/better-sqlite3, React, Zustand, Vitest, Testing Library, HTML drag-and-drop plus pointer/keyboard interactions.

## Global Constraints

- Work only in `/opt/trek/TREK/.worktrees/feature/timeline-planner-poi-duration` on `feature/timeline-planner-poi-duration`.
- Follow test-driven development: every production behavior must first be represented by a test that fails for the expected reason.
- Preserve the current List planner and its drag/reorder behavior.
- Reuse `duration_minutes`; do not add a database migration or duplicate duration field.
- Timeline placement snaps to 15-minute increments.
- Overlaps are allowed and visibly flagged; later items are never automatically shifted.
- Scheduled moves preserve actual duration; first scheduling uses the POI recommendation.
- Explicit manual end time remains authoritative; explicit null clears timing.
- Reject automatically calculated intervals ending after `24:00`.
- Use the existing `place_edit` and `day_edit` permissions.

---

### Task 1: Shared same-day time and duration contracts

**Files:**
- Create: `shared/src/time/dayTime.ts`
- Create: `shared/src/time/dayTime.spec.ts`
- Modify: `shared/src/index.ts`
- Modify: `shared/src/place/place.schema.ts`
- Modify: `shared/src/place/place.schema.spec.ts`
- Modify: `shared/src/assignment/assignment.schema.ts`

**Interfaces:**
- Produces: `parseDayTime(value, options?) => number | null`
- Produces: `formatDayTime(minutes, options?) => string | null`
- Produces: `addDayDuration(start, durationMinutes) => string | null`
- Produces: `durationMinutesSchema`, an integer schema bounded to `5..1440`
- Produces: `assignmentTimeRequestSchema` that accepts valid start/end strings, preserves omission, and accepts explicit null

- [ ] **Step 1: Write failing time utility tests**

```ts
expect(parseDayTime('09:15')).toBe(555)
expect(parseDayTime('24:00')).toBeNull()
expect(parseDayTime('24:00', { allowEndOfDay: true })).toBe(1440)
expect(formatDayTime(1440, { allowEndOfDay: true })).toBe('24:00')
expect(addDayDuration('09:15', 90)).toBe('10:45')
expect(addDayDuration('23:30', 60)).toBeNull()
```

- [ ] **Step 2: Run the time tests and verify RED**

Run: `npm test --workspace=shared -- src/time/dayTime.spec.ts`

Expected: FAIL because `dayTime.ts` and its exports do not exist.

- [ ] **Step 3: Implement the shared time utility**

```ts
export interface DayTimeOptions { allowEndOfDay?: boolean }

export function parseDayTime(value: unknown, options: DayTimeOptions = {}): number | null {
  if (typeof value !== 'string') return null
  if (options.allowEndOfDay && value === '24:00') return 1440
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null
}

export function formatDayTime(total: number, options: DayTimeOptions = {}): string | null {
  if (!Number.isInteger(total) || total < 0 || total > 1440) return null
  if (total === 1440) return options.allowEndOfDay ? '24:00' : null
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function addDayDuration(start: string, durationMinutes: number): string | null {
  const parsed = parseDayTime(start)
  if (parsed === null || !Number.isInteger(durationMinutes) || durationMinutes <= 0) return null
  return formatDayTime(parsed + durationMinutes, { allowEndOfDay: true })
}
```

- [ ] **Step 4: Add failing duration and assignment-time schema tests**

```ts
for (const duration_minutes of [5, 60, 1440]) {
  expect(placeCreateRequestSchema.safeParse({ name: 'Museum', duration_minutes }).success).toBe(true)
}
for (const duration_minutes of [0, 4, 60.5, 1441]) {
  expect(placeCreateRequestSchema.safeParse({ name: 'Museum', duration_minutes }).success).toBe(false)
}
expect(assignmentTimeRequestSchema.parse({ place_time: '09:00' })).toEqual({ place_time: '09:00' })
expect(assignmentTimeRequestSchema.parse({ place_time: null, end_time: null })).toEqual({ place_time: null, end_time: null })
expect(assignmentTimeRequestSchema.safeParse({ place_time: '25:00' }).success).toBe(false)
```

- [ ] **Step 5: Run schema tests and verify RED**

Run: `npm test --workspace=shared -- src/place/place.schema.spec.ts src/assignment/assignment.schema.spec.ts`

Expected: FAIL because duration is not bounded and time values are unrestricted strings.

- [ ] **Step 6: Implement and export the schemas**

```ts
export const durationMinutesSchema = z.number().int().min(5).max(1440)
const startTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const endTimeSchema = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/)
```

Add `duration_minutes: durationMinutesSchema.optional()` to create/update request objects and `duration_minutes: durationMinutesSchema.nullable().optional()` to response schemas. Replace assignment request strings with the bounded time schemas.

- [ ] **Step 7: Run shared tests and type check**

Run: `npm test --workspace=shared -- src/time/dayTime.spec.ts src/place/place.schema.spec.ts src/assignment/assignment.schema.spec.ts`

Run: `npm run typecheck --workspace=shared`

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add shared/src/time shared/src/index.ts shared/src/place/place.schema.ts shared/src/place/place.schema.spec.ts shared/src/assignment/assignment.schema.ts
git commit -m "feat(shared): define planner duration and time contracts"
```

---

### Task 2: Server-authoritative assignment timing

**Files:**
- Create: `server/src/services/assignmentTiming.ts`
- Create: `server/tests/unit/services/assignmentTiming.test.ts`
- Modify: `server/src/services/assignmentService.ts`
- Modify: `server/src/services/placeService.ts`
- Modify: `server/src/nest/assignments/assignments.controller.ts`
- Modify: `server/src/mcp/tools/assignments.ts`
- Modify: `server/tests/integration/assignments.test.ts`
- Modify: `server/tests/unit/mcp/tools-assignments.test.ts`
- Modify: `server/tests/unit/services/placeService.test.ts`

**Interfaces:**
- Consumes: `parseDayTime`, `addDayDuration`, and `AssignmentTimeRequest` from `@trek/shared`
- Produces: `resolveAssignmentTiming(current, request) => { placeTime: string | null; endTime: string | null }`
- Produces: `AssignmentTimingError` with user-safe validation messages
- Changes: `updateTime(id, placeTime, endTime)` preserves whether `endTime` was omitted

- [ ] **Step 1: Write failing pure timing tests**

```ts
expect(resolveAssignmentTiming(
  { effectiveStart: null, effectiveEnd: null, recommendedDuration: 90 },
  { place_time: '09:00' },
)).toEqual({ placeTime: '09:00', endTime: '10:30' })

expect(resolveAssignmentTiming(
  { effectiveStart: '09:00', effectiveEnd: '10:15', recommendedDuration: 60 },
  { place_time: '13:00' },
)).toEqual({ placeTime: '13:00', endTime: '14:15' })

expect(resolveAssignmentTiming(
  { effectiveStart: '09:00', effectiveEnd: '10:15', recommendedDuration: 60 },
  { place_time: '13:00', end_time: '13:30' },
)).toEqual({ placeTime: '13:00', endTime: '13:30' })

expect(resolveAssignmentTiming(
  { effectiveStart: '09:00', effectiveEnd: '10:15', recommendedDuration: 60 },
  { place_time: null, end_time: null },
)).toEqual({ placeTime: null, endTime: null })
```

Also assert that `23:30 + 60`, malformed times, and end-before-start throw `AssignmentTimingError`.

- [ ] **Step 2: Run pure timing tests and verify RED**

Run: `npm test --workspace=server -- tests/unit/services/assignmentTiming.test.ts`

Expected: FAIL because the timing module does not exist.

- [ ] **Step 3: Implement minimal timing resolution**

```ts
export function resolveAssignmentTiming(current: CurrentAssignmentTiming, request: AssignmentTimeRequest) {
  if (request.place_time === null) return { placeTime: null, endTime: null }
  const placeTime = request.place_time ?? current.effectiveStart
  if (!placeTime) return { placeTime: null, endTime: request.end_time ?? current.effectiveEnd }
  if (Object.prototype.hasOwnProperty.call(request, 'end_time')) {
    if (request.end_time === null) return { placeTime, endTime: null }
    validatePositiveInterval(placeTime, request.end_time)
    return { placeTime, endTime: request.end_time }
  }
  const actual = positiveDuration(current.effectiveStart, current.effectiveEnd)
  const duration = actual ?? current.recommendedDuration ?? 60
  const endTime = addDayDuration(placeTime, duration)
  if (!endTime) throw new AssignmentTimingError('Activity must end by 24:00.')
  return { placeTime, endTime }
}
```

- [ ] **Step 4: Add failing integration tests for persistence**

Extend `ASSIGN-009` with cases that:

```ts
// place.duration_minutes = 90; omitted end derives 10:30
.send({ place_time: '09:00' })
expect(update.body.assignment.assignment_time).toBe('09:00')
expect(update.body.assignment.assignment_end_time).toBe('10:30')

// moving 09:00–10:30 to 13:00 preserves 90 minutes
.send({ place_time: '13:00' })
expect(update.body.assignment.assignment_end_time).toBe('14:30')

// explicit null clears both
.send({ place_time: null, end_time: null })
```

Assert a past-midnight request returns HTTP 400 and leaves the prior row unchanged.

- [ ] **Step 5: Run assignment integration tests and verify RED**

Run: `npm test --workspace=server -- tests/integration/assignments.test.ts`

Expected: FAIL because omitted end currently becomes null rather than a derived value.

- [ ] **Step 6: Make update persistence transactional and omission-aware**

Load this projection before updating:

```sql
SELECT da.assignment_time, da.assignment_end_time,
       COALESCE(da.assignment_time, p.place_time) AS effective_start,
       COALESCE(da.assignment_end_time, p.end_time) AS effective_end,
       p.duration_minutes
FROM day_assignments da
JOIN places p ON p.id = da.place_id
WHERE da.id = ?
```

Resolve and update both override columns in a `db.transaction`. Keep the existing chronological auto-sort after the update. Map `AssignmentTimingError` to HTTP 400 in the Nest controller.

- [ ] **Step 7: Preserve omitted-end semantics in MCP**

Change the tool call to pass `place_time` and `end_time` directly instead of substituting stored values. Add MCP assertions that an omitted end derives it, explicit end wins, and explicit null clears it.

- [ ] **Step 8: Fix place duration truthiness and validate service inputs**

Replace `duration_minutes || 60` and `duration_minutes || null` with nullish logic so validated integers are handled consistently:

```ts
duration_minutes ?? 60
duration_minutes ?? null
```

Add service tests for create default 60 and update persistence of 5 and 1,440.

- [ ] **Step 9: Run focused server tests and type check**

Run: `npm test --workspace=server -- tests/unit/services/assignmentTiming.test.ts tests/integration/assignments.test.ts tests/unit/mcp/tools-assignments.test.ts tests/unit/services/placeService.test.ts`

Run: `npm run typecheck --workspace=server`

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

```bash
git add server/src/services/assignmentTiming.ts server/src/services/assignmentService.ts server/src/services/placeService.ts server/src/nest/assignments/assignments.controller.ts server/src/mcp/tools/assignments.ts server/tests
git commit -m "feat(planner): derive assignment end times from duration"
```

---

### Task 3: Recommended duration in the POI editor

**Files:**
- Modify: `client/src/components/Planner/PlaceFormModal.helpers.ts`
- Modify: `client/src/components/Planner/PlaceFormModal.helpers.test.ts`
- Modify: `client/src/components/Planner/PlaceFormModal.tsx`
- Modify: `client/src/components/Planner/PlaceFormModal.test.tsx`
- Modify: `client/src/pages/tripPlanner/useTripPlanner.ts`
- Modify: `shared/src/i18n/en/places.ts`
- Modify: every locale file under `shared/src/i18n/*/places.ts` required by the strict parity check

**Interfaces:**
- Consumes: validated `Place.duration_minutes`
- Produces: `PlaceFormData.duration_minutes` as a numeric-input string
- Produces: `PlaceSubmitData.duration_minutes` as a number

- [ ] **Step 1: Write failing form helper and component tests**

```ts
expect(DEFAULT_FORM.duration_minutes).toBe('60')

render(<PlaceFormModal {...defaultProps} place={buildPlace({ duration_minutes: 90 })} />)
expect(screen.getByLabelText('Recommended duration')).toHaveValue('90')

await user.clear(screen.getByLabelText('Recommended duration'))
await user.type(screen.getByLabelText('Recommended duration'), '120')
await user.click(screen.getByRole('button', { name: 'Update' }))
expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ duration_minutes: 120 }), expect.anything())
```

Add invalid-value tests for 4, 60.5, and 1,441 that keep Save disabled and show the bounded validation message.

- [ ] **Step 2: Run form tests and verify RED**

Run: `npm test --workspace=client -- src/components/Planner/PlaceFormModal.helpers.test.ts src/components/Planner/PlaceFormModal.test.tsx`

Expected: FAIL because the field is absent.

- [ ] **Step 3: Implement form state, input, conversion, and validation**

Add the field to `PlaceFormData` and `DEFAULT_FORM`, hydrate with `String(place.duration_minutes ?? 60)`, and submit:

```ts
export interface PlaceSubmitData
  extends Omit<PlaceFormData, 'lat' | 'lng' | 'category_id' | 'duration_minutes'> {
  lat: number | null
  lng: number | null
  category_id: string | null
  duration_minutes: number
}

duration_minutes: Number(form.duration_minutes)
```

Render `NumericInput` with `mode="unsigned"`, `min={5}`, `max={1440}`, `step={5}`, an accessible label, and a short minutes hint. Keep recommended duration visible for both new and existing POIs even when assignment time fields are hidden.

- [ ] **Step 4: Ensure place updates retain duration while stripping assignment times**

Extend the existing `handleSavePlace` test to assert `duration_minutes` remains in `placeData` while `place_time` and `end_time` are stripped from POI updates.

- [ ] **Step 5: Add translations and run strict parity**

Add these keys with English fallback text where a locale has no translation:

```ts
'places.recommendedDuration': 'Recommended duration'
'places.recommendedDurationHint': 'Used to calculate the end time when this place is scheduled.'
'places.recommendedDurationInvalid': 'Enter a whole number from 5 to 1,440 minutes.'
'places.minutesShort': '{count} min'
```

Run: `npm run i18n:parity:strict --workspace=shared`

- [ ] **Step 6: Run focused client tests and type check**

Run: `npm test --workspace=client -- src/components/Planner/PlaceFormModal.helpers.test.ts src/components/Planner/PlaceFormModal.test.tsx src/pages/TripPlannerPage.test.tsx`

Run: `npm run typecheck --workspace=client`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add client/src/components/Planner/PlaceFormModal* client/src/pages/tripPlanner/useTripPlanner.ts shared/src/i18n
git commit -m "feat(places): edit recommended visit duration"
```

---

### Task 4: Pure timeline scheduling model

**Files:**
- Create: `client/src/components/Planner/dayTimelineModel.ts`
- Create: `client/src/components/Planner/dayTimelineModel.test.ts`

**Interfaces:**
- Consumes: `Assignment[]`
- Produces: `buildTimelineEntries(assignments) => { scheduled, unscheduled, overlapCount }`
- Produces: `snapTimelineMinute(rawMinute, increment?) => number`
- Produces: `timelineMinuteFromPointer(clientY, bounds, startMinute, pxPerMinute) => number`
- Produces: `TimelineEntry` with start/end/duration/top/height/lane/laneCount/overlapping

- [ ] **Step 1: Write failing model tests**

```ts
expect(snapTimelineMinute(548)).toBe(555)
expect(snapTimelineMinute(547)).toBe(540)

const result = buildTimelineEntries([
  assignment(1, '09:00', '10:00'),
  assignment(2, '09:30', '10:30'),
  assignment(3, '10:30', '11:00'),
  assignment(4, null, null),
])
expect(result.unscheduled.map((entry) => entry.id)).toEqual([4])
expect(result.scheduled[0]).toMatchObject({ overlapping: true, lane: 0, laneCount: 2 })
expect(result.scheduled[1]).toMatchObject({ overlapping: true, lane: 1, laneCount: 2 })
expect(result.scheduled[2].overlapping).toBe(false)
```

Also test minimum visual height, deterministic lanes, touching intervals, invalid intervals becoming unscheduled, and a pre-06:00 entry expanding `gridStartMinute`.

- [ ] **Step 2: Run model tests and verify RED**

Run: `npm test --workspace=client -- src/components/Planner/dayTimelineModel.test.ts`

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement the pure model**

Use `parseDayTime` from `@trek/shared`. Sort intervals by start, then end, then assignment id. Allocate the lowest available lane whose prior end is `<= start`; assign every member of a connected overlap group the group's final `laneCount`. Use constants:

```ts
export const TIMELINE_SNAP_MINUTES = 15
export const TIMELINE_DEFAULT_START = 6 * 60
export const TIMELINE_END = 24 * 60
export const TIMELINE_PIXELS_PER_MINUTE = 1
export const TIMELINE_MIN_BLOCK_HEIGHT = 30
```

- [ ] **Step 4: Run model tests and type check**

Run: `npm test --workspace=client -- src/components/Planner/dayTimelineModel.test.ts`

Run: `npm run typecheck --workspace=client`

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add client/src/components/Planner/dayTimelineModel.ts client/src/components/Planner/dayTimelineModel.test.ts
git commit -m "feat(planner): model day timeline placement and overlaps"
```

---

### Task 5: Assignment timing store action

**Files:**
- Modify: `client/src/store/slices/assignmentsSlice.ts`
- Create: `client/src/store/slices/assignmentsSlice.test.ts`
- Modify: `client/src/pages/tripPlanner/useTripPlanner.ts`

**Interfaces:**
- Produces: `setAssignmentTime(tripId, dayId, assignmentId, times) => Promise<Assignment>`
- Changes: `handleAssignToDay(...) => Promise<Assignment | undefined>` so a timeline drop can schedule the created assignment

- [ ] **Step 1: Write failing store tests**

Test a successful response replaces the complete assignment projection, a failure restores the prior assignments map, and explicit null clears embedded effective times optimistically.

```ts
assignmentsApi.updateTime.mockResolvedValue({ assignment: updated })
await store.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })
expect(store.getState().assignments['10'][0]).toEqual(updated)
```

- [ ] **Step 2: Run store tests and verify RED**

Run: `npm test --workspace=client -- src/store/slices/assignmentsSlice.test.ts`

Expected: FAIL because the action does not exist.

- [ ] **Step 3: Implement the store action**

Capture the prior map, apply a minimal optimistic embedded-place patch, call `assignmentsApi.updateTime`, replace the matching assignment with `data.assignment`, and restore the prior map on error. Throw `getApiErrorMessage(err, 'Error updating assignment time')` after rollback.

- [ ] **Step 4: Return created assignments from planner orchestration**

Return `assignment` from `handleAssignToDay` after registering undo. Preserve existing toast, route refresh, and error handling.

- [ ] **Step 5: Run store/page tests and type check**

Run: `npm test --workspace=client -- src/store/slices/assignmentsSlice.test.ts src/pages/TripPlannerPage.test.tsx`

Run: `npm run typecheck --workspace=client`

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add client/src/store/slices/assignmentsSlice.ts client/src/store/slices/assignmentsSlice.test.ts client/src/pages/tripPlanner/useTripPlanner.ts
git commit -m "feat(planner): persist assignment timeline moves"
```

---

### Task 6: Draggable selected-day timeline and List/Timeline switch

**Files:**
- Create: `client/src/components/Planner/DayTimelinePlanner.tsx`
- Create: `client/src/components/Planner/DayTimelinePlanner.test.tsx`
- Create: `client/src/components/Planner/DayPlanModeSwitch.tsx`
- Create: `client/src/components/Planner/DayPlanModeSwitch.test.tsx`
- Modify: `client/src/components/Planner/DayPlanSidebar.tsx`
- Modify: `client/src/components/Planner/PlacesSidebarRow.tsx`
- Modify: `shared/src/i18n/en/trip.ts`
- Modify: locale trip files required by strict parity

**Interfaces:**
- Consumes: selected day, its assignments, `places`, `categories`, permissions, and callbacks
- Produces: `DayTimelinePlanner` with POI drop, unscheduled tray, scheduled move, remove-time, pointer move, keyboard move, overlap warning, and edit/select callbacks
- Produces: persisted `list | timeline` mode at `day-plan-mode-${tripId}`

- [ ] **Step 1: Write failing mode-switch tests**

Assert List is the default, Timeline persists in local storage, the existing list remains mounted only in List mode, and no selected day renders the selection prompt.

- [ ] **Step 2: Write failing timeline render and drop tests**

Cover:

```ts
expect(screen.getByText('Unscheduled')).toBeInTheDocument()
expect(screen.getByText('09:00 – 10:30')).toBeInTheDocument()
expect(screen.getByRole('status', { name: /2 overlapping activities/i })).toBeInTheDocument()

fireEvent.drop(grid, { clientY: slotY, dataTransfer: placeTransfer('42') })
await waitFor(() => expect(onAssignToDay).toHaveBeenCalledWith(42, 10))
await waitFor(() => expect(onSetAssignmentTime).toHaveBeenCalledWith(10, newAssignment.id, { place_time: '09:15' }))
```

Add tests for unscheduled-to-grid, scheduled block movement, move-to-Unscheduled, schedule failure, past-midnight error, read-only rendering, and touching intervals without warnings.

- [ ] **Step 3: Run component tests and verify RED**

Run: `npm test --workspace=client -- src/components/Planner/DayPlanModeSwitch.test.tsx src/components/Planner/DayTimelinePlanner.test.tsx`

Expected: FAIL because both components are absent.

- [ ] **Step 4: Implement the mode switch and timeline shell**

Use buttons with `aria-pressed`, persist the mode, and render the selected day header, Unscheduled tray, labelled hourly grid, and blocks from `buildTimelineEntries`. Do not duplicate the existing PDF/ICS/list toolbar in Timeline mode.

- [ ] **Step 5: Implement desktop cross-sidebar POI drop**

Read `placeId` from `dataTransfer` or `window.__dragData`, resolve and snap the pointer time, call `onAssignToDay`, then call `onSetAssignmentTime` with only `place_time`. If scheduling fails, refresh/render the assignment as Unscheduled and show the API error.

- [ ] **Step 6: Implement block and Unscheduled movement**

Use a dedicated drag handle. For HTML drop and pointer completion, call:

```ts
onSetAssignmentTime(day.id, assignment.id, { place_time: formatDayTime(snappedMinute)! })
```

For remove-time:

```ts
onSetAssignmentTime(day.id, assignment.id, { place_time: null, end_time: null })
```

Render optimistic state from the store action and show a toast on rollback.

- [ ] **Step 7: Implement pointer and keyboard accessibility**

Pointer drag starts only from the handle after `pointerdown`, captures the pointer, updates a visual preview, and commits on `pointerup`. Keyboard **Move** enters a mode in which Up/Down changes by 15 minutes, PageUp/PageDown changes by 60, Enter saves, and Escape restores the starting preview. Add `aria-describedby` instructions and announce the proposed slot through an `aria-live` region.

- [ ] **Step 8: Integrate without changing List behavior**

Rename the current memoized render function to an internal `DayPlanList` that alone calls `useDayPlanSidebar(props)`. Export a new memoized `DayPlanSidebar` wrapper that owns the persisted mode and renders either `DayPlanList` or `DayTimelinePlanner`; this obeys React's hook rules and avoids running the large list hook in Timeline mode. All current callers continue passing the same planner props. Change `onAssignToDay`'s prop type to return `Promise<Assignment | undefined> | Assignment | undefined`.

- [ ] **Step 9: Show recommended duration in the place row and add translations**

Append a compact `90 min` label under the POI name/address when `duration_minutes` is present. Add timeline labels, instructions, overlap warnings, validation errors, List/Timeline mode names, Unscheduled, and Remove time to English and locale fallback files. Run strict i18n parity.

- [ ] **Step 10: Run focused UI regression tests and type check**

Run: `npm test --workspace=client -- src/components/Planner/DayPlanModeSwitch.test.tsx src/components/Planner/DayTimelinePlanner.test.tsx src/components/Planner/DayPlanSidebar.test.tsx src/components/Planner/PlacesSidebar.test.tsx src/pages/TripPlannerPage.test.tsx`

Run: `npm run i18n:parity:strict --workspace=shared`

Run: `npm run typecheck --workspace=client`

Expected: PASS.

- [ ] **Step 11: Commit Task 6**

```bash
git add client/src/components/Planner/DayTimelinePlanner* client/src/components/Planner/DayPlanModeSwitch* client/src/components/Planner/DayPlanSidebar.tsx client/src/components/Planner/PlacesSidebarRow.tsx shared/src/i18n
git commit -m "feat(planner): add draggable day timeline"
```

---

### Task 7: End-to-end verification and documentation evidence

**Files:**
- Modify only files required to fix defects exposed by verification, with a failing regression test added before each fix.

**Interfaces:**
- Consumes: all feature behavior from Tasks 1–6
- Produces: authoritative test, build, runtime, and screenshot evidence for every acceptance criterion

- [ ] **Step 1: Run workspace-focused verification**

```bash
npm test --workspace=shared
npm test --workspace=server -- --testTimeout=60000
npm test --workspace=client
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck --workspace=client
npm run build
```

Expected: all commands exit 0 without new warnings.

- [ ] **Step 2: Run lint and formatting checks for affected workspaces**

```bash
npm run lint:check --workspace=server
npm run lint:check --workspace=client
npm run format:check
```

Expected: all affected files pass. Do not bulk-reformat unrelated files.

- [ ] **Step 3: Start the development stack and verify the real API**

Use the repository's documented development command or existing Docker fast-development stack. With an editable test trip:

1. Create a POI with a 90-minute recommendation.
2. Assign it by dropping at 09:15 and verify persisted 09:15–10:45 after reload.
3. Move it to 13:00 and verify 13:00–14:30 after reload.
4. Manually change it to 13:00–13:45, then move it to 15:00 and verify 15:00–15:45.
5. Return it to Unscheduled and verify both override times are null after reload.
6. Create an overlap and verify both blocks remain saved and visibly warned.
7. Attempt a past-midnight placement and verify the prior state remains unchanged.

- [ ] **Step 4: Inspect desktop and narrow screenshots**

Capture and inspect:

- desktop List mode;
- desktop Timeline with scheduled, unscheduled, and overlapping activities;
- narrow/coarse-pointer Timeline with usable drag handles and no clipped controls;
- dark theme Timeline.

Fix visual defects only after adding the smallest relevant component or screenshot assertion.

- [ ] **Step 5: Audit the objective against evidence**

Map each acceptance criterion in `docs/superpowers/specs/2026-08-08-poi-duration-timeline-planner-design.md` to a passing test or verified runtime observation. Treat missing evidence as incomplete work.

- [ ] **Step 6: Commit verification fixes, if any**

```bash
git add -p
git commit -m "fix(planner): address timeline verification findings"
```

Skip this commit when verification required no changes.
