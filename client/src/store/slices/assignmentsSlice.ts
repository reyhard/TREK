import { assignmentsApi } from '../../api/client'
import type { AssignmentTimeRequest } from '@trek/shared'
import type { StoreApi } from 'zustand'
import type { TripStoreState } from '../tripStore'
import type { Assignment, AssignmentsMap } from '../../types'
import { getApiErrorMessage } from '../../types'

type SetState = StoreApi<TripStoreState>['setState']
type GetState = StoreApi<TripStoreState>['getState']

export interface AssignmentsSlice {
  assignPlaceToDay: (tripId: number | string, dayId: number | string, placeId: number | string, position?: number | null) => Promise<Assignment | undefined>
  removeAssignment: (tripId: number | string, dayId: number | string, assignmentId: number) => Promise<void>
  reorderAssignments: (tripId: number | string, dayId: number | string, orderedIds: number[]) => Promise<void>
  moveAssignment: (tripId: number | string, assignmentId: number, fromDayId: number | string, toDayId: number | string, toOrderIndex?: number | null) => Promise<void>
  setAssignmentTime: (tripId: number | string, dayId: number | string, assignmentId: number, times: AssignmentTimeRequest) => Promise<Assignment>
  setAssignments: (assignments: AssignmentsMap) => void
}

export const createAssignmentsSlice = (set: SetState, get: GetState): AssignmentsSlice => {
  const assignmentTimeVersions = new Map<number, number>()

  return {
  assignPlaceToDay: async (tripId, dayId, placeId, position) => {
    const state = get()
    const place = state.places.find(p => p.id === parseInt(String(placeId)))
    if (!place) return

    const tempId = Date.now() * -1
    const current = [...(state.assignments[String(dayId)] || [])]
    const insertIdx = position != null ? position : current.length
    const tempAssignment: Assignment = {
      id: tempId,
      day_id: parseInt(String(dayId)),
      place_id: place.id,
      order_index: insertIdx,
      notes: null,
      place,
    }

    current.splice(insertIdx, 0, tempAssignment)
    set(state => ({
      assignments: {
        ...state.assignments,
        [String(dayId)]: current,
      }
    }))

    try {
      const data = await assignmentsApi.create(tripId, dayId, { place_id: placeId })
      const newAssignment: Assignment = {
        ...data.assignment,
        place: data.assignment.place || place,
        order_index: position != null ? insertIdx : data.assignment.order_index,
      }
      set(state => ({
        assignments: {
          ...state.assignments,
          [String(dayId)]: state.assignments[String(dayId)].map(
            a => a.id === tempId ? newAssignment : a
          ),
        }
      }))
      if (position != null) {
        const updated = get().assignments[String(dayId)] || []
        const orderedIds = updated.map(a => a.id).filter(id => id > 0)
        if (orderedIds.length > 0) {
          try {
            await assignmentsApi.reorder(tripId, dayId, orderedIds)
            set(state => {
              const items = state.assignments[String(dayId)] || []
              const reordered = orderedIds.map((id, idx) => {
                const item = items.find(a => a.id === id)
                return item ? { ...item, order_index: idx } : null
              }).filter((item): item is Assignment => item !== null)
              return {
                assignments: {
                  ...state.assignments,
                  [String(dayId)]: reordered,
                }
              }
            })
          } catch {}
        }
      }
      return data.assignment
    } catch (err: unknown) {
      set(state => ({
        assignments: {
          ...state.assignments,
          [String(dayId)]: state.assignments[String(dayId)].filter(a => a.id !== tempId),
        }
      }))
      throw new Error(getApiErrorMessage(err, 'Error assigning place'))
    }
  },

  removeAssignment: async (tripId, dayId, assignmentId) => {
    const prevAssignments = get().assignments

    set(state => ({
      assignments: {
        ...state.assignments,
        [String(dayId)]: state.assignments[String(dayId)].filter(a => a.id !== assignmentId),
      }
    }))

    try {
      await assignmentsApi.delete(tripId, dayId, assignmentId)
    } catch (err: unknown) {
      set({ assignments: prevAssignments })
      throw new Error(getApiErrorMessage(err, 'Error removing assignment'))
    }
  },

  reorderAssignments: async (tripId, dayId, orderedIds) => {
    const prevAssignments = get().assignments
    const dayItems = get().assignments[String(dayId)] || []
    const reordered = orderedIds.map((id, idx) => {
      const item = dayItems.find(a => a.id === id)
      return item ? { ...item, order_index: idx } : null
    }).filter((item): item is Assignment => item !== null)

    set(state => ({
      assignments: {
        ...state.assignments,
        [String(dayId)]: reordered,
      }
    }))

    try {
      await assignmentsApi.reorder(tripId, dayId, orderedIds)
    } catch (err: unknown) {
      set({ assignments: prevAssignments })
      throw new Error(getApiErrorMessage(err, 'Error reordering'))
    }
  },

  moveAssignment: async (tripId, assignmentId, fromDayId, toDayId, toOrderIndex = null) => {
    const state = get()
    const prevAssignments = state.assignments
    const assignment = (state.assignments[String(fromDayId)] || []).find(a => a.id === assignmentId)
    if (!assignment) return

    const toItems = (state.assignments[String(toDayId)] || []).slice().sort((a, b) => a.order_index - b.order_index)
    const insertAt = toOrderIndex !== null ? toOrderIndex : toItems.length

    const newToItems = [...toItems]
    newToItems.splice(insertAt, 0, { ...assignment, day_id: parseInt(String(toDayId)) })
    newToItems.forEach((a, i) => { a.order_index = i })

    set(s => ({
      assignments: {
        ...s.assignments,
        [String(fromDayId)]: s.assignments[String(fromDayId)].filter(a => a.id !== assignmentId),
        [String(toDayId)]: newToItems,
      }
    }))

    try {
      await assignmentsApi.move(tripId, assignmentId, toDayId, insertAt)
      if (newToItems.length > 1) {
        await assignmentsApi.reorder(tripId, toDayId, newToItems.map(a => a.id))
      }
    } catch (err: unknown) {
      set({ assignments: prevAssignments })
      throw new Error(getApiErrorMessage(err, 'Error moving assignment'))
    }
  },

  setAssignmentTime: async (tripId, dayId, assignmentId, times) => {
    const requestVersion = (assignmentTimeVersions.get(assignmentId) || 0) + 1
    assignmentTimeVersions.set(assignmentId, requestVersion)

    const dayKey = String(dayId)
    const previousAssignment = (get().assignments[dayKey] || []).find(assignment => assignment.id === assignmentId)
    const hasStartTime = Object.hasOwn(times, 'place_time')
    const hasEndTime = Object.hasOwn(times, 'end_time')
    const optimisticAssignment = previousAssignment && {
      ...previousAssignment,
      place: {
        ...previousAssignment.place,
        ...(hasStartTime ? { place_time: times.place_time } : {}),
        ...(times.place_time === null
          ? { end_time: null }
          : hasEndTime ? { end_time: times.end_time } : {}),
      },
    }

    if (optimisticAssignment) {
      set(state => ({
        assignments: {
          ...state.assignments,
          [dayKey]: (state.assignments[dayKey] || []).map(assignment =>
            assignment === previousAssignment ? optimisticAssignment : assignment,
          ),
        },
      }))
    }

    try {
      const data = await assignmentsApi.updateTime(tripId, assignmentId, times)
      if (assignmentTimeVersions.get(assignmentId) === requestVersion) {
        set(state => {
          const assignmentsWithoutStaleCopy = Object.fromEntries(
            Object.entries(state.assignments).map(([currentDayId, items]) => [
              currentDayId,
              items.filter(assignment => assignment.id !== assignmentId),
            ]),
          ) as AssignmentsMap
          const authoritativeDayKey = String(data.assignment.day_id)

          return {
            assignments: {
              ...assignmentsWithoutStaleCopy,
              [authoritativeDayKey]: [
                ...(assignmentsWithoutStaleCopy[authoritativeDayKey] || []),
                data.assignment,
              ],
            },
          }
        })
      }
      return data.assignment
    } catch (err: unknown) {
      if (assignmentTimeVersions.get(assignmentId) === requestVersion && optimisticAssignment) {
        set(state => ({
          assignments: {
            ...state.assignments,
            [dayKey]: (state.assignments[dayKey] || []).map(assignment =>
              assignment === optimisticAssignment ? previousAssignment : assignment,
            ),
          },
        }))
      }
      throw new Error(getApiErrorMessage(err, 'Error updating assignment time'))
    }
  },

  setAssignments: (assignments) => {
    set({ assignments })
  },
  }
}
