import type { Day, Reservation } from '../types'
import type { GeoPointish } from './mapViewport'
import { isDayInAccommodationRange } from './dayOrder'

/** A reservation is routable on the map once it has at least two ordered endpoints. */
export function isRoutableReservation(r: Pick<Reservation, 'endpoints'> | null | undefined): boolean {
  return (r?.endpoints || []).length >= 2
}

export interface RouteVisibilityOptions {
  /** Reservation ids currently visible through per-item, bulk, or default connection preferences. */
  visibleConnectionIds: number[]
  /** The manual day-route toggle. Automated transit rides this toggle. */
  showTransitRoutes: boolean
  /** The planner day currently selected on the map. */
  selectedDayId?: number | null
  /** The trip's days, needed because day ids are not necessarily chronological. */
  days?: Day[]
}

/** A transit journey remains visible on every day covered by its accommodation span. */
function transitRunsOnDay(r: Reservation, selectedDayId: number | null | undefined, days: Day[]): boolean {
  if (selectedDayId == null) return true
  const startDayId = r.day_id ?? r.end_day_id
  if (startDayId == null) return true
  const day = days.find(candidate => candidate.id === selectedDayId)
  if (!day) return true
  return isDayInAccommodationRange(day, startDayId, r.end_day_id ?? startDayId, days)
}

/** Which reservations should draw a route on the map. */
export function visibleRouteReservations(
  reservations: Reservation[],
  options: RouteVisibilityOptions,
): Reservation[] {
  const { visibleConnectionIds, showTransitRoutes, selectedDayId, days } = options
  const visibleIds = new Set(visibleConnectionIds || [])

  return reservations.filter(reservation => {
    if (reservation.type === 'transit') {
      return showTransitRoutes && transitRunsOnDay(reservation, selectedDayId, days || [])
    }
    return visibleIds.has(reservation.id)
  })
}

export function visibleReservationEndpointPoints(
  reservations: Reservation[],
  options: RouteVisibilityOptions,
): GeoPointish[] {
  const points: GeoPointish[] = []
  for (const reservation of visibleRouteReservations(reservations, options)) {
    for (const endpoint of reservation.endpoints || []) {
      if (endpoint.lat != null && endpoint.lng != null && Number.isFinite(endpoint.lat) && Number.isFinite(endpoint.lng)) {
        points.push({ lat: endpoint.lat, lng: endpoint.lng })
      }
    }
  }
  return points
}
