import { describe, it, expect, beforeEach } from 'vitest';
import { useTripStore } from '../../../src/store/tripStore';
import { resetAllStores } from '../../helpers/store';
import { buildReservation, buildTrip } from '../../helpers/factories';

beforeEach(() => {
  resetAllStores();
});

describe('remoteEventHandler > reservations', () => {
  const seedData = () => {
    useTripStore.setState({
      reservations: [buildReservation({ id: 1, title: 'Hotel Paris' })],
    });
  };

  it('FE-WSEVT-RESERV-001: reservation:created prepends new reservation to array', () => {
    seedData();
    const newRes = buildReservation({ id: 99, title: 'Flight' });
    useTripStore.getState().handleRemoteEvent({ type: 'reservation:created', reservation: newRes });
    const { reservations } = useTripStore.getState();
    expect(reservations).toHaveLength(2);
    expect(reservations[0].id).toBe(99); // prepended, so first
  });

  it('FE-WSEVT-RESERV-002: reservation:created is idempotent — no duplicate if same ID', () => {
    seedData();
    const duplicate = buildReservation({ id: 1, title: 'Hotel Paris Dup' });
    useTripStore.getState().handleRemoteEvent({ type: 'reservation:created', reservation: duplicate });
    const { reservations } = useTripStore.getState();
    expect(reservations).toHaveLength(1);
    expect(reservations[0].title).toBe('Hotel Paris');
  });

  it('FE-WSEVT-RESERV-003: reservation:updated replaces reservation in array', () => {
    seedData();
    const updated = buildReservation({ id: 1, title: 'Hotel Lyon' });
    useTripStore.getState().handleRemoteEvent({ type: 'reservation:updated', reservation: updated });
    const { reservations } = useTripStore.getState();
    expect(reservations[0].title).toBe('Hotel Lyon');
  });

  it('FE-WSEVT-RESERV-004: reservation:deleted removes reservation by ID', () => {
    seedData();
    useTripStore.getState().handleRemoteEvent({ type: 'reservation:deleted', reservationId: 1 });
    const { reservations } = useTripStore.getState();
    expect(reservations).toHaveLength(0);
  });

  it('FE-WSEVT-RESERV-005: reservation:created ordering — newest is first', () => {
    seedData();
    const r2 = buildReservation({ id: 2, title: 'Second' });
    const r3 = buildReservation({ id: 3, title: 'Third' });
    useTripStore.getState().handleRemoteEvent({ type: 'reservation:created', reservation: r2 });
    useTripStore.getState().handleRemoteEvent({ type: 'reservation:created', reservation: r3 });
    const { reservations } = useTripStore.getState();
    expect(reservations[0].id).toBe(3);
    expect(reservations[1].id).toBe(2);
    expect(reservations[2].id).toBe(1);
  });

  it('FE-WSEVT-RESERV-006: reservation:positions updates day_plan_position without erasing metadata/endpoints', () => {
    const reservation = buildReservation({
      id: 10,
      title: 'Flight ABC',
      type: 'transit',
      day_id: 5,
      metadata: JSON.stringify({ transit: { legs: [{ mode: 'WALK', duration: 300, distance: 400 }] } }),
      endpoints: [
        { role: 'from', sequence: 1, name: 'City A', lat: 0, lng: 0, code: null, timezone: null, local_time: null, local_date: null },
        { role: 'to', sequence: 2, name: 'City B', lat: 1, lng: 1, code: null, timezone: null, local_time: null, local_date: null },
      ],
    });
    useTripStore.setState({ reservations: [reservation] });
    useTripStore.getState().handleRemoteEvent({
      type: 'reservation:positions',
      positions: [{ id: 10, day_plan_position: 3 }],
    });
    const { reservations } = useTripStore.getState();
    expect(reservations).toHaveLength(1);
    expect(reservations[0].day_plan_position).toBe(3);
    expect(reservations[0].title).toBe('Flight ABC');
    expect(reservations[0].metadata).toBe(reservation.metadata);
    expect(reservations[0].endpoints).toHaveLength(2);
    expect(reservations[0].day_id).toBe(5);
  });

  it('FE-WSEVT-RESERV-007: reservation:deleted removes reservation and cleans stale visibility reference', () => {
    const trip = buildTrip({ id: 1 });
    const reservation = buildReservation({ id: 10 });
    useTripStore.setState({ trip, reservations: [reservation] });
    const key = 'trek:visible-connections:1';
    localStorage.setItem(key, JSON.stringify({ mode: 'only', ids: [1, 10, 20] }));
    useTripStore.getState().handleRemoteEvent({ type: 'reservation:deleted', reservationId: 10 });
    expect(useTripStore.getState().reservations).toHaveLength(0);
    const stored = JSON.parse(localStorage.getItem(key)!);
    expect(stored.ids).toEqual([1, 20]);
  });

  it('FE-WSEVT-RESERV-008: reservation:deleted handles missing localStorage gracefully', () => {
    useTripStore.setState({ trip: buildTrip({ id: 1 }), reservations: [buildReservation({ id: 99 })] });
    expect(() => {
      useTripStore.getState().handleRemoteEvent({ type: 'reservation:deleted', reservationId: 99 });
    }).not.toThrow();
    expect(useTripStore.getState().reservations).toHaveLength(0);
  });
});
