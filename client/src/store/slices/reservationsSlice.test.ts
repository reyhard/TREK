import type { TransitRouteEndpointsUpdateRequest } from '@trek/shared';
import { reservationsApi } from '../../api/client';
import { buildReservation } from '../../../tests/helpers/factories';
import { createReservationsSlice } from './reservationsSlice';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client', () => ({
  reservationsApi: {
    updateTransitRouteEndpoints: vi.fn(),
  },
}));

vi.mock('../../repo/reservationRepo', () => ({
  reservationRepo: { list: vi.fn() },
}));

describe('reservationsSlice.updateTransitRouteEndpoints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replaces only the updated reservation with the server response', async () => {
    const first = buildReservation({ id: 1, type: 'transit' });
    const second = buildReservation({ id: 2, type: 'hotel' });
    const updated = {
      ...first,
      endpoints: [
        {
          role: 'from' as const, sequence: 0, name: 'Station', code: null,
          lat: 34.9685211, lng: 135.7691251,
          timezone: null, local_date: null, local_time: null,
        },
      ],
    };
    vi.mocked(reservationsApi.updateTransitRouteEndpoints).mockResolvedValue({ reservation: updated } as never);

    let state: any = { reservations: [first, second] };
    const set = (patch: any) => {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
    };
    const get = () => state;
    const slice = createReservationsSlice(set as never, get as never);
    const input: TransitRouteEndpointsUpdateRequest = {
      from: { name: 'Station', lat: 34.9685211, lng: 135.7691251 },
    };

    await expect(slice.updateTransitRouteEndpoints(7, 1, input)).resolves.toEqual(updated);
    expect(reservationsApi.updateTransitRouteEndpoints).toHaveBeenCalledWith(7, 1, input);
    expect(state.reservations).toEqual([updated, second]);
  });
});
