import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAssignment, buildPlace } from '../../../tests/helpers/factories';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { assignmentsApi } from '../../api/client';
import { useTripStore } from '../tripStore';

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    assignmentsApi: {
      ...actual.assignmentsApi,
      list: vi.fn(),
      updateTime: vi.fn(),
    },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('assignmentsSlice.setAssignmentTime', () => {
  beforeEach(() => {
    resetAllStores();
    vi.clearAllMocks();
    vi.mocked(assignmentsApi.list).mockRejectedValue(new Error('authoritative day refresh unavailable'));
  });

  it('reconciles the authoritative full-day order after a successful timed move', async () => {
    const first = buildAssignment({
      id: 98,
      day_id: 10,
      order_index: 0,
      assignment_time: '10:00',
      assignment_end_time: '11:00',
      place: buildPlace({ id: 11, name: 'A', place_time: '10:00', end_time: '11:00' }),
    });
    const second = buildAssignment({
      id: 99,
      day_id: 10,
      order_index: 1,
      assignment_time: '11:00',
      assignment_end_time: '12:00',
      place: buildPlace({ id: 12, name: 'B', place_time: '11:00', end_time: '12:00' }),
    });
    const movedSecond = {
      ...second,
      order_index: 0,
      assignment_time: '09:00',
      assignment_end_time: '10:00',
      place: { ...second.place, place_time: '09:00', end_time: '10:00' },
    };
    const reorderedFirst = { ...first, order_index: 1 };
    seedStore(useTripStore, { assignments: { '10': [first, second] } });
    vi.mocked(assignmentsApi.updateTime).mockResolvedValue({ assignment: movedSecond });
    vi.mocked(assignmentsApi.list).mockResolvedValue({ assignments: [movedSecond, reorderedFirst] });

    await useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' });

    expect(assignmentsApi.list).toHaveBeenCalledWith(1, 10);
    expect(useTripStore.getState().assignments['10'].map((assignment) => assignment.id)).toEqual([99, 98]);
    expect(useTripStore.getState().assignments['10'].map((assignment) => assignment.order_index)).toEqual([0, 1]);
  });

  it('does not apply an older full-day refresh after another assignment starts updating on the same day', async () => {
    const first = buildAssignment({
      id: 98,
      day_id: 10,
      order_index: 0,
      place: buildPlace({ id: 11, name: 'A', place_time: '10:00', end_time: '11:00' }),
    });
    const second = buildAssignment({
      id: 99,
      day_id: 10,
      order_index: 1,
      place: buildPlace({ id: 12, name: 'B', place_time: '11:00', end_time: '12:00' }),
    });
    const firstUpdate = deferred<{ assignment: typeof first }>();
    const secondUpdate = deferred<{ assignment: typeof second }>();
    const firstRefresh = deferred<{ assignments: (typeof first)[] }>();
    const secondRefresh = deferred<{ assignments: (typeof first)[] }>();
    const firstMoved = { ...first, assignment_time: '09:00', assignment_end_time: '10:00' };
    const secondMoved = { ...second, assignment_time: '08:00', assignment_end_time: '09:00' };
    seedStore(useTripStore, { assignments: { '10': [first, second] } });
    vi.mocked(assignmentsApi.updateTime)
      .mockReturnValueOnce(firstUpdate.promise)
      .mockReturnValueOnce(secondUpdate.promise);
    vi.mocked(assignmentsApi.list).mockReturnValueOnce(firstRefresh.promise).mockReturnValueOnce(secondRefresh.promise);

    const older = useTripStore.getState().setAssignmentTime(1, 10, 98, { place_time: '09:00' });
    firstUpdate.resolve({ assignment: firstMoved });
    await vi.waitFor(() => expect(assignmentsApi.list).toHaveBeenCalledTimes(1));
    const newer = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '08:00' });
    secondUpdate.resolve({ assignment: secondMoved });
    await vi.waitFor(() => expect(assignmentsApi.list).toHaveBeenCalledTimes(2));
    secondRefresh.resolve({ assignments: [secondMoved, { ...firstMoved, order_index: 1 }] });
    await newer;
    firstRefresh.resolve({ assignments: [firstMoved, { ...second, order_index: 1 }] });
    await older;

    expect(useTripStore.getState().assignments['10'][0]?.id).toBe(99);
    expect(useTripStore.getState().assignments['10'][0]?.assignment_time).toBe('08:00');
  });

  it('reconciles the authoritative day after a newer same-day update fails', async () => {
    const first = buildAssignment({
      id: 98,
      day_id: 10,
      order_index: 0,
      assignment_time: '10:00',
      assignment_end_time: '11:00',
      place: buildPlace({ id: 11, name: 'A', place_time: '10:00', end_time: '11:00' }),
    });
    const second = buildAssignment({
      id: 99,
      day_id: 10,
      order_index: 1,
      assignment_time: '11:00',
      assignment_end_time: '12:00',
      place: buildPlace({ id: 12, name: 'B', place_time: '11:00', end_time: '12:00' }),
    });
    const firstUpdate = deferred<{ assignment: typeof first }>();
    const secondUpdate = deferred<{ assignment: typeof second }>();
    const staleRefresh = deferred<{ assignments: (typeof first)[] }>();
    const firstMoved = {
      ...first,
      order_index: 1,
      assignment_time: '12:00',
      assignment_end_time: '13:00',
      place: { ...first.place, place_time: '12:00', end_time: '13:00' },
    };
    const authoritativeSecond = { ...second, order_index: 0 };
    seedStore(useTripStore, { assignments: { '10': [first, second] } });
    vi.mocked(assignmentsApi.updateTime)
      .mockReturnValueOnce(firstUpdate.promise)
      .mockReturnValueOnce(secondUpdate.promise);
    vi.mocked(assignmentsApi.list)
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce({ assignments: [authoritativeSecond, firstMoved] });

    const older = useTripStore.getState().setAssignmentTime(1, 10, 98, { place_time: '12:00' });
    firstUpdate.resolve({ assignment: firstMoved });
    await vi.waitFor(() => expect(assignmentsApi.list).toHaveBeenCalledTimes(1));

    const newer = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' });
    staleRefresh.resolve({ assignments: [authoritativeSecond, firstMoved] });
    await older;
    secondUpdate.reject(new Error('placement conflicts'));
    await expect(newer).rejects.toThrow('placement conflicts');

    await vi.waitFor(() => {
      expect(useTripStore.getState().assignments['10']).toEqual([authoritativeSecond, firstMoved]);
    });
  });

  it('retries a transient day refresh failure before reporting timing success', async () => {
    const first = buildAssignment({
      id: 98,
      day_id: 10,
      order_index: 0,
      assignment_time: '10:00',
      assignment_end_time: '11:00',
      place: buildPlace({ id: 11, name: 'A', place_time: '10:00', end_time: '11:00' }),
    });
    const second = buildAssignment({
      id: 99,
      day_id: 10,
      order_index: 1,
      assignment_time: '11:00',
      assignment_end_time: '12:00',
      place: buildPlace({ id: 12, name: 'B', place_time: '11:00', end_time: '12:00' }),
    });
    const movedSecond = {
      ...second,
      order_index: 0,
      assignment_time: '09:00',
      assignment_end_time: '10:00',
      place: { ...second.place, place_time: '09:00', end_time: '10:00' },
    };
    const reorderedFirst = { ...first, order_index: 1 };
    seedStore(useTripStore, { assignments: { '10': [first, second] } });
    vi.mocked(assignmentsApi.updateTime).mockResolvedValue({ assignment: movedSecond });
    vi.mocked(assignmentsApi.list)
      .mockRejectedValueOnce(new Error('authoritative day refresh unavailable'))
      .mockResolvedValueOnce({ assignments: [movedSecond, reorderedFirst] });

    await useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' });

    expect(assignmentsApi.list).toHaveBeenCalledTimes(2);
    expect(useTripStore.getState().assignments['10']).toEqual([movedSecond, reorderedFirst]);
  });

  it('reports reconciliation failure after bounded day refresh attempts', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      assignment_time: '11:00',
      assignment_end_time: '12:00',
      place: buildPlace({ id: 12, place_time: '11:00', end_time: '12:00' }),
    });
    const updated = {
      ...original,
      assignment_time: '09:00',
      assignment_end_time: '10:00',
      place: { ...original.place, place_time: '09:00', end_time: '10:00' },
    };
    seedStore(useTripStore, { assignments: { '10': [original] } });
    vi.mocked(assignmentsApi.updateTime).mockResolvedValue({ assignment: updated });
    vi.mocked(assignmentsApi.list).mockRejectedValue(new Error('authoritative day refresh unavailable'));

    await expect(useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })).rejects.toThrow(
      'authoritative day refresh unavailable'
    );

    expect(assignmentsApi.list).toHaveBeenCalledTimes(2);
  });

  it('replaces the complete assignment projection with the authoritative response', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      assignment_time: '08:00',
      assignment_end_time: '09:00',
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00', duration_minutes: 60 }),
    });
    const updated = {
      ...original,
      assignment_time: '09:00',
      assignment_end_time: '10:30',
      order_index: 3,
      place: { ...original.place, place_time: '09:00', end_time: '10:30', duration_minutes: 90 },
    };
    seedStore(useTripStore, { assignments: { '10': [original] } });
    vi.mocked(assignmentsApi.updateTime).mockResolvedValue({ assignment: updated });
    vi.mocked(assignmentsApi.list).mockResolvedValue({ assignments: [updated] });

    await expect(useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })).resolves.toEqual(
      updated
    );

    expect(useTripStore.getState().assignments['10']).toEqual([updated]);
  });

  it('restores the prior assignments map when the time update fails', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }),
    });
    const otherDay = buildAssignment({ id: 100, day_id: 11 });
    const previous = { '10': [original], '11': [otherDay] };
    seedStore(useTripStore, { assignments: previous });
    vi.mocked(assignmentsApi.updateTime).mockRejectedValue(new Error('placement conflicts'));

    await expect(useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })).rejects.toThrow(
      'placement conflicts'
    );

    expect(useTripStore.getState().assignments).toEqual(previous);
  });

  it('clears top-level and embedded effective times optimistically for an explicit null start time', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      assignment_time: '08:00',
      assignment_end_time: '09:00',
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }),
    });
    const response = deferred<{ assignment: typeof original }>();
    seedStore(useTripStore, { assignments: { '10': [original] } });
    vi.mocked(assignmentsApi.updateTime).mockReturnValue(response.promise);
    vi.mocked(assignmentsApi.list).mockResolvedValue({ assignments: [original] });

    const update = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: null });

    expect(useTripStore.getState().assignments['10'][0]).toMatchObject({
      assignment_time: null,
      assignment_end_time: null,
      place: { place_time: null, end_time: null },
    });

    response.resolve({ assignment: original });
    await update;
  });

  it('keeps the newer authoritative assignment when an older update resolves last', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }),
    });
    const older = {
      ...original,
      assignment_time: '09:00',
      assignment_end_time: '10:00',
      place: { ...original.place, place_time: '09:00', end_time: '10:00' },
    };
    const newer = {
      ...original,
      assignment_time: '10:00',
      assignment_end_time: '11:00',
      place: { ...original.place, place_time: '10:00', end_time: '11:00' },
    };
    const firstResponse = deferred<{ assignment: typeof original }>();
    const secondResponse = deferred<{ assignment: typeof original }>();
    seedStore(useTripStore, { assignments: { '10': [original] } });
    vi.mocked(assignmentsApi.updateTime)
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    vi.mocked(assignmentsApi.list).mockResolvedValue({ assignments: [newer] });

    const first = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' });
    const second = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '10:00' });
    secondResponse.resolve({ assignment: newer });
    await second;
    firstResponse.resolve({ assignment: older });
    await first;

    expect(useTripStore.getState().assignments['10']).toEqual([newer]);
  });

  it('keeps the newer authoritative assignment when an older update fails last', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }),
    });
    const newer = {
      ...original,
      assignment_time: '10:00',
      assignment_end_time: '11:00',
      place: { ...original.place, place_time: '10:00', end_time: '11:00' },
    };
    const firstResponse = deferred<{ assignment: typeof original }>();
    const secondResponse = deferred<{ assignment: typeof original }>();
    seedStore(useTripStore, { assignments: { '10': [original] } });
    vi.mocked(assignmentsApi.updateTime)
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);
    vi.mocked(assignmentsApi.list).mockResolvedValue({ assignments: [newer] });

    const first = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' });
    const second = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '10:00' });
    secondResponse.resolve({ assignment: newer });
    await second;
    firstResponse.reject(new Error('placement conflicts'));
    await expect(first).rejects.toThrow('placement conflicts');

    expect(useTripStore.getState().assignments['10']).toEqual([newer]);
  });

  it('rolls back only the failed assignment while preserving unrelated changes', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }),
    });
    const unrelated = buildAssignment({ id: 100, day_id: 11, place: buildPlace({ id: 13, name: 'Before' }) });
    const response = deferred<{ assignment: typeof original }>();
    seedStore(useTripStore, { assignments: { '10': [original], '11': [unrelated] } });
    vi.mocked(assignmentsApi.updateTime).mockReturnValue(response.promise);

    const update = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' });
    useTripStore.setState((state) => ({
      assignments: {
        ...state.assignments,
        '11': [{ ...unrelated, place: { ...unrelated.place, name: 'Changed elsewhere' } }],
      },
    }));
    response.reject(new Error('placement conflicts'));
    await expect(update).rejects.toThrow('placement conflicts');

    expect(useTripStore.getState().assignments).toEqual({
      '10': [original],
      '11': [{ ...unrelated, place: { ...unrelated.place, name: 'Changed elsewhere' } }],
    });
  });

  it('upserts an authoritative response into its returned day when the local row is absent', async () => {
    const stale = buildAssignment({
      id: 99,
      day_id: 11,
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }),
    });
    const updated = {
      ...stale,
      day_id: 12,
      assignment_time: '10:00',
      assignment_end_time: '11:00',
      place: { ...stale.place, place_time: '10:00', end_time: '11:00' },
    };
    seedStore(useTripStore, { assignments: { '11': [stale] } });
    vi.mocked(assignmentsApi.updateTime).mockResolvedValue({ assignment: updated });
    vi.mocked(assignmentsApi.list).mockResolvedValue({ assignments: [updated] });

    await expect(useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '10:00' })).resolves.toEqual(
      updated
    );

    expect(useTripStore.getState().assignments).toEqual({ '11': [], '12': [updated] });
  });

  it('rolls back two failed updates to the original confirmed assignment', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }),
    });
    const firstResponse = deferred<{ assignment: typeof original }>();
    const secondResponse = deferred<{ assignment: typeof original }>();
    seedStore(useTripStore, { assignments: { '10': [original] } });
    vi.mocked(assignmentsApi.updateTime)
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);

    const first = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' });
    const second = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '10:00' });
    firstResponse.reject(new Error('first rejected'));
    await expect(first).rejects.toThrow('first rejected');
    secondResponse.reject(new Error('second rejected'));
    await expect(second).rejects.toThrow('second rejected');

    expect(useTripStore.getState().assignments['10']).toEqual([original]);
  });

  it('rolls back a failed newer update to an older authoritative response', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }),
    });
    const firstAuthoritative = {
      ...original,
      assignment_time: '09:00',
      assignment_end_time: '10:00',
      place: { ...original.place, place_time: '09:00', end_time: '10:00' },
    };
    const firstResponse = deferred<{ assignment: typeof original }>();
    const secondResponse = deferred<{ assignment: typeof original }>();
    seedStore(useTripStore, { assignments: { '10': [original] } });
    vi.mocked(assignmentsApi.updateTime)
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise);

    const first = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' });
    const second = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '10:00' });
    firstResponse.resolve({ assignment: firstAuthoritative });
    await first;

    expect(useTripStore.getState().assignments['10'][0]?.place).toMatchObject({ place_time: '10:00' });

    secondResponse.reject(new Error('second rejected'));
    await expect(second).rejects.toThrow('second rejected');

    expect(useTripStore.getState().assignments['10']).toEqual([firstAuthoritative]);
  });
});
