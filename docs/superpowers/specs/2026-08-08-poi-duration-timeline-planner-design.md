# POI Recommended Duration and Timeline Planner Design

**Status:** Approved through user-delegated recommended defaults  
**Date:** 2026-08-08  
**Repository:** `mauriceboe/TREK`  
**Target path:** `docs/superpowers/specs/2026-08-08-poi-duration-timeline-planner-design.md`

## Summary

TREK already stores `places.duration_minutes`, but the place form does not expose it and assignment timing does not use it. The day planner also supports list ordering rather than placement on a time-scaled canvas.

This design makes `duration_minutes` the POI's user-editable recommended duration, derives an assignment end time when the assignment is scheduled without an explicit end, and adds a selected-day vertical timeline. Users can drag saved POIs from the Places sidebar, drag unscheduled assignments, or reposition scheduled blocks. The existing list planner remains available.

## Goals

1. Let users edit a POI's recommended duration.
2. Use that duration to calculate an assignment end time when it is first scheduled.
3. Preserve a scheduled assignment's actual duration when its block is moved.
4. Add a selected-day vertical timeline with draggable activity blocks.
5. Let users drag saved POIs from the Places sidebar directly onto a timeline time slot.
6. Keep untimed assignments accessible in an Unscheduled area.
7. Keep the existing list planner and all existing reorder behavior available.
8. Make timing derivation authoritative on the server so API clients behave consistently.
9. Allow overlapping activities while making conflicts visible.
10. Support pointer, mouse, keyboard, and coarse-pointer/touch interaction without hijacking page scrolling.

## Non-goals

- No automatic cascade that pushes later activities after a drop.
- No rejection of overlaps.
- No multi-day side-by-side calendar.
- No resizing activity blocks in the first version; duration is edited in the place or assignment form.
- No new `recommended_duration_minutes` database column.
- No migration of existing values beyond using the current `duration_minutes` value.
- No replacement of the current day list, route connectors, notes, or reservation planning.
- No overnight activity model. A placement must end within the selected day.

## Recommended duration

The existing `places.duration_minutes` column becomes the recommended duration.

- The place create/edit form always shows a **Recommended duration** numeric field, including for unassigned places.
- Accepted values are whole minutes from 5 through 1,440.
- New POIs default to 60 minutes.
- Existing POIs use their stored value; the database's existing default already supplies 60 for ordinary rows.
- Imported and API-created POIs without a duration continue to receive 60 minutes.
- The value belongs to the reusable POI. Assignment-specific start/end times remain on `day_assignments`.
- The form sends `duration_minutes` as a number, and shared/server validation rejects non-integers and out-of-range values.

The place pool and inspector may show a compact duration label when a value is present. The primary requirement is that the value is editable and visible in the timeline cards.

## Timing rules

Assignment timing continues to use `assignment_time` and `assignment_end_time`, exposed to the client through the embedded assignment place's effective `place_time` and `end_time`.

### First scheduling

When a client sets `place_time` and omits `end_time`, and the assignment has no positive current start/end interval:

1. Read the assigned POI's `duration_minutes`.
2. Calculate `end_time = place_time + duration_minutes`.
3. Reject the update if the resulting end is after `24:00`.
4. Store both assignment override fields in one database update.

### Moving a scheduled block

When a client sets `place_time` and omits `end_time`, and the assignment already has a positive same-day start/end interval:

1. Calculate the assignment's current actual duration from its effective start/end times.
2. Keep that duration even if it differs from the POI recommendation.
3. Calculate the new end from the dropped start plus the actual duration.
4. Reject the update if it would end after `24:00`.

### Explicit manual timing

- An explicit `end_time` string is authoritative and is stored unchanged after validation.
- An explicit `end_time: null` clears the end time and does not trigger derivation.
- `place_time: null` clears both assignment start and end overrides.
- The existing assignment editor continues to send both values, so manual edits are never silently replaced by the recommendation.
- Same-day end times must be strictly later than start times.

The assignment-time service owns these rules in a pure helper plus a transactional persistence function. MCP and HTTP callers use the same service behavior.

## Timeline location and modes

The left Day Plan sidebar gains a **List / Timeline** segmented switch.

- **List** renders the existing `DayPlanSidebar` behavior unchanged.
- **Timeline** renders one selected day at a time.
- If no day is selected, Timeline shows a day-selection prompt rather than choosing silently.
- The chosen mode is remembered per trip in local storage.
- Switching modes does not alter assignment order or timing.

The timeline is a focused component rather than another branch inside the existing four-thousand-line day-list renderer. Shared drag payload parsing and assignment mutations are extracted into small utilities where necessary.

## Timeline layout

The timeline uses a vertical time axis from 06:00 through 24:00 by default and expands upward to include earlier scheduled items. Hour rules are labelled; quarter-hour rules provide 15-minute snapping.

The selected day contains:

1. A sticky day header with previous/next-day controls and the List/Timeline switch.
2. An **Unscheduled** tray for assignments without an effective start time.
3. A scrollable time grid.
4. Activity blocks positioned by start time and sized by actual duration.

Blocks show at least:

- POI name;
- formatted start–end time;
- duration;
- category color/icon when available;
- overlap warning state;
- an edit action and an accessible drag handle.

Very short activities retain a minimum visual height while their true times remain in the label. Overlapping blocks use side-by-side lanes rather than covering each other.

Reservations and notes remain in the List view for this version. The Timeline view is specifically an activity/POI scheduler; it does not pretend unsupported entries are draggable time blocks.

## Drag and drop interactions

All timeline placement snaps to 15-minute increments.

### Saved POI from Places sidebar

1. The existing sidebar drag payload supplies `placeId`.
2. The timeline resolves the pointer position to a time.
3. It creates the day assignment.
4. It calls the assignment-time endpoint with `place_time` and omits `end_time`.
5. The server derives the end from the recommendation.
6. The client replaces its optimistic item with the returned assignment.

If timing fails after assignment creation, the assignment remains in the Unscheduled tray and an error explains why. The user does not lose the newly assigned POI.

### Unscheduled assignment

Dragging from the tray onto the grid calls the time endpoint with only `place_time`. The server uses the recommendation because no positive actual interval exists.

### Scheduled assignment

Dragging a block vertically calls the time endpoint with only the new `place_time`. The server preserves the current actual duration. The client renders an optimistic move and rolls it back if persistence fails.

### Removing a time

Dragging a scheduled block into the Unscheduled tray, or activating its **Remove time** action, sends `place_time: null` and `end_time: null`.

### Input methods

- Desktop mouse uses the existing HTML drag payload for cross-sidebar POI drops.
- Timeline blocks use pointer events so coarse pointers can drag after a dedicated handle press without turning ordinary scrolling into a drag.
- Keyboard users focus a block or unscheduled item, activate **Move**, choose a 15-minute slot with arrow keys, and confirm with Enter; Escape cancels.
- Drop zones expose visible focus and drag-over states.

## Overlap detection

Overlap detection is a pure client utility over scheduled assignment intervals.

- Intervals overlap when `startA < endB && startB < endA`.
- Touching boundaries do not overlap.
- Every overlapping block receives a warning treatment and accessible label.
- Overlaps are allowed and saved.
- A compact warning above the grid states how many activities overlap.
- Lane calculation is deterministic so blocks do not jump horizontally between renders.

Server timing validation does not reject overlaps because parallel activities can be intentional.

## Data flow and state updates

```text
Place form
  -> places create/update API
  -> places.duration_minutes

POI or assignment drag
  -> timeline resolves snapped start
  -> create assignment when needed
  -> assignment time API (start supplied, end omitted)
  -> server timing helper chooses current actual duration or POI recommendation
  -> day_assignments start/end override update
  -> returned assignment replaces optimistic state
  -> timeline recomputes positions, lanes, and overlap warnings
```

The time endpoint returns the full assignment projection. A focused store action applies the returned assignment to `assignments[dayId]`; components must not patch only the embedded place times independently.

WebSocket assignment events must preserve `assignment_time` and `assignment_end_time`. Existing remote-event merge behavior remains the model for collaborative updates.

## Validation and errors

- Recommended duration must be an integer from 5 to 1,440 minutes.
- Starts must be valid `00:00`–`23:59` values. Ends use the same range and may additionally be the exact end-of-day sentinel `24:00`.
- Explicit end must be later than start.
- Automatically derived or preserved end must not exceed `24:00`.
- A past-midnight drop is rejected with guidance to choose an earlier start or shorter duration.
- Network failures restore the prior scheduled position.
- A failure after creating a new assignment leaves it unscheduled and refreshes that day.
- Permission checks continue to use existing `place_edit` and `day_edit` capabilities.
- Read-only users can view the timeline but do not receive drag handles or mutation actions.

## Component boundaries

### Shared timing utility

A module in the shared workspace provides pure functions for parsing, formatting, adding, and comparing same-day minute values. Client and server import the same implementation; it performs no environment-specific work and accepts `24:00` only as an interval end.

### Server assignment timing

`assignmentService.updateTime` loads effective current times and POI duration, resolves the requested interval, validates it, updates both override columns, preserves chronological auto-sort behavior, and returns the refreshed assignment.

### Place duration field

`PlaceFormModal` owns form input and conversion. Shared place schemas define the accepted duration. Place service creation/update preserves valid zero-free integer semantics rather than relying on truthiness.

### Timeline model

A pure client module maps assignments to scheduled/unscheduled entries, pixel positions, overlap groups, and lanes. It has no React or network dependencies.

### Timeline UI

`DayTimelinePlanner` renders controls, tray, grid, blocks, drag preview, and warnings. It receives selected-day assignments and callback interfaces for create/update/edit, keeping trip-store and API orchestration in the planner hook/page layer.

## Testing

### Shared and server tests

- Duration schema accepts 5, 60, and 1,440; rejects fractional, zero, negative, and values above 1,440.
- First scheduling derives end from POI recommendation.
- Moving a scheduled assignment preserves actual duration.
- Explicit end overrides recommendation.
- Explicit null clears timing.
- Invalid time and past-midnight derivation fail without partial updates.
- Assignment API response contains the stored override and effective embedded times.
- Existing chronological auto-sort still runs after a successful timed update.

### Client model tests

- Snap pointer positions to 15-minute slots.
- Partition scheduled and unscheduled assignments.
- Compute block top/height from time and duration.
- Detect overlap but not touching boundaries.
- Allocate deterministic overlap lanes.
- Expand the visible grid for pre-06:00 assignments.

### Component tests

- Place form creates and updates recommended duration.
- Mode switch preserves existing List view behavior.
- No selected day shows the prompt.
- POI drop creates and schedules an assignment.
- Failure during scheduling leaves a new item Unscheduled.
- Unscheduled drop sets a start without an explicit end.
- Scheduled drag preserves duration through the API response.
- Drop into Unscheduled clears both times.
- Overlap warnings and accessible labels render.
- Read-only and touch/pointer behavior use the correct controls.
- Keyboard move can schedule, move, cancel, and confirm.

### Verification

- Run focused shared, server assignment-service/API, timeline-model, and component tests during TDD.
- Run shared/server/client type checks and relevant lint checks.
- Run the complete affected workspace test suites with hardware-appropriate timeouts.
- Build the client.
- Launch the local development stack, exercise the feature with a real trip, and inspect desktop and narrow/coarse-pointer screenshots.
- Confirm List view drag/reorder, place editing, route rendering, and assignment manual time editing still work.

## Acceptance criteria

1. A user can set and later edit a recommended duration on any POI.
2. A user can switch between the existing List planner and a selected-day Timeline planner.
3. A saved POI can be dragged from the Places sidebar onto a timeline slot.
4. The resulting assignment receives the dropped start and an automatic end based on its recommendation.
5. An unscheduled assignment can be dragged into the grid and receives derived timing.
6. A scheduled assignment can be dragged to a new time while retaining its actual duration.
7. A scheduled assignment can be returned to Unscheduled.
8. Overlaps are allowed, visible, and accessible.
9. Invalid and past-midnight placements do not corrupt assignment state.
10. Manual assignment times remain authoritative.
11. Read-only users can view but cannot mutate the timeline.
12. Existing List planner behavior remains available and passes regression tests.
