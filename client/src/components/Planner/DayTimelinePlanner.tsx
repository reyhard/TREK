import { formatDayTime, parseDayTime } from '@trek/shared';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, GripVertical, Pencil, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from '../../i18n';
import type { Assignment, Category, Day, DayNote, Place, Reservation } from '../../types';
import { formatDate } from '../../utils/formatters';
import { safeTransitMeta } from '../../utils/safeParseMetadata';
import { useToast } from '../shared/Toast';
import {
  buildTimelineContextEntries,
  buildTimelineEntries,
  layoutTimelineVisualItems,
  resolveTimelineGridStart,
  TIMELINE_END,
  TIMELINE_PIXELS_PER_MINUTE,
  timelineAssignmentTimes,
  timelineMinuteFromPointer,
  type ScheduledTimelineContextEntry,
  type TimelineContextEntry,
  type TimelineEntry,
} from './dayTimelineModel';

type AssignmentTimeUpdate = { place_time?: string | null; end_time?: string | null };

export interface DayTimelinePlannerProps {
  day: Day;
  days: Day[];
  assignments: Assignment[];
  places: Place[];
  categories: Category[];
  reservations?: Reservation[];
  notes?: DayNote[];
  routeShown?: boolean;
  routeProfile?: 'driving' | 'walking';
  canEdit: boolean;
  selectedPlaceId: number | null;
  selectedAssignmentId: number | null;
  onAssignToDay: (placeId: number, dayId: number) => Promise<Assignment | undefined> | Assignment | undefined;
  onSetAssignmentTime: (
    dayId: number,
    assignmentId: number,
    times: AssignmentTimeUpdate
  ) => Promise<Assignment | undefined> | Assignment | undefined;
  onPlaceClick: (placeId: number | null, assignmentId?: number | null) => void;
  onEditPlace: (place: Place, assignmentId?: number) => void;
  onSelectDay: (dayId: number) => void;
  onToggleRoute?: () => void;
  onSetRouteProfile?: (profile: 'driving' | 'walking') => void;
  onPlanTransit?: (dayId: number) => void;
  onOpenTransit?: (reservation: Reservation) => void;
  onEditTransport?: (reservation: Reservation) => void;
}

interface MoveState {
  assignmentId: number;
  startingMinute: number;
  proposedMinute: number;
}

interface PointerMoveState extends MoveState {
  pointerId: number;
  moved: boolean;
}

interface OptimisticTiming {
  assignment_time: string | null;
  assignment_end_time: string | null;
}

function assignmentDuration(assignment: Assignment): number {
  const times = timelineAssignmentTimes(assignment);
  const start = parseDayTime(times.start);
  const end = parseDayTime(times.end, { allowEndOfDay: true });
  if (start !== null && end !== null && end > start) return end - start;
  return assignment.place.duration_minutes ?? 60;
}

function activityName(assignment: Assignment): string {
  return assignment.place?.name || '';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const DayTimelinePlanner = React.memo(function DayTimelinePlanner({
  day,
  days,
  assignments,
  places,
  categories,
  reservations = [],
  notes = [],
  routeShown = false,
  routeProfile = 'driving',
  canEdit,
  selectedPlaceId,
  selectedAssignmentId,
  onAssignToDay,
  onSetAssignmentTime,
  onPlaceClick,
  onEditPlace,
  onSelectDay,
  onToggleRoute,
  onSetRouteProfile,
  onPlanTransit,
  onOpenTransit,
  onEditTransport,
}: DayTimelinePlannerProps) {
  const { t, locale } = useTranslation();
  const toast = useToast();
  const gridRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const [localAssignments, setLocalAssignments] = useState<Assignment[]>([]);
  const [optimisticTimings, setOptimisticTimings] = useState<Record<number, OptimisticTiming>>({});
  const [previewMinutes, setPreviewMinutes] = useState<Record<number, number>>({});
  const [keyboardMove, setKeyboardMove] = useState<MoveState | null>(null);
  const [pointerMove, setPointerMove] = useState<PointerMoveState | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const allAssignments = useMemo(() => {
    const sourceIds = new Set(assignments.map((assignment) => assignment.id));
    return [
      ...assignments,
      ...localAssignments.filter((assignment) => assignment.day_id === day.id && !sourceIds.has(assignment.id)),
    ].map((assignment) => {
      const timing = optimisticTimings[assignment.id];
      return timing
        ? {
            ...assignment,
            ...timing,
            place: {
              ...assignment.place,
              place_time: timing.assignment_time,
              end_time: timing.assignment_end_time,
            },
          }
        : assignment;
    });
  }, [assignments, day.id, localAssignments, optimisticTimings]);
  const timeline = useMemo(() => buildTimelineEntries(allAssignments), [allAssignments]);
  const context = useMemo(
    () => buildTimelineContextEntries({ day, days, reservations, notes }),
    [day, days, reservations, notes]
  );
  const gridStartMinute = useMemo(
    () => resolveTimelineGridStart([...timeline.scheduled, ...context.scheduled].map(({ start }) => start)),
    [context.scheduled, timeline.scheduled]
  );
  const visualLayouts = useMemo(
    () =>
      new Map(
        layoutTimelineVisualItems(
          [
            ...timeline.scheduled.map(({ id, start, end, height }) => ({
              key: `activity:${id}`,
              start,
              end,
              height,
            })),
            ...context.scheduled.map(({ key, start, end, height }) => ({ key, start, end, height })),
          ],
          gridStartMinute
        ).map((layout) => [layout.key, layout])
      ),
    [context.scheduled, gridStartMinute, timeline.scheduled]
  );
  const selectedDayIndex = days.findIndex((candidate) => candidate.id === day.id);
  const previousDay = selectedDayIndex > 0 ? days[selectedDayIndex - 1] : undefined;
  const nextDay = selectedDayIndex >= 0 ? days[selectedDayIndex + 1] : undefined;

  useEffect(() => {
    setLocalAssignments([]);
    setOptimisticTimings({});
    setPreviewMinutes({});
    setKeyboardMove(null);
    setPointerMove(null);
    setAnnouncement('');
    suppressClickRef.current = false;
  }, [day.id]);

  useEffect(() => {
    const sourceIds = new Set(assignments.map((assignment) => assignment.id));
    setLocalAssignments((current) => current.filter((assignment) => !sourceIds.has(assignment.id)));
    setOptimisticTimings((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([assignmentId, timing]) => {
          const authoritative = assignments.find((assignment) => assignment.id === Number(assignmentId));
          return (
            !authoritative ||
            authoritative.assignment_time !== timing.assignment_time ||
            authoritative.assignment_end_time !== timing.assignment_end_time
          );
        })
      )
    );
  }, [assignments]);

  const setOptimisticTiming = (assignmentId: number, timing: OptimisticTiming) => {
    setOptimisticTimings((current) => ({ ...current, [assignmentId]: timing }));
  };

  const clearOptimisticTiming = (assignmentId: number) => {
    setOptimisticTimings((current) => {
      const next = { ...current };
      delete next[assignmentId];
      return next;
    });
  };

  const setPreview = (assignmentId: number, minute: number) => {
    setPreviewMinutes((current) => ({ ...current, [assignmentId]: minute }));
    setAnnouncement(t('trip.timeline.proposedTime', { time: formatDayTime(minute)! }));
  };

  const clearPreview = (assignmentId: number) => {
    setPreviewMinutes((current) => {
      const next = { ...current };
      delete next[assignmentId];
      return next;
    });
  };

  const moveAssignment = async (assignment: Assignment, minute: number) => {
    if (minute + assignmentDuration(assignment) > TIMELINE_END) {
      toast.error(t('trip.timeline.endsAfterMidnight'));
      clearPreview(assignment.id);
      return false;
    }
    const placeTime = formatDayTime(minute);
    if (!placeTime) return false;
    const duration = assignmentDuration(assignment);
    setOptimisticTiming(assignment.id, {
      assignment_time: placeTime,
      assignment_end_time: formatDayTime(minute + duration, { allowEndOfDay: true }),
    });
    clearPreview(assignment.id);
    setAnnouncement(t('trip.timeline.proposedTime', { time: placeTime }));
    try {
      await onSetAssignmentTime(day.id, assignment.id, { place_time: placeTime });
      return true;
    } catch (error) {
      clearOptimisticTiming(assignment.id);
      clearPreview(assignment.id);
      toast.error(errorMessage(error, t('common.unknownError')));
      return false;
    }
  };

  const removeTime = async (assignment: Assignment) => {
    setOptimisticTiming(assignment.id, { assignment_time: null, assignment_end_time: null });
    try {
      await onSetAssignmentTime(day.id, assignment.id, { place_time: null, end_time: null });
    } catch (error) {
      clearOptimisticTiming(assignment.id);
      toast.error(errorMessage(error, t('common.unknownError')));
    }
  };

  const minuteAtPointer = (clientY: number) => {
    const bounds = gridRef.current?.getBoundingClientRect() ?? ({ top: 0 } as DOMRect);
    return timelineMinuteFromPointer(clientY, bounds, gridStartMinute, TIMELINE_PIXELS_PER_MINUTE);
  };

  const getDragValue = (event: React.DragEvent, key: 'placeId' | 'assignmentId') =>
    event.dataTransfer?.getData(key) || window.__dragData?.[key] || '';

  const handleGridDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const minute = minuteAtPointer(event.clientY);
    const placeId = Number(getDragValue(event, 'placeId'));
    const assignmentId = Number(getDragValue(event, 'assignmentId'));
    window.__dragData = null;
    if (!canEdit) return;

    if (Number.isInteger(placeId) && placeId > 0) {
      let created: Assignment | undefined;
      try {
        created = await onAssignToDay(placeId, day.id);
      } catch (error) {
        toast.error(errorMessage(error, t('common.unknownError')));
        return;
      }
      if (!created) return;
      setLocalAssignments((current) =>
        assignments.some((item) => item.id === created.id)
          ? current.filter((item) => item.id !== created.id)
          : [...current.filter((item) => item.id !== created.id), created]
      );
      const scheduled = await moveAssignment(created, minute);
      if (scheduled) {
        const duration = assignmentDuration(created);
        setLocalAssignments((current) =>
          assignments.some((item) => item.id === created.id)
            ? current.filter((item) => item.id !== created.id)
            : [
                ...current.filter((item) => item.id !== created.id),
                {
                  ...created,
                  assignment_time: formatDayTime(minute),
                  assignment_end_time: formatDayTime(minute + duration, { allowEndOfDay: true }),
                },
              ]
        );
      } else {
        setLocalAssignments((current) =>
          assignments.some((item) => item.id === created.id)
            ? current.filter((item) => item.id !== created.id)
            : [
                ...current.filter((item) => item.id !== created.id),
                { ...created, assignment_time: null, assignment_end_time: null },
              ]
        );
      }
      return;
    }

    const assignment = allAssignments.find((item) => item.id === assignmentId);
    if (assignment) await moveAssignment(assignment, minute);
  };

  const handleUnscheduledDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const assignmentId = Number(getDragValue(event, 'assignmentId'));
    const assignment = allAssignments.find((item) => item.id === assignmentId);
    window.__dragData = null;
    if (!canEdit) return;
    if (assignment) await removeTime(assignment);
  };

  const startPointerMove = (event: React.PointerEvent<HTMLButtonElement>, entry: TimelineEntry) => {
    if (!canEdit) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPointerMove({
      assignmentId: entry.id,
      pointerId: event.pointerId,
      startingMinute: entry.start,
      proposedMinute: entry.start,
      moved: false,
    });
  };

  const updatePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerMove || pointerMove.pointerId !== event.pointerId) return;
    const minute = minuteAtPointer(event.clientY);
    suppressClickRef.current = true;
    setPointerMove({ ...pointerMove, proposedMinute: minute, moved: true });
    setPreview(pointerMove.assignmentId, minute);
  };

  const finishPointerMove = async (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerMove || pointerMove.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const assignment = allAssignments.find((item) => item.id === pointerMove.assignmentId);
    const minute = minuteAtPointer(event.clientY);
    setPointerMove(null);
    if (!pointerMove.moved) return;
    if (assignment) await moveAssignment(assignment, minute);
  };

  const cancelPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerMove || pointerMove.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    clearPreview(pointerMove.assignmentId);
    setAnnouncement(t('trip.timeline.proposedTime', { time: formatDayTime(pointerMove.startingMinute)! }));
    setPointerMove(null);
    suppressClickRef.current = false;
  };

  const startKeyboardMove = (entry: TimelineEntry) => {
    const state = { assignmentId: entry.id, startingMinute: entry.start, proposedMinute: entry.start };
    setKeyboardMove(state);
    setPreview(entry.id, entry.start);
  };

  const handleMoveClick = (entry: TimelineEntry) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    startKeyboardMove(entry);
  };

  const handleMoveKeyDown = async (event: React.KeyboardEvent<HTMLButtonElement>, entry: TimelineEntry) => {
    if (!keyboardMove || keyboardMove.assignmentId !== entry.id) return;
    const changes: Record<string, number> = {
      ArrowUp: -15,
      ArrowDown: 15,
      PageUp: -60,
      PageDown: 60,
    };
    if (event.key in changes) {
      event.preventDefault();
      const maximum = TIMELINE_END - assignmentDuration(entry);
      const proposedMinute = Math.min(
        Math.max(keyboardMove.proposedMinute + changes[event.key]!, timeline.gridStartMinute),
        maximum
      );
      setKeyboardMove({ ...keyboardMove, proposedMinute });
      setPreview(entry.id, proposedMinute);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const minute = keyboardMove.proposedMinute;
      setKeyboardMove(null);
      await moveAssignment(entry, minute);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setKeyboardMove(null);
      clearPreview(entry.id);
      setAnnouncement(t('trip.timeline.proposedTime', { time: formatDayTime(keyboardMove.startingMinute)! }));
    }
  };

  const renderActivity = (assignment: Assignment, scheduledEntry?: TimelineEntry) => {
    const place = places.find((candidate) => candidate.id === assignment.place.id);
    const activityPlace = place ?? assignment.place;
    const isSelected = selectedAssignmentId
      ? selectedAssignmentId === assignment.id
      : selectedPlaceId === activityPlace.id;
    const preview = previewMinutes[assignment.id];
    const duration = scheduledEntry?.duration ?? assignmentDuration(assignment);
    const start = preview ?? scheduledEntry?.start;
    const end = start === undefined ? undefined : start + duration;
    const timeLabel =
      start === undefined || end === undefined
        ? null
        : `${formatDayTime(start)} – ${formatDayTime(end, { allowEndOfDay: true })}`;
    const category = categories.find((item) => item.id === activityPlace.category_id);
    const compact = Boolean(scheduledEntry && scheduledEntry.height <= 45);
    const overlapping = Boolean(scheduledEntry?.overlapping);
    const movementEntry: TimelineEntry = scheduledEntry ?? {
      ...assignment,
      start: gridStartMinute,
      end: gridStartMinute + duration,
      duration,
      top: 0,
      height: Math.max(duration * TIMELINE_PIXELS_PER_MINUTE, 30),
      lane: 0,
      laneCount: 1,
      visualLane: 0,
      visualLaneCount: 1,
      overlapping: false,
    };

    const moveButton = canEdit ? (
      <button
        type="button"
        tabIndex={0}
        aria-label={t('trip.timeline.moveActivity', { name: activityName(assignment) })}
        aria-describedby="timeline-move-instructions"
        title={t('trip.timeline.move')}
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData('assignmentId', String(assignment.id));
          event.dataTransfer.effectAllowed = 'move';
          window.__dragData = { assignmentId: String(assignment.id), fromDayId: String(day.id) };
        }}
        onDragEnd={() => {
          window.__dragData = null;
        }}
        onClick={(event) => {
          event.stopPropagation();
          handleMoveClick(movementEntry);
        }}
        onPointerDown={(event) => startPointerMove(event, movementEntry)}
        onPointerMove={updatePointerMove}
        onPointerUp={finishPointerMove}
        onPointerCancel={cancelPointerMove}
        onKeyDown={(event) => void handleMoveKeyDown(event, movementEntry)}
        style={{
          border: 0,
          padding: compact ? 0 : 2,
          background: 'transparent',
          cursor: 'grab',
          display: 'flex',
          flexShrink: 0,
          touchAction: 'none',
        }}
      >
        <GripVertical size={compact ? 12 : 14} />
      </button>
    ) : null;

    const editButton =
      canEdit && place ? (
        <button
          type="button"
          tabIndex={0}
          aria-label={t('trip.timeline.editActivity', { name: activityName(assignment) })}
          onClick={(event) => {
            event.stopPropagation();
            onEditPlace(place, assignment.id);
          }}
          style={{ border: 0, background: 'transparent', padding: compact ? 0 : 1, display: 'flex', flexShrink: 0 }}
        >
          <Pencil size={11} />
        </button>
      ) : null;

    const removeButton =
      canEdit && scheduledEntry ? (
        <button
          type="button"
          tabIndex={0}
          aria-label={t('trip.timeline.removeTime')}
          onClick={(event) => {
            event.stopPropagation();
            void removeTime(assignment);
          }}
          style={{ border: 0, background: 'transparent', padding: compact ? 0 : 1, display: 'flex', flexShrink: 0 }}
        >
          <X size={11} />
        </button>
      ) : null;

    const overlapIndicator = overlapping ? (
      <span
        title={t('trip.timeline.overlapBadge')}
        aria-hidden="true"
        style={{ color: 'var(--warning)', display: 'flex', flexShrink: 0 }}
      >
        <AlertTriangle size={compact ? 11 : 13} />
      </span>
    ) : null;

    return (
      <div
        role="group"
        aria-label={
          overlapping
            ? t('trip.timeline.activityOverlap', { name: activityName(assignment) })
            : activityName(assignment)
        }
        onClick={() => onPlaceClick(activityPlace.id, assignment.id)}
        aria-selected={isSelected}
        style={{
          display: compact ? 'flex' : 'block',
          alignItems: compact ? 'center' : undefined,
          gap: compact ? 3 : undefined,
          minWidth: 0,
          height: '100%',
          boxSizing: 'border-box',
          borderRadius: 8,
          border: `${isSelected ? 2 : 1}px solid ${category?.color || 'var(--accent)'}`,
          background: isSelected
            ? 'var(--bg-selected)'
            : `color-mix(in srgb, ${category?.color || 'var(--accent)'} 10%, transparent)`,
          padding: compact ? '2px 4px' : '6px 8px',
          overflow: compact ? 'visible' : 'hidden',
          boxShadow: overlapping ? '0 0 0 2px var(--warning), var(--shadow-sm)' : 'var(--shadow-sm)',
          cursor: 'pointer',
        }}
      >
        {compact ? (
          <>
            <strong
              className="text-content"
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 11,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {activityName(assignment)}
            </strong>
            {timeLabel && (
              <span className="text-content-faint" style={{ fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {timeLabel}
              </span>
            )}
            {overlapIndicator}
            {moveButton}
            {editButton}
            {removeButton}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <strong className="text-content" style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                {activityName(assignment)}
              </strong>
              {overlapIndicator}
              {moveButton}
            </div>
            {timeLabel && (
              <div className="text-content-faint" style={{ fontSize: 11 }}>
                {timeLabel}
              </div>
            )}
            {canEdit && (
              <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                {editButton}
                {removeButton}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderContext = (entry: TimelineContextEntry, scheduledEntry?: ScheduledTimelineContextEntry) => {
    const isTransport = entry.kind === 'transport';
    const label = isTransport
      ? t('trip.timeline.transportContext', { name: entry.title })
      : t('trip.timeline.noteContext', { name: entry.title });
    const transitHandler =
      isTransport && safeTransitMeta(entry.sourceReservation) && onOpenTransit
        ? () => onOpenTransit(entry.sourceReservation)
        : null;
    const editHandler =
      isTransport && !transitHandler && canEdit && onEditTransport
        ? () => onEditTransport(entry.sourceReservation)
        : null;
    const activation = transitHandler ?? editHandler;
    const compact = Boolean(scheduledEntry && scheduledEntry.height <= 45);
    const timeLabel = scheduledEntry
      ? `${formatDayTime(scheduledEntry.start)} – ${formatDayTime(scheduledEntry.end, { allowEndOfDay: true })}`
      : null;
    const style: React.CSSProperties = {
      display: compact ? 'flex' : 'block',
      alignItems: compact ? 'center' : undefined,
      gap: compact ? 5 : undefined,
      width: '100%',
      minWidth: 0,
      height: '100%',
      boxSizing: 'border-box',
      borderRadius: 8,
      border: isTransport ? '1px solid color-mix(in srgb, #3b82f6 42%, transparent)' : '1px solid var(--border-faint)',
      background: isTransport ? 'color-mix(in srgb, #3b82f6 10%, transparent)' : 'var(--bg-hover)',
      color: 'var(--text-primary)',
      padding: compact ? '2px 5px' : '6px 8px',
      overflow: compact ? 'visible' : 'hidden',
      boxShadow: 'var(--shadow-sm)',
      cursor: activation ? 'pointer' : 'default',
      font: 'inherit',
      textAlign: 'left',
    };
    const contents = (
      <>
        <strong
          className="text-content"
          style={{
            display: compact ? undefined : 'block',
            flex: compact ? 1 : undefined,
            minWidth: 0,
            fontSize: compact ? 11 : 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: compact ? 'nowrap' : undefined,
          }}
        >
          {entry.title}
        </strong>
        {timeLabel && (
          <span
            className="text-content-faint"
            style={{ display: compact ? undefined : 'block', fontSize: compact ? 10 : 11, whiteSpace: 'nowrap' }}
          >
            {timeLabel}
          </span>
        )}
      </>
    );

    return activation ? (
      <button type="button" aria-label={label} onClick={activation} style={style}>
        {contents}
      </button>
    ) : (
      <div role="group" aria-label={label} style={style}>
        {contents}
      </div>
    );
  };

  const hours = [];
  for (let minute = gridStartMinute; minute <= TIMELINE_END; minute += 60) hours.push(minute);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <header
        data-testid="timeline-day-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-faint)',
          background: 'var(--bg-card)',
        }}
      >
        <button
          type="button"
          aria-label={t('trip.timeline.previousDay')}
          disabled={!previousDay}
          onClick={() => previousDay && onSelectDay(previousDay.id)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="text-content" style={{ fontSize: 16, margin: 0 }}>
            {day.title || t('dayplan.dayN', { n: day.id })}
          </h2>
          <div className="text-content-faint" style={{ fontSize: 12 }}>
            {formatDate(day.date, locale)}
          </div>
        </div>
        <button
          type="button"
          aria-label={t('trip.timeline.nextDay')}
          disabled={!nextDay}
          onClick={() => nextDay && onSelectDay(nextDay.id)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </header>

      {(onToggleRoute || onSetRouteProfile || onPlanTransit) && (
        <div
          role="toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderBottom: '1px solid var(--border-faint)',
            background: 'var(--bg-card)',
          }}
        >
          {onToggleRoute && (
            <button
              type="button"
              aria-pressed={routeShown}
              onClick={onToggleRoute}
              style={{
                padding: '4px 8px',
                background: routeShown ? 'var(--bg-selected)' : 'transparent',
              }}
            >
              {t('dayplan.route')}
            </button>
          )}
          {onSetRouteProfile && (
            <>
              <button
                type="button"
                aria-pressed={routeProfile === 'walking'}
                onClick={() => onSetRouteProfile('walking')}
                style={{
                  padding: '4px 8px',
                  background: routeProfile === 'walking' ? 'var(--bg-selected)' : 'transparent',
                }}
              >
                {t('dayplan.movement.walking')}
              </button>
              <button
                type="button"
                aria-pressed={routeProfile === 'driving'}
                onClick={() => onSetRouteProfile('driving')}
                style={{
                  padding: '4px 8px',
                  background: routeProfile === 'driving' ? 'var(--bg-selected)' : 'transparent',
                }}
              >
                {t('dayplan.movement.driving')}
              </button>
            </>
          )}
          {onPlanTransit && (
            <button
              type="button"
              onClick={() => onPlanTransit(day.id)}
              style={{ marginLeft: 'auto', padding: '4px 8px' }}
            >
              {t('transit.title')}
            </button>
          )}
        </div>
      )}

      <div
        data-testid="unscheduled-drop-zone"
        onDragOver={(event) => canEdit && event.preventDefault()}
        onDrop={(event) => void handleUnscheduledDrop(event)}
        style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-faint)' }}
      >
        <div
          className="text-content"
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, marginBottom: 7 }}
        >
          <Clock size={13} /> {t('trip.timeline.unscheduled')}
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {timeline.unscheduled.map((assignment) => (
            <div key={assignment.id} style={{ minHeight: 50 }}>
              {renderActivity(assignment)}
            </div>
          ))}
        </div>
      </div>

      {context.untimed.length > 0 && (
        <section
          aria-label={t('trip.timeline.contextTray')}
          style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-faint)' }}
        >
          <div className="text-content" style={{ fontSize: 12, fontWeight: 700, marginBottom: 7 }}>
            {t('trip.timeline.contextTray')}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {context.untimed.map((entry) => (
              <div key={entry.key} style={{ minHeight: 42 }}>
                {renderContext(entry)}
              </div>
            ))}
          </div>
        </section>
      )}

      {timeline.overlapCount > 0 && (
        <div
          role="status"
          aria-label={t('trip.timeline.overlapWarning', { count: timeline.overlapCount })}
          className="text-content"
          style={{ padding: '8px 12px', fontSize: 12, color: 'var(--warning)' }}
        >
          {t('trip.timeline.overlapWarning', { count: timeline.overlapCount })}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 12px 12px' }}>
        <div
          ref={gridRef}
          role="grid"
          aria-label={t('trip.timeline.gridLabel')}
          onDragOver={(event) => canEdit && event.preventDefault()}
          onDrop={(event) => void handleGridDrop(event)}
          style={{
            position: 'relative',
            marginLeft: 48,
            height: (TIMELINE_END - gridStartMinute) * TIMELINE_PIXELS_PER_MINUTE,
            borderLeft: '1px solid var(--border-primary)',
          }}
        >
          {hours.map((minute) => (
            <div
              key={minute}
              role="row"
              style={{
                position: 'absolute',
                top: (minute - gridStartMinute) * TIMELINE_PIXELS_PER_MINUTE,
                left: 0,
                right: 0,
                borderTop: '1px solid var(--border-faint)',
              }}
            >
              <span
                className="text-content-faint"
                style={{ position: 'absolute', right: 'calc(100% + 8px)', top: -8, fontSize: 11 }}
              >
                {formatDayTime(minute, { allowEndOfDay: true })}
              </span>
            </div>
          ))}
          {timeline.scheduled.map((entry) => {
            const preview = previewMinutes[entry.id];
            const layout = visualLayouts.get(`activity:${entry.id}`)!;
            const top = preview === undefined ? layout.top : (preview - gridStartMinute) * TIMELINE_PIXELS_PER_MINUTE;
            return (
              <div
                key={entry.id}
                role="gridcell"
                style={{
                  position: 'absolute',
                  top,
                  height: layout.height,
                  left: `calc(${(layout.visualLane / layout.visualLaneCount) * 100}% + 3px)`,
                  width: `calc(${100 / layout.visualLaneCount}% - 6px)`,
                  zIndex: preview === undefined ? 1 : 2,
                }}
              >
                {renderActivity(entry, entry)}
              </div>
            );
          })}
          {context.scheduled.map((entry) => {
            const layout = visualLayouts.get(entry.key)!;
            return (
              <div
                key={entry.key}
                role="gridcell"
                style={{
                  position: 'absolute',
                  top: layout.top,
                  height: layout.height,
                  left: `calc(${(layout.visualLane / layout.visualLaneCount) * 100}% + 3px)`,
                  width: `calc(${100 / layout.visualLaneCount}% - 6px)`,
                  zIndex: 1,
                }}
              >
                {renderContext(entry, entry)}
              </div>
            );
          })}
        </div>
      </div>
      <p
        id="timeline-move-instructions"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        {t('trip.timeline.moveInstructions')}
      </p>
      <div
        aria-live="polite"
        className="text-content-faint"
        style={{ minHeight: 18, padding: '0 12px 4px', fontSize: 11 }}
      >
        {announcement}
      </div>
    </section>
  );
});
