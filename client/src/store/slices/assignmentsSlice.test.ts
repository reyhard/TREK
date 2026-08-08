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
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
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
})
