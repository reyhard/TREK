import { describe, expect, it } from 'vitest'
import {
  buildDayMovementPlan,
  hasDayRouteTools,
  type BuildDayMovementPlanOptions,
  type PlannedRoutedPart,
  type TrackMovementPart,
  movementPlanWaypoints,
} from '../../../src/utils/dayMovementPlan'
import { getTrackMovement } from '../../../src/utils/trackGeometry'

const day = { id: 1, trip_id: 1, day_number: 1, date: '2026-07-17' }
const days = [day]
const place = (id: number, lat: number, lng: number, extra = {}) => ({
  id, trip_id: 1, name: `P${id}`, lat, lng, place_time: null, end_time: null, ...extra,
})
const assignment = (id: number, p: ReturnType<typeof place>, order_index: number) => ({
  id, day_id: 1, place_id: p.id, order_index, place: p,
})
const track = (id: number, coordinates: number[][], extra = {}) =>
  place(id, coordinates[0][0], coordinates[0][1], { route_geometry: JSON.stringify(coordinates), ...extra })
const reservation = (id: number, extra = {}) => ({
  id, trip_id: 1, type: 'transit', title: `R${id}`, day_id: 1, end_day_id: 1,
  reservation_time: '10:00', day_positions: { '1': 1 }, endpoints: [], status: 'confirmed', ...extra,
})
const endpoint = (role: 'from' | 'to', lat: number, lng: number) => ({ role, lat, lng })
const build = (opts: Partial<BuildDayMovementPlanOptions> = {}) => buildDayMovementPlan({
  day, days, assignments: [], places: [], reservations: [], accommodations: [], ...opts,
})

describe('buildDayMovementPlan — TDD 1 (route bypass around imported track)', () => {
  it('ordinary A → B produces one routed connector', () => {
    const a = place(1, 52, 5)
    const b = place(2, 52.01, 5.01)
    const plan = build({ assignments: [assignment(11, a, 0), assignment(12, b, 1)], places: [a, b] })
    expect(plan.parts.map(part => part.kind)).toEqual(['routed'])
  })

  it('A → track → B produces routed, track, routed — the router never spans the track', () => {
    const a = place(1, 52, 5)
    const t = track(2, [[52.01, 5.01], [52.03, 5.03]])
    const b = place(3, 52.04, 5.04)
    const plan = build({
      assignments: [assignment(11, a, 0), assignment(12, t, 1), assignment(13, b, 2)],
      places: [a, t, b],
    })
    // Approach connector → track (imported geometry) → departure connector.
    expect(plan.parts.map(part => part.kind)).toEqual(['routed', 'track', 'routed'])
    const [approach, trackPart, departure] = plan.parts as [PlannedRoutedPart, TrackMovementPart, PlannedRoutedPart]
    // The approach connector ends at the track START; departure begins at track END.
    expect(approach.to.source).toBe('track-start')
    expect(departure.from.source).toBe('track-end')
    // No routed segment exists whose from is the pre-track place and to is the
    // post-track place — that would be the forbidden duplicate over the track.
    const spansTrack = plan.parts.some(part =>
      part.kind === 'routed'
      && (part as PlannedRoutedPart).from.source === 'place'
      && (part as PlannedRoutedPart).to.source === 'place')
    expect(spansTrack).toBe(false)
    expect(trackPart.assignmentId).toBe(12)
    expect(departure.placement.kind).toBe('after-assignment')
    expect(trackPart.geometry).toEqual([[52.01, 5.01], [52.03, 5.03]])
  })

  it('keeps the canonical per-leg mode fields on connector anchors', () => {
    const a = place(1, 52, 5)
    const b = place(2, 52.01, 5.01)
    const first = { ...assignment(11, a, 0), leg_transport_mode: 'walking' }
    const second = { ...assignment(12, b, 1), incoming_leg_transport_mode: 'cycling' }
    const plan = build({ assignments: [first, second], places: [a, b] })
    const connector = plan.parts[0] as PlannedRoutedPart

    expect(connector.from.leg_transport_mode).toBe('walking')
    expect(connector.to.incoming_leg_transport_mode).toBe('cycling')
  })

  it('exports imported track geometry boundaries without routing over the track', () => {
    const a = place(1, 52, 5)
    const t = track(2, [[52.01, 5.01], [52.03, 5.03]])
    const plan = build({ assignments: [assignment(11, a, 0), assignment(12, t, 1)], places: [a, t] })

    expect(movementPlanWaypoints(plan)).toEqual([
      { lat: 52, lng: 5 },
      { lat: 52.01, lng: 5.01 },
      { lat: 52.03, lng: 5.03 },
    ])
  })

  it('consecutive tracks route only between the exit and entry anchors', () => {
    const a = track(1, [[52, 5], [52.01, 5.01]])
    const b = track(2, [[52.02, 5.02], [52.03, 5.03]])
    const plan = build({ assignments: [assignment(11, a, 0), assignment(12, b, 1)], places: [a, b] })
    expect(plan.parts.map(part => part.kind)).toEqual(['track', 'routed', 'track'])
  })

  it('malformed geometry behaves as an ordinary point (no track part)', () => {
    const a = place(1, 52, 5, { route_geometry: 'bad json' })
    const b = place(2, 52.01, 5.01)
    expect(build({ assignments: [assignment(11, a, 0), assignment(12, b, 1)], places: [a, b] }).parts.map(p => p.kind)).toEqual(['routed'])
  })

  it('located transit produces approach, transit, and departure parts', () => {
    const a = place(1, 52, 5)
    const r = reservation(20, { endpoints: [endpoint('from', 51, 4), endpoint('to', 51.5, 4.5)] })
    const b = place(2, 52.01, 5.01)
    const plan = build({
      assignments: [assignment(11, a, 0), assignment(12, b, 2)],
      places: [a, b],
      reservations: [r],
    })
    expect(plan.parts.map(p => p.kind)).toEqual(['routed', 'transit', 'routed'])
  })

  it('exposes plan flags and routed connectors', () => {
    const a = place(1, 52, 5)
    const t = track(2, [[52.01, 5.01], [52.03, 5.03]])
    const plan = build({ assignments: [assignment(11, a, 0), assignment(12, t, 1)], places: [a, t] })
    expect(hasDayRouteTools(plan)).toBe(true)
    expect(plan.hasTracks).toBe(true)
    expect(plan.hasRoutedConnectors).toBe(true)
  })
})

describe('buildDayMovementPlan — TDD 5 (mixed day)', () => {
  it('walking + driving + transit + track + ordinary places all produce parts', () => {
    const hotel = place(1, 52, 5)
    const driveTarget = place(2, 52.02, 5.02)
    const t = track(3, [[52.03, 5.03], [52.05, 5.05]])
    const walkTarget = place(4, 52.06, 5.06)
    const transit = reservation(30, {
      endpoints: [endpoint('from', 52.061, 5.061), endpoint('to', 52.07, 5.07)],
      day_positions: { '1': 4 },
    })
    const finalStop = place(5, 52.08, 5.08)
    const plan = build({
      assignments: [
        assignment(11, hotel, 0),
        assignment(12, driveTarget, 1),
        assignment(13, t, 2),
        assignment(14, walkTarget, 3),
        assignment(15, finalStop, 5),
      ],
      places: [hotel, driveTarget, t, walkTarget, finalStop],
      reservations: [transit],
    })
    const kinds = plan.parts.map(p => p.kind)
    // Track contributes exactly once (its geometry is imported, not re-routed).
    expect(kinds.filter(k => k === 'track').length).toBe(1)
    expect(kinds.includes('transit')).toBe(true)
    expect(kinds.includes('routed')).toBe(true)
    // Every movement source is represented; nothing is double-counted as a
    // routed segment over the track.
    const spannedTrack = plan.parts.some(part =>
      part.kind === 'routed'
      && (part as PlannedRoutedPart).from.source === 'place'
      && (part as PlannedRoutedPart).to.source === 'place'
      && part.key.includes('52.03') && part.key.includes('52.05'))
    expect(spannedTrack).toBe(false)
  })
})

describe('getTrackMovement — TDD 2 (track contribution exactly once)', () => {
  it('computes distance + duration from imported geometry', () => {
    const t = track(1, [[52, 5], [52.01, 5.01]])
    const movement = getTrackMovement(t)
    expect(movement).not.toBeNull()
    expect(movement!.distance).toBeGreaterThan(0)
    expect(movement!.duration).toBeGreaterThan(0)
    expect(movement!.start).toEqual([52, 5])
    expect(movement!.end).toEqual([52.01, 5.01])
  })

  it('prefers scheduled place_time/end_time for duration, else estimates', () => {
    const t = track(1, [[52, 5], [52.01, 5.01]], { place_time: '10:00', end_time: '11:00' })
    const movement = getTrackMovement(t)
    expect(movement!.durationSource).toBe('poi-times')
    expect(movement!.duration).toBe(3600)
  })

  it('estimates duration from the mode speed when times are absent', () => {
    const t = track(1, [[52, 5], [52.01, 5.01]], { transport_mode: 'driving' })
    const movement = getTrackMovement(t)
    expect(movement!.mode).toBe('driving')
    expect(movement!.durationSource).toBe('estimated')
  })

  it('returns null for a place without valid imported geometry', () => {
    expect(getTrackMovement(place(1, 52, 5))).toBeNull()
    expect(getTrackMovement(place(2, 52, 5, { route_geometry: '[]' }))).toBeNull()
  })
})
