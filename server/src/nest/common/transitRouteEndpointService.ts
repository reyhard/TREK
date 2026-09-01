import { transitRouteEndpointsUpdateRequestSchema } from '@trek/shared';

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
