import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useTripStore } from '../store/tripStore'
import { useSettingsStore } from '../store/settingsStore'
import { buildDayMovementPlan, type DayMovementPlan, type PlannedRoutedPart } from '../utils/dayMovementPlan'
import { resolveDayMovementPlan } from '../utils/resolveDayMovementPlan'
import { resolveLegMode } from '../components/Planner/legMode'
import { TRANSPORT_TYPES } from '../utils/dayMerge'
import type { TripStoreState } from '../store/tripStore'
import type { ResolvedMovementPart } from '../utils/resolveDayMovementPlan'
import type { RouteSegment, RouteResult, RouteVia, Accommodation, Day } from '../types'
import type { RouteProfileKey } from '../components/Map/RouteCalculator'

const NO_ACCOMMODATIONS: Accommodation[] = []
const EMPTY_ELIGIBILITY = {
  hasRoutedConnectors: false,
  hasTracks: false,
  hasTransit: false,
}

type RouteEligibility = Pick<DayMovementPlan, 'hasRoutedConnectors' | 'hasTracks' | 'hasTransit'>
export type RouteMetricStatus = 'idle' | 'loading' | 'complete' | 'partial'

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

function pendingMovementParts(plan: DayMovementPlan, dayDefaultMode: RouteProfileKey): ResolvedMovementPart[] {
  return plan.parts.map(part => {
    if (part.kind !== 'routed') return part
    const profile = resolveLegMode(
      { ...part.from, isPlace: part.from.source === 'place' },
      { ...part.to, isPlace: part.to.source === 'place' },
      dayDefaultMode,
    ) as RouteProfileKey
    return {
      ...part,
      profile,
      geometry: [[part.from.lat, part.from.lng], [part.to.lat, part.to.lng]],
      distance: null,
      duration: null,
      routeSegment: null,
    }
  })
}

const isAbortError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'

/**
 * Builds a track-aware movement plan for the selected day and resolves only its
 * ordinary connectors. Imported tracks remain intrinsic map geometry and are never
 * sent to the road router a second time.
 */
export function useRouteCalculation(
  tripStore: TripStoreState,
  selectedDayId: number | null,
  enabled: boolean = true,
  profile: RouteProfileKey = 'driving',
  accommodations: Accommodation[] = NO_ACCOMMODATIONS,
) {
  const [route, setRoute] = useState<[number, number][][] | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteResult | null>(null)
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([])
  const [routeVias, setRouteVias] = useState<RouteVia[]>([])
  const [movementParts, setMovementParts] = useState<ResolvedMovementPart[]>([])
  const [routeEligibility, setRouteEligibility] = useState<RouteEligibility>(EMPTY_ELIGIBILITY)
  const [routeMetricStatus, setRouteMetricStatus] = useState<RouteMetricStatus>('idle')
  const routeAbortRef = useRef<AbortController | null>(null)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const reservationsForSignature = useTripStore((s) => s.reservations)
  const placesForSignature = useTripStore((s) => s.places)
  const selectedDayDefaultMode = useTripStore((s) => (
    selectedDayId ? s.days?.find(day => day.id === selectedDayId)?.default_transport_mode ?? null : null
  ))
  const optimizeFromAccommodation = useSettingsStore((s) => s.settings.optimize_from_accommodation)
  const distanceUnit = useSettingsStore((s) => s.settings.distance_unit)

  const updateRouteForDay = useCallback(async (dayId: number | null) => {
    routeAbortRef.current?.abort()
    if (!dayId) {
      setRoute(null)
      setRouteSegments([])
      setRouteVias([])
      setMovementParts([])
      setRouteEligibility(EMPTY_ELIGIBILITY)
      setRouteMetricStatus('idle')
      return
    }

    // Read the latest store state so imperative callers after optimistic writes do
    // not route against the render that created this callback.
    const state = useTripStore.getState()
    const allDays = state.days || []
    const day = allDays.find(candidate => candidate.id === dayId) ?? ({ id: dayId } as Day)
    const dayDefaultMode = day.default_transport_mode || profile
    const plan = buildDayMovementPlan({
      day,
      days: allDays.length ? allDays : [day],
      assignments: state.assignments?.[String(dayId)] || [],
      places: state.places || [],
      reservations: state.reservations || [],
      accommodations,
      optimizeFromAccommodation,
    })

    setRouteEligibility({
      hasRoutedConnectors: plan.hasRoutedConnectors,
      hasTracks: plan.hasTracks,
      hasTransit: plan.hasTransit,
    })
    setMovementParts(pendingMovementParts(plan, dayDefaultMode))
    setRouteVias([])
    setRouteMetricStatus(enabledRef.current && plan.hasRoutedConnectors ? 'loading' : 'idle')

    // Route drawing is manual. Tracks and transit remain represented in the
    // movement plan even when ordinary connector routing is disabled.
    if (!enabledRef.current || !plan.hasRoutedConnectors) {
      setRoute(null)
      setRouteSegments([])
      return
    }

    setRoute(straightConnectorPolylines(plan))
    setRouteSegments([])

    const controller = new AbortController()
    routeAbortRef.current = controller
    try {
      const resolved = await resolveDayMovementPlan(plan, dayDefaultMode, {
        signal: controller.signal,
        tripId: state.trip?.id ?? null,
        dayId,
      })
      if (!controller.signal.aborted) {
        setRoute(resolved.routedPolylines.length ? resolved.routedPolylines : null)
        setRouteSegments(resolved.parts.flatMap(part =>
          part.kind === 'routed' && part.routeSegment ? [part.routeSegment] : [],
        ))
        setRouteVias(resolved.routedVias)
        setMovementParts(resolved.parts)
        setRouteMetricStatus(
          resolved.parts
            .filter(part => part.kind === 'routed')
            .every(part => part.routeSegment != null)
            ? 'complete'
            : 'partial',
        )
      }
    } catch (error: unknown) {
      // An aborted request belongs to an older day or route generation. Other
      // failures leave the already-visible straight connectors in place.
      if (!controller.signal.aborted && !isAbortError(error)) {
        setRouteSegments([])
        setRouteVias([])
        setRouteMetricStatus('partial')
      }
    }
  }, [profile, accommodations, optimizeFromAccommodation])

  const transportSignature = useMemo(() => {
    if (!selectedDayId) return ''
    return reservationsForSignature
      .filter(reservation => TRANSPORT_TYPES.has(reservation.type))
      .map(reservation => {
        const pos = reservation.day_positions?.[selectedDayId]
          ?? reservation.day_positions?.[String(selectedDayId)]
          ?? reservation.day_plan_position
        const endpoints = (reservation.endpoints || [])
          .map(endpoint => `${endpoint.role}@${endpoint.lat ?? ''},${endpoint.lng ?? ''}`)
          .join(';')
        const metadata = typeof reservation.metadata === 'string'
          ? reservation.metadata
          : JSON.stringify(reservation.metadata ?? null)
        return `${reservation.id}:${reservation.type}:${reservation.assignment_id ?? ''}:${reservation.day_id ?? ''}:${reservation.end_day_id ?? ''}:${reservation.reservation_time ?? ''}:${reservation.reservation_end_time ?? ''}:${pos ?? ''}:${endpoints}:${metadata}`
      })
      .sort()
      .join('|')
  }, [reservationsForSignature, selectedDayId])

  const fullPlaceSignature = useMemo(() => {
    if (!selectedDayId) return ''
    const placesById = new Map(placesForSignature.map(place => [place.id, place]))
    return (tripStore.assignments?.[String(selectedDayId)] || []).map(assignment => {
      const embeddedPlace = assignment.place as typeof assignment.place & { route_geometry?: string | null }
      const fullPlace = placesById.get(embeddedPlace.id)
      return [
        assignment.id,
        assignment.order_index,
        assignment.leg_transport_mode ?? '',
        assignment.incoming_leg_transport_mode ?? '',
        fullPlace?.lat ?? embeddedPlace.lat ?? '',
        fullPlace?.lng ?? embeddedPlace.lng ?? '',
        fullPlace?.route_geometry ?? embeddedPlace.route_geometry ?? '',
        fullPlace?.place_time ?? embeddedPlace.place_time ?? '',
        fullPlace?.end_time ?? embeddedPlace.end_time ?? '',
        fullPlace?.transport_mode ?? embeddedPlace.transport_mode ?? '',
      ].join(':')
    }).join('|')
  }, [placesForSignature, selectedDayId, tripStore.assignments])

  const selectedDayAssignments = selectedDayId ? tripStore.assignments?.[String(selectedDayId)] : null
  useEffect(() => {
    if (!selectedDayId) {
      routeAbortRef.current?.abort()
      routeAbortRef.current = null
      setRoute(null)
      setRouteSegments([])
      setRouteVias([])
      setMovementParts([])
      setRouteEligibility(EMPTY_ELIGIBILITY)
      setRouteMetricStatus('idle')
      return
    }
    void updateRouteForDay(selectedDayId)
  // The signatures above intentionally capture the mutable day inputs that drive
  // routing; updateRouteForDay itself is stable across those state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayId, selectedDayAssignments, transportSignature, fullPlaceSignature, enabled, profile, accommodations, optimizeFromAccommodation, distanceUnit, selectedDayDefaultMode])

  useEffect(() => () => {
    routeAbortRef.current?.abort()
    routeAbortRef.current = null
  }, [])

  return {
    route: enabled ? route : null,
    routeSegments: enabled ? routeSegments : [],
    routeVias: enabled ? routeVias : [],
    movementParts,
    routeEligibility,
    routeMetricStatus,
    routeInfo,
    setRoute,
    setRouteInfo,
    updateRouteForDay,
  }
}
