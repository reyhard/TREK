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

type DayReconciliationResult = { status: 'applied' } | { status: 'superseded' } | { status: 'failed'; error: unknown };

interface DayTimingCoordinator {
  latestVersion: number;
  pendingVersions: Set<number>;
  needsReconciliation: boolean;
  authoritativeDayId: number | string | undefined;
  activeReconciliation:
    | {
        ownerVersion: number;
        promise: Promise<DayReconciliationResult>;
      }
    | undefined;
}

const MAX_DAY_RECONCILIATION_ATTEMPTS = 2;

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
  const authoritativeIds = new Set(authoritativeAssignments.map((assignment) => assignment.id));
  const assignmentsWithoutCrossDayCopies = Object.fromEntries(
    Object.entries(assignments).map(([currentDayId, items]) => [
      currentDayId,
      currentDayId === String(dayId) ? items : items.filter((assignment) => !authoritativeIds.has(assignment.id)),
    ])
  ) as AssignmentsMap;

  return {
    ...assignmentsWithoutCrossDayCopies,
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
  const dayTimingCoordinators = new Map<string, DayTimingCoordinator>();

  const runDayReconciliation = async (
    tripId: number | string,
    coordinatorKey: string,
    coordinator: DayTimingCoordinator,
    ownerVersion: number,
    authoritativeDayId: number | string
  ): Promise<DayReconciliationResult> => {
    const ownerIsCurrent = () =>
      dayTimingCoordinators.get(coordinatorKey) === coordinator &&
      coordinator.latestVersion === ownerVersion &&
      coordinator.pendingVersions.size === 0 &&
      coordinator.needsReconciliation;

    for (let attempt = 0; attempt < MAX_DAY_RECONCILIATION_ATTEMPTS; attempt += 1) {
      if (!ownerIsCurrent()) return { status: 'superseded' };

      try {
        const dayData = await assignmentsApi.list(tripId, authoritativeDayId);
        if (!ownerIsCurrent()) return { status: 'superseded' };

        set((state) => ({
          assignments: reconcileAuthoritativeDay(state.assignments, authoritativeDayId, dayData.assignments),
        }));
        coordinator.needsReconciliation = false;
        return { status: 'applied' };
      } catch (error: unknown) {
        if (!ownerIsCurrent()) return { status: 'superseded' };
        if (attempt === MAX_DAY_RECONCILIATION_ATTEMPTS - 1) {
          coordinator.needsReconciliation = false;
          return { status: 'failed', error };
        }
      }
    }

    return { status: 'superseded' };
  };

  const reconcileIdleDay = async (
    tripId: number | string,
    coordinatorKey: string,
    coordinator: DayTimingCoordinator
  ): Promise<DayReconciliationResult> => {
    if (
      coordinator.pendingVersions.size > 0 ||
      !coordinator.needsReconciliation ||
      coordinator.authoritativeDayId === undefined
    ) {
      return { status: 'superseded' };
    }

    const activeReconciliation = coordinator.activeReconciliation;
    if (activeReconciliation) {
      const result = await activeReconciliation.promise;
      if (coordinator.activeReconciliation?.promise === activeReconciliation.promise) {
        coordinator.activeReconciliation = undefined;
      }
      if (result.status === 'superseded' && coordinator.pendingVersions.size === 0 && coordinator.needsReconciliation) {
        return reconcileIdleDay(tripId, coordinatorKey, coordinator);
      }
      return result;
    }

    const ownerVersion = coordinator.latestVersion;
    const promise = runDayReconciliation(
      tripId,
      coordinatorKey,
      coordinator,
      ownerVersion,
      coordinator.authoritativeDayId
    );
    coordinator.activeReconciliation = { ownerVersion, promise };
    const result = await promise;
    if (coordinator.activeReconciliation?.promise === promise) coordinator.activeReconciliation = undefined;
    if (result.status === 'superseded' && coordinator.pendingVersions.size === 0 && coordinator.needsReconciliation) {
      return reconcileIdleDay(tripId, coordinatorKey, coordinator);
    }
    return result;
  };

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
      const coordinatorKey = `${String(tripId)}:${dayKey}`;
      const dayCoordinator = dayTimingCoordinators.get(coordinatorKey) ?? {
        latestVersion: 0,
        pendingVersions: new Set<number>(),
        needsReconciliation: false,
        authoritativeDayId: undefined,
        activeReconciliation: undefined,
      };
      dayTimingCoordinators.set(coordinatorKey, dayCoordinator);
      const dayRequestVersion = dayCoordinator.latestVersion + 1;
      dayCoordinator.latestVersion = dayRequestVersion;
      dayCoordinator.pendingVersions.add(dayRequestVersion);
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

      let data: { assignment: Assignment } | undefined;
      let mutationFailure: Error | undefined;
      let acceptedMutation = false;
      try {
        data = await assignmentsApi.updateTime(tripId, assignmentId, times);
      } catch (err: unknown) {
        if (chain.latestVersion === requestVersion) {
          set((state) => ({
            assignments: reconcileAssignment(state.assignments, assignmentId, chain.confirmedAssignment),
          }));
        }
        mutationFailure = new Error(getApiErrorMessage(err, 'Error updating assignment time'));
      }

      if (data && requestVersion > chain.confirmedVersion) {
        chain.confirmedVersion = requestVersion;
        chain.confirmedAssignment = data.assignment;
        acceptedMutation = true;
        dayCoordinator.needsReconciliation = true;
        dayCoordinator.authoritativeDayId = data.assignment.day_id;
      }

      dayCoordinator.pendingVersions.delete(dayRequestVersion);
      let reconciliation: DayReconciliationResult;
      try {
        reconciliation = await reconcileIdleDay(tripId, coordinatorKey, dayCoordinator);
      } finally {
        chain.pendingVersions.delete(requestVersion);
        if (chain.pendingVersions.size === 0 && assignmentTimeChains.get(assignmentId) === chain) {
          assignmentTimeChains.delete(assignmentId);
        }
      }

      if (reconciliation.status === 'failed') {
        if (acceptedMutation && data) {
          set((state) => ({
            assignments: reconcileAssignment(state.assignments, assignmentId, data.assignment),
          }));
        }
        const reconciliationMessage = getApiErrorMessage(reconciliation.error, 'Error refreshing assignments');
        if (mutationFailure) {
          throw new Error(
            `${mutationFailure.message}; authoritative day reconciliation failed: ${reconciliationMessage}`
          );
        }
        throw new Error(reconciliationMessage);
      }
      if (mutationFailure) throw mutationFailure;
      if (!data) throw new Error('Error updating assignment time');
      return data.assignment;
    },

    setAssignments: (assignments) => {
      set({ assignments });
    },
  };
};
