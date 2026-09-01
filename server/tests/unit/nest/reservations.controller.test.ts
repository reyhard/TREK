import { ReservationsController } from '../../../src/nest/reservations/reservations.controller';
import type { ReservationsService } from '../../../src/nest/reservations/reservations.service';
import { TransitRouteEndpointUpdateError } from '../../../src/nest/common/transitRouteEndpointService';
import type { AirtrailLinkService } from '../../../src/nest/integrations/airtrail-link.service';
import type { RuntimeEnvService } from '../../../src/nest/app-config/runtime-env.service';
import type { User } from '../../../src/types';
import { HttpException } from '@nestjs/common';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { isDemoEmail } = vi.hoisted(() => ({ isDemoEmail: vi.fn(() => false) }));
vi.mock('../../../src/nest/common/demo', () => ({ isDemoEmail }));

const user = { id: 1, role: 'user', email: 'u@example.test' } as User;

const airtrailLink = {
  pushReservationToAirtrail: vi.fn().mockResolvedValue(undefined),
} as unknown as AirtrailLinkService;

const demoEnv = { isDemoMode: vi.fn(() => true) } as unknown as RuntimeEnvService;

function makeService(overrides: Partial<ReservationsService> = {}): ReservationsService {
  return {
    broadcast: vi.fn(),
    syncBudgetOnCreate: vi.fn(),
    syncBudgetOnUpdate: vi.fn(),
    notifyBookingChange: vi.fn(),
    ...overrides,
  } as unknown as ReservationsService;
}

function thrown(fn: () => unknown): { status: number; body: unknown } {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    const exception = err as HttpException;
    return { status: exception.getStatus(), body: exception.getResponse() };
  }
  throw new Error('expected throw');
}

describe('ReservationsController', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('GET / returns reservations', () => {
    const service = makeService({ list: vi.fn().mockReturnValue([{ id: 1 }]) } as Partial<ReservationsService>);
    expect(new ReservationsController(service, airtrailLink).list(user, '5')).toEqual({ reservations: [{ id: 1 }] });
  });

  it('creates, synchronizes the budget, broadcasts, and notifies', () => {
    const create = vi.fn().mockReturnValue({ reservation: { id: 9 }, accommodationCreated: true });
    const broadcast = vi.fn();
    const syncBudgetOnCreate = vi.fn();
    const notifyBookingChange = vi.fn();
    const service = makeService({
      create,
      broadcast,
      syncBudgetOnCreate,
      notifyBookingChange,
      referencesOutsideTrip: vi.fn().mockReturnValue([]),
    } as Partial<ReservationsService>);
    const body = { title: 'Hotel', type: 'lodging', create_budget_entry: { total_price: 200 } };

    expect(new ReservationsController(service, airtrailLink).create(user, '5', body, 'sock')).toEqual({ reservation: { id: 9 } });
    expect(broadcast).toHaveBeenCalledWith('5', 'accommodation:created', {}, 'sock');
    expect(syncBudgetOnCreate).toHaveBeenCalledWith('5', 9, 'Hotel', 'lodging', { total_price: 200 }, 'sock');
    expect(broadcast).toHaveBeenCalledWith('5', 'reservation:created', { reservation: { id: 9 } }, 'sock');
    expect(notifyBookingChange).toHaveBeenCalledWith('5', user.id, 'Hotel', 'lodging');
  });

  it('rejects a body id belonging to another trip before creating', () => {
    const create = vi.fn();
    const service = makeService({
      create,
      referencesOutsideTrip: vi.fn().mockReturnValue(['accommodation_id']),
    } as Partial<ReservationsService>);

    expect(thrown(() => new ReservationsController(service, airtrailLink).create(user, '5', { title: 'Hotel', accommodation_id: 4711 }))).toEqual({
      status: 400,
      body: { error: 'Not part of this trip: accommodation_id' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('updates positions and broadcasts', () => {
    const updatePositions = vi.fn();
    const broadcast = vi.fn();
    const service = makeService({ updatePositions, broadcast } as Partial<ReservationsService>);
    const positions = [{ id: 1, day_plan_position: 0 }];

    expect(new ReservationsController(service, airtrailLink).updatePositions(user, '5', { positions, day_id: 3 }, 'sock')).toEqual({ success: true });
    expect(updatePositions).toHaveBeenCalledWith('5', positions, 3);
    expect(broadcast).toHaveBeenCalledWith('5', 'reservation:positions', { positions, day_id: 3 }, 'sock');
  });

  it('returns 404 when updating a missing reservation', () => {
    const service = makeService({ getReservation: vi.fn().mockReturnValue(undefined) } as Partial<ReservationsService>);
    expect(thrown(() => new ReservationsController(service, airtrailLink).update(user, '5', '9', { title: 'X' }))).toEqual({
      status: 404,
      body: { error: 'Reservation not found' },
    });
  });

  it('updates, synchronizes the budget, broadcasts, and notifies', () => {
    const getReservation = vi.fn().mockReturnValue({ title: 'Old', type: 'lodging' });
    const update = vi.fn().mockReturnValue({ reservation: { id: 9 }, accommodationChanged: true });
    const broadcast = vi.fn();
    const syncBudgetOnUpdate = vi.fn();
    const notifyBookingChange = vi.fn();
    const service = makeService({
      getReservation,
      update,
      broadcast,
      syncBudgetOnUpdate,
      notifyBookingChange,
      referencesOutsideTrip: vi.fn().mockReturnValue([]),
    } as Partial<ReservationsService>);

    new ReservationsController(service, airtrailLink).update(user, '5', '9', { create_budget_entry: { total_price: 50 } }, 'sock');
    expect(broadcast).toHaveBeenCalledWith('5', 'accommodation:updated', {}, 'sock');
    expect(syncBudgetOnUpdate).toHaveBeenCalledWith('5', '9', '', undefined, 'Old', 'lodging', { total_price: 50 }, 'sock');
    expect(notifyBookingChange).toHaveBeenCalledWith('5', user.id, 'Old', 'lodging');
  });

  it('rejects foreign references before updating', () => {
    const update = vi.fn();
    const service = makeService({
      getReservation: vi.fn().mockReturnValue({ title: 'Old', type: 'lodging' }),
      update,
      referencesOutsideTrip: vi.fn().mockReturnValue(['day_id', 'place_id']),
    } as Partial<ReservationsService>);

    expect(thrown(() => new ReservationsController(service, airtrailLink).update(user, '5', '9', { day_id: 1, place_id: 2 }))).toEqual({
      status: 400,
      body: { error: 'Not part of this trip: day_id, place_id' },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('returns 404 when assigning travelers to a missing reservation', () => {
    const service = makeService({ setTravelers: vi.fn().mockReturnValue(null) } as Partial<ReservationsService>);
    expect(thrown(() => new ReservationsController(service, airtrailLink).updateTravelers(user, '5', '9', { user_ids: [1] }))).toEqual({
      status: 404,
      body: { error: 'Reservation not found' },
    });
  });

  it('assigns travelers, broadcasts, and returns the updated reservation', () => {
    const travelers = [{ user_id: 2, username: 'Sam', avatar: null, is_guest: 0 }];
    const reservation = { id: 9, travelers };
    const setTravelers = vi.fn().mockReturnValue({ travelers, reservation });
    const broadcast = vi.fn();
    const service = makeService({ setTravelers, broadcast } as Partial<ReservationsService>);

    expect(new ReservationsController(service, airtrailLink).updateTravelers(user, '5', '9', { user_ids: [2] }, 'sock')).toEqual({ travelers, reservation });
    expect(setTravelers).toHaveBeenCalledWith('9', '5', [2]);
    expect(broadcast).toHaveBeenCalledWith('5', 'reservation:travelers-updated', { reservationId: 9, travelers }, 'sock');
  });

  it('returns 404 when deleting a missing reservation', () => {
    const service = makeService({
      remove: vi.fn().mockReturnValue({ deleted: undefined, accommodationDeleted: false, deletedBudgetItemId: null }),
    } as Partial<ReservationsService>);
    expect(thrown(() => new ReservationsController(service, airtrailLink).remove(user, '5', '9'))).toEqual({
      status: 404,
      body: { error: 'Reservation not found' },
    });
  });

  it('broadcasts the delete cascade', () => {
    const remove = vi.fn().mockReturnValue({
      deleted: { id: 9, title: 'Hotel', type: 'lodging', accommodation_id: 3 },
      accommodationDeleted: true,
      deletedBudgetItemId: 7,
    });
    const broadcast = vi.fn();
    const service = makeService({ remove, broadcast } as Partial<ReservationsService>);

    expect(new ReservationsController(service, airtrailLink).remove(user, '5', '9', 'sock')).toEqual({ success: true });
    expect(broadcast).toHaveBeenCalledWith('5', 'accommodation:deleted', { accommodationId: 3 }, 'sock');
    expect(broadcast).toHaveBeenCalledWith('5', 'budget:deleted', { itemId: 7 }, 'sock');
    expect(broadcast).toHaveBeenCalledWith('5', 'reservation:deleted', { reservationId: 9 }, 'sock');
  });

  describe('PUT /:id/transit-endpoints', () => {
    const body = { from: { name: 'Keihan Fushimi-Inari Station', lat: 34.9685211, lng: 135.7691251 } };

    it('blocks demo users before changing the reservation', () => {
      isDemoEmail.mockReturnValueOnce(true);
      const service = makeService();

      expect(thrown(() => new ReservationsController(service, airtrailLink, demoEnv).updateTransitEndpoints(user, '5', '9', body))).toEqual({
        status: 403,
        body: { error: 'Write operations are disabled in demo mode.' },
      });
    });

    it('returns and broadcasts the updated reservation', () => {
      const reservation = { id: 9, title: 'A → B', type: 'transit' };
      const updateTransitRouteEndpoints = vi.fn().mockReturnValue(reservation);
      const broadcast = vi.fn();
      const notifyBookingChange = vi.fn();
      const service = makeService({ updateTransitRouteEndpoints, broadcast, notifyBookingChange } as Partial<ReservationsService>);

      expect(new ReservationsController(service, airtrailLink).updateTransitEndpoints(user, '5', '9', body, 'sock')).toEqual({ reservation });
      expect(updateTransitRouteEndpoints).toHaveBeenCalledWith('9', '5', body);
      expect(broadcast).toHaveBeenCalledWith('5', 'reservation:updated', { reservation }, 'sock');
      expect(notifyBookingChange).toHaveBeenCalledWith('5', user.id, 'A → B', 'transit');
    });

    it.each([
      ['INVALID_INPUT', 400],
      ['RESERVATION_NOT_FOUND', 404],
      ['NOT_TRANSIT', 400],
      ['ENDPOINT_STRUCTURE_INVALID', 409],
    ] as const)('maps %s to HTTP %s', (code, status) => {
      const error = new TransitRouteEndpointUpdateError(code, `error:${code}`);
      const service = makeService({
        updateTransitRouteEndpoints: vi.fn(() => { throw error; }),
      } as Partial<ReservationsService>);

      expect(thrown(() => new ReservationsController(service, airtrailLink).updateTransitEndpoints(user, '5', '9', body))).toEqual({
        status,
        body: { error: `error:${code}` },
      });
    });
  });
});
