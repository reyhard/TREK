import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTripStore } from '../../../src/store/tripStore';
import { resetAllStores } from '../../helpers/store';
import { buildReservation, buildTrip } from '../../helpers/factories';
import { offlineDb, clearAll } from '../../../src/db/offlineDb';

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

  it('FE-WSEVT-RESERV-006: reservation:updated leaves the other reservations untouched', () => {
    useTripStore.setState({
      reservations: [buildReservation({ id: 1, title: 'Hotel' }), buildReservation({ id: 2, title: 'Flight' })],
    });
    useTripStore.getState().handleRemoteEvent({
      type: 'reservation:updated',
      reservation: buildReservation({ id: 2, title: 'Flight (rebooked)' }),
    });
    const { reservations } = useTripStore.getState();
    expect(reservations[0].title).toBe('Hotel');
    expect(reservations[1].title).toBe('Flight (rebooked)');
  });

  // Traveler assignment (#1517) arrives as its own event carrying only the list.
  it('FE-WSEVT-RESERV-007: reservation:travelers-updated replaces travelers on the addressed booking', () => {
    useTripStore.setState({
      reservations: [buildReservation({ id: 1 }), buildReservation({ id: 2 })],
    });
    const travelers = [{ user_id: 3, username: 'ada' }, { user_id: 4, username: 'grace' }];
    useTripStore.getState().handleRemoteEvent({
      type: 'reservation:travelers-updated',
      reservationId: 2,
      travelers,
    });
    const { reservations } = useTripStore.getState();
    expect(reservations[1].travelers).toEqual(travelers);
    expect(reservations[0].travelers).toBeUndefined();
  });

  it('FE-WSEVT-RESERV-008: reservation:travelers-updated for an unknown booking changes nothing', () => {
    useTripStore.setState({ reservations: [buildReservation({ id: 1 })] });
    useTripStore.getState().handleRemoteEvent({
      type: 'reservation:travelers-updated',
      reservationId: 999,
      travelers: [{ user_id: 3, username: 'ada' }],
    });
    expect(useTripStore.getState().reservations[0].travelers).toBeUndefined();
  });

  it('FE-WSEVT-RESERV-009: reservation:positions with day_id applies day_positions, not global day_plan_position', () => {
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
  });

  it('FE-WSEVT-RESERV-010: reservation:positions with MCP dayId variant applies day_positions, not global day_plan_position', () => {
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
      dayId: 5,
    });
    const { reservations } = useTripStore.getState();
    expect(reservations[0].day_plan_position).toBe(2);
    expect(reservations[0].day_positions).toEqual({ '5': 1.5 });
  });

  it('FE-WSEVT-RESERV-011: reservation:positions without a day scope updates global day_plan_position', () => {
    const reservation = buildReservation({ id: 10, title: 'Hotel', day_plan_position: 0, day_positions: null });
    useTripStore.setState({ reservations: [reservation] });
    useTripStore.getState().handleRemoteEvent({
      type: 'reservation:positions',
      positions: [{ id: 10, day_plan_position: 3 }],
    });
    const { reservations } = useTripStore.getState();
    expect(reservations[0].day_plan_position).toBe(3);
    expect(reservations[0].day_positions).toEqual(null);
  });

  it('FE-WSEVT-RESERV-012: reservation:positions with day_id preserves day_positions on other days', () => {
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
    expect(useTripStore.getState().reservations[0].day_positions).toEqual({ '5': 1.0, '6': 2.0, '7': 3.5 });
  });

  it('FE-WSEVT-RESERV-013: reservation:positions with dayId variant preserves day_positions on other days', () => {
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
      dayId: 7,
    });
    expect(useTripStore.getState().reservations[0].day_positions).toEqual({ '5': 1.0, '6': 2.0, '7': 3.5 });
  });

  // The wire contract lets an item omit day_plan_position entirely — the legacy
  // route then binds NULL (clears) for the global slot and 0 for a day slot.
  // The reducer must not treat an omitted value as a no-op.
  it('FE-WSEVT-RESERV-016: reservation:positions without a day scope and omitted day_plan_position clears the global position', () => {
    const reservation = buildReservation({ id: 10, title: 'Hotel', day_plan_position: 2, day_positions: null });
    useTripStore.setState({ reservations: [reservation] });
    useTripStore.getState().handleRemoteEvent({
      type: 'reservation:positions',
      positions: [{ id: 10 }],
    });
    const { reservations } = useTripStore.getState();
    expect(reservations[0].day_plan_position).toBeNull();
    expect(reservations[0].day_positions).toEqual(null);
  });

  it('FE-WSEVT-RESERV-017: reservation:positions with day_id and omitted day_plan_position zeroes the day position', () => {
    const reservation = buildReservation({
      id: 10,
      title: 'Multi-day Train',
      type: 'transit',
      day_id: 5,
      end_day_id: 7,
      day_plan_position: 2,
      day_positions: { '5': 1.5 },
    });
    useTripStore.setState({ reservations: [reservation] });
    useTripStore.getState().handleRemoteEvent({
      type: 'reservation:positions',
      positions: [{ id: 10 }],
      day_id: 5,
    });
    const { reservations } = useTripStore.getState();
    expect(reservations[0].day_plan_position).toBe(2);
    expect(reservations[0].day_positions).toEqual({ '5': 0 });
  });
});

describe('remoteEventHandler > reservations > offline persistence', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('FE-WSEVT-RESERV-014: reservation:positions with day_id persists day_positions to IndexedDB for offline reload', async () => {
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
    await vi.waitFor(async () => {
      const cached = await offlineDb.reservations.get(10);
      expect(cached?.day_positions).toEqual({ '5': 1.5 });
    });
  });

  it('FE-WSEVT-RESERV-015: reservation:positions with MCP dayId variant persists day_positions to IndexedDB for offline reload', async () => {
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
      dayId: 5,
    });
    await vi.waitFor(async () => {
      const cached = await offlineDb.reservations.get(10);
      expect(cached?.day_positions).toEqual({ '5': 1.5 });
    });
  });

  it('FE-WSEVT-RESERV-018: reservation:positions global clear persists the cleared position to IndexedDB for offline reload', async () => {
    const reservation = buildReservation({ id: 10, title: 'Hotel', day_plan_position: 2, day_positions: null });
    useTripStore.setState({ reservations: [reservation] });
    useTripStore.getState().handleRemoteEvent({
      type: 'reservation:positions',
      positions: [{ id: 10 }],
    });
    await vi.waitFor(async () => {
      const cached = await offlineDb.reservations.get(10);
      expect(cached?.day_plan_position).toBeNull();
    });
  });
});
