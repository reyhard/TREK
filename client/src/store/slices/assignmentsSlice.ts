import { formatDayTime, parseDayTime, type AssignmentTimeRequest } from '@trek/shared';
import type { StoreApi } from 'zustand';
import { assignmentsApi } from '../../api/client';
import type { Assignment, AssignmentsMap } from '../../types';
import { getApiErrorMessage } from '../../types';
import type { TripStoreState } from '../tripStore';

type SetState = StoreApi<TripStoreState>['setState'];
type GetState = StoreApi<TripStoreState>['getState'];

interface AssignmentTimeRequestChain {
  latestVersion: number;
  confirmedVersion: number;
  confirmedAssignment: Assignment | undefined;
  pendingVersions: Set<number>;
}

function reconcileAssignment(
  assignments: AssignmentsMap,
  assignmentId: number,
  authoritativeAssignment: Assignment | undefined
): AssignmentsMap {
  const assignmentsWithoutStaleCopy = Object.fromEntries(
    Object.entries(assignments).map(([dayId, items]) => [
      dayId,
      items.filter((assignment) => assignment.id !== assignmentId),
    ])
  ) as AssignmentsMap;

  if (!authoritativeAssignment) return assignmentsWithoutStaleCopy;

  const authoritativeDayKey = String(authoritativeAssignment.day_id);
  return {
    ...assignmentsWithoutStaleCopy,
    [authoritativeDayKey]: [...(assignmentsWithoutStaleCopy[authoritativeDayKey] || []), authoritativeAssignment],
  };
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function optimisticEndTime(assignment: Assignment, times: AssignmentTimeRequest): string | null | undefined {
  if (hasOwn(times, 'end_time')) return times.end_time;
  if (!hasOwn(times, 'place_time')) return assignment.assignment_end_time;
  if (times.place_time === null) return null;
  if (typeof times.place_time !== 'string') return assignment.assignment_end_time;

  const previousStart = parseDayTime(assignment.assignment_time);
  const previousEnd = parseDayTime(assignment.assignment_end_time, { allowEndOfDay: true });
  const duration =
    previousStart !== null && previousEnd !== null && previousEnd > previousStart
      ? previousEnd - previousStart
      : (assignment.place.duration_minutes ?? 60);
  const nextStart = parseDayTime(times.place_time);
  return nextStart === null
    ? assignment.assignment_end_time
    : formatDayTime(nextStart + duration, { allowEndOfDay: true });
}

function reconcileAuthoritativeDay(
  assignments: AssignmentsMap,
  dayId: number | string,
  authoritativeAssignments: Assignment[]
): AssignmentsMap {
  return {
    ...assignments,
    [String(dayId)]: authoritativeAssignments,
  };
}

export interface AssignmentsSlice {
  assignPlaceToDay: (
    tripId: number | string,
    dayId: number | string,
    placeId: number | string,
    position?: number | null
  ) => Promise<Assignment | undefined>;
  removeAssignment: (tripId: number | string, dayId: number | string, assignmentId: number) => Promise<void>;
  reorderAssignments: (tripId: number | string, dayId: number | string, orderedIds: number[]) => Promise<void>;
  moveAssignment: (
    tripId: number | string,
    assignmentId: number,
    fromDayId: number | string,
    toDayId: number | string,
    toOrderIndex?: number | null
  ) => Promise<void>;
  setAssignmentTime: (
    tripId: number | string,
    dayId: number | string,
    assignmentId: number,
    times: AssignmentTimeRequest
  ) => Promise<Assignment>;
  setAssignments: (assignments: AssignmentsMap) => void;
}

export const createAssignmentsSlice = (set: SetState, get: GetState): AssignmentsSlice => {
  const assignmentTimeChains = new Map<number, AssignmentTimeRequestChain>();
  const dayTimingVersions = new Map<string, number>();

  return {
    assignPlaceToDay: async (tripId, dayId, placeId, position) => {
      const state = get();
      const place = state.places.find((p) => p.id === parseInt(String(placeId)));
      if (!place) return;

      const tempId = Date.now() * -1;
      const current = [...(state.assignments[String(dayId)] || [])];
      const insertIdx = position != null ? position : current.length;
      const tempAssignment: Assignment = {
        id: tempId,
        day_id: parseInt(String(dayId)),
        place_id: place.id,
        order_index: insertIdx,
        notes: null,
        place,
      };

      current.splice(insertIdx, 0, tempAssignment);
      set((state) => ({
        assignments: {
          ...state.assignments,
          [String(dayId)]: current,
        },
      }));

      try {
        const data = await assignmentsApi.create(tripId, dayId, { place_id: placeId });
        const newAssignment: Assignment = {
          ...data.assignment,
          place: data.assignment.place || place,
          order_index: position != null ? insertIdx : data.assignment.order_index,
        };
        set((state) => ({
          assignments: {
            ...state.assignments,
            [String(dayId)]: state.assignments[String(dayId)].map((a) => (a.id === tempId ? newAssignment : a)),
          },
        }));
        if (position != null) {
          const updated = get().assignments[String(dayId)] || [];
          const orderedIds = updated.map((a) => a.id).filter((id) => id > 0);
          if (orderedIds.length > 0) {
            try {
              await assignmentsApi.reorder(tripId, dayId, orderedIds);
              set((state) => {
                const items = state.assignments[String(dayId)] || [];
                const reordered = orderedIds
                  .map((id, idx) => {
                    const item = items.find((a) => a.id === id);
                    return item ? { ...item, order_index: idx } : null;
                  })
                  .filter((item): item is Assignment => item !== null);
                return {
                  assignments: {
                    ...state.assignments,
                    [String(dayId)]: reordered,
                  },
                };
              });
            } catch {}
          }
        }
        return data.assignment;
      } catch (err: unknown) {
        set((state) => ({
          assignments: {
            ...state.assignments,
            [String(dayId)]: state.assignments[String(dayId)].filter((a) => a.id !== tempId),
          },
        }));
        throw new Error(getApiErrorMessage(err, 'Error assigning place'));
      }
    },

    removeAssignment: async (tripId, dayId, assignmentId) => {
      const prevAssignments = get().assignments;

      set((state) => ({
        assignments: {
          ...state.assignments,
          [String(dayId)]: state.assignments[String(dayId)].filter((a) => a.id !== assignmentId),
        },
      }));

      try {
        await assignmentsApi.delete(tripId, dayId, assignmentId);
      } catch (err: unknown) {
        set({ assignments: prevAssignments });
        throw new Error(getApiErrorMessage(err, 'Error removing assignment'));
      }
    },

    reorderAssignments: async (tripId, dayId, orderedIds) => {
      const prevAssignments = get().assignments;
      const dayItems = get().assignments[String(dayId)] || [];
      const reordered = orderedIds
        .map((id, idx) => {
          const item = dayItems.find((a) => a.id === id);
          return item ? { ...item, order_index: idx } : null;
        })
        .filter((item): item is Assignment => item !== null);

      set((state) => ({
        assignments: {
          ...state.assignments,
          [String(dayId)]: reordered,
        },
      }));

      try {
        await assignmentsApi.reorder(tripId, dayId, orderedIds);
      } catch (err: unknown) {
        set({ assignments: prevAssignments });
        throw new Error(getApiErrorMessage(err, 'Error reordering'));
      }
    },

    moveAssignment: async (tripId, assignmentId, fromDayId, toDayId, toOrderIndex = null) => {
      const state = get();
      const prevAssignments = state.assignments;
      const assignment = (state.assignments[String(fromDayId)] || []).find((a) => a.id === assignmentId);
      if (!assignment) return;

      const toItems = (state.assignments[String(toDayId)] || []).slice().sort((a, b) => a.order_index - b.order_index);
      const insertAt = toOrderIndex !== null ? toOrderIndex : toItems.length;

      const newToItems = [...toItems];
      newToItems.splice(insertAt, 0, { ...assignment, day_id: parseInt(String(toDayId)) });
      newToItems.forEach((a, i) => {
        a.order_index = i;
      });

      set((s) => ({
        assignments: {
          ...s.assignments,
          [String(fromDayId)]: s.assignments[String(fromDayId)].filter((a) => a.id !== assignmentId),
          [String(toDayId)]: newToItems,
        },
      }));

      try {
        await assignmentsApi.move(tripId, assignmentId, toDayId, insertAt);
        if (newToItems.length > 1) {
          await assignmentsApi.reorder(
            tripId,
            toDayId,
            newToItems.map((a) => a.id)
          );
        }
      } catch (err: unknown) {
        set({ assignments: prevAssignments });
        throw new Error(getApiErrorMessage(err, 'Error moving assignment'));
      }
    },

    setAssignmentTime: async (tripId, dayId, assignmentId, times) => {
      const dayKey = String(dayId);
      const dayRequestVersion = (dayTimingVersions.get(dayKey) ?? 0) + 1;
      dayTimingVersions.set(dayKey, dayRequestVersion);
      const previousAssignment = (get().assignments[dayKey] || []).find((assignment) => assignment.id === assignmentId);
      const chain = assignmentTimeChains.get(assignmentId) ?? {
        latestVersion: 0,
        confirmedVersion: 0,
        confirmedAssignment: previousAssignment,
        pendingVersions: new Set<number>(),
      };
      assignmentTimeChains.set(assignmentId, chain);

      const requestVersion = chain.latestVersion + 1;
      chain.latestVersion = requestVersion;
      chain.pendingVersions.add(requestVersion);

      const hasStartTime = hasOwn(times, 'place_time');
      const hasEndTime = hasOwn(times, 'end_time');
      const nextEndTime = previousAssignment ? optimisticEndTime(previousAssignment, times) : undefined;
      const optimisticAssignment = previousAssignment && {
        ...previousAssignment,
        ...(hasStartTime ? { assignment_time: times.place_time } : {}),
        ...(hasEndTime || hasStartTime ? { assignment_end_time: nextEndTime } : {}),
        place: {
          ...previousAssignment.place,
          ...(hasStartTime ? { place_time: times.place_time } : {}),
          ...(times.place_time === null
            ? { end_time: null }
            : hasEndTime || hasStartTime
              ? { end_time: nextEndTime }
              : {}),
        },
      };

      if (optimisticAssignment) {
        set((state) => ({
          assignments: {
            ...state.assignments,
            [dayKey]: (state.assignments[dayKey] || []).map((assignment) =>
              assignment === previousAssignment ? optimisticAssignment : assignment
            ),
          },
        }));
      }

      try {
        const data = await assignmentsApi.updateTime(tripId, assignmentId, times);
        if (requestVersion > chain.confirmedVersion) {
          chain.confirmedVersion = requestVersion;
          chain.confirmedAssignment = data.assignment;
        }
        const hasNewerPendingRequest = [...chain.pendingVersions].some((version) => version > requestVersion);
        if (requestVersion === chain.confirmedVersion && !hasNewerPendingRequest) {
          let authoritativeDay: Assignment[] | undefined;
          try {
            const dayData = await assignmentsApi.list(tripId, data.assignment.day_id);
            authoritativeDay = dayData.assignments;
          } catch {
            // The timing mutation succeeded; retain its authoritative row if the
            // follow-up day refresh is temporarily unavailable.
          }
          const stillLatestForAssignment =
            requestVersion === chain.confirmedVersion &&
            ![...chain.pendingVersions].some((version) => version > requestVersion);
          const stillLatestForDay = dayTimingVersions.get(dayKey) === dayRequestVersion;
          if (stillLatestForAssignment && stillLatestForDay) {
            set((state) => ({
              assignments: authoritativeDay
                ? reconcileAuthoritativeDay(state.assignments, data.assignment.day_id, authoritativeDay)
                : reconcileAssignment(state.assignments, assignmentId, data.assignment),
            }));
          }
        }
        return data.assignment;
      } catch (err: unknown) {
        if (chain.latestVersion === requestVersion) {
          set((state) => ({
            assignments: reconcileAssignment(state.assignments, assignmentId, chain.confirmedAssignment),
          }));
        }
        throw new Error(getApiErrorMessage(err, 'Error updating assignment time'));
      } finally {
        chain.pendingVersions.delete(requestVersion);
        if (chain.pendingVersions.size === 0 && assignmentTimeChains.get(assignmentId) === chain) {
          assignmentTimeChains.delete(assignmentId);
        }
      }
    },

    setAssignments: (assignments) => {
      set({ assignments });
    },
  };
};
