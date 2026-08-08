# Timeline Mobile and Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Timeline visually consistent with TREK's List view, directly discoverable and usable on mobile, and capable of selecting a day when no day is already selected.

**Architecture:** Keep Timeline projection and scheduling behavior unchanged. Add one focused route-toolbar component, reuse the existing reservation icon/color maps for context cards, add a Timeline-specific selection callback and day chooser to `DayPlanSidebar`, then expose Timeline as a first-class mobile sheet entry while keeping mobile Timeline navigation mounted.

**Tech Stack:** React 19, TypeScript, Lucide React, Vitest, Testing Library, existing TREK design tokens and i18n keys.

## Global Constraints

- Do not add dependencies or duplicate the existing reservation icon/color maps.
- Preserve List mode, route callbacks, transport edit/open callback precedence, Timeline drag/drop, and all persisted mode behavior.
- Public-transit journeys with `metadata.transit.legs` use the existing purple transit visual (`#7c3aed`, `TramFront`) even if their legacy reservation type is not `transit`; ordinary transport uses `RES_ICONS[type]` and `TRANSPORT_DETAIL_COLORS[type]`.
- Timeline cards must mix their tint into `var(--bg-card)`, not `transparent`, so light-theme cards are visibly colored.
- Mobile List day selection may keep its existing close-sheet behavior; Timeline day chooser and previous/next navigation must keep the Timeline sheet open.
- Reuse existing translations: `trip.timeline.mode.timeline`, `trip.timeline.selectDay`, `dayplan.route`, `dayplan.movement.walking`, `dayplan.movement.driving`, and `transit.title`.
- Every production behavior change follows RED → GREEN with the named focused test command before broader verification.

---

### Task 1: Timeline transport visuals and route command bar

**Files:**
- Create: `client/src/components/Planner/TimelineRouteToolbar.tsx`
- Create: `client/src/components/Planner/TimelineRouteToolbar.test.tsx`
- Modify: `client/src/components/Planner/DayTimelinePlanner.tsx`
- Modify: `client/src/components/Planner/DayTimelinePlanner.test.tsx`

**Interfaces:**
- Consumes: `RES_ICONS`, `TRANSPORT_DETAIL_COLORS`, `safeTransitMeta`, and existing route callbacks.
- Produces: `TimelineRouteToolbar({ dayId, routeShown, routeProfile, onToggleRoute, onSetRouteProfile, onPlanTransit })`.

- [ ] **Step 1: Write failing route-toolbar behavior tests**

Add direct tests that render the real toolbar and independently assert:

```tsx
expect(screen.getByRole('button', { name: 'Route' }).querySelector('svg.lucide-route')).toBeTruthy();
expect(screen.getByRole('button', { name: 'Walking' }).querySelector('svg.lucide-footprints')).toBeTruthy();
expect(screen.getByRole('button', { name: 'Driving' }).querySelector('svg.lucide-car')).toBeTruthy();
expect(screen.getByRole('button', { name: 'Public transit' }).querySelector('svg.lucide-tram-front')).toBeTruthy();
expect(screen.getByRole('button', { name: 'Walking' })).toHaveAttribute('aria-pressed', 'true');
expect(screen.getByTestId('timeline-route-toolbar')).not.toHaveStyle({ background: 'var(--bg-card)' });
```

Click each real control and assert the supplied callbacks receive the existing values (`onToggleRoute()`, `onSetRouteProfile('driving')`, `onPlanTransit(dayId)`).

- [ ] **Step 2: Run the toolbar test and verify RED**

Run:

```bash
npm run test --workspace=client -- src/components/Planner/TimelineRouteToolbar.test.tsx --testTimeout=60000
```

Expected: FAIL because `TimelineRouteToolbar` does not exist.

- [ ] **Step 3: Implement the minimal polished toolbar**

Create a real `role="toolbar"` with a tinted semantic surface, an icon-and-label Route pill, an accessible Walking/Driving segmented group, and a purple icon-and-label Public transit action. Active controls use `bg-accent text-accent-text`; inactive controls use existing surface/content/border tokens. Preserve the exact accessible names used by current integration tests.

- [ ] **Step 4: Verify toolbar GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Write failing Timeline card/header visual tests**

Extend `DayTimelinePlanner.test.tsx` with literal fixtures for an ordinary bus, a metadata-backed public-transit journey, a note, and an uncategorized activity. Assert real rendered behavior:

```tsx
expect(busCard.querySelector('svg.lucide-bus')).toHaveAttribute('aria-hidden', 'true');
expect(transitCard.querySelector('svg.lucide-tram-front')).toHaveAttribute('aria-hidden', 'true');
expect(busCard.style.background).toContain('var(--bg-card)');
expect(transitCard.style.background).toContain('rgb(124, 58, 237)');
expect(noteCard.style.background).toContain('var(--bg-card)');
expect(activityCard.style.background).toContain('var(--bg-card)');
expect(screen.getByTestId('timeline-day-header')).not.toHaveStyle({ background: 'var(--bg-card)' });
```

Retain the existing assertions that cards are read-only and transport callbacks open transit before edit.

- [ ] **Step 6: Run the Timeline test and verify RED**

Run:

```bash
npm run test --workspace=client -- src/components/Planner/DayTimelinePlanner.test.tsx --testTimeout=60000
```

Expected: FAIL because transport icons are absent and header/card surfaces still use the old white/transparent styling.

- [ ] **Step 7: Implement transport icons and explicit card tints**

Replace the inline raw toolbar with `TimelineRouteToolbar`. In `renderContext`, compute transit metadata once, choose `TramFront/#7c3aed` for public transit or the existing type icon/color otherwise, render the icon decoratively beside the title, and compose stronger fills/borders against `var(--bg-card)`. Give note and activity cards an explicit token-based tint against `var(--bg-card)`. Tint the sticky day header and its navigation buttons without changing navigation behavior.

- [ ] **Step 8: Verify Task 1 GREEN and type safety**

Run:

```bash
npm run test --workspace=client -- src/components/Planner/TimelineRouteToolbar.test.tsx src/components/Planner/DayTimelinePlanner.test.tsx --testTimeout=60000
npm run typecheck --workspace=client
```

Expected: all tests and typecheck PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add client/src/components/Planner/TimelineRouteToolbar.tsx client/src/components/Planner/TimelineRouteToolbar.test.tsx client/src/components/Planner/DayTimelinePlanner.tsx client/src/components/Planner/DayTimelinePlanner.test.tsx
git commit -m "feat(timeline): polish route and context visuals"
```

---

### Task 2: Timeline day chooser and navigation callback

**Files:**
- Modify: `client/src/components/Planner/DayPlanSidebar.tsx`
- Modify: `client/src/components/Planner/DayPlanSidebar.test.tsx`

**Interfaces:**
- Consumes: existing `DayPlanMode`, ordered `days`, and `onSelectDay`.
- Produces: optional props `initialMode?: DayPlanMode` and `onTimelineSelectDay?: (dayId: number) => void`; Timeline falls back to `onSelectDay` when the dedicated callback is absent.

- [ ] **Step 1: Replace the dead-end prompt test with failing chooser tests**

Change the current prompt-only regression test so a null selection in Timeline mode exposes every day as a real button and selecting one calls the Timeline callback:

```tsx
const onTimelineSelectDay = vi.fn();
render(<DayPlanSidebar {...makeDefaultProps({
  days: [first, second],
  selectedDayId: null,
  initialMode: 'timeline',
  onTimelineSelectDay,
})} />);
await user.click(screen.getByRole('button', { name: /Second day/ }));
expect(onTimelineSelectDay).toHaveBeenCalledWith(second.id);
```

Add a navigation test proving the selected Timeline's Next day action uses `onTimelineSelectDay`, while List still uses `onSelectDay`.

- [ ] **Step 2: Run the sidebar test and verify RED**

Run:

```bash
npm run test --workspace=client -- src/components/Planner/DayPlanSidebar.test.tsx --testTimeout=60000
```

Expected: FAIL because `initialMode`/`onTimelineSelectDay` and chooser buttons do not exist.

- [ ] **Step 3: Implement the chooser and dedicated callback**

Initialize/reset mode from `initialMode ?? readDayPlanMode(tripId)`. Define one Timeline callback:

```tsx
const selectTimelineDay = props.onTimelineSelectDay ?? ((dayId: number) => props.onSelectDay(dayId));
```

Use it for `DayTimelinePlanner.onSelectDay` and the no-selection chooser. The chooser retains the existing translated instruction, renders ordered day title/date buttons, and handles an empty `days` array without inventing a selection.

- [ ] **Step 4: Verify Task 2 GREEN and type safety**

Run:

```bash
npm run test --workspace=client -- src/components/Planner/DayPlanSidebar.test.tsx src/components/Planner/DayTimelinePlanner.test.tsx --testTimeout=60000
npm run typecheck --workspace=client
```

Expected: all tests and typecheck PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add client/src/components/Planner/DayPlanSidebar.tsx client/src/components/Planner/DayPlanSidebar.test.tsx
git commit -m "feat(timeline): add day chooser without selection"
```

---

### Task 3: First-class mobile Timeline sheet

**Files:**
- Modify: `client/src/pages/tripPlanner/useTripPlanner.ts`
- Modify: `client/src/pages/TripPlannerPage.tsx`
- Modify: `client/src/pages/TripPlannerPage.test.tsx`

**Interfaces:**
- Consumes: Task 2's `initialMode` and `onTimelineSelectDay` props.
- Produces: mobile sidebar state `'left' | 'timeline' | 'right' | null`; `handleSelectDay(dayId, skipFit?, keepMobileOpen?)`.

- [ ] **Step 1: Write failing mobile discoverability and persistence tests**

In the existing mobile sidebar describe block, assert a third visible `Timeline` entry opens a second captured `DayPlanSidebar` with `initialMode: 'timeline'`:

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Timeline' }));
expect(screen.getAllByTestId('day-plan-sidebar')).toHaveLength(2);
expect(capturedDayPlanSidebarProps.current.initialMode).toBe('timeline');
```

Invoke the captured `onTimelineSelectDay(day.id)` and assert the store selection changes while both sidebar instances remain mounted. Also assert the Plan entry supplies `initialMode: 'list'` and Places still opens `PlacesSidebar`.

- [ ] **Step 2: Run the page test and verify RED**

Run:

```bash
npm run test --workspace=client -- src/pages/TripPlannerPage.test.tsx --testTimeout=60000
```

Expected: FAIL because no mobile Timeline entry or keep-open callback exists.

- [ ] **Step 3: Implement direct mobile Timeline entry**

Extend mobile state with `'timeline'`. Replace the two oversized floating buttons with a three-item, icon-and-label mobile command group for Plan, Timeline, and Places using existing glass/surface tokens. Render `DayPlanSidebar` for both `'left'` and `'timeline'`, choose the translated sheet title, pass `initialMode="list"` or `"timeline"`, and keep the sheet body constrained so `DayTimelinePlanner` owns its scroll area.

- [ ] **Step 4: Preserve the Timeline sheet during day changes**

Extend `handleSelectDay` with `keepMobileOpen = false` and only clear mobile state when it is false. Pass `onTimelineSelectDay={(id) => handleSelectDay(id, false, true)}` to the mobile sidebar. Keep the ordinary mobile `onSelectDay` path closing the Plan sheet.

- [ ] **Step 5: Verify Task 3 GREEN and the cross-component contract**

Run:

```bash
npm run test --workspace=client -- src/pages/TripPlannerPage.test.tsx src/components/Planner/DayPlanSidebar.test.tsx src/components/Planner/DayTimelinePlanner.test.tsx src/components/Planner/TimelineRouteToolbar.test.tsx --testTimeout=60000
npm run typecheck --workspace=client
```

Expected: all tests and typecheck PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add client/src/pages/tripPlanner/useTripPlanner.ts client/src/pages/TripPlannerPage.tsx client/src/pages/TripPlannerPage.test.tsx
git commit -m "feat(planner): expose Timeline on mobile"
```

---

## Final Verification

- [ ] Run focused planner tests:

```bash
npm run test --workspace=client -- src/components/Planner/TimelineRouteToolbar.test.tsx src/components/Planner/DayTimelinePlanner.test.tsx src/components/Planner/DayPlanSidebar.test.tsx src/pages/TripPlannerPage.test.tsx tests/unit/i18n/parity.test.ts --testTimeout=60000
```

- [ ] Run `npm run typecheck --workspace=client`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check <merge-base>..HEAD`.
- [ ] Run an independent whole-branch code review, address one consolidated fix wave if required, and re-run affected tests.
- [ ] Merge the reviewed branch to local `main`, run post-merge focused smoke tests, preserve unrelated dirty files, and remove the completed worktree/branch.
