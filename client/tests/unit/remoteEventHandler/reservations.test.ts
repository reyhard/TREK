import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    expect(reservations[0].id).toBe(99);
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

  it('FE-WSEVT-RESERV-006b: reservation:positions with day_id applies day_positions', () => {
    const reservation = buildReservation({
      id: 10,
      title: 'Multi-day Train',
      type: 'transit',
      day_id: 5,
      end_day_id: 7,
      day_plan_position: 2,
      day_positions: null,
    });
    useTripStore.setState({ reservations: [reservation] });
    useTripStore.getState().handleRemoteEvent({
      type: 'reservation:positions',
      positions: [{ id: 10, day_plan_position: 1.5 }],
      day_id: 5,
    });
    const { reservations } = useTripStore.getState();
    expect(reservations).toHaveLength(1);
    expect(reservations[0].day_plan_position).toBe(2);
    expect(reservations[0].day_positions).toEqual({ '5': 1.5 });
    expect(reservations[0].title).toBe('Multi-day Train');
    expect(reservations[0].end_day_id).toBe(7);
  });

  it('FE-WSEVT-RESERV-006c: reservation:positions preserves existing day_positions on other days', () => {
    const reservation = buildReservation({
      id: 10,
      title: 'Multi-day Train',
      type: 'transit',
      day_id: 5,
      end_day_id: 7,
      day_positions: { '5': 1.0, '6': 2.0 },
    });
    useTripStore.setState({ reservations: [reservation] });
    useTripStore.getState().handleRemoteEvent({
      type: 'reservation:positions',
      positions: [{ id: 10, day_plan_position: 3.5 }],
      day_id: 7,
    });
    const { reservations } = useTripStore.getState();
    expect(reservations[0].day_positions).toEqual({ '5': 1.0, '6': 2.0, '7': 3.5 });
  });

  it('FE-WSEVT-RESERV-009: reservation:updated preserves existing day_positions when payload omits them', () => {
    const existing = buildReservation({
      id: 10,
      title: 'Train',
      type: 'transit',
      day_id: 5,
      day_positions: { '5': 1.5 },
    });
    useTripStore.setState({ reservations: [existing] });
    const updated = buildReservation({ id: 10, title: 'Train Updated', type: 'transit' });
    useTripStore.getState().handleRemoteEvent({ type: 'reservation:updated', reservation: updated });
    const { reservations } = useTripStore.getState();
    expect(reservations[0].title).toBe('Train Updated');
    expect(reservations[0].day_positions).toEqual({ '5': 1.5 });
  });

  it('FE-WSEVT-RESERV-009b: reservation:updated uses new day_positions when payload provides them', () => {
    const existing = buildReservation({
      id: 10,
      title: 'Train',
      type: 'transit',
      day_id: 5,
      day_positions: { '5': 1.5 },
    });
    useTripStore.setState({ reservations: [existing] });
    const updated = buildReservation({
      id: 10,
      title: 'Train Updated',
      type: 'transit',
      day_positions: { '5': 2.0, '6': 3.0 } as Record<string, number>,
    });
    useTripStore.getState().handleRemoteEvent({ type: 'reservation:updated', reservation: updated });
    const { reservations } = useTripStore.getState();
    expect(reservations[0].title).toBe('Train Updated');
    expect(reservations[0].day_positions).toEqual({ '5': 2.0, '6': 3.0 });
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

  it('FE-WSEVT-RESERV-010: reservation:deleted dispatches visibility:stale-connection event for in-memory sync', () => {
    const trip = buildTrip({ id: 1 });
    const reservation = buildReservation({ id: 10 });
    useTripStore.setState({ trip, reservations: [reservation] });
    const handler = vi.fn();
    window.addEventListener('visibility:stale-connection', handler);
    useTripStore.getState().handleRemoteEvent({ type: 'reservation:deleted', reservationId: 10 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ tripId: 1, reservationId: 10 });
    window.removeEventListener('visibility:stale-connection', handler);
  });
});
