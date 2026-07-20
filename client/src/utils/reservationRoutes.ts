import type { Reservation } from '../types'
import type { GeoPointish } from './mapViewport'

/** A reservation is routable on the map once it has at least two ordered endpoints (from/to/stop). */
export function isRoutableReservation(r: Pick<Reservation, 'endpoints'>): boolean {
  return (r.endpoints || []).length >= 2
}

export interface RouteVisibilityOptions {
  /** Reservation ids resolved as currently visible for this trip (per-item toggle, bulk toggle, or the account-wide default — see connectionsVisibility.ts). */
  visibleConnectionIds: number[]
  /** The separate manual day-route-calculator toggle — 'transit' reservations ride it (#1065). */
  showTransitRoutes: boolean
}

/** Which reservations should draw a route on the map, combining the two independent toggles above. */
export function visibleRouteReservations(reservations: Reservation[], options: RouteVisibilityOptions): Reservation[] {
  const { visibleConnectionIds, showTransitRoutes } = options
  const set = new Set(visibleConnectionIds || [])
  return reservations.filter(r =>
    (r.type === 'transit' && showTransitRoutes) ||
    set.has(r.id)
  )
}

export function visibleReservationEndpointPoints(reservations: Reservation[], options: RouteVisibilityOptions): GeoPointish[] {
  const points: GeoPointish[] = []
  const visible = visibleRouteReservations(reservations, options)
  for (const r of visible) {
    for (const ep of r.endpoints || []) {
      if (ep.lat != null && ep.lng != null && Number.isFinite(ep.lat) && Number.isFinite(ep.lng)) {
        points.push({ lat: ep.lat, lng: ep.lng })
      }
    }
  }
  return points
}
