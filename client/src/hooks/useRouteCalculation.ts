import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useTripStore } from '../store/tripStore'
import { useSettingsStore } from '../store/settingsStore'
import { buildDayMovementPlan } from '../utils/dayMovementPlan'
import { resolveDayMovementPlan } from '../utils/resolveDayMovementPlan'
import type { TripStoreState } from '../store/tripStore'
import type { DayMovementPlan, PlannedRoutedPart } from '../utils/dayMovementPlan'
import type { ResolvedMovementPart } from '../utils/resolveDayMovementPlan'
import type { RouteSegment, RouteResult, Accommodation, Day } from '../types'

const NO_ACCOMMODATIONS: Accommodation[] = []
const EMPTY_ELIGIBILITY = {
  hasRoutedConnectors: false,
  hasTracks: false,
  hasTransit: false,
}

type RouteEligibility = Pick<DayMovementPlan, 'hasRoutedConnectors' | 'hasTracks' | 'hasTransit'>

function straightConnectorPolylines(plan: DayMovementPlan): [number, number][][] {
  const polylines: [number, number][][] = []
  let current: [number, number][] = []
  let previous: PlannedRoutedPart | null = null
  const flush = () => {
    if (current.length >= 2) polylines.push(current)
    current = []
    previous = null
  }
  for (const part of plan.parts) {
    if (part.kind !== 'routed') {
      flush()
      continue
    }
    if (!previous || previous.to.lat !== part.from.lat || previous.to.lng !== part.from.lng) {
      flush()
      current.push([part.from.lat, part.from.lng])
    }
    current.push([part.to.lat, part.to.lng])
    previous = part
  }
  flush()
  return polylines
}

/**
 * Manages route calculation state for a selected day. Extracts geo-coded waypoints from
 * day assignments, draws a straight-line route immediately, then upgrades it to real OSRM
 * road geometry with per-segment durations. Aborts in-flight requests when the day changes.
 */
export function useRouteCalculation(tripStore: TripStoreState, selectedDayId: number | null, enabled: boolean = true, profile: 'driving' | 'walking' | 'cycling' = 'driving', accommodations: Accommodation[] = NO_ACCOMMODATIONS) {
  const [route, setRoute] = useState<[number, number][][] | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null)
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([])
  const [movementParts, setMovementParts] = useState<ResolvedMovementPart[]>([])
  const [routeEligibility, setRouteEligibility] = useState<RouteEligibility>(EMPTY_ELIGIBILITY)
  const routeAbortRef = useRef<AbortController | null>(null)
  const reservationsForSignature = useTripStore((s) => s.reservations)
  const placesForSignature = useTripStore((s) => s.places)
  // Draw the day's accommodation bookend legs (hotel → first stop, last stop →
  // hotel) unless the user turned the setting off — same gate as the sidebar.
  const optimizeFromAccommodation = useSettingsStore((s) => s.settings.optimize_from_accommodation)
  // Recompute when the user flips km↔mi so leg distances (formatted at compute time)
  // refresh instead of showing stale cached text (#1300).
  const distanceUnit = useSettingsStore((s) => s.settings.distance_unit)

  const updateRouteForDay = useCallback(async (dayId: number | null) => {
    if (routeAbortRef.current) routeAbortRef.current.abort()
    // Route is manual: only compute when explicitly enabled (the "show route" toggle).
    if (!dayId || !enabled) {
      setRoute(null)
      setRouteSegments([])
      setMovementParts([])
      setRouteEligibility(EMPTY_ELIGIBILITY)
      return
    }
    // Read directly from store (not a render-phase ref) so callers after optimistic
    // updates or non-optimistic deletes always see the latest assignments.
    const state = useTripStore.getState()
    const allDays = state.days || []
    const day = allDays.find(candidate => candidate.id === dayId) ?? ({ id: dayId } as Day)
    const plan = buildDayMovementPlan({
      day,
      days: allDays.length ? allDays : [day],
      assignments: state.assignments?.[String(dayId)] || [],
      places: state.places || [],
      reservations: state.reservations || [],
      accommodations,
      optimizeFromAccommodation,
    })
    const eligibility: RouteEligibility = {
      hasRoutedConnectors: plan.hasRoutedConnectors,
      hasTracks: plan.hasTracks,
      hasTransit: plan.hasTransit,
    }
    setRouteEligibility(eligibility)
    setMovementParts(plan.parts)
    if (!plan.hasRoutedConnectors) {
      setRoute(null)
      setRouteSegments([])
      return
    }
    setRoute(straightConnectorPolylines(plan))
    setRouteSegments([])

    const controller = new AbortController()
    routeAbortRef.current = controller
    try {
      const resolved = await resolveDayMovementPlan(plan, profile, controller.signal)
      if (!controller.signal.aborted) {
        setRoute(resolved.routedPolylines.length ? resolved.routedPolylines : null)
        setRouteSegments(resolved.parts.flatMap(part =>
          part.kind === 'routed' && part.routeSegment ? [part.routeSegment] : [],
        ))
        setMovementParts(resolved.parts)
      }
    } catch (err: unknown) {
      // Aborted (day changed) — newer call owns the state. Anything else: keep straight lines.
      if (!(err instanceof Error) || err.name !== 'AbortError') setRouteSegments([])
    }
  }, [enabled, profile, accommodations, optimizeFromAccommodation, distanceUnit])

  // Stable signature for transport reservations on the selected day — changes when a transport
  // is added, removed, or repositioned, ensuring route recalc fires even on transport-only reorders.
  const transportSignature = useMemo(() => {
    if (!selectedDayId) return ''
    return reservationsForSignature
      .map(r => {
        const pos = r.day_positions?.[selectedDayId] ?? r.day_positions?.[String(selectedDayId)] ?? r.day_plan_position
        // Include endpoints so adding/moving a departure/arrival location re-routes.
        const eps = (r.endpoints || []).map(e => `${e.role}@${e.lat ?? ''},${e.lng ?? ''}`).join(';')
        return `${r.id}:${r.day_id ?? ''}:${r.end_day_id ?? ''}:${r.reservation_time ?? ''}:${pos ?? ''}:${eps}`
      })
      .sort()
      .join('|')
  }, [reservationsForSignature, selectedDayId])

  const fullPlaceSignature = useMemo(() => {
    if (!selectedDayId) return ''
    const placesById = new Map(placesForSignature.map(place => [place.id, place]))
    return (tripStore.assignments?.[String(selectedDayId)] || []).map(assignment => {
      const place = placesById.get(assignment.place.id) ?? assignment.place
      return [
        assignment.id,
        place.lat ?? '',
        place.lng ?? '',
        place.route_geometry ?? '',
        place.place_time ?? '',
        place.end_time ?? '',
        place.transport_mode ?? '',
      ].join(':')
    }).join('|')
  }, [placesForSignature, selectedDayId, tripStore.assignments])

  // Recalculate when assignments or transport positions for the SELECTED day change
  const selectedDayAssignments = selectedDayId ? tripStore.assignments?.[String(selectedDayId)] : null
  useEffect(() => {
    if (!selectedDayId) {
      setRoute(null)
      setRouteSegments([])
      setMovementParts([])
      setRouteEligibility(EMPTY_ELIGIBILITY)
      return
    }
    updateRouteForDay(selectedDayId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayId, selectedDayAssignments, transportSignature, fullPlaceSignature, enabled, profile, accommodations, optimizeFromAccommodation, distanceUnit])

  return {
    route,
    routeSegments,
    movementParts,
    routeEligibility,
    routeInfo,
    setRoute,
    setRouteInfo,
    updateRouteForDay,
  }
}
