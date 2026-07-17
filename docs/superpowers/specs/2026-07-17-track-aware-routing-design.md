# Track-Aware Routing and Movement Metrics Design

**Status:** Approved  
**Date:** 2026-07-17  
**Repository:** `mauriceboe/TREK`  
**Target path:** `docs/superpowers/specs/2026-07-17-track-aware-routing-design.md`

## Summary

TREK currently treats a POI containing imported GPX geometry as one ordinary routing waypoint located at the first GPX coordinate. The map then draws the imported geometry independently. When day routing is enabled, OSRM therefore calculates and draws another route across the trail instead of routing only to the trail start and from the trail end.

This design introduces a shared, client-side day movement plan. A track POI becomes intrinsic movement with an entry anchor, an exit anchor, geometry-derived distance, and a duration derived from the POI start/end times or a mode-based estimate. OSRM calculates only external connectors around the track.

The selected-day map route and sidebar connector calculations consume the same movement-plan rules. No database migration or server API change is required.

## Goals

1. Route to the first coordinate of a valid imported track.
2. Follow the stored track geometry without requesting an OSRM route across it.
3. Resume routing from the last track coordinate.
4. Calculate track distance from stored geometry.
5. Use `end_time - place_time` as track duration when both form a positive same-day interval.
6. Otherwise estimate duration from distance and the track POI's own movement mode.
7. Ensure the global day route profile affects routed connectors only.
8. Make map and sidebar routing share one pure planning implementation.
9. Preserve transport breaks, hotel timing, transfer days, cancellation, caching, distance-unit refresh, and straight-line fallback.
10. Make transit-only days route-tool eligible independently of ordinary-place count, addressing issue `#1570`.
11. Expose source, mode/profile, distance, and duration for future walking/driving statistics without adding that UI now.

## Non-goals

- No dashboard, daily-total, or trip-total statistics widget.
- No server-side routing or schema migration.
- No GPX timestamp preservation or pause detection.
- No automatic or manual track reversal.
- No exact GPX reproduction in a Google Maps directions URL.
- No cycling option added to the current connector-profile UI.
- No redesign of Leaflet or Mapbox/MapLibre track styling.
- No changes to reservation persistence, PDF, calendar, MCP, or shared-trip persistence.

## User-visible behavior

### Track between ordinary places

```text
POI A
  └─ OSRM connector
track start
  ══ stored GPX geometry
track end
  └─ OSRM connector
POI B
```

The track is drawn once by the existing GPX layer. The routed geometry contains only the approach and departure connectors.

### Track at the start or end

A morning hotel connector targets the first track coordinate and uses `place_time` for hotel timing rules. An evening hotel connector starts from the last track coordinate and uses `end_time ?? place_time`.

### Consecutive tracks

```text
track A start ══ track A end ── OSRM ── track B start ══ track B end
```

### Loop track

When first and last coordinates are equal, the track remains valid intrinsic movement. External connectors approach and depart from the same location.

### Malformed geometry

Invalid JSON or fewer than two valid points causes ordinary-place behavior using stored `lat`/`lng`.

### Route disabled

Stored GPX geometry remains visible as today. OSRM connector geometry and connector labels are hidden.

## Track metric rules

### Geometry

`route_geometry` remains backward-compatible JSON containing `[lat, lng]` or `[lat, lng, elevation]` rows. Invalid rows are filtered; at least two valid points are required.

Distance is the sum of Haversine distance between consecutive points. Elevation gain/loss and min/max are derived in the same shared utility used by the inspector.

### Duration

1. Parse `place_time` and `end_time`.
2. If both are valid and `end_time > place_time`, use the difference.
3. Otherwise estimate from distance and normalized track mode.
4. Do not also add `duration_minutes`.
5. Do not infer overnight movement when end is earlier than or equal to start.

```ts
type TrackDurationSource = 'poi-times' | 'estimated'

const TRACK_SPEED_METERS_PER_SECOND = {
  walking: 5000 / 3600,
  cycling: 15000 / 3600,
  driving: 50000 / 3600,
} as const
```

Mode normalization:

| Stored mode | Track mode |
|---|---|
| `walking`, `walk`, missing, unknown | `walking` |
| `cycling`, `bicycle`, `bike` | `cycling` |
| `driving`, `car` | `driving` |

Imported GPX tracks already default to walking.

## Route-profile invariant

The active day route profile controls routed connectors only.

- Driving profile: approach/departure connectors use driving OSRM.
- Walking profile: approach/departure connectors use walking OSRM.
- Track geometry, distance, scheduled duration, and fallback mode do not change.

The implementation must not treat legacy `walkingText` and `drivingText` fields as simultaneous authoritative alternatives. `durationText` represents the profile used for that OSRM request.

## Shared movement model

Create `client/src/utils/dayMovementPlan.ts`.

```ts
export type ConnectorProfile = 'driving' | 'walking' | 'cycling'

export interface MovementAnchor {
  lat: number
  lng: number
  source:
    | 'place'
    | 'track-start'
    | 'track-end'
    | 'transport-from'
    | 'transport-to'
    | 'accommodation'
  assignmentId?: number
  reservationId?: number
  placeId?: number
}

export type ConnectorPlacement =
  | { kind: 'after-assignment'; assignmentId: number }
  | { kind: 'after-reservation'; reservationId: number }
  | { kind: 'hotel-top'; dayId: number; name: string }
  | { kind: 'hotel-bottom'; dayId: number; name: string }

export interface PlannedRoutedPart {
  kind: 'routed'
  key: string
  from: MovementAnchor
  to: MovementAnchor
  placement: ConnectorPlacement
}

export interface TrackMovementPart {
  kind: 'track'
  key: string
  assignmentId: number
  placeId: number
  from: MovementAnchor
  to: MovementAnchor
  geometry: [number, number][]
  mode: 'walking' | 'cycling' | 'driving'
  distance: number
  duration: number
  durationSource: 'poi-times' | 'estimated'
}

export interface TransitMovementPart {
  kind: 'transit'
  key: string
  reservationId: number
}

export type PlannedMovementPart =
  | PlannedRoutedPart
  | TrackMovementPart
  | TransitMovementPart

export interface DayMovementPlan {
  dayId: number
  parts: PlannedMovementPart[]
  hasRoutedConnectors: boolean
  hasTracks: boolean
  hasTransit: boolean
}
```

The plan is pure and performs no network requests.

## Full-place lookup

The assignment projection does not reliably carry `route_geometry`. The planner joins `assignment.place.id` to the full `places` store.

- Use the full place when found.
- Fall back to embedded assignment data for ordinary coordinates/times.
- Do not change the assignment API projection solely for this feature.
- Rebuild when geometry, coordinates, times, or mode change.

## Planning algorithm

Process assignments and transport reservations in effective timeline order while maintaining a cursor containing the previous exit anchor and connector placement.

### Ordinary place

- Add a connector from the cursor to the place coordinate.
- Set cursor to that coordinate with `after-assignment` placement.

### Track place

- Add a connector from the cursor to the first track coordinate.
- Add one track part.
- Set cursor to the final track coordinate with `after-assignment` placement.

This makes the next connector appear after the track summary.

### Located transport

- Route from the cursor to its `from` endpoint when present.
- Add a `TransitMovementPart` only when `reservation.type === 'transit'`, so automated-transit visibility can be gated independently.
- All located transport types still break external routing; never route across the transport itself.
- Continue from its `to` endpoint using `after-reservation` placement.
- Preserve the prevention of phantom road routes between consecutive transport endpoints (`#1394`).

### Transport without endpoints

- Do not break the external route.
- Re-key connector placement to `after-reservation`.
- Do not re-key a car-rental middle-day connector to a row that is not rendered (`#1504`).

### Hotel bookends

- Morning edge uses a track's first coordinate and `place_time`.
- Evening edge uses a track's final coordinate and `end_time ?? place_time`.
- Continue using `getDayBookendHotels`, `shouldDrawMorningLeg`, and `shouldDrawEveningLeg`.
- Preserve distinct-hotel transfer-day behavior and fixes `#1321`/`#1465`.

## OSRM resolver

Create `client/src/utils/resolveDayMovementPlan.ts`.

It groups consecutive routed parts, calls `calculateRouteWithLegs` once per group, maps returned legs to part keys, and returns routed polylines. Track and transit parts remain unchanged.

```ts
export interface ResolvedRoutedPart extends PlannedRoutedPart {
  profile: ConnectorProfile
  geometry: [number, number][]
  distance: number | null
  duration: number | null
  routeSegment: RouteSegment | null
}

export type ResolvedMovementPart =
  | ResolvedRoutedPart
  | TrackMovementPart
  | TransitMovementPart

export interface ResolvedDayMovementPlan {
  dayId: number
  parts: ResolvedMovementPart[]
  routedPolylines: [number, number][][]
}
```

On non-abort OSRM failure, use straight connector geometry and leave connector stats unavailable. On abort, preserve current cancellation semantics.

## Map integration

`useRouteCalculation` consumes the planner/resolver and continues exposing current route state. It additionally exposes resolved movement parts and eligibility metadata.

`route` contains routed connector polylines only. Existing Leaflet and Mapbox/MapLibre GPX layers remain responsible for drawing `route_geometry` once.

## Sidebar integration

The sidebar uses the same planner/resolver for each route-enabled day, then indexes resolved connectors by placement and tracks by assignment.

A track row renders:

```text
[Track POI]
🥾 3 h 20 min · 14.2 km
[connector from trail end to next item]
```

Create `DayPlanSidebarTrackSummary`. It receives the track part directly and never receives the global route profile.

## Route eligibility and transit issue #1570

Route tools are available when the plan contains a routed connector, a route-controlled transit journey, or an accommodation-only transfer connector. Eligibility must not depend only on ordinary-place count.

A lone track without external connectors does not require the route toggle because GPX remains visible and inspector stats remain available.

## Google Maps export

Export movement anchors rather than only POI coordinates:

```text
previous POI → track start → track end → next POI
```

Deduplicate adjacent equal coordinates. Preserve valid hotel inclusion/exclusion. Do not export transport-internal geometry as road waypoints.

## Route optimization

Until optimization supports oriented segments:

- valid track assignments are fixed;
- timed and manually locked assignments remain fixed;
- only ordinary untimed unlocked point assignments are optimized;
- hotel optimization anchors remain unchanged.

## Future walking/driving statistics

No aggregate UI is added. Resolved movement parts provide kind, owner, profile/mode, distance, duration, and geometry/endpoints.

Future aggregation rules:

- count each track once under its own mode;
- count connectors under the active route profile;
- ignore unresolved connector metrics;
- do not derive totals from legacy alternate text fields;
- keep transit totals separate unless reliable metrics exist.

## Error handling

| Condition | Behavior |
|---|---|
| Invalid JSON or fewer than two points | Ordinary-place fallback |
| Missing/invalid times | Mode-based estimate |
| End earlier/equal to start | Mode-based estimate |
| Unknown track mode | Walking fallback |
| OSRM failure | Straight connector, no connector stats |
| Abort | Newer calculation owns state |
| Full place missing | Embedded ordinary point |
| Equal track start/end | Valid loop track |

## Files

### New

- `client/src/utils/trackGeometry.ts`
- `client/src/utils/dayMovementPlan.ts`
- `client/src/utils/resolveDayMovementPlan.ts`
- `client/src/components/Planner/DayPlanSidebarTrackSummary.tsx`
- corresponding utility tests

### Modified

- `client/src/components/Map/RouteCalculator.ts` — export the existing duration/distance formatters for the track summary; no routing behavior change.
- `client/src/hooks/useRouteCalculation.ts`
- `client/src/components/Planner/DayPlanSidebar.tsx`
- `client/src/components/Planner/PlaceInspector.tsx`
- route-hook, sidebar, inspector, and map tests

### Intentionally unchanged

- database/migrations and server services;
- GPX import persistence;
- shared place/assignment schemas;
- Leaflet and GL GPX rendering behavior;
- reservations, MCP, PDF, and calendar persistence.

## Acceptance criteria

1. No OSRM line is drawn across a valid imported track.
2. Routing approaches the first point and departs from the last.
3. Track distance comes from geometry.
4. Track duration uses positive POI interval, otherwise track-mode estimate.
5. Profile switching changes connectors only.
6. Map and sidebar use identical endpoint/hotel rules.
7. The track is displayed once in both map providers.
8. Existing hotel timing behavior remains correct.
9. Existing transport-break and car-middle-day behavior remains correct.
10. Transit-only route controls and overlay work without ordinary places.
11. Google Maps export contains both track endpoints.
12. Optimization does not reorder valid tracks.
13. No schema migration is introduced.
14. Client tests, typecheck, lint, and build pass.
