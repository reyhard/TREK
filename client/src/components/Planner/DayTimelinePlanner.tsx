import { formatDayTime, parseDayTime } from '@trek/shared';
import { Clock, GripVertical, Pencil, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from '../../i18n';
import type { Assignment, Category, Day, Place } from '../../types';
import { formatDate } from '../../utils/formatters';
import { useToast } from '../shared/Toast';
import {
  buildTimelineEntries,
  TIMELINE_END,
  TIMELINE_PIXELS_PER_MINUTE,
  timelineMinuteFromPointer,
  type TimelineEntry,
} from './dayTimelineModel';

type AssignmentTimeUpdate = { place_time?: string | null; end_time?: string | null };

export interface DayTimelinePlannerProps {
  day: Day;
  assignments: Assignment[];
  places: Place[];
  categories: Category[];
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

function assignmentDuration(assignment: Assignment): number {
  const start = parseDayTime(assignment.assignment_time);
  const end = parseDayTime(assignment.assignment_end_time, { allowEndOfDay: true });
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
  assignments,
  places,
  categories,
  canEdit,
  selectedPlaceId,
  selectedAssignmentId,
  onAssignToDay,
  onSetAssignmentTime,
  onPlaceClick,
  onEditPlace,
}: DayTimelinePlannerProps) {
  const { t, locale } = useTranslation();
  const toast = useToast();
  const gridRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const [localAssignments, setLocalAssignments] = useState<Assignment[]>([]);
  const [previewMinutes, setPreviewMinutes] = useState<Record<number, number>>({});
  const [keyboardMove, setKeyboardMove] = useState<MoveState | null>(null);
  const [pointerMove, setPointerMove] = useState<PointerMoveState | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const allAssignments = useMemo(() => {
    const sourceIds = new Set(assignments.map((assignment) => assignment.id));
    return [
      ...assignments,
      ...localAssignments.filter((assignment) => assignment.day_id === day.id && !sourceIds.has(assignment.id)),
    ];
  }, [assignments, day.id, localAssignments]);
  const timeline = useMemo(() => buildTimelineEntries(allAssignments), [allAssignments]);

  useEffect(() => {
    setLocalAssignments([]);
    setPreviewMinutes({});
    setKeyboardMove(null);
    setPointerMove(null);
    setAnnouncement('');
    suppressClickRef.current = false;
  }, [day.id]);

  useEffect(() => {
    const sourceIds = new Set(assignments.map((assignment) => assignment.id));
    setLocalAssignments((current) => current.filter((assignment) => !sourceIds.has(assignment.id)));
  }, [assignments]);

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
    setPreview(assignment.id, minute);
    try {
      await onSetAssignmentTime(day.id, assignment.id, { place_time: placeTime });
      clearPreview(assignment.id);
      return true;
    } catch (error) {
      clearPreview(assignment.id);
      toast.error(errorMessage(error, t('common.unknownError')));
      return false;
    }
  };

  const removeTime = async (assignment: Assignment) => {
    try {
      await onSetAssignmentTime(day.id, assignment.id, { place_time: null, end_time: null });
    } catch (error) {
      toast.error(errorMessage(error, t('common.unknownError')));
    }
  };

  const minuteAtPointer = (clientY: number) => {
    const bounds = gridRef.current?.getBoundingClientRect() ?? ({ top: 0 } as DOMRect);
    return timelineMinuteFromPointer(clientY, bounds, timeline.gridStartMinute, TIMELINE_PIXELS_PER_MINUTE);
  };

  const getDragValue = (event: React.DragEvent, key: 'placeId' | 'assignmentId') =>
    event.dataTransfer?.getData(key) || window.__dragData?.[key] || '';

  const handleGridDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const minute = minuteAtPointer(event.clientY);
    const placeId = Number(getDragValue(event, 'placeId'));
    const assignmentId = Number(getDragValue(event, 'assignmentId'));
    window.__dragData = null;

    if (Number.isInteger(placeId) && placeId > 0) {
      let created: Assignment | undefined;
      try {
        created = await onAssignToDay(placeId, day.id);
      } catch (error) {
        toast.error(errorMessage(error, t('common.unknownError')));
        return;
      }
      if (!created) return;
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
    if (!canEdit) return;
    const assignmentId = Number(getDragValue(event, 'assignmentId'));
    const assignment = allAssignments.find((item) => item.id === assignmentId);
    window.__dragData = null;
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
    const movementEntry: TimelineEntry = scheduledEntry ?? {
      ...assignment,
      start: timeline.gridStartMinute,
      end: timeline.gridStartMinute + duration,
      duration,
      top: 0,
      height: Math.max(duration * TIMELINE_PIXELS_PER_MINUTE, 30),
      lane: 0,
      laneCount: 1,
      overlapping: false,
    };

    return (
      <div
        onClick={() => onPlaceClick(activityPlace.id, assignment.id)}
        aria-selected={isSelected}
        style={{
          minWidth: 0,
          height: '100%',
          boxSizing: 'border-box',
          borderRadius: 8,
          border: `${isSelected ? 2 : 1}px solid ${category?.color || 'var(--accent)'}`,
          background: 'var(--bg-card)',
          padding: '6px 8px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <strong className="text-content" style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
            {activityName(assignment)}
          </strong>
          {canEdit && (
            <button
              type="button"
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
                padding: 2,
                background: 'transparent',
                cursor: 'grab',
                display: 'flex',
                touchAction: 'none',
              }}
            >
              <GripVertical size={14} />
            </button>
          )}
        </div>
        {timeLabel && (
          <div className="text-content-faint" style={{ fontSize: 11 }}>
            {timeLabel}
          </div>
        )}
        {canEdit && (
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            {place && (
              <button
                type="button"
                aria-label={t('trip.timeline.editActivity', { name: activityName(assignment) })}
                onClick={(event) => {
                  event.stopPropagation();
                  onEditPlace(place, assignment.id);
                }}
                style={{ border: 0, background: 'transparent', padding: 1, display: 'flex' }}
              >
                <Pencil size={11} />
              </button>
            )}
            {scheduledEntry && (
              <button
                type="button"
                aria-label={t('trip.timeline.removeTime')}
                onClick={(event) => {
                  event.stopPropagation();
                  void removeTime(assignment);
                }}
                style={{ border: 0, background: 'transparent', padding: 1, display: 'flex' }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const hours = [];
  for (let minute = timeline.gridStartMinute; minute <= TIMELINE_END; minute += 60) hours.push(minute);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-faint)' }}>
        <h2 className="text-content" style={{ fontSize: 16, margin: 0 }}>
          {day.title || t('dayplan.dayN', { n: day.id })}
        </h2>
        <div className="text-content-faint" style={{ fontSize: 12 }}>
          {formatDate(day.date, locale)}
        </div>
      </header>

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
            height: (TIMELINE_END - timeline.gridStartMinute) * TIMELINE_PIXELS_PER_MINUTE,
            borderLeft: '1px solid var(--border-primary)',
          }}
        >
          {hours.map((minute) => (
            <div
              key={minute}
              role="row"
              style={{
                position: 'absolute',
                top: (minute - timeline.gridStartMinute) * TIMELINE_PIXELS_PER_MINUTE,
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
            const top = ((preview ?? entry.start) - timeline.gridStartMinute) * TIMELINE_PIXELS_PER_MINUTE;
            return (
              <div
                key={entry.id}
                role="gridcell"
                style={{
                  position: 'absolute',
                  top,
                  height: entry.height,
                  left: `calc(${(entry.lane / entry.laneCount) * 100}% + 3px)`,
                  width: `calc(${100 / entry.laneCount}% - 6px)`,
                  zIndex: preview === undefined ? 1 : 2,
                }}
              >
                {renderActivity(entry, entry)}
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
