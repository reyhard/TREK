import { parseDayTime } from '@trek/shared';

import type { Assignment, Day, DayNote, Reservation } from '../../types';
import { getSpanPhase, getTransportForDay, TRANSPORT_TYPES } from '../../utils/dayMerge';

export const TIMELINE_SNAP_MINUTES = 15;
export const TIMELINE_DEFAULT_START = 6 * 60;
export const TIMELINE_END = 24 * 60;
export const TIMELINE_PIXELS_PER_MINUTE = 1;
export const TIMELINE_MIN_BLOCK_HEIGHT = 30;

export interface TimelineEntry extends Assignment {
  start: number;
  end: number;
  duration: number;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
  visualLane: number;
  visualLaneCount: number;
  overlapping: boolean;
}

export interface TimelineResult {
  scheduled: TimelineEntry[];
  unscheduled: Assignment[];
  overlapCount: number;
  gridStartMinute: number;
}

export type TimelineTransportReservation = Reservation & {
  __leg?: { index: number; total: number; [key: string]: unknown };
};

export interface TimelineTransportContextEntry {
  kind: 'transport';
  key: string;
  title: string;
  reservation: TimelineTransportReservation;
  sourceReservation: Reservation;
}

export interface TimelineNoteContextEntry {
  kind: 'note';
  key: string;
  title: string;
  note: DayNote;
}

export type TimelineContextEntry = TimelineTransportContextEntry | TimelineNoteContextEntry;

export type ScheduledTimelineContextEntry = TimelineContextEntry & {
  start: number;
  end: number;
  duration: number;
  height: number;
};

export interface TimelineContextResult {
  scheduled: ScheduledTimelineContextEntry[];
  untimed: TimelineContextEntry[];
}

export interface TimelineVisualItem {
  key: string;
  start: number;
  end: number;
  height: number;
}

export interface TimelineVisualLayout {
  key: string;
  top: number;
  height: number;
  visualLane: number;
  visualLaneCount: number;
}

interface Interval {
  assignment: Assignment;
  start: number;
  end: number;
}

const TIMELINE_CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIMELINE_ISO_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T((?:[01]\d|2[0-3]):[0-5]\d)(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/;

export function snapTimelineMinute(rawMinute: number, increment = TIMELINE_SNAP_MINUTES): number {
  if (!Number.isFinite(rawMinute) || !Number.isFinite(increment) || increment <= 0) return rawMinute;
  return Math.round(rawMinute / increment) * increment;
}

export function timelineMinuteFromPointer(
  clientY: number,
  bounds: Pick<DOMRect, 'top'>,
  startMinute: number,
  pxPerMinute: number
): number {
  if (!Number.isFinite(pxPerMinute) || pxPerMinute <= 0) return startMinute;
  const snappedMinute = snapTimelineMinute(startMinute + (clientY - bounds.top) / pxPerMinute);
  return Math.min(Math.max(snappedMinute, startMinute), TIMELINE_END - TIMELINE_SNAP_MINUTES);
}

export function buildTimelineEntries(assignments: Assignment[]): TimelineResult {
  const { intervals, unscheduled } = splitIntervals(assignments);
  const gridStartMinute = resolveTimelineGridStart(intervals.map(({ start }) => start));
  const scheduled = placeIntervals(intervals, gridStartMinute);

  return {
    scheduled,
    unscheduled,
    overlapCount: scheduled.filter((entry) => entry.overlapping).length,
    gridStartMinute,
  };
}

export function resolveTimelineGridStart(starts: number[]): number {
  const finiteStarts = starts.filter(Number.isFinite);
  if (finiteStarts.length === 0) return TIMELINE_DEFAULT_START;
  const earliestStart = Math.min(...finiteStarts);
  if (earliestStart >= TIMELINE_DEFAULT_START) return TIMELINE_DEFAULT_START;
  return Math.floor(earliestStart / TIMELINE_SNAP_MINUTES) * TIMELINE_SNAP_MINUTES;
}

export function layoutTimelineVisualItems(
  items: TimelineVisualItem[],
  gridStartMinute: number
): TimelineVisualLayout[] {
  const sorted = [...items].sort(
    (left, right) => left.start - right.start || left.end - right.end || left.key.localeCompare(right.key)
  );
  const layouts: TimelineVisualLayout[] = [];
  const laneEnds: number[] = [];
  let groupEntries: TimelineVisualLayout[] = [];
  let groupEnd = -Infinity;

  const finishGroup = () => {
    const laneCount = groupEntries.reduce((count, entry) => Math.max(count, entry.visualLane + 1), 0);
    for (const entry of groupEntries) entry.visualLaneCount = laneCount;
  };

  for (const item of sorted) {
    const top = (item.start - gridStartMinute) * TIMELINE_PIXELS_PER_MINUTE;
    const visualEnd = top + item.height;
    if (top >= groupEnd) {
      finishGroup();
      groupEntries = [];
      groupEnd = visualEnd;
    } else {
      groupEnd = Math.max(groupEnd, visualEnd);
    }

    const lane = laneEnds.findIndex((end) => end <= top);
    const visualLane = lane === -1 ? laneEnds.length : lane;
    laneEnds[visualLane] = visualEnd;
    const layout: TimelineVisualLayout = {
      key: item.key,
      top,
      height: item.height,
      visualLane,
      visualLaneCount: 1,
    };
    layouts.push(layout);
    groupEntries.push(layout);
  }

  finishGroup();
  return layouts;
}

export function buildTimelineContextEntries({
  day,
  days,
  reservations,
  notes,
}: {
  day: Day;
  days: Day[];
  reservations: Reservation[];
  notes: DayNote[];
}): TimelineContextResult {
  const scheduled: ScheduledTimelineContextEntry[] = [];
  const untimed: TimelineContextEntry[] = [];
  const transports = getTransportForDay({
    reservations,
    dayId: day.id,
    dayAssignmentIds: [],
    days,
  }).filter((reservation) => TRANSPORT_TYPES.has(reservation.type)) as TimelineTransportReservation[];

  for (const reservation of transports) {
    const phase = getSpanPhase(reservation, day.id);
    const leg = reservation.__leg?.index ?? 'single';
    const entry: TimelineTransportContextEntry = {
      kind: 'transport',
      key: `transport:${reservation.id}:leg:${leg}:day:${day.id}:phase:${phase}`,
      title: reservation.title,
      reservation,
      sourceReservation: reservations.find((source) => source.id === reservation.id) ?? reservation,
    };
    const interval = timelineTransportInterval(reservation, phase);

    if (interval === null) {
      untimed.push(entry);
    } else {
      scheduled.push(scheduleTimelineContextEntry(entry, interval.start, interval.end));
    }
  }

  for (const note of notes) {
    if (note.day_id !== day.id) continue;
    const entry: TimelineNoteContextEntry = {
      kind: 'note',
      key: `note:${note.id}`,
      title: note.text,
      note,
    };
    const minute = parseTimelineContextClock(note.time);

    if (minute === null) {
      untimed.push(entry);
    } else {
      const marker = timelineMarkerInterval(minute);
      scheduled.push(scheduleTimelineContextEntry(entry, marker.start, marker.end));
    }
  }

  return { scheduled, untimed };
}

export function timelineAssignmentTimes(assignment: Assignment): { start: string | null; end: string | null } {
  return {
    start: assignment.assignment_time ?? assignment.place.place_time ?? null,
    end: assignment.assignment_end_time ?? assignment.place.end_time ?? null,
  };
}

function parseTimelineContextClock(value: unknown, allowEndOfDay = false): number | null {
  if (allowEndOfDay && value === '24:00') return parseDayTime(value, { allowEndOfDay: true });
  if (typeof value !== 'string') return null;
  if (TIMELINE_CLOCK_PATTERN.test(value)) return parseDayTime(value);
  const isoMatch = TIMELINE_ISO_PATTERN.exec(value);
  return isoMatch ? parseDayTime(isoMatch[1]) : null;
}

function timelineMarkerInterval(minute: number): { start: number; end: number } {
  if (minute > TIMELINE_END - TIMELINE_SNAP_MINUTES) {
    return { start: TIMELINE_END - TIMELINE_SNAP_MINUTES, end: TIMELINE_END };
  }
  return { start: minute, end: minute + TIMELINE_SNAP_MINUTES };
}

function timelineTransportInterval(
  reservation: TimelineTransportReservation,
  phase: 'single' | 'start' | 'middle' | 'end'
): { start: number; end: number } | null {
  if (phase === 'middle') return null;
  if (phase === 'start') {
    const start = parseTimelineContextClock(reservation.reservation_time);
    return start === null ? null : timelineMarkerInterval(start);
  }
  if (phase === 'end') {
    const end = parseTimelineContextClock(reservation.reservation_end_time, true);
    return end === null ? null : timelineMarkerInterval(end);
  }

  const start = parseTimelineContextClock(reservation.reservation_time);
  const end = parseTimelineContextClock(reservation.reservation_end_time, true);
  if (start !== null) {
    return end !== null && end > start ? { start, end } : timelineMarkerInterval(start);
  }
  return end === null ? null : timelineMarkerInterval(end);
}

function scheduleTimelineContextEntry(
  entry: TimelineContextEntry,
  start: number,
  end: number
): ScheduledTimelineContextEntry {
  const duration = end - start;
  return {
    ...entry,
    start,
    end,
    duration,
    height: Math.max(duration * TIMELINE_PIXELS_PER_MINUTE, TIMELINE_MIN_BLOCK_HEIGHT),
  };
}

function splitIntervals(assignments: Assignment[]): { intervals: Interval[]; unscheduled: Assignment[] } {
  const intervals: Interval[] = [];
  const unscheduled: Assignment[] = [];

  for (const assignment of assignments) {
    const times = timelineAssignmentTimes(assignment);
    const start = parseDayTime(times.start);
    const end = parseDayTime(times.end, { allowEndOfDay: true });

    if (start === null || end === null || end <= start) {
      unscheduled.push(assignment);
    } else {
      intervals.push({ assignment, start, end });
    }
  }

  intervals.sort(
    (left, right) => left.start - right.start || left.end - right.end || left.assignment.id - right.assignment.id
  );

  return { intervals, unscheduled };
}

function placeIntervals(intervals: Interval[], gridStartMinute: number): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const laneEnds: number[] = [];
  let groupEntries: TimelineEntry[] = [];
  let groupEnd = -Infinity;

  const finishGroup = () => {
    const laneCount = groupEntries.reduce((count, entry) => Math.max(count, entry.lane + 1), 0);
    const overlapping = laneCount > 1;
    for (const entry of groupEntries) {
      entry.laneCount = laneCount;
      entry.overlapping = overlapping;
    }
  };

  for (const interval of intervals) {
    if (interval.start >= groupEnd) {
      finishGroup();
      groupEntries = [];
      groupEnd = interval.end;
    } else {
      groupEnd = Math.max(groupEnd, interval.end);
    }

    const lane = laneEnds.findIndex((end) => end <= interval.start);
    const assignedLane = lane === -1 ? laneEnds.length : lane;
    laneEnds[assignedLane] = interval.end;

    const duration = interval.end - interval.start;
    const entry: TimelineEntry = {
      ...interval.assignment,
      start: interval.start,
      end: interval.end,
      duration,
      top: (interval.start - gridStartMinute) * TIMELINE_PIXELS_PER_MINUTE,
      height: Math.max(duration * TIMELINE_PIXELS_PER_MINUTE, TIMELINE_MIN_BLOCK_HEIGHT),
      lane: assignedLane,
      laneCount: 1,
      visualLane: 0,
      visualLaneCount: 1,
      overlapping: false,
    };
    entries.push(entry);
    groupEntries.push(entry);
  }

  finishGroup();
  const visualLayouts = layoutTimelineVisualItems(
    entries.map((entry, index) => ({
      key: String(index).padStart(12, '0'),
      start: entry.start,
      end: entry.end,
      height: entry.height,
    })),
    gridStartMinute
  );
  for (let index = 0; index < entries.length; index += 1) {
    entries[index].top = visualLayouts[index].top;
    entries[index].height = visualLayouts[index].height;
    entries[index].visualLane = visualLayouts[index].visualLane;
    entries[index].visualLaneCount = visualLayouts[index].visualLaneCount;
  }
  return entries;
}
