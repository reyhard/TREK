import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assignmentsApi } from '../../api/client'
import { useTripStore } from '../tripStore'
import { buildAssignment, buildPlace } from '../../../tests/helpers/factories'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  return {
    ...actual,
    assignmentsApi: {
      ...actual.assignmentsApi,
      updateTime: vi.fn(),
    },
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('assignmentsSlice.setAssignmentTime', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
  })

  it('replaces the complete assignment projection with the authoritative response', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      assignment_time: '08:00',
      assignment_end_time: '09:00',
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00', duration_minutes: 60 }),
    })
    const updated = {
      ...original,
      assignment_time: '09:00',
      assignment_end_time: '10:30',
      order_index: 3,
      place: { ...original.place, place_time: '09:00', end_time: '10:30', duration_minutes: 90 },
    }
    seedStore(useTripStore, { assignments: { '10': [original] } })
    vi.mocked(assignmentsApi.updateTime).mockResolvedValue({ assignment: updated })

    await expect(useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })).resolves.toEqual(updated)

    expect(useTripStore.getState().assignments['10']).toEqual([updated])
  })

  it('restores the prior assignments map when the time update fails', async () => {
    const original = buildAssignment({ id: 99, day_id: 10, place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }) })
    const otherDay = buildAssignment({ id: 100, day_id: 11 })
    const previous = { '10': [original], '11': [otherDay] }
    seedStore(useTripStore, { assignments: previous })
    vi.mocked(assignmentsApi.updateTime).mockRejectedValue(new Error('placement conflicts'))

    await expect(useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })).rejects.toThrow('placement conflicts')

    expect(useTripStore.getState().assignments).toEqual(previous)
  })

  it('clears the embedded effective times optimistically for an explicit null start time', async () => {
    const original = buildAssignment({
      id: 99,
      day_id: 10,
      assignment_time: '08:00',
      assignment_end_time: '09:00',
      place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }),
    })
    const response = deferred<{ assignment: typeof original }>()
    seedStore(useTripStore, { assignments: { '10': [original] } })
    vi.mocked(assignmentsApi.updateTime).mockReturnValue(response.promise)

    const update = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: null })

    expect(useTripStore.getState().assignments['10'][0]?.place).toMatchObject({ place_time: null, end_time: null })

    response.resolve({ assignment: original })
    await update
  })

  it('keeps the newer authoritative assignment when an older update resolves last', async () => {
    const original = buildAssignment({ id: 99, day_id: 10, place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }) })
    const older = { ...original, assignment_time: '09:00', assignment_end_time: '10:00', place: { ...original.place, place_time: '09:00', end_time: '10:00' } }
    const newer = { ...original, assignment_time: '10:00', assignment_end_time: '11:00', place: { ...original.place, place_time: '10:00', end_time: '11:00' } }
    const firstResponse = deferred<{ assignment: typeof original }>()
    const secondResponse = deferred<{ assignment: typeof original }>()
    seedStore(useTripStore, { assignments: { '10': [original] } })
    vi.mocked(assignmentsApi.updateTime)
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise)

    const first = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })
    const second = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '10:00' })
    secondResponse.resolve({ assignment: newer })
    await second
    firstResponse.resolve({ assignment: older })
    await first

    expect(useTripStore.getState().assignments['10']).toEqual([newer])
  })

  it('keeps the newer authoritative assignment when an older update fails last', async () => {
    const original = buildAssignment({ id: 99, day_id: 10, place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }) })
    const newer = { ...original, assignment_time: '10:00', assignment_end_time: '11:00', place: { ...original.place, place_time: '10:00', end_time: '11:00' } }
    const firstResponse = deferred<{ assignment: typeof original }>()
    const secondResponse = deferred<{ assignment: typeof original }>()
    seedStore(useTripStore, { assignments: { '10': [original] } })
    vi.mocked(assignmentsApi.updateTime)
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise)

    const first = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })
    const second = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '10:00' })
    secondResponse.resolve({ assignment: newer })
    await second
    firstResponse.reject(new Error('placement conflicts'))
    await expect(first).rejects.toThrow('placement conflicts')

    expect(useTripStore.getState().assignments['10']).toEqual([newer])
  })

  it('rolls back only the failed assignment while preserving unrelated changes', async () => {
    const original = buildAssignment({ id: 99, day_id: 10, place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }) })
    const unrelated = buildAssignment({ id: 100, day_id: 11, place: buildPlace({ id: 13, name: 'Before' }) })
    const response = deferred<{ assignment: typeof original }>()
    seedStore(useTripStore, { assignments: { '10': [original], '11': [unrelated] } })
    vi.mocked(assignmentsApi.updateTime).mockReturnValue(response.promise)

    const update = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })
    useTripStore.setState(state => ({
      assignments: {
        ...state.assignments,
        '11': [{ ...unrelated, place: { ...unrelated.place, name: 'Changed elsewhere' } }],
      },
    }))
    response.reject(new Error('placement conflicts'))
    await expect(update).rejects.toThrow('placement conflicts')

    expect(useTripStore.getState().assignments).toEqual({
      '10': [original],
      '11': [{ ...unrelated, place: { ...unrelated.place, name: 'Changed elsewhere' } }],
    })
  })

  it('upserts an authoritative response into its returned day when the local row is absent', async () => {
    const stale = buildAssignment({ id: 99, day_id: 11, place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }) })
    const updated = { ...stale, day_id: 12, assignment_time: '10:00', assignment_end_time: '11:00', place: { ...stale.place, place_time: '10:00', end_time: '11:00' } }
    seedStore(useTripStore, { assignments: { '11': [stale] } })
    vi.mocked(assignmentsApi.updateTime).mockResolvedValue({ assignment: updated })

    await expect(useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '10:00' })).resolves.toEqual(updated)

    expect(useTripStore.getState().assignments).toEqual({ '11': [], '12': [updated] })
  })

  it('rolls back two failed updates to the original confirmed assignment', async () => {
    const original = buildAssignment({ id: 99, day_id: 10, place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }) })
    const firstResponse = deferred<{ assignment: typeof original }>()
    const secondResponse = deferred<{ assignment: typeof original }>()
    seedStore(useTripStore, { assignments: { '10': [original] } })
    vi.mocked(assignmentsApi.updateTime)
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise)

    const first = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })
    const second = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '10:00' })
    firstResponse.reject(new Error('first rejected'))
    await expect(first).rejects.toThrow('first rejected')
    secondResponse.reject(new Error('second rejected'))
    await expect(second).rejects.toThrow('second rejected')

    expect(useTripStore.getState().assignments['10']).toEqual([original])
  })

  it('rolls back a failed newer update to an older authoritative response', async () => {
    const original = buildAssignment({ id: 99, day_id: 10, place: buildPlace({ id: 12, place_time: '08:00', end_time: '09:00' }) })
    const firstAuthoritative = { ...original, assignment_time: '09:00', assignment_end_time: '10:00', place: { ...original.place, place_time: '09:00', end_time: '10:00' } }
    const firstResponse = deferred<{ assignment: typeof original }>()
    const secondResponse = deferred<{ assignment: typeof original }>()
    seedStore(useTripStore, { assignments: { '10': [original] } })
    vi.mocked(assignmentsApi.updateTime)
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise)

    const first = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '09:00' })
    const second = useTripStore.getState().setAssignmentTime(1, 10, 99, { place_time: '10:00' })
    firstResponse.resolve({ assignment: firstAuthoritative })
    await first

    expect(useTripStore.getState().assignments['10'][0]?.place).toMatchObject({ place_time: '10:00' })

    secondResponse.reject(new Error('second rejected'))
    await expect(second).rejects.toThrow('second rejected')

    expect(useTripStore.getState().assignments['10']).toEqual([firstAuthoritative])
  })
})
