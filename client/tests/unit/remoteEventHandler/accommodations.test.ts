import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTripStore } from '../../../src/store/tripStore';
import { resetAllStores } from '../../helpers/store';
import { buildTrip } from '../../helpers/factories';

beforeEach(() => {
  resetAllStores();
});

function buildAccommodation(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    trip_id: 1,
    place_id: 10,
    start_day_id: 1,
    end_day_id: 3,
    check_in: '14:00',
    check_in_end: null,
    check_out: '11:00',
    confirmation: null,
    notes: null,
    created_at: '2025-01-01T00:00:00.000Z',
    place_name: 'Test Hotel',
    place_address: null,
    place_image: null,
    place_lat: 48.85,
    place_lng: 2.35,
    reservation_title: null,
    ...overrides,
  };
}

describe('remoteEventHandler > accommodations', () => {
  it('FE-WSEVT-ACCOM-001: accommodation:created fires accommodations:refresh event', () => {
    useTripStore.setState({ trip: buildTrip({ id: 1 }) });
    const handler = vi.fn();
    window.addEventListener('accommodations:refresh', handler);
    useTripStore.getState().handleRemoteEvent({
      type: 'accommodation:created',
      accommodation: buildAccommodation(),
    });
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('accommodations:refresh', handler);
  });

  it('FE-WSEVT-ACCOM-002: accommodation:created with empty payload fires refresh safely (no deref)', () => {
    useTripStore.setState({ trip: buildTrip({ id: 1 }) });
    const handler = vi.fn();
    window.addEventListener('accommodations:refresh', handler);
    expect(() => {
      useTripStore.getState().handleRemoteEvent({ type: 'accommodation:created' });
    }).not.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('accommodations:refresh', handler);
  });

  it('FE-WSEVT-ACCOM-003: accommodation:updated fires accommodations:refresh event', () => {
    useTripStore.setState({ trip: buildTrip({ id: 1 }) });
    const handler = vi.fn();
    window.addEventListener('accommodations:refresh', handler);
    useTripStore.getState().handleRemoteEvent({
      type: 'accommodation:updated',
      accommodation: buildAccommodation({ id: 2 }),
    });
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('accommodations:refresh', handler);
  });

  it('FE-WSEVT-ACCOM-004: accommodation:updated with empty payload fires refresh safely', () => {
    useTripStore.setState({ trip: buildTrip({ id: 1 }) });
    const handler = vi.fn();
    window.addEventListener('accommodations:refresh', handler);
    expect(() => {
      useTripStore.getState().handleRemoteEvent({ type: 'accommodation:updated' });
    }).not.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('accommodations:refresh', handler);
  });

  it('FE-WSEVT-ACCOM-005: accommodation:deleted fires accommodations:refresh event', () => {
    useTripStore.setState({ trip: buildTrip({ id: 1 }) });
    const handler = vi.fn();
    window.addEventListener('accommodations:refresh', handler);
    useTripStore.getState().handleRemoteEvent({
      type: 'accommodation:deleted',
      accommodationId: 1,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('accommodations:refresh', handler);
  });
});
