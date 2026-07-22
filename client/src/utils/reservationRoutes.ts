import type { Reservation } from '../types';
import type { GeoPointish } from './mapViewport';

/** A reservation is routable on the map once it has at least two ordered endpoints (from/to/stop). */
export function isRoutableReservation(r: Pick<Reservation, 'endpoints'>): boolean {
  return (r.endpoints || []).length >= 2;
}

export interface RouteVisibilityOptions {
  /** Reservation ids currently visible through per-item, bulk, or default connection preferences. */
  visibleConnectionIds: number[];
  /** The manual day-route toggle. Automated transit rides this toggle. */
  showTransitRoutes: boolean;
  /** The planner day currently selected on the map. */
  selectedDayId: number | null;
}

/** Which reservations should draw a route on the map. */
export function visibleRouteReservations(reservations: Reservation[], options: RouteVisibilityOptions): Reservation[] {
  const { visibleConnectionIds, showTransitRoutes, selectedDayId } = options;
  const visibleIds = new Set(visibleConnectionIds || []);

  return reservations.filter((reservation) => {
    if (reservation.type === 'transit') {
      return showTransitRoutes && selectedDayId !== null && reservation.day_id === selectedDayId;
    }

    return visibleIds.has(reservation.id);
  });
}

export function visibleReservationEndpointPoints(
  reservations: Reservation[],
  options: RouteVisibilityOptions
): GeoPointish[] {
  const points: GeoPointish[] = [];
  const visible = visibleRouteReservations(reservations, options);
  for (const r of visible) {
    for (const ep of r.endpoints || []) {
      if (ep.lat != null && ep.lng != null && Number.isFinite(ep.lat) && Number.isFinite(ep.lng)) {
        points.push({ lat: ep.lat, lng: ep.lng });
      }
    }
  }
  return points;
}
