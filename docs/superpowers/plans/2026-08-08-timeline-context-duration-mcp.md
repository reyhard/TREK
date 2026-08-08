# Timeline Context and Recommended-Duration MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a model-assisted MCP duration workflow and make Timeline show theme-consistent POIs, transport, notes, and focused route controls.

**Architecture:** Add one strict heterogeneous duration transaction behind a model-facing MCP tool, then project reservations and notes into pure Timeline context records. Lay scheduled context and assignments out together while keeping assignment overlap semantics and drag mutations separate. Wire the existing route, reservation, and note state through the small Timeline wrapper.

**Tech Stack:** TypeScript, Zod, MCP SDK, SQLite/better-sqlite3, React, Zustand, Vitest, Testing Library, lucide-react, shared TREK i18n.

## Global Constraints

- Work only in `/opt/trek/TREK/.worktrees/feature/timeline-context-duration-mcp` on `feature/timeline-context-duration-mcp` until final verified integration.
- Follow test-driven development: add a focused failing test, run it and confirm the expected failure, then write the minimum production code.
- Preserve List mode and existing Timeline assignment scheduling, drag/drop, optimistic updates, and overlap warnings.
- Keep POI assignments as the only draggable/mutable time-grid records.
- Reuse `places.duration_minutes`, existing reservation/day-note types, `dayMerge` transport helpers, and page-level route callbacks.
- Do not add a migration, model provider, background inference job, or duplicate route engine.
- The duration batch is all-or-nothing; unknown, cross-trip, duplicate, or invalid entries never produce partial writes or broadcasts.
- Use focused tests with `--testTimeout=60000` during iteration; run broader verification before merge.
- Preserve unrelated dirty files in the main checkout.
- Commit this design and plan before Task 1. Initialize the plan-scoped `.superpowers/sdd/2026-08-08-timeline-context-duration-mcp/` workspace with the skill's `sdd-workspace` script; that script creates a self-ignoring `.superpowers/sdd/.gitignore`. Track execution only in that new ignored plan directory. Do not edit the existing tracked legacy SDD reports or this plan's checkboxes.

---

### Task 1: Model-assisted recommended-duration MCP workflow

**Files:**
- Modify: `server/src/services/placeService.ts`
- Modify: `server/src/mcp/tools/places.ts`
- Modify: `server/tests/unit/services/placeService.test.ts`
- Modify: `server/tests/unit/mcp/tools-places.test.ts`

**Interfaces:**
- `create_place.duration_minutes?: number`
- `create_and_assign_place.duration_minutes?: number`
- `PlaceDurationBatchError` with code `INVALID_RECOMMENDATION | DUPLICATE_PLACE_ID | PLACE_NOT_FOUND`
- `updatePlaceDurationsMany(tripId, recommendations)` performs a strict transaction
- MCP tool `apply_recommended_durations({ tripId, recommendations })`

- [ ] **Step 1: Add RED create-tool tests**

Add MCP tests proving each create tool persists a valid non-default duration and rejects `4`, `60.5`, and `1441` without inserting a place. Also retain a default-duration assertion for omission.

- [ ] **Step 2: Run create tests and verify RED**

Run: `npm --prefix server test -- tests/unit/mcp/tools-places.test.ts --testTimeout=60000`

Expected: the valid duration is ignored or the new invalid-input cases are accepted because the create schemas do not yet expose `duration_minutes`.

- [ ] **Step 3: Add duration to both MCP create tools**

Use `durationMinutesSchema.optional()` in each input schema, destructure the field, and forward it into `createPlace`. Do not alter the service's existing `duration_minutes ?? 60` default.

- [ ] **Step 4: Add RED strict-service tests**

Add service tests for distinct `45` and `120` minute updates, preservation of unrelated fields, and rollback when a recommendation contains a missing, cross-trip, duplicate, non-integer, or out-of-range place update.

- [ ] **Step 5: Run strict-service tests and verify RED**

Run: `npm --prefix server test -- tests/unit/services/placeService.test.ts --testTimeout=60000`

Expected: FAIL because `updatePlaceDurationsMany` does not exist.

- [ ] **Step 6: Implement the strict duration transaction**

Export a typed `{ placeId: number; duration_minutes: number }` recommendation contract and `PlaceDurationBatchError`. The error has codes `INVALID_RECOMMENDATION`, `DUPLICATE_PLACE_ID`, and `PLACE_NOT_FOUND`; use messages `Invalid recommended duration for place {id}.`, `Duplicate place ID: {id}.`, and `One or more places were not found in this trip.` respectively. In one `db.transaction`, defensively validate unique positive integer IDs and whole durations in `5..1440`, preflight every place against `trip_id`, update `duration_minutes` and `updated_at`, and return full place projections in input order. Throw the typed error before any update when validation or membership fails. Do not reuse `updatePlacesMany`, whose contract intentionally skips missing IDs.

- [ ] **Step 7: Add RED MCP batch tests**

Test heterogeneous success, returned count/IDs, one post-commit `place:updated` broadcast per place, duplicate input rejection, invalid duration rejection, missing/cross-trip atomic rollback with zero broadcasts, and the existing demo/access/`place_edit` gates.

- [ ] **Step 8: Run MCP batch tests and verify RED**

Run: `npm --prefix server test -- tests/unit/mcp/tools-places.test.ts --testTimeout=60000`

Expected: FAIL because `apply_recommended_durations` is not registered.

- [ ] **Step 9: Register the MCP batch tool**

Add `apply_recommended_durations` under the existing `W` guard with `recommendations.min(1).max(500)` and duplicate-ID schema refinement. Its description must say the caller/model supplies estimates after inspecting `list_places`; do not claim server-side inference. Call the strict service. For `PlaceDurationBatchError`, return its safe message as an MCP error; for unexpected failures return the exact generic MCP error `Failed to apply recommended durations.` Broadcast only after commit and return `{ count, updatedIds }`.

- [ ] **Step 10: Verify and commit Task 1**

Run:

```bash
npm --prefix server test -- tests/unit/mcp/tools-places.test.ts tests/unit/services/placeService.test.ts --testTimeout=60000
npm --prefix server run typecheck
git add server/src/services/placeService.ts server/src/mcp/tools/places.ts server/tests/unit/services/placeService.test.ts server/tests/unit/mcp/tools-places.test.ts
git commit -m "feat(mcp): apply model-recommended place durations"
```

Expected: focused tests and typecheck PASS; commit contains only Task 1 files.

---

### Task 2: Pure transport/note projection and combined visual layout

**Files:**
- Modify: `client/src/components/Planner/dayTimelineModel.ts`
- Modify: `client/src/components/Planner/dayTimelineModel.test.ts`

**Interfaces:**
- `TimelineTransportReservation = Reservation & { __leg?: { index: number; total: number; [key: string]: unknown } }`
- `TimelineTransportContextEntry` contains `kind`, `key`, `title`, projected `reservation`, and original `sourceReservation`
- `TimelineNoteContextEntry` contains `kind`, `key`, `title`, and `note`
- `TimelineContextEntry = TimelineTransportContextEntry | TimelineNoteContextEntry`
- `ScheduledTimelineContextEntry = TimelineContextEntry & { start, end, duration, height }`
- `buildTimelineContextEntries({ day: Day, days: Day[], reservations: Reservation[], notes: DayNote[] })`
- Return shape: `{ scheduled: ScheduledTimelineContextEntry[]; untimed: TimelineContextEntry[] }`
- `resolveTimelineGridStart(starts: number[]): number`
- `layoutTimelineVisualItems(items: Array<{ key: string; start: number; end: number; height: number }>, gridStartMinute: number) => Array<{ key: string; top: number; height: number; visualLane: number; visualLaneCount: number }>`

- [ ] **Step 1: Add RED clock/context projection tests**

Test strict `HH:MM`, `YYYY-MM-DDTHH:MM`, optional ISO seconds/fraction/offset handling, and rejection of descriptive or malformed clock text. Clock extraction preserves the written local clock and never applies timezone conversion. Test a single-day transport with a real start/end interval, start-only marker, end-only arrival marker, multi-day departure/start, arrival/end, and untimed middle phases, an expanded multi-leg transport key, a timed note marker, and malformed/untimed notes in context. Assert a phase never borrows the other phase's clock. Assert hotels and non-transport bookings are excluded, while assignment-linked entries whose type is in `TRANSPORT_TYPES` remain visible because Timeline has no List-style booking badge.

- [ ] **Step 2: Run projection tests and verify RED**

Run: `npm --prefix client test -- src/components/Planner/dayTimelineModel.test.ts --testTimeout=60000`

Expected: FAIL because context projection exports do not exist.

- [ ] **Step 3: Implement defensive context projection**

Reuse `getTransportForDay`, `getSpanPhase`, and `TRANSPORT_TYPES` from `client/src/utils/dayMerge.ts`. The start-clock grammar is `^(?:[01]\d|2[0-3]):[0-5]\d$`. The ISO grammar is `^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T((?:[01]\d|2[0-3]):[0-5]\d)(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$`; feed captured `HH:MM` to `parseDayTime` and do not use `Date`. Permit literal `24:00` only while parsing an interval end or end-only arrival. Project Timeline transports with an empty assignment exclusion list, then filter to `TRANSPORT_TYPES`. For `single`, prefer a valid start and use a valid later end for an interval; if start is invalid but end is valid, create an arrival marker at end. For `start`, use only `reservation_time`; for `end`, use only `reservation_end_time`; for `middle`, return untimed. A marker normally uses `[start, start + 15)`; when its clock is later than `23:45`, including an end-only `24:00`, clamp it to `[23:45, 24:00)` so it remains 15 minutes and never becomes zero-length. Use the standard 30-pixel visual minimum. Preserve malformed and absent-time records in `untimed`. Generate keys as `transport:{id}:leg:{index-or-single}:day:{day.id}:phase:{phase}`, and retain both the projected record and `reservations.find(original.id)` as `sourceReservation`. Note keys are `note:{id}`.

- [ ] **Step 4: Add RED grid-start and lane tests**

Test that context earlier than 06:00 expands the grid, activity/context collisions receive separate visual lanes, touching marker boundaries can reuse a lane, output is deterministic, and the activity records' semantic `overlapping` flags are not changed by context.

- [ ] **Step 5: Run layout tests and verify RED**

Run: `npm --prefix client test -- src/components/Planner/dayTimelineModel.test.ts --testTimeout=60000`

Expected: FAIL because the combined generic layout is absent.

- [ ] **Step 6: Implement combined visual layout**

Extract a non-mutating deterministic visual-lane utility over keyed `{ key, start, end, height }` records. Sort by `start`, then `end`, then `key.localeCompare`; use visual occupancy (`top + height`) for lane reuse; and return a sorted array retaining `key` plus `top`, `height`, `visualLane`, and `visualLaneCount`. Keep `buildTimelineEntries` activity-only overlap counting unchanged; adapt its existing visual fields without changing public activity behavior.

- [ ] **Step 7: Verify and commit Task 2**

Run:

```bash
npm --prefix client test -- src/components/Planner/dayTimelineModel.test.ts src/utils/dayMerge.test.ts --testTimeout=60000
npm --prefix client run typecheck
git add client/src/components/Planner/dayTimelineModel.ts client/src/components/Planner/dayTimelineModel.test.ts
git commit -m "feat(timeline): project transport and note context"
```

Expected: focused tests and typecheck PASS.

---

### Task 3: Timeline colors, context cards, and route toolbar

**Files:**
- Modify: `client/src/components/Planner/DayTimelinePlanner.tsx`
- Modify: `client/src/components/Planner/DayTimelinePlanner.test.tsx`
- Modify: `shared/src/i18n/en/trip.ts`

**Props:**
- `reservations?: Reservation[]`
- `notes?: DayNote[]`
- `routeShown?: boolean`
- `routeProfile?: 'driving' | 'walking'`
- `onToggleRoute?: () => void`
- `onSetRouteProfile?: (profile: 'driving' | 'walking') => void`
- `onPlanTransit?: (dayId: number) => void`
- `onOpenTransit?: (reservation: Reservation) => void`
- `onEditTransport?: (reservation: Reservation) => void`

- [ ] **Step 1: Add RED color tests**

Render categorized, uncategorized, and selected activities. Assert categorized cards use a theme-aware low-opacity category mix rather than `var(--bg-card)`, uncategorized cards use the accent mix, and selected cards use `var(--bg-selected)` while retaining their category border.

- [ ] **Step 2: Run color tests and verify RED**

Run: `npm --prefix client test -- src/components/Planner/DayTimelinePlanner.test.tsx --testTimeout=60000`

Expected: FAIL because activity cards still use `background: var(--bg-card)`.

- [ ] **Step 3: Implement List-consistent activity tint**

Use `color-mix(in srgb, <category-or-accent> 10%, transparent)` for normal activity cards and `var(--bg-selected)` for selected cards. Preserve borders, compact layout, overlap shadows, and high-contrast text.

- [ ] **Step 4: Add RED context rendering tests**

Test scheduled transport and note cards in the grid, their time labels and distinct blue/hover treatments, untimed/malformed entries in the context tray, stable multi-leg rendering, and the absence of assignment move/edit-time controls and `draggable` behavior on context cards. For activation, assert a saved transit record detected by `safeTransitMeta(sourceReservation)` calls `onOpenTransit` with the original reservation, a normal transport calls `onEditTransport` with the original reservation only when editable, and no synthetic leg object reaches either callback. Notes remain read-only.

- [ ] **Step 5: Run context UI tests and verify RED**

Run: `npm --prefix client test -- src/components/Planner/DayTimelinePlanner.test.tsx --testTimeout=60000`

Expected: FAIL because the component neither accepts nor renders reservations/notes.

- [ ] **Step 6: Render scheduled and untimed context**

Build activity and context data with `useMemo`, choose a combined grid start, and run the combined lane layout. Render activity cells through the existing activity renderer and context cells through a separate read-only renderer. Transport uses a blue tint/border; notes use `var(--bg-hover)`. Resolve transport activation from `sourceReservation`: `safeTransitMeta` plus `onOpenTransit` takes precedence; otherwise `canEdit && onEditTransport` opens the original transport. Use buttons only when one of those exact paths is available, otherwise labelled groups. Render untimed context in a separate non-droppable tray.

- [ ] **Step 7: Add RED route-control tests**

Assert Route exposes and toggles `aria-pressed`, Walking/Driving reflect the active profile and call `onSetRouteProfile`, and Plan transit calls `onPlanTransit(day.id)` only when supplied. Assert absent callbacks do not create active broken controls.

- [ ] **Step 8: Run route tests and verify RED**

Run: `npm --prefix client test -- src/components/Planner/DayTimelinePlanner.test.tsx --testTimeout=60000`

Expected: FAIL because Timeline has no route toolbar.

- [ ] **Step 9: Implement the focused route toolbar and translations**

Add a compact toolbar under the day header using existing `dayplan.route`, `dayplan.movement.walking`, `dayplan.movement.driving`, and `transit.title` strings wherever semantics match. Add only the necessary new Timeline context keys (tray label, transport/note accessible labels) to English; the translation layer already falls back to English for missing locale keys. Run i18n parity and placeholder checks.

- [ ] **Step 10: Verify and commit Task 3**

Run:

```bash
npm --prefix client test -- src/components/Planner/DayTimelinePlanner.test.tsx src/components/Planner/dayTimelineModel.test.ts --testTimeout=60000
npm --prefix shared test -- src/i18n --testTimeout=60000
npm --prefix client run typecheck
git add client/src/components/Planner/DayTimelinePlanner.tsx client/src/components/Planner/DayTimelinePlanner.test.tsx shared/src/i18n
git commit -m "feat(timeline): show route transport and note context"
```

Expected: focused UI/model/i18n tests and typecheck PASS.

---

### Task 4: Wire existing planner state into Timeline

**Files:**
- Modify: `client/src/components/Planner/DayPlanSidebar.tsx`
- Modify: `client/src/components/Planner/DayPlanSidebar.test.tsx`
- Modify if callback typing requires it: `client/src/pages/TripPlannerPage.test.tsx`

- [ ] **Step 1: Add RED wrapper integration tests**

Set Timeline mode and a selected day, then assert its reservations and `dayNotes[String(day.id)]` appear. Capture/activate route toggle, profile, transit, and transport-open/edit controls and verify the wrapper delegates to the exact existing callbacks. Verify List mode behavior remains available.

- [ ] **Step 2: Run wrapper tests and verify RED**

Run: `npm --prefix client test -- src/components/Planner/DayPlanSidebar.test.tsx --testTimeout=60000`

Expected: FAIL because the wrapper currently passes assignment-only props.

- [ ] **Step 3: Pass selected-day context and callbacks**

Select the reactive `dayNotes` map directly from `useTripStore`, then pass `props.reservations ?? []`, `dayNotes[String(selectedDay.id)] ?? []`, route state/callbacks, and transport/transit callbacks to `DayTimelinePlanner`. Do not mount or duplicate `useDayPlanSidebar` or `useDayNotes`; Timeline notes are read-only and List retains its existing editing state.

- [ ] **Step 4: Run Timeline/List regression tests**

Run:

```bash
npm --prefix client test -- src/components/Planner/DayPlanSidebar.test.tsx src/components/Planner/DayTimelinePlanner.test.tsx src/components/Planner/dayTimelineModel.test.ts src/utils/dayMerge.test.ts --testTimeout=60000
npm --prefix client run typecheck
```

Expected: all focused integration and regression tests PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add client/src/components/Planner/DayPlanSidebar.tsx client/src/components/Planner/DayPlanSidebar.test.tsx client/src/pages/TripPlannerPage.test.tsx
git commit -m "feat(planner): wire timeline context controls"
```

Omit unchanged paths from the actual commit.

---

### Task 5: Acceptance, review, and safe main integration

**Files:**
- Modify only files required by one final review-fix wave.
- Update only the new ignored plan-scoped SDD workspace for execution tracking; keep this committed plan and existing tracked legacy SDD files unchanged.

- [ ] **Step 1: Run full package verification**

Run each command separately with generous timeouts:

```bash
npm run test --workspace=shared -- --testTimeout=60000
npm run test --workspace=server -- --testTimeout=60000
npm run test --workspace=client -- --testTimeout=60000
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck --workspace=client
npm run build
```

Expected: all suites, typechecks, and production builds PASS. Record any existing non-fatal migration or React test warnings separately from failures.

- [ ] **Step 2: Run one final whole-branch review**

Provide the design, this plan, base commit, diff, commits, and verification logs to one fresh high-reasoning reviewer. Ask specifically about transactional integrity, permission/broadcast timing, time-zone/date parsing, visual-lane collisions, drag isolation, accessibility, theme contrast, wrapper state freshness, and regression risk.

- [ ] **Step 3: Apply at most one consolidated review-fix wave**

If the reviewer finds concrete defects, send one fresh implementer a bounded fix brief, require RED/GREEN tests where behavior changes, rerun the affected focused suites, and commit the fixes. Do not expand scope into List-only route optimization or draggable context entries.

- [ ] **Step 4: Verify the final branch is clean and complete**

Run:

```bash
git status --short
git log --oneline --decorate 84cfb7cf..HEAD
git diff --check 84cfb7cf..HEAD
git diff --stat 84cfb7cf..HEAD
```

Remove temporary dependency symlinks from the worktree if present. Expected: no unintended files, no whitespace errors, and only planned commits.

- [ ] **Step 5: Integrate into local main safely**

Verify `/opt/trek/TREK` is still on `main` and its pre-existing dirty files are unchanged. Merge the feature branch without overwriting unrelated work, rerun a focused post-merge smoke test from main, and compare the merged tree to the verified feature tip. Do not delete the worktree/branch until the merge and smoke test succeed.

- [ ] **Step 6: Record completion**

Mark the active goal complete only after verified integration. Report the MCP workflow honestly as model-assisted, summarize UI behavior, cite the main commit(s), tests/builds, and note any preserved unrelated dirty files.
