import { describe, expect, it } from 'vitest'
import {
  buildDayMovementPlan,
  hasDayRouteTools,
  movementPlanWaypoints,
  type BuildDayMovementPlanOptions,
  type PlannedRoutedPart,
  type TrackMovementPart,
} from '../../../src/utils/dayMovementPlan'

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
  reservation_time: '10:00', day_positions: { '1': 1 }, endpoints: [], ...extra,
})
const endpoint = (role: 'from' | 'to', lat: number, lng: number) => ({ role, lat, lng })
const build = (opts: Record<string, unknown> = {}) => buildDayMovementPlan({
  day, days, assignments: [], places: [], reservations: [], accommodations: [], ...opts,
} as BuildDayMovementPlanOptions)

describe('buildDayMovementPlan', () => {
  it('ordinary A → B produces one routed part', () => {
    const a = place(1, 52, 5)
    const b = place(2, 52.1, 5.1)
    const plan = build({ assignments: [assignment(11, a, 0), assignment(12, b, 1)], places: [a, b] })
    expect(plan.parts.map(part => part.kind)).toEqual(['routed'])
    const routed = plan.parts[0] as PlannedRoutedPart
    expect(routed.from).toMatchObject({ lat: a.lat, lng: a.lng })
    expect(routed.to).toMatchObject({ lat: b.lat, lng: b.lng })
  })

  it('A → track → B produces routed, track, routed', () => {
    const a = place(1, 52, 5)
    const t = track(2, [[52.01, 5.01], [52.03, 5.03]])
    const b = place(3, 52.04, 5.04)
    const ta = assignment(12, t, 1)
    const plan = build({ assignments: [assignment(11, a, 0), ta, assignment(13, b, 2)], places: [a, t, b] })
    expect(plan.parts.map(part => part.kind)).toEqual(['routed', 'track', 'routed'])
    const [approach, trackPart, departure] = plan.parts as [PlannedRoutedPart, TrackMovementPart, PlannedRoutedPart]
    expect(approach.to).toMatchObject({ lat: 52.01, lng: 5.01 })
    expect(trackPart.to).toMatchObject({ lat: 52.03, lng: 5.03 })
    expect(departure.from).toMatchObject({ lat: 52.03, lng: 5.03 })
    expect(departure.placement).toEqual({ kind: 'after-assignment', assignmentId: ta.id })
  })

  it('consecutive tracks route only between exit and entry anchors', () => {
    const a = track(1, [[52, 5], [52.01, 5.01]])
    const b = track(2, [[52.02, 5.02], [52.03, 5.03]])
    const plan = build({ assignments: [assignment(11, a, 0), assignment(12, b, 1)], places: [a, b] })
    expect(plan.parts.map(part => part.kind)).toEqual(['track', 'routed', 'track'])
    const connector = plan.parts[1] as PlannedRoutedPart
    expect(connector.from).toMatchObject({ lat: 52.01, lng: 5.01 })
    expect(connector.to).toMatchObject({ lat: 52.02, lng: 5.02 })
  })

  it('malformed geometry behaves as an ordinary point', () => {
    const a = place(1, 52, 5, { route_geometry: 'bad json' })
    const b = place(2, 53, 6)
    expect(build({ assignments: [assignment(11, a, 0), assignment(12, b, 1)], places: [a, b] }).parts.map(p => p.kind)).toEqual(['routed'])
  })

  it('accepts a loop track as a track part', () => {
    const t = track(1, [[52, 5], [52.1, 5.1], [52, 5]])
    expect(build({ assignments: [assignment(11, t, 0)], places: [t] }).parts.map(p => p.kind)).toEqual(['track'])
  })

  it('located transit produces approach, transit, and departure parts', () => {
    const a = place(1, 52, 5)
    const b = place(2, 53, 6)
    const r = reservation(20, { endpoints: [endpoint('from', 52.1, 5.1), endpoint('to', 52.9, 5.9)] })
    const plan = build({ assignments: [assignment(11, a, 0), assignment(12, b, 2)], places: [a, b], reservations: [r] })
    expect(plan.parts.map(p => p.kind)).toEqual(['routed', 'transit', 'routed'])
    expect((plan.parts[2] as PlannedRoutedPart).placement).toEqual({ kind: 'after-reservation', reservationId: 20 })
  })

  it('does not route between consecutive located transports', () => {
    const a = place(1, 52, 5)
    const b = place(2, 54, 7)
    const r1 = reservation(20, { reservation_time: '09:00', endpoints: [endpoint('from', 52.1, 5.1), endpoint('to', 53, 6)] })
    const r2 = reservation(21, { reservation_time: '10:00', day_positions: { '1': 2 }, endpoints: [endpoint('from', 53.1, 6.1), endpoint('to', 53.9, 6.9)] })
    const plan = build({ assignments: [assignment(11, a, 0), assignment(12, b, 3)], places: [a, b], reservations: [r1, r2] })
    expect(plan.parts.map(p => p.kind)).toEqual(['routed', 'transit', 'transit', 'routed'])
  })

  it('endpoint-less transport rekeys the following connector after the reservation', () => {
    const a = place(1, 52, 5)
    const b = place(2, 53, 6)
    const plan = build({ assignments: [assignment(11, a, 0), assignment(12, b, 2)], places: [a, b], reservations: [reservation(20)] })
    expect((plan.parts.at(-1) as PlannedRoutedPart).placement).toEqual({ kind: 'after-reservation', reservationId: 20 })
  })

  it('does not rekey a car-rental middle-day connector to a hidden row', () => {
    const middle = { ...day, id: 2, day_number: 2 }
    const allDays = [{ ...day, day_number: 1 }, middle, { ...day, id: 3, day_number: 3 }]
    const a = { ...place(1, 52, 5), id: 1 }
    const b = { ...place(2, 53, 6), id: 2 }
    const car = reservation(20, { type: 'car', day_id: 1, end_day_id: 3 })
    const plan = buildDayMovementPlan({ day: middle, days: allDays, assignments: [assignment(11, a, 0), assignment(12, b, 2)].map(x => ({ ...x, day_id: 2 })), places: [a, b], reservations: [car], accommodations: [] } as BuildDayMovementPlanOptions)
    expect((plan.parts[0] as PlannedRoutedPart).placement).toEqual({ kind: 'after-assignment', assignmentId: 11 })
  })

  it('uses track start/time for morning hotel and track end/end_time for evening hotel', () => {
    const t = track(1, [[52, 5], [52.2, 5.2]], { place_time: '10:00', end_time: '18:00' })
    const hotel = { id: 30, start_day_id: 1, end_day_id: 2, place_name: 'Hotel', place_lat: 51.9, place_lng: 4.9 }
    const plan = build({ assignments: [assignment(11, t, 0)], places: [t], accommodations: [hotel] })
    expect(plan.parts.map(p => p.kind)).toEqual(['routed', 'track', 'routed'])
    expect((plan.parts[0] as PlannedRoutedPart).to).toMatchObject({ lat: 52, lng: 5, source: 'track-start' })
    expect((plan.parts[2] as PlannedRoutedPart).from).toMatchObject({ lat: 52.2, lng: 5.2, source: 'track-end' })
  })

  it('evaluates track end_time for a checkout-day evening leg', () => {
    const checkoutDay = { ...day, id: 2, day_number: 2 }
    const allDays = [{ ...day, day_number: 1 }, checkoutDay]
    const t = track(1, [[52, 5], [52.2, 5.2]], { place_time: '18:00', end_time: '09:00' })
    const hotel = { id: 30, start_day_id: 1, end_day_id: 2, check_out: '10:00', place_name: 'Hotel', place_lat: 51.9, place_lng: 4.9 }
    const a = { ...assignment(11, t, 0), day_id: 2 }
    const plan = buildDayMovementPlan({ day: checkoutDay, days: allDays, assignments: [a], places: [t], reservations: [], accommodations: [hotel] } as BuildDayMovementPlanOptions)
    expect(plan.parts.map(p => p.kind)).toEqual(['routed', 'track', 'routed'])
    expect((plan.parts.at(-1) as PlannedRoutedPart).from).toMatchObject({ source: 'track-end' })
  })

  it('creates a connector on a distinct-hotel transfer day without activities', () => {
    const transfer = { ...day, id: 2, day_number: 2 }
    const allDays = [{ ...day, day_number: 1 }, transfer, { ...day, id: 3, day_number: 3 }]
    const hotels = [
      { id: 30, start_day_id: 1, end_day_id: 2, place_name: 'Old', place_lat: 52, place_lng: 5 },
      { id: 31, start_day_id: 2, end_day_id: 3, place_name: 'New', place_lat: 53, place_lng: 6 },
    ]
    const plan = buildDayMovementPlan({ day: transfer, days: allDays, assignments: [], places: [], reservations: [], accommodations: hotels } as BuildDayMovementPlanOptions)
    expect(plan.parts.map(p => p.kind)).toEqual(['routed'])
  })

  it('makes a transit-only plan eligible for day route tools', () => {
    const plan = build({ reservations: [reservation(20)] })
    expect(plan.hasTransit).toBe(true)
    expect(hasDayRouteTools(plan)).toBe(true)
  })

  it('exports both track endpoints and deduplicates adjacent equal waypoints', () => {
    const a = place(1, 52, 5)
    const t = track(2, [[52, 5], [52.2, 5.2]])
    const plan = build({ assignments: [assignment(11, a, 0), assignment(12, t, 1)], places: [a, t] })
    expect(movementPlanWaypoints(plan)).toEqual([{ lat: 52, lng: 5 }, { lat: 52.2, lng: 5.2 }])
  })
})
