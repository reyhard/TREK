# Timeline Context and Recommended-Duration MCP Design

**Status:** Approved through the user's request to execute automatically

**Date:** 2026-08-08
**Repository:** `mauriceboe/TREK`

## Summary

The selected-day Timeline currently shows only POI assignments. Its cards use the global white card background, while the List view uses lighter category and selection treatments. Route state, transport reservations, and day notes already exist in the page and List planner, but the Timeline wrapper does not pass them through. The places MCP can update one duration at a time, or apply one identical duration to many places, but cannot submit different model-recommended durations in one safe operation.

This change adds an honest model-assisted MCP workflow for recommended visit durations, aligns activity-card color treatment with the List view, shows transport and note context in Timeline, and exposes focused route controls. It reuses current data and page state; no migration or new route engine is needed.

## Goals

1. Let an MCP client create a POI with `duration_minutes`.
2. Let a model apply different recommended durations to many existing POIs in one atomic MCP call.
3. Keep the MCP server deterministic and clearly describe that the calling model supplies the estimates.
4. Replace Timeline's opaque white activity fill with a subtle category tint and existing selected-state treatment.
5. Show transports and notes for the selected day without making them assignment drag targets.
6. Show timed context on the time grid and untimed context in a compact context tray.
7. Add Route on/off and walking/driving profile controls that reuse the Trip Planner's existing route state.
8. Preserve current List behavior, POI scheduling, overlap warnings, and assignment drag interactions.

## Non-goals

- The MCP server will not call an LLM or claim that it inferred a duration itself.
- The new duration batch will not silently skip unknown or cross-trip place IDs.
- Timeline transport and note entries will not be reorderable or draggable in this iteration.
- Timeline will not duplicate List-only optimization, connector, PDF, ICS, or full reservation-management controls.
- Route calculation and map rendering will not be reimplemented inside Timeline.
- Notes without a strict clock time and middle-day transport spans will not receive invented times.

## MCP duration workflow

`create_place` and `create_and_assign_place` accept the shared `durationMinutesSchema` (`5..1440`, whole minutes) and forward the value to the existing `createPlace` service. Omission keeps the existing 60-minute default.

A new write tool, `apply_recommended_durations`, accepts:

```ts
{
  tripId: number;
  recommendations: Array<{
    placeId: number;
    duration_minutes: number;
  }>;
}
```

The tool description directs the calling model to inspect `list_places`, estimate a reasonable visit duration for each requested place, and submit the estimates. The array contains 1 through 500 entries. Duplicate IDs, invalid durations, missing places, and places belonging to another trip reject the whole call. The service preflights and updates inside one SQLite transaction, then the MCP handler broadcasts `place:updated` only after commit. The result reports the updated count and IDs.

The service exposes `PlaceDurationBatchError` with a stable `code` of `INVALID_RECOMMENDATION`, `DUPLICATE_PLACE_ID`, or `PLACE_NOT_FOUND`. Defensive service validation uses the first two codes; a failed trip-membership preflight uses `PLACE_NOT_FOUND` without revealing whether an ID exists in another trip. The MCP handler returns the safe error message only for this class and returns `Failed to apply recommended durations.` for an unexpected database error.

The existing `bulk_update_places` remains unchanged because its intentional skip semantics and same-value contract are useful for other bulk edits but unsuitable for a strict heterogeneous recommendation batch.

## Timeline context projection

The pure Timeline model gains a context projection that consumes the selected day, ordered days, reservations, and notes.

- It reuses `getTransportForDay`, `getSpanPhase`, and existing multi-leg expansion from `dayMerge.ts`.
- It accepts strict `HH:MM` or `YYYY-MM-DDTHH:MM` values. ISO-local values may add seconds, fractional seconds, and `Z` or a numeric offset; the written clock portion is used without timezone conversion because reservation day IDs already select the local trip day. The date prefix is lexically validated but is not used to reassign a record.
- A single-day transport with a valid start and later end uses its real interval. With only a valid start it becomes a marker at the start; with only a valid end it becomes an arrival marker at the end.
- A multi-day start phase uses only its departure/start clock, an end phase uses only its arrival/end clock, and a middle phase is untimed. A clock from another phase is never borrowed.
- A timed transport or note marker normally spans 15 semantic minutes with the existing 30-pixel minimum visual height. A marker after 23:45 is clamped backward to the final 15-minute slot `23:45..24:00`; no zero-length marker is emitted.
- Middle-day transport spans, malformed or absent times, and untimed notes go to the context tray.
- Only reservation types in the existing `TRANSPORT_TYPES` set are projected. Timeline passes an empty assignment-linked exclusion list because, unlike List, it has no booking badge on the POI card; this keeps linked trains and buses visible without admitting ordinary bookings.
- Transport entries have stable keys that distinguish expanded flight/train legs and retain both the projected leg record for display and the original reservation for callbacks.
- The grid start expands upward for earlier activity or context entries.

A generic visual-lane pass operates across scheduled POIs and scheduled context entries so cards do not cover one another. It sorts by start minute, end minute, then stable key and returns keyed placements with top, height, lane, and lane count. Activity-only semantic overlap detection remains unchanged: transport or notes do not create false "overlapping activities" warnings.

## Timeline presentation

### Activity cards

Activity cards keep the category-colored border. Their background becomes a low-opacity mix of the category color and transparent; a selected card uses `var(--bg-selected)`. This matches the visual language of the List and remains theme-aware. Existing text, edit, move, remove-time, and overlap controls remain intact.

### Transport entries

Transport cards use a subtle blue background and border, show the reservation title and selected-day time or interval, and are read-only with respect to Timeline scheduling. Activation resolves the original reservation by ID. If `safeTransitMeta(original)` identifies a saved transit journey, it calls `onOpenTransit(original)`; otherwise an editable transport calls `onEditTransport(original)`. A synthetic flight or train leg is never sent to either callback.

### Note entries

Note cards use `var(--bg-hover)`, show the note icon/text and time when available, and do not expose assignment drag controls. They remain read-only context in this iteration; List mode continues to own note editing and reordering.

### Context tray

An **Other day context** tray under Unscheduled contains untimed notes and transports. It renders only when non-empty and is not a drop target. This keeps truthful context visible without fabricating clock positions.

## Route controls

A compact Timeline toolbar receives existing props from `DayPlanSidebar`:

- `routeShown`
- `routeProfile`
- `onToggleRoute`
- `onSetRouteProfile`
- optional `onPlanTransit`

The Route button is a pressed toggle. Walking and Driving buttons set the current profile and are disabled when no setter exists. If public-transit planning is available, a focused Plan transit action calls `onPlanTransit(day.id)`. These controls update the same page-level route/map state as List mode.

## Data flow

```text
Calling model -> list_places -> duration estimates
              -> apply_recommended_durations
              -> strict transaction -> place:updated broadcasts

TripPlannerPage route/reservations
DayPlanSidebar dayNotes
              -> Timeline wrapper props
              -> pure context projection + combined visual lanes
              -> activity, transport, and note cards

Timeline route toolbar -> existing page callbacks -> existing map route state
```

## Accessibility and interaction

- Scheduled context is labelled by kind, title, and time.
- Context entries are not draggable and never expose assignment movement controls.
- Clickable context cards are buttons with descriptive accessible names; read-only cards are labelled groups.
- Route/profile buttons expose `aria-pressed` state.
- Existing pointer, keyboard, and HTML drop behavior remains scoped to POI assignments.

## Failure behavior

- Invalid MCP inputs are rejected by Zod before service mutation.
- Any missing, duplicate, or cross-trip ID causes zero duration updates and zero broadcasts.
- Timeline omits malformed times from the grid and shows those entries in context instead.
- Absent optional route or edit callbacks leave controls disabled/hidden without crashing.
- A context projection failure is prevented through defensive parsing; existing activity scheduling remains independent.

## Acceptance criteria

1. Both MCP create tools persist a supplied valid recommended duration and reject invalid values.
2. One MCP call can atomically persist distinct durations for multiple places.
3. An invalid or foreign member prevents every update in that duration batch.
4. Timeline activity cards are category-tinted rather than opaque white, with a distinct selected treatment.
5. Selected-day transports and notes are visible in Timeline; valid times place them on the grid and missing/invalid times place them in context.
6. Context entries cannot trigger POI move/edit-time behavior.
7. Route toggle and walking/driving profile controls call the same callbacks used by List mode.
8. Existing Timeline movement, overlap, List planner, server MCP, typecheck, and build tests remain green.
