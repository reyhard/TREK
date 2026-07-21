import {
  transitRouteEndpointsUpdateRequestSchema,
  type Reservation,
  type TransitRouteEndpointInput,
  type TransitRouteEndpointsUpdateRequest,
} from '@trek/shared';
import { db } from '../db/database';
import { getReservation, getReservationWithJoins } from './reservationService';

export type TransitRouteEndpointUpdateErrorCode =
  | 'INVALID_INPUT'
  | 'RESERVATION_NOT_FOUND'
  | 'NOT_TRANSIT'
  | 'ENDPOINT_STRUCTURE_INVALID';

export class TransitRouteEndpointUpdateError extends Error {
  constructor(
    readonly code: TransitRouteEndpointUpdateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TransitRouteEndpointUpdateError';
  }
}

type EndpointRole = 'from' | 'to';

export function updateTransitRouteEndpoints(
  reservationId: string | number,
  tripId: string | number,
  input: TransitRouteEndpointsUpdateRequest,
): Reservation {
  const parsed = transitRouteEndpointsUpdateRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new TransitRouteEndpointUpdateError(
      'INVALID_INPUT',
      parsed.error.issues[0]?.message ?? 'Invalid transit endpoint update.',
    );
  }

  const current = getReservation(reservationId, tripId);
  if (!current) {
    throw new TransitRouteEndpointUpdateError('RESERVATION_NOT_FOUND', 'Reservation not found.');
  }
  if (current.type !== 'transit') {
    throw new TransitRouteEndpointUpdateError('NOT_TRANSIT', 'Reservation is not a transit journey.');
  }

  const findEndpoint = db.prepare(
    'SELECT id FROM reservation_endpoints WHERE reservation_id = ? AND role = ? ORDER BY sequence',
  );
  const updateEndpoint = db.prepare(
    'UPDATE reservation_endpoints SET name = ?, lat = ?, lng = ? WHERE id = ?',
  );

  const transaction = db.transaction(
    (updates: Array<[EndpointRole, TransitRouteEndpointInput]>) => {
      for (const [role, endpoint] of updates) {
        const rows = findEndpoint.all(reservationId, role) as Array<{ id: number }>;
        if (rows.length !== 1) {
          throw new TransitRouteEndpointUpdateError(
            'ENDPOINT_STRUCTURE_INVALID',
            `Transit journey must have exactly one ${role} endpoint.`,
          );
        }
        updateEndpoint.run(endpoint.name, endpoint.lat, endpoint.lng, rows[0]!.id);
      }
    },
  );

  const updates: Array<[EndpointRole, TransitRouteEndpointInput]> = [];
  if (parsed.data.from) updates.push(['from', parsed.data.from]);
  if (parsed.data.to) updates.push(['to', parsed.data.to]);
  transaction(updates);

  const reservation = getReservationWithJoins(reservationId);
  if (!reservation) {
    throw new TransitRouteEndpointUpdateError('RESERVATION_NOT_FOUND', 'Reservation not found.');
  }
  return reservation as Reservation;
}
