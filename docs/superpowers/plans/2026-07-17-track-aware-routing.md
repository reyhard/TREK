# Track-Aware Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route to and from imported track endpoints while using stored trail geometry and POI-derived trail metrics without conflicting with connector walking/driving profiles.

**Architecture:** Add a pure track-metrics utility, a pure ordered day movement planner, and an asynchronous OSRM resolver. Refactor both `useRouteCalculation` and `DayPlanSidebar` to consume those shared units while keeping the existing Leaflet and GL GPX layers responsible for rendering the stored track once.

**Tech Stack:** TypeScript 6, React 19, Zustand, Vitest 4, React Testing Library, existing OSRM `RouteCalculator`, Leaflet, Mapbox GL/MapLibre GL.

## Global Constraints

- No server, database, migration, or shared API schema changes.
- Positive `place_time`→`end_time` interval is authoritative track duration.
- Otherwise estimate from geometry and the track POI's own movement mode.
- Day route profile affects routed connectors only.
- Routed polylines must exclude stored track geometry.
- Preserve hotel behavior from `#1321` and `#1465`.
- Preserve phantom transport-road suppression from `#1394`.
- Preserve car middle-day connector placement from `#1504`.
- Fix transit-only route eligibility described by `#1570`.
- Valid track assignments are fixed during optimization.
- Do not add aggregate day/trip statistics UI.
- Use TDD and commit after each independently passing task.
- Create an isolated worktree with `superpowers:using-git-worktrees` before implementation.

---

## File Structure

### Create

- `client/src/utils/trackGeometry.ts`
- `client/src/utils/dayMovementPlan.ts`
- `client/src/utils/resolveDayMovementPlan.ts`
- `client/src/components/Planner/DayPlanSidebarTrackSummary.tsx`
- `client/tests/unit/utils/trackGeometry.test.ts`
- `client/tests/unit/utils/dayMovementPlan.test.ts`
- `client/tests/unit/utils/resolveDayMovementPlan.test.ts`

### Modify

- `client/src/components/Map/RouteCalculator.ts` — export existing `formatRouteDistance` and `formatDuration` helpers.
- `client/src/hooks/useRouteCalculation.ts`
- `client/src/components/Planner/DayPlanSidebar.tsx`
- `client/src/components/Planner/PlaceInspector.tsx`
- `client/tests/integration/hooks/useRouteCalculation.test.ts`
- `client/src/components/Planner/DayPlanSidebar.test.tsx`
- `client/src/components/Planner/PlaceInspector.test.tsx`
- `client/src/components/Map/MapView.test.tsx`

---

## Task 1: Shared Track Geometry and Duration Utility

**Files:**
- Create: `client/src/utils/trackGeometry.ts`
- Test: `client/tests/unit/utils/trackGeometry.test.ts`

**Interfaces:**
- Produces `parseTrackGeometry`, `getTrackMovement`, `normalizeTrackMode`.
- Uses meters and seconds internally.

- [ ] **Step 1: Write the failing unit test file**

```ts
import { describe, expect, it } from 'vitest'
import {
  getTrackMovement,
  normalizeTrackMode,
  parseTrackGeometry,
} from '../../../src/utils/trackGeometry'

describe('trackGeometry', () => {
  it('parses coordinates and calculates distance/elevation', () => {
    const parsed = parseTrackGeometry(JSON.stringify([
      [52, 5, 10],
      [52, 5.01, 25],
      [52, 5.02, 20],
    ]))

    expect(parsed).not.toBeNull()
    expect(parsed?.coordinates).toEqual([
      [52, 5],
      [52, 5.01],
      [52, 5.02],
    ])
    expect(parsed?.distance).toBeGreaterThan(1300)
    expect(parsed?.distance).toBeLessThan(1400)
    expect(parsed?.elevationGain).toBe(15)
    expect(parsed?.elevationLoss).toBe(5)
    expect(parsed?.minElevation).toBe(10)
    expect(parsed?.maxElevation).toBe(25)
  })

  it.each([
    null,
    '',
    'not-json',
    '[]',
    JSON.stringify([[52, 5]]),
    JSON.stringify([[null, 5], [52, 5]]),
  ])('rejects malformed or insufficient geometry: %s', (raw) => {
    expect(parseTrackGeometry(raw)).toBeNull()
  })

  it('uses a positive POI interval', () => {
    const movement = getTrackMovement({
      id: 9,
      route_geometry: JSON.stringify([[52, 5], [52, 5.01]]),
      place_time: '09:15',
      end_time: '11:45',
      transport_mode: 'walking',
    })
    expect(movement?.duration).toBe(2.5 * 3600)
    expect(movement?.durationSource).toBe('poi-times')
  })

  it.each([
    { place_time: null, end_time: null },
    { place_time: '09:00', end_time: null },
    { place_time: '12:00', end_time: '09:00' },
    { place_time: '09:00', end_time: '09:00' },
  ])('estimates invalid or missing intervals: %o', (times) => {
    const movement = getTrackMovement({
      id: 10,
      route_geometry: JSON.stringify([[52, 5], [52, 5.01]]),
      transport_mode: 'walking',
      ...times,
    })
    expect(movement?.durationSource).toBe('estimated')
    expect(movement?.duration).toBeGreaterThan(0)
  })

  it('normalizes modes and defaults unknown to walking', () => {
    expect(normalizeTrackMode('walking')).toBe('walking')
    expect(normalizeTrackMode('bike')).toBe('cycling')
    expect(normalizeTrackMode('bicycle')).toBe('cycling')
    expect(normalizeTrackMode('car')).toBe('driving')
    expect(normalizeTrackMode('spaceship')).toBe('walking')
    expect(normalizeTrackMode(null)).toBe('walking')
  })

  it('uses track mode for fallback duration', () => {
    const geometry = JSON.stringify([[52, 5], [52, 5.01]])
    const walking = getTrackMovement({
      id: 1,
      route_geometry: geometry,
      transport_mode: 'walking',
    })
    const cycling = getTrackMovement({
      id: 2,
      route_geometry: geometry,
      transport_mode: 'cycling',
    })
    expect(walking?.duration).toBeGreaterThan(cycling?.duration ?? Infinity)
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

```bash
npm run test --workspace=client -- client/tests/unit/utils/trackGeometry.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `trackGeometry.ts`**

```ts
export type TrackMode = 'walking' | 'cycling' | 'driving'
export type TrackDurationSource = 'poi-times' | 'estimated'

export interface TrackPlaceLike {
  id: number
  route_geometry?: string | null
  place_time?: string | null
  end_time?: string | null
  transport_mode?: string | null
}

export interface ParsedTrackGeometry {
  coordinates: [number, number][]
  elevations: Array<number | null>
  start: [number, number]
  end: [number, number]
  distance: number
  minElevation: number | null
  maxElevation: number | null
  elevationGain: number
  elevationLoss: number
}

export interface TrackMovementMetrics extends ParsedTrackGeometry {
  mode: TrackMode
  duration: number
  durationSource: TrackDurationSource
}

const SPEED: Record<TrackMode, number> = {
  walking: 5000 / 3600,
  cycling: 15000 / 3600,
  driving: 50000 / 3600,
}

const rad = (degrees: number) => degrees * Math.PI / 180

const haversine = (a: [number, number], b: [number, number]) => {
  const [lat1, lng1] = a
  const [lat2, lng2] = b
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

const parseClockMinutes = (value: string | null | undefined) => {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

export function normalizeTrackMode(mode: string | null | undefined): TrackMode {
  switch ((mode || '').trim().toLowerCase()) {
    case 'cycling':
    case 'bicycle':
    case 'bike':
      return 'cycling'
    case 'driving':
    case 'car':
      return 'driving'
    default:
      return 'walking'
  }
}

export function parseTrackGeometry(raw: string | null | undefined): ParsedTrackGeometry | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(value)) return null

  const points = value.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 2) return []
    const lat = Number(row[0])
    const lng = Number(row[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
    const elevation =
      row.length >= 3 && Number.isFinite(Number(row[2])) ? Number(row[2]) : null
    return [{ coordinate: [lat, lng] as [number, number], elevation }]
  })
  if (points.length < 2) return null

  let distance = 0
  let elevationGain = 0
  let elevationLoss = 0
  let minElevation: number | null = null
  let maxElevation: number | null = null

  points.forEach((point, index) => {
    if (index > 0) {
      distance += haversine(points[index - 1].coordinate, point.coordinate)
      const previous = points[index - 1].elevation
      if (previous != null && point.elevation != null) {
        const delta = point.elevation - previous
        if (delta > 0) elevationGain += delta
        if (delta < 0) elevationLoss += Math.abs(delta)
      }
    }
    if (point.elevation != null) {
      minElevation = minElevation == null ? point.elevation : Math.min(minElevation, point.elevation)
      maxElevation = maxElevation == null ? point.elevation : Math.max(maxElevation, point.elevation)
    }
  })

  const coordinates = points.map((point) => point.coordinate)
  return {
    coordinates,
    elevations: points.map((point) => point.elevation),
    start: coordinates[0],
    end: coordinates[coordinates.length - 1],
    distance,
    minElevation,
    maxElevation,
    elevationGain,
    elevationLoss,
  }
}

export function getTrackMovement(place: TrackPlaceLike): TrackMovementMetrics | null {
  const geometry = parseTrackGeometry(place.route_geometry)
  if (!geometry) return null
  const start = parseClockMinutes(place.place_time)
  const end = parseClockMinutes(place.end_time)
  const scheduled = start != null && end != null && end > start ? (end - start) * 60 : null
  const mode = normalizeTrackMode(place.transport_mode)
  return {
    ...geometry,
    mode,
    duration: scheduled ?? geometry.distance / SPEED[mode],
    durationSource: scheduled == null ? 'estimated' : 'poi-times',
  }
}
```

- [ ] **Step 4: Run focused test, typecheck, and commit**

```bash
npm run test --workspace=client -- client/tests/unit/utils/trackGeometry.test.ts
npm run typecheck --workspace=client
git add client/src/utils/trackGeometry.ts client/tests/unit/utils/trackGeometry.test.ts
git commit -m "feat(planner): add shared track movement metrics"
```

Expected: tests and typecheck PASS.

---

## Task 2: Pure Ordered Day Movement Planner

**Files:**
- Create: `client/src/utils/dayMovementPlan.ts`
- Test: `client/tests/unit/utils/dayMovementPlan.test.ts`

**Interfaces:**
- Consumes track utility, day transport helpers, and hotel bookend helpers.
- Produces `buildDayMovementPlan`, `hasDayRouteTools`, movement part types, and `movementPlanWaypoints`.

- [ ] **Step 1: Write failing planner tests**

Create tests with these exact arrangements and assertions:

```ts
it('ordinary A → B produces one routed part', () => {
  expect(plan.parts.map((part) => part.kind)).toEqual(['routed'])
  expect(routed.from).toMatchObject({ lat: a.lat, lng: a.lng })
  expect(routed.to).toMatchObject({ lat: b.lat, lng: b.lng })
})

it('A → track → B produces routed, track, routed', () => {
  expect(plan.parts.map((part) => part.kind)).toEqual(['routed', 'track', 'routed'])
  expect(approach.to).toMatchObject({ lat: 52.01, lng: 5.01 })
  expect(trackPart.to).toMatchObject({ lat: 52.03, lng: 5.03 })
  expect(departure.from).toMatchObject({ lat: 52.03, lng: 5.03 })
  expect(departure.placement).toEqual({ kind: 'after-assignment', assignmentId: trackAssignment.id })
})

it('consecutive tracks route only between exit and entry anchors', () => {
  expect(plan.parts.map((part) => part.kind)).toEqual(['track', 'routed', 'track'])
  expect(connector.from).toMatchObject({ lat: trackAEndLat, lng: trackAEndLng })
  expect(connector.to).toMatchObject({ lat: trackBStartLat, lng: trackBStartLng })
})

it('malformed geometry behaves as an ordinary point', () => {
  expect(plan.parts.map((part) => part.kind)).toEqual(['routed'])
})
```

Also add concrete tests for:

- loop track is a valid `track` part;
- located transit produces approach connector, transit part, departure connector;
- consecutive transports do not create a routed part between transport endpoints;
- endpoint-less transport changes connector placement to `after-reservation`;
- car middle day does not re-key to a hidden row;
- morning hotel targets track start;
- evening hotel departs track end and evaluates `end_time`;
- distinct hotel transfer day still creates a connector;
- transit-only plan sets `hasTransit` and `hasDayRouteTools(plan)` true;
- export waypoints include both track endpoints and deduplicate adjacent equal points.

- [ ] **Step 2: Run tests and verify failure**

```bash
npm run test --workspace=client -- client/tests/unit/utils/dayMovementPlan.test.ts
```

Expected: FAIL because the planner does not exist.

- [ ] **Step 3: Implement movement types**

```ts
export interface MovementAnchor {
  lat: number
  lng: number
  source: 'place' | 'track-start' | 'track-end' | 'transport-from' | 'transport-to' | 'accommodation'
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

export interface TrackMovementPart extends Omit<TrackMovementMetrics, 'start' | 'end'> {
  kind: 'track'
  key: string
  assignmentId: number
  placeId: number
  from: MovementAnchor
  to: MovementAnchor
  geometry: [number, number][]
}

export interface TransitMovementPart {
  kind: 'transit'
  key: string
  reservationId: number
}
```

- [ ] **Step 4: Implement `buildDayMovementPlan`**

Implementation requirements:

1. Sort assignments by `order_index`.
2. Obtain transports through existing `getTransportForDay` semantics.
3. Sort places/transports by effective timeline position.
4. Join embedded places to `placesById` before calling `getTrackMovement`.
5. Maintain a cursor `{ anchor, placement }`.
6. Ordinary place: connector to point, then cursor at point.
7. Track: connector to first point, append track part, cursor at last point.
8. Located transport: connector to `from`, append a transit part only for `type === 'transit'`, then place the cursor at `to` or clear it.
9. Endpoint-less transport: update placement only; preserve car-middle exception.
10. Record edge stop entry/exit and start/end times.
11. Insert hotel-top and hotel-bottom parts using existing day-order helpers.
12. Return boolean flags.

Use stable keys containing placement kind/owner and endpoint coordinates. Do not key solely by array index.

- [ ] **Step 5: Implement `movementPlanWaypoints`**

```ts
export function movementPlanWaypoints(plan: DayMovementPlan) {
  const points: Array<{ lat: number; lng: number }> = []
  const push = (lat: number, lng: number) => {
    const previous = points[points.length - 1]
    if (previous?.lat === lat && previous.lng === lng) return
    points.push({ lat, lng })
  }
  for (const part of plan.parts) {
    if (part.kind === 'routed' || part.kind === 'track') {
      push(part.from.lat, part.from.lng)
      push(part.to.lat, part.to.lng)
    }
  }
  return points
}

export const hasDayRouteTools = (plan: DayMovementPlan) =>
  plan.hasRoutedConnectors || plan.hasTransit
```

- [ ] **Step 6: Run focused and existing regression tests**

```bash
npm run test --workspace=client -- client/tests/unit/utils/dayMovementPlan.test.ts
npm run test --workspace=client -- client/tests/integration/hooks/useRouteCalculation.test.ts
npm run typecheck --workspace=client
```

Expected: planner tests PASS and existing hook tests remain PASS before refactoring the hook.

- [ ] **Step 7: Commit**

```bash
git add client/src/utils/dayMovementPlan.ts client/tests/unit/utils/dayMovementPlan.test.ts
git commit -m "feat(planner): build ordered day movement plans"
```

---

## Task 3: OSRM Movement Resolver

**Files:**
- Create: `client/src/utils/resolveDayMovementPlan.ts`
- Test: `client/tests/unit/utils/resolveDayMovementPlan.test.ts`

**Interfaces:**
- Produces `resolveDayMovementPlan(plan, profile, signal?)` and resolved part types.

- [ ] **Step 1: Write failing resolver tests**

Test exact behavior:

1. Two consecutive routed parts become one OSRM call with three waypoints.
2. Returned leg 0 maps to routed part 0 and leg 1 to routed part 1.
3. A track part splits routed groups into two OSRM calls.
4. Driving and walking resolutions keep the same track object metrics.
5. Non-abort failure returns straight-line run geometry and null connector stats.
6. Abort error is rethrown.

Representative first test:

```ts
expect(calculateRouteWithLegs).toHaveBeenCalledWith(
  [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }],
  { signal: undefined, profile: 'driving' },
)
expect(resolved.routedPolylines).toEqual([[[1, 1], [2, 2], [3, 3]]])
expect(resolved.parts[0]).toMatchObject({ kind: 'routed', key: 'a-b', distance: 1000, duration: 200 })
expect(resolved.parts[1]).toMatchObject({ kind: 'routed', key: 'b-c', distance: 2000, duration: 400 })
```

- [ ] **Step 2: Run test and verify failure**

```bash
npm run test --workspace=client -- client/tests/unit/utils/resolveDayMovementPlan.test.ts
```

- [ ] **Step 3: Implement resolver types and grouping**

```ts
export interface ResolvedRoutedPart extends PlannedRoutedPart {
  profile: ConnectorProfile
  geometry: [number, number][]
  distance: number | null
  duration: number | null
  routeSegment: RouteSegment | null
}

export type ResolvedMovementPart = ResolvedRoutedPart | TrackMovementPart | TransitMovementPart

export interface ResolvedDayMovementPlan {
  dayId: number
  parts: ResolvedMovementPart[]
  routedPolylines: [number, number][][]
}
```

Group only adjacent `routed` parts whose previous `to` equals next `from`. Flush on track, transit, or discontinuity.

- [ ] **Step 4: Implement async resolution**

For each group:

```ts
const waypoints = [
  { lat: group[0].from.lat, lng: group[0].from.lng },
  ...group.map((part) => ({ lat: part.to.lat, lng: part.to.lng })),
]
const result = await calculateRouteWithLegs(waypoints, { signal, profile })
```

Map `result.legs[index]` to `group[index]`. On non-abort failure, use the waypoint array as one straight polyline and set `routeSegment`, `distance`, and `duration` to null. Rethrow `AbortError`.

- [ ] **Step 5: Run tests, typecheck, and commit**

```bash
npm run test --workspace=client -- client/tests/unit/utils/resolveDayMovementPlan.test.ts
npm run typecheck --workspace=client
git add client/src/utils/resolveDayMovementPlan.ts client/tests/unit/utils/resolveDayMovementPlan.test.ts
git commit -m "feat(planner): resolve movement connectors through OSRM"
```

Expected: PASS.

---

## Task 4: Refactor `useRouteCalculation`

**Files:**
- Modify: `client/src/hooks/useRouteCalculation.ts`
- Test: `client/tests/integration/hooks/useRouteCalculation.test.ts`

**Interfaces:**
- Consumes the shared planner/resolver.
- Adds `movementParts` and `routeEligibility` to the hook result.

- [ ] **Step 1: Add failing hook tests**

Create a three-assignment day: ordinary A, timed track, ordinary B. Assert two OSRM calls:

```ts
expect(calculateRouteWithLegs).toHaveBeenNthCalledWith(
  1,
  [{ lat: a.lat, lng: a.lng }, { lat: trackStartLat, lng: trackStartLng }],
  expect.objectContaining({ profile: 'driving' }),
)
expect(calculateRouteWithLegs).toHaveBeenNthCalledWith(
  2,
  [{ lat: trackEndLat, lng: trackEndLng }, { lat: b.lat, lng: b.lng }],
  expect.objectContaining({ profile: 'driving' }),
)
```

Assert:

- `route` contains two connector polylines only;
- `movementParts` contains one track part;
- `routeSegments` contains connector segments only;
- rerendering with walking changes profile calls but preserves track distance/duration/source;
- changing full-place geometry changes departure connector origin;
- invalid geometry uses ordinary point behavior;
- transit-only day sets `routeEligibility.hasTransit` true;
- existing `#1321`, `#1394`, `#1465`, transfer-day, cancellation, and distance-unit tests still pass.

- [ ] **Step 2: Verify failure**

```bash
npm run test --workspace=client -- client/tests/integration/hooks/useRouteCalculation.test.ts
```

- [ ] **Step 3: Replace local run building**

Inside `updateRouteForDay`:

1. Abort previous request.
2. Read current assignments, full places, reservations, and days from `useTripStore.getState()`.
3. Build `placesById`.
4. Call `buildDayMovementPlan`.
5. Set eligibility flags.
6. If no routed connectors, set `route` null, connector segments empty, and movement parts to the pure parts.
7. Immediately set straight connector geometry for responsiveness.
8. Resolve through `resolveDayMovementPlan`.
9. Set `route` from `routedPolylines`.
10. Set `routeSegments` from resolved routed parts with non-null `routeSegment`.
11. Set `movementParts` from the resolved plan.

Delete local `Entry`, transport run-building, `withHotelBookends`, and duplicate hotel logic only after tests pass.

- [ ] **Step 4: Add full-place recalculation signature**

Subscribe to full-place changes with `const placesForSignature = useTripStore((state) => state.places)`. The effect signature must include, for each selected assignment:

```ts
assignment.id
place.lat
place.lng
place.route_geometry
place.place_time
place.end_time
place.transport_mode
```

Build the memo from `placesForSignature`, embedded assignments, and `selectedDayId`; include the resulting signature in the route effect dependency list. Do not rely on `useTripStore.getState()` inside a memo without a subscribed dependency.

- [ ] **Step 5: Run hook tests and typecheck**

```bash
npm run test --workspace=client -- client/tests/integration/hooks/useRouteCalculation.test.ts
npm run typecheck --workspace=client
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/hooks/useRouteCalculation.ts client/tests/integration/hooks/useRouteCalculation.test.ts
git commit -m "fix(map): route around imported track geometry"
```

---

## Task 5: Refactor Sidebar Routing and Add Track Summary

**Files:**
- Create: `client/src/components/Planner/DayPlanSidebarTrackSummary.tsx`
- Modify: `client/src/components/Map/RouteCalculator.ts`
- Modify: `client/src/components/Planner/DayPlanSidebar.tsx`
- Test: `client/src/components/Planner/DayPlanSidebar.test.tsx`

**Interfaces:**
- Sidebar computes each route-enabled day through the shared planner/resolver.
- Track summary receives `TrackMovementPart` and no route-profile prop.

- [ ] **Step 1: Add failing sidebar tests**

Assert:

1. A timed walking track renders scheduled duration and geometry distance.
2. Track summary uses walking icon while connector profile is driving.
3. Following connector is rendered after the summary and starts at track end.
4. Switching profile changes connector text/icon but not track summary.
5. Two route-enabled mobile days keep separate movement indexes.
6. Hotel-top and hotel-bottom connectors retain positions.
7. Endpoint-less transport connector remains after reservation.
8. Car middle-day connector remains visible.

- [ ] **Step 2: Create `DayPlanSidebarTrackSummary`**

```tsx
import { Bike, Car, Clock3, Footprints } from 'lucide-react'
import type { TrackMovementPart } from '../../utils/dayMovementPlan'
import { formatRouteDistance, formatDuration } from '../Map/RouteCalculator'

export function DayPlanSidebarTrackSummary({ track }: { track: TrackMovementPart }) {
  const Icon = track.mode === 'cycling' ? Bike : track.mode === 'driving' ? Car : Footprints
  const source = track.durationSource === 'poi-times' ? 'Scheduled trail time' : 'Estimated trail time'
  return (
    <div data-testid={`track-summary-${track.assignmentId}`} title={source}>
      <Icon size={11} strokeWidth={2} />
      <Clock3 size={10} strokeWidth={2} />
      <span>{formatDuration(track.duration)}</span>
      <span aria-hidden>·</span>
      <span>{formatRouteDistance(track.distance)}</span>
    </div>
  )
}
```

Match the existing connector spacing/colors. Change the two existing declarations in `RouteCalculator.ts` to `export function formatRouteDistance(...)` and `export function formatDuration(...)`; do not alter their implementations or duplicate formatting logic.

- [ ] **Step 3: Replace sidebar's duplicate planner effect**

Use state:

```ts
type DayMovementUi = {
  assignmentConnectors: Record<number, RouteSegment>
  reservationConnectors: Record<number, RouteSegment>
  tracks: Record<number, TrackMovementPart>
  hotelTop?: { seg: RouteSegment; name: string }
  hotelBottom?: { seg: RouteSegment; name: string }
}

const [movementUiByDay, setMovementUiByDay] = useState<Record<number, DayMovementUi>>({})
```

For each `routeDayId`, build and resolve a plan using latest store data. Index resolved parts by connector placement. Keep existing abort and multi-day behavior. Recompute on route profile, distance unit, assignments, reservations, accommodations, days, and full-place geometry signature.

- [ ] **Step 4: Render track summary before departure connector**

```tsx
{movementUiByDay[day.id]?.tracks[assignment.id] && (
  <DayPlanSidebarTrackSummary track={movementUiByDay[day.id].tracks[assignment.id]} />
)}
{movementUiByDay[day.id]?.assignmentConnectors[assignment.id] && (
  <RouteConnector
    seg={movementUiByDay[day.id].assignmentConnectors[assignment.id]}
    profile={routeProfile}
  />
)}
```

Use indexed reservation and hotel fields for the existing connector render sites. Remove `routeLegs` and `hotelLegs` after tests pass.

- [ ] **Step 5: Run tests and commit**

```bash
npm run test --workspace=client -- client/src/components/Planner/DayPlanSidebar.test.tsx
npm run test --workspace=client -- client/tests/integration/hooks/useRouteCalculation.test.ts client/src/components/Planner/DayPlanSidebar.test.tsx
npm run typecheck --workspace=client
git add client/src/components/Map/RouteCalculator.ts client/src/components/Planner/DayPlanSidebarTrackSummary.tsx client/src/components/Planner/DayPlanSidebar.tsx client/src/components/Planner/DayPlanSidebar.test.tsx
git commit -m "feat(planner): show track movement in day routes"
```

Expected: PASS.

---

## Task 6: Route Eligibility, Transit-only Routing, Export, and Optimization

**Files:**
- Modify: `client/src/components/Planner/DayPlanSidebar.tsx`
- Test: sidebar and route-hook tests.

- [ ] **Step 1: Add failing transit-only eligibility test**

Create a day with no assignments and one saved transit reservation with endpoints/position. Assert the Route button is visible and enabling it causes `showTransitRoutes` to be true in the map wiring.

- [ ] **Step 2: Add failing export test**

Mock `generateGoogleMapsUrl`, click export, and assert the supplied waypoint list is:

```ts
[
  { lat: previous.lat, lng: previous.lng },
  { lat: trackStart.lat, lng: trackStart.lng },
  { lat: trackEnd.lat, lng: trackEnd.lng },
  { lat: next.lat, lng: next.lng },
]
```

Also assert adjacent equal points are emitted once.

- [ ] **Step 3: Add failing optimizer test**

Create ordinary A, untimed track, ordinary B. Mock `optimizeRoute` to reverse movable points. Assert the track assignment remains at its original index and is not passed as a movable point.

- [ ] **Step 4: Implement eligibility from pure plans**

Replace ordinary-place-count gates with `hasDayRouteTools(buildPlanForDay(day.id))`. Preserve accommodation-only transfer eligibility.

- [ ] **Step 5: Use `movementPlanWaypoints` for Google Maps export**

```ts
const plan = buildPlanForDay(day.id)
const url = generateGoogleMapsUrl(movementPlanWaypoints(plan))
if (url) window.open(url, '_blank', 'noopener,noreferrer')
```

- [ ] **Step 6: Fix optimizer locking**

Join assignments to full places, call `getTrackMovement`, and mark valid tracks fixed alongside timed or manually locked assignments.

```ts
const isTrack = getTrackMovement({
  id: place.id,
  route_geometry: place.route_geometry,
  place_time: place.place_time,
  end_time: place.end_time,
  transport_mode: place.transport_mode,
}) != null

if (lockedIds.has(assignment.id) || place.place_time || isTrack) {
  locked.set(index, assignment)
} else {
  unlocked.push(assignment)
}
```

- [ ] **Step 7: Run tests and commit**

```bash
npm run test --workspace=client -- client/src/components/Planner/DayPlanSidebar.test.tsx client/tests/integration/hooks/useRouteCalculation.test.ts
npm run typecheck --workspace=client
git add client/src/utils/dayMovementPlan.ts client/src/components/Planner/DayPlanSidebar.tsx client/src/components/Planner/DayPlanSidebar.test.tsx client/tests/integration/hooks/useRouteCalculation.test.ts
git commit -m "fix(planner): preserve track and transit route behavior"
```

Expected: PASS.

---

## Task 7: Reuse Metrics in Inspector and Verify Single Track Rendering

**Files:**
- Modify: `client/src/components/Planner/PlaceInspector.tsx`
- Test: `client/src/components/Planner/PlaceInspector.test.tsx`
- Test: `client/src/components/Map/MapView.test.tsx`

- [ ] **Step 1: Add inspector parity tests**

Use known geometry/elevation. Assert displayed distance, gain, loss, min, and max equal values from `getTrackMovement`. Assert malformed geometry renders no track stats.

- [ ] **Step 2: Replace inline calculations**

Inside `PlaceExtras`:

```ts
const track = getTrackMovement(place)
if (!track) return null

const distKm = track.distance / 1000
const hasEle = track.minElevation != null
const minEle = track.minElevation
const maxEle = track.maxElevation
const totalUp = track.elevationGain
const totalDown = track.elevationLoss
const elevations = track.elevations.flatMap((value) => value == null ? [] : [value])
```

Keep existing chart and formatting markup.

- [ ] **Step 3: Add map regression test**

Render a track place and a `route` prop containing only approach/departure segments. Assert:

- one GPX polyline for the place;
- routed polylines correspond only to supplied connector segments;
- no full track coordinate array is present in routed geometry.

Add a stable test ID to the GPX polyline only if existing mocks cannot identify it.

- [ ] **Step 4: Run tests and commit**

```bash
npm run test --workspace=client -- client/src/components/Planner/PlaceInspector.test.tsx client/src/components/Map/MapView.test.tsx
npm run typecheck --workspace=client
git add client/src/components/Planner/PlaceInspector.tsx client/src/components/Planner/PlaceInspector.test.tsx client/src/components/Map/MapView.test.tsx client/src/components/Map/MapView.tsx
git commit -m "refactor(planner): share track geometry statistics"
```

Omit `MapView.tsx` if no production test hook was needed.

---

## Task 8: Full Verification and Documentation

**Files:**
- Add: `docs/superpowers/specs/2026-07-17-track-aware-routing-design.md`
- Add: `docs/superpowers/plans/2026-07-17-track-aware-routing.md`

- [ ] **Step 1: Run all focused feature tests**

```bash
npm run test --workspace=client -- \
  client/tests/unit/utils/trackGeometry.test.ts \
  client/tests/unit/utils/dayMovementPlan.test.ts \
  client/tests/unit/utils/resolveDayMovementPlan.test.ts \
  client/tests/integration/hooks/useRouteCalculation.test.ts \
  client/src/components/Planner/DayPlanSidebar.test.tsx \
  client/src/components/Planner/PlaceInspector.test.tsx \
  client/src/components/Map/MapView.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run complete client validation**

```bash
npm run test --workspace=client
npm run typecheck --workspace=client
npm run lint --workspace=client
npm run build --workspace=client
```

Expected: PASS.

- [ ] **Step 3: Run repository-wide tests when supported**

```bash
npm test
```

Expected: shared, server, and client suites PASS.

- [ ] **Step 4: Manually verify the matrix**

Use a trip containing:

1. ordinary → timed walking track → ordinary;
2. untimed walking track;
3. consecutive tracks;
4. loop track;
5. malformed geometry;
6. morning hotel → track;
7. track → evening hotel;
8. transit-only day;
9. transport before/after track;
10. Leaflet and Mapbox/MapLibre providers.

Verify the track line appears once, no blue route crosses it, connector profile changes do not alter track metrics, export includes both endpoints, optimizer leaves tracks fixed, and hotel/transport regressions remain correct.

- [ ] **Step 5: Verify future-stat data contract**

In tests, inspect resolved movement parts and assert every metric-bearing part exposes:

- kind;
- owner identifier;
- mode/profile;
- distance;
- duration;
- source/endpoints.

No aggregate UI is added.

- [ ] **Step 6: Review the diff**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; no server, migration, or shared-schema changes.

- [ ] **Step 7: Commit docs and request review**

```bash
git add docs/superpowers/specs/2026-07-17-track-aware-routing-design.md docs/superpowers/plans/2026-07-17-track-aware-routing.md
git commit -m "docs(planner): document track-aware routing"
```

Use `superpowers:requesting-code-review`. Review specifically:

- profile independence;
- exit-anchor correctness;
- hotel end-time logic;
- transport parity;
- transit-only eligibility;
- single GPX rendering;
- no future double-counting path.

---

## Self-review

### Spec coverage

- Geometry and duration: Task 1.
- Ordered planning and endpoint behavior: Task 2.
- OSRM grouping/fallback: Task 3.
- Map hook: Task 4.
- Sidebar and profile-independent summary: Task 5.
- Transit/export/optimizer: Task 6.
- Inspector and rendering parity: Task 7.
- Full regression and future-stat contract: Task 8.

### Type consistency

- `TrackMovementPart` originates in `dayMovementPlan.ts`.
- `ResolvedMovementPart` originates in `resolveDayMovementPlan.ts`.
- All numeric metrics use meters and seconds.
- Existing `route` remains `[number, number][][]`.
- Existing `RouteSegment` remains connector-only.
- Connector placement names are identical in planner and sidebar indexing.

### Scope check

This remains one coordinated client project because map routing, sidebar routing, transit eligibility, and future movement stats share the same movement-plan boundary. No independent server subsystem is included.
